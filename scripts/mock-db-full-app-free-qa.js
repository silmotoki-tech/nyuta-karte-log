// 本番 app.js 起動用の軽量 DB モック（自由質問検証向け）

const store = {
  freeQA: {},
  entries: {},
  templates: {},
  examItems: {},
  examPlan: {},
  medicationItems: {},
  medications: {},
  history: {},
  procedures: {},
  notes: {},
};
const listeners = {
  entries: new Map(),
  freeQA: new Map(),
  templates: [],
  examItems: [],
  examPlan: new Map(),
  medicationItems: [],
  medications: new Map(),
  history: new Map(),
  procedures: new Map(),
  notes: new Map(),
};
let seq = 0;
const nid = (p) => p + (++seq);

function notifyMap(map, key, items) {
  (map.get(key) || []).forEach((cb) => cb(items.map((x) => structuredClone(x))));
}

export async function ensureAuth() {}
export async function getAnimalName() {
  return "テスト";
}
export async function setAnimalName() {}

// 検証スクリプト側から globalThis.__seedEntries でサンプル記録を流し込める
export function subscribeEntries(karte, cb) {
  const list = listeners.entries.get(karte) || [];
  list.push(cb);
  listeners.entries.set(karte, list);
  cb(structuredClone(globalThis.__seedEntries || []));
  return () =>
    listeners.entries.set(
      karte,
      (listeners.entries.get(karte) || []).filter((x) => x !== cb)
    );
}
export function sortEntriesDescending(entries) {
  return [...(entries || [])].sort((a, b) =>
    String(b.recordDate || "").localeCompare(String(a.recordDate || ""))
  );
}
export async function addEntry() {
  return nid("e");
}
export async function updateEntry() {}
export async function setEntryImportant() {}
export async function deleteEntry() {}

export function subscribeTemplates(cb) {
  listeners.templates.push(cb);
  cb([]);
  return () => {
    const i = listeners.templates.indexOf(cb);
    if (i >= 0) listeners.templates.splice(i, 1);
  };
}
export async function addTemplate() {
  return nid("t");
}
export async function updateTemplate() {}
export async function deleteTemplate() {}

export const EXAM_ITEM_CATEGORIES = [
  { id: "blood", label: "血液" },
  { id: "imaging", label: "画像" },
  { id: "other", label: "その他" },
];
export const EXAM_FASTING = { REQUIRED: "required", NONE: "none" };
export function normalizeExamFasting(v) {
  return v || "";
}
export function examFastingLabel() {
  return "";
}
export function normalizeExamItemCategory(c) {
  return c || "other";
}
export function normalizeExamItemKind(k) {
  return k || "leaf";
}
export async function ensureExamItemDefaults() {}
export function subscribeExamItems(cb) {
  listeners.examItems.push(cb);
  cb([]);
  return () => {
    const i = listeners.examItems.indexOf(cb);
    if (i >= 0) listeners.examItems.splice(i, 1);
  };
}
export async function addExamItem() {
  return nid("ei");
}
export async function updateExamItem() {}
export async function deleteExamItem() {}
export async function fetchExamItemsOnce() {
  return [];
}

export const EXAM_PLAN_SCHEMA_VERSION = 2;
export function subscribeExamPlan(karte, cb) {
  const list = listeners.examPlan.get(karte) || [];
  list.push(cb);
  listeners.examPlan.set(karte, list);
  cb({ plans: {}, history: {}, nextPlan: null });
  return () =>
    listeners.examPlan.set(
      karte,
      (listeners.examPlan.get(karte) || []).filter((x) => x !== cb)
    );
}
export async function saveExamScheduledPlan() {
  return nid("ep");
}
export async function deleteExamScheduledPlan() {}
export async function endExamScheduledPlan() {}
export async function reviveExamPlanByItem() {
  return nid("ep");
}
export async function setNextExamPlan() {}
export async function clearNextExamPlan() {}
export async function addExamHistory() {
  return nid("eh");
}
export async function deleteExamHistory() {}

export function subscribeMedicationItems(cb) {
  listeners.medicationItems.push(cb);
  cb([]);
  return () => {
    const i = listeners.medicationItems.indexOf(cb);
    if (i >= 0) listeners.medicationItems.splice(i, 1);
  };
}
export async function fetchMedicationItemsOnce() {
  return [];
}
export async function addMedicationItem() {
  return nid("mi");
}
export async function updateMedicationItem() {}
export async function deleteMedicationItem() {}

