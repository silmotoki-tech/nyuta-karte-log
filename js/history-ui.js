// 既往歴の追加・編集UI。
// 名称はフリーワード。種別は 🚹現疾患／✅疾患歴／🚨手術／🔰紹介 を複数選択。
// 開始日（firstNoted）はカレンダーで直せる。未設定は空のまま残せる。
// メモは1つのテキスト欄で上書きする（追記型ではない）。
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
import {
  HISTORY_KINDS,
  sanitizeHistoryKinds,
  resolveHistoryKinds,
  primaryHistoryKind,
  historyKindMeta,
  titleFieldLabelForKinds,
  titlePlaceholderForKinds,
  sortHistoryEntries,
} from "./history-kinds.js";

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
    kinds: ["current"],
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

function dateInputValue(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || "")) ? dateStr : "";
}

export function createHistoryKindIcons(kinds) {
  const wrap = document.createElement("span");
  wrap.className = "hist-kind-icons";
  resolveHistoryKinds({ kinds }).forEach((id) => {
    const meta = historyKindMeta(id);
    const el = document.createElement("span");
    el.className = "hist-kind-icon";
    el.textContent = meta.icon;
    el.title = meta.label;
    el.setAttribute("aria-label", meta.label);
    wrap.appendChild(el);
  });
  return wrap;
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
  return sortHistoryEntries(entries);
}

function syncTitleFieldChrome() {
  const kinds = state.addDraft.kinds;
  if (addTitleLabel) addTitleLabel.textContent = titleFieldLabelForKinds(kinds);
  if (addTitleInput) addTitleInput.placeholder = titlePlaceholderForKinds(kinds);
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
    const group = primaryHistoryKind(resolveHistoryKinds(entry));
    if (group !== lastGroup) {
      lastGroup = group;
      const meta = historyKindMeta(group);
      const heading = document.createElement("li");
      heading.className = "meds-category-heading";
      heading.textContent = meta.icon;
      heading.title = meta.label;
      heading.setAttribute("aria-label", meta.label);
      historyList.appendChild(heading);
    }
    historyList.appendChild(createHistoryCard(entry));
  });
}

