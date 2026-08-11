/**
 * 薬剤一覧: タップで詳細ポップアップが開き、編集できることを検証する。
 */
import { chromium } from "playwright";
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
function listItems() {
  return Object.entries(store.medicationItems).map(([id, t]) => ({ id, ...t }));
}
function notifyItems() {
  itemListeners.forEach((cb) => cb(listItems().map((x) => ({ ...x }))));
}
function notifyMeds(k) {
  const drugs = Object.entries(ensureMeds(k)).map(([id, d]) => ({
    id, ...d, events: d.events || {},
  }));
  (medListeners.get(k) || []).forEach((cb) => cb(drugs.map((x) => structuredClone(x))));
}

export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" },
  { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" },
  { id: "eye", label: "点眼薬" },
];
export function normalizeMedicationItemCategory(c) {
  return ["inject","oral","topical","eye"].includes(c) ? c : "oral";
}
export function normalizeMedicationItemKind(k) {
  return k === "group" ? "group" : "leaf";
}
export function medicationItemCategoryLabel(c) {
  return ({ inject:"注射薬", oral:"内服薬", topical:"外用薬", eye:"点眼薬" })[normalizeMedicationItemCategory(c)] || c;
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
  return () => medListeners.set(karte, (medListeners.get(karte)||[]).filter((x) => x !== cb));
}
export async function addMedicationItem({ label, category, kind, parentId }) {
  const id = nid("mi");
  store.medicationItems[id] = {
    label: label || "", category: category || "oral", kind: kind || "leaf",
    parentId: parentId || "", order: Date.now(),
  };
  notifyItems();
  return id;
}
export async function addMedication(karte, { name, category }) {
  const id = nid("drug");
  ensureMeds(karte)[id] = {
    schemaVersion: 1,
    name: name || "",
    category: category || "B",
    sideEffectNote: "",
    expiryEstimate: "2099-01-01",
    events: {
      [nid("ev")]: {
        date: "2026-07-01", type: "add", detail: "開始",
        frequencyChange: "1日1回", frequency: null, amountChange: "",
        changedBy: "院長",
      },
    },
  };
  notifyMeds(karte);
  return id;
}
export async function updateMedication(karte, drugId, fields) {
  const row = ensureMeds(karte)[drugId];
  if (!row) throw new Error("missing drug");
  Object.assign(row, fields);
  notifyMeds(karte);
}
export async function deleteMedication(karte, drugId) {
  delete ensureMeds(karte)[drugId];
  notifyMeds(karte);
}
export async function addMedicationEvent(karte, drugId, payload) {
  const id = nid("ev");
  const row = ensureMeds(karte)[drugId];
  if (!row.events) row.events = {};
  row.events[id] = { ...payload };
  notifyMeds(karte);
  return id;
}
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent(karte, drugId, eventId) {
  const row = ensureMeds(karte)[drugId];
  if (row?.events) delete row.events[eventId];
  notifyMeds(karte);
}
export async function fetchMedicationsOnce(karte) {
  return Object.entries(ensureMeds(karte)).map(([id, d]) => ({ id, ...d }));
}

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

export async function deleteExamHistory() {}

export const MED_ORAL_OTHER_GROUP_ID = "seed-med-oral-other";

export const MED_INJECT_ANTIINFLAM_STEROID_GROUP_ID =
  "seed-med-inject-antiinflam-steroid";

export const MED_INJECT_ANTIBIOTIC_GROUP_ID = "seed-med-inject-antibiotic";

export const MED_INJECT_GI_GROUP_ID = "seed-med-inject-gi";

export const MED_INJECT_NEURO_GROUP_ID = "seed-med-inject-neuro";

export const MED_INJECT_ANTICANCER_GROUP_ID = "seed-med-inject-anticancer";

export const MED_INJECT_CARDIO_RESP_GROUP_ID = "seed-med-inject-cardio-resp";

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

