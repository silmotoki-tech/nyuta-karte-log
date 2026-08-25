// 検査項目分類＋血液階層＋絶食付きモック

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

const CATEGORY_IDS = new Set(EXAM_ITEM_CATEGORIES.map((c) => c.id));

export function normalizeExamItemCategory(category) {
  const id = String(category || "").trim();
  return CATEGORY_IDS.has(id) ? id : "other";
}

export function normalizeExamItemKind(kind) {
  return String(kind || "").trim() === "group" ? "group" : "leaf";
}

export function normalizeExamFasting(value) {
  const v = String(value || "").trim();
  if (v === EXAM_FASTING.REQUIRED || v === EXAM_FASTING.NONE) return v;
  return "";
}

export function examFastingLabel(value) {
  const v = normalizeExamFasting(value);
  if (v === EXAM_FASTING.REQUIRED) return "必要";
  if (v === EXAM_FASTING.NONE) return "不要";
  return "";
}

function bloodGroupSeed(group) {
  return categoryGroupSeed("blood", group);
}

function categoryGroupSeed(category, group) {
  const rows = [
    {
      id: group.id,
      label: group.label,
      category,
      kind: "group",
      parentId: "",
      order: group.order,
    },
  ];
  (group.children || []).forEach((child, index) => {
    const row = {
      id: child.id,
      label: child.label,
      category,
      kind: "leaf",
      parentId: group.id,
      order: (index + 1) * 10,
    };
    if (child.defaultFasting) row.defaultFasting = child.defaultFasting;
    rows.push(row);
  });
  return rows;
}

