// 右カラム「処置ログ」タブのUIと操作ロジック。
// 手動追加に加え、将来のAI提案フローからも db.addProcedure(..., { source: "ai" })
// で同じデータ構造に登録できる想定。

import {
  subscribeProcedures,
  addProcedure,
  updateProcedure,
  deleteProcedure,
} from "./db.js";
import { enableRowGestures } from "./row-gestures.js";

const AUTHORS = [
  "院長", "大辻", "川邉", "齋藤", "横井", "德永",
  "種田", "竹内", "神子島", "大澤", "川合", "嶋本", "道野",
];

let deps = {
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "",
};

const state = {
  karteNumber: null,
  items: [],
  unsubscribe: null,
  editingId: null,
  modalAuthor: "",
};

const procList = document.getElementById("procedures-list");
const procEmpty = document.getElementById("procedures-empty");
const btnProcAdd = document.getElementById("btn-procedure-add");

const procModal = document.getElementById("procedure-modal");
const procModalTitle = document.getElementById("procedure-modal-title");
const procDate = document.getElementById("procedure-date");
const procContent = document.getElementById("procedure-content");
const procAuthorRow = document.getElementById("procedure-author-row");
const procAuthorHint = document.getElementById("procedure-author-hint");
const procError = document.getElementById("procedure-error");
const btnProcSave = document.getElementById("btn-procedure-save");
const btnProcCancel = document.getElementById("btn-procedure-cancel");
const btnCloseProcModal = document.getElementById("btn-close-procedure-modal");

// --- ユーティリティ -------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function ymdFromStr(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${y}/${Number(m)}/${Number(d)}`;
}

