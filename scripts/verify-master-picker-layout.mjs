/**
 * マスタ選択（リニアピッカー）の行が潰れずに表示されるかを実測する。
 * 疾患/手術/検査/薬剤で共通のスワイプ行 (.med-linear-picker__row.swipeable) が
 * flex カラム内で縮み、内容が隠れる回帰を検出する。
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function findChromeHeadlessShell() {
  const cacheRoot = path.join(os.tmpdir(), "cursor-sandbox-cache");
  if (!fs.existsSync(cacheRoot)) return null;
  for (const dir of fs.readdirSync(cacheRoot)) {
    for (const arch of ["mac-arm64", "mac-x64"]) {
      const c = path.join(
        cacheRoot,
        dir,
        `playwright/chromium_headless_shell-1228/chrome-headless-shell-${arch}/chrome-headless-shell`
      );
      if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

async function launchBrowser() {
  const candidates = [
    findChromeHeadlessShell(),
    fs.existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : null,
  ].filter(Boolean);

  for (const executablePath of candidates) {
    try {
      return await chromium.launch({ executablePath, headless: true, timeout: 30_000 });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  return chromium.launch({ channel: "chrome", headless: true, timeout: 30_000 });
}

const HARNESS = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/css/style.css">
<style>
  body { margin: 0; }
  #stage { height: 360px; width: 720px; }
</style>
</head><body>
<div id="stage"><div class="med-linear-picker" id="picker"></div></div>
<script type="module">
  import { enableRowGestures } from "/js/row-gestures.js";

  const LABELS = [
    "循環器","消化器","腎臓・泌尿器","呼吸器","神経・行動","内分泌・代謝",
    "皮膚","眼科","耳鼻","運動器","血液・免疫","腫瘍","感染症","歯科・口腔","その他",
  ];

  const picker = document.getElementById("picker");

  function buildCol(title, variant) {
    const col = document.createElement("div");
    col.className = "med-linear-picker__col";
    if (variant) col.classList.add("med-linear-picker__col--" + variant);
    const head = document.createElement("div");
    head.className = "med-linear-picker__head";
    head.textContent = title;
    const list = document.createElement("div");
    list.className = "med-linear-picker__list";
    list.setAttribute("role", "listbox");

    LABELS.forEach((label, i) => {
      const row = document.createElement("div");
      row.className = "med-linear-picker__row";
      row.dataset.label = label;
      row.dataset.col = title;
      const item = document.createElement("div");
      item.className = "med-linear-picker__item";
      if (i === 0) item.classList.add("is-selected");
      const text = document.createElement("span");
      text.className = "med-linear-picker__item-label";
      text.textContent = label;
      const check = document.createElement("span");
      check.className = "med-linear-picker__check";
      check.textContent = "✓";
      item.append(text, check);
      row.appendChild(item);
      enableRowGestures(row, {
        actions: [{ action: "delete", title: "削除", onClick: () => {} }],
        onActivate: () => {},
      });
      list.appendChild(row);
    });

    col.append(head, list);
    return col;
  }

  picker.append(buildCol("大分類"), buildCol("小分類", "leaf"));
  window.__ready = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/harness.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HARNESS);
    return;
  }
  const filePath = path.join(root, url.pathname);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});

await page.goto(`${base}/harness.html`);
await page.waitForFunction(() => window.__ready === true);

const metrics = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".med-linear-picker__row")];
  const list = document.querySelector(".med-linear-picker__list");
  const opaque = (el) => {
    const bg = getComputedStyle(el).backgroundColor;
    const m = bg.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(",").map((v) => parseFloat(v));
    return parts.length < 4 || parts[3] >= 1;
  };
  return {
    listHeight: Math.round(list.getBoundingClientRect().height),
    listScrollHeight: list.scrollHeight,
    rows: rows.map((row) => {
      const item = row.querySelector(".med-linear-picker__item");
      const front = row.querySelector(".swipeable__front");
      const r = row.getBoundingClientRect();
      // 閉じた状態で行の左端に何が見えているか（操作領域が透けていないか）
      const hit = document.elementFromPoint(r.left + 8, r.top + r.height / 2);
      return {
        col: row.dataset.col,
        label: row.dataset.label,
        rowHeight: Math.round(r.height * 10) / 10,
        itemHeight: Math.round(item.getBoundingClientRect().height * 10) / 10,
        frontOpaque: opaque(front),
        leftEdgeIsAction: Boolean(hit?.closest(".swipeable__actions")),
      };
    }),
  };
});

await page.screenshot({ path: path.join(root, "tools/master-picker-layout.png") });
await browser.close();
server.close();

console.log("list:", metrics.listHeight, "scroll:", metrics.listScrollHeight);
console.table(metrics.rows);
if (errors.length) console.log("errors:", errors);

const shortest = Math.min(...metrics.rows.map((r) => r.rowHeight));
const clipped = metrics.rows.filter((r) => r.rowHeight + 0.5 < r.itemHeight);

assert.equal(errors.length, 0, `console errors: ${errors.join("\n")}`);
assert.ok(
  shortest >= 40,
  `行が潰れています（最小 ${shortest}px、期待 40px 以上）`
);
assert.equal(
  clipped.length,
  0,
  `内容がクリップされた行: ${clipped.map((r) => `${r.label}(${r.rowHeight}/${r.itemHeight})`).join(", ")}`
);
assert.ok(
  metrics.listScrollHeight > metrics.listHeight,
  "項目が多いのにスクロールしていません（行が縮んでいる疑い）"
);

const seeThrough = metrics.rows.filter(
  (r) => !r.frontOpaque || r.leftEdgeIsAction
);
assert.equal(
  seeThrough.length,
  0,
  `閉じた状態でスワイプ操作領域が見えている行: ${seeThrough
    .map((r) => `${r.col}/${r.label}`)
    .join(", ")}`
);

console.log("OK: リニアピッカーの行が潰れずに表示されています");
