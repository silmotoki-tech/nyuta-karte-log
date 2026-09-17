// 既往歴の追加・編集UI。
// 名称はフリーワード。種別（疾患／手術歴／紹介）と状態（進行中／終了）は
// ボタン選択。メモは1つのテキスト欄で上書きする（追記型ではない）。
// 疾患名マスタのシード・管理APIは db.js 側に残し、入力画面では使わない。
// 将来のAI提案フローからも db.addPatientHistoryEntry(..., { source: "ai" })
// で同じデータ構造に登録できる想定。

import {
  subscribePatientHistory,
  addPatientHistoryEntry,
  updatePatientHistoryEntry,
  deletePatientHistoryEntry,
} from "./db.js";
import { enableRowGestures } from "./row-gestures.js";
import { canHandleShortcut } from "./ime-keys.js";

const HISTORY_TYPES = [
  { id: "disease", label: "疾患" },
  { id: "surgery", label: "手術歴" },
  { id: "referral", label: "紹介・専門治療歴" },
];

const HISTORY_STATUS_OPTIONS = [
  { id: "active", label: "進行中" },
  { id: "resolved", label: "終了" },
];

let deps = {
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "",
  onEntryDeleted: () => {},
  onEntrySaved: () => {},
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
const addTitleLabel = document.getElementById("history-add-title-label");
const addTitleInput = document.getElementById("history-add-title");
const addTypeButtons = document.getElementById("history-add-type-buttons");
const addFirstNoted = document.getElementById("history-add-first-noted");
const addNote = document.getElementById("history-add-note");
const addError = document.getElementById("history-add-error");
const btnAddSave = document.getElementById("btn-history-add-save");
const btnAddCancel = document.getElementById("btn-history-add-cancel");
const btnCloseAddModal = document.getElementById("btn-close-history-add");


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

function titleFieldLabel(type) {
  if (type === "surgery") return "手術名";
  if (type === "referral") return "紹介先";
  return "疾患名";
}

function titlePlaceholder(type) {
  if (type === "surgery") return "例）避妊手術";
  if (type === "referral") return "例）○○動物病院";
  return "例）僧帽弁閉鎖不全症";
}

/** 既存の複数メモを日付順に改行でつなぐ（表示・上書き編集用。内容は落とさない）。 */
function joinedNoteText(entry) {
  return Object.entries(entry?.notes || {})
    .map(([id, n]) => ({ id, ...(n || {}) }))
    .sort((a, b) => {
      const d = (a.date || "").localeCompare(b.date || "");
      if (d !== 0) return d;
      return (a.id || "").localeCompare(b.id || "");
    })
    .map((n) => String(n.text || "").trim())
    .filter(Boolean)
    .join("\n");
}

function sortedEntries(entries) {
  return [...entries].sort((a, b) => {
    const sa = a.status === "active" ? 0 : 1;
    const sb = b.status === "active" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const ud = (b.lastUpdated || "").localeCompare(a.lastUpdated || "");
    if (ud !== 0) return ud;
    return (a.title || "").localeCompare(b.title || "");
  });
}

function syncTitleFieldChrome() {
  const type = state.addDraft.type;
  if (addTitleLabel) addTitleLabel.textContent = titleFieldLabel(type);
  if (addTitleInput) addTitleInput.placeholder = titlePlaceholder(type);
}

// --- 公開API --------------------------------------------------------------

export function initHistoryUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  wireToolbar();
  wireAddModal();
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
  if (historyList) historyList.innerHTML = "";
}

export async function addHistoryFromExternal(karteNumber, payload) {
  return addPatientHistoryEntry(karteNumber, {
    ...payload,
    source: payload.source || "ai",
  });
}

/**
 * 既往歴の新規追加モーダルを開く（状態モードなど別画面から使う）。
 * prefillTitle を渡すと、名称欄にその語を入れて開く。
 */
export function openPatientHistoryAddModal(prefillTitle = "") {
  if (!state.karteNumber) return false;
  openAddModal();
  const title = String(prefillTitle || "").trim();
  if (title) {
    state.addDraft.title = title;
    if (addTitleInput) addTitleInput.value = title;
  }
  queueMicrotask(() => addTitleInput?.focus({ preventScroll: true }));
  return true;
}

/**
 * 既往歴の編集UI（右カラムで展開しているものと同じDOM）を組み立てて返す。
 * 状態モードなど別画面から、同じ編集操作をポップアップ内で使うための入口。
 */