export const MEDICATION_SCHEMA_VERSION = 1;
export function subscribeMedications(karte, cb) {
  const list = listeners.medications.get(karte) || [];
  list.push(cb);
  listeners.medications.set(karte, list);
  cb([]);
  return () =>
    listeners.medications.set(
      karte,
      (listeners.medications.get(karte) || []).filter((x) => x !== cb)
    );
}
export async function fetchMedicationsOnce() {
  return [];
}
export async function addMedication() {
  return nid("d");
}
export async function updateMedication() {}
export async function deleteMedication() {}
export async function addMedicationEvent() {
  return nid("me");
}
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}

export const PATIENT_HISTORY_SCHEMA_VERSION = 1;
export function subscribePatientHistory(karte, cb) {
  const list = listeners.history.get(karte) || [];
  list.push(cb);
  listeners.history.set(karte, list);
  cb([]);
  return () =>
    listeners.history.set(
      karte,
      (listeners.history.get(karte) || []).filter((x) => x !== cb)
    );
}
export async function addPatientHistoryEntry() {
  return nid("ph");
}
export async function updatePatientHistoryEntry() {}
export async function setPatientHistoryStatus() {}
export async function appendPatientHistoryNote() {
  return nid("phn");
}
export async function deletePatientHistoryNote() {}
export async function deletePatientHistoryEntry() {}

export const FREE_QA_SCHEMA_VERSION = 1;
export function subscribeFreeQA(karte, cb) {
  if (!store.freeQA[karte]) store.freeQA[karte] = {};
  const list = listeners.freeQA.get(karte) || [];
  list.push(cb);
  listeners.freeQA.set(karte, list);
  const items = Object.entries(store.freeQA[karte]).map(([id, row]) => ({
    id,
    ...row,
  }));
  cb(items.map((x) => structuredClone(x)));
  return () =>
    listeners.freeQA.set(
      karte,
      (listeners.freeQA.get(karte) || []).filter((x) => x !== cb)
    );
}
export async function addFreeQA(karte, { question, answer, askedBy }) {
  if (!store.freeQA[karte]) store.freeQA[karte] = {};
  const id = nid("qa");
  store.freeQA[karte][id] = {
    schemaVersion: 1,
    question: question || "",
    answer: answer || "",
    askedAt: new Date().toISOString(),
    askedBy: askedBy || "",
  };
  const items = Object.entries(store.freeQA[karte]).map(([id2, row]) => ({
    id: id2,
    ...row,
  }));
  notifyMap(listeners.freeQA, karte, items);
  return id;
}
export async function updateFreeQAAnswer(karte, id, { answer, askedBy }) {
  const row = store.freeQA[karte]?.[id];
  if (!row) throw new Error("missing qa");
  row.answer = answer || "";
  if (askedBy != null) row.askedBy = askedBy;
  const items = Object.entries(store.freeQA[karte]).map(([id2, r]) => ({
    id: id2,
    ...r,
  }));
  notifyMap(listeners.freeQA, karte, items);
}
export async function deleteFreeQA(karte, id) {
  if (store.freeQA[karte]) delete store.freeQA[karte][id];
  const items = Object.entries(store.freeQA[karte] || {}).map(([id2, r]) => ({
    id: id2,
    ...r,
  }));
  notifyMap(listeners.freeQA, karte, items);
}

export const PROCEDURE_SCHEMA_VERSION = 1;
export function subscribeProcedures(karte, cb) {
  const list = listeners.procedures.get(karte) || [];
  list.push(cb);
  listeners.procedures.set(karte, list);
  cb([]);
  return () =>
    listeners.procedures.set(
      karte,
      (listeners.procedures.get(karte) || []).filter((x) => x !== cb)
    );
}
export async function addProcedure() {
  return nid("pr");
}
export async function updateProcedure() {}
export async function deleteProcedure() {}

export const MEDICATION_ITEM_CATEGORIES = [
  { id: "oral", label: "内服薬" },
  { id: "inject", label: "注射薬" },
  { id: "other", label: "その他" },
];
export function normalizeMedicationItemCategory(c) {
  return c || "other";
}
export function normalizeMedicationItemKind(k) {
  return k || "leaf";
}
export function medicationItemCategoryLabel(c) {
  return MEDICATION_ITEM_CATEGORIES.find((x) => x.id === c)?.label || "";
}
export async function ensureMedicationItemDefaults() {}

