/**
 * 使用状況5段階（継続/一時的/投与難/休薬中/中止）の導出・並び・履歴文言を検証する。
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { htmlFragment } from "./html-fragment.js";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const T = new Date().toISOString().slice(0, 10);

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
    } catch {
      /* next */
    }
  }
  return chromium.launch({ channel: "chrome", headless: true, timeout: 30_000 });
}

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-med-hierarchy.js"),
  "utf8"
) + `
const _ensure = (typeof ensureMeds === "function") ? ensureMeds : (k) => {
  if (!globalThis.__medStore) globalThis.__medStore = {};
  globalThis.__medStore[k] ||= {};
  return globalThis.__medStore[k];
};
`;

// Use the same mock as sort-status by inlining a self-contained store
const mockFull = `
const store = { meds: {}, items: {} };
const listeners = { meds: {}, items: new Set() };
function notifyMeds(k) {
  const list = Object.entries(store.meds[k] || {}).map(([id, d]) => ({ id, ...d }));
  (listeners.meds[k] || []).forEach((cb) => cb(list));
}
function ensureMeds(k) { store.meds[k] ||= {}; return store.meds[k]; }
export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" }, { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" }, { id: "eye", label: "点眼薬" },
  { id: "supplement", label: "サプリメント・商品" }, { id: "food", label: "フード" },
];
export function normalizeMedicationItemCategory(c) { return c || "oral"; }
export function normalizeMedicationItemKind(k) { return k === "group" ? "group" : "leaf"; }
export function medicationItemCategoryLabel(c) {
  return MEDICATION_ITEM_CATEGORIES.find((x) => x.id === c)?.label || c || "";
}
export function subscribeMedicationItems(cb) {
  listeners.items.add(cb); cb([]); return () => listeners.items.delete(cb);
}
export function subscribeMedications(karte, cb) {
  listeners.meds[karte] ||= []; listeners.meds[karte].push(cb);
  notifyMeds(karte);
  return () => { listeners.meds[karte] = (listeners.meds[karte]||[]).filter((x)=>x!==cb); };
}
export async function addMedication(karte, fields) {
  const id = "n" + Date.now();
  ensureMeds(karte)[id] = {
    schemaVersion:1, name: fields.name||"", category: fields.category||"A", prn:false,
    sideEffectNote:"", expiryEstimate: fields.expiryEstimate||"",
    events: { e0: { date: fields.eventDate||"${T}", type:"add", detail:"開始／継続",
      frequencyChange: fields.frequencyChange||"", frequency: fields.frequency||null,
      amountChange:"", changedBy: fields.changedBy||"" } }
  };
  notifyMeds(karte); return id;
}
export async function updateMedication(karte, id, fields) {
  Object.assign(ensureMeds(karte)[id] || {}, fields); notifyMeds(karte);
}
export async function deleteMedication(karte, id) { delete ensureMeds(karte)[id]; notifyMeds(karte); }
export async function addMedicationEvent(karte, drugId, fields) {
  const id = "ev" + Date.now() + Math.random().toString(36).slice(2,5);
  const drug = ensureMeds(karte)[drugId]; drug.events ||= {};
  drug.events[id] = { date: fields.date||"${T}", type: fields.type||"add", detail: fields.detail||"",
    frequencyChange: fields.frequencyChange||"", frequency: fields.frequency||null,
    amountChange: fields.amountChange||"", changedBy: fields.changedBy||"" };
  notifyMeds(karte); return id;
}
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function addMedicationItem() { return "x"; }
export async function fetchMedicationsOnce() { return []; }
export async function fetchMedicationItemsOnce() { return []; }

ensureMeds("karte-5")["cA"] = {
  schemaVersion:1, name:"継続A", category:"A",
  events:{ e:{ date:"${T}", type:"add", changedBy:"院長" } }
};
ensureMeds("karte-5")["tB"] = {
  schemaVersion:1, name:"一時的B", category:"B",
  events:{ e:{ date:"${T}", type:"temporary", changedBy:"院長" } }
};
ensureMeds("karte-5")["hC"] = {
  schemaVersion:1, name:"投与難C", category:"C",
  events:{ e:{ date:"${T}", type:"hard", changedBy:"院長" } }
};
ensureMeds("karte-5")["holdA"] = {
  schemaVersion:1, name:"休薬A", category:"A",
  events:{ e:{ date:"${T}", type:"hold", changedBy:"院長" } }
};
ensureMeds("karte-5")["stopB"] = {
  schemaVersion:1, name:"中止B", category:"B",
  events:{ e:{ date:"${T}", type:"stop", changedBy:"院長" } }
};
// 旧「使用中」相当（resume）→ 継続へ移行されること
ensureMeds("karte-5")["legacy"] = {
  schemaVersion:1, name:"旧使用中C", category:"C",
  events:{ e:{ date:"${T}", type:"resume", changedBy:"院長" } }
};

// ==== ここから自動生成: node scripts/check-mock-db-exports.mjs --write ====
// db.js にあってこのモックが定義していない名前を、起動が通る最小限の実装で埋める。
// 挙動が必要になったら、この上でその名前を普通に定義すれば生成対象から外れる。

let __mockSeq = 0;
const __mockNextId = () => "mock" + (__mockSeq += 1);

export const DEFAULT_ADMIN_PASSCODE = "oono";

export async function ensureAdminPasscodeDefault() {}

export async function verifyAdminPasscode(input) {
  return String(input ?? "") === DEFAULT_ADMIN_PASSCODE;
}

export async function getAnimalName() {}

export async function setAnimalName() {}

export async function getOwnerName() {}

export async function setOwnerName() {}

export async function listKarteNameIndex() {}

export async function searchKartesByName() {}

export async function addEntry() {
  return __mockNextId();
}

export async function setEntryImportant() {}

export async function updateEntry() {}

export async function deleteEntry() {}

export function subscribeEntries(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export function sortEntriesDescending(list) {
  return [...(list || [])];
}

export function subscribeTemplates(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addTemplate() {
  return __mockNextId();
}

export async function updateTemplate() {}

export async function deleteTemplate() {}

export const EXAM_ITEM_CATEGORIES = [
  { id: "blood", label: "血液" },
  { id: "imaging", label: "画像" },
  { id: "pathology", label: "病理" },
  { id: "other", label: "その他" },
];

export const EXAM_FASTING = {
  REQUIRED: "required",
  NONE: "none",
};

export function normalizeExamFasting(value) {
  return value;
}

export function examFastingLabel() {
  return "";
}

export function normalizeExamItemCategory(value) {
  return value;
}

export function examItemCategoryLabel() {
  return "";
}

export function normalizeExamItemKind(value) {
  return value;
}

export async function ensureExamItemDefaults() {}

export function subscribeExamItems(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addExamItem() {
  return __mockNextId();
}

export async function updateExamItem() {}

export async function deleteExamItem() {}

export const EXAM_PLAN_SCHEMA_VERSION = 2;

export function subscribeExamPlan(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function saveExamScheduledPlan() {
  return __mockNextId();
}

export async function deleteExamScheduledPlan() {}

export async function endExamScheduledPlan() {}

export async function reviveExamPlanByItem() {
  return __mockNextId();
}

export async function setNextExamPlan() {}

export async function clearNextExamPlan() {}

export async function addExamHistory() {
  return __mockNextId();
}

export async function updateExamHistory() {}

export async function deleteExamHistory() {}

export const MED_ORAL_OTHER_GROUP_ID = "seed-med-oral-other";

export const MED_INJECT_ANTIINFLAM_STEROID_GROUP_ID =
  "seed-med-inject-antiinflam-steroid";

export const MED_INJECT_ANTIBIOTIC_GROUP_ID = "seed-med-inject-antibiotic";

export const MED_INJECT_GI_GROUP_ID = "seed-med-inject-gi";

export const MED_INJECT_NEURO_GROUP_ID = "seed-med-inject-neuro";

export const MED_INJECT_ANTICANCER_GROUP_ID = "seed-med-inject-anticancer";

export const MED_INJECT_CARDIO_RESP_GROUP_ID = "seed-med-inject-cardio-resp";

export const MED_INJECT_SUPPOSITORY_GROUP_ID = "seed-med-inject-suppository";

export const MED_INJECT_OTHER_GROUP_ID = "seed-med-inject-other";

export const MED_ORAL_ANTIBIOTIC_GROUP_ID = "seed-med-oral-antibiotic";

export const MED_ORAL_ANTIINFLAM_GROUP_ID = "seed-med-oral-antiinflam";

export const MED_ORAL_STEROID_ANTIHIST_GROUP_ID = "seed-med-oral-steroid-antihist";

export const MED_ORAL_GI_STOMACH_GROUP_ID = "seed-med-oral-gi-stomach";

export const MED_ORAL_GI_INTESTINE_GROUP_ID = "seed-med-oral-gi-intestine";

export const MED_ORAL_LIVER_GROUP_ID = "seed-med-oral-liver";

export const MED_ORAL_URINARY_GROUP_ID = "seed-med-oral-urinary";

export const MED_ORAL_LIVER_KIDNEY_GROUP_ID = "seed-med-oral-liver-kidney";

export const MED_ORAL_CARDIO_GROUP_ID = "seed-med-oral-cardio";

export const MED_ORAL_RESPIRATORY_GROUP_ID = "seed-med-oral-respiratory";

export const MED_ORAL_NEURO_GROUP_ID = "seed-med-oral-neuro";

export const MED_ORAL_ANTIFUNGAL_GROUP_ID = "seed-med-oral-antifungal";

export const MED_ORAL_ANTICANCER_GROUP_ID = "seed-med-oral-anticancer";

export const MED_ORAL_IMMUNO_GROUP_ID = "seed-med-oral-immuno";

export const MED_ORAL_VITAMIN_GROUP_ID = "seed-med-oral-vitamin";

export const MED_ORAL_HORMONE_GROUP_ID = "seed-med-oral-hormone";

export const MED_ORAL_KAMPO_GROUP_ID = "seed-med-oral-kampo";

export const MED_ORAL_BLOOD_GROUP_ID = "seed-med-oral-blood";

export const MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID = "seed-med-topical-skin-steroid-abx";

export const MED_TOPICAL_SKIN_OTHER_GROUP_ID = "seed-med-topical-skin-other";

export const MED_TOPICAL_EAR_GROUP_ID = "seed-med-topical-ear";

export const MED_TOPICAL_SKIN_GROUP_ID = "seed-med-topical-skin";

export const MED_TOPICAL_DISINFECT_GROUP_ID = "seed-med-topical-disinfect";

export const MED_TOPICAL_SHAMPOO_GROUP_ID = "seed-med-topical-shampoo";

export const MED_SUPPL_JOINT_GROUP_ID = "seed-med-suppl-joint";

export const MED_SUPPL_ORAL_GROUP_ID = "seed-med-suppl-oral";

export const MED_SUPPL_GI_GROUP_ID = "seed-med-suppl-gi";

export const MED_SUPPL_KIDNEY_GROUP_ID = "seed-med-suppl-kidney";

export const MED_SUPPL_URINARY_GROUP_ID = "seed-med-suppl-urinary";

export const MED_SUPPL_NEURO_GROUP_ID = "seed-med-suppl-neuro";

export const MED_SUPPL_SKIN_GROUP_ID = "seed-med-suppl-skin";

export const MED_SUPPL_OTHER_GROUP_ID = "seed-med-suppl-other";

export const MED_FOOD_HILLS_GROUP_ID = "seed-med-food-hills";

export const MED_FOOD_DOCTORS_GROUP_ID = "seed-med-food-doctors";

export const MED_FOOD_DIETIX_GROUP_ID = "seed-med-food-dietix";

export const MED_FOOD_FARMINA_GROUP_ID = "seed-med-food-farmina";

export const MED_FOOD_PURINA_GROUP_ID = "seed-med-food-purina";

export const MED_FOOD_ROYAL_CANIN_GROUP_ID = "seed-med-food-royal-canin";

export const MED_FOOD_OTHER_GROUP_ID = "seed-med-food-other";

export async function ensureMedicationItemDefaults() {}

export async function fetchExamItemsOnce() {
  return [];
}

export async function updateMedicationItem() {}

export async function deleteMedicationItem() {}

export const MEDICATION_SCHEMA_VERSION = 1;

export function normalizeHistoryMasterKind(value) {
  return value;
}

export async function ensureHistoryDiseaseItemDefaults() {}

export async function ensureHistorySurgeryItemDefaults() {}

export async function ensureHistoryReferralItemDefaults() {}

export async function deleteHistoryDiseaseItem() {}

export async function deleteHistorySurgeryItem() {}

export async function deleteHistoryReferralItem() {}

export function subscribeHistoryDiseaseItems(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export function subscribeHistorySurgeryItems(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export function subscribeHistoryReferralItems(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addHistoryDiseaseItem() {
  return __mockNextId();
}

export async function addHistorySurgeryItem() {
  return __mockNextId();
}

export async function addHistoryReferralItem() {
  return __mockNextId();
}

export const PATIENT_HISTORY_SCHEMA_VERSION = 1;

export function subscribePatientHistory(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addPatientHistoryEntry() {
  return __mockNextId();
}

export async function updatePatientHistoryEntry() {}

export async function setPatientHistoryStatus() {}

export async function appendPatientHistoryNote() {}

export async function deletePatientHistoryNote() {}

export async function deletePatientHistoryEntry() {}

export const FREE_QA_SCHEMA_VERSION = 1;

export function subscribeFreeQA(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addFreeQA() {
  return __mockNextId();
}

export async function updateFreeQAAnswer() {}

export async function deleteFreeQA() {}

export const PROCEDURE_SCHEMA_VERSION = 2;

export function subscribeProcedureBundle(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export function subscribeProcedures(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function saveProcedurePlan() {
  return __mockNextId();
}

export async function deleteProcedurePlan() {}

export async function reviveProcedurePlan() {
  return __mockNextId();
}

export async function completeProcedurePlan() {}

export async function addProcedure() {
  return __mockNextId();
}

export async function updateProcedure() {}

export async function deleteProcedure() {}

export const SPECIAL_NOTE_SCHEMA_VERSION = 1;

export const SPECIAL_NOTE_IMPORTANCE = ["high", "medium", "low"];

export function subscribeSpecialNotes(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addSpecialNote() {
  return __mockNextId();
}

export async function updateSpecialNote() {}

export async function deleteSpecialNote() {}

export const MIGRATION_PROGRESS_SCHEMA_VERSION = 1;

export const MIGRATION_PROGRESS_STATUSES = [
  "not_started",
  "in_progress",
  "done",
];

export function normalizeMigrationProgressStatus(value) {
  return value;
}

export function normalizeMigrationProgress(value) {
  return value;
}

export function subscribeMigrationProgress(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function saveMigrationProgress() {
  return __mockNextId();
}

// ==== 自動生成ここまで ====
`;

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head>
<body style="margin:0;background:var(--color-cream)">
<aside style="width:100%;max-width:420px;margin:0 auto;min-height:100vh;background:var(--color-cream);padding:8px">
  <div id="panel-meds">
    <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    <p id="meds-empty"></p>
    <ul class="meds-list" id="meds-list"></ul>
  </div>
