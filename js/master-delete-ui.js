// 管理者パスコード確認ダイアログ（マスタ削除・アカウントサインアウトなど）。
// 実行のたびに Firebase 上の共通パスコード入力を求め、セッション保持はしない。

import { verifyAdminPasscode } from "./db.js";
import { enableRowGestures } from "./row-gestures.js";
import { isImeKey } from "./ime-keys.js";

let deps = {
  showError: () => {},
  setBusy: () => {},
};

const modal = document.getElementById("master-delete-modal");
const modalTitle = document.getElementById("master-delete-modal-title");
const modalLabel = document.getElementById("master-delete-label");
const modalHint = document.getElementById("master-delete-hint");
const passInput = document.getElementById("master-delete-passcode");
const errorEl = document.getElementById("master-delete-error");
const btnConfirm = document.getElementById("btn-master-delete-confirm");
const btnCancel = document.getElementById("btn-master-delete-cancel");
const btnClose = document.getElementById("btn-close-master-delete");

/**
 * @type {null | {
 *   onConfirm: () => Promise<void> | void,
 *   confirmLabel: string,
 *   busyLabel: string,
 *   failureMessage: string,
 * }}
 */
let pending = null;

export function initMasterDeleteUI(nextDeps = {}) {
  deps = { ...deps, ...nextDeps };

  btnCancel?.addEventListener("click", closeAdminPasscodeModal);
  btnClose?.addEventListener("click", closeAdminPasscodeModal);
  modal?.querySelector("[data-close-modal]")?.addEventListener("click", closeAdminPasscodeModal);
  btnConfirm?.addEventListener("click", handleConfirmAdminAction);
  passInput?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAdminPasscodeModal();
      return;
    }
    if (e.key === "Enter" && !isImeKey(e)) {
      e.preventDefault();
      handleConfirmAdminAction();
    }
  });
}

function closeAdminPasscodeModal() {
  const confirmLabel = pending?.confirmLabel || "実行する";
  pending = null;
  if (modal) modal.hidden = true;
  if (passInput) passInput.value = "";
  deps.showError(errorEl, "");
  if (btnConfirm) {
    btnConfirm.disabled = false;
    btnConfirm.textContent = confirmLabel;
    btnConfirm.classList.add("btn--danger");
    btnConfirm.classList.remove("btn--primary");
  }
}

/**
 * 管理者パスコード確認のうえ任意の処理を実行する。
 * @param {{
 *   title?: string,
 *   message: string,
 *   hint?: string,
 *   confirmLabel?: string,
 *   busyLabel?: string,
 *   danger?: boolean,
 *   failureMessage?: string,
 *   onConfirm: () => Promise<void> | void,
 * }} opts
 */
export function requestAdminPasscodeAction({
  title = "管理者確認",
  message,
  hint = "誤操作防止のため、管理者パスコードを入力してください。",
  confirmLabel = "実行する",
  busyLabel = "確認中...",
  danger = true,
  failureMessage = "処理に失敗しました。もう一度お試しください。",
  onConfirm,
}) {
  pending = { onConfirm, confirmLabel, busyLabel, failureMessage };
  if (modalTitle) modalTitle.textContent = title;
  if (modalLabel) modalLabel.textContent = message || "";
  if (modalHint) modalHint.textContent = hint;
  if (btnConfirm) {
    btnConfirm.textContent = confirmLabel;
    btnConfirm.classList.toggle("btn--danger", danger);
    btnConfirm.classList.toggle("btn--primary", !danger);
  }
  deps.showError(errorEl, "");
  if (passInput) passInput.value = "";
  if (modal) modal.hidden = false;
  queueMicrotask(() => passInput?.focus({ preventScroll: true }));
}

/**
 * 管理者パスコード確認のうえ削除を実行する。
 * @param {{ label: string, performDelete: () => Promise<void> }} opts
 */
export function requestMasterDelete({ label, performDelete }) {
  requestAdminPasscodeAction({
    title: "マスタ項目を削除",
    message: `「${label || "この項目"}」をマスタから削除します。`,
    hint: "誤削除防止のため、管理者パスコードを入力してください。",
    confirmLabel: "削除する",
    busyLabel: "確認中...",
    danger: true,
    failureMessage: "削除に失敗しました。もう一度お試しください。",
    onConfirm: performDelete,
  });
}

async function handleConfirmAdminAction() {
  if (!pending) return;
  const { onConfirm, confirmLabel, busyLabel, failureMessage } = pending;
  const entered = passInput?.value ?? "";
  deps.showError(errorEl, "");
  deps.setBusy(btnConfirm, true, busyLabel, confirmLabel);
  try {
    const ok = await verifyAdminPasscode(entered);
    if (!ok) {
      deps.showError(errorEl, "管理者パスコードが違います。");
      passInput?.select?.();
      return;
    }
    await onConfirm();
    closeAdminPasscodeModal();
  } catch (err) {
    console.error(err);
    deps.showError(errorEl, failureMessage);
  } finally {
    deps.setBusy(btnConfirm, false, busyLabel, confirmLabel);
  }
}

/**
 * リニアピッカー用のスワイプ削除対応行を作る。
 * 右スワイプで削除、タップで選択。
 */
export function createSwipeableMasterPickerItem({
  label,
  selected = false,
  onSelect,
  onDelete,
}) {
  const row = document.createElement("div");
  row.className = "med-linear-picker__row";
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", selected ? "true" : "false");

  const item = document.createElement("div");
  item.className = "med-linear-picker__item";
  if (selected) item.classList.add("is-selected");

  const text = document.createElement("span");
  text.className = "med-linear-picker__item-label";
  text.textContent = label;

  const check = document.createElement("span");
  check.className = "med-linear-picker__check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";

  item.append(text, check);
  row.appendChild(item);

  enableRowGestures(row, {
    actions: [
      {
        action: "delete",
        title: "削除",
        onClick: () => onDelete?.(),
      },
    ],
    onActivate: () => onSelect?.(),
  });

  return row;
}