export function normalizeHistoryMasterKind(k) {
  return k || "leaf";
}
function subscribeEmptyList(bucket, cb) {
  listeners[bucket] = listeners[bucket] || [];
  listeners[bucket].push(cb);
  cb([]);
  return () => {
    const i = listeners[bucket].indexOf(cb);
    if (i >= 0) listeners[bucket].splice(i, 1);
  };
}
export function subscribeHistoryDiseaseItems(cb) {
  return subscribeEmptyList("historyDisease", cb);
}
export function subscribeHistorySurgeryItems(cb) {
  return subscribeEmptyList("historySurgery", cb);
}
export function subscribeHistoryReferralItems(cb) {
  return subscribeEmptyList("historyReferral", cb);
}
export async function addHistoryDiseaseItem() {
  return nid("hd");
}
export async function addHistorySurgeryItem() {
  return nid("hs");
}
export async function addHistoryReferralItem() {
  return nid("hr");
}
export async function deleteHistoryDiseaseItem() {}
export async function deleteHistorySurgeryItem() {}
export async function deleteHistoryReferralItem() {}
export async function ensureHistoryDiseaseItemDefaults() {}
export async function ensureHistoryReferralItemDefaults() {}

export const DEFAULT_ADMIN_PASSCODE = "oono";
export async function verifyAdminPasscode(input) {
  return String(input ?? "") === DEFAULT_ADMIN_PASSCODE;
}
export async function ensureAdminPasscodeDefault() {}

export function subscribeProcedureBundle(karte, cb) {
  cb({ plans: [], history: [] });
  return () => {};
}
export async function saveProcedurePlan() {
  return nid("pp");
}
export async function deleteProcedurePlan() {}
export async function completeProcedurePlan() {}
export async function reviveProcedurePlan() {
  return nid("pp");
}

export const MIGRATION_PROGRESS_SCHEMA_VERSION = 1;
export const MIGRATION_PROGRESS_STATUSES = [
  "not_started",
  "in_progress",
  "done",
];
const migrationStore = {};
const migrationListeners = new Map();

export function normalizeMigrationProgressStatus(value) {
  return MIGRATION_PROGRESS_STATUSES.includes(value) ? value : "not_started";
}
export function normalizeMigrationProgress(raw) {
  const entry = {
    schemaVersion: MIGRATION_PROGRESS_SCHEMA_VERSION,
    status: "not_started",
    memo: "",
    updatedAt: "",
    updatedBy: "",
  };
  if (!raw || typeof raw !== "object") return entry;
  entry.schemaVersion = raw.schemaVersion || MIGRATION_PROGRESS_SCHEMA_VERSION;
  entry.status = normalizeMigrationProgressStatus(raw.status);
  entry.memo = typeof raw.memo === "string" ? raw.memo : "";
  entry.updatedAt = raw.updatedAt || "";
  entry.updatedBy = raw.updatedBy || "";
  return entry;
}
export function subscribeMigrationProgress(karte, cb) {
  const list = migrationListeners.get(karte) || [];
  list.push(cb);
  migrationListeners.set(karte, list);
  cb(normalizeMigrationProgress(migrationStore[karte] || null));
  return () =>
    migrationListeners.set(
      karte,
      (migrationListeners.get(karte) || []).filter((x) => x !== cb)
    );
}
export async function saveMigrationProgress(karte, { status, memo, updatedBy }) {
  const payload = {
    schemaVersion: MIGRATION_PROGRESS_SCHEMA_VERSION,
    status: normalizeMigrationProgressStatus(status),
    memo: typeof memo === "string" ? memo : "",
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || "",
  };
  migrationStore[karte] = payload;
  (migrationListeners.get(karte) || []).forEach((cb) =>
    cb(normalizeMigrationProgress(payload))
  );
  return payload;
}

export const SPECIAL_NOTE_SCHEMA_VERSION = 1;
export const SPECIAL_NOTE_IMPORTANCE = ["high", "medium", "low"];
export function subscribeSpecialNotes(karte, cb) {
  const list = listeners.notes.get(karte) || [];
  list.push(cb);
  listeners.notes.set(karte, list);
  cb([]);
  return () =>
    listeners.notes.set(
      karte,
      (listeners.notes.get(karte) || []).filter((x) => x !== cb)
    );
}
export async function addSpecialNote() {
  return nid("sn");
}
export async function updateSpecialNote() {}
export async function deleteSpecialNote() {}