export function buildHistoryDetailNode(entryId) {
  const entry = (state.entries || []).find((e) => e.id === entryId);
  if (!entry) return null;
  return { title: entry.title || "（タイトル未設定）", node: createHistoryDetail(entry) };
}

// --- 描画 ----------------------------------------------------------------

function renderHistoryList() {
  if (!historyList) return;
  historyList.innerHTML = "";
  const entries = sortedEntries(state.entries);
  if (historyEmpty) historyEmpty.hidden = entries.length > 0;

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

  const header = document.createElement("div");
  header.className = "hist-card__header";
  header.setAttribute("role", "button");
  header.tabIndex = 0;
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

  const toggleExpand = () => {
    if (state.expandedIds.has(entry.id)) state.expandedIds.delete(entry.id);
    else state.expandedIds.add(entry.id);
    renderHistoryList();
  };

  header.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (!canHandleShortcut(e)) return;
    e.preventDefault();
    toggleExpand();
  });

  enableRowGestures(li, {
    actions: [
      {
        action: "delete",
        title: "削除",
        onClick: () => deletePatientHistoryEntryById(entry.id),
      },
    ],
    onActivate: (e) => {
      if (e.target.closest(".hist-card__detail")) return;
      toggleExpand();
    },
  });

  return li;
}

/**
 * 既往歴IDを指定して削除する（確認ダイアログ付き。状態モードなど別画面から使う）。
 * @param {string} entryId
 * @param {string} [karteNumber] 省略時は history-ui が購読中のカルテ番号
 * @returns {Promise<boolean>} 削除したら true
 */
export async function deletePatientHistoryEntryById(entryId, karteNumber) {
  const karte = karteNumber || state.karteNumber;
  if (!karte || !entryId) {
    deps.showToast("削除に失敗しました。", { isError: true });
    return false;
  }
  const entry = (state.entries || []).find((e) => e.id === entryId);
  const label = entry?.title || "この既往歴";
  const ok = window.confirm(`「${label}」を削除しますか？メモもまとめて削除されます。`);
  if (!ok) return false;
  try {
    await deletePatientHistoryEntry(karte, entryId);
    state.expandedIds.delete(entryId);
    deps.showToast("既往歴を削除しました。");
    deps.onEntryDeleted?.(entryId);
    return true;
  } catch (err) {
    console.error(err);
    deps.showToast("削除に失敗しました。", { isError: true });
    return false;
  }
}

function createChoiceButtons(items, selectedId, onPick) {
  const wrap = document.createElement("div");
  wrap.className = "exam-item-buttons";
  const paint = (current) => {
    wrap.querySelectorAll(".exam-item-btn").forEach((btn) => {
      btn.classList.toggle("is-selected", btn.dataset.id === current);
    });
  };
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.dataset.id = item.id;
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      onPick(item.id);
      paint(item.id);
    });
    wrap.appendChild(btn);
  });
  paint(selectedId);
  return wrap;
}

