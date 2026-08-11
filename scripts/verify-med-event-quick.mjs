/**
 * 薬剤詳細シート上の出来事種類ボタン → 記録確定までの流れを検証する。
 */
import { launchBrowser } from "./launch-browser.js";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-med-hierarchy.js"),
  "utf-8"
);

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>med event quick harness</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <div class="right-panel" id="panel-meds">
    <div class="exam-toolbar">
      <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    </div>
    <p id="meds-empty" class="field__note"></p>
    <ul class="meds-list" id="meds-list"></ul>
  </div>
</aside>

<div class="modal" id="med-detail-sheet" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title">薬剤の詳細</h2>
      <button class="modal__close" id="btn-close-med-detail-sheet" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <p class="exam-sheet__item" id="med-detail-sheet-name"></p>
      <p class="field__note" id="med-detail-sheet-status"></p>
      <div id="med-detail-sheet-body" class="med-sheet__body"></div>
      <div class="exam-sheet__actions">
        <button id="btn-med-detail-sheet-close" class="btn btn--small btn--outline" type="button">閉じる</button>
      </div>
    </div>
  </div>
</div>

<div class="modal" id="med-add-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--med-add">
    <button class="modal__close" id="btn-close-med-add" type="button">&times;</button>
    <div class="med-linear-picker" id="med-add-linear-picker">
      <div class="med-linear-picker__col"><div class="med-linear-picker__list" id="med-add-col-category-list"></div></div>
      <div class="med-linear-picker__col" id="med-add-col-group" hidden><div class="med-linear-picker__list" id="med-add-col-group-list"></div></div>
      <div class="med-linear-picker__col" id="med-add-col-leaf" hidden>
        <div class="med-linear-picker__list" id="med-add-col-leaf-list"></div>
        <p id="med-add-items-empty" hidden></p>
        <div id="med-add-item-add">
          <label id="med-add-new-item-label" for="med-add-new-item">新薬</label>
          <input id="med-add-new-item" class="input" type="text" />
          <button id="btn-med-add-new-item" type="button">追加</button>
          <p id="med-add-item-error" hidden></p>
        </div>
      </div>
    </div>
    <div id="med-add-category-buttons"></div>
    <div class="med-linear-picker med-linear-picker--freq">
      <div class="med-linear-picker__col"><div class="med-linear-picker__list" id="med-add-freq-modes"></div></div>
      <div class="med-linear-picker__col" id="med-add-freq-detail" hidden>
        <div id="med-add-freq-detail-head"></div>
        <div id="med-add-freq-panel-preset" hidden><div id="med-add-freq-presets"></div></div>
        <div id="med-add-freq-panel-every-n" hidden>
          <button type="button" id="med-add-freq-period"></button>
          <button type="button" id="med-add-freq-times"></button>
          <div id="med-add-freq-every-n-numpad"></div>
        </div>
        <div id="med-add-freq-panel-weekly" hidden>
          <p id="med-add-freq-weekly-display"></p>
          <div id="med-add-freq-weekly-numpad"></div>
        </div>
        <div id="med-add-freq-panel-weekdays" hidden><div id="med-add-freq-weekdays"></div></div>
        <div id="med-add-freq-panel-other" hidden><input id="med-add-freq-other-input" /></div>
      </div>
    </div>
    <p id="med-add-error" hidden></p>
    <button id="btn-med-add-save" type="button">追加する</button>
    <button id="btn-med-add-cancel" type="button">キャンセル</button>
  </div>
</div>

<div class="modal" id="med-event-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--med-event">
    <h2 id="med-event-modal-title"></h2>
    <button id="btn-close-med-event" type="button">&times;</button>
    <div id="med-event-type-buttons" class="exam-item-buttons"></div>
    <input id="med-event-date" type="date" />
    <div id="med-event-change-options" hidden>
      <input type="checkbox" id="med-event-freq-check" />
      <div id="med-event-freq-block" hidden>
        <div class="med-linear-picker med-linear-picker--freq">
          <div class="med-linear-picker__col"><div class="med-linear-picker__list" id="med-event-freq-modes"></div></div>
          <div class="med-linear-picker__col" id="med-event-freq-detail" hidden>
            <div id="med-event-freq-detail-head"></div>
            <div id="med-event-freq-panel-preset" hidden><div id="med-event-freq-presets"></div></div>
            <div id="med-event-freq-panel-every-n" hidden>
              <button type="button" id="med-event-freq-period"></button>
              <button type="button" id="med-event-freq-times"></button>
              <div id="med-event-freq-every-n-numpad"></div>
            </div>
            <div id="med-event-freq-panel-weekly" hidden>
              <p id="med-event-freq-weekly-display"></p>
              <div id="med-event-freq-weekly-numpad"></div>
            </div>
            <div id="med-event-freq-panel-weekdays" hidden><div id="med-event-freq-weekdays"></div></div>
            <div id="med-event-freq-panel-other" hidden><input id="med-event-freq-other-input" /></div>
          </div>
        </div>
      </div>
      <input type="checkbox" id="med-event-amount-check" />
      <div id="med-event-amount-block" hidden>
        <div id="med-event-amount-presets"></div>
        <input type="checkbox" id="med-event-amount-other" />
        <input id="med-event-amount-other-input" hidden />
      </div>
    </div>
    <input id="med-event-detail" type="text" />
    <p id="med-event-error" hidden></p>
    <button id="btn-med-event-save" type="button">保存する</button>
    <button id="btn-med-event-cancel" type="button">キャンセル</button>
  </div>
