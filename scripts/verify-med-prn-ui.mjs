/**
 * 薬剤詳細の頓服チェック → 一覧に「頓」マーク（右から カテゴリ→頓→使用状況）を検証する。
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

const mockDb = `
const store = { medicationItems: {}, medications: {} };
const medListeners = new Map();
function ensureMeds(k) {
  if (!store.medications[k]) store.medications[k] = {};
  return store.medications[k];
}
function notifyMeds(k) {
  const drugs = Object.entries(ensureMeds(k)).map(([id, d]) => ({
    id,
    prn: false,
    ...d,
    events: d.events || {},
  }));
  (medListeners.get(k) || []).forEach((cb) => cb(drugs.map((x) => structuredClone(x))));
}
export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" }, { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" }, { id: "eye", label: "点眼薬" },
  { id: "supplement", label: "サプリメント・商品" },
];
export function normalizeMedicationItemCategory(c) {
  return ["inject","oral","topical","eye","supplement"].includes(c) ? c : "oral";
}
export function normalizeMedicationItemKind(k) { return k === "group" ? "group" : "leaf"; }
export function medicationItemCategoryLabel(c) {
  return ({ inject:"注射薬", oral:"内服薬", topical:"外用薬", eye:"点眼薬", supplement:"サプリメント・商品" })[normalizeMedicationItemCategory(c)] || c;
}
export function subscribeMedicationItems(cb) { cb([]); return () => {}; }
export function subscribeMedications(karte, cb) {
  const list = medListeners.get(karte) || [];
  list.push(cb); medListeners.set(karte, list); notifyMeds(karte);
  return () => medListeners.set(karte, (medListeners.get(karte)||[]).filter((x) => x !== cb));
}
export async function addMedication() { return "x"; }
export async function updateMedication(karte, drugId, fields) {
  const drug = ensureMeds(karte)[drugId];
  if (!drug) throw new Error("missing");
  if (fields.prn != null) drug.prn = Boolean(fields.prn);
  if (fields.category != null) drug.category = fields.category;
  if (fields.name != null) drug.name = fields.name;
  if (fields.sideEffectNote != null) drug.sideEffectNote = fields.sideEffectNote;
  if (fields.expiryEstimate != null) drug.expiryEstimate = fields.expiryEstimate;
  notifyMeds(karte);
}
export async function deleteMedication() {}
export async function addMedicationItem() { return "x"; }
export async function updateMedicationItem() {}
export async function deleteMedicationItem() {}
export async function addMedicationEvent() { return "x"; }
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function fetchMedicationItemsOnce() { return []; }
export async function fetchMedicationsOnce() { return []; }
export const EXAM_ITEM_CATEGORIES = [
  { id: "blood", label: "血液" }, { id: "imaging", label: "画像" },
  { id: "pathology", label: "病理" }, { id: "other", label: "その他" },
];
export const EXAM_FASTING = { REQUIRED: "required", NONE: "none" };
export function normalizeExamItemCategory(c) { return c || "blood"; }
export function normalizeExamFasting() { return ""; }
export function examFastingLabel() { return ""; }
export function subscribeExamItems(cb) { cb([]); return () => {}; }
export function subscribeExamPlan(karte, cb) { cb([]); return () => {}; }
export async function addExamItem() { return "x"; }
export async function saveExamScheduledPlan() { return "p"; }
export async function deleteExamScheduledPlan() {}
export async function endExamScheduledPlan() {}
export async function reviveExamPlanByItem() { return "p"; }
export async function addExamHistory() { return "h"; }

ensureMeds("karte-prn")["d1"] = {
  schemaVersion:1, name:"プレドニゾロン", category:"A", prn:false, sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"2026-07-01", type:"add", frequencyChange:"1日1回", frequency:{kind:"preset",label:"1日1回"}, amountChange:"", changedBy:"院長" } }
};
`;

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head>
<body style="margin:0;background:var(--color-cream)">
<aside class="right-column" style="width:100%;max-width:420px;margin:0 auto;min-height:100vh;background:var(--color-cream)">
  <div class="right-panel" id="panel-meds">
    <div class="exam-toolbar">
      <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    </div>
    <section class="exam-section">
      <h3 class="exam-section__title">薬剤一覧</h3>
      <p class="field__note" id="meds-empty"></p>
      <ul class="meds-list" id="meds-list" spellcheck="false"></ul>
    </section>
  </div>
</aside>
<div class="modal" id="med-detail-sheet" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="med-detail-sheet-title">
    <div class="modal__header">
      <h2 class="modal__title" id="med-detail-sheet-title">薬剤の詳細</h2>
      <button class="modal__close" id="btn-close-med-detail-sheet" type="button" aria-label="閉じる">&times;</button>
    </div>
    <div class="modal__body">
      <p class="exam-sheet__item" id="med-detail-sheet-name"></p>
      <p class="field__note" id="med-detail-sheet-status"></p>
      <div id="med-detail-sheet-body" class="med-sheet__body"></div>
    </div>
    <div class="modal__footer">
      <button id="btn-med-detail-sheet-close" class="btn btn--small btn--outline" type="button">閉じる</button>
    </div>
  </div>
</div>
<div class="modal" id="med-add-modal" hidden>
  <button id="btn-close-med-add" type="button"></button>
  <div id="med-add-col-category-list"></div>
  <div id="med-add-col-group-list"></div>
  <div id="med-add-col-leaf-list"></div>
  <p id="med-add-items-empty" hidden></p>
  <div id="med-add-item-add" hidden>
    <label id="med-add-new-item-label"></label>
    <input id="med-add-new-item" /><button id="btn-med-add-new-item" type="button"></button>
    <p id="med-add-item-error" hidden></p>
  </div>
  <button id="btn-med-add-toggle" hidden type="button"></button>
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
  <input id="med-add-note" type="text" />
  <input id="med-add-expiry" type="date" />
  <p id="med-add-error" hidden></p>
  <button id="btn-med-add-save" type="button"></button>
  <button id="btn-med-add-cancel" type="button"></button>
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
  showToast: (m) => console.log("toast", m),
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "院長",
});
enterMeds("karte-prn");
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
  viewport: { width: 440, height: 900 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.warn("pageerror", e.message));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(120);

const before = await page.evaluate(() =>
  Boolean(document.querySelector("#meds-list .med-sign--prn"))
);
if (before) throw new Error("prn mark should be off initially");

await page.locator("#meds-list .med-card__header").click();
await page.waitForSelector("#med-detail-sheet:not([hidden])");
await page.waitForTimeout(80);

const hasCheckbox = await page.locator(".med-prn-check input[type=checkbox]").count();
if (!hasCheckbox) throw new Error("頓服 checkbox missing in detail");

const shotDir = path.join(root, "tools");
fs.mkdirSync(shotDir, { recursive: true });
await page.screenshot({
  path: path.join(shotDir, "med-prn-detail-checkbox.png"),
});

await page.locator(".med-prn-check input[type=checkbox]").check();
await page.waitForTimeout(150);

const checked = await page.locator(".med-prn-check input[type=checkbox]").isChecked();
if (!checked) throw new Error("頓服 checkbox did not stay checked");

await page.screenshot({
  path: path.join(shotDir, "med-prn-detail-checked.png"),
});

await page.locator("#btn-med-detail-sheet-close").click();
await page.waitForSelector("#med-detail-sheet[hidden]", { state: "attached" });
await page.waitForTimeout(120);

const after = await page.evaluate(() => {
  const li = document.querySelector("#meds-list .med-card");
  const kids = [...(li?.querySelector(".med-card__header")?.children || [])].map(
    (el) => el.className
  );
  return {
    prn: Boolean(li?.querySelector(".med-sign--prn")),
    prnText: li?.querySelector(".med-sign--prn")?.textContent || "",
    kids,
  };
});
console.log("after toggle", after);
if (!after.prn || after.prnText !== "頓") {
  throw new Error("prn mark missing after toggle: " + JSON.stringify(after));
}
const statusIdx = after.kids.findIndex((c) => c.includes("med-status"));
const prnIdx = after.kids.findIndex((c) => c.includes("med-sign--prn"));
const catIdx = after.kids.findIndex((c) => c.includes("med-cat"));
if (!(statusIdx < prnIdx && prnIdx < catIdx)) {
  throw new Error(`order want status→prn→cat, got ${after.kids.join(" | ")}`);
}

await page.screenshot({
  path: path.join(shotDir, "med-prn-list-mark.png"),
});

await browser.close();
server.close();
console.log("OK: med prn checkbox + list mark");