export async function fetchMedicationItemsOnce() {
  return [];
}

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
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>med detail sheet harness</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside class="right-column" style="width:100%;max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <div id="right-tabs" class="right-tabs">
    <button type="button" class="right-tab is-active" data-tab="meds">薬剤情報</button>
  </div>
  <p id="right-empty" hidden></p>
  <div class="right-panel" id="panel-meds" data-panel="meds">
    <div class="exam-toolbar">
      <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    </div>
    <section class="exam-section">
      <h3 class="exam-section__title">薬剤一覧</h3>
      <p class="field__note" id="meds-empty">登録された薬剤はありません。</p>
      <ul class="meds-list" id="meds-list" spellcheck="false" lang="ja" translate="no"></ul>
    </section>
  </div>
</aside>

<div class="modal" id="med-detail-sheet" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="med-detail-sheet-title">
    <div class="modal__header">
      <h2 class="modal__title" id="med-detail-sheet-title">薬剤の詳細</h2>
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
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="med-add-modal-title">薬剤を追加</h2>
      <button class="modal__close" id="btn-close-med-add" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <div class="med-linear-picker" id="med-add-linear-picker">
          <div class="med-linear-picker__col" id="med-add-col-category">
            <div class="med-linear-picker__list" id="med-add-col-category-list"></div>
          </div>
          <div class="med-linear-picker__col" id="med-add-col-group" hidden>
            <div class="med-linear-picker__list" id="med-add-col-group-list"></div>
          </div>
          <div class="med-linear-picker__col" id="med-add-col-leaf" hidden>
            <div class="med-linear-picker__list" id="med-add-col-leaf-list"></div>
            <p class="field__note" id="med-add-items-empty" hidden></p>
            <div class="exam-item-add" id="med-add-item-add">
              <label class="label label--sub" id="med-add-new-item-label" for="med-add-new-item">新しい薬剤</label>
              <div class="exam-item-add__row">
                <input id="med-add-new-item" class="input" type="text" />
                <button id="btn-med-add-new-item" class="btn btn--small btn--outline" type="button">追加</button>
              </div>
              <p id="med-add-item-error" class="error-text" hidden></p>
            </div>
          </div>
        </div>
      </div>
      <div class="field">
        <span class="label">重要度</span>
        <div class="med-category-buttons" id="med-add-category-buttons"></div>
      </div>
      <div class="field">
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
          <input id="med-add-freq-other-input" class="input" type="text" />
        </div>
      </div>
      <p id="med-add-error" class="error-text" hidden></p>
      <button id="btn-med-add-save" class="btn btn--small btn--primary" type="button">追加する</button>
      <button id="btn-med-add-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<div class="modal" id="med-event-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="med-event-modal-title">出来事</h2>
      <button class="modal__close" id="btn-close-med-event" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div id="med-event-type-buttons" class="exam-item-buttons"></div>
      <input id="med-event-date" class="input" type="date" />
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
      <textarea id="med-event-detail" class="textarea"></textarea>
      <p id="med-event-error" class="error-text" hidden></p>
      <button id="btn-med-event-save" class="btn btn--small btn--primary" type="button">保存する</button>
      <button id="btn-med-event-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
import { addMedication } from "/js/db.js";
initMedsUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
  getSelectedAuthor: () => "院長",
});
await addMedication("karte-a", { name: "アモキシシリン", category: "B" });
await addMedication("karte-a", { name: "アラバ", category: "A" });
enterMeds("karte-a");
window.__ready = true;
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/med-detail-sheet-harness.html") {
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
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/med-detail-sheet-harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(400);

// 一覧はフラット（詳細DOMがリスト内に無い）
const detailInList = await page.locator("#meds-list .med-sheet__detail, #meds-list .med-card__detail").count();
if (detailInList !== 0) throw new Error("list should stay compact without detail");

await page.screenshot({
  path: path.join(root, "tools/med-detail-sheet-list.png"),
});

