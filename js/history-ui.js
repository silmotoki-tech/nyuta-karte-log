// 右カラム「既往歴」タブのUIと操作ロジック。
// 手動追加に加え、将来のAI提案フローからも db.addPatientHistoryEntry(..., { source: "ai" })
// で同じデータ構造に登録できる想定。

import {
  subscribePatientHistory,
  addPatientHistoryEntry,
  updatePatientHistoryEntry,
  setPatientHistoryStatus,
  appendPatientHistoryNote,
  deletePatientHistoryNote,
  deletePatientHistoryEntry,
} from "./db.js";
import { createIconActions, createIconButton } from "./icon-actions.js";

const HISTORY_TYPES = [
  { id: "disease", label: "疾患" },
  { id: "surgery", label: "手術歴" },
  { id: "referral", label: "紹介・専門治療歴" },
];

let deps = {
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "",
};

const state = {
  karteNumber: null,
  entries: [],
  unsubscribe: null,
  expandedIds: new Set(),
  addDraft: {
    title: "",
    type: "disease",
    firstNoted: "",
    noteText: "",
  },
};

// --- DOM -----------------------------------------------------------------

const historyList = document.getElementById("patient-history-list");
const historyEmpty = document.getElementById("patient-history-empty");
const btnHistoryAdd = document.getElementById("btn-history-add");

const addModal = document.getElementById("history-add-modal");
const addTitle = document.getElementById("history-add-title");
const addTypeButtons = document.getElementById("history-add-type-buttons");
const addFirstNoted = document.getElementById("history-add-first-noted");
const addNote = document.getElementById("history-add-note");
const addError = document.getElementById("history-add-error");
const btnAddSave = document.getElementById("btn-history-add-save");
const btnAddCancel = document.getElementById("btn-history-add-cancel");
const btnCloseAddModal = document.getElementById("btn-close-history-add");

const noteModal = document.getElementById("history-note-modal");
const noteModalTitle = document.getElementById("history-note-modal-title");
const noteDate = document.getElementById("history-note-date");
const noteText = document.getElementById("history-note-text");
const noteError = document.getElementById("history-note-error");
const btnNoteSave = document.getElementById("btn-history-note-save");
const btnNoteCancel = document.getElementById("btn-history-note-cancel");
const btnCloseNoteModal = document.getElementById("btn-close-history-note");

let noteTargetEntryId = null;

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

function typeLabel(type) {
  return HISTORY_TYPES.find((t) => t.id === type)?.label || type || "";
}

function sortNotes(notesObj) {
  return Object.entries(notesObj || {})
    .map(([id, n]) => ({ id, ...n }))
    .sort((a, b) => {
      const rd = (b.date || "").localeCompare(a.date || "");
      if (rd !== 0) return rd;
      return (b.id || "").localeCompare(a.id || "");
    });
}

function sortedEntries(entries) {
  // 進行中 → 終了。各グループ内は最終更新日の新しい順
  return [...entries].sort((a, b) => {
    const sa = a.status === "active" ? 0 : 1;
    const sb = b.status === "active" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const ud = (b.lastUpdated || "").localeCompare(a.lastUpdated || "");
    if (ud !== 0) return ud;
    return (a.title || "").localeCompare(b.title || "");
  });
}

// --- 公開API --------------------------------------------------------------

export function initHistoryUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  wireToolbar();
  wireAddModal();
  wireNoteModal();
  buildTypeButtons();
}

export function enterHistory(karteNumber) {
  leaveHistory();
  state.karteNumber = karteNumber;
  state.expandedIds = new Set();
  state.unsubscribe = subscribePatientHistory(karteNumber, (entries) => {
    state.entries = entries;
    renderHistoryList();
  });
}

export function leaveHistory() {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }
  state.karteNumber = null;
  state.entries = [];
  state.expandedIds = new Set();
  closeAddModal();
  closeNoteModal();
  if (historyList) historyList.innerHTML = "";
}

/**
 * AI提案フローなど外部からの登録用フック。
 * UIを経由せず同じデータ構造へ書き込める。
 */
export async function addHistoryFromExternal(karteNumber, payload) {
  return addPatientHistoryEntry(karteNumber, {
    ...payload,
    source: payload.source || "ai",
  });
}

// --- 描画 ----------------------------------------------------------------

