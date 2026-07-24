/**
 * 時系列見出し行にカテゴリ色／削除アクションの赤みが乗らないことを検証する。
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

const tplInner = fs
  .readFileSync(path.join(root, "index.html"), "utf8")
  .match(/<template id="timeline-item-template">([\s\S]*?)<\/template>/)[1];

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<link rel="stylesheet" href="/css/style.css" />
<style>
  body { margin: 0; background: #ddd; }
  .col--center { min-height: 100vh; padding: 16px; }
</style>
</head>
<body>
<div class="col--center">
  <p style="margin:0 0 10px;font-size:12px;color:#666">見出し行にカテゴリ色が乗っていないこと</p>
  <ul class="timeline" id="timeline"></ul>
</div>
<template id="timeline-item-template">${tplInner}</template>
<script type="module">
  import { enableRowGestures } from "/js/row-gestures.js";
  const tpl = document.getElementById("timeline-item-template");
  const list = document.getElementById("timeline");
  const samples = [
    { cat: "ope", date: "7/18", h: "去勢手術", meta: "09:05入力・記入者：大辻", body: "麻酔導入スムーズ。術後経過良好。", badge: "オペ" },
    { cat: "admission", date: "7/19", h: "入院継続", meta: "11:00入力・記入者：川邉", body: "点滴継続。食欲やや改善。", badge: "入院" },
    { cat: "referral", date: "7/20", h: "左前肢の跛行で来院", meta: "10:12入力・記入者：入田", body: "レントゲン撮影。骨折なし。", badge: "紹介" },
    { cat: "none", date: "7/22", h: "耳を痒がる", meta: "13:36入力・記入者：院長", body: "外耳炎の可能性。点耳薬を処方。", badge: "" },
  ];
  for (const s of samples) {
    const frag = tpl.content.cloneNode(true);
    const li = frag.querySelector(".tl-item");
    li.dataset.category = s.cat;
    li.querySelector(".tl-item__date").textContent = s.date;
    li.querySelector(".tl-item__headline").textContent = s.h;
    li.querySelector(".tl-item__cat-label").textContent = s.badge;
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

function parseRgb(str) {
  if (!str) return null;
  if (str === "rgba(0, 0, 0, 0)" || str === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const m = str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
  }
  const cm = str.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (cm) {
    return {
      r: Math.round(+cm[1] * 255),
      g: Math.round(+cm[2] * 255),
      b: Math.round(+cm[3] * 255),
      a: 1,
    };
  }
  return null;
}

function nearCream(rgb, cream) {
  if (!rgb || rgb.a === 0) return false;
  return (
    Math.abs(rgb.r - cream.r) <= 8 &&
    Math.abs(rgb.g - cream.g) <= 8 &&
    Math.abs(rgb.b - cream.b) <= 8
  );
}

function isPinkish(rgb) {
  if (!rgb || rgb.a === 0) return false;
  // 削除アクション透けやカテゴリ赤系: R が G/B より明らかに高い
  return rgb.r > rgb.g + 15 && rgb.r > rgb.b + 15;
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") {
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
const browser = await chromium.launch({
  executablePath: SYSTEM_CHROME,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 560, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".tl-item");

const creamCss = await page.evaluate(() =>
  getComputedStyle(document.querySelector(".col--center")).backgroundColor
);
const cream = parseRgb(creamCss);

const rows = await page.evaluate(() =>
  [...document.querySelectorAll(".tl-item")].map((li) => {
    const meta = li.querySelector(".tl-item__meta-row");
    const front = li.querySelector(".swipeable__front");
    const card = li.querySelector(".tl-item__card");
    // 見出し行の実ピクセル色（透け込み検出）
    const r = meta.getBoundingClientRect();
    const x = Math.floor(r.left + 40);
    const y = Math.floor(r.top + r.height / 2);
    return {
      cat: li.dataset.category,
      metaBg: getComputedStyle(meta).backgroundColor,
      frontBg: getComputedStyle(front).backgroundColor,
      cardBg: getComputedStyle(card).backgroundColor,
      sampleX: x,
      sampleY: y,
    };
  })
);

// sample pixels
for (const row of rows) {
  const buf = await page.screenshot({
    clip: { x: row.sampleX, y: row.sampleY, width: 2, height: 2 },
  });
  // PNG decode via playwright evaluate is easier:
  row.pixel = await page.evaluate(
    ([x, y]) => {
      // create canvas from existing page not needed — use caret from elementsFromPoint
      const el = document.elementFromPoint(x, y);
      const bg = getComputedStyle(el).backgroundColor;
      // walk up until non-transparent
      let n = el;
      let resolved = bg;
      while (n && (resolved === "rgba(0, 0, 0, 0)" || resolved === "transparent")) {
        n = n.parentElement;
        if (!n) break;
        resolved = getComputedStyle(n).backgroundColor;
      }
      return { el: el?.className, resolved };
    },
    [row.sampleX, row.sampleY]
  );
}

const checks = rows.map((row) => {
  const frontRgb = parseRgb(row.frontBg);
  const cardRgb = parseRgb(row.cardBg);
  const resolvedRgb = parseRgb(row.pixel.resolved);
  const frontOk = nearCream(frontRgb, cream);
  const metaNotPink = !isPinkish(resolvedRgb) && !isPinkish(frontRgb);
  // カテゴリあり: カード色が見出し側(front)と異なること
  // カテゴリなし: カードは白
  const cardHasTint =
    row.cat === "none"
      ? cardRgb && cardRgb.r > 250 && cardRgb.g > 250 && cardRgb.b > 250
      : cardRgb &&
        frontRgb &&
        (Math.abs(cardRgb.r - frontRgb.r) > 3 ||
          Math.abs(cardRgb.g - frontRgb.g) > 3 ||
          Math.abs(cardRgb.b - frontRgb.b) > 3);
  return {
    cat: row.cat,
    frontOk,
    metaNotPink,
    cardHasTint,
    frontBg: row.frontBg,
    cardBg: row.cardBg,
    resolved: row.pixel.resolved,
  };
});

await page.locator(".col--center").screenshot({
  path: path.join(root, "tools/tl-meta-no-tint-after.png"),
});

console.log(JSON.stringify({ creamCss, checks }, null, 2));
await browser.close();
server.close();

const ok = checks.every((c) => c.frontOk && c.metaNotPink && c.cardHasTint);
if (!ok) {
  console.error("VERIFY_FAILED");
  process.exit(1);
}
console.log("VERIFY_OK");
