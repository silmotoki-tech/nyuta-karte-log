/**
 * 時系列レイアウト変更の before/after 検証用。
 * mode=before|after は呼び出し側で CSS を差し替えるか、現状を撮る。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const mode = process.argv[2] || "after";
const outName =
  mode === "before" ? "tl-meta-outside-before.png" : "tl-meta-outside-after.png";

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
<style>
  body { margin: 0; background: #f5f5f5; font-family: system-ui, sans-serif; }
  .wrap { max-width: 520px; margin: 0 auto; padding: 16px; background: #fff; min-height: 100vh; }
  .label { font-size: 12px; color: #666; margin: 0 0 10px; }
</style>
</head>
<body>
<div class="wrap">
  <p class="label">${mode.toUpperCase()}: 時系列レイアウト</p>
  <div class="timeline-wrap" style="overflow:visible;padding:0">
    <ul class="timeline" id="timeline"></ul>
  </div>
</div>
<template id="timeline-item-template">
${fs.readFileSync(path.join(root, "index.html"), "utf8").match(/<template id="timeline-item-template">([\s\S]*?)<\/template>/)?.[1] || ""}
</template>
<script type="module">
  import { enableRowGestures } from "/js/row-gestures.js";
  const tpl = document.getElementById("timeline-item-template");
  const list = document.getElementById("timeline");
  const samples = [
    {
      id: "1", category: "referral", important: false,
      date: "7/20", headline: "左前肢の跛行で来院",
      meta: "10:12入力・記入者：入田",
      body: "レントゲン撮影。骨折なし。消炎鎮痛剤を処方。",
    },
    {
      id: "2", category: "none", important: true,
      date: "7/22", headline: "耳を痒がる",
      meta: "13:36入力・記入者：院長",
      body: "前から耳をかゆがる仕草が見られていた。外耳炎の可能性。点耳薬を処方し、1週間後再診。",
    },
    {
      id: "3", category: "ope", important: false,
      date: "7/18", headline: "去勢手術",
      meta: "09:05入力・記入者：大辻",
      body: "麻酔導入スムーズ。出血少量。術後経過良好。翌日退院予定。",
    },
  ];
  for (const s of samples) {
    const frag = tpl.content.cloneNode(true);
    const li = frag.querySelector(".tl-item");
    li.dataset.category = s.category;
    li.querySelector(".tl-item__star").setAttribute("aria-pressed", String(s.important));
    li.querySelector(".tl-item__date").textContent = s.date;
    li.querySelector(".tl-item__headline").textContent = s.headline;
    const cat = li.querySelector(".tl-item__cat-label");
    if (cat) cat.textContent = s.category === "ope" ? "オペ" : s.category === "referral" ? "紹介" : "";
    li.querySelector(".tl-item__meta").textContent = s.meta;
    li.querySelector(".tl-item__body").textContent = s.body;
    enableRowGestures(li, {
      actions: [
        { action: "edit", title: "編集", onClick: () => {} },
        { action: "delete", title: "削除", onClick: () => {} },
      ],
    });
    list.appendChild(li);
  }
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/" || u === "/harness.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const fp = path.join(root, u.replace(/^\//, ""));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  const ext = path.extname(fp);
  const type =
    ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: SYSTEM_CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 560, height: 780 } });
await page.goto(`http://127.0.0.1:${port}/harness.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".tl-item");
await page.waitForTimeout(200);

const info = await page.evaluate(() => {
  const item = document.querySelector('.tl-item[data-category="referral"]');
  const meta = item?.querySelector(".tl-item__meta-row");
  const card = item?.querySelector(".tl-item__card");
  const body = item?.querySelector(".tl-item__body");
  const headInsideCard = !!card?.querySelector(".tl-item__meta-row, .tl-item__star, .tl-item__headline");
  const metaRect = meta?.getBoundingClientRect();
  const cardRect = card?.getBoundingClientRect();
  return {
    hasMetaRow: !!meta,
    hasCard: !!card,
    metaOutsideCard: !!(meta && card && metaRect.bottom <= cardRect.top + 2),
    bodyInCard: !!body?.closest(".tl-item__card"),
    headNotInCard: !headInsideCard,
    cardBg: card ? getComputedStyle(card).backgroundColor : null,
    itemBg: item ? getComputedStyle(item).backgroundColor : null,
    barColor: card
      ? getComputedStyle(card.querySelector(".tl-item__bar")).backgroundColor
      : null,
  };
});

const out = path.join(root, "tools", outName);
await page.locator(".wrap").screenshot({ path: out });

const ok =
  mode === "before" ||
  (info.hasMetaRow &&
    info.hasCard &&
    info.metaOutsideCard &&
    info.bodyInCard &&
    info.headNotInCard);

console.log(JSON.stringify({ mode, out, ok, info }, null, 2));
await browser.close();
server.close();
if (!ok) {
  console.error("VERIFY_FAILED");
  process.exit(1);
}
console.log("VERIFY_OK");