const SEED = [
  {
    id: "seed-blood-cbc",
    label: "CBC",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 1,
    defaultFasting: "none",
  },
  ...bloodGroupSeed({
    id: "seed-blood-liver",
    label: "肝臓",
    order: 10,
    children: [
      { id: "seed-blood-liver-scr", label: "肝スク", defaultFasting: "required" },
      { id: "seed-blood-liver-alt", label: "ALT", defaultFasting: "required" },
      { id: "seed-blood-liver-ast", label: "AST", defaultFasting: "required" },
      { id: "seed-blood-liver-alp", label: "ALP", defaultFasting: "required" },
      { id: "seed-blood-liver-ggt", label: "GGT", defaultFasting: "required" },
      { id: "seed-blood-liver-tbil", label: "総ビリルビン", defaultFasting: "required" },
      { id: "seed-blood-liver-tba-prepost", label: "TBA(pre・post)", defaultFasting: "required" },
      { id: "seed-blood-liver-tba-post", label: "TBA(post)", defaultFasting: "none" },
    ],
  }),
  ...bloodGroupSeed({
    id: "seed-blood-kidney",
    label: "腎臓",
    order: 20,
    children: [
      { id: "seed-blood-kidney-scr", label: "腎スク", defaultFasting: "required" },
      { id: "seed-blood-kidney-bun", label: "BUN", defaultFasting: "required" },
      { id: "seed-blood-kidney-cre", label: "Cre", defaultFasting: "required" },
      { id: "seed-blood-kidney-ca", label: "Ca", defaultFasting: "required" },
      { id: "seed-blood-kidney-ip", label: "IP", defaultFasting: "required" },
      { id: "seed-blood-kidney-electrolyte", label: "電解質", defaultFasting: "required" },
      { id: "seed-blood-kidney-panel-idexx", label: "腎パネル(IDEXX)", defaultFasting: "required" },
    ],
  }),
  ...bloodGroupSeed({
    id: "seed-blood-lipid",
    label: "脂質",
    order: 30,
    children: [
      { id: "seed-blood-lipid-tcho", label: "T-Cho", defaultFasting: "required" },
      { id: "seed-blood-lipid-tg", label: "TG", defaultFasting: "required" },
    ],
  }),
  ...bloodGroupSeed({
    id: "seed-blood-hormone",
    label: "ホルモン",
    order: 40,
    children: [
      { id: "seed-blood-hormone-acth", label: "ACTH通常", defaultFasting: "none" },
      { id: "seed-blood-hormone-acth-matsuki", label: "ACTH松木式", defaultFasting: "none" },
      { id: "seed-blood-hormone-t4", label: "T4", defaultFasting: "none" },
      { id: "seed-blood-hormone-ft4", label: "fT4", defaultFasting: "none" },
    ],
  }),
  {
    id: "seed-blood-glucose-antosense",
    label: "血糖(アントセンス)",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 110,
    defaultFasting: "required",
  },
  {
    id: "seed-blood-glucose-drychem",
    label: "血糖(ドライケム)",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 120,
    defaultFasting: "required",
  },
  {
    id: "seed-blood-crp",
    label: "CRP",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 130,
    defaultFasting: "none",
  },
  {
    id: "seed-blood-saa",
    label: "SAA",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 140,
    defaultFasting: "none",
  },
  {
    id: "seed-blood-checkup-fujifilm",
    label: "健診セット(FUJIFILM)",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 150,
    defaultFasting: "required",
  },
  {
    id: "seed-blood-checkup-idexx",
    label: "健診セット(IDEXX)",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 160,
    defaultFasting: "required",
  },
  ...categoryGroupSeed("imaging", {
    id: "seed-imaging-set",
    label: "セット",
    order: 10,
    children: [
      { id: "seed-imaging-full-scr", label: "全set" },
      { id: "seed-other-chest-set", label: "胸部set" },
      { id: "seed-other-abdomen-set", label: "腹部set" },
    ],
  }),
  ...categoryGroupSeed("imaging", {
    id: "seed-imaging-heart-echo",
    label: "心エコー",
    order: 20,
    children: [
      { id: "seed-imaging-heart-echo-scr", label: "スクリーニング" },
      { id: "seed-imaging-heart-echo-flow", label: "流速あり" },
      { id: "seed-imaging-heart-echo-enlarge", label: "拡大チェック" },
    ],
  }),
  ...categoryGroupSeed("imaging", {
    id: "seed-imaging-abdomen-echo",
    label: "腹部エコー",
    order: 25,
    children: [
      { id: "seed-imaging-abdomen-echo-scr", label: "スクリーニング" },
      { id: "seed-imaging-abdomen-echo-spleen", label: "脾臓" },
      { id: "seed-imaging-abdomen-echo-liver", label: "肝臓" },
      { id: "seed-imaging-abdomen-echo-kidney", label: "腎臓" },
      { id: "seed-imaging-abdomen-echo-ureter", label: "尿管" },
      { id: "seed-imaging-abdomen-echo-bladder", label: "膀胱" },
      { id: "seed-imaging-abdomen-echo-prostate", label: "前立腺" },
    ],
  }),
  ...categoryGroupSeed("imaging", {
    id: "seed-imaging-xray",
    label: "レントゲン",
    order: 30,
    children: [
      { id: "seed-imaging-xray-chest", label: "胸部" },
      { id: "seed-imaging-xray-trachea", label: "気管" },
      { id: "seed-imaging-xray-abdomen", label: "腹部" },
      { id: "seed-imaging-xray-hip", label: "股関節" },
      { id: "seed-imaging-xray-shoulder", label: "肩" },
      { id: "seed-imaging-xray-forelimb", label: "前肢" },
      { id: "seed-imaging-xray-hindlimb", label: "後肢" },
      { id: "seed-imaging-xray-nose", label: "鼻" },
      { id: "seed-imaging-xray-tooth", label: "歯" },
    ],
  }),
  {
    id: "seed-pathology-cyto-inhouse",
    label: "細胞診(院内)",
    category: "pathology",
    kind: "leaf",
    parentId: "",
    order: 10,
  },
  {
    id: "seed-pathology-cyto-outlab",
    label: "細胞診(外注)",
    category: "pathology",
    kind: "leaf",
    parentId: "",
    order: 20,
  },
  {
    id: "seed-pathology-histo",
    label: "組織検査",
    category: "pathology",
    kind: "leaf",
    parentId: "",
    order: 30,
  },
  {
    id: "seed-pathology-bact-culture-inhouse",
    label: "細菌培養(院内)",
    category: "pathology",
    kind: "leaf",
    parentId: "",
    order: 40,
  },
  {
    id: "seed-pathology-bact-culture-outlab",
    label: "細菌培養(外注)",
    category: "pathology",
    kind: "leaf",
    parentId: "",
    order: 50,
  },
  {
    id: "seed-pathology-fungal-culture-inhouse",
    label: "真菌培養(院内)",
    category: "pathology",
    kind: "leaf",
    parentId: "",
    order: 60,
  },
  {
    id: "seed-pathology-fungal-culture-outlab",
    label: "真菌培養(外注)",
    category: "pathology",
    kind: "leaf",
    parentId: "",
    order: 70,
  },
  {
    id: "seed-other-urine-no-upc",
    label: "尿検査(UPCなし)",
    category: "other",
    kind: "leaf",
    parentId: "",
    order: 10,
  },
  {
    id: "seed-other-urine-upc",
    label: "尿検査(UPCあり)",
    category: "other",
    kind: "leaf",
    parentId: "",
    order: 20,
  },
  {
    id: "seed-other-upc-outlab",
    label: "UPC(外注)",
    category: "other",
    kind: "leaf",
    parentId: "",
    order: 30,
  },
  {
    id: "seed-other-fecal",
    label: "便検査",
    category: "other",
    kind: "leaf",
    parentId: "",
    order: 40,
  },
  {
    id: "seed-other-diarrhea-panel",
    label: "下痢パネル",
    category: "other",
    kind: "leaf",
    parentId: "",
    order: 50,
  },
  {
    id: "seed-other-cardio-clinic",
    label: "循環器診療",
    category: "other",
    kind: "leaf",
    parentId: "",
    order: 60,
  },
];

const store = {
  examItems: {},
  examPlan: {},
};
const itemListeners = [];
const planListeners = new Map();
let seq = 0;
const nid = (p) => p + (++seq);

