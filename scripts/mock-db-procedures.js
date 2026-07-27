/** 処置予定／実施履歴のインメモリモック */

const store = {
  plans: {},
  history: {},
  legacy: {},
};

const listeners = new Set();

function emit() {
  const plans = Object.entries(store.plans).map(([id, raw]) => ({ id, ...raw }));
  const history = [
    ...Object.entries(store.history).map(([id, raw]) => ({
      id,
      store: "history",
      ...raw,
    })),
    ...Object.entries(store.legacy).map(([id, raw]) => ({
      id,
      store: "legacy",
      ...raw,
    })),
  ];
  plans.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  history.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  listeners.forEach((cb) => cb({ plans, history }));
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

// seed: 旧形式の実施履歴1件（互換確認用）
store.legacy["legacy-1"] = {
  schemaVersion: 1,
  date: addDays(today(), -10),
  content: "旧形式の皮下点滴",
  note: "",
  confirmedBy: "院長",
  lastEditedAt: "",
  lastEditedBy: "",
  source: "manual",
};

let seq = 1;
function nextId(prefix) {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function subscribeProcedureBundle(_karte, callback) {
  listeners.add(callback);
  queueMicrotask(() => emit());
  return () => listeners.delete(callback);
}

export function subscribeProcedures(karte, callback) {
  return subscribeProcedureBundle(karte, (bundle) => callback(bundle.history));
}

export async function saveProcedurePlan(
  _karte,
  { planId = null, content, dueDate, note = "", baselineDate = "", confirmedBy = "", source = "manual" }
) {
  const id = planId || nextId("plan");
  store.plans[id] = {
    content: content || "",
    dueDate: dueDate || "",
    baselineDate: baselineDate || today(),
    note: note || "",
    confirmedBy: confirmedBy || "",
    source: source === "ai" ? "ai" : "manual",
  };
  emit();
  return id;
}

export async function deleteProcedurePlan(_karte, planId) {
  delete store.plans[planId];
  emit();
}

export async function reviveProcedurePlan(_karte, { content, note = "", confirmedBy = "" }) {
  return saveProcedurePlan(_karte, {
    content,
    dueDate: "",
    note,
    baselineDate: today(),
    confirmedBy,
  });
}

export async function completeProcedurePlan(
  karte,
  planId,
  { date, note, content }
) {
  const id = await addProcedure(karte, {
    date,
    content,
    note,
    source: "manual",
  });
  await deleteProcedurePlan(karte, planId);
  return id;
}

export async function addProcedure(
  _karte,
  { date, content, note = "", source = "manual" }
) {
  const id = nextId("hist");
  store.history[id] = {
    schemaVersion: 2,
    date: date || "",
    content: content || "",
    note: note || "",
    lastEditedAt: "",
    source: source === "ai" ? "ai" : "manual",
  };
  emit();
  return id;
}

export async function updateProcedure(
  _karte,
  entryId,
  { date, content, note },
  { store: storeKind = "history" } = {}
) {
  const bag = storeKind === "legacy" ? store.legacy : store.history;
  const cur = bag[entryId];
  if (!cur) throw new Error("missing");
  bag[entryId] = {
    ...cur,
    date: date || "",
    content: content || "",
    note: note !== undefined ? note || "" : cur.note || "",
    lastEditedAt: new Date().toISOString(),
  };
  emit();
}

export async function deleteProcedure(_karte, entryId, { store: storeKind = "history" } = {}) {
  if (storeKind === "legacy") delete store.legacy[entryId];
  else delete store.history[entryId];
  emit();
}

// exam-plan-ui が import する可能性のあるスタブ（未使用でも安全に）
export function subscribeExamPlan() {
  return () => {};
}
export function subscribeExamItems() {
  return () => {};
}
export async function saveExamScheduledPlan() {
  return "x";
}
export async function deleteExamScheduledPlan() {}
export async function endExamScheduledPlan() {}
export async function reviveExamPlanByItem() {
  return "x";
}
export async function addExamHistory() {
  return "x";
}
export async function addExamItem() {
  return "x";
}
export const EXAM_ITEM_CATEGORIES = [];
export function normalizeExamItemCategory(v) {
  return v;
}
export function normalizeExamFasting(v) {
  return v || "";
}
export function examFastingLabel() {
  return "";
}