function renderHistoryList() {
  if (!historyList) return;
  historyList.innerHTML = "";
  const entries = sortedEntries(state.entries);
  historyEmpty.hidden = entries.length > 0;

  let lastGroup = null;
  entries.forEach((entry) => {
    const group = entry.status === "active" ? "active" : "resolved";
    if (group !== lastGroup) {
      lastGroup = group;
      const heading = document.createElement("li");
      heading.className = "meds-category-heading";
      heading.textContent = group === "active" ? "🟢 進行中" : "⚪ 終了";
      historyList.appendChild(heading);
    }
    historyList.appendChild(createHistoryCard(entry));
  });
}

function createHistoryCard(entry) {
  const li = document.createElement("li");
  li.className = "hist-card";
  li.dataset.entryId = entry.id;
  if (entry.status === "active") li.classList.add("is-active");
  else li.classList.add("is-resolved");

  const expanded = state.expandedIds.has(entry.id);
  if (expanded) li.classList.add("is-expanded");

  const header = document.createElement("button");
  header.type = "button";
  header.className = "hist-card__header";
  header.setAttribute("aria-expanded", String(expanded));

  const statusSign = document.createElement("span");
  statusSign.className = "hist-card__sign";
  statusSign.textContent = entry.status === "active" ? "🟢" : "⚪";
  statusSign.title = entry.status === "active" ? "進行中" : "終了";

  const nameEl = document.createElement("span");
  nameEl.className = "hist-card__name";
  nameEl.textContent = entry.title || "（タイトル未設定）";

  const typeEl = document.createElement("span");
  typeEl.className = `hist-type hist-type--${entry.type}`;
  typeEl.textContent = typeLabel(entry.type);

  const chevron = document.createElement("span");
  chevron.className = "med-card__chevron";
  chevron.textContent = expanded ? "▾" : "▸";

  header.append(statusSign, nameEl, typeEl, chevron);
  header.addEventListener("click", () => {
    if (state.expandedIds.has(entry.id)) state.expandedIds.delete(entry.id);
    else state.expandedIds.add(entry.id);
    renderHistoryList();
  });
  li.appendChild(header);

  const meta = document.createElement("p");
  meta.className = "hist-card__meta";
  meta.textContent = `初回 ${ymdFromStr(entry.firstNoted) || "—"}　更新 ${
    ymdFromStr(entry.lastUpdated) || "—"
  }`;
  li.appendChild(meta);

  if (expanded) {
    li.appendChild(createHistoryDetail(entry));
  }

  return li;
}

