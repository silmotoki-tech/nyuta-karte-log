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
  const rows = [
    {
      id: group.id,
      label: group.label,
      category: "blood",
      kind: "group",
      parentId: "",
      order: group.order,
    },
  ];
  (group.children || []).forEach((child, index) => {
    rows.push({
      id: child.id,
      label: child.label,
      category: "blood",
      kind: "leaf",
      parentId: group.id,
      order: (index + 1) * 10,
    });
  });
  return rows;
}

const SEED = [
  { id: "seed-blood-cbc", label: "CBC", category: "blood", kind: "leaf", parentId: "", order: 1 },
  ...bloodGroupSeed({
    id: "seed-blood-liver",
    label: "肝臓",
    order: 10,
    children: [
      { id: "seed-blood-liver-scr", label: "肝スク" },
      { id: "seed-blood-liver-alt", label: "ALT" },
      { id: "seed-blood-liver-ast", label: "AST" },
      { id: "seed-blood-liver-alp", label: "ALP" },
      { id: "seed-blood-liver-ggt", label: "GGT" },
      { id: "seed-blood-liver-tbil", label: "総ビリルビン" },
      { id: "seed-blood-liver-tba-prepost", label: "TBA(pre・post)" },
      { id: "seed-blood-liver-tba-post", label: "TBA(post)" },
    ],
  }),
  ...bloodGroupSeed({
    id: "seed-blood-kidney",
    label: "腎臓",
    order: 20,
    children: [
      { id: "seed-blood-kidney-scr", label: "腎スク" },
      { id: "seed-blood-kidney-bun", label: "BUN" },
      { id: "seed-blood-kidney-cre", label: "Cre" },
      { id: "seed-blood-kidney-ca", label: "Ca" },
      { id: "seed-blood-kidney-ip", label: "IP" },
      { id: "seed-blood-kidney-electrolyte", label: "電解質" },
      { id: "seed-blood-kidney-panel-idexx", label: "腎パネル(IDEXX)" },
    ],
  }),
  ...bloodGroupSeed({
    id: "seed-blood-lipid",
    label: "脂質",
    order: 30,
    children: [
      { id: "seed-blood-lipid-tcho", label: "T-Cho" },
      { id: "seed-blood-lipid-tg", label: "TG" },
    ],
  }),
  ...bloodGroupSeed({
    id: "seed-blood-hormone",
    label: "ホルモン",
    order: 40,
    children: [
      { id: "seed-blood-hormone-acth", label: "ACTH通常" },
      { id: "seed-blood-hormone-acth-matsuki", label: "ACTH松木式" },
      { id: "seed-blood-hormone-t4", label: "T4" },
      { id: "seed-blood-hormone-ft4", label: "fT4" },
    ],
  }),
  {
    id: "seed-blood-glucose-antosense",
    label: "血糖(アントセンス)",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 110,
  },
  {
    id: "seed-blood-glucose-drychem",
    label: "血糖(ドライケム)",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 120,
  },
  { id: "seed-blood-crp", label: "CRP", category: "blood", kind: "leaf", parentId: "", order: 130 },
  { id: "seed-blood-saa", label: "SAA", category: "blood", kind: "leaf", parentId: "", order: 140 },
  {
    id: "seed-blood-checkup-fujifilm",
    label: "健診セット(FUJIFILM)",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 150,
  },
  {
    id: "seed-blood-checkup-idexx",
    label: "健診セット(IDEXX)",
    category: "blood",
    kind: "leaf",
    parentId: "",
    order: 160,
  },
  {
    id: "seed-other-chest-set",
    label: "胸部スク",
    category: "imaging",
    kind: "leaf",
    parentId: "",
    order: 10,
  },
  {
    id: "seed-other-abdomen-set",
    label: "腹部スク",
    category: "imaging",
    kind: "leaf",
    parentId: "",
    order: 20,
  },
  {
    id: "seed-imaging-full-scr",
    label: "全スク",
    category: "imaging",
    kind: "leaf",
    parentId: "",
    order: 30,
  },
  {
    id: "seed-imaging-abdomen-echo",
    label: "腹部エコー",
    category: "imaging",
    kind: "leaf",
    parentId: "",
    order: 40,
  },
  {
    id: "seed-imaging-heart-echo",
    label: "心エコー",
    category: "imaging",
    kind: "leaf",
    parentId: "",
    order: 50,
  },
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
    if (!store.examItems[seed.id]) {
      store.examItems[seed.id] = {
        label: seed.label,
        category: seed.category,
        kind: seed.kind || "leaf",
        parentId: seed.parentId || "",
        order: seed.order,
      };
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
  { planId = null, item, dueDate, note, baselineDate, fasting }
) {
  const plan = ensurePlan(karte);
  let id = planId;
  if (!id) {
    const found = Object.entries(plan.plans).find(
      ([, p]) => (p.item || "").trim() === (item || "").trim()
    );
    id = found ? found[0] : nid("plan");
  }
  const date = dueDate || "";
  plan.plans[id] = {
    item: item || "",
    dueDate: date,
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
