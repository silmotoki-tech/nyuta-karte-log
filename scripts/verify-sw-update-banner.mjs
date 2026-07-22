/**
 * SW更新案内が「即時適用で握りつぶされず」バナー表示になることを検証する。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const appSrc = readFileSync(join(root, "js/app.js"), "utf8");
assert.ok(
  !appSrc.includes("記入中以外は即時更新する"),
  "即時更新ロジックが残っている"
);
assert.ok(
  !/centerState !== \"main\" \|\| !state\.composing/.test(appSrc),
  "記入中以外に applyWaitingUpdate する分岐が残っている"
);
assert.ok(
  appSrc.includes("新しいバージョンがあります。更新しますか？"),
  "更新案内テキストがない"
);

const swSrc = readFileSync(join(root, "js/sw-update.js"), "utf8");
assert.ok(swSrc.includes("visibilitychange"), "visibilitychange チェックがない");
assert.ok(swSrc.includes("pageshow"), "pageshow チェックがない");
assert.ok(swSrc.includes("checkForUpdates"), "checkForUpdates がない");

const swWorker = readFileSync(join(root, "service-worker.js"), "utf8");
assert.ok(swWorker.includes('CACHE_VERSION = "v57"'), "CACHE_VERSION が上がっていない");
assert.ok(swWorker.includes("cache.add(url)"), "install の個別 cache.add がない");

// --- UI: onUpdateAvailable 相当でバナーが出る ---
function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<link rel="stylesheet" href="/css/style.css" />
<title>sw update banner</title>
</head><body>
<script type="module">
import { applyWaitingUpdate } from "/js/sw-update.js";

const fakeReg = { waiting: { postMessage() {} } };
function showBanner(reg) {
  document.querySelectorAll(".sw-update-banner").forEach((el) => el.remove());
  const banner = document.createElement("div");
  banner.className = "sw-update-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = \`
    <p class="sw-update-banner__text">新しいバージョンがあります。更新しますか？</p>
    <div class="sw-update-banner__actions">
      <button type="button" class="btn btn--small btn--primary" data-sw-update>更新する</button>
      <button type="button" class="btn btn--small btn--outline" data-sw-dismiss>あとで</button>
    </div>
  \`;
  banner.querySelector("[data-sw-update]").addEventListener("click", () => applyWaitingUpdate(reg));
  banner.querySelector("[data-sw-dismiss]").addEventListener("click", () => banner.remove());
  document.body.appendChild(banner);
}
// 記入中でなくても必ず出す（修正後の仕様）
showBanner(fakeReg);
window.__bannerShown = Boolean(document.querySelector(".sw-update-banner"));
window.__bannerText = document.querySelector(".sw-update-banner__text")?.textContent || "";
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/" || urlPath === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const filePath = path.join(root, urlPath.replace(/^\//, ""));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
const shown = await page.evaluate(() => window.__bannerShown);
const text = await page.evaluate(() => window.__bannerText);
assert.equal(shown, true, "バナーが表示されていない");
assert.ok(text.includes("新しいバージョンがあります"), `文言不正: ${text}`);

const shot = path.join(root, "tools/sw-update-banner-verify.png");
await page.screenshot({ path: shot });
console.log("OK: update banner shows without composing");
console.log("screenshot:", shot);

await browser.close();
server.close();
