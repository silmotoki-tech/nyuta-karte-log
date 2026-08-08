// 中央カラム「移行」ボタン：既存カルテからのデータ移行進捗をカルテごとに記録する。

import {
  subscribeMigrationProgress,
  saveMigrationProgress,
  normalizeMigrationProgress,
} from "./db.js";

const STATUS_OPTIONS = [
  { id: "not_started", label: "未着手" },
  { id: "in_progress", label: "途中" },
  { id: "done", label: "完了" },
];

let deps = {
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "",
};

const state = {
  karteNumber: null,
  progress: normalizeMigrationProgress(null),
  unsubscribe: null,
  draftStatus: "not_started",
};

const btnOpen = document.getElementById("btn-migration-progress");
const modal = document.getElementById("migration-progress-modal");
const statusRow = document.getElementById("migration-progress-status-row");
const memoInput = document.getElementById("migration-progress-memo");
const updatedAtEl = document.getElementById("migration-progress-updated-at");
const errorEl = document.getElementById("migration-progress-error");
const btnSave = document.getElementById("btn-migration-progress-save");
const btnCancel = document.getElementById("btn-migration-progress-cancel");
const btnClose = document.getElementById("btn-close-migration-progress");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatUpdatedAt(iso) {
  if (!iso) return "まだ保存されていません";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "まだ保存されていません";
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const min = pad2(d.getMinutes());
  const by = state.progress.updatedBy ? `（${state.progress.updatedBy}）` : "";
  return `${y}/${m}/${day} ${h}:${min}${by}`;
}

function statusLabel(id) {
  return STATUS_OPTIONS.find((o) => o.id === id)?.label || "未着手";
}

function applyToolbarButton(progress) {
  if (!btnOpen) return;
  const status = progress?.status || "not_started";
  btnOpen.dataset.status = status;
  btnOpen.classList.remove(
    "is-status-not_started",
    "is-status-in_progress",
    "is-status-done"
  );
  btnOpen.classList.add(`is-status-${status}`);
  btnOpen.title = `移行進捗：${statusLabel(status)}`;
  btnOpen.setAttribute("aria-label", `移行進捗：${statusLabel(status)}`);
}

function renderStatusButtons() {
  if (!statusRow) return;
  statusRow.querySelectorAll(".migration-status-btn").forEach((btn) => {
    const selected = btn.dataset.status === state.draftStatus;
    btn.classList.toggle("is-selected", selected);
    btn.setAttribute("aria-pressed", String(selected));
  });
}

function openModal() {
  if (!state.karteNumber || !modal) return;
  state.draftStatus = state.progress.status || "not_started";
  if (memoInput) memoInput.value = state.progress.memo || "";
  if (updatedAtEl) updatedAtEl.textContent = formatUpdatedAt(state.progress.updatedAt);
  deps.showError(errorEl, "");
  renderStatusButtons();
  modal.hidden = false;
  memoInput?.focus();
}

function closeModal() {
  if (modal) modal.hidden = true;
  deps.showError(errorEl, "");
}

async function handleSave() {
  if (!state.karteNumber) return;
  deps.setBusy(btnSave, true, "保存中...", "保存する");
  deps.showError(errorEl, "");
  try {
    const saved = await saveMigrationProgress(state.karteNumber, {
      status: state.draftStatus,
      memo: memoInput?.value ?? "",
      updatedBy: deps.getSelectedAuthor() || "",
    });
    state.progress = normalizeMigrationProgress(saved);
    applyToolbarButton(state.progress);
    deps.showToast(`移行進捗を「${statusLabel(state.progress.status)}」に保存しました`);
    closeModal();
  } catch (err) {
    console.error(err);
    deps.showError(errorEl, "保存に失敗しました。通信状況を確認してください。");
  } finally {
    deps.setBusy(btnSave, false, "保存中...", "保存する");
  }
}

export function initMigrationProgressUI(helpers = {}) {
  deps = { ...deps, ...helpers };

  if (statusRow && statusRow.childElementCount === 0) {
    STATUS_OPTIONS.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `migration-status-btn migration-status-btn--${opt.id}`;
      btn.dataset.status = opt.id;
      btn.textContent = opt.label;
      btn.addEventListener("click", () => {
        state.draftStatus = opt.id;
        renderStatusButtons();
      });
      statusRow.appendChild(btn);
    });
  }

  btnOpen?.addEventListener("click", openModal);
  btnClose?.addEventListener("click", closeModal);
  btnCancel?.addEventListener("click", closeModal);
  modal?.querySelector("[data-close-modal]")?.addEventListener("click", closeModal);
  btnSave?.addEventListener("click", handleSave);

  applyToolbarButton(state.progress);
}

export function enterMigrationProgress(karteNumber) {
  leaveMigrationProgress();
  state.karteNumber = karteNumber;
  state.progress = normalizeMigrationProgress(null);
  applyToolbarButton(state.progress);
  state.unsubscribe = subscribeMigrationProgress(karteNumber, (progress) => {
    state.progress = progress;
    applyToolbarButton(progress);
    // モーダルが開いている間に別端末から更新された場合は最終更新だけ反映
    if (modal && !modal.hidden && updatedAtEl) {
      updatedAtEl.textContent = formatUpdatedAt(progress.updatedAt);
    }
  });
}

export function leaveMigrationProgress() {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }
  state.karteNumber = null;
  state.progress = normalizeMigrationProgress(null);
  applyToolbarButton(state.progress);
  closeModal();
}