function createHistoryCard(entry) {
  const li = document.createElement("li");
  li.className = "hist-card";
  li.dataset.entryId = entry.id;
  li.dataset.kinds = resolveHistoryKinds(entry).join(" ");

  const expanded = state.expandedIds.has(entry.id);
  if (expanded) li.classList.add("is-expanded");

  const header = document.createElement("div");
  header.className = "hist-card__header";
  header.setAttribute("role", "button");
  header.tabIndex = 0;
  header.setAttribute("aria-expanded", String(expanded));

  const icons = createHistoryKindIcons(resolveHistoryKinds(entry));

  const nameEl = document.createElement("span");
  nameEl.className = "hist-card__name";
  nameEl.textContent = entry.title || "（タイトル未設定）";

  const chevron = document.createElement("span");
  chevron.className = "med-card__chevron";
  chevron.textContent = expanded ? "▾" : "▸";

  header.append(icons, nameEl, chevron);
  li.appendChild(header);

  const meta = document.createElement("p");
  meta.className = "hist-card__meta";
  meta.textContent = `開始日 ${ymdFromStr(entry.firstNoted) || "—"}　更新 ${
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

function createKindToggleButtons(draft, onChange, { id } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "exam-item-buttons hist-kind-buttons";
  if (id) wrap.id = id;
  const paint = () => {
    const set = new Set(sanitizeHistoryKinds(draft.kinds));
    wrap.querySelectorAll(".exam-item-btn").forEach((btn) => {
      const on = set.has(btn.dataset.kind);
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", String(on));
    });
  };
  HISTORY_KINDS.forEach((kind) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.dataset.kind = kind.id;
    btn.textContent = `${kind.icon} ${kind.label}`;
    btn.addEventListener("click", () => {
      const set = new Set(sanitizeHistoryKinds(draft.kinds));
      if (set.has(kind.id)) set.delete(kind.id);
      else set.add(kind.id);
      draft.kinds = sanitizeHistoryKinds([...set]);
      paint();
      onChange?.(draft.kinds);
    });
    wrap.appendChild(btn);
  });
  paint();
  return wrap;
}

function createHistoryDetail(entry) {
  const detail = document.createElement("div");
  detail.className = "hist-edit-form";

  const draft = {
    kinds: resolveHistoryKinds(entry),
  };

  const typeRow = document.createElement("div");
  typeRow.className = "field";
  const typeLabelEl = document.createElement("span");
  typeLabelEl.className = "label";
  typeLabelEl.textContent = "種別";
  const typeBtns = createKindToggleButtons(draft, () => syncEditTitleChrome(), {
    id: "hist-edit-kind-buttons",
  });
  typeRow.append(typeLabelEl, typeBtns);
  detail.appendChild(typeRow);

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
    titleLabel.textContent = titleFieldLabelForKinds(draft.kinds);
    titleInput.placeholder = titlePlaceholderForKinds(draft.kinds);
  }
  syncEditTitleChrome();

  const startBlock = document.createElement("div");
  startBlock.className = "field";
  const startLabel = document.createElement("label");
  startLabel.className = "label";
  startLabel.htmlFor = "hist-edit-start-date";
  startLabel.textContent = "開始日";
  const startInput = document.createElement("input");
  startInput.id = "hist-edit-start-date";
  startInput.className = "input input--date";
  startInput.type = "date";
  startInput.value = dateInputValue(entry.firstNoted);
  startInput.setAttribute("aria-label", "開始日");
  startBlock.append(startLabel, startInput);
  detail.appendChild(startBlock);

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
  dates.textContent = `最終更新日: ${ymdFromStr(entry.lastUpdated) || "—"}`;
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
      error.textContent = `${titleFieldLabelForKinds(draft.kinds)}を入力してください。`;
      error.hidden = false;
      return;
    }
    const kinds = sanitizeHistoryKinds(draft.kinds);
    if (!kinds.length) {
      error.textContent = "種別を1つ以上選んでください。";
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
        kinds,
        firstNoted: startInput.value || "",
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
  addTypeButtons.classList.add("hist-kind-buttons");
  HISTORY_KINDS.forEach((kind) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.dataset.kind = kind.id;
    btn.textContent = `${kind.icon} ${kind.label}`;
    btn.addEventListener("click", () => {
      const set = new Set(sanitizeHistoryKinds(state.addDraft.kinds));
      if (set.has(kind.id)) set.delete(kind.id);
      else set.add(kind.id);
      state.addDraft.kinds = sanitizeHistoryKinds([...set]);
      renderAddTypeSelection();
      syncTitleFieldChrome();
    });
    addTypeButtons.appendChild(btn);
  });
}

function renderAddTypeSelection() {
  const set = new Set(sanitizeHistoryKinds(state.addDraft.kinds));
  addTypeButtons?.querySelectorAll(".exam-item-btn").forEach((btn) => {
    const on = set.has(btn.dataset.kind);
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-pressed", String(on));
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
    kinds: ["current"],
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
    deps.showError(addError, `${titleFieldLabelForKinds(state.addDraft.kinds)}を入力してください。`);
    return;
  }
  const kinds = sanitizeHistoryKinds(state.addDraft.kinds);
  if (!kinds.length) {
    deps.showError(addError, "種別を1つ以上選んでください。");
    return;
  }
  if (!firstNoted) {
    deps.showError(addError, "開始日を選択してください。");
    return;
  }

  deps.showError(addError, "");
  deps.setBusy(btnAddSave, true, "保存中...", "追加する");
  try {
    const entryId = await addPatientHistoryEntry(state.karteNumber, {
      title,
      kinds,
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
