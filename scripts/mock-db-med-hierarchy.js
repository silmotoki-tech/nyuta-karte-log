// 薬剤マスタ階層（注射薬／内服薬／外用薬／点眼薬）＋既存フラット移行付きモック

export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" },
  { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" },
  { id: "eye", label: "点眼薬" },
];

export const MED_ORAL_OTHER_GROUP_ID = "seed-med-oral-other";

const CATEGORY_IDS = new Set(MEDICATION_ITEM_CATEGORIES.map((c) => c.id));

export function normalizeMedicationItemCategory(category) {
  const id = String(category || "").trim();
  return CATEGORY_IDS.has(id) ? id : "oral";
}

export function normalizeMedicationItemKind(kind) {
  return String(kind || "").trim() === "group" ? "group" : "leaf";
}

export function medicationItemCategoryLabel(category) {
  const id = normalizeMedicationItemCategory(category);
  return MEDICATION_ITEM_CATEGORIES.find((c) => c.id === id)?.label || id;
}

function normalizeMedicationItem(id, raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  const kind = normalizeMedicationItemKind(row.kind);
  return {
    id,
    label: row.label || "",
    category: normalizeMedicationItemCategory(row.category),
    kind,
    parentId: kind === "group" ? "" : String(row.parentId || "").trim(),
    order: typeof row.order === "number" ? row.order : 0,
  };
}

function medGroupSeed(category, id, label, order) {
  return { id, label, category, kind: "group", parentId: "", order };
}

const MEDICATION_ITEM_GROUP_SEED = [
  medGroupSeed("oral", "seed-med-oral-antibiotic", "抗生剤", 10),
  medGroupSeed("oral", "seed-med-oral-antiinflam", "消炎剤", 20),
  medGroupSeed("oral", "seed-med-oral-analgesic", "鎮痛剤", 30),
  medGroupSeed("oral", "seed-med-oral-steroid-antihist", "ステロイド・抗ヒス", 40),
  medGroupSeed("oral", "seed-med-oral-gi-stomach", "消化器（胃）", 50),
  medGroupSeed("oral", "seed-med-oral-gi-intestine", "消化器（腸）", 60),
  medGroupSeed("oral", "seed-med-oral-liver-kidney", "肝臓・腎臓・泌尿器", 70),
  medGroupSeed("oral", "seed-med-oral-cardio", "循環器", 80),
  medGroupSeed("oral", "seed-med-oral-respiratory", "呼吸器", 90),
  medGroupSeed("oral", "seed-med-oral-neuro", "神経・行動", 100),
  medGroupSeed("oral", "seed-med-oral-antifungal", "抗真菌・駆虫・抗ウイルス", 110),
  medGroupSeed("oral", "seed-med-oral-immuno", "免疫抑制", 120),
  medGroupSeed("oral", "seed-med-oral-vitamin", "ビタミン代謝", 130),
  medGroupSeed("oral", "seed-med-oral-hormone", "ホルモン", 140),
  medGroupSeed("oral", "seed-med-oral-blood", "血液", 150),
  medGroupSeed("oral", "seed-med-oral-anticancer", "抗がん剤", 160),
  medGroupSeed("oral", "seed-med-oral-kampo", "漢方", 170),
  medGroupSeed("oral", MED_ORAL_OTHER_GROUP_ID, "その他", 180),
  medGroupSeed("oral", "seed-med-oral-inject-suppository", "処方注射薬・座薬", 190),
  medGroupSeed("topical", "seed-med-topical-skin", "皮膚", 10),
  medGroupSeed("topical", "seed-med-topical-disinfect", "消毒", 20),
  medGroupSeed("topical", "seed-med-topical-ear", "耳", 30),
];

const MEDICATION_ITEM_GROUP_SEED_IDS = new Set(
  MEDICATION_ITEM_GROUP_SEED.map((s) => s.id)
);

const store = {
  medicationItems: {
    // 旧フラット薬剤（移行対象）
    legacy1: { label: "アモキシシリン", order: 1 },
    legacy2: { label: "アラバ", order: 2 },
    legacy3: { label: "パラディア", order: 3 },
  },
  medications: {},
};

const itemListeners = [];
const medListeners = new Map();
let seq = 0;
const nid = (p) => p + ++seq;

function ensureMeds(k) {
  if (!store.medications[k]) store.medications[k] = {};
  return store.medications[k];
}

function listItems() {
  return Object.entries(store.medicationItems)
    .map(([id, t]) => normalizeMedicationItem(id, t))
    .sort((a, b) => {
      const ord = (a.order ?? 0) - (b.order ?? 0);
      if (ord !== 0) return ord;
      return (a.label || "").localeCompare(b.label || "", "ja");
    });
}