function createHistoryDetail(entry) {
  const detail = document.createElement("div");
  detail.className = "hist-card__detail";

  // 状態トグル
  const statusRow = document.createElement("div");
  statusRow.className = "med-detail-row";
  const statusLabel = document.createElement("span");
  statusLabel.className = "label";
  statusLabel.textContent = "状態";
  const statusBtn = document.createElement("button");
  statusBtn.type = "button";
  statusBtn.className =
    entry.status === "active"
      ? "btn btn--small btn--outline hist-status-toggle"
      : "btn btn--small btn--primary hist-status-toggle";
  statusBtn.textContent =
    entry.status === "active" ? "🟢 進行中 → 終了にする" : "⚪ 終了 → 進行中に戻す";
  statusBtn.addEventListener("click", async () => {
    const next = entry.status === "active" ? "resolved" : "active";
    try {
      await setPatientHistoryStatus(state.karteNumber, entry.id, next);
      deps.showToast(next === "resolved" ? "終了にしました。" : "進行中に戻しました。");
    } catch (err) {
      console.error(err);
      deps.showToast("状態の更新に失敗しました。", { isError: true });
    }
  });
  statusRow.append(statusLabel, statusBtn);
  detail.appendChild(statusRow);

  // 種別変更
  const typeRow = document.createElement("div");
  typeRow.className = "field";
  const typeLabelEl = document.createElement("span");
  typeLabelEl.className = "label";
  typeLabelEl.textContent = "種別";
  const typeBtns = document.createElement("div");
  typeBtns.className = "exam-item-buttons";
  HISTORY_TYPES.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.textContent = t.label;
    btn.classList.toggle("is-selected", entry.type === t.id);
    btn.addEventListener("click", async () => {
      if (entry.type === t.id) return;
      try {
        await updatePatientHistoryEntry(state.karteNumber, entry.id, { type: t.id });
        deps.showToast("種別を変更しました。");
      } catch (err) {
        console.error(err);
        deps.showToast("種別の更新に失敗しました。", { isError: true });
      }
    });
    typeBtns.appendChild(btn);
  });
  typeRow.append(typeLabelEl, typeBtns);
  detail.appendChild(typeRow);

  // タイトル編集
  const titleBlock = document.createElement("div");
  titleBlock.className = "field";
  const titleLabel = document.createElement("label");
  titleLabel.className = "label";
  titleLabel.textContent = "タイトル";
  const titleInput = document.createElement("input");
  titleInput.className = "input";
  titleInput.type = "text";
  titleInput.value = entry.title || "";
  const titleSave = document.createElement("button");
  titleSave.type = "button";
  titleSave.className = "btn btn--small btn--outline";
  titleSave.textContent = "タイトルを保存";
  titleSave.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    if (!title) {
      deps.showToast("タイトルを入力してください。", { isError: true });
      return;
    }
    try {
      await updatePatientHistoryEntry(state.karteNumber, entry.id, { title });
      deps.showToast("タイトルを保存しました。");
    } catch (err) {
      console.error(err);
      deps.showToast("保存に失敗しました。", { isError: true });
    }
  });
  titleBlock.append(titleLabel, titleInput, titleSave);
  detail.appendChild(titleBlock);

  // 日付情報
  const dates = document.createElement("p");
  dates.className = "field__note";
  dates.textContent = `初回記載日: ${ymdFromStr(entry.firstNoted) || "—"}　／　最終更新日: ${
    ymdFromStr(entry.lastUpdated) || "—"
  }`;
  detail.appendChild(dates);

  // メモ（追記型）
  const notesHead = document.createElement("div");
  notesHead.className = "exam-section__head";
  const notesTitle = document.createElement("h4");
  notesTitle.className = "exam-section__title";
  notesTitle.textContent = "メモ（追記型）";
  const addNoteBtn = document.createElement("button");
  addNoteBtn.type = "button";
  addNoteBtn.className = "btn btn--small btn--primary";
  addNoteBtn.textContent = "メモを追記";
  addNoteBtn.addEventListener("click", () => openNoteModal(entry));
  notesHead.append(notesTitle, addNoteBtn);
  detail.appendChild(notesHead);

  const notes = sortNotes(entry.notes);
  if (notes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "field__note";
    empty.textContent = "まだメモがありません。";
    detail.appendChild(empty);
  } else {
    const ul = document.createElement("ul");
    ul.className = "exam-list";
    notes.forEach((n) => {
      ul.appendChild(createNoteItem(entry, n));
    });
    detail.appendChild(ul);
  }

  // 削除
  const delRow = document.createElement("div");
  delRow.className = "med-detail-actions icon-actions";
  delRow.appendChild(
    createIconButton({
      action: "delete",
      title: "この既往歴を削除",
      onClick: async () => {
        const ok = window.confirm(
          `既往歴「${entry.title}」を削除しますか？メモもまとめて削除されます。`
        );
        if (!ok) return;
        try {
          await deletePatientHistoryEntry(state.karteNumber, entry.id);
          state.expandedIds.delete(entry.id);
          deps.showToast("既往歴を削除しました。");
        } catch (err) {
          console.error(err);
          deps.showToast("削除に失敗しました。", { isError: true });
        }
      },
    })
  );
  detail.appendChild(delRow);

  return detail;
}

function createNoteItem(entry, note) {
  const li = document.createElement("li");
  li.className = "exam-list-item";

  const info = document.createElement("div");
  info.className = "exam-list-item__info";
  const title = document.createElement("div");
  title.className = "exam-list-item__title";
  title.textContent = ymdFromStr(note.date) || "（日付なし）";
  const body = document.createElement("div");
  body.className = "exam-list-item__meta";
  body.style.whiteSpace = "pre-wrap";
  const authorPart = note.author ? `\n記入: ${note.author}` : "";
  body.textContent = `${note.text || ""}${authorPart}`;
  info.append(title, body);

  const actions = createIconActions(
    [
      {
        action: "delete",
        title: "削除",
        onClick: async () => {
          const ok = window.confirm("このメモを削除しますか？");
          if (!ok) return;
          try {
            await deletePatientHistoryNote(state.karteNumber, entry.id, note.id);
            deps.showToast("メモを削除しました。");
          } catch (err) {
            console.error(err);
            deps.showToast("削除に失敗しました。", { isError: true });
          }
        },
      },
    ],
    "exam-list-item__actions icon-actions"
  );
  li.append(info, actions);
  return li;
}

