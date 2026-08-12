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
  try {
    return await chromium.launch({ channel: "chrome", headless: true, timeout: 30_000 });
  } catch (err) {
    console.warn("launch failed (channel chrome):", err.message);
  }
  throw new Error("Could not launch Chromium");
}

const mockDb = `
const store = { examItems: {}, examPlan: {} };
const itemListeners = [];
const planListeners = new Map();
let seq = 0;
const nid = (p) => p + (++seq);

function emptyPlan() { return { schemaVersion: 2, plans: {}, history: {} }; }
function ensurePlan(k) {
  if (!store.examPlan[k]) store.examPlan[k] = emptyPlan();
  return store.examPlan[k];
}
function notifyItems() {
  const items = Object.entries(store.examItems).map(([id, t]) => ({ id, ...t }));
  items.sort((a,b) => (a.label||"").localeCompare(b.label||""));
  itemListeners.forEach((cb) => cb(items.map(x => ({...x}))));
}
function notifyPlan(k) {
  (planListeners.get(k) || []).forEach((cb) => cb(structuredClone(ensurePlan(k))));
}

export function subscribeExamItems(cb) {
  itemListeners.push(cb);
  notifyItems();
  return () => { const i = itemListeners.indexOf(cb); if (i>=0) itemListeners.splice(i,1); };
}
export function subscribeExamPlan(karte, cb) {
  const list = planListeners.get(karte) || [];
  list.push(cb);
  planListeners.set(karte, list);
  cb(structuredClone(ensurePlan(karte)));
  return () => planListeners.set(karte, (planListeners.get(karte)||[]).filter(x => x !== cb));
}
export const EXAM_ITEM_CATEGORIES = [
  { id: "blood", label: "血液" },
  { id: "imaging", label: "画像" },
  { id: "pathology", label: "病理" },
  { id: "other", label: "その他" },
];
const CATEGORY_IDS = new Set(EXAM_ITEM_CATEGORIES.map((c) => c.id));
export function normalizeExamItemCategory(category) {
  const id = String(category || "").trim();
  return CATEGORY_IDS.has(id) ? id : "other";
}
export function normalizeExamFasting(value) {
  const v = String(value || "").trim();
  return v === "required" || v === "none" ? v : "";
}
export function examFastingLabel(value) {
  const v = normalizeExamFasting(value);
  if (v === "required") return "必要";
  if (v === "none") return "不要";
  return "";
}
export async function addExamItem({ label, category = "other", kind = "leaf", parentId = "", order }) {
  const id = nid("item");
  store.examItems[id] = {
    label: label || "",
    category: normalizeExamItemCategory(category),
    kind: kind === "group" ? "group" : "leaf",
    parentId: kind === "group" ? "" : String(parentId || "").trim(),
    order: typeof order === "number" ? order : Date.now(),
  };
  notifyItems();
  return id;
}
export async function saveExamScheduledPlan(karte, { planId=null, item, dueDate, note, baselineDate }) {
  const plan = ensurePlan(karte);
  let id = planId;
  if (!id) {
    const found = Object.entries(plan.plans).find(([,p]) => (p.item||"").trim() === (item||"").trim());
    id = found ? found[0] : nid("plan");
  }
  const date = dueDate || "";
  plan.plans[id] = { item: item||"", dueDate: date, baselineDate: baselineDate||date, note: note||"" };
  notifyPlan(karte);
  return id;
}
export async function deleteExamScheduledPlan(karte, planId) { delete ensurePlan(karte).plans[planId]; notifyPlan(karte); }
export async function endExamScheduledPlan(karte, planId) { return deleteExamScheduledPlan(karte, planId); }
export async function reviveExamPlanByItem(karte, { item, note="" }) {
  return saveExamScheduledPlan(karte, { item, dueDate: "", note, baselineDate: "2026-07-22" });
}
export async function addExamHistory(karte, { item, date, note }) {
  const id = nid("hist");
  ensurePlan(karte).history[id] = { item, date, note: note||"" };
  notifyPlan(karte);
  return id;
}
export const EXAM_PLAN_SCHEMA_VERSION = 2;

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

export const EXAM_FASTING = {
  REQUIRED: "required",
  NONE: "none",
};

export function examItemCategoryLabel() {
  return "";
}

export function normalizeExamItemKind(value) {
  return value;
}

export async function ensureExamItemDefaults() {}

export async function updateExamItem() {}

export async function deleteExamItem() {}

export async function setNextExamPlan() {}

export async function clearNextExamPlan() {}

export async function deleteExamHistory() {}

export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" },
  { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" },
  { id: "eye", label: "点眼薬" },
  { id: "supplement", label: "サプリメント・商品" },
  { id: "food", label: "フード" },
];

export const MED_ORAL_OTHER_GROUP_ID = "seed-med-oral-other";

export function normalizeMedicationItemCategory(value) {
  return value;
}

export function normalizeMedicationItemKind(value) {
  return value;
}

export function medicationItemCategoryLabel() {
  return "";
}

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

export function subscribeMedicationItems(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function fetchMedicationItemsOnce() {
  return [];
}

export async function fetchExamItemsOnce() {
  return [];
}

export async function addMedicationItem() {
  return __mockNextId();
}

export async function updateMedicationItem() {}

export async function deleteMedicationItem() {}

export const MEDICATION_SCHEMA_VERSION = 1;

export function subscribeMedications(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function fetchMedicationsOnce() {
  return [];
}

export async function addMedication() {
  return __mockNextId();
}

export async function updateMedication() {}

export async function deleteMedication() {}

export async function addMedicationEvent() {
  return __mockNextId();
}

export async function updateMedicationEvent() {}

export async function deleteMedicationEvent() {}

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
  <title>exam item master harness</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside class="right-column" style="width:100%;max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <div id="right-tabs" class="right-tabs">
    <button type="button" class="right-tab is-active" data-tab="exam">検査予定</button>
  </div>
  <p id="right-empty" class="field__note" hidden></p>
  <div class="right-panel" id="panel-exam" data-panel="exam">
    <section class="exam-section">
      <div class="exam-section__head"><h3 class="exam-section__title">検査予定一覧</h3></div>
      <div class="exam-register-actions">
        <button id="btn-exam-new" class="btn btn--small btn--primary" type="button">予定を登録</button>
      </div>
      <p class="field__note" id="exam-plan-empty">登録された検査予定はありません。</p>
      <ul class="exam-list" id="exam-plan-list"></ul>
    </section>
    <section class="exam-section">
      <h3 class="exam-section__title">実施履歴</h3>
      <p class="field__note" id="exam-history-empty">まだ実施履歴がありません。</p>
      <ul class="exam-list" id="exam-history-list"></ul>
    </section>
  </div>
</aside>

<div class="modal" id="exam-item-sheet" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="exam-item-sheet-title">検査予定</h2>
      <button class="modal__close" id="btn-close-exam-item-sheet" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <p class="exam-sheet__item" id="exam-item-sheet-item"></p>
      <input id="exam-sheet-due-date" class="input" type="date" />
      <div id="exam-sheet-due-units"></div>
      <p id="exam-sheet-due-display"></p>
      <div id="exam-sheet-due-numpad"></div>
      <p id="exam-sheet-window-note"></p>
      <input id="exam-sheet-note" class="input" type="text" />
      <p id="exam-sheet-error" class="error-text" hidden></p>
      <button id="btn-exam-sheet-save" type="button">保存する</button>
      <button id="btn-exam-sheet-complete" type="button">完了</button>
      <button id="btn-exam-sheet-end" type="button">終了</button>
    </div>
  </div>
</div>

<div class="modal" id="exam-plan-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="exam-plan-modal-title">予定を登録</h2>
      <button class="modal__close" id="btn-close-exam-plan" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <span class="label">検査項目</span>
        <div class="med-linear-picker" id="exam-plan-linear-picker" aria-label="検査項目の階層選択">
          <div class="med-linear-picker__col" id="exam-plan-col-category">
            <div class="med-linear-picker__head">大項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-category-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col" id="exam-plan-col-group" hidden>
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-group-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="exam-plan-col-leaf" hidden>
            <div class="med-linear-picker__head">
              <span class="med-linear-picker__head-label" id="exam-plan-col-leaf-head-label">検査項目</span>
              <button type="button" class="exam-item-add__toggle" id="btn-exam-plan-add-toggle" hidden>＋</button>
            </div>
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list" role="listbox"></div>
            <p class="field__note med-linear-picker__empty" id="exam-plan-items-empty" hidden></p>
            <div class="exam-item-add" id="exam-plan-item-add-default" hidden>
              <label class="label label--sub" for="exam-plan-new-item" id="exam-plan-new-item-label">新しい項目を追加</label>
              <div class="exam-item-add__row">
                <input id="exam-plan-new-item" class="input" type="text" placeholder="例）血液検査" />
                <button id="btn-exam-plan-add-item" class="btn btn--small btn--outline" type="button">追加</button>
              </div>
            </div>
          </div>
        </div>
        <p class="field__note exam-plan-selection-summary" id="exam-plan-selection-summary" hidden></p>
        <p id="exam-plan-item-error" class="error-text" role="alert" hidden></p>
      </div>
      <div class="field">
        <label class="label" for="exam-plan-due-date">予定日</label>
        <input id="exam-plan-due-date" class="input input--date" type="date" />
        <div id="exam-plan-due-units"></div>
        <p id="exam-plan-due-display"></p>
        <div id="exam-plan-due-numpad"></div>
        <p id="exam-plan-window-note"></p>
      </div>
      <input id="exam-plan-note" class="input" type="text" />
      <p id="exam-plan-error" class="error-text" hidden></p>
      <button id="btn-exam-plan-save" class="btn btn--small btn--primary" type="button">保存する</button>
      <button id="btn-exam-plan-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<div class="modal" id="exam-complete-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button id="btn-close-exam-complete" type="button"></button>
    <input id="exam-complete-date" type="date" />
    <input id="exam-complete-note" type="text" />
    <p id="exam-complete-error" hidden></p>
    <button id="btn-exam-complete-save" type="button"></button>
    <button id="btn-exam-complete-cancel" type="button"></button>
  </div>
</div>
<div class="modal" id="exam-after-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button id="btn-close-exam-after" type="button"></button>
    <p id="exam-after-summary" hidden></p>
    <button id="btn-exam-after-next" type="button"></button>
    <button id="btn-exam-after-end" type="button"></button>
  </div>
</div>

<script type="module">
import { initExamPlanUI, enterExamPlan, leaveExamPlan } from "/js/exam-plan-ui.js";
initExamPlanUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
});
window.__enter = (karte) => enterExamPlan(karte);
window.__leave = () => leaveExamPlan();
window.__examReady = true;
</script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/exam-item-master-harness.html") {
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

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function clickLinear(listSel, label) {
  const items = page.locator(`${listSel} .med-linear-picker__item`);
  const count = await items.count();
  for (let i = 0; i < count; i += 1) {
    const text = await items.nth(i).locator(".med-linear-picker__item-label").innerText();
    if (text.trim() === label) {
      await items.nth(i).click();
      return;
    }
  }
  throw new Error(`item not found in ${listSel}: ${label}`);
}

async function leafLabels() {
  // 「◯◯」で登録ボタンはマスタ項目ではないので除く
  return page
    .locator(
      "#exam-plan-col-leaf-list .med-linear-picker__item:not(.med-linear-picker__group-pick) .med-linear-picker__item-label"
    )
    .allTextContents();
}

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/exam-item-master-harness.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__examReady === true);

// カルテA: 初めての項目を追加して予定保存
await page.evaluate(() => window.__enter("karte-a"));
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await clickLinear("#exam-plan-col-category-list", "その他");
await page.waitForTimeout(80);

let buttons = await leafLabels();
console.log("KARTE A initial buttons:", buttons);
if (buttons.length !== 0) throw new Error("expected empty master initially");

await page.click("#btn-exam-plan-add-toggle");
await page.waitForSelector("#exam-plan-item-add-default:not([hidden])");
await page.fill("#exam-plan-new-item", "血液検査");
await page.click("#btn-exam-plan-add-item");
await page.waitForTimeout(200);
buttons = await leafLabels();
console.log("KARTE A after add:", buttons);
if (!buttons.includes("血液検査")) throw new Error("added item not shown as button");
const selected = await page
  .locator("#exam-plan-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
  .textContent();
if (selected !== "血液検査") throw new Error("added item not selected");

await page.fill("#exam-plan-due-date", "2026-09-01");
await page.click("#btn-exam-plan-save");
await page.waitForTimeout(200);
const plansA = await page.locator("#exam-plan-list .exam-list-item__title").allTextContents();
console.log("KARTE A plans:", plansA);
if (!plansA.includes("血液検査")) throw new Error("plan not saved on karte A");

// カルテB: 同じマスタが選べる
await page.evaluate(() => {
  window.__leave();
  window.__enter("karte-b");
});
await page.waitForTimeout(150);
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await clickLinear("#exam-plan-col-category-list", "その他");
await page.waitForTimeout(80);
buttons = await leafLabels();
console.log("KARTE B buttons:", buttons);
if (!buttons.includes("血液検査")) throw new Error("master item not available on other karte");

// 管理ボタンがないこと
if (await page.locator("#btn-open-exam-items").count()) {
  throw new Error("管理ボタンが残っている");
}
if (await page.locator("#exam-items-modal").count()) {
  throw new Error("管理モーダルが残っている");
}
if (await page.locator("#exam-plan-other").count()) {
  throw new Error("その他チェックが残っている");
}

await page.screenshot({ path: path.join(root, "tools/exam-item-master-verify.png") });

// 血液: 中項目の追加・中項目での選択確定・小項目追加
await page.click("#btn-close-exam-plan").catch(() => {});
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await clickLinear("#exam-plan-col-category-list", "血液");
await page.waitForTimeout(80);
await page.click("#btn-exam-plan-add-toggle");
await page.waitForSelector("#exam-plan-item-add-default:not([hidden])");
await page.fill("#exam-plan-new-item", "肝臓パネル");
await page.click("#btn-exam-plan-add-item");
await page.waitForTimeout(200);
const midLabels = await page
  .locator("#exam-plan-col-group-list .med-linear-picker__item-label")
  .allTextContents();
console.log("blood mids:", midLabels);
if (!midLabels.includes("肝臓パネル")) throw new Error("mid group not added");
// 中項目を足しただけでは選択されない（開くだけ）
let midSummary = await page.locator("#exam-plan-selection-summary").textContent();
console.log("mid summary:", midSummary);
if (midSummary.includes("肝臓パネル")) {
  throw new Error("adding a mid group must not select it");
}
// 「「肝臓パネル」で登録」を押した時だけ中項目自体が選ばれる
const groupPick = page.locator("#exam-plan-col-leaf-list .med-linear-picker__group-pick");
const groupPickLabel = (
  await groupPick.locator(".med-linear-picker__item-label").textContent()
).trim();
if (groupPickLabel !== "「肝臓パネル」で登録") {
  throw new Error(`group pick label wrong: ${groupPickLabel}`);
}
await groupPick.click();
await page.waitForTimeout(80);
midSummary = await page.locator("#exam-plan-selection-summary").textContent();
if (!midSummary.includes("肝臓パネル")) {
  throw new Error("mid not selected by group pick");
}

await page.click("#btn-exam-plan-add-toggle");
await page.waitForSelector("#exam-plan-item-add-default:not([hidden])");
await page.fill("#exam-plan-new-item", "ALT");
await page.click("#btn-exam-plan-add-item");
await page.waitForTimeout(200);
const bloodLeaves = await leafLabels();
console.log("blood leaves:", bloodLeaves);
if (!bloodLeaves.includes("ALT")) throw new Error("leaf not added under mid");
const leafSummary = await page.locator("#exam-plan-selection-summary").textContent();
console.log("leaf summary:", leafSummary);
if (!leafSummary.includes("ALT")) throw new Error("leaf not selected");

await page.screenshot({ path: path.join(root, "tools/exam-mid-select-verify.png") });

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: add on karte A → selectable on karte B; mid select/add works");
await browser.close();
server.close();
