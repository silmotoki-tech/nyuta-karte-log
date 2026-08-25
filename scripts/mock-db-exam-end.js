// Playwright 検証用のインメモリ db モック（検査予定の終了／復活フロー）

const store = {
  examItems: {
    item1: { label: "血液検査", order: 1, category: "blood", kind: "leaf", defaultFasting: "required" },
  },
  examPlan: {},
};

function emptyPlan() {
  return { schemaVersion: 2, plans: {}, history: {} };
}

function ensurePlan(karte) {
  if (!store.examPlan[karte]) store.examPlan[karte] = emptyPlan();
  return store.examPlan[karte];
}

function notify(karte) {
  const listeners = examPlanListeners.get(karte) || [];
  const snap = structuredClone(ensurePlan(karte));
  listeners.forEach((cb) => cb(snap));
}

const examPlanListeners = new Map();
let idSeq = 1;
function nextId(prefix) {
  idSeq += 1;
  return `${prefix}${idSeq}`;
}

function todayIsoDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function subscribeExamPlan(karteNumber, callback) {
  const list = examPlanListeners.get(karteNumber) || [];
  list.push(callback);
  examPlanListeners.set(karteNumber, list);
  callback(structuredClone(ensurePlan(karteNumber)));
  return () => {
    const cur = examPlanListeners.get(karteNumber) || [];
    examPlanListeners.set(
      karteNumber,
      cur.filter((cb) => cb !== callback)
    );
  };
}

export function subscribeExamItems(callback) {
  callback(
    Object.entries(store.examItems).map(([id, v]) => ({ id, ...v }))
  );
  return () => {};
}

export async function saveExamScheduledPlan(
  karteNumber,
  { planId = null, item, dueDate, note, baselineDate, fasting }
) {
  const plan = ensurePlan(karteNumber);
  const itemName = (item || "").trim();
  let targetId = planId || null;
  if (!targetId && itemName) {
    const found = Object.entries(plan.plans).find(
      ([, p]) => p && (p.item || "").trim() === itemName
    );
    if (found) targetId = found[0];
  }
  const date = dueDate || "";
  const record = {
    item: item || "",
    dueDate: date,
    baselineDate: baselineDate || date || "",
    dueDateFrom: date,
    dueDateTo: date,
    note: note || "",
    fasting: fasting || "",
  };
  if (!targetId) targetId = nextId("plan");
  plan.plans[targetId] = record;
  notify(karteNumber);
  return targetId;
}

export async function deleteExamScheduledPlan(karteNumber, planId) {
  const plan = ensurePlan(karteNumber);
  if (planId) delete plan.plans[planId];
  notify(karteNumber);
}

export async function endExamScheduledPlan(karteNumber, planId) {
  await deleteExamScheduledPlan(karteNumber, planId);
}

export async function reviveExamPlanByItem(karteNumber, { item, note = "" }) {
  return saveExamScheduledPlan(karteNumber, {
    item,
    dueDate: "",
    note,
    baselineDate: todayIsoDate(),
  });
}

export async function addExamHistory(karteNumber, { item, date, note }) {
  const plan = ensurePlan(karteNumber);
  const id = nextId("hist");
  plan.history[id] = { item: item || "", date: date || "", note: note || "" };
  notify(karteNumber);
  return id;
}

export async function deleteExamHistory(karteNumber, historyId) {
  const plan = ensurePlan(karteNumber);
  delete plan.history[historyId];
  notify(karteNumber);
}

export async function updateExamHistory(karteNumber, historyId, { date, note }) {
  const plan = ensurePlan(karteNumber);
  const cur = plan.history[historyId];
  if (!cur) throw new Error("missing");
  plan.history[historyId] = {
    ...cur,
    date: date || "",
    note: note !== undefined ? note || "" : cur.note || "",
  };
  notify(karteNumber);
}

export async function addExamItem() {
  return nextId("item");
}
export async function updateExamItem() {}
export async function deleteExamItem() {}

// 他モジュールが import する可能性のあるスタブ
export async function subscribeKarte() {
  return () => {};
}
export const EXAM_PLAN_SCHEMA_VERSION = 2;

/** テスト用: 現在の examPlan スナップショット */
export function __getExamPlan(karte) {
  return structuredClone(ensurePlan(karte));
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

export async function setNextExamPlan() {}

export async function clearNextExamPlan() {}

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
