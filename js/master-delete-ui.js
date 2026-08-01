// マスタ項目の削除（右スワイプ）と管理者パスコード確認。
// 削除のたびに Firebase 上の共通パスコード入力を求め、セッション保持はしない。

import { verifyAdminPasscode } from "./db.js";
import { enableRowGestures } from "./row-gestures.js";
import { isImeKey } from "./ime-keys.js";

let deps = {
  showError: () => {},
  setBusy: () => {},
};

const modal = document.getElementById("master-delete-modal");
const modalLabel = document.getElementById("master-delete-label");
const passInput = document.getElementById("master-delete-passcode");
const errorEl = document.getElementById("master-delete-error");
const btnConfirm = document.getElementById("btn-master-delete-confirm");
const btnCancel = document.getElementById("btn-master-delete-cancel");
const btnClose = document.getElementById("btn-close-master-delete");

/** @type {null | { performDelete: () => Promise<void> }} */
let pending = null;

export function initMasterDeleteUI(nextDeps = {}) {
  deps = { ...deps, ...nextDeps };

  btnCancel?.addEventListener("click", closeMasterDeleteModal);
  btnClose?.addEventListener("click", closeMasterDeleteModal);
  modal?.querySelector("[data-close-modal]")?.addEventListener("click", closeMasterDeleteModal);
  btnConfirm?.addEventListener("click", handleConfirmDelete);
  passInput?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMasterDeleteModal();
      return;
    }
    if (e.key === "Enter" && !isImeKey(e)) {
      e.preventDefault();
      handleConfirmDelete();
    }
  });
}

function closeMasterDeleteModal() {
  pending = null;
  if (modal) modal.hidden = true;
  if (passInput) passInput.value = "";
  deps.showError(errorEl, "");
  if (btnConfirm) {
    btnConfirm.disabled = false;
    btnConfirm.textContent = "削除する";
  }
}

/**
 * 管理者パスコード確認のうえ削除を実行する。
 * @param {{ label: string, performDelete: () => Promise<void> }} opts
 */
export function requestMasterDelete({ label, performDelete }) {
  pending = { performDelete };
  if (modalLabel) {
    modalLabel.textContent = `「${label || "この項目"}」をマスタから削除します。`;
  }
  deps.showError(errorEl, "");
  if (passInput) passInput.value = "";
  if (modal) modal.hidden = false;
  queueMicrotask(() => passInput?.focus({ preventScroll: true }));
}

async function handleConfirmDelete() {
  if (!pending) return;
  const entered = passInput?.value ?? "";
  deps.showError(errorEl, "");
  deps.setBusy(btnConfirm, true, "確認中...", "削除する");
  try {
    const ok = await verifyAdminPasscode(entered);
    if (!ok) {
      deps.showError(errorEl, "管理者パスコードが違います。");
      passInput?.select?.();
      return;
    }
    const { performDelete } = pending;
    await performDelete();
    closeMasterDeleteModal();
  } catch (err) {
    console.error(err);
    deps.showError(errorEl, "削除に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnConfirm, false, "確認中...", "削除する");
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
