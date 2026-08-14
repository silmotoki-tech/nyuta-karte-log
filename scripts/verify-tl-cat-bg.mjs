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
const outPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "tools/tl-cat-bg-after.png");
const label = process.argv[3] || "AFTER";

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
  <title>tl cat bg</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    html, body { margin: 0; background: #e8e8e8; }
    .wrap { width: 560px; margin: 20px auto; background: var(--color-cream); padding: 16px; }
    .banner { font: 700 13px/1.3 sans-serif; margin-bottom: 10px; color: #333; }
    .timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="banner">${label}: 通常 / オペ / 入院 / 紹介</div>
    <ul class="timeline">
      <li class="tl-item" data-category="none">
        <span class="tl-item__bar"></span>
        <div class="tl-item__content">
          <div class="tl-item__head">
            <button class="tl-item__star" type="button" aria-pressed="false">★</button>
            <div class="tl-item__title-row">
              <span class="tl-item__title">
                <span class="tl-item__date">2026/7/20</span>
                <span class="tl-item__headline">左前肢の跛行で来院</span>
              </span>
              <span class="tl-item__meta">入田 · 10:12</span>
            </div>
          </div>
          <p class="tl-item__body">レントゲン撮影。骨折なし。消炎鎮痛剤を処方。</p>
        </div>
      </li>
      <li class="tl-item" data-category="ope">
        <span class="tl-item__bar"></span>
        <div class="tl-item__content">
          <div class="tl-item__head">
            <button class="tl-item__star" type="button" aria-pressed="true">★</button>
            <div class="tl-item__title-row">
              <span class="tl-item__title">
                <span class="tl-item__date">2026/7/18</span>
                <span class="tl-item__headline">膝蓋骨脱臼 整復術</span>
              </span>
              <span class="tl-item__cat-label">オペ</span>
              <span class="tl-item__meta">入田 · 14:30</span>
            </div>
          </div>
          <p class="tl-item__body">全身麻酔下で整復。術後経過良好。</p>
        </div>
      </li>
      <li class="tl-item" data-category="admission">
        <span class="tl-item__bar"></span>
        <div class="tl-item__content">
          <div class="tl-item__head">
            <button class="tl-item__star" type="button" aria-pressed="false">★</button>
            <div class="tl-item__title-row">
              <span class="tl-item__title">
                <span class="tl-item__date">2026/7/15</span>
                <span class="tl-item__headline">点滴・経過観察のため入院</span>
              </span>
              <span class="tl-item__cat-label">入院</span>
              <span class="tl-item__meta">入田 · 09:05</span>
            </div>
          </div>
          <p class="tl-item__body">食欲低下。皮下点滴実施。</p>
        </div>
      </li>
      <li class="tl-item" data-category="referral">
        <span class="tl-item__bar"></span>
        <div class="tl-item__content">
          <div class="tl-item__head">
            <button class="tl-item__star" type="button" aria-pressed="false">★</button>
            <div class="tl-item__title-row">
              <span class="tl-item__title">
                <span class="tl-item__date">2026/7/10</span>
                <span class="tl-item__headline">二次診療へ紹介</span>
              </span>
              <span class="tl-item__cat-label">紹介</span>
              <span class="tl-item__meta">入田 · 16:40</span>
            </div>
          </div>
          <p class="tl-item__body">眼科専門医へ紹介状作成。</p>
        </div>
      </li>
    </ul>
  </div>
</body>
</html>`;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/" || req.url === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(harness);
        return;
      }
      const filePath = path.join(root, decodeURIComponent(req.url.split("?")[0]));
      if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(filePath);
      const type =
        ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(fs.readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const server = await startServer();
const { port } = server.address();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 640, height: 720 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

const items = await page.$$eval(".tl-item", (els) =>
  els.map((el) => {
    const cs = getComputedStyle(el);
    const dot = el.querySelector(".tl-item__dot");
    const dotCs = dot ? getComputedStyle(dot) : null;
    return {
      category: el.dataset.category,
      bg: cs.backgroundColor,
      hasDot: Boolean(dot),
      dotDisplay: dotCs?.display,
      dotW: dot ? Math.round(dot.getBoundingClientRect().width) : 0,
    };
  })
);
console.log(JSON.stringify({ label, items }, null, 2));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
await page.locator(".wrap").screenshot({ path: outPath });
console.log("WROTE", outPath);

await browser.close();
server.close();
