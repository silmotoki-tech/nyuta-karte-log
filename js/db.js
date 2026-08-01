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
//   medicationItems/{itemId}/category                   … "inject"|"oral"|"topical"|"eye"|"supplement"|"food"（注射薬／内服薬／外用薬／点眼薬／サプリメント・商品／フード）
//   medicationItems/{itemId}/kind                       … "group"|"leaf"（中項目／薬剤名）
//   medicationItems/{itemId}/parentId                   … 中項目の親ID（点眼の葉など中項目なしは空）
//   medicationItems/{itemId}/order                      … 並び順
//     ※中項目シードは固定ID（seed-med-*）。既存フラット項目は内服→その他へ移行
//
//   medications/{カルテ番号}/{drugId}/schemaVersion
//   medications/{カルテ番号}/{drugId}/name
//   medications/{カルテ番号}/{drugId}/category           … "A"|"B"|"C"（重要度。マスタ階層とは別軸）
//   medications/{カルテ番号}/{drugId}/prn                … true|false（頓服フラグ。一覧に「頓」表示）
//   medications/{カルテ番号}/{drugId}/sideEffectNote
//   medications/{カルテ番号}/{drugId}/expiryEstimate     … 処方切れ目安日 "YYYY-MM-DD" or ""
//   medications/{カルテ番号}/{drugId}/events/{eventId}
//     { date, type, detail, frequencyChange, frequency, amountChange, changedBy,
//       lastEditedAt, lastEditedBy }
//     frequencyChange: 表示用ラベル（互換のため残す）
//     frequency: { kind, label, periodDays?, times?, weekdays? } … 構造化（任意）
//     lastEditedAt / lastEditedBy: 編集時のみ
//     type: "add"(継続)|"temporary"(一時的)|"hard"(投与難)|
//           "increase"|"decrease"|"hold"(休薬中)|"stop"|"resume"
//
//   historyDiseaseItems/{itemId}                         … 疾患名マスタ（大→中→小）
//     { label, kind:"group"|"leaf", parentId, order }
//   historySurgeryItems/{itemId}                         … 手術名マスタ（大→中→小）
//     { label, kind:"group"|"leaf", parentId, order }
//   historyReferralItems/{itemId}                        … 紹介先マスタ（フラット）
//     { label, order }
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
//   procedures/{カルテ番号}/plans/{planId}               … 処置予定
//     { content, dueDate, baselineDate, note, source?, confirmedBy? }
//   procedures/{カルテ番号}/history/{entryId}            … 実施履歴
//     { schemaVersion, date, content, note, lastEditedAt?, source }
//   procedures/{カルテ番号}/{entryId}                    … 旧形式の実施履歴（互換。history へは移さず読む）
//
//   specialNotes/{カルテ番号}/{entryId}/schemaVersion    … 特記事項（恒常的な注意）
//   specialNotes/{カルテ番号}/{entryId}/content          … 本文
//   specialNotes/{カルテ番号}/{entryId}/importance       … "high"|"medium"|"low"
//   specialNotes/{カルテ番号}/{entryId}/createdAt        … 追加日時ISO
//   specialNotes/{カルテ番号}/{entryId}/createdBy        … 作成者
//   specialNotes/{カルテ番号}/{entryId}/lastEditedAt     … 更新日時ISO（任意）
//   specialNotes/{カルテ番号}/{entryId}/lastEditedBy     … 更新者（任意）
//
//   appSettings/adminPasscode                           … マスタ削除用管理者パスコード（全端末共通）
//   appSettings/retiredMasterIds/{collection}/{itemId}  … 削除済みシードの再投入防止
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

/** マスタ削除用の初期管理者パスコード（未設定時のみ Firebase に書き込む） */
export const DEFAULT_ADMIN_PASSCODE = "oono";

function adminPasscodeRef() {
  return ref(db, "appSettings/adminPasscode");
}

function retiredMasterIdsRef(collection) {
  return ref(db, `appSettings/retiredMasterIds/${collection}`);
}

/** Firebase に管理者パスコードが無ければ初期値を書き込む */
export async function ensureAdminPasscodeDefault() {
  await authReady;
  const snap = await get(adminPasscodeRef());
  if (!snap.exists() || String(snap.val() || "").trim() === "") {
    await set(adminPasscodeRef(), DEFAULT_ADMIN_PASSCODE);
  }
}

/**
 * 入力が Firebase 上の管理者パスコードと一致するか。
 * 削除のたびに呼び、クライアント側での有効期限キャッシュは持たない。
 */
export async function verifyAdminPasscode(input) {
  await ensureAdminPasscodeDefault();
  const snap = await get(adminPasscodeRef());
  const expected = String(snap.val() ?? DEFAULT_ADMIN_PASSCODE);
  return String(input ?? "") === expected;
}

async function loadRetiredMasterIdSet(collection) {
  await authReady;
  const snap = await get(retiredMasterIdsRef(collection));
  const value = snap.val() || {};
  return new Set(
    Object.entries(value)
      .filter(([, v]) => Boolean(v))
      .map(([id]) => id)
  );
}

async function markMasterItemsRetired(collection, ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return;
  const patch = {};
  list.forEach((id) => {
    patch[id] = true;
  });
  await update(retiredMasterIdsRef(collection), patch);
}

function collectMasterDescendantIds(items, rootId) {
  const ids = [];
  const queue = [String(rootId || "")];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    (items || []).forEach((item) => {
      if (String(item.parentId || "") === id) queue.push(item.id);
    });
  }
  return ids;
}

async function removeMasterItemsWithRetire(collectionPath, itemIds) {
  await authReady;
  const ids = [...new Set((itemIds || []).filter(Boolean))];
  if (!ids.length) return;
  const patch = {};
  ids.forEach((id) => {
    patch[`${collectionPath}/${id}`] = null;
  });
  await update(ref(db), patch);
  await markMasterItemsRetired(collectionPath, ids);
}

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
 * 検査項目シードの親子（大項目→内訳）を展開するヘルパー。
 * @param {string} category
 * @param {{ id: string, label: string, order: number, children: { id: string, label: string }[] }} group
 */
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
    rows.push({
      id: child.id,
      label: child.label,
      category,
      kind: "leaf",
      parentId: group.id,
      order: (index + 1) * 10,
    });
  });
  return rows;
}

/** @param {{ id: string, label: string, order: number, children: { id: string, label: string }[] }} group */
function bloodGroupSeed(group) {
  return categoryGroupSeed("blood", group);
}

/** 初期シード（固定ID。未作成時は作成、既存シードは order だけ同期） */
const EXAM_ITEM_SEED = [
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
  // 画像: 血液と同じ大項目→内訳の2階層（セット／エコー／レントゲン）
  ...categoryGroupSeed("imaging", {
    id: "seed-imaging-set",
    label: "セット",
    order: 10,
    children: [
      { id: "seed-imaging-full-scr", label: "全set" },
      // 旧「その他」シードIDを流用（既存DBを確実に更新）
      { id: "seed-other-chest-set", label: "胸部set" },
      { id: "seed-other-abdomen-set", label: "腹部set" },
    ],
  }),
  // 心エコー／腹部エコーを中項目にし、小項目は内訳名のみ（二重表示防止）
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
  {
    id: "seed-other-cardio-clinic",
    label: "循環器診療",
    category: "other",
    kind: "leaf",
    parentId: "",
    order: 60,
  },
];

/** 一時的に作った重複シード（旧IDへ統合したため削除） */
const EXAM_ITEM_SEED_RETIRE = [
  "seed-imaging-chest-scr",
  "seed-imaging-abdomen-scr",
  // 旧・エコー一括中項目（心エコー／腹部エコーへ分割）
  "seed-imaging-echo",
];

/** ラベル一致で削除する重複・旧項目（ユーザー追加分も含む） */
const EXAM_ITEM_LABEL_RETIRE = ["胸部X線", "胸部ｘ線", "胸部x線"];

/** 旧名称→新名称の強制移行（IDに依存しない） */
const EXAM_ITEM_LABEL_MIGRATE = [
  {
    from: "胸部セット",
    to: "胸部set",
    category: "imaging",
    parentId: "seed-imaging-set",
    order: 20,
  },
  {
    from: "胸部スク",
    to: "胸部set",
    category: "imaging",
    parentId: "seed-imaging-set",
    order: 20,
  },
  {
    from: "腹部セット",
    to: "腹部set",
    category: "imaging",
    parentId: "seed-imaging-set",
    order: 30,
  },
  {
    from: "腹部スク",
    to: "腹部set",
    category: "imaging",
    parentId: "seed-imaging-set",
    order: 30,
  },
  {
    from: "全スク",
    to: "全set",
    category: "imaging",
    parentId: "seed-imaging-set",
    order: 10,
  },
  // 親名込みラベル → 内訳のみ（二重表示防止）
  { from: "レントゲン(胸部)", to: "胸部", category: "imaging", parentId: "seed-imaging-xray", order: 10 },
  { from: "レントゲン(気管)", to: "気管", category: "imaging", parentId: "seed-imaging-xray", order: 20 },
  { from: "レントゲン(腹部)", to: "腹部", category: "imaging", parentId: "seed-imaging-xray", order: 30 },
  { from: "レントゲン(股関節)", to: "股関節", category: "imaging", parentId: "seed-imaging-xray", order: 40 },
  { from: "レントゲン(肩)", to: "肩", category: "imaging", parentId: "seed-imaging-xray", order: 50 },
  { from: "レントゲン(前肢)", to: "前肢", category: "imaging", parentId: "seed-imaging-xray", order: 60 },
  { from: "レントゲン(後肢)", to: "後肢", category: "imaging", parentId: "seed-imaging-xray", order: 70 },
  { from: "レントゲン(鼻)", to: "鼻", category: "imaging", parentId: "seed-imaging-xray", order: 80 },
  { from: "レントゲン(歯)", to: "歯", category: "imaging", parentId: "seed-imaging-xray", order: 90 },
  {
    from: "心エコー(スクリーニング)",
    to: "スクリーニング",
    category: "imaging",
    parentId: "seed-imaging-heart-echo",
    order: 10,
  },
  {
    from: "心エコー(流速あり)",
    to: "流速あり",
    category: "imaging",
    parentId: "seed-imaging-heart-echo",
    order: 20,
  },
  {
    from: "心エコー(拡大チェック)",
    to: "拡大チェック",
    category: "imaging",
    parentId: "seed-imaging-heart-echo",
    order: 30,
  },
  {
    from: "腹部エコー(スクリーニング)",
    to: "スクリーニング",
    category: "imaging",
    parentId: "seed-imaging-abdomen-echo",
    order: 10,
  },
  {
    from: "腹部エコー(脾臓)",
    to: "脾臓",
    category: "imaging",
    parentId: "seed-imaging-abdomen-echo",
    order: 20,
  },
  {
    from: "腹部エコー(肝臓)",
    to: "肝臓",
    category: "imaging",
    parentId: "seed-imaging-abdomen-echo",
    order: 30,
  },
  {
    from: "腹部エコー(腎臓)",
    to: "腎臓",
    category: "imaging",
    parentId: "seed-imaging-abdomen-echo",
    order: 40,
  },
  {
    from: "腹部エコー(尿管)",
    to: "尿管",
    category: "imaging",
    parentId: "seed-imaging-abdomen-echo",
    order: 50,
  },
  {
    from: "腹部エコー(膀胱)",
    to: "膀胱",
    category: "imaging",
    parentId: "seed-imaging-abdomen-echo",
    order: 60,
  },
  {
    from: "腹部エコー(前立腺)",
    to: "前立腺",
    category: "imaging",
    parentId: "seed-imaging-abdomen-echo",
    order: 70,
  },
];

function examItemsRef() {
  return ref(db, "examItems");
}

export function normalizeExamItemCategory(category) {
  const id = String(category || "").trim();
  return EXAM_ITEM_CATEGORY_IDS.has(id) ? id : "other";
}

export function examItemCategoryLabel(category) {
  const id = normalizeExamItemCategory(category);
  return EXAM_ITEM_CATEGORIES.find((c) => c.id === id)?.label || id;
}