function notifyItems() {
  const items = listItems();
  itemListeners.forEach((cb) => cb(items.map((x) => ({ ...x }))));
}

function notifyMeds(k) {
  const drugs = Object.entries(ensureMeds(k)).map(([id, d]) => ({
    id,
    ...d,
    events: d.events || {},
  }));
  (medListeners.get(k) || []).forEach((cb) =>
    cb(drugs.map((x) => structuredClone(x)))
  );
}

export async function ensureMedicationItemDefaults() {
  const existing = store.medicationItems;
  MEDICATION_ITEM_GROUP_SEED.forEach((seed) => {
    const row = existing[seed.id];
    if (!row) {
      existing[seed.id] = {
        label: seed.label,
        category: seed.category,
        kind: "group",
        parentId: "",
        order: seed.order,
      };
      return;
    }
    existing[seed.id] = {
      label: seed.label,
      category: seed.category,
      kind: "group",
      parentId: "",
      order: seed.order,
    };
  });

  Object.entries(existing).forEach(([id, row]) => {
    if (!row || typeof row !== "object") return;
    if (MEDICATION_ITEM_GROUP_SEED_IDS.has(id)) return;

    const hasCategory = Object.prototype.hasOwnProperty.call(row, "category");
    const hasKind = Object.prototype.hasOwnProperty.call(row, "kind");
    const kind = normalizeMedicationItemKind(row.kind);
    const category = hasCategory
      ? normalizeMedicationItemCategory(row.category)
      : "";
    const parentId = String(row.parentId || "").trim();
    const isLegacyFlat = !hasCategory || !hasKind;
    const isOrphanLeaf =
      kind === "leaf" &&
      (category === "oral" || category === "topical") &&
      !parentId;

    if (!isLegacyFlat && !isOrphanLeaf) return;

    existing[id] = {
      label: row.label || "",
      category: "oral",
      kind: "leaf",
      parentId: MED_ORAL_OTHER_GROUP_ID,
      order: typeof row.order === "number" ? row.order : Date.now(),
    };
  });

  notifyItems();
}

export function subscribeMedicationItems(cb) {
  itemListeners.push(cb);
  ensureMedicationItemDefaults().then(() => notifyItems());
  return () => {
    const i = itemListeners.indexOf(cb);
    if (i >= 0) itemListeners.splice(i, 1);
  };
}

export function subscribeMedications(karte, cb) {
  const list = medListeners.get(karte) || [];
  list.push(cb);
  medListeners.set(karte, list);
  notifyMeds(karte);
  return () =>
    medListeners.set(
      karte,
      (medListeners.get(karte) || []).filter((x) => x !== cb)
    );
}

export async function addMedicationItem({
  label,
  order,
  category,
  kind = "leaf",
  parentId = "",
}) {
  const id = nid("mitem");
  const resolvedKind = normalizeMedicationItemKind(kind);
  store.medicationItems[id] = {
    label: label || "",
    category: normalizeMedicationItemCategory(category),
    kind: resolvedKind,
    parentId: resolvedKind === "group" ? "" : String(parentId || "").trim(),
    order: typeof order === "number" ? order : Date.now(),
  };
  notifyItems();
  return id;
}

export async function addMedication(
  karte,
  { name, category, frequencyChange, frequency, changedBy, eventDate }
) {
  const id = nid("drug");
  const date = eventDate || "2026-07-01";
  ensureMeds(karte)[id] = {
    schemaVersion: 1,
    name: name || "",
    category: category || "A",
    sideEffectNote: "",
    expiryEstimate: "",
    events: {
      [nid("ev")]: {
        date,
        type: "add",
        detail: "開始／継続",
        frequencyChange: frequencyChange || "",
        frequency: frequency || null,
        amountChange: "",
        changedBy: changedBy || "",
      },
    },
  };
  notifyMeds(karte);
  return id;
}

export async function updateMedication() {}
export async function deleteMedication() {}
export async function addMedicationEvent(
  karte,
  drugId,
  { date, type, detail, frequencyChange, frequency, amountChange, changedBy }
) {
  const drug = ensureMeds(karte)[drugId];
  if (!drug) throw new Error("drug missing");
  if (!drug.events) drug.events = {};
  const id = nid("ev");
  drug.events[id] = {
    date: date || "2026-07-01",
    type: type || "add",
    detail: detail || "",
    frequencyChange: frequencyChange || "",
    frequency: frequency || null,
    amountChange: amountChange || "",
    changedBy: changedBy || "",
  };
  notifyMeds(karte);
  return id;
}
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function fetchMedicationsOnce(karte) {
  return Object.entries(ensureMeds(karte)).map(([id, d]) => ({
    id,
    ...d,
    events: d.events || {},
  }));
}

/** 検証用 */
export function __getStore() {
  return store;
}
