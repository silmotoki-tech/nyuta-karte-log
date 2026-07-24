// パスコード認証状態の永続化（localStorage）。
// 同じ日のうちはアプリ再起動後も再入力不要。日付が変わると自動で無効化する。
//
// 有効条件は厳密に次のみ:
//   localStorage[PASSCODE_STORAGE_KEY] === "1"
//   かつ localStorage[PASSCODE_DATE_KEY] === 今日(YYYY-MM-DD)
// sessionStorage の残骸だけでは認証済みとみなさない（誤スキップ防止）。

export const PASSCODE_STORAGE_KEY = "nyutaKartePasscodeVerified";
export const PASSCODE_DATE_KEY = "nyutaKartePasscodeVerifiedDate";

/**
 * ローカルタイムゾーンの今日の日付（YYYY-MM-DD）。
 */
export function todayDateStrLocal(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch (_) {
    return null;
  }
}

function safeRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch (_) {
    /* ignore */
  }
}

/**
 * 認証済みかつ「認証日付が今日」なら true。
 * 日付が違う・日付未保存・フラグのみ等はクリアして false。
 */
export function isPasscodeVerified(now = new Date()) {
  try {
    const today = todayDateStrLocal(now);
    const flag = safeGet(localStorage, PASSCODE_STORAGE_KEY);
    const savedDate = safeGet(localStorage, PASSCODE_DATE_KEY) || "";

    // 旧 sessionStorage フラグは信頼しない（日付なしで「今日認証済み」扱いしていたバグの温床）
    safeRemove(sessionStorage, PASSCODE_STORAGE_KEY);

    if (flag === "1" && savedDate === today) {
      return true;
    }

    // 不完全・期限切れ・不正な組み合わせは破棄
    if (flag != null || savedDate) {
      clearPasscodeVerified();
    }
    return false;
  } catch (err) {
    console.error("パスコード認証状態の読み取りに失敗しました", err);
    return false;
  }
}

export function setPasscodeVerified(now = new Date()) {
  const today = todayDateStrLocal(now);
  localStorage.setItem(PASSCODE_STORAGE_KEY, "1");
  localStorage.setItem(PASSCODE_DATE_KEY, today);
  safeRemove(sessionStorage, PASSCODE_STORAGE_KEY);
}

/**
 * ログアウト／日跨ぎ無効化用。認証フラグと日付をクリアする。
 */
export function clearPasscodeVerified() {
  try {
    localStorage.removeItem(PASSCODE_STORAGE_KEY);
    localStorage.removeItem(PASSCODE_DATE_KEY);
  } catch (err) {
    console.error("パスコード認証状態の削除に失敗しました", err);
    throw err;
  }
  safeRemove(sessionStorage, PASSCODE_STORAGE_KEY);
}
