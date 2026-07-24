/**
 * 薬剤の休薬中ステータス・詳細の重複削除・出来事ボタンを検証する。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
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

const mockDb = `
const store = { medicationItems: {}, medications: {} };
const itemListeners = [];
const medListeners = new Map();
let seq = 0;
const nid = (p) => p + (++seq);

function ensureMeds(k) {
  if (!store.medications[k]) store.medications[k] = {};
  return store.medications[k];
}
function notifyItems() {
  const items = Object.entries(store.medicationItems).map(([id, t]) => ({ id, ...t }));
  items.sort((a,b) => (a.label||"").localeCompare(b.label||""));
  itemListeners.forEach((cb) => cb(items.map(x => ({...x}))));
}
function notifyMeds(k) {
  const drugs = Object.entries(ensureMeds(k)).map(([id, d]) => ({ id, ...d, events: d.events || {} }));
  (medListeners.get(k) || []).forEach((cb) => cb(drugs.map(x => structuredClone(x))));
}
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate());
}

export function subscribeMedicationItems(cb) {
  itemListeners.push(cb);
  notifyItems();
  return () => { const i = itemListeners.indexOf(cb); if (i>=0) itemListeners.splice(i,1); };
}
export function subscribeMedications(karte, cb) {
  const list = medListeners.get(karte) || [];
  list.push(cb);
  medListeners.set(karte, list);
  notifyMeds(karte);
  return () => medListeners.set(karte, (medListeners.get(karte)||[]).filter(x => x !== cb));
}
export async function addMedicationItem({ label }) {
  const id = nid("mitem");
  store.medicationItems[id] = { label: label || "", order: Date.now() };
  notifyItems();
  return id;
}
export async function addMedication(karte, { name, category, changedBy, eventDate }) {
  const id = nid("drug");
  ensureMeds(karte)[id] = {
    schemaVersion: 1,
    name: name || "",
    category: category || "B",
    sideEffectNote: "",
    expiryEstimate: "",
    events: {},
  };
  await addMedicationEvent(karte, id, {
    date: eventDate || today(),
    type: "add",
    detail: "開始／継続",
    changedBy: changedBy || "",
  });
  return id;
}
export async function updateMedication(karte, drugId, fields) {
  const drug = ensureMeds(karte)[drugId];
  if (!drug) return;
  Object.assign(drug, fields);
  notifyMeds(karte);
}
export async function deleteMedication(karte, drugId) {
  delete ensureMeds(karte)[drugId];
  notifyMeds(karte);
}
export async function addMedicationEvent(karte, drugId, payload) {
  const drug = ensureMeds(karte)[drugId];
  if (!drug) throw new Error("drug missing");
  if (!drug.events) drug.events = {};
  const eid = nid("ev");
  drug.events[eid] = {
    date: payload.date || today(),
    type: payload.type || "add",
    detail: payload.detail || "",
    frequencyChange: payload.frequencyChange || "",
    amountChange: payload.amountChange || "",
    changedBy: payload.changedBy || "",
  };
  if (payload.frequency) drug.events[eid].frequency = payload.frequency;
  notifyMeds(karte);
  return eid;
}
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function fetchMedicationsOnce(karte) {
  return Object.entries(ensureMeds(karte)).map(([id, d]) => ({ id, ...d, events: d.events || {} }));
}
`;

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>med hold status harness</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <div class="right-panel" id="panel-meds" data-panel="meds">
    <div class="exam-toolbar">
      <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    </div>
    <p class="field__note" id="meds-empty"></p>
    <ul class="meds-list" id="meds-list"></ul>
  </div>
</aside>

<div class="modal" id="med-add-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button class="modal__close" id="btn-close-med-add" type="button">&times;</button>
    <div id="med-add-item-buttons" class="exam-item-buttons"></div>
    <p id="med-add-items-empty" hidden></p>
    <input id="med-add-new-item" class="input" type="text" />
    <button id="btn-med-add-new-item" type="button">追加</button>
    <p id="med-add-item-error" hidden></p>
    <div id="med-add-category-buttons"></div>
    <div id="med-add-freq-modes"></div>
    <div id="med-add-freq-panel-preset"><div id="med-add-freq-presets"></div></div>
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
    <div id="med-add-freq-panel-other" hidden>
      <input id="med-add-freq-other-input" type="text" />
    </div>
    <p id="med-add-error" hidden></p>
    <button id="btn-med-add-save" type="button">追加する</button>
    <button id="btn-med-add-cancel" type="button">キャンセル</button>
  </div>
</div>

<div class="modal" id="med-event-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <h2 id="med-event-modal-title"></h2>
    <button id="btn-close-med-event" type="button"></button>
    <div id="med-event-type-buttons" class="exam-item-buttons"></div>
    <input id="med-event-date" type="date" />
    <div id="med-event-change-options" hidden>
      <input id="med-event-freq-check" type="checkbox" />
      <div id="med-event-freq-block" hidden>
        <div id="med-event-freq-modes"></div>
        <div id="med-event-freq-panel-preset"><div id="med-event-freq-presets"></div></div>
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
        <div id="med-event-freq-panel-other" hidden>
          <input id="med-event-freq-other-input" type="text" />
        </div>
      </div>
      <input id="med-event-amount-check" type="checkbox" />
      <div id="med-event-amount-block" hidden>
        <div id="med-event-amount-presets"></div>
        <input id="med-event-amount-other" type="checkbox" />
        <input id="med-event-amount-other-input" type="text" hidden />
      </div>
    </div>
    <textarea id="med-event-detail"></textarea>
    <p id="med-event-error" hidden></p>
    <button id="btn-med-event-save" type="button">保存</button>
    <button id="btn-med-event-cancel" type="button">キャンセル</button>
  </div>
</div>

<script type="module">
import { initMedsUI, enterMeds, leaveMeds, deriveStatus } from "/js/meds-ui.js";
initMedsUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
  getSelectedAuthor: () => "院長",
});
window.__enter = (k) => enterMeds(k);
window.__leave = () => leaveMeds();
window.__deriveStatus = deriveStatus;
window.__ready = true;
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/med-hold-harness.html") {
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

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  executablePath: SYSTEM_CHROME,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/med-hold-harness.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);

// --- unit: deriveStatus ---
const unit = await page.evaluate(() => {
  const d = window.__deriveStatus;
  return [
    ["empty", d({ events: {} }).label, "未設定"],
    ["add", d({ events: { a: { date: "2026-07-01", type: "add" } } }).label, "使用中"],
    ["hold", d({ events: { a: { date: "2026-07-02", type: "hold" } } }).label, "休薬中"],
    [
      "resume-after-hold",
      d({
        events: {
          a: { date: "2026-07-02", type: "hold" },
          b: { date: "2026-07-03", type: "resume" },
        },
      }).label,
      "使用中",
    ],
    [
      "stop-latest",
      d({
        events: {
          a: { date: "2026-07-03", type: "resume" },
          b: { date: "2026-07-04", type: "stop" },
        },
      }).label,
      "中止",
    ],
  ].map(([name, got, want]) => ({ name, ok: got === want, got, want }));
});
console.log("UNIT", unit);
if (unit.some((u) => !u.ok)) throw new Error("deriveStatus unit failed");

await page.evaluate(() => window.__enter("karte-hold"));

// 薬剤追加
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.fill("#med-add-new-item", "プレドニゾロン");
await page.click("#btn-med-add-new-item");
await page.waitForTimeout(100);
await page.click("#btn-med-add-save");
await page.waitForTimeout(150);

async function headerStatus() {
  return page.locator("#meds-list .med-card .med-status").first().innerText();
}

async function addEvent(typeLabel) {
  // 展開
  const card = page.locator("#meds-list .med-card").first();
  if (!(await card.locator(".med-card__detail").count())) {
    await card.locator(".med-card__header").click();
    await page.waitForTimeout(80);
  }
  await card.locator("button", { hasText: "出来事を追加" }).click();
  await page.waitForSelector("#med-event-modal:not([hidden])");
  const types = await page.locator("#med-event-type-buttons .exam-item-btn").allTextContents();
  if (!types.includes("休薬中")) throw new Error(`休薬中 button missing: ${types}`);
  await page.locator("#med-event-type-buttons .exam-item-btn", { hasText: typeLabel }).click();
  await page.click("#btn-med-event-save");
  await page.waitForTimeout(150);
  await page.waitForSelector("#med-event-modal[hidden]", { timeout: 5000 }).catch(() => {});
}

let status = await headerStatus();
console.log("after add:", status);
if (status !== "使用中") throw new Error(`expected 使用中, got ${status}`);

// 詳細に使用状況行がないこと
await page.locator("#meds-list .med-card__header").first().click();
await page.waitForTimeout(80);
const detailText = await page.locator("#meds-list .med-card__detail").innerText();
console.log("DETAIL", detailText.slice(0, 200));
if (detailText.includes("使用状況") || detailText.includes("履歴から自動")) {
  throw new Error("detail should not show duplicate status");
}

await addEvent("休薬中");
status = await headerStatus();
console.log("after hold:", status);
if (status !== "休薬中") throw new Error(`expected 休薬中, got ${status}`);

await addEvent("再開");
status = await headerStatus();
console.log("after resume:", status);
if (status !== "使用中") throw new Error(`expected 使用中 after resume, got ${status}`);

await addEvent("中止");
status = await headerStatus();
console.log("after stop:", status);
if (status !== "中止") throw new Error(`expected 中止, got ${status}`);

// 履歴に休薬中・再開・中止が並ぶこと
const card = page.locator("#meds-list .med-card").first();
if (!(await card.locator(".med-card__detail").count())) {
  await card.locator(".med-card__header").click();
  await page.waitForSelector("#meds-list .med-card__detail", { timeout: 5000 });
}
const hist = await page.locator("#meds-list .med-card__detail").innerText();
console.log("HIST", hist);
for (const label of ["休薬中", "再開", "中止"]) {
  if (!hist.includes(label)) throw new Error(`history missing ${label}`);
}

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}

console.log("OK: med hold status + no detail duplicate");
await browser.close();
server.close();
