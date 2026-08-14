/**
 * 時系列のメタ情報（時刻・記入者・カテゴリ名）が本文ブロックの外にあることの検証。
 * 現行デザインでは既定で隠れており、行をタップすると本文の下に開く。
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

const tplInner = fs
  .readFileSync(path.join(root, "index.html"), "utf8")
  .match(/<template id="timeline-item-template">([\s\S]*?)<\/template>/)[1];

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
  <div class="timeline-wrap" id="tlwrap" style="max-height:none;overflow:visible">
    <ul class="timeline" id="timeline"></ul>
  </div>
</div>
<template id="timeline-item-template">${tplInner}</template>
<script type="module">
  import { enableRowGestures } from "/js/row-gestures.js";
  const tpl = document.getElementById("timeline-item-template");
  const list = document.getElementById("timeline");
  const samples = [
    {
      category: "referral", important: false,
      date: "7/20", headline: "左前肢の跛行で来院",
      meta: "紹介　·　10:12入力・記入者：入田",
      body: "レントゲン撮影。骨折なし。消炎鎮痛剤を処方。",
    },
    {
      category: "none", important: true,
      date: "7/22", headline: "耳を痒がる",
      meta: "13:36入力・記入者：院長",
      body: "前から耳をかゆがる仕草が見られていた。外耳炎の可能性。点耳薬を処方し、1週間後再診。",
    },
    {
      category: "ope", important: false,
      date: "7/18", headline: "去勢手術",
      meta: "オペ　·　09:05入力・記入者：大辻",
      body: "麻酔導入スムーズ。出血少量。術後経過良好。翌日退院予定。",
    },
  ];
  for (const s of samples) {
    const li = tpl.content.cloneNode(true).querySelector(".tl-item");
    li.dataset.category = s.category;
    li.querySelector(".tl-item__star").setAttribute("aria-pressed", String(s.important));
    li.querySelector(".tl-item__date").textContent = s.date;
    li.querySelector(".tl-item__headline").textContent = s.headline;
    const metaEl = li.querySelector(".tl-item__meta");
    metaEl.textContent = s.meta;
    metaEl.hidden = true;
    li.querySelector(".tl-item__body").textContent = s.body;
    enableRowGestures(li, {
      actions: [
        { action: "edit", title: "編集", onClick: () => {} },
        { action: "delete", title: "削除", onClick: () => {} },
      ],
      // 実装と同じく、行タップでメタを開閉する。
      onActivate: () => {
        if (!metaEl.textContent) return;
        metaEl.hidden = !metaEl.hidden;
      },
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

const target = '.tl-item[data-category="referral"]';

const structure = await page.evaluate((sel) => {
  const item = document.querySelector(sel);
  const meta = item?.querySelector(".tl-item__meta");
  const body = item?.querySelector(".tl-item__body");
  const main = item?.querySelector(".tl-item__main");
  const bar = item?.querySelector(".tl-item__bar");
  return {
    hasMeta: !!meta,
    hasBody: !!body,
    // メタは本文の中ではなく、本文と同じ階層の独立要素
    metaOutsideBody: !!(meta && !meta.closest(".tl-item__body")),
    metaSiblingOfBody: !!(meta && body && meta.parentElement === body.parentElement),
    // 見出し（★・日付・見出し）も本文の外
    headOutsideBody: !body?.querySelector(".tl-item__star, .tl-item__headline, .tl-item__date"),
    // 旧デザインのカード枠は廃止済み
    noLegacyCard: !item?.querySelector(".tl-item__card"),
    // 色バーは文字ブロック（main）の外に並ぶ
    barOutsideMain: !!(bar && main && !main.contains(bar)),
    metaHiddenByDefault: !!meta?.hidden,
    metaVisibleByDefault: !!(meta && meta.getClientRects().length > 0),
  };
}, target);

// 行タップでメタが開く（本文の下＝本文ブロックの外に出る）
await page.locator(`${target} .tl-item__body`).click();
await page.waitForTimeout(120);

const opened = await page.evaluate((sel) => {
  const item = document.querySelector(sel);
  const meta = item.querySelector(".tl-item__meta");
  const body = item.querySelector(".tl-item__body");
  const m = meta.getBoundingClientRect();
  const b = body.getBoundingClientRect();
  return {
    metaVisible: meta.getClientRects().length > 0,
    metaBelowBody: m.top >= b.bottom - 1,
    metaText: meta.textContent,
  };
}, target);

// もう一度タップで閉じる（常時表示に戻っていない）
await page.locator(`${target} .tl-item__body`).click();
await page.waitForTimeout(120);
const reclosed = await page.evaluate(
  (sel) => document.querySelector(sel).querySelector(".tl-item__meta").getClientRects().length === 0,
  target
);

await page.evaluate((sel) => {
  document.querySelector(sel).querySelector(".tl-item__meta").hidden = false;
}, target);
const out = path.join(root, "tools", outName);
await page.locator(".wrap").screenshot({ path: out });

const info = { ...structure, ...opened, reclosed };
const ok =
  mode === "before" ||
  (info.hasMeta &&
    info.hasBody &&
    info.metaOutsideBody &&
    info.metaSiblingOfBody &&
    info.headOutsideBody &&
    info.noLegacyCard &&
    info.barOutsideMain &&
    info.metaHiddenByDefault &&
    !info.metaVisibleByDefault &&
    info.metaVisible &&
    info.metaBelowBody &&
    info.reclosed);

console.log(JSON.stringify({ mode, out, ok, info }, null, 2));
await browser.close();
server.close();
if (!ok) {
  console.error("VERIFY_FAILED");
  process.exit(1);
}
console.log("VERIFY_OK");
