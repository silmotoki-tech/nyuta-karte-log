/**
 * 薬剤一覧: 使用状況→カテゴリ順、頓服マーク、期限超過「○日超過」を検証する。
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

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(base, n) {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const T = today();
const overdue3 = addDays(T, -3);
const near2 = addDays(T, 2);

const mockDb = `
const store = { medicationItems: {}, medications: {} };
const medListeners = new Map();
function ensureMeds(k) {
  if (!store.medications[k]) store.medications[k] = {};
  return store.medications[k];
}
function notifyMeds(k) {
  const drugs = Object.entries(ensureMeds(k)).map(([id, d]) => ({ id, ...d, events: d.events || {} }));
  (medListeners.get(k) || []).forEach((cb) => cb(drugs.map((x) => structuredClone(x))));
}
export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" }, { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" }, { id: "eye", label: "点眼薬" },
];
export function normalizeMedicationItemCategory(c) {
  return ["inject","oral","topical","eye"].includes(c) ? c : "oral";
}
export function normalizeMedicationItemKind(k) { return k === "group" ? "group" : "leaf"; }
export function medicationItemCategoryLabel(c) {
  return ({ inject:"注射薬", oral:"内服薬", topical:"外用薬", eye:"点眼薬" })[normalizeMedicationItemCategory(c)] || c;
}
export function subscribeMedicationItems(cb) { cb([]); return () => {}; }
export function subscribeMedications(karte, cb) {
  const list = medListeners.get(karte) || [];
  list.push(cb); medListeners.set(karte, list); notifyMeds(karte);
  return () => medListeners.set(karte, (medListeners.get(karte)||[]).filter((x) => x !== cb));
}
export async function addMedication() { return "x"; }
export async function updateMedication() {}
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

// seed: 意図的にカテゴリ順と異なる登録順で、使用状況5段階を混在
ensureMeds("karte-sort")["d1"] = {
  schemaVersion:1, name:"中止のA薬", category:"A", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"stop", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d2"] = {
  schemaVersion:1, name:"継続のC薬", category:"C", sideEffectNote:"", expiryEstimate:"${near2}",
  events:{ e:{ date:"${T}", type:"add", frequencyChange:"1日1回", frequency:{kind:"preset",label:"1日1回"}, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d3"] = {
  schemaVersion:1, name:"休薬のB薬", category:"B", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"hold", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d4"] = {
  schemaVersion:1, name:"継続のA頓服", category:"A", prn:true, sideEffectNote:"", expiryEstimate:"${overdue3}",
  events:{ e:{ date:"${T}", type:"add", frequencyChange:"1日1回", frequency:{kind:"preset",label:"1日1回"}, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d5"] = {
  schemaVersion:1, name:"継続のB薬", category:"B", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"resume", frequencyChange:"1日2回", frequency:{kind:"preset",label:"1日2回"}, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d6"] = {
  schemaVersion:1, name:"休薬のA薬", category:"A", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"hold", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d7"] = {
  schemaVersion:1, name:"中止のC薬", category:"C", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"stop", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d8"] = {
  schemaVersion:1, name:"一時的のB薬", category:"B", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"temporary", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d9"] = {
  schemaVersion:1, name:"一時的のA薬", category:"A", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"temporary", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d10"] = {
  schemaVersion:1, name:"投与難のC薬", category:"C", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"hard", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d11"] = {
  schemaVersion:1, name:"投与難のA薬", category:"A", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"hard", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
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

export function examItemCategoryLabel() {
  return "";
}

export function normalizeExamItemKind(value) {
  return value;
}

export async function ensureExamItemDefaults() {}

export async function updateExamItem() {}

export async function deleteExamItem() {}

export const EXAM_PLAN_SCHEMA_VERSION = 2;

export async function setNextExamPlan() {}

export async function clearNextExamPlan() {}

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
  <button id="btn-close-med-detail-sheet" type="button"></button>
  <p id="med-detail-sheet-name"></p>
  <p id="med-detail-sheet-status"></p>
  <div id="med-detail-sheet-body"></div>
  <button id="btn-med-detail-sheet-close" type="button"></button>
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
  <p id="med-add-error" hidden></p>
  <button id="btn-med-add-save" type="button"></button>
  <button id="btn-med-add-cancel" type="button"></button>
  <button id="btn-med-add-toggle" type="button" hidden></button>
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
enterMeds("karte-sort");
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

const info = await page.evaluate(() => {
  const nameOf = (el) =>
    el?.getAttribute("aria-label") ||
    (el?.dataset.name || "").replace(/\u200B/g, "") ||
    (el?.textContent || "").replace(/\u200B/g, "");
  const cards = [...document.querySelectorAll("#meds-list .med-card")].map((li) => {
    const header = li.querySelector(".med-card__header");
    const cats = [...header.querySelectorAll(".med-cat")];
    const headerKids = [...(header?.children || [])].map((el) => el.className);
    return {
      name: nameOf(li.querySelector(".med-card__name")),
      status: li.querySelector(".med-status")?.textContent?.trim() || "",
      leftCat: cats.find((c) => c.classList.contains("med-cat--leading"))?.textContent?.trim() || "",
      catCount: cats.length,
      recentDot: Boolean(li.querySelector(".med-sign--recent")),
      prn: Boolean(li.querySelector(".med-sign--prn")),
      expiry: li.querySelector(".med-inline-status")?.textContent?.trim() || "",
      overdueClass: Boolean(li.querySelector(".med-inline-status--overdue")),
      headerKids,
    };
  });
  return cards;
});

console.log("order", info);

const expectedNames = [
  "継続のA頓服",
  "継続のB薬",
  "継続のC薬",
  "一時的のA薬",
  "一時的のB薬",
  "投与難のA薬",
  "投与難のC薬",
  "休薬のA薬",
  "休薬のB薬",
  "中止のA薬",
  "中止のC薬",
];
const gotNames = info.map((x) => x.name);
if (gotNames.join("|") !== expectedNames.join("|")) {
  throw new Error(`sort mismatch\n expected ${expectedNames.join("|")}\n got ${gotNames.join("|")}`);
}

const statuses = info.map((x) => x.status);
if (
  statuses.join("|") !==
  "継続|継続|継続|一時的|一時的|投与難|投与難|休薬中|休薬中|中止|中止"
) {
  throw new Error(`status order wrong: ${statuses.join("|")}`);
}

const cats = info.map((x) => x.leftCat);
if (cats.join("|") !== "A|B|C|A|B|A|C|A|B|A|C") {
  throw new Error(`category order within status wrong: ${cats.join("|")}`);
}
if (info.some((x) => x.recentDot)) {
  throw new Error("blue recent dot should be removed from list");
}
if (info.some((x) => x.catCount !== 1 || !x.leftCat)) {
  throw new Error("category must appear only once on the left: " + JSON.stringify(info.map((x) => [x.leftCat, x.catCount])));
}

const prnCard = info.find((x) => x.name === "継続のA頓服");
if (!prnCard?.prn) throw new Error("prn mark missing on 頓服 drug");
if (!prnCard.overdueClass || prnCard.expiry !== "3日超過") {
  throw new Error(`overdue label wrong: ${JSON.stringify(prnCard)}`);
}
// 左カテゴリ → 名前 → 頓 → 使用状況
const leftIdx = prnCard.headerKids.findIndex((c) => c.includes("med-cat--leading"));
const statusIdx = prnCard.headerKids.findIndex((c) => c.includes("med-status"));
const prnIdx = prnCard.headerKids.findIndex((c) => c.includes("med-sign--prn"));
const trailingCat = prnCard.headerKids.some(
  (c) => c.includes("med-cat") && !c.includes("med-cat--leading")
);
if (trailingCat) throw new Error("right-side category should be removed");
if (!(leftIdx === 0 && prnIdx > leftIdx && prnIdx < statusIdx)) {
  throw new Error(
    `header order wrong (want leftCat→…→prn→status): ${prnCard.headerKids.join(" | ")}`
  );
}

const nearCard = info.find((x) => x.name === "継続のC薬");
if (nearCard?.expiry !== "あと2日") {
  throw new Error(`near label wrong: ${JSON.stringify(nearCard)}`);
}

await page.screenshot({
  path: path.join(root, "tools/med-sort-status-order.png"),
});

await browser.close();
server.close();
console.log("OK: med sort + prn + overdue days");
