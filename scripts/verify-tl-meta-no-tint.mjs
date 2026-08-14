/**
 * 時系列の行にカテゴリ色や削除アクションの赤みが乗らないことを検証する。
 * カテゴリ色は左の色バーだけが担い、行の面は常に白のままであること。
 */
import { launchBrowser } from "./launch-browser.js";
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

// --tl-* とタイムラインの地色は .timeline-wrap 側にあるため、実装と同じ入れ子で組む。
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
  <p style="margin:0 0 10px;font-size:12px;color:#666">行の面にカテゴリ色・削除の赤みが乗っていないこと</p>
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
    { cat: "ope", date: "7/18", h: "去勢手術", meta: "オペ　·　09:05入力・記入者：大辻", body: "麻酔導入スムーズ。術後経過良好。" },
    { cat: "admission", date: "7/19", h: "入院継続", meta: "入院　·　11:00入力・記入者：川邉", body: "点滴継続。食欲やや改善。" },
    { cat: "referral", date: "7/20", h: "左前肢の跛行で来院", meta: "紹介　·　10:12入力・記入者：入田", body: "レントゲン撮影。骨折なし。" },
    { cat: "none", date: "7/22", h: "耳を痒がる", meta: "13:36入力・記入者：院長", body: "外耳炎の可能性。点耳薬を処方。" },
  ];
  for (const s of samples) {
    const li = tpl.content.cloneNode(true).querySelector(".tl-item");
    li.dataset.category = s.cat;
    li.querySelector(".tl-item__date").textContent = s.date;
    li.querySelector(".tl-item__headline").textContent = s.h;
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

function sameColor(a, b, tol = 3) {
  if (!a || !b) return false;
  return (
    Math.abs(a.r - b.r) <= tol &&
    Math.abs(a.g - b.g) <= tol &&
    Math.abs(a.b - b.b) <= tol
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
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 560, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".tl-item");

const whiteCss = await page.evaluate(() =>
  getComputedStyle(document.getElementById("tlwrap")).backgroundColor
);
const white = parseRgb(whiteCss);

const rows = await page.evaluate(() =>
  [...document.querySelectorAll(".tl-item")].map((li) => {
    const head = li.querySelector(".tl-item__head");
    const front = li.querySelector(".swipeable__front");
    const main = li.querySelector(".tl-item__main");
    const bar = li.querySelector(".tl-item__bar");
    const deletePanel = li.querySelector(".swipeable__actions--delete");
    // 見出し行の位置で実際に見えている色（背面の透け込み検出）
    const r = head.getBoundingClientRect();
    const x = Math.floor(r.left + 40);
    const y = Math.floor(r.top + r.height / 2);
    let el = document.elementFromPoint(x, y);
    let resolved = el ? getComputedStyle(el).backgroundColor : null;
    while (el && (resolved === "rgba(0, 0, 0, 0)" || resolved === "transparent")) {
      el = el.parentElement;
      resolved = el ? getComputedStyle(el).backgroundColor : null;
    }
    return {
      cat: li.dataset.category,
      itemBg: getComputedStyle(li).backgroundColor,
      frontBg: getComputedStyle(front).backgroundColor,
      mainBg: getComputedStyle(main).backgroundColor,
      barBg: getComputedStyle(bar).backgroundColor,
      deletePanelBg: deletePanel ? getComputedStyle(deletePanel).backgroundColor : null,
      headResolved: resolved,
      headResolvedEl: el?.className || null,
    };
  })
);

const checks = rows.map((row) => {
  const frontRgb = parseRgb(row.frontBg);
  const mainRgb = parseRgb(row.mainBg);
  const barRgb = parseRgb(row.barBg);
  const headRgb = parseRgb(row.headResolved);
  const panelRgb = parseRgb(row.deletePanelBg);
  return {
    cat: row.cat,
    // 背面に赤みの削除面が実在すること（透け検査が空振りしないための前提）
    deletePanelPink: isPinkish(panelRgb),
    // front が不透明な白 = 背面が透けない
    frontOpaqueWhite: Boolean(frontRgb && frontRgb.a === 1 && sameColor(frontRgb, white)),
    // 行の面にはカテゴリ色を乗せない
    mainWhite: sameColor(mainRgb, white),
    headNotPink: !isPinkish(headRgb),
    // カテゴリ色は左バーだけが担う
    barTinted: Boolean(barRgb && barRgb.a > 0 && !sameColor(barRgb, white)),
    frontBg: row.frontBg,
    mainBg: row.mainBg,
    barBg: row.barBg,
    headResolved: row.headResolved,
  };
});

// 4カテゴリのバー色が互いに区別できること（色分けが機能している証明）
const barColors = new Set(checks.map((c) => c.barBg));
const barsDistinct = barColors.size === checks.length;

await page.locator(".col--center").screenshot({
  path: path.join(root, "tools/tl-meta-no-tint-after.png"),
});

console.log(JSON.stringify({ whiteCss, barsDistinct, checks }, null, 2));
await browser.close();
server.close();

const ok =
  barsDistinct &&
  checks.every(
    (c) =>
      c.deletePanelPink &&
      c.frontOpaqueWhite &&
      c.mainWhite &&
      c.headNotPink &&
      c.barTinted
  );
if (!ok) {
  console.error("VERIFY_FAILED");
  process.exit(1);
}
console.log("VERIFY_OK");
