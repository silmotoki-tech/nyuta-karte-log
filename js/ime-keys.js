// キーボードショートカットと日本語 IME の干渉を防ぐための共通判定。

/**
 * IME（日本語入力など）がキーを処理中かどうか。
 * Safari では確定直後に isComposing が false になることがあるため keyCode 229 も見る。
 * @param {KeyboardEvent} event
 */
export function isImeKey(event) {
  return Boolean(event?.isComposing || event?.keyCode === 229 || event?.key === "Process");
}

/**
 * テキスト入力系にフォーカスがある（またはイベント対象が入力系）か。
 * @param {EventTarget | null | undefined} target
 */
export function isEditableTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  const el =
    target.closest?.(
      "input, textarea, select, [contenteditable='true'], [contenteditable='']"
    ) || null;
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || "text").toLowerCase();
    if (
      type === "button" ||
      type === "submit" ||
      type === "reset" ||
      type === "checkbox" ||
      type === "radio" ||
      type === "file" ||
      type === "image" ||
      type === "range" ||
      type === "color"
    ) {
      return false;
    }
  }
  return true;
}

/**
 * アプリ独自のキーショートカットを動かしてよい状態か。
 * 入力欄フォーカス中・IME 処理中は false。
 * @param {KeyboardEvent} event
 */
export function canHandleShortcut(event) {
  if (isImeKey(event)) return false;
  if (isEditableTarget(event.target)) return false;
  if (isEditableTarget(document.activeElement)) return false;
  return true;
}
