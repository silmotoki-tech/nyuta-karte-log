/**
 * AI提案フロー無効化の確認。
 * - フラグが false
 * - runAiSuggestAfterSave が解析・モーダルを起動しない
 * - 自由質問は askClaude 経路を維持
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENABLE_AI_SUGGEST_AFTER_SAVE } from "../js/feature-flags.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (ENABLE_AI_SUGGEST_AFTER_SAVE) {
  throw new Error("ENABLE_AI_SUGGEST_AFTER_SAVE must be false for test ops");
}
console.log("OK: flag is false");

const freeQa = fs.readFileSync(path.join(root, "js/free-qa-ui.js"), "utf8");
if (!freeQa.includes("askClaude")) {
  throw new Error("free-qa-ui.js lost askClaude path");
}
console.log("OK: free-qa still uses askClaude");

const aiSuggest = fs.readFileSync(path.join(root, "js/ai-suggest-ui.js"), "utf8");
if (!aiSuggest.includes("ENABLE_AI_SUGGEST_AFTER_SAVE")) {
  throw new Error("ai-suggest-ui.js missing feature flag guard");
}
if (!aiSuggest.includes("if (!ENABLE_AI_SUGGEST_AFTER_SAVE) return;")) {
  throw new Error("ai-suggest-ui.js missing early return");
}
console.log("OK: ai-suggest guarded by flag");

function findChromeHeadlessShell() {
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
<html lang="ja"><head><meta charset="UTF-8" />
<title>ai flag</title>
<link rel="stylesheet" href="/css/style.css" />
</head><body>
<div id="ai-suggest-loading-modal" class="modal" hidden>
  <div class="modal__dialog"><p>AI解析中…</p></div>
</div>
<div id="ai-suggest-review-modal" class="modal" hidden>
  <div class="modal__dialog">
    <p id="ai-suggest-error" hidden></p>
    <ul id="ai-suggest-list"></ul>
    <p id="ai-suggest-empty" hidden></p>
    <p id="ai-suggest-progress"></p>
    <button type="button" data-close-modal>閉じる</button>
  </div>
</div>
<div id="ai-suggest-adjust-modal" class="modal" hidden></div>
<button id="btn-run" type="button">run</button>
<pre id="out"></pre>
<script type="module">
import { runAiSuggestAfterSave, isAiReviewBlocking, initAiSuggestUI } from "/js/ai-suggest-ui.js";
import { ENABLE_AI_SUGGEST_AFTER_SAVE } from "/js/feature-flags.js";

initAiSuggestUI({
  showToast: (m) => { window.__toasts = (window.__toasts || []).concat([m]); },
  showError: () => {},
});

window.__flag = ENABLE_AI_SUGGEST_AFTER_SAVE;
document.getElementById("btn-run").addEventListener("click", async () => {
  window.__toasts = [];
  await runAiSuggestAfterSave({
    karteNumber: "00001",
    body: "プレドニゾロンを処方。腹部エコーを実施予定。",
    headline: "再診",
    recordDate: "2026-07-24",
    author: "入田",
  });
  const loading = document.getElementById("ai-suggest-loading-modal");
  const review = document.getElementById("ai-suggest-review-modal");
  document.getElementById("out").textContent = JSON.stringify({
    flag: ENABLE_AI_SUGGEST_AFTER_SAVE,
    blocking: isAiReviewBlocking(),
    loadingHidden: loading.hidden,
    reviewHidden: review.hidden,
    toasts: window.__toasts || [],
  }, null, 2);
});
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const filePath = path.join(root, url.replace(/^\//, ""));
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

const browser = await launchBrowser();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.click("#btn-run");
await page.waitForFunction(() => document.getElementById("out").textContent.trim().length > 0);
const result = JSON.parse(await page.locator("#out").innerText());
console.log("RUN", result);

if (result.flag !== false) throw new Error("flag should be false in browser");
if (result.blocking) throw new Error("should not be blocking");
if (!result.loadingHidden) throw new Error("loading modal should stay hidden");
if (!result.reviewHidden) throw new Error("review modal should stay hidden");
if ((result.toasts || []).length > 0) throw new Error("should not toast when disabled");
if (pageErrors.length) throw new Error("page errors: " + pageErrors.join("; "));

await page.screenshot({ path: path.join(root, "tools/ai-suggest-disabled.png") });
console.log("OK: save-time AI suggest is disabled; free-qa path intact");
await browser.close();
server.close();
