/**
 * 時系列の行内 上下余白の検証。
 * 区切り線と見出しが詰まって見えないだけの内側余白があること。
 */
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

/** 余白を広げる前の詰まった値（この状態に戻っていないことを見る）。 */
const CRAMPED_PAD_Y = 7;
/** 現行デザインの --tl-pad-y。 */
const EXPECTED_PAD_Y = 11;

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

const tplInner = fs
  .readFileSync(path.join(root, "index.html"), "utf8")
  .match(/<template id="timeline-item-template">([\s\S]*?)<\/template>/)[1];

// 余白は .tl-item__main が持ち、量は .timeline-wrap の --tl-pad-y で決まる。
const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>tl row pad</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    html, body { margin: 0; background: #ddd; }
    .wrap { width: 520px; margin: 24px auto; background: var(--color-cream); }
    .banner { font: 700 12px/1.3 sans-serif; padding: 8px; color: #222; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="banner" id="banner">…</div>
    <div class="timeline-wrap" id="tlwrap" style="max-height:none;overflow:visible">
      <ul class="timeline" id="timeline"></ul>
    </div>
  </div>
  <template id="timeline-item-template">${tplInner}</template>
  <script>
    const tpl = document.getElementById("timeline-item-template");
    const samples = [
      { cat: "ope", date: "7/20", h: "左前肢の跛行で来院", b: "レントゲン撮影。骨折なし。消炎鎮痛剤を処方。" },
      { cat: "none", date: "7/18", h: "術前検査のため入院", b: "食欲良好。体温 38.4℃。" },
    ];
    const list = document.getElementById("timeline");
    for (const s of samples) {
      const li = tpl.content.cloneNode(true).querySelector(".tl-item");
      li.dataset.category = s.cat;
      li.querySelector(".tl-item__date").textContent = s.date;
      li.querySelector(".tl-item__headline").textContent = s.h;
      li.querySelector(".tl-item__body").textContent = s.b;
      list.appendChild(li);
    }

    function measure() {
      const item = document.querySelector(".tl-item");
      const main = item.querySelector(".tl-item__main");
      const head = item.querySelector(".tl-item__head");
      const cs = getComputedStyle(main);
      const padTop = parseFloat(cs.paddingTop);
      const padBottom = parseFloat(cs.paddingBottom);
      // 行の上端（＝直前の区切り線の直下）から見出しまでの実距離。
      const gap = head.getBoundingClientRect().top - item.getBoundingClientRect().top;
      const round = (n) => Math.round(n * 10) / 10;
      const out = { padTop, padBottom, gap: round(gap) };
      document.getElementById("banner").textContent =
        \`padding-top=\${padTop}px | 区切り線→見出し=\${out.gap}px\`;
      document.title = JSON.stringify(out);
      return out;
    }
    measure();
    window.__measure = measure;
    window.__setPadY = (v) => {
      document.getElementById("tlwrap").style.setProperty("--tl-pad-y", v + "px");
      return measure();
    };
    window.__clearPadY = () => {
      document.getElementById("tlwrap").style.removeProperty("--tl-pad-y");
      return measure();
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

const before = await page.evaluate((v) => window.__setPadY(v), CRAMPED_PAD_Y);
console.log("BEFORE(詰まっていた頃)", before);
await page.screenshot({ path: path.join(root, "tools/tl-card-top-pad-before.png") });

const after = await page.evaluate(() => window.__clearPadY());
console.log("AFTER(現行CSS)", after);
await page.screenshot({ path: path.join(root, "tools/tl-card-top-pad-after.png") });

await browser.close();
server.close();

if (after.padTop <= before.padTop) {
  throw new Error(`top pad did not increase: before=${before.padTop} after=${after.padTop}`);
}
if (Math.abs(after.padTop - EXPECTED_PAD_Y) > 0.5) {
  throw new Error(`expected padTop≈${EXPECTED_PAD_Y}, got ${after.padTop}`);
}
if (Math.abs(after.padTop - after.padBottom) > 0.5) {
  throw new Error(
    `row padding not symmetric: top=${after.padTop} bottom=${after.padBottom}`
  );
}
// 余白が .tl-item__main 以外に吸われていないこと（区切り線と見出しの実間隔で確認）。
if (Math.abs(after.gap - after.padTop) > 0.5) {
  throw new Error(`separator→headline gap ${after.gap} != padding-top ${after.padTop}`);
}

console.log("OK: tl row top padding keeps the separator clear");
