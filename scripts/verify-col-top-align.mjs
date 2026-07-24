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

function findChromeHeadlessShell() {
  if (process.env.PLAYWRIGHT_ARM_SHELL && fs.existsSync(process.env.PLAYWRIGHT_ARM_SHELL)) {
    return process.env.PLAYWRIGHT_ARM_SHELL;
  }
  const cacheRoot = path.join(os.tmpdir(), "cursor-sandbox-cache");
  if (!fs.existsSync(cacheRoot)) return null;
  for (const dir of fs.readdirSync(cacheRoot)) {
    const candidate = path.join(
      cacheRoot,
      dir,
      "playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"
    );
    if (fs.existsSync(candidate)) return candidate;
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
  throw new Error("Could not launch browser");
}

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>col top align</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    html, body { height: 100%; margin: 0; }
    #app-shell.app { display: flex !important; height: 100%; }
    .guide {
      position: absolute; left: 0; right: 0; height: 0;
      border-top: 2px dashed #e11; z-index: 50; pointer-events: none;
    }
  </style>
</head>
<body>
<div id="app-shell" class="app">
  <div class="layout" id="layout">
    <aside class="col col--left" id="col-left">
      <div class="col-left__inner">
        <button id="btn-change-karte" class="left-patient" type="button">
          <span class="left-patient__back">⬅</span>
          <span class="left-patient__meta">
            <span class="left-patient__karte">00001</span>
            <span class="left-patient__name">イチロウちゃん</span>
          </span>
        </button>
        <div class="left-head"><h2 class="col__title">見出し</h2></div>
        <ul class="headline-list">
          <li class="hl-item"><button type="button" class="hl-item__btn"><span class="hl-item__text">術後経過</span></button></li>
        </ul>
      </div>
    </aside>
    <section class="col col--center" id="col-center">
      <div class="center-main" id="center-main">
        <div class="center-toolbar">
          <button class="btn btn--small btn--primary" type="button">新しく記録を追加</button>
          <button class="btn btn--small btn--outline" type="button">定型文の管理</button>
          <div class="center-toolbar__end">
            <button class="btn btn--small btn--outline app-menu__trigger" type="button">⚙</button>
          </div>
        </div>
        <div class="timeline-wrap">
          <h2 class="col__title timeline-title">これまでの記録</h2>
        </div>
      </div>
    </section>
    <aside class="col col--right" id="col-right">
      <div class="right-tabs">
        <button class="right-tab" type="button">既往歴</button>
        <button class="right-tab is-active" type="button">検査</button>
        <button class="right-tab" type="button">薬剤</button>
        <button class="right-tab" type="button">処置</button>
        <button class="right-tab" type="button">検索</button>
      </div>
      <div class="right-panel" style="display:flex">
        <div class="exam-toolbar">
          <button class="btn btn--small btn--primary" type="button">予定を登録</button>
        </div>
      </div>
    </aside>
  </div>
</div>
<div class="guide" id="guide"></div>
<script>
  requestAnimationFrame(() => {
    const left = document.querySelector(".left-patient").getBoundingClientRect();
    const center = document.querySelector(".center-toolbar").getBoundingClientRect();
    const right = document.querySelector(".right-tabs").getBoundingClientRect();
    const tops = [left.top, center.top, right.top];
    const max = Math.max(...tops);
    const min = Math.min(...tops);
    document.getElementById("guide").style.top = min + "px";
    document.title = JSON.stringify({
      left: Math.round(left.top * 10) / 10,
      center: Math.round(center.top * 10) / 10,
      right: Math.round(right.top * 10) / 10,
      delta: Math.round((max - min) * 10) / 10,
    });
  });
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/col-top-align-harness.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const filePath = path.join(root, urlPath.replace(/^\//, ""));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = path.extname(filePath);
  const type =
    ext === ".css"
      ? "text/css; charset=utf-8"
      : ext === ".js"
        ? "text/javascript; charset=utf-8"
        : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${base}/tools/col-top-align-harness.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(100);

const metrics = JSON.parse(await page.title());
console.log("TOPS", metrics);
if (metrics.delta > 1) {
  throw new Error(`column tops not aligned: delta=${metrics.delta}px ${JSON.stringify(metrics)}`);
}

await page.screenshot({ path: path.join(root, "tools/col-top-align.png") });
console.log("OK: column tops aligned");
await browser.close();
server.close();
