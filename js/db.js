// Firebase Realtime Database とのやり取りをまとめたモジュール。
//
// データ構造:
//   karte/{カルテ番号}/animalName                       … 動物名（カナ）
//   karte/{カルテ番号}/entries/{entryId}/recordDate      … 記録日（出来事があった日, "YYYY-MM-DD"）
//   karte/{カルテ番号}/entries/{entryId}/enteredAt       … 実際にシステムへ入力した時刻（サーバータイムスタンプ）
//   karte/{カルテ番号}/entries/{entryId}/enteredAtIso    … 入力時刻のISO文字列（表示・並び替えのフォールバック）
//   karte/{カルテ番号}/entries/{entryId}/headline        … 見出し（その日のメインの出来事）
//   karte/{カルテ番号}/entries/{entryId}/category        … カテゴリ（"none"|"ope"|"admission"|"referral"）
//   karte/{カルテ番号}/entries/{entryId}/important       … 重要フラグ（★, true/false）
//   karte/{カルテ番号}/entries/{entryId}/author          … 記入者名（初回）
//   karte/{カルテ番号}/entries/{entryId}/body            … 本文フリーテキスト
//   karte/{カルテ番号}/entries/{entryId}/source          … "manual"|"template"（AI解析対象の判定に使用予定）
//   karte/{カルテ番号}/entries/{entryId}/lastEditedAt    … 最終編集時刻（サーバータイムスタンプ, 任意）
//   karte/{カルテ番号}/entries/{entryId}/lastEditedAtIso … 最終編集時刻ISO（表示用, 任意）
//   karte/{カルテ番号}/entries/{entryId}/lastEditedBy    … 最終編集者名（任意）
//
//   templates/{templateId}/label                        … 定型文ボタンのラベル
//   templates/{templateId}/text                         … 挿入される本文
//   templates/{templateId}/order                        … 並び順
//
//   examItems/{itemId}/label                            … 検査項目マスタの表示名
//   examItems/{itemId}/category                         … "blood"|"imaging"|"pathology"|"other"
//   examItems/{itemId}/kind                             … "group"|"leaf"（大項目／選択可能な項目）
//   examItems/{itemId}/parentId                         … 内訳の親大項目ID（トップレベルは空）
//   examItems/{itemId}/order                            … 並び順
//     ※初期シードは固定ID（seed-*）。無い場合のみ書き込む
//   examPlan/{カルテ番号}/plans/{planId}
//     { item, dueDate, baselineDate, dueDateFrom, dueDateTo, note, fasting, source? }
//     ※fasting: "required"|"none"|""（血液の絶食。画像・その他は空）
//     ※source: "manual"|"ai"（登録経路。画面のメモ欄には出さない）
//   examPlan/{カルテ番号}/history/{id}                   … 実施履歴
//     { item, date, note }
//
//   medicationItems/{itemId}/label                      … 薬剤マスタの表示名
//   medicationItems/{itemId}/order                      … 並び順
//
//   medications/{カルテ番号}/{drugId}/schemaVersion
//   medications/{カルテ番号}/{drugId}/name
//   medications/{カルテ番号}/{drugId}/category           … "A"|"B"|"C"
//   medications/{カルテ番号}/{drugId}/sideEffectNote
//   medications/{カルテ番号}/{drugId}/expiryEstimate     … 処方切れ目安日 "YYYY-MM-DD" or ""
//   medications/{カルテ番号}/{drugId}/events/{eventId}
//     { date, type, detail, frequencyChange, frequency, amountChange, changedBy,
//       lastEditedAt, lastEditedBy }
//     frequencyChange: 表示用ラベル（互換のため残す）
//     frequency: { kind, label, periodDays?, times?, weekdays? } … 構造化（任意）
//     lastEditedAt / lastEditedBy: 編集時のみ
//     type: "add"(継続)|"increase"|"decrease"|"stop"|"resume"
//
//   history/{カルテ番号}/{entryId}/schemaVersion         … 既往歴
//   history/{カルテ番号}/{entryId}/title
//   history/{カルテ番号}/{entryId}/type                  … "disease"|"surgery"|"referral"
//   history/{カルテ番号}/{entryId}/status                … "active"|"resolved"
//   history/{カルテ番号}/{entryId}/firstNoted            … "YYYY-MM-DD"
//   history/{カルテ番号}/{entryId}/lastUpdated           … "YYYY-MM-DD"
//   history/{カルテ番号}/{entryId}/source                … "manual"|"ai"（登録経路。将来のAI連携用）
//   history/{カルテ番号}/{entryId}/notes/{noteId}
//     { date, text, author }                             … 追記型メモ（上書きしない）
//
//   freeQA/{カルテ番号}/{questionId}/schemaVersion       … 自由質問（AI）
//   freeQA/{カルテ番号}/{questionId}/question
//   freeQA/{カルテ番号}/{questionId}/answer
//   freeQA/{カルテ番号}/{questionId}/askedAt             … ISO文字列
//   freeQA/{カルテ番号}/{questionId}/askedBy
//
//   procedures/{カルテ番号}/{entryId}/schemaVersion      … 処置ログ
//   procedures/{カルテ番号}/{entryId}/date               … "YYYY-MM-DD"
//   procedures/{カルテ番号}/{entryId}/content            … 処置内容
//   procedures/{カルテ番号}/{entryId}/confirmedBy        … 記入者
//   procedures/{カルテ番号}/{entryId}/lastEditedAt       … 最終編集ISO（任意）
//   procedures/{カルテ番号}/{entryId}/lastEditedBy       … 最終編集者（任意）
//
// 方針: 参照用メモとしてエントリの直接編集（上書き）を許可する。
//       最終編集日時・編集者のみ記録し、詳細な差分履歴は持たない。
//       誤入力エントリの削除も許可する。
//       検査予定は手動操作専用（AI解析には頼らない）。