export function normalizeExamItemKind(kind) {
  return String(kind || "").trim() === "group" ? "group" : "leaf";
}

/**
 * 「レントゲン(腹部)」→「腹部」のように、親名が先頭に付いた小項目ラベルを内訳だけにする。
 */
function stripParentPrefixFromLeafLabel(label, parentLabel) {
  const raw = String(label || "").trim();
  const parent = String(parentLabel || "").trim();
  if (!raw || !parent) return raw;
  const escaped = parent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}\\s*[（(]\\s*(.+?)\\s*[）)]$`);
  const m = raw.match(re);
  return m?.[1]?.trim() || raw;
}

function normalizeExamItem(id, raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  let kind = normalizeExamItemKind(row.kind);
  let parentId = String(row.parentId || "").trim();
  let label = row.label || "";
  let category = normalizeExamItemCategory(row.category);
  let order = typeof row.order === "number" ? row.order : 0;

  // 旧スク／セット名称の強制補正（端末に古い値が残っていても表示・分類を正す）
  const trimmed = label.trim();
  if (
    id === "seed-other-chest-set" ||
    trimmed === "胸部セット" ||
    trimmed === "胸部スク"
  ) {
    label = "胸部set";
    category = "imaging";
    kind = "leaf";
    parentId = "seed-imaging-set";
    order = 20;
  } else if (
    id === "seed-other-abdomen-set" ||
    trimmed === "腹部セット" ||
    trimmed === "腹部スク"
  ) {
    label = "腹部set";
    category = "imaging";
    kind = "leaf";
    parentId = "seed-imaging-set";
    order = 30;
  } else if (id === "seed-imaging-full-scr" || trimmed === "全スク") {
    label = "全set";
    category = "imaging";
    kind = "leaf";
    parentId = "seed-imaging-set";
    order = 10;
  } else if (id === "seed-imaging-set") {
    label = "セット";
    category = "imaging";
    kind = "group";
    parentId = "";
    order = 10;
  } else if (id === "seed-imaging-heart-echo") {
    label = "心エコー";
    category = "imaging";
    kind = "group";
    parentId = "";
    order = 20;
  } else if (id === "seed-imaging-abdomen-echo") {
    label = "腹部エコー";
    category = "imaging";
    kind = "group";
    parentId = "";
    order = 25;
  } else if (id === "seed-imaging-xray") {
    label = "レントゲン";
    category = "imaging";
    kind = "group";
    parentId = "";
    order = 30;
  } else if (id.startsWith("seed-imaging-heart-echo-")) {
    category = "imaging";
    kind = "leaf";
    parentId = "seed-imaging-heart-echo";
    label = stripParentPrefixFromLeafLabel(label, "心エコー");
  } else if (id.startsWith("seed-imaging-abdomen-echo-")) {
    category = "imaging";
    kind = "leaf";
    parentId = "seed-imaging-abdomen-echo";
    label = stripParentPrefixFromLeafLabel(label, "腹部エコー");
  } else if (id.startsWith("seed-imaging-xray-")) {
    category = "imaging";
    kind = "leaf";
    parentId = "seed-imaging-xray";
    label = stripParentPrefixFromLeafLabel(label, "レントゲン");
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
  const retired = await loadRetiredMasterIdSet("examItems");
  const writes = {};
  const forceRewriteIds = new Set([
    "seed-imaging-set",
    "seed-other-chest-set",
    "seed-other-abdomen-set",
    "seed-imaging-full-scr",
    "seed-imaging-heart-echo",
    "seed-imaging-abdomen-echo",
    "seed-imaging-xray",
    "seed-imaging-heart-echo-scr",
    "seed-imaging-heart-echo-flow",
    "seed-imaging-heart-echo-enlarge",
    "seed-imaging-abdomen-echo-scr",
    "seed-imaging-abdomen-echo-spleen",
    "seed-imaging-abdomen-echo-liver",
    "seed-imaging-abdomen-echo-kidney",
    "seed-imaging-abdomen-echo-ureter",
    "seed-imaging-abdomen-echo-bladder",
    "seed-imaging-abdomen-echo-prostate",
    "seed-imaging-xray-chest",
    "seed-imaging-xray-trachea",
    "seed-imaging-xray-abdomen",
    "seed-imaging-xray-hip",
    "seed-imaging-xray-shoulder",
    "seed-imaging-xray-forelimb",
    "seed-imaging-xray-hindlimb",
    "seed-imaging-xray-nose",
    "seed-imaging-xray-tooth",
  ]);
  EXAM_ITEM_SEED.forEach((seed) => {
    if (retired.has(seed.id)) return;
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
  // 旧スク／セット名称が別IDで残っていれば強制移行
  Object.entries(existing).forEach(([id, row]) => {
    if (!row || typeof row !== "object") return;
    if (forceRewriteIds.has(id)) return;
    if (EXAM_ITEM_SEED.some((seed) => seed.id === id)) return;
    const label = String(row.label || "").trim();
    if (EXAM_ITEM_LABEL_RETIRE.includes(label)) {
      writes[id] = null;
      return;
    }
    const mig = EXAM_ITEM_LABEL_MIGRATE.find((m) => m.from === label);
    if (!mig) return;
    writes[id] = {
      label: mig.to,
      category: mig.category,
      kind: "leaf",
      parentId: mig.parentId || "",
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

/**
 * 検査項目マスタを削除する。中項目の場合は配下の小項目もまとめて削除する。
 * シード項目は retired に記録し、ensure で復活しないようにする。
 */
export async function deleteExamItem(itemId) {
  await authReady;
  const id = String(itemId || "").trim();
  if (!id) return;
  const snap = await get(examItemsRef());
  const value = snap.val() || {};
  const items = Object.entries(value).map(([itemKey, raw]) =>
    normalizeExamItem(itemKey, raw)
  );
  const ids = collectMasterDescendantIds(items, id);
  await removeMasterItemsWithRetire("examItems", ids);
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

export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" },
  { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" },
  { id: "eye", label: "点眼薬" },
  { id: "supplement", label: "サプリメント・商品" },
  { id: "food", label: "フード" },
];
const MEDICATION_ITEM_CATEGORY_IDS = new Set(
  MEDICATION_ITEM_CATEGORIES.map((c) => c.id)
);

/** 既存フラット薬剤の仮置き先（内服 → その他） */
export const MED_ORAL_OTHER_GROUP_ID = "seed-med-oral-other";

function medicationItemsRef() {
  return ref(db, "medicationItems");
}

export function normalizeMedicationItemCategory(category) {
  const id = String(category || "").trim();
  return MEDICATION_ITEM_CATEGORY_IDS.has(id) ? id : "oral";
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
  return {
    id,
    label,
    category,
    kind: "group",
    parentId: "",
    order,
  };
}

function medLeafSeed(category, parentId, id, label, order) {
  return {
    id,
    label,
    category,
    kind: "leaf",
    parentId,
    order,
  };
}

/** 中項目内の葉を指定順（10刻み）でシードする */
function medGroupLeaves(category, parentId, children) {
  return children.map((child, index) =>
    medLeafSeed(category, parentId, child.id, child.label, (index + 1) * 10)
  );
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
/** @deprecated 旧「皮膚」中項目。シード退役対象 */
export const MED_TOPICAL_SKIN_GROUP_ID = "seed-med-topical-skin";
/** @deprecated 旧「消毒」中項目。シード退役対象 */
export const MED_TOPICAL_DISINFECT_GROUP_ID = "seed-med-topical-disinfect";
/** @deprecated 旧「シャンプー・スキンケア」中項目。シード退役対象 */
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

/** 中項目シード */
const MEDICATION_ITEM_GROUP_SEED = [
  // 注射
  medGroupSeed(
    "inject",
    MED_INJECT_ANTIINFLAM_STEROID_GROUP_ID,
    "消炎・ステロイド",
    10
  ),
  medGroupSeed("inject", MED_INJECT_ANTIBIOTIC_GROUP_ID, "抗生剤", 20),
  medGroupSeed("inject", MED_INJECT_GI_GROUP_ID, "消化器", 30),
  medGroupSeed("inject", MED_INJECT_NEURO_GROUP_ID, "鎮痛・鎮静・神経", 40),
  medGroupSeed("inject", MED_INJECT_ANTICANCER_GROUP_ID, "抗癌剤", 50),
  medGroupSeed("inject", MED_INJECT_CARDIO_RESP_GROUP_ID, "循環器・呼吸器", 60),
  medGroupSeed("inject", MED_INJECT_OTHER_GROUP_ID, "その他", 70),
  // 内服
  medGroupSeed("oral", MED_ORAL_ANTIBIOTIC_GROUP_ID, "抗生剤", 10),
  medGroupSeed("oral", MED_ORAL_ANTIINFLAM_GROUP_ID, "消炎・鎮痛", 20),
  medGroupSeed("oral", MED_ORAL_STEROID_ANTIHIST_GROUP_ID, "ステロイド・抗ヒス", 40),
  medGroupSeed("oral", MED_ORAL_GI_STOMACH_GROUP_ID, "消化器（胃）", 50),
  medGroupSeed("oral", MED_ORAL_GI_INTESTINE_GROUP_ID, "消化器（腸）", 60),
  medGroupSeed("oral", MED_ORAL_LIVER_KIDNEY_GROUP_ID, "肝・腎・泌尿", 70),
  medGroupSeed("oral", MED_ORAL_CARDIO_GROUP_ID, "循環器", 80),
  medGroupSeed("oral", MED_ORAL_RESPIRATORY_GROUP_ID, "呼吸器", 90),
  medGroupSeed("oral", MED_ORAL_NEURO_GROUP_ID, "神経・行動", 100),
  medGroupSeed("oral", MED_ORAL_ANTIFUNGAL_GROUP_ID, "抗真菌・駆虫薬・抗ウイルス薬", 110),
  medGroupSeed("oral", MED_ORAL_IMMUNO_GROUP_ID, "免疫抑制", 120),
  medGroupSeed("oral", MED_ORAL_VITAMIN_GROUP_ID, "ビタミン・代謝", 130),
  medGroupSeed("oral", MED_ORAL_HORMONE_GROUP_ID, "ホルモン", 140),
  medGroupSeed("oral", MED_ORAL_BLOOD_GROUP_ID, "血液", 150),
  medGroupSeed("oral", MED_ORAL_ANTICANCER_GROUP_ID, "抗がん", 160),
  medGroupSeed("oral", MED_ORAL_KAMPO_GROUP_ID, "漢方", 170),
  medGroupSeed("oral", MED_ORAL_OTHER_GROUP_ID, "その他", 180),
  medGroupSeed("oral", "seed-med-oral-inject-suppository", "処方注射薬・座薬", 190),
  // 外用（皮膚ステロイド+抗菌／皮膚その他／耳）
  medGroupSeed("topical", MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID, "皮膚ステロイド+抗菌", 10),
  medGroupSeed("topical", MED_TOPICAL_SKIN_OTHER_GROUP_ID, "皮膚その他", 20),
  medGroupSeed("topical", MED_TOPICAL_EAR_GROUP_ID, "耳", 30),
  // サプリメント・商品
  medGroupSeed("supplement", MED_SUPPL_JOINT_GROUP_ID, "関節・炎症", 10),
  medGroupSeed("supplement", MED_SUPPL_ORAL_GROUP_ID, "口腔", 20),
  medGroupSeed("supplement", MED_SUPPL_GI_GROUP_ID, "消化器・代謝", 30),
  medGroupSeed("supplement", MED_SUPPL_KIDNEY_GROUP_ID, "腎臓", 40),
  medGroupSeed("supplement", MED_SUPPL_URINARY_GROUP_ID, "泌尿器", 50),
  medGroupSeed("supplement", MED_SUPPL_NEURO_GROUP_ID, "行動・神経", 60),
  medGroupSeed("supplement", MED_SUPPL_SKIN_GROUP_ID, "皮膚", 70),
  medGroupSeed("supplement", MED_SUPPL_OTHER_GROUP_ID, "その他", 80),
  // フード（中身は追って追加）
  medGroupSeed("food", MED_FOOD_HILLS_GROUP_ID, "Hills", 10),
  medGroupSeed("food", MED_FOOD_DOCTORS_GROUP_ID, "ドクターズ", 20),
  medGroupSeed("food", MED_FOOD_DIETIX_GROUP_ID, "ダイエティクス", 30),
  medGroupSeed("food", MED_FOOD_FARMINA_GROUP_ID, "ファルミナ", 40),
  medGroupSeed("food", MED_FOOD_PURINA_GROUP_ID, "ピュリナ", 50),
  medGroupSeed("food", MED_FOOD_ROYAL_CANIN_GROUP_ID, "ロイヤルカナン", 60),
  medGroupSeed("food", MED_FOOD_OTHER_GROUP_ID, "その他", 70),
];

/** 注射・内服・外用などの葉シード（中項目直下のフラット一覧・指定順） */
const MEDICATION_ITEM_LEAF_SEED = [
  ...medGroupLeaves("inject", MED_INJECT_ANTIINFLAM_STEROID_GROUP_ID, [
    { id: "seed-med-inject-pred-susp", label: "プレドニゾロン懸濁液" },
    { id: "seed-med-inject-onsior", label: "オンシオール" },
    { id: "seed-med-inject-tranexamic", label: "トラネキサム酸" },
    { id: "seed-med-inject-diphenhydramine", label: "ジフェンヒドラミン" },
    { id: "seed-med-inject-polaramine", label: "ポララミン" },
    { id: "seed-med-inject-panoquell", label: "パノクエル" },
    { id: "seed-med-inject-docp", label: "DOCP" },
    { id: "seed-med-inject-dexamethasone", label: "デキサメサゾン" },
    { id: "seed-med-inject-cytopoint", label: "サイトポイント" },
    { id: "seed-med-inject-cartrophen", label: "カルトロフェン" },
    { id: "seed-med-inject-pre-vax", label: "ワクチン前投与" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_ANTIBIOTIC_GROUP_ID, [
    { id: "seed-med-inject-convenia", label: "コンベニア" },
    { id: "seed-med-inject-abpc", label: "ABPC" },
    { id: "seed-med-inject-cez", label: "CEZ" },
    { id: "seed-med-inject-ctx", label: "CTX" },
    { id: "seed-med-inject-erfx", label: "ERFX" },
    { id: "seed-med-inject-mpm", label: "MPM" },
    { id: "seed-med-inject-fom-cat-contraindicated", label: "FOM(猫禁忌)" },
    { id: "seed-med-inject-st", label: "ST合剤" },
    { id: "seed-med-inject-amk", label: "AMK" },
    { id: "seed-med-inject-cldm", label: "CLDM" },
    { id: "seed-med-inject-vancomycin", label: "バンコマイシン" },
    { id: "seed-med-inject-cp", label: "CP" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_GI_GROUP_ID, [
    { id: "seed-med-inject-maropitant", label: "マロピタント" },
    { id: "seed-med-inject-ondansetron", label: "オンダンセトロン" },
    { id: "seed-med-inject-famotidine", label: "ファモチジン" },
    { id: "seed-med-inject-omeprazole", label: "オメプラゾール" },
    { id: "seed-med-inject-primperan", label: "プリンペラン" },
    { id: "seed-med-inject-buscopan", label: "ブスコパン" },
    { id: "seed-med-inject-diabuster", label: "ディアバスター" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_NEURO_GROUP_ID, [
    { id: "seed-med-inject-libera-dog", label: "リブレラ（犬）" },
    { id: "seed-med-inject-libera-camp-dog", label: "リブレラキャンペーン（犬）" },
    { id: "seed-med-inject-solensia-cat", label: "ソレンシア（猫）" },
    {
      id: "seed-med-inject-solensia-camp-cat",
      label: "ソレンシアキャンペーン（猫）",
    },
    { id: "seed-med-inject-butorphanol", label: "ブトルファノール" },
    { id: "seed-med-inject-buprenorphine", label: "ブプレノルフィン" },
    { id: "seed-med-inject-tramadol", label: "トラマドール" },
    { id: "seed-med-inject-phenobarbital", label: "フェノバール" },
    { id: "seed-med-inject-levetiracetam", label: "レベチラセタム" },
    { id: "seed-med-inject-midazolam", label: "ミダゾラム" },
    { id: "seed-med-inject-ketamine", label: "ケタミン" },
    { id: "seed-med-inject-morphine", label: "モルヒネ" },
    { id: "seed-med-inject-propofol", label: "プロポフォール" },
    { id: "seed-med-inject-alphaxalone", label: "アルファキサロン" },
    { id: "seed-med-inject-lidocaine", label: "リドカイン" },
    { id: "seed-med-inject-flumazenil", label: "フルマゼニル" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_ANTICANCER_GROUP_ID, [
    { id: "seed-med-inject-asparaginase", label: "L-アスパラギナーゼ" },
    { id: "seed-med-inject-doxorubicin", label: "ドキソルビシン" },
    { id: "seed-med-inject-vincristine", label: "ビンクリスチン" },
    { id: "seed-med-inject-cyclophosphamide", label: "シクロホスファミド" },
    { id: "seed-med-inject-carboplatin", label: "カルボプラチン" },
    { id: "seed-med-inject-vinblastine", label: "ビンブラスチン" },
    { id: "seed-med-inject-nimustine", label: "ニムスチン" },
    { id: "seed-med-inject-zoledronic", label: "ゾレドロン酸" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_CARDIO_RESP_GROUP_ID, [
    { id: "seed-med-inject-furosemide", label: "フロセミド" },
    { id: "seed-med-inject-diprophylline", label: "ジプロフィリン" },
    { id: "seed-med-inject-pimobendan", label: "ピモベンダン" },
    { id: "seed-med-inject-atropine", label: "アトロピン" },
    { id: "seed-med-inject-ephedrine", label: "エフェドリン" },
    { id: "seed-med-inject-bosmin", label: "ボスミン" },
    { id: "seed-med-inject-norepinephrine", label: "ノルエピネフリン" },
    { id: "seed-med-inject-dobutamine", label: "ドブタミン" },
    { id: "seed-med-inject-dopamine", label: "ドパミン" },
    { id: "seed-med-inject-diltiazem", label: "ジルチアゼム" },
    { id: "seed-med-inject-acepromazine", label: "アセプロマジン" },
    { id: "seed-med-inject-danpron", label: "ダンプロン" },
    { id: "seed-med-inject-cough-maropitant", label: "咳マロピタント" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_OTHER_GROUP_ID, [
    { id: "seed-med-inject-dalteparin", label: "ダルテパリン" },
    { id: "seed-med-inject-darbepoetin", label: "ダルベポエチン" },
    { id: "seed-med-inject-epovet", label: "エポベット" },
    { id: "seed-med-inject-iron-tonky", label: "鉄剤（トンキー）" },
    { id: "seed-med-inject-intercat", label: "インターキャット" },
    { id: "seed-med-inject-pegasys", label: "ペガシス" },
    { id: "seed-med-inject-hepahica", label: "ヘパヒカ" },
    { id: "seed-med-inject-mecobalamin", label: "メコバラミン" },
    { id: "seed-med-inject-k2", label: "K2" },
    { id: "seed-med-inject-vitamin-c", label: "ビタミンC" },
    { id: "seed-med-inject-alinamin", label: "アリナミン" },
    { id: "seed-med-inject-mercasol", label: "メルカゾール" },
    { id: "seed-med-inject-cortrosyn", label: "コートロシン" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_ANTIBIOTIC_GROUP_ID, [
    { id: "seed-med-oral-abx-amoxicillin", label: "アモキシシリン" },
    { id: "seed-med-oral-abx-amox-clav", label: "クラブラン酸/アモキシシリン" },
    { id: "seed-med-oral-abx-cephalexin", label: "セファレキシン" },
    { id: "seed-med-oral-abx-cefpodoxime", label: "セフポドキシム" },
    { id: "seed-med-oral-abx-faropenem", label: "ファロペネム" },
    { id: "seed-med-oral-abx-azithromycin", label: "アジスロマイシン" },
    { id: "seed-med-oral-abx-tylosin", label: "タイロシン" },
    { id: "seed-med-oral-abx-clindamycin", label: "クリンダマイシン" },
    { id: "seed-med-oral-abx-fosfomycin", label: "ホスホマイシン" },
    { id: "seed-med-oral-abx-doxycycline", label: "ドキシサイクリン" },
    { id: "seed-med-oral-abx-minocycline", label: "ミノサイクリン" },
    { id: "seed-med-oral-abx-enrofloxacin", label: "エンロフロキサシン" },
    { id: "seed-med-oral-abx-orbifloxacin", label: "オルビフロキサシン" },
    { id: "seed-med-oral-abx-moxifloxacin", label: "モキシフロキサシン" },
    { id: "seed-med-oral-abx-veraflox", label: "ベラフロックス" },
    { id: "seed-med-oral-abx-st", label: "ST合剤" },
    { id: "seed-med-oral-abx-chloramphenicol", label: "クロラムフェニコール" },
    { id: "seed-med-oral-abx-metronidazole", label: "メトロニダゾール" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_ANTIINFLAM_GROUP_ID, [
    { id: "seed-med-oral-nsaid-onsior", label: "オンシオール" },
    { id: "seed-med-oral-nsaid-previcox", label: "プレビコックス" },
    { id: "seed-med-oral-nsaid-galliprant", label: "ガリプラント" },
    { id: "seed-med-oral-nsaid-trocoxil", label: "トロコキシル" },
    { id: "seed-med-oral-nsaid-panoquell", label: "パノクエル" },
    { id: "seed-med-oral-nsaid-tramadol", label: "トラマドール" },
    { id: "seed-med-oral-nsaid-pregabalin", label: "プレガバリン" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_STEROID_ANTIHIST_GROUP_ID, [
    { id: "seed-med-oral-steroid-prednisolone", label: "プレドニゾロン" },
    { id: "seed-med-oral-steroid-ledercort", label: "レダコート" },
    { id: "seed-med-oral-steroid-zentacort", label: "ゼンタコート" },
    { id: "seed-med-oral-steroid-cortef", label: "コートリル" },
    { id: "seed-med-oral-antihist-restamin", label: "レスタミン" },
    { id: "seed-med-oral-antihist-cetirizine", label: "セチリジン" },
    { id: "seed-med-oral-antihist-periactin", label: "ペリアクチン" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_GI_STOMACH_GROUP_ID, [
    { id: "seed-med-oral-gi-s-maropitant", label: "マロピタント" },
    { id: "seed-med-oral-gi-s-primperan", label: "プリンペラン" },
    { id: "seed-med-oral-gi-s-ondansetron", label: "オンダンセトロン" },
    { id: "seed-med-oral-gi-s-contomin", label: "コントミン" },
    { id: "seed-med-oral-gi-s-famotidine", label: "ファモチジン" },
    { id: "seed-med-oral-gi-s-lansoprazole", label: "ランソプラゾール" },
    { id: "seed-med-oral-gi-s-omeprazole", label: "オメプラゾール" },
    { id: "seed-med-oral-gi-s-diquanon", label: "ディクアノン" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_GI_INTESTINE_GROUP_ID, [
    { id: "seed-med-oral-gi-i-mosapride", label: "モサプリド" },
    { id: "seed-med-oral-gi-i-mesalazine", label: "メサラジン" },
    { id: "seed-med-oral-gi-i-salazopyrin", label: "サラゾピリン" },
    { id: "seed-med-oral-gi-i-delclear", label: "デルクリアー" },
    { id: "seed-med-oral-gi-i-diabuster", label: "ディアバスター" },
    { id: "seed-med-oral-gi-i-fortiflora", label: "FortiFlora" },
    { id: "seed-med-oral-gi-i-buscopan", label: "ブスコパン" },
    { id: "seed-med-oral-gi-i-miyabm", label: "ミヤBM" },
    { id: "seed-med-oral-gi-i-zenrase", label: "ゼンラーゼ" },
    { id: "seed-med-oral-gi-i-mitomax", label: "マイトマックス" },
    { id: "seed-med-oral-gi-i-biofermin-r", label: "ビオフェルミンR散剤" },
    { id: "seed-med-oral-gi-i-bagasse", label: "バガス" },
    { id: "seed-med-oral-gi-i-psyllium", label: "サイリウム" },
    { id: "seed-med-oral-gi-i-guar-gum", label: "グアーガム" },
    { id: "seed-med-oral-gi-i-adsorbin", label: "アドソルビン" },
    { id: "seed-med-oral-gi-i-pancreatin", label: "パンクレアチン" },
    { id: "seed-med-oral-gi-i-picosulfate", label: "ピコスルファート" },
    { id: "seed-med-oral-gi-i-movicol", label: "モビコール" },
    { id: "seed-med-oral-gi-i-vaseline", label: "ワセリン軟膏" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_LIVER_KIDNEY_GROUP_ID, [
    { id: "seed-med-oral-lk-telmisartan", label: "テルミサルタン" },
    { id: "seed-med-oral-lk-rapros", label: "ラプロス" },
    { id: "seed-med-oral-lk-renagel", label: "レナジェル" },
    { id: "seed-med-oral-lk-nephguard", label: "ネフガード" },
    { id: "seed-med-oral-lk-semintra", label: "セミントラ" },
    { id: "seed-med-oral-lk-urarit", label: "ウラリット" },
    { id: "seed-med-oral-lk-urso", label: "ウルソ" },
    { id: "seed-med-oral-lk-spacor", label: "スパカール" },
    // 消化器（腸）にあった同名は削除せずこちらへ上書き移動
    { id: "seed-med-oral-lk-piale", label: "ピアーレシロップ" },
    { id: "seed-med-oral-lk-rivaguard", label: "リバガード" },
    { id: "seed-med-oral-lk-samylin", label: "SAMYLIN" },
    { id: "seed-med-oral-lk-urocalun", label: "ウロカルン" },
    { id: "seed-med-oral-lk-propalin", label: "プロパリン" },
    { id: "seed-med-oral-lk-welldeli", label: "ウエルデリ" },
    { id: "seed-med-oral-lk-tamsulosin", label: "タムスロシン塩酸塩" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_CARDIO_GROUP_ID, [
    { id: "seed-med-oral-cardio-pimobendan", label: "ピモベハート" },
    { id: "seed-med-oral-cardio-upinac", label: "アピナック" },
    { id: "seed-med-oral-cardio-amlodipine", label: "アムロジピン" },
    { id: "seed-med-oral-cardio-diltiazem", label: "ジルチアゼム" },
    { id: "seed-med-oral-cardio-itrol", label: "アイトロール" },
    { id: "seed-med-oral-cardio-sildenafil", label: "シルデナフィル" },
    { id: "seed-med-oral-cardio-tadalafil", label: "タダラフィル" },
    { id: "seed-med-oral-cardio-carvedilol", label: "カルベジロール" },
    { id: "seed-med-oral-cardio-atenolol", label: "アテノロール" },
    { id: "seed-med-oral-cardio-sotalol", label: "ソタコール" },
    { id: "seed-med-oral-cardio-cilostazol", label: "シロスタゾール" },
    { id: "seed-med-oral-cardio-beraprost", label: "ベラプロスト" },
    { id: "seed-med-oral-cardio-spironolactone", label: "スピロノラクトン" },
    { id: "seed-med-oral-cardio-hctz", label: "ヒドロクロロチアジド" },
    { id: "seed-med-oral-cardio-furosemide", label: "フロセミド" },
    { id: "seed-med-oral-cardio-torasemide", label: "トラセミド" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_RESPIRATORY_GROUP_ID, [
    { id: "seed-med-oral-resp-theolong", label: "テオロング" },
    { id: "seed-med-oral-resp-theophylline", label: "テオフィリン" },
    { id: "seed-med-oral-resp-mucosolvan", label: "ムコソルバン" },
    { id: "seed-med-oral-resp-montelukast", label: "モンテルカスト" },
    { id: "seed-med-oral-resp-butorphanol", label: "ブトルファノール" },
    { id: "seed-med-oral-resp-danpron", label: "ダンプロン" },
    { id: "seed-med-oral-resp-bricanyl", label: "ブリカニール" },
    { id: "seed-med-oral-resp-dextromethorphan", label: "デキストロメトルファン" },
    // 消化器（胃）の「マロピタント」とは別ラベル（鎮咳用途）
    { id: "seed-med-oral-resp-maropitant-cough", label: "マロピタント（鎮咳）" },
    { id: "seed-med-oral-resp-alber-liq", label: "アルベール液" },
    { id: "seed-med-oral-resp-meptin-liq", label: "メプチン液" },
    { id: "seed-med-oral-resp-cefazolin-liq", label: "セファゾリン液" },
    { id: "seed-med-oral-resp-bosmin-liq", label: "ボスミン液" },
    { id: "seed-med-oral-resp-bisolvon-liq", label: "ビソルボン液" },
    { id: "seed-med-oral-resp-gentamicin-liq", label: "ゲンタマイシン液" },
    { id: "seed-med-oral-resp-dexamethasone-liq", label: "デキサメサゾン液" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_NEURO_GROUP_ID, [
    { id: "seed-med-oral-neuro-zonisamide", label: "ゾニサミド" },
    { id: "seed-med-oral-neuro-kbr", label: "臭化カリウム" },
    { id: "seed-med-oral-neuro-midazolam-nasal", label: "ミダゾラム（鼻腔）" },
    { id: "seed-med-oral-neuro-phenobal", label: "フェノバール" },
    { id: "seed-med-oral-neuro-levetiracetam", label: "レベチラセタム" },
    { id: "seed-med-oral-neuro-diup-suppository", label: "ダイアップ坐剤" },
    { id: "seed-med-oral-neuro-entysce", label: "エンタイス" },
    { id: "seed-med-oral-neuro-elura", label: "エルーラ" },
    { id: "seed-med-oral-neuro-remeron", label: "レメロン" },
    { id: "seed-med-oral-neuro-fluoxetine", label: "フルオキセチン" },
    { id: "seed-med-oral-neuro-paroxetine", label: "パロキセチン" },
    { id: "seed-med-oral-neuro-trazodone", label: "トラゾドン" },
    { id: "seed-med-oral-neuro-tandospirone", label: "ダンドスピロン" },
    { id: "seed-med-oral-neuro-ravona", label: "ラボナ" },
    { id: "seed-med-oral-neuro-clomicalm", label: "クロミカルム" },
    { id: "seed-med-oral-neuro-landsen", label: "ランドセン" },
    { id: "seed-med-oral-neuro-mendon", label: "メンドン" },
    { id: "seed-med-oral-neuro-alprazolam", label: "アルプラゾラム" },
    { id: "seed-med-oral-neuro-gabapentin", label: "ガバペンチン" },
    { id: "seed-med-oral-neuro-acepromazine", label: "アセプロマジン" },
    { id: "seed-med-oral-neuro-isobide", label: "イソバイドシロップ" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_ANTIFUNGAL_GROUP_ID, [
    { id: "seed-med-oral-af-itraconazole", label: "イトラコナゾール" },
    { id: "seed-med-oral-af-ketoconazole", label: "ケトコナゾール" },
    { id: "seed-med-oral-af-drontal", label: "ドロンタール" },
    { id: "seed-med-oral-af-drontal-plus", label: "ドロンタールプラス" },
    { id: "seed-med-oral-af-procox", label: "プロコックス" },
    { id: "seed-med-oral-af-fenbendazole", label: "フェンベンダゾール" },
    { id: "seed-med-oral-af-tinidazole", label: "チニダゾール" },
    { id: "seed-med-oral-af-ronidazole", label: "ロニダゾール" },
    { id: "seed-med-oral-af-droncit", label: "ドロンシット" },
    // 旧抗生剤シードIDを流用し、中項目をこちらへ確実に移動
    { id: "seed-med-oral-abx-famciclovir", label: "ファムシクロビル" },
    { id: "seed-med-oral-af-molnupiravir", label: "モルヌピラビル" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_IMMUNO_GROUP_ID, [
    { id: "seed-med-oral-im-imuran", label: "イムラン" },
    { id: "seed-med-oral-im-chlorambucil", label: "クロラムブシル" },
    { id: "seed-med-oral-im-ciclavance", label: "シクラバンス" },
    { id: "seed-med-oral-im-cyclosporine-neoral", label: "シクロスポリン（ネオーラル）" },
    { id: "seed-med-oral-im-mofetil", label: "モフェチル" },
    { id: "seed-med-oral-im-bonzol", label: "ボンゾール" },
    { id: "seed-med-oral-im-arava", label: "アラバ" },
    { id: "seed-med-oral-im-zenrelia", label: "ゼンレリア" },
    { id: "seed-med-oral-im-apoquel", label: "アポキル" },
    { id: "seed-med-oral-im-diazoxide", label: "ジアゾキシド" },
    { id: "seed-med-oral-im-mestinon", label: "メスチノン" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_VITAMIN_GROUP_ID, [
    { id: "seed-med-oral-vit-mecobalamin", label: "メコバラミン" },
    { id: "seed-med-oral-vit-yuvela-n", label: "ユベラN" },
    { id: "seed-med-oral-vit-folic-acid", label: "葉酸" },
    { id: "seed-med-oral-vit-sembergo", label: "センベルゴ" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_HORMONE_GROUP_ID, [
    { id: "seed-med-oral-hormone-adrestan", label: "アドレスタン" },
    { id: "seed-med-oral-hormone-thyradin", label: "チラージン" },
    { id: "seed-med-oral-hormone-thyroblock", label: "チロブロック" },
    { id: "seed-med-oral-hormone-trilostane", label: "トリロスタン" },
    { id: "seed-med-oral-hormone-florinef", label: "フロリネフ" },
    { id: "seed-med-oral-hormone-sakiozeal", label: "サキオジール" },
    { id: "seed-med-oral-hormone-melatonin", label: "メラトニン" },
    { id: "seed-med-oral-hormone-thiamazole", label: "チアマゾール" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_KAMPO_GROUP_ID, [
    { id: "seed-med-oral-kampo-genki", label: "源気" },
    { id: "seed-med-oral-kampo-sanshen", label: "三仙" },
    { id: "seed-med-oral-kampo-seiki", label: "清肌" },
    { id: "seed-med-oral-kampo-tsuraku", label: "通楽" },
    { id: "seed-med-oral-kampo-roka", label: "露華" },
    { id: "seed-med-oral-kampo-neishin", label: "寧心" },
    { id: "seed-med-oral-kampo-junka", label: "潤華" },
    { id: "seed-med-oral-kampo-kaigen", label: "快元" },
    { id: "seed-med-oral-kampo-seiberia", label: "西伯利亜" },
    { id: "seed-med-oral-kampo-tsurin", label: "通淋" },
    { id: "seed-med-oral-kampo-seishin", label: "静心" },
    { id: "seed-med-oral-kampo-jijun", label: "滋潤" },
    { id: "seed-med-oral-kampo-sokufu", label: "熄風" },
    { id: "seed-med-oral-kampo-chousoku", label: "調息" },
    { id: "seed-med-oral-kampo-jinko", label: "腎固" },
    { id: "seed-med-oral-kampo-soga", label: "爽牙" },
    { id: "seed-med-oral-kampo-shigyaku-san", label: "四逆散" },
    { id: "seed-med-oral-kampo-hachimi-jio", label: "八味地黄丸" },
    { id: "seed-med-oral-kampo-hozen", label: "補全" },
    { id: "seed-med-oral-kampo-unnan-hakuyaku", label: "雲南白薬" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_ANTICANCER_GROUP_ID, [
    { id: "seed-med-oral-ac-imatinib", label: "イマチニブ" },
    { id: "seed-med-oral-ac-palladia", label: "パラディア" },
    { id: "seed-med-oral-ac-endoxan", label: "エンドキサン" },
    { id: "seed-med-oral-ac-tigason", label: "チガソン" },
    { id: "seed-med-oral-ac-lomustine", label: "ロムスチン" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_BLOOD_GROUP_ID, [
    { id: "seed-med-oral-blood-domenan", label: "ドメナン" },
    { id: "seed-med-oral-blood-clopidogrel", label: "クロピドグレル" },
    { id: "seed-med-oral-blood-xarelto", label: "イグザレルト" },
    { id: "seed-med-oral-blood-tranexamic", label: "トラネキサム酸" },
  ]),
  ...medGroupLeaves("topical", MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID, [
    { id: "seed-med-topical-skin-gentamicin", label: "ゲンタマイシンクリーム" },
    { id: "seed-med-topical-skin-geben", label: "ゲーベンクリーム" },
    { id: "seed-med-topical-skin-ozone-gel", label: "オゾンジェル" },
    { id: "seed-med-topical-skin-ketoconazole", label: "ケトコナゾールクリーム" },
    { id: "seed-med-topical-ear-victas-mt", label: "ビクタスMTクリーム" },
    { id: "seed-med-topical-skin-allerief", label: "アレリーフローション" },
    { id: "seed-med-topical-skin-mometotic", label: "モメタオティック" },
    { id: "seed-med-topical-skin-restamin-kowa", label: "レスタミンコーワ軟膏" },
    { id: "seed-med-topical-skin-spirazone", label: "スピラゾン軟膏" },
    { id: "seed-med-topical-skin-mometasone", label: "モメタゾン軟膏" },
  ]),
  ...medGroupLeaves("topical", MED_TOPICAL_SKIN_OTHER_GROUP_ID, [
    { id: "seed-med-topical-skin-heparin-cream", label: "ヘパリンクリーム" },
    { id: "seed-med-topical-skin-heparin-foam", label: "ヘパリン泡スプレー" },
    { id: "seed-med-topical-skin-horse-oil", label: "馬油" },
    { id: "seed-med-topical-skin-chitosan", label: "キトサンパウダー" },
    { id: "seed-med-topical-skin-chitosan-mnz", label: "キトサンMNZパウダー" },
    { id: "seed-med-topical-skin-antinoll", label: "アンチノールスキン" },
    { id: "seed-med-topical-skin-tacrolimus", label: "タクロリムス軟膏" },
    { id: "seed-med-topical-skin-quick-stop", label: "クイックストップ" },
  ]),
  ...medGroupLeaves("topical", MED_TOPICAL_EAR_GROUP_ID, [
    { id: "seed-med-topical-ear-silpina", label: "シルピナ" },
    { id: "seed-med-topical-ear-mimipure", label: "ミミピュア" },
    { id: "seed-med-topical-ear-edta", label: "EDTAイヤークリーナー" },
    { id: "seed-med-topical-ear-pet-liquid", label: "Pet Ear&Skincare Liquid" },
    { id: "seed-med-topical-ear-ivermectin", label: "イベルメクチン（耳用）" },
  ]),
  ...medGroupLeaves("eye", "", [
    { id: "seed-med-eye-oneclean", label: "ワンクリーン点眼液" },
    { id: "seed-med-eye-hyaluronate", label: "ヒアルロン酸点眼液" },
    { id: "seed-med-eye-hyalein-mini", label: "ヒアレインミニ" },
    { id: "seed-med-eye-levofloxacin", label: "レボフロキサシン点眼液" },
    { id: "seed-med-eye-bestron", label: "ベストロン点眼液" },
    { id: "seed-med-eye-gentamicin", label: "ゲンタマイシン点眼液" },
    { id: "seed-med-eye-ofloxacin-oint", label: "オフロキサシン眼軟膏" },
    { id: "seed-med-eye-ecolysin-oint", label: "エコリシン眼軟膏" },
    { id: "seed-med-eye-gatifloxacin", label: "ガチフロキサシン点眼液" },
    { id: "seed-med-eye-fvr-mix", label: "FVR Mix" },
    { id: "seed-med-eye-hya-pranoprofen", label: "ヒア・プラノプロフェン点眼液" },
    { id: "seed-med-eye-hya-gm", label: "ヒアGM" },
    { id: "seed-med-eye-hya-gm-intercat", label: "ヒアGM＋インターキャット" },
    { id: "seed-med-eye-panoquell-bestron", label: "パノクエル加ベストロン" },
    { id: "seed-med-eye-panoquell-azulene", label: "パノクエル加アズレン" },
    { id: "seed-med-eye-pranoprofen", label: "プラノプロフェン点眼液" },
    { id: "seed-med-eye-diclo-star", label: "ジクロスター点眼液" },
    { id: "seed-med-eye-sterop", label: "ステロップ点眼液" },
    { id: "seed-med-eye-dexamethasone", label: "デキサメサゾン点眼液" },
    { id: "seed-med-eye-neomedrol-oint", label: "ネオメドロール眼軟膏" },
    { id: "seed-med-eye-idu", label: "IDU点眼液" },
    { id: "seed-med-eye-acyclovir-oint", label: "アシクロビル眼軟膏" },
    { id: "seed-med-eye-optimune-oint", label: "オプティミューン眼軟膏" },
    { id: "seed-med-eye-pirenoxine", label: "ピレノキシン点眼液" },
    { id: "seed-med-eye-serum", label: "血清点眼液" },
    { id: "seed-med-eye-azulene", label: "アズレン点眼液" },
    { id: "seed-med-eye-latanoprost", label: "ラタノプロスト点眼液" },
    { id: "seed-med-eye-azorga", label: "アゾルガ点眼液" },
    { id: "seed-med-eye-egypt", label: "エイジプト点眼液" },
    { id: "seed-med-eye-tapros", label: "タプロス点眼液" },
    { id: "seed-med-eye-timolol", label: "チモロール点眼液" },
    { id: "seed-med-eye-neosynesin-kowa", label: "ネオシネジンコーワ" },
    { id: "seed-med-eye-tropicamide", label: "トロピカミド" },
    { id: "seed-med-eye-desmopressin", label: "デスモプレシン" },
    { id: "seed-med-eye-brenda", label: "ブレンダ点眼" },
    { id: "seed-med-eye-acetylcysteine", label: "アセチルシステイン点眼液" },
    { id: "seed-med-eye-brinzolamide", label: "ブリンゾラミド懸濁性点眼液" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_JOINT_GROUP_ID, [
    { id: "seed-med-suppl-joint-antinoll-plus", label: "アンチノールプラス（犬猫用）" },
    { id: "seed-med-suppl-joint-antinoll-cat", label: "アンチノール（猫用）" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_ORAL_GROUP_ID, [
    { id: "seed-med-suppl-oral-oralguard-v", label: "オーラルガードV" },
    { id: "seed-med-suppl-oral-vi001", label: "Vi001デンタルジェル" },
    { id: "seed-med-suppl-oral-scallo", label: "スカロー" },
    { id: "seed-med-suppl-oral-scallo-dental-gel", label: "スカローデンタルジェル" },
    { id: "seed-med-suppl-oral-virbac-brush-mini", label: "ビルバックデンタルブラシミニ" },
    { id: "seed-med-suppl-oral-virbac-periaid", label: "ビルバックペリエイドデンタルブラシ" },
    { id: "seed-med-suppl-oral-virbac-brush-double", label: "ビルバックデンタルブラシダブル" },
    { id: "seed-med-suppl-oral-lion-brush", label: "ライオンハブラシ" },
    { id: "seed-med-suppl-oral-ci-shuwawa", label: "Ciシュワワハブラシ" },
    { id: "seed-med-suppl-oral-awayuki-small", label: "泡雪（ハブラシ小）" },
    { id: "seed-med-suppl-oral-awayuki-xs", label: "泡雪（ハブラシ極小）" },
    { id: "seed-med-suppl-oral-anisapo-glove", label: "アニサポ_歯磨きグローブ" },
    { id: "seed-med-suppl-oral-kaito-veil", label: "カイトベールオーラルケア" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_GI_GROUP_ID, [
    { id: "seed-med-suppl-gi-flora-care", label: "フローラケア" },
    { id: "seed-med-suppl-gi-eneala", label: "エネアラ" },
    { id: "seed-med-suppl-gi-laxatone", label: "ラキサトーン" },
    { id: "seed-med-suppl-gi-cat-lux", label: "CAT LUX" },
    { id: "seed-med-suppl-gi-pe-mct-powder-plus", label: "PE_MCTパウダープラス" },
    { id: "seed-med-suppl-gi-glucose-50", label: "50%ブドウ糖注射液" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_KIDNEY_GROUP_ID, [
    { id: "seed-med-suppl-kidney-carinal-combo", label: "カリナールコンボ" },
    { id: "seed-med-suppl-kidney-pronefra", label: "プロネフラ" },
    { id: "seed-med-suppl-kidney-phytocare", label: "フィトケア" },
    { id: "seed-med-suppl-kidney-renal-k", label: "リーナルK" },
    { id: "seed-med-suppl-kidney-azodyl", label: "アジデイル" },
    { id: "seed-med-suppl-kidney-phos-care", label: "リンケア" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_URINARY_GROUP_ID, [
    { id: "seed-med-suppl-urinary-uroact-plus", label: "ウロアクトプラス" },
    { id: "seed-med-suppl-urinary-utclean", label: "UTclean" },
    { id: "seed-med-suppl-urinary-utclean-ca", label: "UTclean_Ca" },
    { id: "seed-med-suppl-urinary-calmurofel", label: "Calmurofel" },
    { id: "seed-med-suppl-urinary-welldeli", label: "ウエルデリ" },
    { id: "seed-med-suppl-urinary-ut-stick", label: "UTスティック" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_NEURO_GROUP_ID, [
    { id: "seed-med-suppl-neuro-zylkene", label: "ジルケーン" },
    { id: "seed-med-suppl-neuro-aktivait", label: "AKTIVAIT" },
    { id: "seed-med-suppl-neuro-cbd-casein", label: "CBDカゼインタブ" },
    { id: "seed-med-suppl-neuro-neuroact-plus", label: "ニューロアクトプラス" },
    { id: "seed-med-suppl-neuro-cbd-oil-3", label: "小型犬・猫３％CBDオイル" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_SKIN_GROUP_ID, [
    { id: "seed-med-suppl-skin-dermact", label: "ダーマクト" },
    { id: "seed-med-suppl-skin-omega-sunshine", label: "オメガサンシャイン" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_OTHER_GROUP_ID, [
    { id: "seed-med-suppl-other-soltol-one", label: "ソルトールワン" },
    { id: "seed-med-suppl-other-eyeact", label: "アイアクト" },
    { id: "seed-med-suppl-other-viralys-plus", label: "バイラリスプラス" },
    { id: "seed-med-suppl-other-oryzarose", label: "オリザロース" },
    { id: "seed-med-suppl-other-insulact", label: "インスラクト" },
    { id: "seed-med-suppl-other-heartact", label: "ハートアクト" },
    { id: "seed-med-suppl-other-hydra-care", label: "Hydra Care" },
    { id: "seed-med-suppl-other-carming-care", label: "Carming Care" },
    { id: "seed-med-suppl-other-animewn", label: "アニミューン" },
    { id: "seed-med-suppl-other-eyelid-lash", label: "アイリッドラッシュ" },
    { id: "seed-med-suppl-other-pet-mybo-shampoo", label: "Pet Mybo shampoo" },
  ]),
];

/** 外用再編で廃止する中項目・葉シード（DBから削除） */
const MEDICATION_ITEM_SEED_RETIRE = [
  // 空の内服中項目
  "seed-med-oral-analgesic",
  // 旧中項目
  "seed-med-topical-skin",
  "seed-med-topical-disinfect",
  "seed-med-topical-shampoo",
  // 旧・消毒
  "seed-med-topical-disinfect-ch-towel",
  "seed-med-topical-disinfect-ap-water",
  // 旧・耳（最終リスト外／皮膚側へ統合した重複）
  "seed-med-topical-ear-mometotic",
  "seed-med-topical-ear-izotic",
  "seed-med-topical-ear-berbezolon",
  "seed-med-topical-ear-epiotic",
  "seed-med-topical-ear-mal-a-ket-plus",
  "seed-med-topical-ear-malacetic",
  // 旧・シャンプー・スキンケア
  "seed-med-topical-shampoo-malasecure",
  "seed-med-topical-shampoo-hinocare",
  "seed-med-topical-shampoo-nano-basing",
  "seed-med-topical-shampoo-cleansing-oil",
  "seed-med-topical-shampoo-chlorhexidine",
  "seed-med-topical-shampoo-derma-moist",
  "seed-med-topical-shampoo-hoscare",
  "seed-med-topical-shampoo-quanpow",
  "seed-med-topical-shampoo-quanpow-bath-milk",
];

/** ラベル一致で削除する旧項目（ユーザー追加分も含む） */
const MEDICATION_ITEM_LABEL_RETIRE = ["デルトピカローション", "エピオティック"];

const MEDICATION_ITEM_GROUP_SEED_IDS = new Set(
  MEDICATION_ITEM_GROUP_SEED.map((s) => s.id)
);
const MEDICATION_ITEM_LEAF_SEED_IDS = new Set(
  MEDICATION_ITEM_LEAF_SEED.map((s) => s.id)
);

function medicationItemSeedPayload(seed) {
  return {
    label: seed.label,
    category: normalizeMedicationItemCategory(seed.category),
    kind: normalizeMedicationItemKind(seed.kind),
    parentId: seed.parentId || "",
    order: seed.order,
  };
}

function medicationItemSeedEquals(row, payload) {
  if (!row || typeof row !== "object") return false;
  return (
    (row.label || "") === payload.label &&
    normalizeMedicationItemCategory(row.category) === payload.category &&
    normalizeMedicationItemKind(row.kind) === payload.kind &&
    String(row.parentId || "").trim() === String(payload.parentId || "").trim() &&
    typeof row.order === "number" &&
    row.order === payload.order
  );
}

/** 同名葉の上書き対象。別中項目の現行葉シードは奪わず共存させる。 */
function findSameNameLeafIdForSeed(next, payload) {
  const seedParent = String(payload.parentId || "").trim();
  return Object.entries(next).find(([id, row]) => {
    if (!row || typeof row !== "object") return false;
    if (MEDICATION_ITEM_GROUP_SEED_IDS.has(id)) return false;
    if (normalizeMedicationItemKind(row.kind) === "group") return false;
    if (String(row.label || "").trim() !== payload.label) return false;
    const rowParent = String(row.parentId || "").trim();
    if (rowParent === seedParent) return true;
    // 別中項目／別大分類の現行葉シードは残す
    if (MEDICATION_ITEM_LEAF_SEED_IDS.has(id)) {
      return false;
    }
    return true;
  })?.[0];
}

/**
 * 中項目・葉シードを補完し、旧フラット薬剤を内服→その他へ移す。
 * 葉は固定IDを優先し、同名の既存葉があれば削除せず上書き（表記・所属を統一）。
 * ただし別中項目の現行葉シード同名は上書きせず、新規IDで共存する。
 */
export async function ensureMedicationItemDefaults() {
  await authReady;
  const snap = await get(medicationItemsRef());
  const existing =
    snap.exists() && typeof snap.val() === "object" ? snap.val() : {};
  const retired = await loadRetiredMasterIdSet("medicationItems");
  const next = {};
  Object.entries(existing).forEach(([id, row]) => {
    if (row && typeof row === "object") {
      next[id] = { ...row };
    }
  });

  MEDICATION_ITEM_GROUP_SEED.forEach((seed) => {
    if (retired.has(seed.id)) return;
    next[seed.id] = medicationItemSeedPayload(seed);
  });

  Object.entries(next).forEach(([id, row]) => {
    if (!row || typeof row !== "object") return;
    if (MEDICATION_ITEM_GROUP_SEED_IDS.has(id)) return;
    if (MEDICATION_ITEM_LEAF_SEED_IDS.has(id)) return;

    const hasCategory = Object.prototype.hasOwnProperty.call(row, "category");
    const hasKind = Object.prototype.hasOwnProperty.call(row, "kind");
    const kind = normalizeMedicationItemKind(row.kind);
    const category = hasCategory
      ? normalizeMedicationItemCategory(row.category)
      : "";
    const parentId = String(row.parentId || "").trim();

    // 旧フラット（category/kind 無し）→ 内服／その他
    const isLegacyFlat = !hasCategory || !hasKind;
    // 内服・外用なのに親無しの葉 → 中項目直下へ（仮で内服／その他）
    const isOrphanLeaf =
      kind === "leaf" &&
      (category === "oral" || category === "topical") &&
      !parentId;

    if (!isLegacyFlat && !isOrphanLeaf) return;

    next[id] = {
      label: row.label || "",
      category: "oral",
      kind: "leaf",
      parentId: MED_ORAL_OTHER_GROUP_ID,
      order: typeof row.order === "number" ? row.order : Date.now(),
    };
  });

  MEDICATION_ITEM_LEAF_SEED.forEach((seed) => {
    if (retired.has(seed.id)) return;
    const payload = medicationItemSeedPayload(seed);
    if (next[seed.id]) {
      next[seed.id] = payload;
      return;
    }

    // 同名の既存葉は削除せず、今回の内容で上書き（表記・所属を統一）
    const sameNameId = findSameNameLeafIdForSeed(next, payload);

    if (sameNameId) {
      if (retired.has(sameNameId)) return;
      next[sameNameId] = payload;
      return;
    }

    next[seed.id] = payload;
  });

  // ユーザー削除済みシードは ensure で復活させない
  retired.forEach((id) => {
    delete next[id];
  });

  // 廃止シードを除去
  MEDICATION_ITEM_SEED_RETIRE.forEach((id) => {
    delete next[id];
  });
  Object.entries(next).forEach(([id, row]) => {
    if (!row || typeof row !== "object") return;
    if (MEDICATION_ITEM_GROUP_SEED_IDS.has(id)) return;
    if (MEDICATION_ITEM_LEAF_SEED_IDS.has(id)) return;
    const label = String(row.label || "").trim();
    if (MEDICATION_ITEM_LABEL_RETIRE.includes(label)) {
      delete next[id];
    }
  });

  const writes = {};
  Object.entries(next).forEach(([id, row]) => {
    const prev = existing[id];
    if (!prev || !medicationItemSeedEquals(prev, medicationItemSeedPayload(row))) {
      // row はすでに payload 形。正規化して書く
      writes[id] = {
        label: row.label || "",
        category: normalizeMedicationItemCategory(row.category),
        kind: normalizeMedicationItemKind(row.kind),
        parentId:
          normalizeMedicationItemKind(row.kind) === "group"
            ? ""
            : String(row.parentId || "").trim(),
        order: typeof row.order === "number" ? row.order : 0,
      };
    }
  });
  MEDICATION_ITEM_SEED_RETIRE.forEach((id) => {
    if (existing[id]) writes[id] = null;
  });
  retired.forEach((id) => {
    if (existing[id]) writes[id] = null;
  });
  Object.keys(existing).forEach((id) => {
    if (next[id]) return;
    if (writes[id] === null) return;
    const row = existing[id];
    if (!row || typeof row !== "object") return;
    if (MEDICATION_ITEM_GROUP_SEED_IDS.has(id)) return;
    if (MEDICATION_ITEM_LEAF_SEED_IDS.has(id)) return;
    const label = String(row.label || "").trim();
    if (MEDICATION_ITEM_LABEL_RETIRE.includes(label)) {
      writes[id] = null;
    }
  });

  if (Object.keys(writes).length) {
    await update(medicationItemsRef(), writes);
  }
}

/**
 * 薬剤マスタをリアルタイム監視する。order 昇順で callback に渡す。
 * 中項目シード／旧データの移行は監視開始後に遅延実行する。
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
        const items = Object.entries(value).map(([id, t]) =>
          normalizeMedicationItem(id, t)
        );
        items.sort((a, b) => {
          const ord = (a.order ?? 0) - (b.order ?? 0);
          if (ord !== 0) return ord;
          return (a.label || "").localeCompare(b.label || "", "ja");
        });
        callback(items);
      });
      const runSeed = () => {
        if (unsubscribed) return;
        ensureMedicationItemDefaults().catch((err) => {
          console.error("薬剤マスタの初期化に失敗しました", err);
        });
      };
      setTimeout(runSeed, 0);
      setTimeout(runSeed, 2500);
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
export async function fetchMedicationItemsOnce({ ensureDefaults = false } = {}) {
  await authReady;
  if (ensureDefaults) {
    try {
      await ensureMedicationItemDefaults();
    } catch (err) {
      console.warn("薬剤マスタのシード補完に失敗しました", err);
    }
  }
  const snapshot = await get(medicationItemsRef());
  const value = snapshot.val() || {};
  const items = Object.entries(value).map(([id, t]) =>
    normalizeMedicationItem(id, t)
  );
  items.sort((a, b) => {
    const ord = (a.order ?? 0) - (b.order ?? 0);
    if (ord !== 0) return ord;
    return (a.label || "").localeCompare(b.label || "", "ja");
  });
  return items;
}

/**
 * 検査項目マスタを1回だけ取得する（全分類・内訳含む）。
 * シード不足がある場合は先に補完してから読み直す。
 */
export async function fetchExamItemsOnce({ ensureDefaults = false } = {}) {
  await authReady;
  if (ensureDefaults) {
    try {
      await ensureExamItemDefaults();
    } catch (err) {
      console.warn("検査項目マスタのシード補完に失敗しました", err);
    }
  }
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

export async function addMedicationItem({
  label,
  order,
  category,
  kind = "leaf",
  parentId = "",
}) {
  await authReady;
  const resolvedKind = normalizeMedicationItemKind(kind);
  const newRef = push(medicationItemsRef());
  await set(newRef, {
    label: label || "",
    category: normalizeMedicationItemCategory(category),
    kind: resolvedKind,
    parentId: resolvedKind === "group" ? "" : String(parentId || "").trim(),
    order: typeof order === "number" ? order : Date.now(),
  });
  return newRef.key;
}

export async function updateMedicationItem(
  itemId,
  { label, category, kind, parentId }
) {
  await authReady;
  const patch = {};
  if (label != null) patch.label = label || "";
  if (category != null) {
    patch.category = normalizeMedicationItemCategory(category);
  }
  if (kind != null) {
    patch.kind = normalizeMedicationItemKind(kind);
    if (patch.kind === "group") patch.parentId = "";
  }
  if (parentId != null && patch.kind !== "group") {
    patch.parentId = String(parentId || "").trim();
  }
  if (Object.keys(patch).length) {
    await update(ref(db, `medicationItems/${itemId}`), patch);
  }
}

/**
 * 薬剤マスタを削除する。中項目の場合は配下の薬剤名もまとめて削除する。
 * シード項目は retired に記録し、ensure で復活しないようにする。
 */
export async function deleteMedicationItem(itemId) {
  await authReady;
  const id = String(itemId || "").trim();
  if (!id) return;
  const snap = await get(medicationItemsRef());
  const value = snap.val() || {};
  const items = Object.entries(value).map(([itemKey, raw]) =>
    normalizeMedicationItem(itemKey, raw)
  );
  const ids = collectMasterDescendantIds(items, id);
  await removeMasterItemsWithRetire("medicationItems", ids);
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
    prn: false,
    sideEffectNote: "",
    expiryEstimate: "",
    events: {},
  };
  if (!raw || typeof raw !== "object") return drug;

  drug.schemaVersion = raw.schemaVersion || MEDICATION_SCHEMA_VERSION;
  drug.name = raw.name || "";
  drug.category = ["A", "B", "C"].includes(raw.category) ? raw.category : "B";
  drug.prn = Boolean(raw.prn);
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
  {
    name,
    category,
    sideEffectNote,
    expiryEstimate,
    changedBy,
    eventDate,
    frequencyChange,
    frequency,
    amountChange,
  }
) {
  await authReady;
  const newRef = push(medicationsRef(karteNumber));
  const drugId = newRef.key;
  const date = eventDate || new Date().toISOString().slice(0, 10);
  await set(newRef, {
    schemaVersion: MEDICATION_SCHEMA_VERSION,
    name: name || "",
    category: ["A", "B", "C"].includes(category) ? category : "A",
    prn: false,
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
    amountChange: amountChange || "",
    changedBy: changedBy || "",
  });
  return drugId;
}

/**
 * 薬剤の基本情報を更新する（名前・カテゴリ・頓服・副作用メモ・処方切れ目安）。
 * 使用状況（継続/一時的/投与難/休薬中/中止）は events の最新から導出するためここでは扱わない。
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
  if (fields.prn != null) payload.prn = Boolean(fields.prn);
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

// --- 既往歴マスタ（疾患／手術／紹介先） ------------------------------------
// historyDiseaseItems/{id}: 大分類→中分類→小分類（group / leaf + parentId）
// historySurgeryItems/{id}: 同上（診療科別の大分類）
// historyReferralItems/{id}: フラットな紹介先リスト

function historyDiseaseItemsRef() {
  return ref(db, "historyDiseaseItems");
}
function historySurgeryItemsRef() {
  return ref(db, "historySurgeryItems");
}
function historyReferralItemsRef() {
  return ref(db, "historyReferralItems");
}

export function normalizeHistoryMasterKind(kind) {
  return String(kind || "").trim() === "group" ? "group" : "leaf";
}

function normalizeHistoryTreeItem(id, raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  const kind = normalizeHistoryMasterKind(row.kind);
  return {
    id,
    label: row.label || "",
    kind,
    parentId: String(row.parentId || "").trim(),
    order: typeof row.order === "number" ? row.order : 0,
  };
}

function normalizeHistoryReferralItem(id, raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  return {
    id,
    label: row.label || "",
    order: typeof row.order === "number" ? row.order : 0,
  };
}

function histTopGroupSeed(id, label, order) {
  return { id, label, kind: "group", parentId: "", order };
}

/** 疾患名マスタ: 臓器別の大分類のみシード（中・小は空） */
const HISTORY_DISEASE_GROUP_SEED = [
  histTopGroupSeed("seed-hist-disease-cardio", "循環器", 10),
  histTopGroupSeed("seed-hist-disease-gi", "消化器", 20),
  histTopGroupSeed("seed-hist-disease-kidney", "腎臓・泌尿器", 30),
  histTopGroupSeed("seed-hist-disease-resp", "呼吸器", 40),
  histTopGroupSeed("seed-hist-disease-neuro", "神経・行動", 50),
  histTopGroupSeed("seed-hist-disease-endo", "内分泌・代謝", 60),
  histTopGroupSeed("seed-hist-disease-skin", "皮膚", 70),
  histTopGroupSeed("seed-hist-disease-eye", "眼科", 80),
  histTopGroupSeed("seed-hist-disease-ortho", "整形外科", 90),
  histTopGroupSeed("seed-hist-disease-onco", "腫瘍", 100),
  histTopGroupSeed("seed-hist-disease-infect", "感染症", 110),
  histTopGroupSeed("seed-hist-disease-other", "その他", 120),
];

/** 手術名マスタ: 診療科別の大分類のみシード */
const HISTORY_SURGERY_GROUP_SEED = [
  histTopGroupSeed("seed-hist-surgery-ortho", "整形外科", 10),
  histTopGroupSeed("seed-hist-surgery-soft", "軟部外科", 20),
  histTopGroupSeed("seed-hist-surgery-dental", "歯科", 30),
  histTopGroupSeed("seed-hist-surgery-eye", "眼科", 40),
  histTopGroupSeed("seed-hist-surgery-ent", "耳鼻科", 50),
  histTopGroupSeed("seed-hist-surgery-other", "その他", 60),
];

/** 紹介先マスタ: よく使う紹介先 */
const HISTORY_REFERRAL_SEED = [
  { id: "seed-hist-referral-petemo", label: "ペテモ", order: 10 },
  { id: "seed-hist-referral-jarmec", label: "JARMeC", order: 20 },
  { id: "seed-hist-referral-jasmine", label: "JASMINE", order: 30 },
  { id: "seed-hist-referral-azabu", label: "麻布大学", order: 40 },
  { id: "seed-hist-referral-nihon", label: "日本大学", order: 50 },
  { id: "seed-hist-referral-nvlu", label: "日本獣医生命科学大学", order: 60 },
];

async function ensureHistoryTreeDefaults(itemsRef, collectionPath, seeds) {
  await authReady;
  const snapshot = await get(itemsRef);
  const existing = snapshot.val() || {};
  const retired = await loadRetiredMasterIdSet(collectionPath);
  const writes = {};
  seeds.forEach((seed) => {
    if (retired.has(seed.id)) return;
    const prev = existing[seed.id];
    const payload = {
      label: seed.label,
      kind: "group",
      parentId: "",
      order: seed.order,
    };
    if (
      !prev ||
      prev.label !== payload.label ||
      normalizeHistoryMasterKind(prev.kind) !== "group" ||
      String(prev.parentId || "").trim() !== "" ||
      Number(prev.order) !== payload.order
    ) {
      writes[seed.id] = payload;
    }
  });
  if (Object.keys(writes).length) {
    await update(itemsRef, writes);
  }
}

export async function ensureHistoryDiseaseItemDefaults() {
  await ensureHistoryTreeDefaults(
    historyDiseaseItemsRef(),
    "historyDiseaseItems",
    HISTORY_DISEASE_GROUP_SEED
  );
}

export async function ensureHistorySurgeryItemDefaults() {
  await ensureHistoryTreeDefaults(
    historySurgeryItemsRef(),
    "historySurgeryItems",
    HISTORY_SURGERY_GROUP_SEED
  );
}

/**
 * 紹介先マスタの不足シードを書き込む。
 * ユーザーが削除したシード（retired）は再投入しない。
 */
export async function ensureHistoryReferralItemDefaults() {
  await authReady;
  const itemsRef = historyReferralItemsRef();
  const snapshot = await get(itemsRef);
  const existing = snapshot.val() || {};
  const retired = await loadRetiredMasterIdSet("historyReferralItems");
  const writes = {};
  HISTORY_REFERRAL_SEED.forEach((seed) => {
    if (retired.has(seed.id)) return;
    const prev = existing[seed.id];
    const payload = { label: seed.label, order: seed.order };
    if (
      !prev ||
      prev.label !== payload.label ||
      Number(prev.order) !== payload.order
    ) {
      writes[seed.id] = payload;
    }
  });
  if (Object.keys(writes).length) {
    await update(itemsRef, writes);
  }
}

async function deleteHistoryTreeItem(itemsRef, collectionPath, itemId) {
  await authReady;
  const id = String(itemId || "").trim();
  if (!id) return;
  const snap = await get(itemsRef);
  const value = snap.val() || {};
  const items = Object.entries(value).map(([itemKey, raw]) =>
    normalizeHistoryTreeItem(itemKey, raw)
  );
  const ids = collectMasterDescendantIds(items, id);
  await removeMasterItemsWithRetire(collectionPath, ids);
}

export async function deleteHistoryDiseaseItem(itemId) {
  return deleteHistoryTreeItem(
    historyDiseaseItemsRef(),
    "historyDiseaseItems",
    itemId
  );
}

export async function deleteHistorySurgeryItem(itemId) {
  return deleteHistoryTreeItem(
    historySurgeryItemsRef(),
    "historySurgeryItems",
    itemId
  );
}

export async function deleteHistoryReferralItem(itemId) {
  await authReady;
  const id = String(itemId || "").trim();
  if (!id) return;
  await removeMasterItemsWithRetire("historyReferralItems", [id]);
}

function subscribeHistoryTreeItems(itemsRef, ensureDefaults, callback) {
  let unsubscribed = false;
  let listener = null;
  authReady
    .then(async () => {
      if (unsubscribed) return;
      try {
        await ensureDefaults();
      } catch (err) {
        console.warn("既往歴マスタのシード補完に失敗しました", err);
      }
      if (unsubscribed) return;
      listener = onValue(itemsRef, (snapshot) => {
        const value = snapshot.val() || {};
        const items = Object.entries(value)
          .map(([id, raw]) => normalizeHistoryTreeItem(id, raw))
          .sort((a, b) => {
            const ord = (a.order ?? 0) - (b.order ?? 0);
            if (ord !== 0) return ord;
            return (a.label || "").localeCompare(b.label || "", "ja");
          });
        callback(items);
      });
    })
    .catch((err) => {
      console.error("既往歴マスタの監視開始に失敗しました", err);
    });
  return () => {
    unsubscribed = true;
    if (listener) {
      off(itemsRef, "value", listener);
      listener = null;
    }
  };
}

export function subscribeHistoryDiseaseItems(callback) {
  return subscribeHistoryTreeItems(
    historyDiseaseItemsRef(),
    ensureHistoryDiseaseItemDefaults,
    callback
  );
}

export function subscribeHistorySurgeryItems(callback) {
  return subscribeHistoryTreeItems(
    historySurgeryItemsRef(),
    ensureHistorySurgeryItemDefaults,
    callback
  );
}

export function subscribeHistoryReferralItems(callback) {
  let unsubscribed = false;
  let listener = null;
  authReady
    .then(async () => {
      if (unsubscribed) return;
      try {
        await ensureHistoryReferralItemDefaults();
      } catch (err) {
        console.warn("紹介先マスタのシード補完に失敗しました", err);
      }
      if (unsubscribed) return;
      listener = onValue(historyReferralItemsRef(), (snapshot) => {
        const value = snapshot.val() || {};
        const items = Object.entries(value)
          .map(([id, raw]) => normalizeHistoryReferralItem(id, raw))
          .sort((a, b) => {
            const ord = (a.order ?? 0) - (b.order ?? 0);
            if (ord !== 0) return ord;
            return (a.label || "").localeCompare(b.label || "", "ja");
          });
        callback(items);
      });
    })
    .catch((err) => {
      console.error("紹介先マスタの監視開始に失敗しました", err);
    });
  return () => {
    unsubscribed = true;
    if (listener) {
      off(historyReferralItemsRef(), "value", listener);
      listener = null;
    }
  };
}

async function addHistoryTreeItem(itemsRef, { label, kind = "leaf", parentId = "", order }) {
  await authReady;
  const resolvedKind = normalizeHistoryMasterKind(kind);
  const newRef = push(itemsRef);
  const siblingsSnap = await get(itemsRef);
  const siblings = Object.values(siblingsSnap.val() || {}).filter((row) => {
    if (!row || typeof row !== "object") return false;
    if (normalizeHistoryMasterKind(row.kind) !== resolvedKind) return false;
    return String(row.parentId || "").trim() === String(parentId || "").trim();
  });
  const maxOrder = siblings.reduce(
    (m, row) => Math.max(m, typeof row.order === "number" ? row.order : 0),
    0
  );
  await set(newRef, {
    label: label || "",
    kind: resolvedKind,
    parentId: String(parentId || "").trim(),
    order: typeof order === "number" ? order : maxOrder + 10,
  });
  return newRef.key;
}

export async function addHistoryDiseaseItem(fields) {
  return addHistoryTreeItem(historyDiseaseItemsRef(), fields);
}

export async function addHistorySurgeryItem(fields) {
  return addHistoryTreeItem(historySurgeryItemsRef(), fields);
}

export async function addHistoryReferralItem({ label, order }) {
  await authReady;
  const newRef = push(historyReferralItemsRef());
  const snap = await get(historyReferralItemsRef());
  const siblings = Object.values(snap.val() || {});
  const maxOrder = siblings.reduce(
    (m, row) => Math.max(m, typeof row?.order === "number" ? row.order : 0),
    0
  );
  await set(newRef, {
    label: label || "",
    order: typeof order === "number" ? order : maxOrder + 10,
  });
  return newRef.key;
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

// --- 処置ログ（procedures: plans + history） --------------------------------

export const PROCEDURE_SCHEMA_VERSION = 2;

function proceduresRootRef(karteNumber) {
  return ref(db, `procedures/${karteNumber}`);
}

function procedurePlansRef(karteNumber) {
  return ref(db, `procedures/${karteNumber}/plans`);
}

function procedureHistoryRef(karteNumber) {
  return ref(db, `procedures/${karteNumber}/history`);
}

function procedureHistoryEntryRef(karteNumber, entryId) {
  return ref(db, `procedures/${karteNumber}/history/${entryId}`);
}

function procedureLegacyEntryRef(karteNumber, entryId) {
  return ref(db, `procedures/${karteNumber}/${entryId}`);
}

function procedurePlanEntryRef(karteNumber, planId) {
  return ref(db, `procedures/${karteNumber}/plans/${planId}`);
}

function todayIsoDateProc() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normalizeProcedureHistoryEntry(id, raw, store = "history") {
  const entry = {
    id,
    store,
    schemaVersion: PROCEDURE_SCHEMA_VERSION,
    date: "",
    content: "",
    note: "",
    confirmedBy: "",
    lastEditedAt: "",
    lastEditedBy: "",
    source: "manual",
  };
  if (!raw || typeof raw !== "object") return entry;
  entry.schemaVersion = raw.schemaVersion || PROCEDURE_SCHEMA_VERSION;
  entry.date = raw.date || "";
  entry.content = raw.content || "";
  entry.note = raw.note || "";
  entry.confirmedBy = raw.confirmedBy || "";
  entry.lastEditedAt = raw.lastEditedAt || "";
  entry.lastEditedBy = raw.lastEditedBy || "";
  entry.source = raw.source === "ai" ? "ai" : "manual";
  return entry;
}

function normalizeProcedurePlan(id, raw) {
  const plan = {
    id,
    content: "",
    dueDate: "",
    baselineDate: "",
    note: "",
    confirmedBy: "",
    source: "manual",
  };
  if (!raw || typeof raw !== "object") return plan;
  plan.content = raw.content || "";
  plan.dueDate = raw.dueDate || raw.targetDate || raw.dueDateFrom || "";
  plan.baselineDate = raw.baselineDate || "";
  plan.note = raw.note || "";
  plan.confirmedBy = raw.confirmedBy || "";
  plan.source = raw.source === "ai" ? "ai" : "manual";
  return plan;
}

function sortProcedureHistory(entries) {
  return [...entries].sort((a, b) => {
    const rd = (b.date || "").localeCompare(a.date || "");
    if (rd !== 0) return rd;
    const ed = (b.lastEditedAt || "").localeCompare(a.lastEditedAt || "");
    if (ed !== 0) return ed;
    return (b.id || "").localeCompare(a.id || "");
  });
}

function sortProcedurePlans(plans) {
  return [...plans].sort((a, b) => {
    const ad = a.dueDate || "9999-99-99";
    const bd = b.dueDate || "9999-99-99";
    const rd = ad.localeCompare(bd);
    if (rd !== 0) return rd;
    return (a.content || "").localeCompare(b.content || "");
  });
}

function parseProceduresRoot(value) {
  const root = value && typeof value === "object" ? value : {};
  const plans = [];
  const history = [];

  const plansRaw =
    root.plans && typeof root.plans === "object" && !Array.isArray(root.plans)
      ? root.plans
      : {};
  Object.entries(plansRaw).forEach(([id, raw]) => {
    if (!raw || typeof raw !== "object") return;
    plans.push(normalizeProcedurePlan(id, raw));
  });

  const historyRaw =
    root.history && typeof root.history === "object" && !Array.isArray(root.history)
      ? root.history
      : {};
  Object.entries(historyRaw).forEach(([id, raw]) => {
    if (!raw || typeof raw !== "object") return;
    history.push(normalizeProcedureHistoryEntry(id, raw, "history"));
  });

  // 旧形式: root 直下のエントリを実施履歴として読む（plans/history キーは除外）
  Object.entries(root).forEach(([id, raw]) => {
    if (id === "plans" || id === "history") return;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    history.push(normalizeProcedureHistoryEntry(id, raw, "legacy"));
  });

  return {
    plans: sortProcedurePlans(plans),
    history: sortProcedureHistory(history),
  };
}

/**
 * 処置の予定＋実施履歴をリアルタイム監視する。
 * callback({ plans, history })
 */
export function subscribeProcedureBundle(karteNumber, callback) {
  const r = proceduresRootRef(karteNumber);
  let unsubscribed = false;
  let listener = null;

  authReady
    .then(() => {
      if (unsubscribed) return;
      listener = onValue(r, (snapshot) => {
        callback(parseProceduresRoot(snapshot.val()));
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
 * 互換: 実施履歴のみを配列で返す購読。
 */
export function subscribeProcedures(karteNumber, callback) {
  return subscribeProcedureBundle(karteNumber, (bundle) => {
    callback(bundle.history || []);
  });
}

/**
 * 処置予定を追加または更新する。
 * @returns {Promise<string>} planId
 */
export async function saveProcedurePlan(
  karteNumber,
  { planId = null, content, dueDate, note = "", baselineDate = "", confirmedBy = "", source = "manual" }
) {
  await authReady;
  const record = {
    content: (content || "").trim(),
    dueDate: dueDate || "",
    baselineDate: baselineDate || (dueDate ? todayIsoDateProc() : todayIsoDateProc()),
    note: note || "",
    confirmedBy: confirmedBy || "",
    source: source === "ai" ? "ai" : "manual",
  };
  if (planId) {
    await update(procedurePlanEntryRef(karteNumber, planId), record);
    return planId;
  }
  const newRef = push(procedurePlansRef(karteNumber));
  await set(newRef, record);
  return newRef.key;
}

/**
 * 処置予定を削除する（終了・完了後のクリア。履歴は触らない）。
 */
export async function deleteProcedurePlan(karteNumber, planId) {
  await authReady;
  if (!planId) return;
  await remove(procedurePlanEntryRef(karteNumber, planId));
}

/**
 * 実施履歴の内容から処置予定一覧へ戻す（予定日は未設定）。
 * 実施履歴は変更しない。
 * @returns {Promise<string>} planId
 */
export async function reviveProcedurePlan(
  karteNumber,
  { content, note = "", confirmedBy = "" }
) {
  return saveProcedurePlan(karteNumber, {
    content,
    dueDate: "",
    note,
    baselineDate: todayIsoDateProc(),
    confirmedBy,
  });
}

/**
 * 処置予定を完了し、実施履歴へ移す（予定は削除）。
 * @returns {Promise<string>} historyId
 */
export async function completeProcedurePlan(
  karteNumber,
  planId,
  { date, note, content }
) {
  await authReady;
  if (!planId) throw new Error("planId が必要です");
  const historyId = await addProcedure(karteNumber, {
    date,
    content,
    note,
    source: "manual",
  });
  await deleteProcedurePlan(karteNumber, planId);
  return historyId;
}

/**
 * 実施履歴を新規追加する（旧 addProcedure。history/ へ書く）。
 */
export async function addProcedure(
  karteNumber,
  { date, content, note = "", source = "manual" }
) {
  await authReady;
  const newRef = push(procedureHistoryRef(karteNumber));
  await set(newRef, {
    schemaVersion: PROCEDURE_SCHEMA_VERSION,
    date: date || "",
    content: content || "",
    note: note || "",
    lastEditedAt: "",
    source: source === "ai" ? "ai" : "manual",
  });
  return newRef.key;
}

/**
 * 実施履歴を上書き更新する。
 * store: "history"（既定）| "legacy"
 */
export async function updateProcedure(
  karteNumber,
  entryId,
  { date, content, note },
  { store = "history" } = {}
) {
  await authReady;
  const target =
    store === "legacy"
      ? procedureLegacyEntryRef(karteNumber, entryId)
      : procedureHistoryEntryRef(karteNumber, entryId);
  const patch = {
    schemaVersion: PROCEDURE_SCHEMA_VERSION,
    date: date || "",
    content: content || "",
    lastEditedAt: new Date().toISOString(),
  };
  if (note !== undefined) patch.note = note || "";
  await update(target, patch);
}

/**
 * 実施履歴を削除する。
 * store: "history"（既定）| "legacy"
 */
export async function deleteProcedure(
  karteNumber,
  entryId,
  { store = "history" } = {}
) {
  await authReady;
  const target =
    store === "legacy"
      ? procedureLegacyEntryRef(karteNumber, entryId)
      : procedureHistoryEntryRef(karteNumber, entryId);
  await remove(target);
}

// --- 特記事項（specialNotes） ----------------------------------------------

export const SPECIAL_NOTE_SCHEMA_VERSION = 1;
export const SPECIAL_NOTE_IMPORTANCE = ["high", "medium", "low"];

function specialNotesRootRef(karteNumber) {
  return ref(db, `specialNotes/${karteNumber}`);
}

function specialNoteEntryRef(karteNumber, entryId) {
  return ref(db, `specialNotes/${karteNumber}/${entryId}`);
}

function normalizeSpecialNoteImportance(value) {
  return SPECIAL_NOTE_IMPORTANCE.includes(value) ? value : "medium";
}

function normalizeSpecialNoteEntry(id, raw) {
  const entry = {
    id,
    schemaVersion: SPECIAL_NOTE_SCHEMA_VERSION,
    content: "",
    importance: "medium",
    createdAt: "",
    createdBy: "",
    lastEditedAt: "",
    lastEditedBy: "",
  };
  if (!raw || typeof raw !== "object") return entry;
  entry.schemaVersion = raw.schemaVersion || SPECIAL_NOTE_SCHEMA_VERSION;
  entry.content = raw.content || "";
  entry.importance = normalizeSpecialNoteImportance(raw.importance);
  entry.createdAt = raw.createdAt || "";
  entry.createdBy = raw.createdBy || "";
  entry.lastEditedAt = raw.lastEditedAt || "";
  entry.lastEditedBy = raw.lastEditedBy || "";
  return entry;
}

function importanceRank(importance) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[normalizeSpecialNoteImportance(importance)] ?? 1;
}

function sortSpecialNotes(entries) {
  return [...entries].sort((a, b) => {
    const ir = importanceRank(a.importance) - importanceRank(b.importance);
    if (ir !== 0) return ir;
    const cd = (b.createdAt || "").localeCompare(a.createdAt || "");
    if (cd !== 0) return cd;
    return (b.id || "").localeCompare(a.id || "");
  });
}

/**
 * 特記事項一覧をリアルタイム監視する（重要度の高い順）。
 */
export function subscribeSpecialNotes(karteNumber, callback) {
  const r = specialNotesRootRef(karteNumber);
  let unsubscribed = false;
  let listener = null;

  authReady
    .then(() => {
      if (unsubscribed) return;
      listener = onValue(r, (snapshot) => {
        const value = snapshot.val() || {};
        const items = Object.entries(value).map(([id, raw]) =>
          normalizeSpecialNoteEntry(id, raw)
        );
        callback(sortSpecialNotes(items));
      });
    })
    .catch((err) => {
      console.error("特記事項の監視開始に失敗しました", err);
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
 * 特記事項を新規追加する。
 */
export async function addSpecialNote(
  karteNumber,
  { content, importance = "medium", createdBy }
) {
  await authReady;
  const newRef = push(specialNotesRootRef(karteNumber));
  await set(newRef, {
    schemaVersion: SPECIAL_NOTE_SCHEMA_VERSION,
    content: content || "",
    importance: normalizeSpecialNoteImportance(importance),
    createdAt: new Date().toISOString(),
    createdBy: createdBy || "",
    lastEditedAt: "",
    lastEditedBy: "",
  });
  return newRef.key;
}

/**
 * 特記事項を上書き更新する（更新日時・更新者を記録）。
 */
export async function updateSpecialNote(
  karteNumber,
  entryId,
  { content, importance, editedBy }
) {
  await authReady;
  await update(specialNoteEntryRef(karteNumber, entryId), {
    schemaVersion: SPECIAL_NOTE_SCHEMA_VERSION,
    content: content || "",
    importance: normalizeSpecialNoteImportance(importance),
    lastEditedAt: new Date().toISOString(),
    lastEditedBy: editedBy || "",
  });
}

/**
 * 特記事項を削除する。
 */
export async function deleteSpecialNote(karteNumber, entryId) {
  await authReady;
  await remove(specialNoteEntryRef(karteNumber, entryId));
}
