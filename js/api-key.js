// Anthropic APIキーの端末ローカル管理。
// キーはコードに埋め込まず、設定画面のQR読み取り経由で localStorage に保存する。

const STORAGE_KEY = "nyuta.anthropicApiKey";

/**
 * APIキーが設定済みか（値自体は返さない）。
 */
export function hasApiKey() {
  return Boolean(getApiKey());
}

/**
 * 保存済みのAPIキーを返す。未設定なら空文字。
 */
export function getApiKey() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : "";
  } catch (err) {
    console.error("APIキーの読み取りに失敗しました", err);
    return "";
  }
}

/**
 * APIキーを保存する。空文字は拒否する。
 */
export function setApiKey(apiKey) {
  const trimmed = (apiKey || "").trim();
  if (!trimmed) {
    throw new Error("APIキーが空です。");
  }
  localStorage.setItem(STORAGE_KEY, trimmed);
}

/**
 * 保存済みのAPIキーを削除する。
 */
export function clearApiKey() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("APIキーの削除に失敗しました", err);
    throw err;
  }
}