function createHistoryDetail(entry) {
  const detail = document.createElement("div");
  detail.className = "hist-edit-form";

  const draft = {
    type: HISTORY_TYPES.some((t) => t.id === entry.type) ? entry.type : "disease",
    status: entry.status === "resolved" ? "resolved" : "active",
  };

  const typeRow = document.createElement("div");
  typeRow.className = "field";
  const typeLabelEl = document.createElement("span");
  typeLabelEl.className = "label";
  typeLabelEl.textContent = "種別";
  const typeBtns = createChoiceButtons(HISTORY_TYPES, draft.type, (id) => {
    draft.type = id;
    syncEditTitleChrome();
  });
  typeBtns.id = "hist-edit-type-buttons";
  typeRow.append(typeLabelEl, typeBtns);
  detail.appendChild(typeRow);

  const statusRow = document.createElement("div");
  statusRow.className = "field";
  const statusLabel = document.createElement("span");
  statusLabel.className = "label";
  statusLabel.textContent = "状態";
  const statusBtns = createChoiceButtons(HISTORY_STATUS_OPTIONS, draft.status, (id) => {
    draft.status = id;
  });
  statusBtns.id = "hist-edit-status-buttons";
  statusRow.append(statusLabel, statusBtns);
  detail.appendChild(statusRow);

  const titleBlock = document.createElement("div");
  titleBlock.className = "field";
  const titleLabel = document.createElement("label");
  titleLabel.className = "label";
  titleLabel.htmlFor = "hist-edit-title";
  const titleInput = document.createElement("input");
  titleInput.id = "hist-edit-title";
  titleInput.className = "input";
  titleInput.type = "text";
  titleInput.autocomplete = "off";
  titleInput.value = entry.title || "";
  titleBlock.append(titleLabel, titleInput);
  detail.appendChild(titleBlock);

  function syncEditTitleChrome() {
    titleLabel.textContent = titleFieldLabel(draft.type);
    titleInput.placeholder = titlePlaceholder(draft.type);
  }
  syncEditTitleChrome();

  const noteBlock = document.createElement("div");
  noteBlock.className = "field";
  const noteLabel = document.createElement("label");
  noteLabel.className = "label";
  noteLabel.htmlFor = "hist-edit-note";
  noteLabel.textContent = "メモ";
  const noteInput = document.createElement("textarea");
  noteInput.id = "hist-edit-note";
  noteInput.className = "textarea";
  noteInput.rows = 4;
  noteInput.placeholder = "経過や詳細など、補足があれば記入";
  noteInput.value = joinedNoteText(entry);
  noteBlock.append(noteLabel, noteInput);
  detail.appendChild(noteBlock);

  const dates = document.createElement("p");
  dates.className = "field__note";
  dates.textContent = `初回記載日: ${ymdFromStr(entry.firstNoted) || "—"}　／　最終更新日: ${
    ymdFromStr(entry.lastUpdated) || "—"
  }`;
  detail.appendChild(dates);

  const error = document.createElement("p");
  error.className = "error-text error-text--banner";
  error.hidden = true;
  error.id = "hist-edit-error";
  detail.appendChild(error);

  const actions = document.createElement("div");
  actions.className = "tpl-editor__actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.id = "hist-edit-save";
  saveBtn.className = "btn btn--small btn--primary";
  saveBtn.textContent = "保存する";
  saveBtn.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    if (!title) {
      error.textContent = `${titleFieldLabel(draft.type)}を入力してください。`;
      error.hidden = false;
      return;
    }
    error.hidden = true;
    const trimmedNote = noteInput.value.replace(/^\n+|\n+$/g, "");
    const notes = {};
    if (trimmedNote) {
      notes.memo = {
        date: todayStr(),
        text: trimmedNote,
        author: deps.getSelectedAuthor() || "",
      };
    }
    deps.setBusy(saveBtn, true, "保存中...", "保存する");
    try {
      await updatePatientHistoryEntry(state.karteNumber, entry.id, {
        title,
        type: draft.type,
        status: draft.status,
        notes,
      });
      deps.showToast("既往歴を保存しました。");
      deps.onEntrySaved?.(entry.id);
    } catch (err) {
      console.error(err);
      error.textContent = "保存に失敗しました。もう一度お試しください。";
      error.hidden = false;
    } finally {
      deps.setBusy(saveBtn, false, "保存中...", "保存する");
    }
  });
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn--small btn--danger-outline";
  deleteBtn.textContent = "この既往歴を削除";
  deleteBtn.addEventListener("click", async () => {
    await deletePatientHistoryEntryById(entry.id);
  });
  actions.append(saveBtn, deleteBtn);
  detail.appendChild(actions);

  return detail;
}

// --- 追加モーダル ---------------------------------------------------------

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
      if (state.addDraft.type === t.id) return;
      state.addDraft.type = t.id;
      renderAddTypeSelection();
      syncTitleFieldChrome();
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
  addTitleInput?.addEventListener("input", () => {
    state.addDraft.title = addTitleInput.value || "";
  });
}

function openAddModal() {
  state.addDraft = {
    title: "",
    type: "disease",
    firstNoted: todayStr(),
    noteText: "",
  };
  if (addTitleInput) addTitleInput.value = "";
  if (addFirstNoted) addFirstNoted.value = todayStr();
  if (addNote) addNote.value = "";
  deps.showError(addError, "");
  renderAddTypeSelection();
  syncTitleFieldChrome();
  if (addModal) addModal.hidden = false;
}

function closeAddModal() {
  if (addModal) addModal.hidden = true;
}

async function handleAddSave() {
  const title = (addTitleInput?.value || state.addDraft.title || "").trim();
  const firstNoted = addFirstNoted?.value || "";
  const noteText = addNote?.value.trim() || "";

  if (!title) {
    deps.showError(addError, `${titleFieldLabel(state.addDraft.type)}を入力してください。`);
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
