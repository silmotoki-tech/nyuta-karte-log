// Firebase Realtime Database とのやり取りをまとめたモジュール。
// データ構造:
//   karte/{カルテ番号}/animalName          … 動物名（カナ）
//   karte/{カルテ番号}/entries/{entryId}/date       … 記入日時（ISO文字列、表示用）
//   karte/{カルテ番号}/entries/{entryId}/createdAt  … 作成時刻（サーバータイムスタンプ、並び替え用）
//   karte/{カルテ番号}/entries/{entryId}/updatedAt  … 更新時刻（編集時のみ）
//   karte/{カルテ番号}/entries/{entryId}/author     … 記入者名
//   karte/{カルテ番号}/entries/{entryId}/text       … 本文

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

function karteRef(karteNumber) {
  return ref(db, `karte/${karteNumber}`);
}

function entriesRef(karteNumber) {
  return ref(db, `karte/${karteNumber}/entries`);
}

function entryRef(karteNumber, entryId) {
  return ref(db, `karte/${karteNumber}/entries/${entryId}`);
}

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

/**
 * 新しい記入エントリを追加する。
 */
export async function addEntry(karteNumber, { author, text }) {
  await authReady;
  const newRef = push(entriesRef(karteNumber));
  const now = new Date();
  await set(newRef, {
    date: now.toISOString(),
    createdAt: serverTimestamp(),
    author,
    text,
  });
  return newRef.key;
}

/**
 * 既存の記入エントリを更新する（記入者・本文）。
 */
export async function updateEntry(karteNumber, entryId, { author, text }) {
  await authReady;
  await update(entryRef(karteNumber, entryId), {
    author,
    text,
    updatedAt: serverTimestamp(),
  });
}

/**
 * 記入エントリを削除する。
 */
export async function deleteEntry(karteNumber, entryId) {
  await authReady;
  await remove(entryRef(karteNumber, entryId));
}

/**
 * 指定カルテ番号の記入エントリ一覧をリアルタイム監視する。
 * callback には日付昇順（古い→新しい）に並べた配列が渡される。
 * ログイン完了を待ってから監視を開始する。
 * 戻り値の関数を呼ぶと監視を停止できる（ログイン待ちの間に呼ばれた場合も安全）。
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
        const entries = Object.entries(value).map(([id, entry]) => ({
          id,
          ...entry,
        }));
        entries.sort((a, b) => {
          const aTime = a.createdAt || Date.parse(a.date) || 0;
          const bTime = b.createdAt || Date.parse(b.date) || 0;
          return aTime - bTime;
        });
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

export { karteRef };
