// 本番 app.js 起動用の軽量 DB モック（状態モード検証向け）
// 薬剤・検査・既往歴・処置・特記にサンプルデータを入れて描画と編集操作を確認する。

const SEED = {
  medications: [
    {
      id: "d-pred",
      schemaVersion: 1,
      name: "プレドニゾロン",
      category: "A",
      prn: false,
      sideEffectNote: "多飲多尿に注意",
      expiryEstimate: "2026-08-14",
      events: {
        e1: { date: "2026-05-01", type: "add", detail: "1回0.5錠 1日2回", changedBy: "大野" },
      },
    },
    {
      id: "d-amlo",
      schemaVersion: 1,
      name: "アムロジピン",
      category: "B",
      prn: false,
      sideEffectNote: "",
      expiryEstimate: "",
      events: {
        e1: { date: "2026-03-12", type: "add", detail: "1回1錠 1日1回", changedBy: "大野" },
        e2: { date: "2026-06-20", type: "increase", detail: "1日2回に増量", changedBy: "山本" },
      },
    },
    {
      id: "d-maro",
      schemaVersion: 1,
      name: "マロピタント",
      category: "B",
      prn: true,
      sideEffectNote: "",
      expiryEstimate: "",
      events: {
        e1: { date: "2026-07-30", type: "temporary", detail: "嘔吐時のみ", changedBy: "山本" },
      },
    },
    {
      id: "d-furo",
      schemaVersion: 1,
      name: "フロセミド",
      category: "A",
      prn: false,
      sideEffectNote: "",
      expiryEstimate: "2026-07-20",
      events: {
        e1: { date: "2026-04-02", type: "add", detail: "", changedBy: "大野" },
        e2: { date: "2026-07-05", type: "hard", detail: "吐き出してしまう", changedBy: "大野" },
      },
    },
    {
      id: "d-gaba",
      schemaVersion: 1,
      name: "ガバペンチン",
      category: "C",
      prn: false,
      sideEffectNote: "",
      expiryEstimate: "",
      events: {
        e1: { date: "2026-02-01", type: "add", detail: "", changedBy: "山本" },
        e2: { date: "2026-06-01", type: "hold", detail: "ふらつきのため休薬", changedBy: "山本" },
      },
    },
    {
      id: "d-cere",
      schemaVersion: 1,
      name: "セレニア",
      category: "B",
      prn: false,
      sideEffectNote: "",
      expiryEstimate: "",
      events: {
        e1: { date: "2026-01-10", type: "add", detail: "", changedBy: "大野" },
        e2: { date: "2026-03-15", type: "stop", detail: "症状消失のため中止", changedBy: "大野" },
      },
    },
  ],
  examPlan: {
    schemaVersion: 2,
    plans: {
      p1: {
        item: "血液検査（腎パネル）",
        dueDate: "2026-08-15",
        baselineDate: "2026-05-15",
        note: "絶食で来院",
        fasting: "required",
      },
      p2: {
        item: "腹部エコー",
        dueDate: "2026-08-05",
        baselineDate: "2026-05-05",
        note: "",
        fasting: "",
      },
      p3: {
        item: "心エコー",
        dueDate: "2026-11-01",
        baselineDate: "2026-05-01",
        note: "循環器再評価",
        fasting: "",
      },
    },
    history: {
      h1: { item: "血液検査（腎パネル）", date: "2026-05-15", note: "Cre 1.8" },
      h2: { item: "血液検査（腎パネル）", date: "2026-02-10", note: "" },
      h3: { item: "腹部エコー", date: "2026-05-05", note: "膀胱結石なし" },
      h4: { item: "尿検査（単発）", date: "2026-07-01", note: "予定なしの実施" },
    },
  },
  procedures: {
    plans: [
      {
        id: "pp1",
        content: "皮下点滴",
        dueDate: "2026-08-12",
        baselineDate: "2026-08-05",
        note: "150mL",
        confirmedBy: "大野",
        source: "manual",
      },
      {
        id: "pp2",
        content: "爪切り",
        dueDate: "2026-09-20",
        baselineDate: "2026-06-20",
        note: "",
        confirmedBy: "",
        source: "manual",
      },
    ],
    history: [
      {
        id: "ph1",
        store: "history",
        schemaVersion: 1,
        date: "2026-08-05",
        content: "皮下点滴",
        note: "150mL 実施",
        confirmedBy: "大野",
        lastEditedAt: "",
        lastEditedBy: "",
        source: "manual",
      },
      {
        id: "ph2",
        store: "history",
        schemaVersion: 1,
        date: "2026-06-20",
        content: "爪切り",
        note: "",
        confirmedBy: "山本",
        lastEditedAt: "",
        lastEditedBy: "",
        source: "manual",
      },
      {
        id: "ph3",
        store: "history",
        schemaVersion: 1,
        date: "2026-07-10",
        content: "耳掃除（単発）",
        note: "予定なしの実施",
        confirmedBy: "山本",
        lastEditedAt: "",
        lastEditedBy: "",
        source: "manual",
      },
    ],
  },
  history: [
    {
      id: "hx1",
      schemaVersion: 1,
      title: "僧帽弁閉鎖不全症（ACVIM B2）",
      type: "disease",
      status: "active",
      firstNoted: "2023-04-01",
      lastUpdated: "2026-07-01",
      source: "manual",
      notes: {
        n1: { date: "2026-07-01", text: "心拡大の進行あり。内服継続。", author: "大野" },
      },
    },
    {
      id: "hx2",
      schemaVersion: 1,
      title: "慢性腎臓病 IRIS ステージ2",
      type: "disease",
      status: "active",
      firstNoted: "2025-02-14",
      lastUpdated: "2026-05-15",
      source: "manual",
      notes: {},
    },
    {
      id: "hx3",
      schemaVersion: 1,
      title: "避妊手術",
      type: "surgery",
      status: "resolved",
      firstNoted: "2019-06-10",
      lastUpdated: "2019-06-10",
      source: "manual",
      notes: {},
    },
    {
      id: "hx4",
      schemaVersion: 1,
      title: "皮膚科専門医へ紹介",
      type: "referral",
      status: "resolved",
      firstNoted: "2024-09-02",
      lastUpdated: "2024-11-20",
      source: "manual",
      notes: {},
    },
  ],
  notes: [
    {
      id: "sn1",
      schemaVersion: 1,
      content: "咬傷歴あり。保定は必ず2人で、口輪を使用すること。",
      importance: "high",
      createdAt: "2026-06-01T09:00:00.000Z",
      createdBy: "大野",
    },
    {
      id: "sn2",
      schemaVersion: 1,
      content: "セファレキシンでアナフィラキシー既往。使用禁止。",
      importance: "high",
      createdAt: "2026-05-20T09:00:00.000Z",
      createdBy: "山本",
    },
    {
      id: "sn3",
      schemaVersion: 1,
      content: "自宅では飼い主さんが薬を潰して缶詰に混ぜている。",
      importance: "medium",
      createdAt: "2026-07-10T09:00:00.000Z",
      createdBy: "大野",
    },
    {
      id: "sn4",
      schemaVersion: 1,
      content: "来院は毎回午前が希望。",
      importance: "medium",
      createdAt: "2026-04-02T09:00:00.000Z",
      createdBy: "山本",
    },
    {
      id: "sn5",
      schemaVersion: 1,
      content: "おやつはささみが好き。",
      importance: "low",
      createdAt: "2026-03-01T09:00:00.000Z",
      createdBy: "山本",
    },
  ],
};

