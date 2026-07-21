// パスコード認証状態の永続化（localStorage）。
// 同じ日のうちはアプリ再起動後も再入力不要。日付が変わると自動で無効化する。

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

function readFlag(storage) {
  try {
    return storage.getItem(PASSCODE_STORAGE_KEY) === "1";
  } catch (_) {
    return false;
  }
}

/**
 * 認証済みかつ「認証日付が今日」なら true。
 * 日付が違う・日付未保存の場合は認証情報をクリアして false。
 */
export function isPasscodeVerified(now = new Date()) {
  try {
    const today = todayDateStrLocal(now);
    const flagInLocal = readFlag(localStorage);
    const flagInSession = readFlag(sessionStorage);

    if (!flagInLocal && !flagInSession) return false;

    // 旧 sessionStorage のみ → local へ移行（日付は今日として扱う）
    if (!flagInLocal && flagInSession) {
      localStorage.setItem(PASSCODE_STORAGE_KEY, "1");
      localStorage.setItem(PASSCODE_DATE_KEY, today);
      try {
        sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
      } catch (_) {
        /* ignore */
      }
      return true;
    }

    const savedDate = localStorage.getItem(PASSCODE_DATE_KEY) || "";
    if (savedDate === today) {
      // 日付付きで有効。旧 session 残骸があれば掃除
      try {
        sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
      } catch (_) {
        /* ignore */
      }
      return true;
    }

    // 日をまたいだ／日付未保存（旧データ）→ 無効化
    clearPasscodeVerified();
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
  try {
    sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
  } catch (_) {
    /* ignore */
  }
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
  try {
    sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
  } catch (_) {
    /* ignore */
  }
}
