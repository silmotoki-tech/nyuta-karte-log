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
//   karte/{カルテ番号}/entries/{entryId}/author          … 記入者名
//   karte/{カルテ番号}/entries/{entryId}/body            … 本文フリーテキスト
//   karte/{カルテ番号}/entries/{entryId}/source          … "manual"|"template"（AI解析対象の判定に使用予定）
//
//   templates/{templateId}/label                        … 定型文ボタンのラベル
//   templates/{templateId}/text                         … 挿入される本文
//   templates/{templateId}/order                        … 並び順
//
//   examItems/{itemId}/label                            … 検査項目マスタの表示名
//   examItems/{itemId}/order                            … 並び順
//
//   examPlan/{カルテ番号}/schemaVersion                  … データ構造バージョン
//   examPlan/{カルテ番号}/nextPlan                       … 次回予定（1件 or null）
//     { item, dueDateFrom, dueDateTo, note, recurringId }
//   examPlan/{カルテ番号}/recurring/{id}                 … 定期検査スケジュール
//     { item, intervalMonths, lastDone, windowDays }
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
//     { date, type, detail, frequencyChange, amountChange, changedBy }
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
// 方針: 既存記録は上書きしない（追記型）。訂正は新しいエントリの追記で行う。
//       例外的に「重要フラグ(★)の切り替え」と「誤入力エントリの削除」のみ許可する。
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
 * 重要フラグ(★)のみを切り替える。本文などの記録内容は変更しない。
 */
export async function setEntryImportant(karteNumber, entryId, important) {
  await authReady;
  await update(entryRef(karteNumber, entryId), { important: Boolean(important) });
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
        entries.sort(compareEntries);
        callback(entries);
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

  return entry;
}

function resolveEnteredMs(entry) {
  if (typeof entry.enteredAt === "number") return entry.enteredAt;
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

function examItemsRef() {
  return ref(db, "examItems");
}

/**
 * 検査項目マスタをリアルタイム監視する。order 昇順で callback に渡す。
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

export async function addExamItem({ label, order }) {
  await authReady;
  const newRef = push(examItemsRef());
  await set(newRef, {
    label: label || "",
    order: typeof order === "number" ? order : Date.now(),
  });
  return newRef.key;
}

export async function updateExamItem(itemId, { label }) {
  await authReady;
  await update(ref(db, `examItems/${itemId}`), { label: label || "" });
}

export async function deleteExamItem(itemId) {
  await authReady;
  await remove(ref(db, `examItems/${itemId}`));
}

// --- 検査予定（examPlan） ------------------------------------------------

export const EXAM_PLAN_SCHEMA_VERSION = 1;

function examPlanRef(karteNumber) {
  return ref(db, `examPlan/${karteNumber}`);
}

function emptyExamPlan() {
  return {
    schemaVersion: EXAM_PLAN_SCHEMA_VERSION,
    nextPlan: null,
    recurring: {},
    history: {},
  };
}

function normalizeExamPlan(raw) {
  const plan = emptyExamPlan();
  if (!raw || typeof raw !== "object") return plan;

  plan.schemaVersion = raw.schemaVersion || EXAM_PLAN_SCHEMA_VERSION;
  plan.nextPlan = raw.nextPlan || null;

  // recurring / history はオブジェクト（pushキー）または配列のどちらでも吸収
  if (Array.isArray(raw.recurring)) {
    raw.recurring.forEach((r, i) => {
      if (r) plan.recurring[`legacy-${i}`] = r;
    });
  } else if (raw.recurring && typeof raw.recurring === "object") {
    plan.recurring = { ...raw.recurring };
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

/**
 * 次回予定を設定・更新する。null を渡すとクリア。
 */
export async function setNextExamPlan(karteNumber, nextPlan) {
  await ensureExamPlanRoot(karteNumber);
  await update(examPlanRef(karteNumber), {
    schemaVersion: EXAM_PLAN_SCHEMA_VERSION,
    nextPlan: nextPlan || null,
  });
}

/**
 * 次回予定をクリアする（終了）。
 */
export async function clearNextExamPlan(karteNumber) {
  await setNextExamPlan(karteNumber, null);
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

/**
 * 定期検査スケジュールを追加する。
 */
export async function addExamRecurring(
  karteNumber,
  { item, intervalMonths, lastDone, windowDays }
) {
  await ensureExamPlanRoot(karteNumber);
  const newRef = push(ref(db, `examPlan/${karteNumber}/recurring`));
  await set(newRef, {
    item: item || "",
    intervalMonths: Number(intervalMonths) || 0,
    lastDone: lastDone || "",
    windowDays: typeof windowDays === "number" ? windowDays : 14,
  });
  return newRef.key;
}

/**
 * 定期検査スケジュールを更新する。
 */
export async function updateExamRecurring(karteNumber, recurringId, fields) {
  await authReady;
  const payload = {};
  if (fields.item != null) payload.item = fields.item;
  if (fields.intervalMonths != null) payload.intervalMonths = Number(fields.intervalMonths);
  if (fields.lastDone != null) payload.lastDone = fields.lastDone;
  if (fields.windowDays != null) payload.windowDays = Number(fields.windowDays);
  await update(ref(db, `examPlan/${karteNumber}/recurring/${recurringId}`), payload);
}

/**
 * 定期検査スケジュールを削除する。
 */
export async function deleteExamRecurring(karteNumber, recurringId) {
  await authReady;
  await remove(ref(db, `examPlan/${karteNumber}/recurring/${recurringId}`));
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
 * 薬剤を新規追加する。初期出来事（継続）を1件付ける。
 */
export async function addMedication(
  karteNumber,
  { name, category, sideEffectNote, expiryEstimate, changedBy, eventDate }
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
    frequencyChange: "",
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
  { date, type, detail, frequencyChange, amountChange, changedBy }
) {
  await authReady;
  const newRef = push(ref(db, `medications/${karteNumber}/${drugId}/events`));
  await set(newRef, {
    date: date || "",
    type: type || "add",
    detail: detail || "",
    frequencyChange: frequencyChange || "",
    amountChange: amountChange || "",
    changedBy: changedBy || "",
  });
  return newRef.key;
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
