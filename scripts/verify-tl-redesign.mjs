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
const phase = process.argv[2] || "after"; // before | after | compare

function findChromeHeadlessShell() {
  if (process.env.PLAYWRIGHT_ARM_SHELL && fs.existsSync(process.env.PLAYWRIGHT_ARM_SHELL)) {
    return process.env.PLAYWRIGHT_ARM_SHELL;
  }
  const cacheRoot = path.join(os.tmpdir(), "cursor-sandbox-cache");
  if (!fs.existsSync(cacheRoot)) return null;
  for (const dir of fs.readdirSync(cacheRoot)) {
    const arm = path.join(
      cacheRoot,
      dir,
      "playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"
    );
    const x64 = path.join(
      cacheRoot,
      dir,
      "playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-x64/chrome-headless-shell"
    );
    if (fs.existsSync(arm)) return arm;
    if (fs.existsSync(x64)) return x64;
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
      return await chromium.launch({
        executablePath,
        headless: true,
        timeout: 30_000,
      });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  return chromium.launch({ headless: true });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const sampleItems = [
  {
    category: "none",
    star: false,
    date: "7/25",
    headline: "左前肢の跛行で来院",
    meta: "10:12入力・記入者：入田",
    body: "レントゲン撮影。骨折なし。消炎鎮痛剤を処方。経過観察とし、1週間後再診。",
  },
  {
    category: "ope",
    star: true,
    date: "7/18",
    headline: "膝蓋骨脱臼 整復術",
    meta: "14:30入力・記入者：入田　／　最終編集 7/19 9:00・田中",
    body: "全身麻酔下で整復。術後経過良好。抗菌薬・鎮痛薬を処方。",
  },
  {
    category: "admission",
    star: false,
    date: "7/12",
    headline: "急性膵炎疑い 入院",
    meta: "9:05入力・記入者：神子島",
    body: "食欲廃絶・嘔吐。輸液開始。血液検査でリパーゼ上昇。",
  },
  {
    category: "referral",
    star: false,
    date: "7/5",
    headline: "二次診療紹介（眼科）",
    meta: "16:40入力・記入者：入田",
    body: "角膜潰瘍疑いで専門病院へ紹介。紹介状作成済み。",
  },
  {
    category: "none",
    star: false,
    date: "6/28",
    headline: "ワクチン接種・健康診断",
    meta: "11:20入力・記入者：種田",
    body: "混合ワクチン接種。体重 4.2kg。特記事項なし。",
  },
];

function oldItemHtml(item) {
  const starPressed = item.star ? "true" : "false";
  const cat =
    item.category === "ope"
      ? "オペ"
      : item.category === "admission"
        ? "入院"
        : item.category === "referral"
          ? "紹介"
          : "";
  const catSpan = cat
    ? `<span class="tl-item__cat-label">${cat}</span>`
    : `<span class="tl-item__cat-label"></span>`;
  return `<li class="tl-item" data-category="${item.category}">
    <div class="tl-item__meta-row">
      <button class="tl-item__star" type="button" aria-pressed="${starPressed}">★</button>
      <div class="tl-item__title-row">
        <span class="tl-item__title">
          <span class="tl-item__date">${item.date}</span>
          <span class="tl-item__headline">${item.headline}</span>
        </span>
        ${catSpan}
        <span class="tl-item__meta">${item.meta}</span>
      </div>
    </div>
    <div class="tl-item__card">
      <span class="tl-item__bar"></span>
      <div class="tl-item__content">
        <p class="tl-item__body">${item.body}</p>
      </div>
    </div>
  </li>`;
}

function newItemHtml(item) {
  const starPressed = item.star ? "true" : "false";
  return `<li class="tl-item" data-category="${item.category}">
    <span class="tl-item__bar" aria-hidden="true"></span>
    <div class="tl-item__main">
      <div class="tl-item__head">
        <button class="tl-item__star" type="button" aria-pressed="${starPressed}" title="重要（★）">★</button>
        <div class="tl-item__title">
          <span class="tl-item__date">${item.date}</span>
          <span class="tl-item__headline">${item.headline}</span>
        </div>
      </div>
      <p class="tl-item__body">${item.body}</p>
      <p class="tl-item__meta" hidden>${item.meta}</p>
    </div>
  </li>`;
}

function harness(label, itemRenderer) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>tl redesign ${label}</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    html, body { margin: 0; background: #d8d8d8; }
    .frame {
      width: 420px;
      margin: 16px auto;
      background: var(--color-cream);
      min-height: 720px;
      box-shadow: 0 2px 16px rgba(0,0,0,.12);
    }
    .banner {
      font: 700 12px/1.3 system-ui, sans-serif;
      padding: 10px 14px;
      background: #333;
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="frame">
    <div class="banner">${label}</div>
    <div class="timeline-wrap" style="max-height:none;overflow:visible">
      <h2 class="col__title timeline-title">これまでの記録（新しい順）</h2>
      <ul class="timeline">
        ${sampleItems.map(itemRenderer).join("\n")}
      </ul>
    </div>
  </div>
</body>
</html>`;
}

if (phase === "compare") {
  const beforePath = path.join(root, "tools/tl-redesign-before.png");
  const afterPath = path.join(root, "tools/tl-redesign-after.png");
  const outPath = path.join(root, "tools/tl-redesign-compare.png");
  if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) {
    throw new Error("before/after png missing");
  }
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: 980, height: 1100 },
    deviceScaleFactor: 2,
  });
  const beforeB64 = fs.readFileSync(beforePath).toString("base64");
  const afterB64 = fs.readFileSync(afterPath).toString("base64");
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:#ececec;font-family:system-ui,sans-serif">
    <div style="display:flex;gap:16px;padding:16px;align-items:flex-start;justify-content:center">
      <figure style="margin:0"><figcaption style="font:700 13px/1.3 sans-serif;margin-bottom:8px">BEFORE</figcaption>
        <img src="data:image/png;base64,${beforeB64}" style="display:block;width:420px;box-shadow:0 2px 12px rgba(0,0,0,.15)" /></figure>
      <figure style="margin:0"><figcaption style="font:700 13px/1.3 sans-serif;margin-bottom:8px">AFTER</figcaption>
        <img src="data:image/png;base64,${afterB64}" style="display:block;width:420px;box-shadow:0 2px 12px rgba(0,0,0,.15)" /></figure>
    </div></body></html>`);
  await page.locator("body > div").screenshot({ path: outPath });
  console.log("wrote", outPath);
  await browser.close();
  process.exit(0);
}

const useOld = phase === "before";
const html = harness(
  useOld ? "BEFORE（現行）" : "AFTER（見直し後）",
  useOld ? oldItemHtml : newItemHtml
);

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/" || urlPath === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  const filePath = path.join(root, urlPath.replace(/^\//, ""));
  if (
    !filePath.startsWith(root) ||
    !fs.existsSync(filePath) ||
    fs.statSync(filePath).isDirectory()
  ) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const browser = await launchBrowser();
const page = await browser.newPage({
  viewport: { width: 460, height: 900 },
  deviceScaleFactor: 2,
});
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(200);
const out = path.join(root, `tools/tl-redesign-${phase}.png`);
await page.locator(".frame").screenshot({ path: out });
console.log("wrote", out);
await browser.close();
server.close();
