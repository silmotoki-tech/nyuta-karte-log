/**
 * 時系列の読み軸検証。日付・本文・メタの左端が縦一直線に揃うこと。
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

// --tl-* は .timeline-wrap に定義されるため、実装と同じ入れ子でないと余白が解決されない。
const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>tl text align</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    html, body { margin: 0; background: #ddd; }
    .wrap { width: 520px; margin: 24px auto; background: var(--color-cream); position: relative; }
    .guide {
      position: absolute; top: 0; bottom: 0; width: 0;
      border-left: 2px dashed #e11; z-index: 5; pointer-events: none;
    }
    .banner { font: 700 12px/1.3 sans-serif; padding: 8px; }
  </style>
</head>
<body>
  <div class="wrap" id="wrap">
    <div class="banner" id="banner">…</div>
    <div class="guide" id="guide"></div>
    <div class="timeline-wrap" id="tlwrap" style="max-height:none;overflow:visible">
      <h2 class="col__title timeline-title">これまでの記録（新しい順）</h2>
      <ul class="timeline" id="timeline"></ul>
    </div>
  </div>
  <template id="timeline-item-template">${tplInner}</template>
  <script>
    const tpl = document.getElementById("timeline-item-template");
    const li = tpl.content.cloneNode(true).querySelector(".tl-item");
    li.dataset.category = "ope";
    li.querySelector(".tl-item__date").textContent = "7/20";
    li.querySelector(".tl-item__headline").textContent = "左前肢の跛行で来院";
    li.querySelector(".tl-item__body").textContent =
      "レントゲン撮影。骨折なし。消炎鎮痛剤を処方。";
    const meta = li.querySelector(".tl-item__meta");
    meta.textContent = "オペ　·　10:12入力・記入者：入田";
    // メタは実装ではタップで開く。位置を測るためここでは開いた状態にする。
    meta.hidden = false;
    document.getElementById("timeline").appendChild(li);

    requestAnimationFrame(() => {
      const wrapRect = document.getElementById("wrap").getBoundingClientRect();
      const tlwrap = document.getElementById("tlwrap");
      const q = (sel) => document.querySelector(sel).getBoundingClientRect();
      const date = q(".tl-item__date");
      const body = q(".tl-item__body");
      const metaRect = q(".tl-item__meta");
      const round = (n) => Math.round(n * 10) / 10;
      const padLeftOf = (sel) =>
        parseFloat(getComputedStyle(document.querySelector(sel)).paddingLeft);
      // 本文・メタは padding-left で★列ぶんを空けるので、字の出る位置で測る
      const bodyPadLeft = padLeftOf(".tl-item__body");
      const metaPadLeft = padLeftOf(".tl-item__meta");
      document.getElementById("guide").style.left = (date.left - wrapRect.left) + "px";
      const out = {
        starW: getComputedStyle(tlwrap).getPropertyValue("--tl-star-w").trim(),
        headGap: getComputedStyle(tlwrap).getPropertyValue("--tl-head-gap").trim(),
        bodyPadLeft: round(bodyPadLeft),
        dateLeft: round(date.left),
        bodyLeft: round(body.left + bodyPadLeft),
        metaLeft: round(metaRect.left + metaPadLeft),
        deltaBody: round(body.left + bodyPadLeft - date.left),
        deltaMeta: round(metaRect.left + metaPadLeft - date.left),
      };
      document.getElementById("banner").textContent =
        \`date=\${out.dateLeft} body=\${out.bodyLeft} meta=\${out.metaLeft}\`;
      document.title = JSON.stringify(out);
    });
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/tl-text-align-harness.html") {
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
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 560, height: 360 } });
await page.goto(`http://127.0.0.1:${port}/tools/tl-text-align-harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(80);
const m = JSON.parse(await page.title());
console.log("ALIGN", m);
await page.screenshot({ path: path.join(root, "tools/tl-text-align.png") });
await browser.close();
server.close();

// 変数が解決されず padding が 0 に潰れると「0 対 0」で誤って揃って見えるため先に弾く。
if (!m.starW || !m.headGap) {
  throw new Error(`--tl-* not resolved (harness missing .timeline-wrap?): ${JSON.stringify(m)}`);
}
if (!(m.bodyPadLeft > 0)) {
  throw new Error(`body padding-left collapsed to ${m.bodyPadLeft}`);
}
if (Math.abs(m.deltaBody) > 1) {
  throw new Error(`body left edge not aligned to date: ${JSON.stringify(m)}`);
}
if (Math.abs(m.deltaMeta) > 1) {
  throw new Error(`meta left edge not aligned to date: ${JSON.stringify(m)}`);
}
console.log("OK: timeline text left edges aligned");