// タップでシートを開く（canvas 名なので data-name 経由でカード特定）
await page
  .locator('.med-card__name[data-name="アモキシシリン"]')
  .locator("xpath=ancestor::li[contains(@class,'med-card')]")
  .click();
await page.waitForSelector("#med-detail-sheet:not([hidden])");
await page.waitForTimeout(200);

const sheetName = await page.locator("#med-detail-sheet-name").textContent();
if (sheetName?.trim() !== "アモキシシリン") {
  throw new Error(`sheet name mismatch: ${sheetName}`);
}
const sheetBody = page.locator("#med-detail-sheet-body .med-sheet__detail");
await sheetBody.waitFor();
if (!(await sheetBody.locator("text=重要度").count())) {
  throw new Error("importance section missing");
}
if (!(await sheetBody.locator("text=メモ").count())) {
  throw new Error("memo section missing");
}
if (!(await sheetBody.locator("text=期限").count())) {
  throw new Error("expiry section missing");
}
if (!(await sheetBody.locator("text=開始日").count())) {
  throw new Error("start date section missing");
}
if (await sheetBody.locator("text=副作用・問題メモ").count()) {
  throw new Error("old memo label remains");
}
if (await sheetBody.locator("text=効果／処方の目安期限").count()) {
  throw new Error("old expiry label remains");
}
if (!(await sheetBody.locator("text=出来事を記録").count())) {
  throw new Error("event quick section missing");
}
const quickLabels = await sheetBody
  .locator(".med-event-quick__btn")
  .allTextContents();
if (
  JSON.stringify(quickLabels) !==
  JSON.stringify(["継続", "増量", "減量", "中止", "再開", "休薬中"])
) {
  throw new Error("event quick buttons mismatch: " + quickLabels.join(","));
}
if (!(await sheetBody.locator("text=出来事の履歴").count())) {
  throw new Error("history section missing");
}
if (!(await sheetBody.locator("text=開始").count())) {
  throw new Error("event history missing");
}

// 重要度を A に変更
await sheetBody.locator(".med-cat-btn", { hasText: /^A（/ }).click();
await page.waitForTimeout(200);
const selectedA = await sheetBody
  .locator(".med-cat-btn.is-selected")
  .textContent();
if (!selectedA?.trim().startsWith("A")) throw new Error("category A not selected");
if (!(await sheetBody.locator(".med-cat-btn", { hasText: "C（過去に使用）" }).count())) {
  throw new Error("C label not updated");
}

// メモ保存
await sheetBody.locator("textarea").fill("胃腸障害に注意");
await sheetBody.locator("button", { hasText: "メモを保存" }).click();
await page.waitForTimeout(200);

await page.screenshot({
  path: path.join(root, "tools/med-detail-sheet-open.png"),
  fullPage: true,
});

// 閉じる → 一覧に戻る（シート内に詳細、リスト内には無い）
await page.click("#btn-med-detail-sheet-close");
await page.waitForSelector("#med-detail-sheet[hidden]", { state: "attached" });
const sheetHidden = await page.locator("#med-detail-sheet").isHidden();
if (!sheetHidden) throw new Error("sheet should be closed");
const stillInList = await page.locator("#meds-list .med-sheet__detail").count();
if (stillInList !== 0) throw new Error("detail leaked into list after close");

// バッジが A になっていること
const badge = await page.evaluate(() => {
  const nameEl = document.querySelector(
    '.med-card__name[data-name="アモキシシリン"]'
  );
  const card = nameEl?.closest(".med-card");
  return card?.querySelector(".med-cat")?.textContent || "";
});
if (badge !== "A") throw new Error(`list badge should be A, got ${badge}`);

await page.screenshot({
  path: path.join(root, "tools/med-detail-sheet-closed.png"),
});

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: med detail sheet open/edit/close");
await browser.close();
server.close();
