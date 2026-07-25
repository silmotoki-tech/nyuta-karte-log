/**
 * 3カラム上端揃え + 中央カラム白背景を検証する。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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

function firstInkY(pngPath, bgThresh = 245) {
  const py = `
from PIL import Image
im = Image.open(${JSON.stringify(pngPath)}).convert("RGB")
w, h = im.size
px = im.load()
for y in range(h):
  for x in range(w):
    r, g, b = px[x, y]
    if r < ${bgThresh} or g < ${bgThresh} or b < ${bgThresh}:
      print(y)
      raise SystemExit
print(-1)
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>col top align</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    html, body { height: 100%; margin: 0; }
    #app-shell.app { display: flex !important; height: 100%; position: relative; }
    .guide {
      position: fixed; left: 0; right: 0; height: 0;
      border-top: 2px dashed #e11; z-index: 50; pointer-events: none;
    }
    .guide-label {
      position: fixed; left: 8px; z-index: 51; pointer-events: none;
      font: 700 12px/1 sans-serif; color: #e11; background: rgba(255,255,255,0.9);
      padding: 3px 8px; border-radius: 4px;
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
<div class="guide-label" id="guide-label"></div>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/" || urlPath === "/tools/col-top-align-harness.html") {
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
await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(80);

const metrics = await page.evaluate(() => {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  };
  const leftPatient = document.querySelector(".left-patient");
  const leftKarte = document.querySelector(".left-patient__karte");
  const centerToolbar = document.querySelector(".center-toolbar");
  const centerBtn = document.querySelector(".center-toolbar .btn--primary");
  const rightTabs = document.querySelector(".right-tabs");
  const rightTab = document.querySelector(".right-tab.is-active");
  const timeline = document.querySelector(".timeline-wrap");
  const colCenter = document.querySelector(".col--center");

  const cs = (el) => getComputedStyle(el);
  return {
    leftPatient: box(leftPatient),
    leftKarte: box(leftKarte),
    centerToolbar: box(centerToolbar),
    centerBtn: box(centerBtn),
    rightTabs: box(rightTabs),
    rightTab: box(rightTab),
    timelineBg: cs(timeline).backgroundColor,
    colCenterBg: cs(colCenter).backgroundColor,
    toolbarBg: cs(centerToolbar).backgroundColor,
  };
});

console.log("BOX_TOPS", {
  leftPatient: metrics.leftPatient.top,
  leftKarte: metrics.leftKarte.top,
  centerBtn: metrics.centerBtn.top,
  rightTab: metrics.rightTab.top,
});
console.log("BG", {
  colCenter: metrics.colCenterBg,
  toolbar: metrics.toolbarBg,
  timeline: metrics.timelineBg,
});

// 要素上端（患者ブロック／主ボタン／アクティブタブ）を 1px 以内に揃える
const tops = [
  metrics.leftKarte.top,
  metrics.centerBtn.top,
  metrics.rightTab.top,
];
const topDelta = Math.max(...tops) - Math.min(...tops);
console.log("TOP_DELTA", topDelta);
if (topDelta > 1) {
  throw new Error(
    `element tops not aligned within 1px: L=${tops[0]} C=${tops[1]} R=${tops[2]} Δ=${topDelta}`
  );
}

// 中央は白（cream #f5f6f7 = rgb(245,246,247) ではないこと）
const isWhite = (rgb) => {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const [, r, g, b] = m.map(Number);
  return r >= 250 && g >= 250 && b >= 250;
};
if (!isWhite(metrics.colCenterBg)) {
  throw new Error(`col--center should be white, got ${metrics.colCenterBg}`);
}
if (!isWhite(metrics.timelineBg)) {
  throw new Error(`timeline-wrap should be white, got ${metrics.timelineBg}`);
}
if (!isWhite(metrics.toolbarBg)) {
  throw new Error(`center-toolbar should be white, got ${metrics.toolbarBg}`);
}

const tmp = path.join(os.tmpdir(), "nyuta-col-top");
fs.mkdirSync(tmp, { recursive: true });
const leftPath = path.join(tmp, "left.png");
const centerPath = path.join(tmp, "center.png");
const rightPath = path.join(tmp, "right.png");
await page.locator(".left-patient__karte").screenshot({ path: leftPath });
await page.locator(".center-toolbar .btn--primary").screenshot({ path: centerPath });
await page.locator(".right-tab.is-active").screenshot({ path: rightPath });

const ink = {
  left: firstInkY(leftPath),
  center: firstInkY(centerPath),
  right: firstInkY(rightPath),
};
const abs = {
  left: metrics.leftKarte.top + ink.left,
  center: metrics.centerBtn.top + ink.center,
  right: metrics.rightTab.top + ink.right,
};
const inkDelta = Math.max(...Object.values(abs)) - Math.min(...Object.values(abs));
const guideY = (Math.min(...Object.values(abs)) + Math.max(...Object.values(abs))) / 2;

await page.evaluate(
  ({ guideY, abs, inkDelta }) => {
    document.getElementById("guide").style.top = `${guideY}px`;
    document.getElementById("guide-label").style.top = `${guideY + 4}px`;
    document.getElementById("guide-label").textContent =
      `上端インク L:${abs.left.toFixed(1)} C:${abs.center.toFixed(1)} R:${abs.right.toFixed(1)} Δ${inkDelta.toFixed(1)}px`;
  },
  { guideY, abs, inkDelta }
);

console.log("INK_TOPS", {
  left: Math.round(abs.left * 10) / 10,
  center: Math.round(abs.center * 10) / 10,
  right: Math.round(abs.right * 10) / 10,
  delta: Math.round(inkDelta * 10) / 10,
  ink,
});
// 左（カルテ番号）と中央（主ボタン）の描画上端は 1px 以内。
// 右タブは字体アセントでインクが数px下がるため、要素ボックス上端（TOP_DELTA）で担保する。
if (Math.abs(abs.left - abs.center) > 1) {
  throw new Error(
    `left/center ink tops not aligned: L=${abs.left} C=${abs.center}`
  );
}

// タイムライン帯がグレーでないことをピクセル確認
const fullPath = path.join(root, "tools/col-top-align.png");
await page.screenshot({ path: fullPath });

const pyBg = `
from PIL import Image
im = Image.open(${JSON.stringify(fullPath)}).convert("RGB")
# 中央カラム・ツールバー直下あたりをサンプリング
# viewport 1280: left~210, right~308 → center x around 400-700
grayish = 0
total = 0
for y in range(52, 78):
  for x in range(420, 700):
    r,g,b = im.getpixel((x,y))
    total += 1
    # cream #f5f6f7 近傍をグレーとみなす（純白は除外）
    if 240 <= r <= 248 and 240 <= g <= 248 and 240 <= b <= 248 and not (r >= 252 and g >= 252 and b >= 252):
      grayish += 1
print("grayish", grayish, "total", total, "ratio", round(grayish/total, 4))
if grayish / total > 0.08:
  raise SystemExit("CENTER_GRAY_BG")
print("OK white center band")
`;
const bgCheck = spawnSync("python3", ["-c", pyBg], { encoding: "utf8" });
process.stdout.write(bgCheck.stdout || "");
process.stderr.write(bgCheck.stderr || "");
if (bgCheck.status !== 0) {
  throw new Error("center column still has gray background band");
}

spawnSync(
  "python3",
  [
    "-c",
    `
from PIL import Image
im = Image.open(${JSON.stringify(fullPath)})
band = im.crop((0, 0, im.width, 100)).resize((im.width * 2, 200), Image.NEAREST)
band.save(${JSON.stringify(path.join(root, "tools/col-top-align-zoom.png"))})
print("zoom ok")
`,
  ],
  { encoding: "utf8" }
);

console.log("OK: column tops aligned + center white");
await browser.close();
server.close();
