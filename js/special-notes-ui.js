// 右カラム「特記」タブのUIと操作ロジック。
// 金銭制限・飼い主の注意点など、診療の進め方に関わる恒常的な注意事項をカードで蓄積する。

import {
  subscribeSpecialNotes,
  addSpecialNote,
  updateSpecialNote,
  deleteSpecialNote,
} from "./db.js";
import { enableRowGestures } from "./row-gestures.js";

const AUTHORS = [
  "院長", "大辻", "川邉", "齋藤", "横井", "德永",
  "種田", "竹内", "神子島", "大澤", "川合", "嶋本", "道野",
];

const IMPORTANCE_OPTIONS = [
  { id: "high", label: "高" },
  { id: "medium", label: "中" },
  { id: "low", label: "低" },
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
  modalImportance: "medium",
};

const noteList = document.getElementById("special-notes-list");
const noteEmpty = document.getElementById("special-notes-empty");
const btnNoteAdd = document.getElementById("btn-special-note-add");

const noteModal = document.getElementById("special-note-modal");
const noteModalTitle = document.getElementById("special-note-modal-title");
const noteContent = document.getElementById("special-note-content");
const noteImportanceRow = document.getElementById("special-note-importance-row");
const noteAuthorRow = document.getElementById("special-note-author-row");
const noteAuthorHint = document.getElementById("special-note-author-hint");
const noteError = document.getElementById("special-note-error");
const btnNoteSave = document.getElementById("btn-special-note-save");
const btnNoteCancel = document.getElementById("btn-special-note-cancel");
const btnCloseNoteModal = document.getElementById("btn-close-special-note-modal");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function mdhmFromIso(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad2(d.getMinutes())}`;
}

function importanceLabel(id) {
  return IMPORTANCE_OPTIONS.find((o) => o.id === id)?.label || "中";
}

export function initSpecialNotesUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  buildImportanceButtons();
  buildAuthorButtons();
  btnNoteAdd?.addEventListener("click", () => openModal("create"));
  btnCloseNoteModal?.addEventListener("click", closeModal);
  btnNoteCancel?.addEventListener("click", closeModal);
  noteModal
    ?.querySelector("[data-close-modal]")
    ?.addEventListener("click", closeModal);
  btnNoteSave?.addEventListener("click", handleSave);
}

export function enterSpecialNotes(karteNumber) {
  leaveSpecialNotes();
  state.karteNumber = karteNumber;
  state.unsubscribe = subscribeSpecialNotes(karteNumber, (items) => {
    state.items = items;
    renderList();
  });
}

export function leaveSpecialNotes() {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }
  state.karteNumber = null;
  state.items = [];
  closeModal();
  if (noteList) noteList.innerHTML = "";
}

function renderList() {
  if (!noteList) return;
  noteList.innerHTML = "";
  const items = state.items;
  if (noteEmpty) noteEmpty.hidden = items.length > 0;
  items.forEach((item) => {
    noteList.appendChild(createCard(item));
  });
}

function createCard(item) {
  const li = document.createElement("li");
  li.className = `note-card note-card--${item.importance || "medium"}`;
  li.dataset.entryId = item.id;

  const head = document.createElement("div");
  head.className = "note-card__head";

  const badge = document.createElement("span");
  badge.className = `note-card__importance note-card__importance--${item.importance || "medium"}`;
  badge.textContent = `重要度：${importanceLabel(item.importance)}`;

  head.appendChild(badge);

  const contentEl = document.createElement("p");
  contentEl.className = "note-card__content";
  contentEl.textContent = item.content || "（内容なし）";

  const meta = document.createElement("p");
  meta.className = "note-card__meta";
  const parts = [];
  const createdWhen = mdhmFromIso(item.createdAt);
  if (createdWhen || item.createdBy) {
    parts.push(
      `追加 ${createdWhen || "日時不明"}${item.createdBy ? `・${item.createdBy}` : ""}`
    );
  }
  if (item.lastEditedAt) {
    const when = mdhmFromIso(item.lastEditedAt);
    const by = item.lastEditedBy ? `・${item.lastEditedBy}` : "";
    parts.push(`更新 ${when}${by}`);
  }
  meta.textContent = parts.join("　／　");

  li.append(head, contentEl, meta);
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
          const ok = window.confirm("この特記事項を削除しますか？");
          if (!ok) return;
          try {
            await deleteSpecialNote(state.karteNumber, item.id);
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

function buildImportanceButtons() {
  if (!noteImportanceRow) return;
  noteImportanceRow.innerHTML = "";
  IMPORTANCE_OPTIONS.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "note-importance-btn";
    btn.textContent = opt.label;
    btn.dataset.importance = opt.id;
    btn.addEventListener("click", () => {
      state.modalImportance = opt.id;
      renderImportanceSelection();
      deps.showError(noteError, "");
    });
    noteImportanceRow.appendChild(btn);
  });
}

function renderImportanceSelection() {
  noteImportanceRow?.querySelectorAll(".note-importance-btn").forEach((btn) => {
    btn.classList.toggle(
      "is-selected",
      btn.dataset.importance === state.modalImportance
    );
  });
}

function buildAuthorButtons() {
  if (!noteAuthorRow) return;
  noteAuthorRow.innerHTML = "";
  AUTHORS.forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "author-btn";
    btn.textContent = name;
    btn.dataset.author = name;
    btn.addEventListener("click", () => {
      state.modalAuthor = name;
      renderAuthorSelection();
      deps.showError(noteError, "");
    });
    noteAuthorRow.appendChild(btn);
  });
}

function renderAuthorSelection() {
  noteAuthorRow?.querySelectorAll(".author-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.author === state.modalAuthor);
  });
}

function openModal(mode, item = null) {
  state.editingId = mode === "edit" && item ? item.id : null;
  const selected = deps.getSelectedAuthor() || "";

  if (noteModalTitle) {
    noteModalTitle.textContent =
      mode === "edit" ? "特記事項を編集" : "特記事項を追加";
  }
  if (noteContent) noteContent.value = item?.content || "";
  state.modalImportance = item?.importance || "medium";

  if (mode === "edit") {
    state.modalAuthor = selected || item?.lastEditedBy || item?.createdBy || "";
    if (noteAuthorHint) {
      noteAuthorHint.textContent = "この編集を行った人を選択してください。";
    }
  } else {
    state.modalAuthor = selected;
    if (noteAuthorHint) {
      noteAuthorHint.textContent = selected
        ? `中央カラムで選択中の記入者「${selected}」を初期値にしています。必要なら変更できます。`
        : "記入者を選択してください（中央カラムで選択済みなら自動で入ります）。";
    }
  }

  renderImportanceSelection();
  renderAuthorSelection();
  deps.showError(noteError, "");
  if (btnNoteSave) btnNoteSave.textContent = mode === "edit" ? "保存する" : "追加する";
  if (noteModal) noteModal.hidden = false;
  setTimeout(() => noteContent?.focus(), 0);
}

function closeModal() {
  state.editingId = null;
  state.modalAuthor = "";
  state.modalImportance = "medium";
  if (noteModal) noteModal.hidden = true;
  deps.showError(noteError, "");
}

async function handleSave() {
  const content = (noteContent?.value || "").trim();
  const author = state.modalAuthor || deps.getSelectedAuthor() || "";
  const importance = state.modalImportance || "medium";

  if (!content) {
    deps.showError(noteError, "特記内容を入力してください。");
    return;
  }
  if (!author) {
    deps.showError(noteError, "記入者（編集者）を選択してください。");
    return;
  }
  if (!state.karteNumber) {
    deps.showError(noteError, "カルテを開いてから操作してください。");
    return;
  }

  deps.showError(noteError, "");
  const idleLabel = state.editingId ? "保存する" : "追加する";
  deps.setBusy(btnNoteSave, true, "保存中...", idleLabel);

  try {
    if (state.editingId) {
      await updateSpecialNote(state.karteNumber, state.editingId, {
        content,
        importance,
        editedBy: author,
      });
      closeModal();
      deps.showToast("編集内容を保存しました。");
    } else {
      await addSpecialNote(state.karteNumber, {
        content,
        importance,
        createdBy: author,
      });
      closeModal();
      deps.showToast("特記事項を追加しました。");
    }
  } catch (err) {
    console.error(err);
    deps.showError(noteError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnNoteSave, false, "保存中...", idleLabel);
  }
}