</div>

<script type="module">
import { initMedsUI, enterMeds, focusMedicationByName } from "/js/meds-ui.js";
initMedsUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
  getSelectedAuthor: () => "院長",
});
window.__enter = (k) => enterMeds(k);
window.__focus = (n) => focusMedicationByName(n);
window.__ready = true;
</script>
</body>
</html>`;

async function clickLinear(page, listSel, label) {
  await page
    .locator(`${listSel} .med-linear-picker__item`, {
      has: page.locator(".med-linear-picker__item-label", { hasText: new RegExp(`^${label}$`) }),
    })
    .click();
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/med-event-quick-harness.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const filePath = path.join(root, urlPath.replace(/^\//, ""));
  if (
    !filePath.startsWith(root) ||
    !fs.existsSync(filePath) ||
    fs.statSync(filePath).isDirectory()
  ) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 480, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/med-event-quick-harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(() => window.__enter("karte-ev"));

// 点眼薬を1件追加
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await clickLinear(page, "#med-add-col-category-list", "点眼薬");
await page.fill("#med-add-new-item", "イベント検証薬");
await page.click("#btn-med-add-new-item");
await page.waitForTimeout(80);
await page.click("#btn-med-add-save");
await page.waitForTimeout(150);

await page.evaluate(() => window.__focus("イベント検証薬"));
await page.waitForSelector("#med-detail-sheet:not([hidden])");
await page.waitForTimeout(150);

const labels = await page
  .locator("#med-detail-sheet-body .med-event-quick__btn")
  .allTextContents();
console.log("quick buttons:", labels);
if (
  JSON.stringify(labels) !==
  JSON.stringify(["継続", "増量", "減量", "中止", "再開", "休薬中"])
) {
  throw new Error("quick event buttons mismatch");
}
await page.screenshot({
  path: path.join(root, "tools/med-event-quick-01-detail.png"),
  fullPage: true,
});

// 休薬中 → 日付確定 → 状態反映
await page.locator(".med-event-quick__btn", { hasText: "休薬中" }).click();
await page.waitForSelector("#med-event-modal:not([hidden])");
const titleHold = await page.locator("#med-event-modal-title").textContent();
console.log("hold modal title:", titleHold);
if (!titleHold?.includes("休薬中")) throw new Error("hold title mismatch");
await page.screenshot({
  path: path.join(root, "tools/med-event-quick-02-hold-modal.png"),
});
await page.click("#btn-med-event-save");
await page.waitForTimeout(200);
let status = await page.locator("#med-detail-sheet-status").textContent();
console.log("status after hold:", status);
if (!status?.includes("休薬中")) throw new Error("status not hold");
let hist = await page.locator("#med-detail-sheet-body").innerText();
if (!hist.includes("休薬中")) throw new Error("history missing hold");

// 増量 → 頻度リニア → 1日2回 → 保存
await page.locator(".med-event-quick__btn", { hasText: "増量" }).click();
await page.waitForSelector("#med-event-modal:not([hidden])");
if (await page.locator("#med-event-freq-block").isHidden()) {
  throw new Error("increase should show freq block");
}
await clickLinear(page, "#med-event-freq-modes", "よくある");
await page.waitForTimeout(60);
await clickLinear(page, "#med-event-freq-presets", "1日2回");
await page.screenshot({
  path: path.join(root, "tools/med-event-quick-03-increase-freq.png"),
});
await page.click("#btn-med-event-save");
await page.waitForTimeout(200);
status = await page.locator("#med-detail-sheet-status").textContent();
console.log("status after increase:", status);
if (!status?.includes("継続")) throw new Error("status should be 継続");
hist = await page.locator("#med-detail-sheet-body").innerText();
if (!hist.includes("増量した") || !hist.includes("1日2回")) {
  throw new Error("history missing increase/freq");
}
await page.screenshot({
  path: path.join(root, "tools/med-event-quick-04-after-increase.png"),
  fullPage: true,
});

// 中止 → 状態反映
await page.locator(".med-event-quick__btn", { hasText: "中止" }).click();
await page.waitForSelector("#med-event-modal:not([hidden])");
await page.click("#btn-med-event-save");
await page.waitForTimeout(200);
status = await page.locator("#med-detail-sheet-status").textContent();
console.log("status after stop:", status);
if (!status?.includes("中止")) throw new Error("status not stop");
const listStatus = await page.locator("#meds-list .med-status").first().textContent();
if (listStatus?.trim() !== "中止") throw new Error("list status not stop");
await page.screenshot({
  path: path.join(root, "tools/med-event-quick-05-stopped.png"),
  fullPage: true,
});

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: detail quick event buttons → save → status/history");
await browser.close();
server.close();