function mdhmFromIso(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad2(d.getMinutes())}`;
}

// --- 公開API --------------------------------------------------------------

export function initProceduresUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  buildAuthorButtons();
  btnProcAdd?.addEventListener("click", () => openModal("create"));
  btnCloseProcModal?.addEventListener("click", closeModal);
  btnProcCancel?.addEventListener("click", closeModal);
  procModal
    ?.querySelector("[data-close-modal]")
    ?.addEventListener("click", closeModal);
  btnProcSave?.addEventListener("click", handleSave);
}

export function enterProcedures(karteNumber) {
  leaveProcedures();
  state.karteNumber = karteNumber;
  state.unsubscribe = subscribeProcedures(karteNumber, (items) => {
    state.items = items;
    renderList();
  });
}

export function leaveProcedures() {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }
  state.karteNumber = null;
  state.items = [];
  closeModal();
  if (procList) procList.innerHTML = "";
}

/**
 * AI提案フローなど外部からの登録用フック。
 */
export async function addProcedureFromExternal(karteNumber, payload) {
  return addProcedure(karteNumber, {
    ...payload,
    source: payload.source || "ai",
  });
}

// --- 描画 ----------------------------------------------------------------

function renderList() {
  if (!procList) return;
  procList.innerHTML = "";
  const items = state.items;
  if (procEmpty) procEmpty.hidden = items.length > 0;

  items.forEach((item) => {
    procList.appendChild(createCard(item));
  });
}

function createCard(item) {
  const li = document.createElement("li");
  li.className = "proc-card";
  li.dataset.entryId = item.id;

  const dateEl = document.createElement("p");
  dateEl.className = "proc-card__date";
  dateEl.textContent = ymdFromStr(item.date) || "（日付なし）";

  const contentEl = document.createElement("p");
  contentEl.className = "proc-card__content";
  contentEl.textContent = item.content || "（内容なし）";

  const meta = document.createElement("p");
  meta.className = "proc-card__meta";
  const parts = [];
  if (item.confirmedBy) parts.push(`記入: ${item.confirmedBy}`);
  if (item.lastEditedAt) {
    const when = mdhmFromIso(item.lastEditedAt);
    const by = item.lastEditedBy ? `・${item.lastEditedBy}` : "";
    parts.push(`最終編集 ${when}${by}`);
  }
  meta.textContent = parts.join("　／　");

  li.append(dateEl, contentEl, meta);
  enableRowGestures(li, {
    actions: [
      {
        action: "edit",
        title: "編集",
        onClick: () => openModal("edit", item),
      },
      {
        action: "delete",
        title: "削除",
        onClick: async () => {
          const ok = window.confirm("この処置ログを削除しますか？");
          if (!ok) return;
          try {
            await deleteProcedure(state.karteNumber, item.id);
            deps.showToast("削除しました。");
          } catch (err) {
            console.error(err);
            deps.showToast("削除に失敗しました。", { isError: true });
          }
        },
      },
    ],
    onActivate: () => openModal("edit", item),
  });
  return li;
}

// --- モーダル ------------------------------------------------------------

function buildAuthorButtons() {
  if (!procAuthorRow) return;
  procAuthorRow.innerHTML = "";
  AUTHORS.forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "author-btn";
    btn.textContent = name;
    btn.dataset.author = name;
    btn.addEventListener("click", () => {
      state.modalAuthor = name;
      renderAuthorSelection();
      deps.showError(procError, "");
    });
    procAuthorRow.appendChild(btn);
  });
}

function renderAuthorSelection() {
  procAuthorRow?.querySelectorAll(".author-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.author === state.modalAuthor);
  });
}

function openModal(mode, item = null) {
  state.editingId = mode === "edit" && item ? item.id : null;
  const selected = deps.getSelectedAuthor() || "";

  if (procModalTitle) {
    procModalTitle.textContent =
      mode === "edit" ? "処置ログを編集" : "処置ログを追加";
  }
  if (procDate) procDate.value = item?.date || todayStr();
  if (procContent) procContent.value = item?.content || "";

  if (mode === "edit") {
    state.modalAuthor = selected || item?.lastEditedBy || item?.confirmedBy || "";
    if (procAuthorHint) {
      procAuthorHint.textContent = "この編集を行った人を選択してください。";
    }
  } else {
    state.modalAuthor = selected;
    if (procAuthorHint) {
      procAuthorHint.textContent = selected
        ? `中央カラムで選択中の記入者「${selected}」を初期値にしています。必要なら変更できます。`
        : "記入者を選択してください（中央カラムで選択済みなら自動で入ります）。";
    }
  }

  renderAuthorSelection();
  deps.showError(procError, "");
  if (btnProcSave) btnProcSave.textContent = mode === "edit" ? "保存する" : "追加する";
  if (procModal) procModal.hidden = false;
  setTimeout(() => procContent?.focus(), 0);
}

function closeModal() {
  state.editingId = null;
  state.modalAuthor = "";
  if (procModal) procModal.hidden = true;
  deps.showError(procError, "");
}

async function handleSave() {
  const date = procDate?.value || "";
  const content = (procContent?.value || "").trim();
  const author = state.modalAuthor || deps.getSelectedAuthor() || "";

  if (!date) {
    deps.showError(procError, "日付を選択してください。");
    return;
  }
  if (!content) {
    deps.showError(procError, "処置内容を入力してください。");
    return;
  }
  if (!author) {
    deps.showError(procError, "記入者（編集者）を選択してください。");
    return;
  }
  if (!state.karteNumber) {
    deps.showError(procError, "カルテを開いてから操作してください。");
    return;
  }

  deps.showError(procError, "");
  const idleLabel = state.editingId ? "保存する" : "追加する";
  deps.setBusy(btnProcSave, true, "保存中...", idleLabel);

  try {
    if (state.editingId) {
      await updateProcedure(state.karteNumber, state.editingId, {
        date,
        content,
        editedBy: author,
      });
      closeModal();
      deps.showToast("編集内容を保存しました。");
    } else {
      await addProcedure(state.karteNumber, {
        date,
        content,
        confirmedBy: author,
        source: "manual",
      });
      closeModal();
      deps.showToast("処置ログを追加しました。");
    }
  } catch (err) {
    console.error(err);
    deps.showError(procError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnProcSave, false, "保存中...", idleLabel);
  }
}