import {
  getDatabase,
  ref,
  get,
  set,
  push,
  update,
  remove,
  onValue,
  off,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { app } from "./firebase-app.js";
import { authReady } from "./auth.js";

const db = getDatabase(app);

function entriesRef(karteNumber) {
  return ref(db, `karte/${karteNumber}/entries`);
}

function entryRef(karteNumber, entryId) {
  return ref(db, `karte/${karteNumber}/entries/${entryId}`);
}

// --- 動物名 --------------------------------------------------------------

/**
 * カルテ番号に紐づく動物名（カナ）を取得する。未登録の場合は null。
 */
export async function getAnimalName(karteNumber) {
  await authReady;
  const snapshot = await get(ref(db, `karte/${karteNumber}/animalName`));
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * カルテ番号に動物名（カナ）を登録・更新する。
 */
export async function setAnimalName(karteNumber, animalName) {
  await authReady;
  await set(ref(db, `karte/${karteNumber}/animalName`), animalName);
}

// --- エントリ ------------------------------------------------------------

/**
 * 新しい記入エントリを追加する（追記型）。
 */
export async function addEntry(
  karteNumber,
  { recordDate, headline, category, important, author, body, source }
) {
  await authReady;
  const newRef = push(entriesRef(karteNumber));
  const now = new Date();
  await set(newRef, {
    recordDate,
    enteredAt: serverTimestamp(),
    enteredAtIso: now.toISOString(),
    headline: headline || "",
    category: category || "none",
    important: Boolean(important),
    author,
    body: body || "",
    source: source || "manual",
  });
  return newRef.key;
}

/**
 * 重要フラグ(★)のみを切り替える。
 */
export async function setEntryImportant(karteNumber, entryId, important) {
  await authReady;
  await update(entryRef(karteNumber, entryId), { important: Boolean(important) });
}

/**
 * 既存エントリを上書き更新する（見出し・本文・カテゴリ・★）。
 * 最終編集日時・編集者を記録する（差分履歴は残さない）。
 */
export async function updateEntry(
  karteNumber,
  entryId,
  { headline, body, category, important, editedBy }
) {
  await authReady;
  const now = new Date();
  await update(entryRef(karteNumber, entryId), {
    headline: headline || "",
    body: body || "",
    category: category || "none",
    important: Boolean(important),
    lastEditedAt: serverTimestamp(),
    lastEditedAtIso: now.toISOString(),
    lastEditedBy: editedBy || "",
  });
}

/**
 * 誤入力エントリを削除する。
 */
export async function deleteEntry(karteNumber, entryId) {
  await authReady;
  await remove(entryRef(karteNumber, entryId));
}

/**
 * 指定カルテ番号の記入エントリ一覧をリアルタイム監視する。
 * callback には記録日(recordDate)の降順（新しい→古い）に並べた配列が渡される。
 * 同一記録日のなかでは入力時刻(enteredAt)の降順で並ぶ。
 * 戻り値の関数を呼ぶと監視を停止できる。
 */
export function subscribeEntries(karteNumber, callback) {
  const r = entriesRef(karteNumber);
  let unsubscribed = false;
  let listener = null;

  authReady
    .then(() => {
      if (unsubscribed) return;
      listener = onValue(r, (snapshot) => {
        const value = snapshot.val() || {};
        const entries = Object.entries(value).map(([id, entry]) =>
          normalizeEntry(id, entry)
        );
        callback(sortEntriesDescending(entries));
      });
    })
    .catch((err) => {
      console.error("記録の監視開始に失敗しました", err);
    });

  return () => {
    unsubscribed = true;
    if (listener) {
      off(r, "value", listener);
      listener = null;
    }
  };
}

/**
 * 旧スキーマ（date / text）で保存されたエントリも表示できるよう吸収する。
 */
function normalizeEntry(id, raw) {
  const entry = { id, ...raw };

  // 本文: 旧 text → body
  if (entry.body == null && entry.text != null) {
    entry.body = entry.text;
  }
  entry.body = entry.body || "";

  // 記録日: recordDate が無ければ旧 date / enteredAtIso から日付部分を導出
  if (!entry.recordDate) {
    const fallback = entry.enteredAtIso || entry.date;
    entry.recordDate = fallback ? toDateStr(fallback) : "";
  }

  // 入力時刻の数値表現（並び替え用）
  entry.enteredMs = resolveEnteredMs(entry);

  entry.headline = entry.headline || "";
  entry.category = entry.category || "none";
  entry.important = Boolean(entry.important);
  entry.source = entry.source || "manual";
  entry.lastEditedBy = entry.lastEditedBy || "";
  entry.lastEditedAtIso = entry.lastEditedAtIso || "";
  entry.lastEditedMs = resolveLastEditedMs(entry);

  return entry;
}

function resolveLastEditedMs(entry) {
  if (typeof entry.lastEditedAt === "number") return entry.lastEditedAt;
  if (entry.lastEditedAt && typeof entry.lastEditedAt === "object") {
    if (typeof entry.lastEditedAt.seconds === "number") {
      return entry.lastEditedAt.seconds * 1000;
    }
    if (typeof entry.lastEditedAt._seconds === "number") {
      return entry.lastEditedAt._seconds * 1000;
    }
  }
  if (entry.lastEditedAtIso) {
    const parsed = Date.parse(entry.lastEditedAtIso);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function resolveEnteredMs(entry) {
  if (typeof entry.enteredAt === "number") return entry.enteredAt;
  // Firebase の Timestamp 風オブジェクトにも対応
  if (entry.enteredAt && typeof entry.enteredAt === "object") {
    if (typeof entry.enteredAt.seconds === "number") {
      return entry.enteredAt.seconds * 1000;
    }
    if (typeof entry.enteredAt._seconds === "number") {
      return entry.enteredAt._seconds * 1000;
    }
  }
  const iso = entry.enteredAtIso || entry.date || entry.createdAt;
  const parsed = iso != null ? Date.parse(iso) : NaN;
  if (!Number.isNaN(parsed)) return parsed;
  if (typeof entry.createdAt === "number") return entry.createdAt;
  return 0;
}

function compareEntries(a, b) {
  // 降順: 新しい記録日が先。同一記録日なら新しい入力時刻が先。
  const rd = (b.recordDate || "").localeCompare(a.recordDate || "");
  if (rd !== 0) return rd;
  return (b.enteredMs || 0) - (a.enteredMs || 0);
}

/**
 * 記録日・入力時刻の降順（新しい→古い）に並べた新しい配列を返す。
 * UI（時系列・見出し）からも再利用して順序を保証する。
 */
export function sortEntriesDescending(entries) {
  return [...(entries || [])].sort(compareEntries);
}

function toDateStr(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// --- 定型文マスタ ---------------------------------------------------------

function templatesRef() {
  return ref(db, "templates");
}

/**
 * 定型文マスタをリアルタイム監視する。order 昇順で callback に渡す。
 */
export function subscribeTemplates(callback) {
  const r = templatesRef();
  let unsubscribed = false;
  let listener = null;

  authReady
    .then(() => {
      if (unsubscribed) return;
      listener = onValue(r, (snapshot) => {
        const value = snapshot.val() || {};
        const templates = Object.entries(value).map(([id, t]) => ({ id, ...t }));
        templates.sort((a, b) => {
          const ord = (a.order ?? 0) - (b.order ?? 0);
          if (ord !== 0) return ord;
          return (a.label || "").localeCompare(b.label || "");
        });
        callback(templates);
      });
    })
    .catch((err) => {
      console.error("定型文の監視開始に失敗しました", err);
    });

  return () => {
    unsubscribed = true;
    if (listener) {
      off(r, "value", listener);
      listener = null;
    }
  };
}

/**
 * 定型文を追加する。order は末尾に配置する。
 */
export async function addTemplate({ label, text, order }) {
  await authReady;
  const newRef = push(templatesRef());
  await set(newRef, {
    label: label || "",
    text: text || "",
    order: typeof order === "number" ? order : Date.now(),
  });
  return newRef.key;
}

/**
 * 定型文を更新する。
 */
export async function updateTemplate(templateId, { label, text }) {
  await authReady;
  await update(ref(db, `templates/${templateId}`), {
    label: label || "",
    text: text || "",
  });
}

/**
 * 定型文を削除する。
 */
export async function deleteTemplate(templateId) {
  await authReady;
  await remove(ref(db, `templates/${templateId}`));
}

// --- 検査項目マスタ -------------------------------------------------------

export const EXAM_ITEM_CATEGORIES = [
  { id: "blood", label: "血液" },
  { id: "imaging", label: "画像" },
  { id: "pathology", label: "病理" },
  { id: "other", label: "その他" },
];

const EXAM_ITEM_CATEGORY_IDS = new Set(EXAM_ITEM_CATEGORIES.map((c) => c.id));

/** 絶食フラグ: required=必要 / none=不要 / 空=未設定（血液以外） */
export const EXAM_FASTING = {
  REQUIRED: "required",
  NONE: "none",
};

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

/**
 * 血液シードの親子を展開するヘルパー。
 * @param {{ id: string, label: string, order: number, children: { id: string, label: string }[] }} group
 */
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

/** 初期シード（固定ID。未作成時は作成、既存シードは order だけ同期） */
const EXAM_ITEM_SEED = [
  { id: "seed-blood-cbc", label: "CBC", category: "blood", kind: "leaf", parentId: "", order: 1 },
  ...bloodGroupSeed({
    id: "seed-blood-liver",
    label: "肝臓",
    order: 10,
    children: [
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
    // 旧「その他」シードIDを流用し、画像へ移す（既存DBを確実に更新）
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
    label: "尿検査(UPC)",
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
];

/** 一時的に作った重複シード（旧IDへ統合したため削除） */
const EXAM_ITEM_SEED_RETIRE = [
  "seed-imaging-chest-scr",
  "seed-imaging-abdomen-scr",
];

/** 旧名称→新名称の強制移行（IDに依存しない） */
const EXAM_ITEM_LABEL_MIGRATE = [
  { from: "胸部セット", to: "胸部スク", category: "imaging", order: 10 },
  { from: "腹部セット", to: "腹部スク", category: "imaging", order: 20 },
];

function examItemsRef() {
  return ref(db, "examItems");
}

export function normalizeExamItemCategory(category) {
  const id = String(category || "").trim();
  return EXAM_ITEM_CATEGORY_IDS.has(id) ? id : "other";
}

export function normalizeExamItemKind(kind) {
  return String(kind || "").trim() === "group" ? "group" : "leaf";
}

function normalizeExamItem(id, raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  let kind = normalizeExamItemKind(row.kind);
  let parentId = String(row.parentId || "").trim();
  let label = row.label || "";
  let category = normalizeExamItemCategory(row.category);
  let order = typeof row.order === "number" ? row.order : 0;

  // 旧「その他」スク項目の強制補正（端末に古い値が残っていても表示・分類を正す）
  if (id === "seed-other-chest-set" || label.trim() === "胸部セット") {
    label = "胸部スク";
    category = "imaging";
    kind = "leaf";
    parentId = "";
    order = 10;
  } else if (id === "seed-other-abdomen-set" || label.trim() === "腹部セット") {
    label = "腹部スク";
    category = "imaging";
    kind = "leaf";
    parentId = "";
    order = 20;
  }

  return {
    id,
    label,
    category,
    kind,
    parentId: kind === "group" ? "" : parentId,
    order,
  };
}

function examItemSeedPayload(seed) {
  return {
    label: seed.label,
    category: normalizeExamItemCategory(seed.category),
    kind: normalizeExamItemKind(seed.kind),
    parentId: seed.parentId || "",
    order: seed.order,
  };
}

/**
 * 初期検査項目を不足分だけ書き込み、既存シードの label / category / order を定義に同期する。
 * ユーザーが追加した項目は触らない。廃止シードは削除する。
 */
export async function ensureExamItemDefaults() {
  await authReady;
  const snap = await get(examItemsRef());
  const existing = snap.exists() && typeof snap.val() === "object" ? snap.val() : {};
  const writes = {};
  const forceRewriteIds = new Set([
    "seed-other-chest-set",
    "seed-other-abdomen-set",
    "seed-imaging-full-scr",
  ]);
  EXAM_ITEM_SEED.forEach((seed) => {
    const payload = examItemSeedPayload(seed);
    const row = existing[seed.id];
    if (!row || forceRewriteIds.has(seed.id)) {
      // 移動対象は丸ごと上書きして確実に反映
      writes[seed.id] = payload;
      return;
    }
    if ((row.label || "") !== payload.label) {
      writes[`${seed.id}/label`] = payload.label;
    }
    if (normalizeExamItemCategory(row.category) !== payload.category) {
      writes[`${seed.id}/category`] = payload.category;
    }
    if (normalizeExamItemKind(row.kind) !== payload.kind) {
      writes[`${seed.id}/kind`] = payload.kind;
    }
    if (String(row.parentId || "").trim() !== String(payload.parentId || "").trim()) {
      writes[`${seed.id}/parentId`] = payload.parentId || "";
    }
    if (typeof row.order !== "number" || row.order !== payload.order) {
      writes[`${seed.id}/order`] = payload.order;
    }
  });
  // 旧「胸部セット」「腹部セット」が別IDで残っていれば強制移行
  Object.entries(existing).forEach(([id, row]) => {
    if (!row || typeof row !== "object") return;
    if (forceRewriteIds.has(id)) return;
    const label = String(row.label || "").trim();
    const mig = EXAM_ITEM_LABEL_MIGRATE.find((m) => m.from === label);
    if (!mig) return;
    writes[id] = {
      label: mig.to,
      category: mig.category,
      kind: "leaf",
      parentId: "",
      order: mig.order,
    };
  });
  EXAM_ITEM_SEED_RETIRE.forEach((id) => {
    if (existing[id]) {
      writes[id] = null;
    }
  });
  if (Object.keys(writes).length) {
    await update(examItemsRef(), writes);
  }
}

/**
 * 検査項目マスタをリアルタイム監視する。order 昇順で callback に渡す。
 * 初期シード書き込みは監視開始後に遅延実行し、カルテ番号確認など他の通信を塞がない。
 */
export function subscribeExamItems(callback) {
  const r = examItemsRef();
  let unsubscribed = false;
  let listener = null;

  authReady
    .then(() => {
      if (unsubscribed) return;
      listener = onValue(r, (snapshot) => {
        const value = snapshot.val() || {};
        const items = Object.entries(value).map(([id, t]) => normalizeExamItem(id, t));
        items.sort((a, b) => {
          const ord = (a.order ?? 0) - (b.order ?? 0);
          if (ord !== 0) return ord;
          return (a.label || "").localeCompare(b.label || "");
        });
        callback(items);
      });
      // シードは背面で不足分だけ書く（起動直後の getAnimalName 等と競合させない）
      const runSeed = () => {
        if (unsubscribed) return;
        ensureExamItemDefaults().catch((err) => {
          console.error("検査項目マスタの初期化に失敗しました", err);
        });
      };
      setTimeout(runSeed, 0);
      // 端末キャッシュ等で初回が落ちても拾えるよう再試行
      setTimeout(runSeed, 2500);
    })
    .catch((err) => {
      console.error("検査項目マスタの監視開始に失敗しました", err);
    });

  return () => {
    unsubscribed = true;
    if (listener) {
      off(r, "value", listener);
      listener = null;
    }
  };
}

export async function addExamItem({
  label,
  order,
  category,
  kind = "leaf",
  parentId = "",
}) {
  await authReady;
  const resolvedKind = normalizeExamItemKind(kind);
  const newRef = push(examItemsRef());
  await set(newRef, {
    label: label || "",
    category: normalizeExamItemCategory(category),
    kind: resolvedKind,
    parentId: resolvedKind === "group" ? "" : String(parentId || "").trim(),
    order: typeof order === "number" ? order : Date.now(),
  });
  return newRef.key;
}

export async function updateExamItem(itemId, { label, category, kind, parentId }) {
  await authReady;
  const patch = {};
  if (label != null) patch.label = label || "";
  if (category != null) patch.category = normalizeExamItemCategory(category);
  if (kind != null) {
    patch.kind = normalizeExamItemKind(kind);
    if (patch.kind === "group") patch.parentId = "";
  }
  if (parentId != null && patch.kind !== "group") {
    patch.parentId = String(parentId || "").trim();
  }
  if (Object.keys(patch).length) {
    await update(ref(db, `examItems/${itemId}`), patch);
  }
}

export async function deleteExamItem(itemId) {
  await authReady;
  await remove(ref(db, `examItems/${itemId}`));
}

// --- 検査予定（examPlan） ------------------------------------------------
// schema v2: 検査項目ごとの次回予定 plans/ と実施履歴 history/ のみ。
// 旧 nextPlan（1件）・recurring は読み込み時に正規化で吸収／無視する。

export const EXAM_PLAN_SCHEMA_VERSION = 2;

function examPlanRef(karteNumber) {
  return ref(db, `examPlan/${karteNumber}`);
}

function emptyExamPlan() {
  return {
    schemaVersion: EXAM_PLAN_SCHEMA_VERSION,
    plans: {},
    history: {},
  };
}

/**
 * RTDB の生データを UI 向けに正規化する。
 * - v2: plans + history（旧 ended は無視）
 * - v1: nextPlan があれば plans に移す。recurring は破棄（表示しない）
 */
function normalizeExamPlan(raw) {
  const plan = emptyExamPlan();
  if (!raw || typeof raw !== "object") return plan;

  plan.schemaVersion = raw.schemaVersion || EXAM_PLAN_SCHEMA_VERSION;

  if (raw.plans && typeof raw.plans === "object" && !Array.isArray(raw.plans)) {
    plan.plans = { ...raw.plans };
  } else if (raw.nextPlan && typeof raw.nextPlan === "object") {
    // 旧単一 nextPlan → 1件の plans
    const legacy = { ...raw.nextPlan };
    delete legacy.recurringId;
    plan.plans["legacy-next"] = legacy;
  }

  if (Array.isArray(raw.history)) {
    raw.history.forEach((h, i) => {
      if (h) plan.history[`legacy-${i}`] = h;
    });
  } else if (raw.history && typeof raw.history === "object") {
    plan.history = { ...raw.history };
  }

  return plan;
}

/**
 * 検査予定をリアルタイム監視する。
 */
export function subscribeExamPlan(karteNumber, callback) {
  const r = examPlanRef(karteNumber);
  let unsubscribed = false;
  let listener = null;

  authReady
    .then(() => {
      if (unsubscribed) return;
      listener = onValue(r, (snapshot) => {
        callback(normalizeExamPlan(snapshot.val()));
      });
    })
    .catch((err) => {
      console.error("検査予定の監視開始に失敗しました", err);
    });

  return () => {
    unsubscribed = true;
    if (listener) {
      off(r, "value", listener);
      listener = null;
    }
  };
}

/**
 * schemaVersion を含むルートを必ず用意したうえで部分更新する。
 */
async function ensureExamPlanRoot(karteNumber) {
  await authReady;
  const snap = await get(examPlanRef(karteNumber));
  if (!snap.exists()) {
    await set(examPlanRef(karteNumber), emptyExamPlan());
  } else if (!snap.val()?.schemaVersion) {
    await update(examPlanRef(karteNumber), {
      schemaVersion: EXAM_PLAN_SCHEMA_VERSION,
    });
  }
}

function buildPlanRecord({ item, dueDate, note, baselineDate, fasting, source }) {
  const date = dueDate || "";
  const record = {
    item: item || "",
    dueDate: date,
    baselineDate: baselineDate || date || "",
    dueDateFrom: date,
    dueDateTo: date,
    note: note || "",
    fasting: normalizeExamFasting(fasting),
  };
  // source は内部用（メモ欄には出さない）。ai のときだけ保存する。
  if (source === "ai") record.source = "ai";
  return record;
}

/**
 * 次回予定を追加または更新する。
 * 同じ検査項目名の予定が既にあれば上書き（項目ごとに1件）。
 * 実施履歴は変更しない。旧 ended/ に同名があれば掃除する。
 * @returns {Promise<string>} planId
 */
export async function saveExamScheduledPlan(
  karteNumber,
  { planId = null, item, dueDate, note, baselineDate, fasting, source }
) {
  await ensureExamPlanRoot(karteNumber);
  const record = buildPlanRecord({ item, dueDate, note, baselineDate, fasting, source });
  const itemName = (item || "").trim();

  // 既存の同名項目を探す（編集対象自身は除く）
  const snap = await get(ref(db, `examPlan/${karteNumber}/plans`));
  const existing = snap.exists() && typeof snap.val() === "object" ? snap.val() : {};
  let targetId = planId || null;
  if (!targetId && itemName) {
    const found = Object.entries(existing).find(
      ([id, p]) => id && p && (p.item || "").trim() === itemName
    );
    if (found) targetId = found[0];
  }

  if (targetId) {
    await update(ref(db, `examPlan/${karteNumber}/plans/${targetId}`), record);
  } else {
    const newRef = push(ref(db, `examPlan/${karteNumber}/plans`));
    await set(newRef, record);
    targetId = newRef.key;
  }

  if (itemName) {
    await clearLegacyEndedPlansByItemName(karteNumber, itemName);
  }

  await update(examPlanRef(karteNumber), {
    schemaVersion: EXAM_PLAN_SCHEMA_VERSION,
  });
  return targetId;
}

/**
 * 旧 ended/ の同名エントリを削除する（互換掃除。新規書き込みはしない）。
 */
async function clearLegacyEndedPlansByItemName(karteNumber, itemName) {
  const name = (itemName || "").trim();
  if (!name) return;
  const snap = await get(ref(db, `examPlan/${karteNumber}/ended`));
  if (!snap.exists()) return;
  const ended = snap.val() || {};
  const removals = {};
  Object.entries(ended).forEach(([id, e]) => {
    if (e && (e.item || "").trim() === name) {
      removals[`ended/${id}`] = null;
    }
  });
  if (Object.keys(removals).length) {
    await update(examPlanRef(karteNumber), removals);
  }
}

/**
 * 次回予定を削除する（終了・完了後のクリア。履歴は触らない）。
 */
export async function deleteExamScheduledPlan(karteNumber, planId) {
  await authReady;
  if (!planId) return;
  await remove(ref(db, `examPlan/${karteNumber}/plans/${planId}`));
}

/**
 * 予定を終了する。plans から削除するだけ（履歴は触らない。旧 ended には移さない）。
 */
export async function endExamScheduledPlan(karteNumber, planId) {
  await deleteExamScheduledPlan(karteNumber, planId);
}

/**
 * 実施履歴の検査項目名から、検査予定一覧へ復活させる（次回予定日は未設定）。
 * 実施履歴は変更しない。既に同名の予定があればそれを返す。
 * @returns {Promise<string>} planId
 */
export async function reviveExamPlanByItem(karteNumber, { item, note = "", fasting = "" }) {
  const itemName = (item || "").trim();
  if (!itemName) throw new Error("検査項目名が必要です");
  return saveExamScheduledPlan(karteNumber, {
    item: itemName,
    dueDate: "",
    note: note || "",
    baselineDate: todayIsoDate(),
    fasting,
  });
}

function todayIsoDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * @deprecated 互換: 単一 nextPlan 書き込み → plans へ保存
 */
export async function setNextExamPlan(karteNumber, nextPlan) {
  if (!nextPlan) {
    return null;
  }
  return saveExamScheduledPlan(karteNumber, {
    item: nextPlan.item,
    dueDate: nextPlan.dueDate || nextPlan.targetDate || nextPlan.dueDateFrom,
    note: nextPlan.note,
    baselineDate: nextPlan.baselineDate,
    fasting: nextPlan.fasting,
  });
}

/**
 * @deprecated 互換API（単一クリアは非対応のため no-op）
 */
export async function clearNextExamPlan(_karteNumber) {
  // v2 では planId 指定の deleteExamScheduledPlan を使う
}

/**
 * 実施履歴を1件追加する。
 */
export async function addExamHistory(karteNumber, { item, date, note }) {
  await ensureExamPlanRoot(karteNumber);
  const newRef = push(ref(db, `examPlan/${karteNumber}/history`));
  await set(newRef, {
    item: item || "",
    date: date || "",
    note: note || "",
  });
  return newRef.key;
}

/**
 * 実施履歴を削除する。
 */
export async function deleteExamHistory(karteNumber, historyId) {
  await authReady;
  await remove(ref(db, `examPlan/${karteNumber}/history/${historyId}`));
}

// --- 薬剤マスタ -----------------------------------------------------------

function medicationItemsRef() {
  return ref(db, "medicationItems");
}

/**
 * 薬剤マスタをリアルタイム監視する。order 昇順で callback に渡す。
 */
export function subscribeMedicationItems(callback) {
  const r = medicationItemsRef();
  let unsubscribed = false;
  let listener = null;

  authReady
    .then(() => {
      if (unsubscribed) return;
      listener = onValue(r, (snapshot) => {
        const value = snapshot.val() || {};
        const items = Object.entries(value).map(([id, t]) => ({ id, ...t }));
        items.sort((a, b) => {
          const ord = (a.order ?? 0) - (b.order ?? 0);
          if (ord !== 0) return ord;
          return (a.label || "").localeCompare(b.label || "");
        });
        callback(items);
      });
    })
    .catch((err) => {
      console.error("薬剤マスタの監視開始に失敗しました", err);
    });

  return () => {
    unsubscribed = true;
    if (listener) {
      off(r, "value", listener);
      listener = null;
    }
  };
}

/**
 * 薬剤マスタを1回だけ取得する。
 */
export async function fetchMedicationItemsOnce() {
  await authReady;
  const snapshot = await get(medicationItemsRef());
  const value = snapshot.val() || {};
  const items = Object.entries(value).map(([id, t]) => ({ id, ...t }));
  items.sort((a, b) => {
    const ord = (a.order ?? 0) - (b.order ?? 0);
    if (ord !== 0) return ord;
    return (a.label || "").localeCompare(b.label || "");
  });
  return items;
}

/**
 * 検査項目マスタを1回だけ取得する（全分類・内訳含む）。
 */
export async function fetchExamItemsOnce() {
  await authReady;
  const snapshot = await get(examItemsRef());
  const value = snapshot.val() || {};
  const items = Object.entries(value).map(([id, t]) => normalizeExamItem(id, t));
  items.sort((a, b) => {
    const ord = (a.order ?? 0) - (b.order ?? 0);
    if (ord !== 0) return ord;
    return (a.label || "").localeCompare(b.label || "", "ja");
  });
  return items;
}

export async function addMedicationItem({ label, order }) {
  await authReady;
  const newRef = push(medicationItemsRef());
  await set(newRef, {
    label: label || "",
    order: typeof order === "number" ? order : Date.now(),
  });
  return newRef.key;
}

export async function updateMedicationItem(itemId, { label }) {
  await authReady;
  await update(ref(db, `medicationItems/${itemId}`), { label: label || "" });
}

export async function deleteMedicationItem(itemId) {
  await authReady;
  await remove(ref(db, `medicationItems/${itemId}`));
}

// --- 薬剤情報（medications） ----------------------------------------------

export const MEDICATION_SCHEMA_VERSION = 1;

function medicationsRef(karteNumber) {
  return ref(db, `medications/${karteNumber}`);
}

function medicationRef(karteNumber, drugId) {
  return ref(db, `medications/${karteNumber}/${drugId}`);
}

function normalizeMedication(id, raw) {
  const drug = {
    id,
    schemaVersion: MEDICATION_SCHEMA_VERSION,
    name: "",
    category: "B",
    sideEffectNote: "",
    expiryEstimate: "",
    events: {},
  };
  if (!raw || typeof raw !== "object") return drug;

  drug.schemaVersion = raw.schemaVersion || MEDICATION_SCHEMA_VERSION;
  drug.name = raw.name || "";
  drug.category = ["A", "B", "C"].includes(raw.category) ? raw.category : "B";
  drug.sideEffectNote = raw.sideEffectNote || "";
  drug.expiryEstimate = raw.expiryEstimate || "";

  if (Array.isArray(raw.events)) {
    raw.events.forEach((e, i) => {
      if (e) drug.events[`legacy-${i}`] = e;
    });
  } else if (raw.events && typeof raw.events === "object") {
    drug.events = { ...raw.events };
  }

  return drug;
}

/**
 * カルテの薬剤一覧をリアルタイム監視する。
 * callback には正規化済みの薬剤配列が渡される（並びは呼び出し側で行う）。
 */
export function subscribeMedications(karteNumber, callback) {
  const r = medicationsRef(karteNumber);
  let unsubscribed = false;
  let listener = null;

  authReady
    .then(() => {
      if (unsubscribed) return;
      listener = onValue(r, (snapshot) => {
        const value = snapshot.val() || {};
        const drugs = Object.entries(value).map(([id, raw]) =>
          normalizeMedication(id, raw)
        );
        callback(drugs);
      });
    })
    .catch((err) => {
      console.error("薬剤情報の監視開始に失敗しました", err);
    });

  return () => {
    unsubscribed = true;
    if (listener) {
      off(r, "value", listener);
      listener = null;
    }
  };
}

/**
 * 薬剤一覧を1回だけ取得する（AI提案の既存薬剤照合用）。
 */
export async function fetchMedicationsOnce(karteNumber) {
  await authReady;
  const snapshot = await get(medicationsRef(karteNumber));
  const value = snapshot.val() || {};
  return Object.entries(value).map(([id, raw]) => normalizeMedication(id, raw));
}

/**
 * 薬剤を新規追加する。初期出来事（継続）を1件付ける。
 */
export async function addMedication(
  karteNumber,
  { name, category, sideEffectNote, expiryEstimate, changedBy, eventDate, frequencyChange, frequency }
) {
  await authReady;
  const newRef = push(medicationsRef(karteNumber));
  const drugId = newRef.key;
  const date = eventDate || new Date().toISOString().slice(0, 10);
  await set(newRef, {
    schemaVersion: MEDICATION_SCHEMA_VERSION,
    name: name || "",
    category: ["A", "B", "C"].includes(category) ? category : "B",
    sideEffectNote: sideEffectNote || "",
    expiryEstimate: expiryEstimate || "",
    events: {},
  });
  await addMedicationEvent(karteNumber, drugId, {
    date,
    type: "add",
    detail: "開始／継続",
    frequencyChange: frequencyChange || "",
    frequency: frequency || null,
    amountChange: "",
    changedBy: changedBy || "",
  });
  return drugId;
}

/**
 * 薬剤の基本情報を更新する（名前・カテゴリ・副作用メモ・処方切れ目安）。
 * 使用状況（使用中/中止）は events の最新から導出するためここでは扱わない。
 */
export async function updateMedication(karteNumber, drugId, fields) {
  await authReady;
  const payload = { schemaVersion: MEDICATION_SCHEMA_VERSION };
  if (fields.name != null) payload.name = fields.name;
  if (fields.category != null) {
    payload.category = ["A", "B", "C"].includes(fields.category)
      ? fields.category
      : "B";
  }
  if (fields.sideEffectNote != null) payload.sideEffectNote = fields.sideEffectNote;
  if (fields.expiryEstimate != null) payload.expiryEstimate = fields.expiryEstimate;
  await update(medicationRef(karteNumber, drugId), payload);
}

/**
 * 薬剤を削除する。
 */
export async function deleteMedication(karteNumber, drugId) {
  await authReady;
  await remove(medicationRef(karteNumber, drugId));
}

/**
 * 出来事を1件追記する。
 */
export async function addMedicationEvent(
  karteNumber,
  drugId,
  { date, type, detail, frequencyChange, frequency, amountChange, changedBy }
) {
  await authReady;
  const newRef = push(ref(db, `medications/${karteNumber}/${drugId}/events`));
  const payload = {
    date: date || "",
    type: type || "add",
    detail: detail || "",
    frequencyChange: frequencyChange || "",
    amountChange: amountChange || "",
    changedBy: changedBy || "",
  };
  if (frequency && typeof frequency === "object") {
    payload.frequency = frequency;
  }
  await set(newRef, payload);
  return newRef.key;
}

/**
 * 出来事を上書き更新する（最終編集日時・編集者を記録）。
 */
export async function updateMedicationEvent(
  karteNumber,
  drugId,
  eventId,
  fields,
  editedBy = ""
) {
  await authReady;
  const payload = {
    lastEditedAt: new Date().toISOString(),
    lastEditedBy: editedBy || "",
  };
  if (fields.date != null) payload.date = fields.date;
  if (fields.type != null) payload.type = fields.type;
  if (fields.detail != null) payload.detail = fields.detail;
  if (fields.frequencyChange != null) payload.frequencyChange = fields.frequencyChange;
  if (fields.amountChange != null) payload.amountChange = fields.amountChange;
  // null で frequency キーを削除できる
  if ("frequency" in fields) payload.frequency = fields.frequency;
  await update(ref(db, `medications/${karteNumber}/${drugId}/events/${eventId}`), payload);
}

/**
 * 出来事を削除する。
 */
export async function deleteMedicationEvent(karteNumber, drugId, eventId) {
  await authReady;
  await remove(ref(db, `medications/${karteNumber}/${drugId}/events/${eventId}`));
}

// --- 既往歴（history） ----------------------------------------------------
// 手動追加と将来のAI提案からの登録の両方を想定。
// source: "manual" | "ai" で登録経路を区別する。

export const PATIENT_HISTORY_SCHEMA_VERSION = 1;

const HISTORY_TYPES = ["disease", "surgery", "referral"];
const HISTORY_STATUSES = ["active", "resolved"];

function patientHistoryRootRef(karteNumber) {
  return ref(db, `history/${karteNumber}`);
}

function patientHistoryEntryRef(karteNumber, entryId) {
  return ref(db, `history/${karteNumber}/${entryId}`);
}

function todayDateStrLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizePatientHistoryEntry(id, raw) {
  const entry = {
    id,
    schemaVersion: PATIENT_HISTORY_SCHEMA_VERSION,
    title: "",
    type: "disease",
    status: "active",
    firstNoted: "",
    lastUpdated: "",
    source: "manual",
    notes: {},
  };
  if (!raw || typeof raw !== "object") return entry;

  entry.schemaVersion = raw.schemaVersion || PATIENT_HISTORY_SCHEMA_VERSION;
  entry.title = raw.title || "";
  entry.type = HISTORY_TYPES.includes(raw.type) ? raw.type : "disease";
  entry.status = HISTORY_STATUSES.includes(raw.status) ? raw.status : "active";
  entry.firstNoted = raw.firstNoted || "";
  entry.lastUpdated = raw.lastUpdated || entry.firstNoted || "";
  entry.source = raw.source === "ai" ? "ai" : "manual";

  if (Array.isArray(raw.notes)) {
    raw.notes.forEach((n, i) => {
      if (n) entry.notes[`legacy-${i}`] = n;
    });
  } else if (raw.notes && typeof raw.notes === "object") {
    entry.notes = { ...raw.notes };
  }

  return entry;
}

/**
 * 既往歴一覧をリアルタイム監視する。
 */
export function subscribePatientHistory(karteNumber, callback) {
  const r = patientHistoryRootRef(karteNumber);
  let unsubscribed = false;
  let listener = null;

  authReady
    .then(() => {
      if (unsubscribed) return;
      listener = onValue(r, (snapshot) => {
        const value = snapshot.val() || {};
        const entries = Object.entries(value).map(([id, raw]) =>
          normalizePatientHistoryEntry(id, raw)
        );
        callback(entries);
      });
    })
    .catch((err) => {
      console.error("既往歴の監視開始に失敗しました", err);
    });

  return () => {
    unsubscribed = true;
    if (listener) {
      off(r, "value", listener);
      listener = null;
    }
  };
}

/**
 * 既往歴を新規追加する。
 * source を "ai" にすれば、将来のAI提案フローからも同じAPIで登録できる。
 * 初期メモ（noteText）がある場合は notes に1件として追記する。
 */
export async function addPatientHistoryEntry(
  karteNumber,
  {
    title,
    type = "disease",
    status = "active",
    firstNoted,
    noteText = "",
    author = "",
    source = "manual",
  }
) {
  await authReady;
  const noted = firstNoted || todayDateStrLocal();
  const newRef = push(patientHistoryRootRef(karteNumber));
  const entryId = newRef.key;
  await set(newRef, {
    schemaVersion: PATIENT_HISTORY_SCHEMA_VERSION,
    title: title || "",
    type: HISTORY_TYPES.includes(type) ? type : "disease",
    status: HISTORY_STATUSES.includes(status) ? status : "active",
    firstNoted: noted,
    lastUpdated: noted,
    source: source === "ai" ? "ai" : "manual",
    notes: {},
  });

  if (noteText && noteText.trim()) {
    await appendPatientHistoryNote(karteNumber, entryId, {
      date: noted,
      text: noteText.trim(),
      author,
    });
  }

  return entryId;
}

/**
 * タイトル・種別など基本情報を更新する（メモ本文は追記専用のためここには含めない）。
 */
export async function updatePatientHistoryEntry(karteNumber, entryId, fields) {
  await authReady;
  const payload = {
    schemaVersion: PATIENT_HISTORY_SCHEMA_VERSION,
    lastUpdated: todayDateStrLocal(),
  };
  if (fields.title != null) payload.title = fields.title;
  if (fields.type != null) {
    payload.type = HISTORY_TYPES.includes(fields.type) ? fields.type : "disease";
  }
  if (fields.firstNoted != null) payload.firstNoted = fields.firstNoted;
  await update(patientHistoryEntryRef(karteNumber, entryId), payload);
}

/**
 * 進行中／終了を切り替える。
 */
export async function setPatientHistoryStatus(karteNumber, entryId, status) {
  await authReady;
  const next = HISTORY_STATUSES.includes(status) ? status : "active";
  await update(patientHistoryEntryRef(karteNumber, entryId), {
    schemaVersion: PATIENT_HISTORY_SCHEMA_VERSION,
    status: next,
    lastUpdated: todayDateStrLocal(),
  });
}

/**
 * メモを1件追記する（上書きしない）。lastUpdated も更新する。
 */
export async function appendPatientHistoryNote(
  karteNumber,
  entryId,
  { date, text, author }
) {
  await authReady;
  const noteDate = date || todayDateStrLocal();
  const newRef = push(ref(db, `history/${karteNumber}/${entryId}/notes`));
  await set(newRef, {
    date: noteDate,
    text: text || "",
    author: author || "",
  });
  await update(patientHistoryEntryRef(karteNumber, entryId), {
    schemaVersion: PATIENT_HISTORY_SCHEMA_VERSION,
    lastUpdated: noteDate,
  });
  return newRef.key;
}

/**
 * メモ1件を削除する（誤入力用）。
 */
export async function deletePatientHistoryNote(karteNumber, entryId, noteId) {
  await authReady;
  await remove(ref(db, `history/${karteNumber}/${entryId}/notes/${noteId}`));
  await update(patientHistoryEntryRef(karteNumber, entryId), {
    schemaVersion: PATIENT_HISTORY_SCHEMA_VERSION,
    lastUpdated: todayDateStrLocal(),
  });
}

/**
 * 既往歴エントリを削除する。
 */
export async function deletePatientHistoryEntry(karteNumber, entryId) {
  await authReady;
  await remove(patientHistoryEntryRef(karteNumber, entryId));
}

// --- 自由質問（freeQA） ---------------------------------------------------

export const FREE_QA_SCHEMA_VERSION = 1;

function freeQaRootRef(karteNumber) {
  return ref(db, `freeQA/${karteNumber}`);
}

function freeQaEntryRef(karteNumber, questionId) {
  return ref(db, `freeQA/${karteNumber}/${questionId}`);
}

function normalizeFreeQaEntry(id, raw) {
  const entry = {
    id,
    schemaVersion: FREE_QA_SCHEMA_VERSION,
    question: "",
    answer: "",
    askedAt: "",
    askedBy: "",
  };
  if (!raw || typeof raw !== "object") return entry;
  entry.schemaVersion = raw.schemaVersion || FREE_QA_SCHEMA_VERSION;
  entry.question = raw.question || "";
  entry.answer = raw.answer || "";
  entry.askedAt = raw.askedAt || "";
  entry.askedBy = raw.askedBy || "";
  return entry;
}

/**
 * 自由質問一覧をリアルタイム監視する（新しい順で callback）。
 */
export function subscribeFreeQA(karteNumber, callback) {
  const r = freeQaRootRef(karteNumber);
  let unsubscribed = false;
  let listener = null;

  authReady
    .then(() => {
      if (unsubscribed) return;
      listener = onValue(r, (snapshot) => {
        const value = snapshot.val() || {};
        const items = Object.entries(value)
          .map(([id, raw]) => normalizeFreeQaEntry(id, raw))
          .sort((a, b) => (b.askedAt || "").localeCompare(a.askedAt || ""));
        callback(items);
      });
    })
    .catch((err) => {
      console.error("自由質問の監視開始に失敗しました", err);
    });

  return () => {
    unsubscribed = true;
    if (listener) {
      off(r, "value", listener);
      listener = null;
    }
  };
}

/**
 * 自由質問を新規追加する。
 */
export async function addFreeQA(karteNumber, { question, answer, askedBy }) {
  await authReady;
  const newRef = push(freeQaRootRef(karteNumber));
  await set(newRef, {
    schemaVersion: FREE_QA_SCHEMA_VERSION,
    question: question || "",
    answer: answer || "",
    askedAt: new Date().toISOString(),
    askedBy: askedBy || "",
  });
  return newRef.key;
}

/**
 * 再検索時に回答を上書き更新する（質問文はそのまま）。
 */
export async function updateFreeQAAnswer(
  karteNumber,
  questionId,
  { answer, askedBy }
) {
  await authReady;
  const payload = {
    schemaVersion: FREE_QA_SCHEMA_VERSION,
    answer: answer || "",
    askedAt: new Date().toISOString(),
  };
  if (askedBy != null) payload.askedBy = askedBy;
  await update(freeQaEntryRef(karteNumber, questionId), payload);
}

/**
 * 自由質問を削除する。
 */
export async function deleteFreeQA(karteNumber, questionId) {
  await authReady;
  await remove(freeQaEntryRef(karteNumber, questionId));
}

// --- 処置ログ（procedures） -----------------------------------------------

export const PROCEDURE_SCHEMA_VERSION = 1;

function proceduresRootRef(karteNumber) {
  return ref(db, `procedures/${karteNumber}`);
}

function procedureEntryRef(karteNumber, entryId) {
  return ref(db, `procedures/${karteNumber}/${entryId}`);
}

function normalizeProcedureEntry(id, raw) {
  const entry = {
    id,
    schemaVersion: PROCEDURE_SCHEMA_VERSION,
    date: "",
    content: "",
    confirmedBy: "",
    lastEditedAt: "",
    lastEditedBy: "",
    source: "manual",
  };
  if (!raw || typeof raw !== "object") return entry;
  entry.schemaVersion = raw.schemaVersion || PROCEDURE_SCHEMA_VERSION;
  entry.date = raw.date || "";
  entry.content = raw.content || "";
  entry.confirmedBy = raw.confirmedBy || "";
  entry.lastEditedAt = raw.lastEditedAt || "";
  entry.lastEditedBy = raw.lastEditedBy || "";
  entry.source = raw.source === "ai" ? "ai" : "manual";
  return entry;
}

function sortProcedures(entries) {
  return [...entries].sort((a, b) => {
    const rd = (b.date || "").localeCompare(a.date || "");
    if (rd !== 0) return rd;
    const ed = (b.lastEditedAt || "").localeCompare(a.lastEditedAt || "");
    if (ed !== 0) return ed;
    return (b.id || "").localeCompare(a.id || "");
  });
}

/**
 * 処置ログ一覧をリアルタイム監視する（日付の新しい順）。
 */
export function subscribeProcedures(karteNumber, callback) {
  const r = proceduresRootRef(karteNumber);
  let unsubscribed = false;
  let listener = null;

  authReady
    .then(() => {
      if (unsubscribed) return;
      listener = onValue(r, (snapshot) => {
        const value = snapshot.val() || {};
        const items = Object.entries(value).map(([id, raw]) =>
          normalizeProcedureEntry(id, raw)
        );
        callback(sortProcedures(items));
      });
    })
    .catch((err) => {
      console.error("処置ログの監視開始に失敗しました", err);
    });

  return () => {
    unsubscribed = true;
    if (listener) {
      off(r, "value", listener);
      listener = null;
    }
  };
}

/**
 * 処置ログを新規追加する。
 * source を "ai" にすれば、将来のAI提案フローからも同じAPIで登録できる。
 */
export async function addProcedure(
  karteNumber,
  { date, content, confirmedBy, source = "manual" }
) {
  await authReady;
  const newRef = push(proceduresRootRef(karteNumber));
  await set(newRef, {
    schemaVersion: PROCEDURE_SCHEMA_VERSION,
    date: date || "",
    content: content || "",
    confirmedBy: confirmedBy || "",
    lastEditedAt: "",
    lastEditedBy: "",
    source: source === "ai" ? "ai" : "manual",
  });
  return newRef.key;
}

/**
 * 処置ログを上書き更新する（最終編集日時・編集者を記録）。
 */
export async function updateProcedure(
  karteNumber,
  entryId,
  { date, content, editedBy }
) {
  await authReady;
  await update(procedureEntryRef(karteNumber, entryId), {
    schemaVersion: PROCEDURE_SCHEMA_VERSION,
    date: date || "",
    content: content || "",
    lastEditedAt: new Date().toISOString(),
    lastEditedBy: editedBy || "",
  });
}

/**
 * 処置ログを削除する。
 */
export async function deleteProcedure(karteNumber, entryId) {
  await authReady;
  await remove(procedureEntryRef(karteNumber, entryId));
}