function emptyPlan() {
  return { schemaVersion: 2, plans: {}, history: {} };
}
function ensurePlan(k) {
  if (!store.examPlan[k]) store.examPlan[k] = emptyPlan();
  return store.examPlan[k];
}
function normalizeItem(id, raw) {
  const kind = normalizeExamItemKind(raw.kind);
  return {
    id,
    label: raw.label || "",
    category: normalizeExamItemCategory(raw.category),
    kind,
    parentId: kind === "group" ? "" : String(raw.parentId || "").trim(),
    order: typeof raw.order === "number" ? raw.order : 0,
    defaultFasting: normalizeExamFasting(raw.defaultFasting),
  };
}
function notifyItems() {
  const items = Object.entries(store.examItems).map(([id, t]) => normalizeItem(id, t));
  items.sort((a, b) => {
    const ord = (a.order ?? 0) - (b.order ?? 0);
    if (ord !== 0) return ord;
    return (a.label || "").localeCompare(b.label || "");
  });
  itemListeners.forEach((cb) => cb(items.map((x) => ({ ...x }))));
}
function notifyPlan(k) {
  (planListeners.get(k) || []).forEach((cb) => cb(structuredClone(ensurePlan(k))));
}

export async function ensureExamItemDefaults() {
  SEED.forEach((seed) => {
    const fasting = normalizeExamFasting(seed.defaultFasting);
    if (!store.examItems[seed.id]) {
      const row = {
        label: seed.label,
        category: seed.category,
        kind: seed.kind || "leaf",
        parentId: seed.parentId || "",
        order: seed.order,
      };
      if (fasting) row.defaultFasting = fasting;
      store.examItems[seed.id] = row;
      return;
    }
    if (fasting && normalizeExamFasting(store.examItems[seed.id].defaultFasting) !== fasting) {
      store.examItems[seed.id].defaultFasting = fasting;
    }
  });
  notifyItems();
}

export function subscribeExamItems(cb) {
  itemListeners.push(cb);
  ensureExamItemDefaults().then(() => notifyItems());
  return () => {
    const i = itemListeners.indexOf(cb);
    if (i >= 0) itemListeners.splice(i, 1);
  };
}

export function subscribeExamPlan(karte, cb) {
  const list = planListeners.get(karte) || [];
  list.push(cb);
  planListeners.set(karte, list);
  cb(structuredClone(ensurePlan(karte)));
  return () =>
    planListeners.set(
      karte,
      (planListeners.get(karte) || []).filter((x) => x !== cb)
    );
}

export async function getExamPlan(karte) {
  return structuredClone(ensurePlan(karte));
}

export async function addExamItem({ label, order, category, kind = "leaf", parentId = "" }) {
  const resolvedKind = normalizeExamItemKind(kind);
  const id = nid("item");
  store.examItems[id] = {
    label: label || "",
    category: normalizeExamItemCategory(category),
    kind: resolvedKind,
    parentId: resolvedKind === "group" ? "" : String(parentId || "").trim(),
    order: typeof order === "number" ? order : Date.now(),
  };
  notifyItems();
  return id;
}

export async function saveExamScheduledPlan(
  karte,
  { planId = null, item, dueDate, dueDateFrom, dueDateTo, note, baselineDate, fasting }
) {
  const plan = ensurePlan(karte);
  let id = planId;
  if (!id) {
    const found = Object.entries(plan.plans).find(
      ([, p]) => (p.item || "").trim() === (item || "").trim()
    );
    id = found ? found[0] : nid("plan");
  }
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
  plan.plans[id] = {
    item: item || "",
    dueDate: date,
    dueDateFrom: from || date,
    dueDateTo: to || date,
    baselineDate: baselineDate || date,
    note: note || "",
    fasting: normalizeExamFasting(fasting),
  };
  notifyPlan(karte);
  return id;
}

export async function deleteExamScheduledPlan(karte, planId) {
  delete ensurePlan(karte).plans[planId];
  notifyPlan(karte);
}
export async function endExamScheduledPlan(karte, planId) {
  return deleteExamScheduledPlan(karte, planId);
}
export async function reviveExamPlanByItem(karte, { item, note = "", fasting = "" }) {
  return saveExamScheduledPlan(karte, {
    item,
    dueDate: "",
    note,
    fasting,
    baselineDate: "2026-07-22",
  });
}
export async function addExamHistory(karte, { item, date, note }) {
  const id = nid("hist");
  ensurePlan(karte).history[id] = { item, date, note: note || "" };
  notifyPlan(karte);
  return id;
}
export const EXAM_PLAN_SCHEMA_VERSION = 2;

/** 検証用 */
export function __getStore() {
  return store;
}

export function __resetExamPlan(karte) {
  store.examPlan[karte] = emptyPlan();
  notifyPlan(karte);
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

export function examItemCategoryLabel() {
  return "";
}

export async function updateExamItem() {}

export async function deleteExamItem() {}

export async function setNextExamPlan() {}

export async function clearNextExamPlan() {}

export async function updateExamHistory() {}

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
