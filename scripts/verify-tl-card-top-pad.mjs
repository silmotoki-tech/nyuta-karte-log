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
  <title>tl card top pad</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    html, body { margin: 0; background: #ddd; }
    .wrap { width: 520px; margin: 24px auto; background: var(--color-cream); padding: 16px; }
    .banner { font: 700 12px/1.3 sans-serif; margin-bottom: 8px; color: #222; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="banner" id="banner">…</div>
    <ul class="timeline">
      <li class="tl-item" data-category="ope">
        <div class="tl-item__bar"></div>
        <div class="tl-item__content">
          <div class="tl-item__head">
            <span class="tl-item__dot"></span>
            <div class="tl-item__title-row">
              <span class="tl-item__date">2026/7/20</span>
              <span class="tl-item__headline">左前肢の跛行で来院</span>
            </div>
          </div>
          <div class="tl-item__meta">入田 · 10:12</div>
          <p class="tl-item__body">レントゲン撮影。骨折なし。消炎鎮痛剤を処方。</p>
          <div class="tl-item__actions">
            <button type="button" class="btn btn--small btn--outline">編集</button>
            <button type="button" class="btn btn--small btn--danger-outline">削除</button>
          </div>
        </div>
      </li>
      <li class="tl-item" data-category="none" style="margin-top:8px">
        <div class="tl-item__bar"></div>
        <div class="tl-item__content">
          <div class="tl-item__head">
            <span class="tl-item__dot"></span>
            <div class="tl-item__title-row">
              <span class="tl-item__date">2026/7/18</span>
              <span class="tl-item__headline">術前検査のため入院</span>
            </div>
          </div>
          <div class="tl-item__meta">田中 · 09:40</div>
          <p class="tl-item__body">食欲良好。体温 38.4℃。</p>
        </div>
      </li>
    </ul>
  </div>
  <script>
    function measure() {
      const card = document.querySelector(".tl-item");
      const content = document.querySelector(".tl-item__content");
      const head = document.querySelector(".tl-item__head");
      const cs = getComputedStyle(content);
      const padTop = parseFloat(cs.paddingTop);
      const gap = head.getBoundingClientRect().top - card.getBoundingClientRect().top;
      document.getElementById("banner").textContent =
        \`padding-top=\${padTop}px | border→text=\${Math.round(gap * 10) / 10}px\`;
      document.title = JSON.stringify({ padTop, gap: Math.round(gap * 10) / 10 });
    }
    measure();
    window.__measure = measure;
    window.__setPadTop = (v) => {
      document.querySelectorAll(".tl-item__content").forEach((el) => {
        el.style.paddingTop = v + "px";
      });
      measure();
    };
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/tl-card-top-pad-harness.html") {
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
  res.writeHead(200, {
    "Content-Type": filePath.endsWith(".css")
      ? "text/css; charset=utf-8"
      : "application/octet-stream",
  });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 560, height: 420 } });
await page.goto(`${base}/tools/tl-card-top-pad-harness.html`, { waitUntil: "networkidle" });

// BEFORE: old 7px top
await page.evaluate(() => window.__setPadTop(7));
const before = JSON.parse(await page.title());
console.log("BEFORE", before);
await page.screenshot({ path: path.join(root, "tools/tl-card-top-pad-before.png") });

// AFTER: current CSS (clear inline)
await page.evaluate(() => {
  document.querySelectorAll(".tl-item__content").forEach((el) => {
    el.style.paddingTop = "";
  });
  window.__measure();
});
const after = JSON.parse(await page.title());
console.log("AFTER", after);
await page.screenshot({ path: path.join(root, "tools/tl-card-top-pad-after.png") });

if (after.padTop <= before.padTop) {
  throw new Error(`top pad did not increase: before=${before.padTop} after=${after.padTop}`);
}
if (Math.abs(after.padTop - 11) > 0.5) {
  throw new Error(`expected padTop≈11, got ${after.padTop}`);
}

console.log("OK: tl card top padding increased");
await browser.close();
server.close();