// --- ツールバー・モーダル -------------------------------------------------

function wireToolbar() {
  btnHistoryAdd?.addEventListener("click", openAddModal);
}

function buildTypeButtons() {
  if (!addTypeButtons) return;
  addTypeButtons.innerHTML = "";
  HISTORY_TYPES.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.dataset.type = t.id;
    btn.textContent = t.label;
    btn.addEventListener("click", () => {
      state.addDraft.type = t.id;
      renderAddTypeSelection();
    });
    addTypeButtons.appendChild(btn);
  });
}

function renderAddTypeSelection() {
  addTypeButtons?.querySelectorAll(".exam-item-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.type === state.addDraft.type);
  });
}

function wireAddModal() {
  btnCloseAddModal?.addEventListener("click", closeAddModal);
  btnAddCancel?.addEventListener("click", closeAddModal);
  addModal?.querySelector("[data-close-modal]")?.addEventListener("click", closeAddModal);
  btnAddSave?.addEventListener("click", handleAddSave);
}

function openAddModal() {
  state.addDraft = {
    title: "",
    type: "disease",
    firstNoted: todayStr(),
    noteText: "",
  };
  addTitle.value = "";
  addFirstNoted.value = todayStr();
  addNote.value = "";
  deps.showError(addError, "");
  renderAddTypeSelection();
  addModal.hidden = false;
  setTimeout(() => addTitle.focus(), 0);
}

function closeAddModal() {
  if (addModal) addModal.hidden = true;
}

async function handleAddSave() {
  const title = addTitle.value.trim();
  const firstNoted = addFirstNoted.value;
  const noteText = addNote.value.trim();

  if (!title) {
    deps.showError(addError, "タイトルを入力してください。");
    return;
  }
  if (!firstNoted) {
    deps.showError(addError, "初回記載日を選択してください。");
    return;
  }

  deps.showError(addError, "");
  deps.setBusy(btnAddSave, true, "保存中...", "追加する");
  try {
    const entryId = await addPatientHistoryEntry(state.karteNumber, {
      title,
      type: state.addDraft.type,
      status: "active",
      firstNoted,
      noteText,
      author: deps.getSelectedAuthor() || "",
      source: "manual",
    });
    state.expandedIds.add(entryId);
    renderHistoryList();
    closeAddModal();
    deps.showToast("既往歴を追加しました。");
  } catch (err) {
    console.error(err);
    deps.showError(addError, "追加に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnAddSave, false, "保存中...", "追加する");
  }
}

function wireNoteModal() {
  btnCloseNoteModal?.addEventListener("click", closeNoteModal);
  btnNoteCancel?.addEventListener("click", closeNoteModal);
  noteModal?.querySelector("[data-close-modal]")?.addEventListener("click", closeNoteModal);
  btnNoteSave?.addEventListener("click", handleNoteSave);
}

function openNoteModal(entry) {
  noteTargetEntryId = entry.id;
  noteModalTitle.textContent = `メモを追記 — ${entry.title || ""}`;
  noteDate.value = todayStr();
  noteText.value = "";
  deps.showError(noteError, "");
  noteModal.hidden = false;
  setTimeout(() => noteText.focus(), 0);
}

function closeNoteModal() {
  noteTargetEntryId = null;
  if (noteModal) noteModal.hidden = true;
}

async function handleNoteSave() {
  const text = noteText.value.trim();
  const date = noteDate.value;
  if (!text) {
    deps.showError(noteError, "メモ内容を入力してください。");
    return;
  }
  if (!date) {
    deps.showError(noteError, "日付を選択してください。");
    return;
  }
  if (!noteTargetEntryId) return;

  deps.showError(noteError, "");
  deps.setBusy(btnNoteSave, true, "保存中...", "追記する");
  try {
    await appendPatientHistoryNote(state.karteNumber, noteTargetEntryId, {
      date,
      text,
      author: deps.getSelectedAuthor() || "",
    });
    closeNoteModal();
    deps.showToast("メモを追記しました。");
  } catch (err) {
    console.error(err);
    deps.showError(noteError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnNoteSave, false, "保存中...", "追記する");
  }
}