</aside>
<div class="modal" id="med-detail-sheet" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 id="med-detail-sheet-name"></h2>
      <p id="med-detail-sheet-status"></p>
      <button id="btn-close-med-detail-sheet" type="button">×</button>
    </div>
    <div class="modal__body" id="med-detail-sheet-body"></div>
    <div class="modal__footer">
      <button id="btn-med-detail-sheet-close" type="button">閉じる</button>
    </div>
  </div>
</div>
<div class="modal" id="med-add-modal" hidden>
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
  <div id="med-add-freq-every-n-numpad"></div>
  <div id="med-add-freq-weekly-numpad"></div>
  <div id="med-add-freq-weekdays"></div>
  <input id="med-add-freq-other" />
  <div id="med-add-dose-modes"></div>
  <div id="med-add-dose-presets"></div>
  <input id="med-add-dose-other" />
  <input id="med-add-start-date" type="date" />
  <input id="med-add-expiry" type="date" />
  <textarea id="med-add-note"></textarea>
  <p id="med-add-error" hidden></p>
  <button id="btn-med-add-save" type="button"></button>
  <button id="btn-med-add-cancel" type="button"></button>
  <button id="btn-close-med-add" type="button"></button>
</div>
${htmlFragment("med-event-modal")}
<script type="module">
import { initMedsUI, enterMeds, deriveStatus } from "/js/meds-ui.js";
window.__deriveStatus = deriveStatus;
initMedsUI({
  showToast: () => {},
  showError: () => {},
  setBusy: (b, busy, _, idle) => { if (b) { b.disabled = !!busy; b.textContent = busy ? "…" : idle; } },
  getSelectedAuthor: () => "院長",
});
enterMeds("karte-5");
window.__ready = true;
</script>
</body></html>
`;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/" || rel === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(harness);
        return;
      }
      if (rel === "/js/db.js") {
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(mockFull);
        return;
      }
      if (rel === "/service-worker.js") {
        res.writeHead(200, { "Content-Type": "text/javascript" });
        res.end("");
        return;
      }
      const fp = path.join(root, rel.replace(/^\//, ""));
      if (!fp.startsWith(root) || !fs.existsSync(fp)) {
        res.writeHead(404);
        res.end("nf");
        return;
      }
      const ct = rel.endsWith(".css")
        ? "text/css"
        : rel.endsWith(".js")
          ? "text/javascript"
          : "text/html";
      res.writeHead(200, { "Content-Type": ct });
      res.end(fs.readFileSync(fp));
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

const { server, base } = await startServer();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on("pageerror", (e) => {
  errors.push(String(e));
  console.log("PAGEERROR", String(e));
});

try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);

  const unit = await page.evaluate(() => {
    const d = window.__deriveStatus;
    return [
      ["add→継続", d({ events: { a: { date: "2026-08-01", type: "add" } } }), "continue", "継続"],
      ["temporary", d({ events: { a: { date: "2026-08-01", type: "temporary" } } }), "temporary", "一時的"],
      ["hard", d({ events: { a: { date: "2026-08-01", type: "hard" } } }), "hard", "投与難"],
      ["hold", d({ events: { a: { date: "2026-08-01", type: "hold" } } }), "hold", "休薬中"],
      ["stop", d({ events: { a: { date: "2026-08-01", type: "stop" } } }), "stopped", "中止"],
      ["resume→継続", d({ events: { a: { date: "2026-08-01", type: "resume" } } }), "continue", "継続"],
    ].map(([name, got, id, label]) => ({
      name,
      ok: got.id === id && got.label === label,
      got,
      want: { id, label },
    }));
  });
  console.log("UNIT", unit);
  assert.ok(unit.every((u) => u.ok), "deriveStatus unit failed");

  await page.waitForTimeout(120);
  const list = await page.evaluate(() =>
    [...document.querySelectorAll("#meds-list .med-card")].map((li) => ({
      name: li.querySelector(".med-card__name")?.dataset.name || "",
      status: li.querySelector(".med-status")?.textContent?.trim(),
      cls: li.querySelector(".med-status")?.className || "",
    }))
  );
  console.log("LIST", list);
  assert.deepEqual(
    list.map((x) => x.status),
    ["継続", "継続", "一時的", "投与難", "休薬中", "中止"]
  );
  assert.deepEqual(
    list.map((x) => x.name),
    ["継続A", "旧使用中C", "一時的B", "投与難C", "休薬A", "中止B"]
  );
  assert.ok(list[0].cls.includes("med-status--continue"));
  assert.ok(list[2].cls.includes("med-status--temporary"));
  assert.ok(list[3].cls.includes("med-status--hard"));

  const shotList = path.join(root, "tools/med-status-5way-list.png");
  await page.screenshot({ path: shotList, fullPage: true });
  console.log("screenshot:", shotList);

  // 詳細: 出来事ボタンに一時的・投与難があること
  await page.locator('#meds-list .med-card:has(.med-card__name[data-name="継続A"])').click();
  await page.waitForSelector("#med-detail-sheet:not([hidden])");
  const quickLabels = await page
    .locator("#med-detail-sheet-body .med-event-quick__btn")
    .allTextContents();
  console.log("QUICK", quickLabels);
  for (const need of ["継続", "一時的", "投与難", "休薬中", "中止"]) {
    assert.ok(quickLabels.includes(need), `missing quick btn ${need}`);
  }
  const shotBtns = path.join(root, "tools/med-status-5way-event-buttons.png");
  await page.screenshot({ path: shotBtns, fullPage: true });

  // 一時的を記録
  await page.locator(".med-event-quick__btn", { hasText: "一時的" }).click();
  await page.waitForSelector("#med-event-modal:not([hidden])");
  await page.click("#btn-med-event-save");
  await page.waitForTimeout(200);
  let status = await page.locator('#meds-list .med-card:has(.med-card__name[data-name="継続A"])')
    .locator(".med-status")
    .textContent();
  assert.equal(status?.trim(), "一時的");

  // 投与難を記録
  await page.locator(".med-event-quick__btn", { hasText: "投与難" }).click();
  await page.waitForSelector("#med-event-modal:not([hidden])");
  await page.click("#btn-med-event-save");
  await page.waitForTimeout(200);
  status = await page.locator('#meds-list .med-card:has(.med-card__name[data-name="継続A"])')
    .locator(".med-status")
    .textContent();
  assert.equal(status?.trim(), "投与難");

  const hist = await page.locator("#med-detail-sheet-body").innerText();
  assert.ok(hist.includes("一時的にした"), "history missing 一時的にした");
  assert.ok(hist.includes("投与難になった"), "history missing 投与難になった");
  const shotHist = path.join(root, "tools/med-status-5way-history.png");
  await page.screenshot({ path: shotHist, fullPage: true });
  console.log("screenshot:", shotHist);

  assert.equal(errors.length, 0, "page errors: " + errors.join(" | "));
  console.log("PASS");
} finally {
  await browser.close();
  server.close();
}
