/**
 * フード大分類と中項目7件のシード／UI表示を検証する。
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { MASTER_DELETE_MOCK } from "./mock-master-delete.js";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureMedicationItemDefaults,
  MEDICATION_ITEM_CATEGORIES,
  MED_FOOD_HILLS_GROUP_ID,
  MED_FOOD_DOCTORS_GROUP_ID,
  MED_FOOD_DIETIX_GROUP_ID,
  MED_FOOD_FARMINA_GROUP_ID,
  MED_FOOD_PURINA_GROUP_ID,
  MED_FOOD_ROYAL_CANIN_GROUP_ID,
  MED_FOOD_OTHER_GROUP_ID,
  __getStore,
} from "./mock-db-med-hierarchy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const FOOD_GROUPS = [
  "Hills",
  "ドクターズ",
  "ダイエティクス",
  "ファルミナ",
  "ピュリナ",
  "ロイヤルカナン",
  "その他",
];

await ensureMedicationItemDefaults();
const items = __getStore().medicationItems;

assert.deepEqual(
  MEDICATION_ITEM_CATEGORIES.map((c) => c.label),
  ["注射薬", "内服薬", "外用薬", "点眼薬", "サプリメント・商品", "フード"]
);

const foodIds = [
  MED_FOOD_HILLS_GROUP_ID,
  MED_FOOD_DOCTORS_GROUP_ID,
  MED_FOOD_DIETIX_GROUP_ID,
  MED_FOOD_FARMINA_GROUP_ID,
  MED_FOOD_PURINA_GROUP_ID,
  MED_FOOD_ROYAL_CANIN_GROUP_ID,
  MED_FOOD_OTHER_GROUP_ID,
];
const foodRows = foodIds.map((id) => items[id]);
assert.ok(foodRows.every(Boolean), "food mid groups missing");
assert.ok(foodRows.every((r) => r.category === "food" && r.kind === "group"));
assert.deepEqual(
  foodRows.map((r) => r.label),
  FOOD_GROUPS
);
assert.deepEqual(
  foodRows.map((r) => r.order),
  [10, 20, 30, 40, 50, 60, 70]
);
const foodLeaves = Object.values(items).filter(
  (r) => r.category === "food" && r.kind === "leaf"
);
assert.equal(foodLeaves.length, 0, "food leaves should be empty for now");
console.log("logic food groups OK:", FOOD_GROUPS.join(" / "));

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function findChromeHeadlessShell() {
  const cacheRoot = path.join(os.tmpdir(), "cursor-sandbox-cache");
  if (!fs.existsSync(cacheRoot)) return null;
  for (const dir of fs.readdirSync(cacheRoot)) {
    for (const arch of ["mac-arm64", "mac-x64"]) {
      const c = path.join(
        cacheRoot,
        dir,
        `playwright/chromium_headless_shell-1228/chrome-headless-shell-${arch}/chrome-headless-shell`
      );
      if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

async function launchBrowser() {
  for (const executablePath of [
    findChromeHeadlessShell(),
    fs.existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : null,
  ].filter(Boolean)) {
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

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-med-hierarchy.js"),
  "utf-8"
);

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head>
<body style="margin:0;background:var(--color-cream)">
<aside class="right-column" style="width:100%;max-width:440px;margin:0 auto;min-height:100vh;background:var(--color-cream)">
  <div class="right-panel" id="panel-meds">
    <div class="exam-toolbar">
      <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    </div>
    <ul class="meds-list" id="meds-list"></ul>
    <p id="meds-empty"></p>
  </div>
</aside>
<div class="modal" id="med-add-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--med-add">
    <div class="modal__header">
      <h2 class="modal__title">薬剤を追加</h2>
      <button class="modal__close" id="btn-close-med-add" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="med-linear-picker" id="med-add-linear-picker" data-cols="3">
        <div class="med-linear-picker__col" id="med-add-col-category">
          <div class="med-linear-picker__head">大項目</div>
          <div class="med-linear-picker__list" id="med-add-col-category-list"></div>
        </div>
        <div class="med-linear-picker__col is-placeholder" id="med-add-col-group">
          <div class="med-linear-picker__head">中項目</div>
          <div class="med-linear-picker__list" id="med-add-col-group-list"></div>
        </div>
        <div class="med-linear-picker__col med-linear-picker__col--leaf is-placeholder" id="med-add-col-leaf">
          <div class="med-linear-picker__head">
            <span class="med-linear-picker__head-label" id="med-add-col-leaf-head-label">薬剤名</span>
            <button type="button" id="btn-med-add-toggle" hidden>＋</button>
          </div>
          <div class="med-linear-picker__search" id="med-add-search" hidden>
            <input id="med-add-search-input" class="input" type="search" />
          </div>
          <div class="med-linear-picker__list" id="med-add-col-leaf-list"></div>
          <p id="med-add-items-empty" hidden></p>
          <div id="med-add-item-add" hidden>
            <label id="med-add-new-item-label"></label>
            <input id="med-add-new-item" /><button id="btn-med-add-new-item" type="button">追加</button>
            <p id="med-add-item-error" hidden></p>
          </div>
        </div>
      </div>
      <div id="med-add-category-buttons"></div>
      <div id="med-add-freq-modes"></div>
      <div id="med-add-freq-presets"></div>
      <div id="med-add-freq-panel-preset"></div>
      <div id="med-add-freq-panel-every-n" hidden></div>
      <div id="med-add-freq-every-n-presets"></div>
      <div id="med-add-freq-every-n-numpad"></div>
      <button id="med-add-freq-period" type="button"></button>
      <button id="med-add-freq-times" type="button"></button>
      <div id="med-add-freq-panel-weekly" hidden></div>
      <div id="med-add-freq-weekly-presets"></div>
      <div id="med-add-freq-weekly-numpad"></div>
      <p id="med-add-freq-weekly-display"></p>
      <div id="med-add-freq-panel-weekdays" hidden></div>
      <div id="med-add-freq-weekdays"></div>
      <div id="med-add-freq-panel-other" hidden></div>
      <input id="med-add-freq-other-input" type="text" />
      <input id="med-add-date" type="date" />
      <input id="med-add-expiry" type="date" />
      <input id="med-add-note" type="text" />
      <div id="med-add-dose-modes"></div>
      <div id="med-add-dose-integer"></div>
      <div id="med-add-dose-fraction"></div>
      <input id="med-add-dose-other-input" type="text" />
      <div id="med-add-dose-panel-integer" hidden></div>
      <div id="med-add-dose-panel-fraction" hidden></div>
      <div id="med-add-dose-panel-other" hidden></div>
      <p id="med-add-error" hidden></p>
      <button id="btn-med-add-save" type="button">追加</button>
      <button id="btn-med-add-cancel" type="button">キャンセル</button>
    </div>
  </div>
</div>
<div class="modal" id="med-detail-sheet" hidden>
  <button id="btn-close-med-detail-sheet" type="button"></button>
  <p id="med-detail-sheet-name"></p>
  <p id="med-detail-sheet-status"></p>
  <div id="med-detail-sheet-body"></div>
  <button id="btn-med-detail-sheet-close" type="button"></button>
</div>
<div class="modal" id="med-event-modal" hidden>
  <button id="btn-close-med-event" type="button"></button>
  <div id="med-event-type-buttons"></div>
  <div id="med-event-change-options"></div>
  <input id="med-event-freq-check" type="checkbox" />
  <input id="med-event-amount-check" type="checkbox" />
  <div id="med-event-freq-block"></div>
  <div id="med-event-amount-block"></div>
  <div id="med-event-amount-presets"></div>
  <input id="med-event-amount-other" type="checkbox" />
  <input id="med-event-amount-other-input" type="text" />
  <input id="med-event-date" type="date" />
  <input id="med-event-detail" type="text" />
  <p id="med-event-error" hidden></p>
  <button id="btn-med-event-save" type="button"></button>
  <button id="btn-med-event-cancel" type="button"></button>
  <div id="med-event-freq-modes"></div>
  <div id="med-event-freq-presets"></div>
  <div id="med-event-freq-panel-preset"></div>
  <div id="med-event-freq-panel-every-n" hidden></div>
  <div id="med-event-freq-every-n-presets"></div>
  <div id="med-event-freq-every-n-numpad"></div>
  <button id="med-event-freq-period" type="button"></button>
  <button id="med-event-freq-times" type="button"></button>
  <div id="med-event-freq-panel-weekly" hidden></div>
  <div id="med-event-freq-weekly-presets"></div>
  <div id="med-event-freq-weekly-numpad"></div>
  <p id="med-event-freq-weekly-display"></p>
  <div id="med-event-freq-panel-weekdays" hidden></div>
  <div id="med-event-freq-weekdays"></div>
  <div id="med-event-freq-panel-other" hidden></div>
  <input id="med-event-freq-other-input" type="text" />
  <div id="med-event-freq-detail-head"></div>
</div>
<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
initMedsUI({
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "院長",
});
enterMeds("karte-food");
window.__ready = true;
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
const browser = await launchBrowser();
const page = await browser.newPage({
  viewport: { width: 480, height: 900 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.warn("pageerror", e.message));
await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb + MASTER_DELETE_MOCK })
);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.waitForTimeout(100);

const cats = await page
  .locator("#med-add-col-category-list .med-linear-picker__item-label")
  .allTextContents();
console.log("UI categories:", cats);
assert.deepEqual(cats, [
  "注射薬",
  "内服薬",
  "外用薬",
  "点眼薬",
  "サプリメント・商品",
  "フード",
  "検索",
]);

await page
  .locator("#med-add-col-category-list .med-linear-picker__item", { hasText: "フード" })
  .click();
await page.waitForTimeout(120);
const groups = await page
  .locator("#med-add-col-group-list .med-linear-picker__item-label")
  .allTextContents();
console.log("UI food groups:", groups);
assert.deepEqual(groups, FOOD_GROUPS);

await page.screenshot({
  path: path.join(root, "tools/med-food-groups-ui.png"),
});

await browser.close();
server.close();
console.log("OK: food category + 7 mid groups");