const IMPORTANCE_RANK = { high: 0, medium: 1, low: 2 };
function sortNotes(items) {
  return [...items].sort((a, b) => {
    const r = IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];
    if (r !== 0) return r;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

const EXAM_ITEMS_SEED = [
  {
    id: "seed-blood-cbc",
    label: "CBC",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 1,
    defaultFasting: "none",
  },
];

const MED_ITEMS_SEED = [
  {
    id: "seed-med-pred",
    label: "プレドニゾロン",
    category: "oral",
    kind: "leaf",
    parentId: "",
    order: 1,
  },
  {
    id: "seed-med-enro",
    label: "エンロフロキサシン",
    category: "oral",
    kind: "leaf",
    parentId: "",
    order: 2,
  },
];

const HISTORY_DISEASE_SEED = [
  {
    id: "seed-hx-dm",
    label: "糖尿病",
    kind: "leaf",
    parentId: "",
    order: 1,
  },
];


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
let seq = 1000;
const nid = (p) => p + (++seq);

function notifyMap(map, key, items) {
  (map.get(key) || []).forEach((cb) => cb(items.map((x) => structuredClone(x))));
}

/** 同じデータを複数モジュールが購読するため、購読者を束ねて一斉通知する */
const feeds = new Map();
function feed(name, getValue) {
  return (cb) => {
    const subs = feeds.get(name) || new Set();
    subs.add(cb);
    feeds.set(name, subs);
    cb(structuredClone(getValue()));
    return () => subs.delete(cb);
  };
}
function notifyFeed(name, getValue) {
  (feeds.get(name) || new Set()).forEach((cb) => cb(structuredClone(getValue())));
}

export async function ensureAuth() {}
export async function getAnimalName() {
  return "イチロウ";
}
export async function setAnimalName() {}

// 検証スクリプト側から globalThis.__seedEntries でサンプル記録を流し込める
function currentEntries(karte) {
  if (!store.entries[karte]) {
    store.entries[karte] = [...(globalThis.__seedEntries || [])];
  }
  return store.entries[karte];
}
function notifyEntries(karte) {
  const list = sortEntriesDescending(currentEntries(karte));
  (listeners.entries.get(karte) || []).forEach((cb) =>
    cb(structuredClone(list))
  );
}
export function subscribeEntries(karte, cb) {
  const list = listeners.entries.get(karte) || [];
  list.push(cb);
  listeners.entries.set(karte, list);
  cb(structuredClone(sortEntriesDescending(currentEntries(karte))));
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
export async function addEntry(karte, data = {}) {
  const id = nid("e");
  currentEntries(karte).push({ id, ...data });
  notifyEntries(karte);
  return id;
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
  cb(structuredClone(EXAM_ITEMS_SEED));
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
  return feed("examPlan", () => SEED.examPlan)(cb);
}
export async function saveExamScheduledPlan(
  karte,
  { planId = null, item, dueDate, dueDateFrom, dueDateTo, note, baselineDate, fasting } = {}
) {
  const single = dueDate || "";
  let from = dueDateFrom || single;
  let to = dueDateTo || single || from;
  if (!from) from = to;
  if (from && to && from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }
  const date = to || from || "";
  const row = {
    item: item || "",
    dueDate: date,
    dueDateFrom: from || date,
    dueDateTo: to || date,
    baselineDate: baselineDate || date || "2026-08-15",
    note: note || "",
    fasting: fasting || "",
  };
  if (planId && SEED.examPlan.plans[planId]) {
    SEED.examPlan.plans[planId] = {
      ...SEED.examPlan.plans[planId],
      ...row,
    };
    notifyFeed("examPlan", () => SEED.examPlan);
    return planId;
  }
  const id = nid("p");
  SEED.examPlan.plans[id] = row;
  notifyFeed("examPlan", () => SEED.examPlan);
  return id;
}
export async function deleteExamScheduledPlan() {}
export async function endExamScheduledPlan() {}
export async function reviveExamPlanByItem() {
  return nid("ep");
}
export async function setNextExamPlan() {}
export async function clearNextExamPlan() {}
export async function addExamHistory(karte, { item, date, note } = {}) {
  const id = nid("h");
  SEED.examPlan.history[id] = {
    item: item || "",
    date: date || "2026-08-15",
    note: note || "",
  };
  notifyFeed("examPlan", () => SEED.examPlan);
  return id;
}
export async function deleteExamHistory() {}

export function subscribeMedicationItems(cb) {
  listeners.medicationItems.push(cb);
  cb(structuredClone(MED_ITEMS_SEED));
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
  return feed("medications", () => SEED.medications)(cb);
}
export async function fetchMedicationsOnce() {
  return [];
}
export async function addMedication(
  karte,
  {
    name,
    category,
    sideEffectNote,
    expiryEstimate,
    changedBy,
    eventDate,
    frequencyChange,
    amountChange,
  } = {}
) {
  const id = nid("d");
  const date = eventDate || "2026-08-15";
  const detailParts = ["開始／継続"];
  if (frequencyChange) detailParts.push(frequencyChange);
  if (amountChange) detailParts.push(amountChange);
  SEED.medications.push({
    id,
    schemaVersion: 1,
    name: name || "",
    category: ["A", "B", "C"].includes(category) ? category : "A",
    prn: false,
    sideEffectNote: sideEffectNote || "",
    expiryEstimate: expiryEstimate || "",
    events: {
      e1: {
        date,
        type: "add",
        detail: detailParts.join(" "),
        changedBy: changedBy || "",
      },
    },
  });
  notifyFeed("medications", () => SEED.medications);
  return id;
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
  return feed("patientHistory", () => SEED.history)(cb);
}
export async function addPatientHistoryEntry(
  karte,
  {
    title,
    type = "disease",
    status = "active",
    firstNoted,
    noteText = "",
    author = "",
  } = {}
) {
  const id = nid("hx");
  const noted = firstNoted || "2026-08-15";
  const entry = {
    id,
    schemaVersion: 1,
    title: title || "",
    type: type || "disease",
    status: status || "active",
    firstNoted: noted,
    lastUpdated: noted,
    source: "manual",
    notes: {},
  };
  if (noteText && noteText.trim()) {
    entry.notes[nid("n")] = {
      date: noted,
      text: noteText.trim(),
      author: author || "",
    };
  }
  SEED.history.push(entry);
  notifyFeed("patientHistory", () => SEED.history);
  return id;
}
export async function updatePatientHistoryEntry(karte, id, patch = {}) {
  const row = SEED.history.find((x) => x.id === id);
  if (row) Object.assign(row, patch, { lastUpdated: "2026-08-10" });
  notifyFeed("patientHistory", () => SEED.history);
}
export async function setPatientHistoryStatus(karte, id, status) {
  const row = SEED.history.find((x) => x.id === id);
  if (row) {
    row.status = status;
    row.lastUpdated = "2026-08-10";
  }
  notifyFeed("patientHistory", () => SEED.history);
}
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
export async function addProcedure(karte, { date, content, note, source } = {}) {
  const id = nid("pr");
  SEED.procedures.history.push({
    id,
    store: "history",
    schemaVersion: 1,
    date: date || "2026-08-15",
    content: content || "",
    note: note || "",
    confirmedBy: "",
    lastEditedAt: "",
    lastEditedBy: "",
    source: source || "manual",
  });
  notifyFeed("procedureBundle", () => SEED.procedures);
  return id;
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
  listeners.historyDisease = listeners.historyDisease || [];
  listeners.historyDisease.push(cb);
  cb(structuredClone(HISTORY_DISEASE_SEED));
  return () => {
    const i = listeners.historyDisease.indexOf(cb);
    if (i >= 0) listeners.historyDisease.splice(i, 1);
  };
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
  return feed("procedureBundle", () => SEED.procedures)(cb);
}
export async function saveProcedurePlan(
  karte,
  { planId = null, content, dueDate, dueDateFrom, dueDateTo, note = "", baselineDate = "", confirmedBy = "" } = {}
) {
  const single = dueDate || "";
  let from = dueDateFrom || single;
  let to = dueDateTo || single || from;
  if (!from) from = to;
  if (from && to && from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }
  const date = to || from || "";
  const payload = {
    content: content || "",
    dueDate: date,
    dueDateFrom: from || date,
    dueDateTo: to || date,
    baselineDate: baselineDate || date || "2026-08-15",
    note: note || "",
    confirmedBy: confirmedBy || "",
  };
  if (planId) {
    const row = SEED.procedures.plans.find((p) => p.id === planId);
    if (row) {
      Object.assign(row, payload);
      notifyFeed("procedureBundle", () => SEED.procedures);
      return planId;
    }
  }
  const id = nid("pp");
  SEED.procedures.plans.push({
    id,
    ...payload,
    source: "manual",
  });
  notifyFeed("procedureBundle", () => SEED.procedures);
  return id;
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
  return feed("specialNotes", () => sortNotes(SEED.notes))(cb);
}
export async function addSpecialNote(
  karte,
  { content, importance = "medium", createdBy } = {}
) {
  const id = nid("sn");
  SEED.notes.push({
    id,
    schemaVersion: 1,
    content: content || "",
    importance: importance || "medium",
    createdAt: new Date().toISOString(),
    createdBy: createdBy || "",
  });
  notifyFeed("specialNotes", () => sortNotes(SEED.notes));
  return id;
}
export async function updateSpecialNote(karte, id, patch = {}) {
  const row = SEED.notes.find((x) => x.id === id);
  if (row) {
    Object.assign(row, patch);
    row.lastEditedAt = "2026-08-10T09:00:00.000Z";
  }
  notifyFeed("specialNotes", () => sortNotes(SEED.notes));
}
export async function deleteSpecialNote(karte, id) {
  const i = SEED.notes.findIndex((x) => x.id === id);
  if (i >= 0) SEED.notes.splice(i, 1);
  notifyFeed("specialNotes", () => sortNotes(SEED.notes));
}

// ==== ここから自動生成: node scripts/check-mock-db-exports.mjs --write ====
// db.js にあってこのモックが定義していない名前を、起動が通る最小限の実装で埋める。
// 挙動が必要になったら、この上でその名前を普通に定義すれば生成対象から外れる。

export function examItemCategoryLabel() {
  return "";
}

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

export async function ensureHistorySurgeryItemDefaults() {}

// ==== 自動生成ここまで ====
