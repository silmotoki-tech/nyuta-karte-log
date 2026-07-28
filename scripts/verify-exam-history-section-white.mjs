/**
 * 検査タブの実施履歴セクション背景が白であることを検証する。
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "tools");
const outShot = path.join(outDir, "exam-history-section-white.png");

function contentType(filePath) {
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "text/html; charset=utf-8";
}

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>exam history white bg</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    body { margin: 0; background: #ccc; }
    .frame {
      width: 360px;
      margin: 16px auto;
      background: var(--color-white);
      min-height: 640px;
      box-shadow: 0 6px 18px rgba(0,0,0,.12);
    }
  </style>
</head>
<body>
  <div class="frame">
    <div class="right-tabs" id="right-tabs">
      <button class="right-tab is-active" type="button" data-tab="exam">検査</button>
    </div>
    <div class="right-panel" id="panel-exam" data-panel="exam">
      <div class="exam-toolbar">
        <button class="btn btn--small btn--primary" type="button">予定を登録</button>
      </div>
      <section class="exam-section" id="sec-plan">
        <div class="exam-section__head">
          <h3 class="exam-section__title">検査予定一覧</h3>
        </div>
        <ul class="exam-list">
          <li class="exam-list-item swipeable">
            <div class="swipeable__front">
              <div class="exam-list-item__info">
                <div class="exam-list-item__head">
                  <div class="exam-list-item__title">血液検査</div>
                  <div class="exam-list-item__due exam-due-text--near">あと12日</div>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </section>
      <section class="exam-section" id="sec-history">
        <h3 class="exam-section__title">実施履歴</h3>
        <ul class="exam-list" id="exam-history-list">
          <li class="exam-history-group-title swipeable">
            <div class="swipeable__front">
              <div class="exam-history-group-title__label">腹部エコー - 実施履歴</div>
            </div>
          </li>
          <li class="exam-list-item swipeable">
            <div class="swipeable__front">
              <div class="exam-list-item__info">
                <div class="exam-list-item__head">
                  <div class="exam-list-item__title">腹部エコー</div>
                  <div class="exam-history-date">
                    <span class="exam-history-date__year">2026</span>
                    <span class="exam-history-date__md">7/10</span>
                  </div>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
<script type="module">
function rgb(el) {
  return getComputedStyle(el).backgroundColor;
}
const plan = document.getElementById("sec-plan");
const hist = document.getElementById("sec-history");
const histItem = hist.querySelector(".exam-list-item.swipeable .swipeable__front");
const histGroup = hist.querySelector(".exam-history-group-title.swipeable .swipeable__front");
window.__result = {
  planBg: rgb(plan),
  histBg: rgb(hist),
  histItemBg: rgb(histItem),
  histGroupBg: rgb(histGroup),
  white: getComputedStyle(document.documentElement).getPropertyValue("--color-white").trim() || "#ffffff",
};
window.__ready = true;
</script>
</body>
</html>`;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/" || urlPath === "/index.html") {
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
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(fs.readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function launchBrowser() {
  for (const executablePath of [
    undefined,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    try {
      return await chromium.launch(
        executablePath ? { executablePath, headless: true } : { headless: true }
      );
    } catch (err) {
      console.warn("launch failed", executablePath || "playwright", err.message);
    }
  }
  throw new Error("Unable to launch browser");
}

function isWhite(rgb) {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return false;
  return Number(m[1]) >= 250 && Number(m[2]) >= 250 && Number(m[3]) >= 250;
}

const { server, port } = await startServer();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 420, height: 720 } });

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  const result = await page.evaluate(() => window.__result);
  console.log(result);

  assert.ok(isWhite(result.planBg), `plan should be white, got ${result.planBg}`);
  assert.ok(isWhite(result.histBg), `history section should be white, got ${result.histBg}`);
  assert.ok(isWhite(result.histItemBg), `history item should be white, got ${result.histItemBg}`);
  assert.ok(isWhite(result.histGroupBg), `history group should be white, got ${result.histGroupBg}`);
  assert.equal(result.histBg, result.planBg, "plan and history section bg should match");

  await page.locator("#sec-history").scrollIntoViewIfNeeded();
  await page.screenshot({ path: outShot, fullPage: true });
  console.log("OK: exam history section is white", outShot);
} finally {
  await browser.close();
  server.close();
}
