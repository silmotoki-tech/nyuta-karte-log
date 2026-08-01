// 右カラム「既往歴」タブのUIと操作ロジック。
// 疾患・手術はマスタ階層（大→中→小）のリニア選択、紹介先はフラット選択。
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
  subscribeHistoryDiseaseItems,
  subscribeHistorySurgeryItems,
  subscribeHistoryReferralItems,
  addHistoryDiseaseItem,
  addHistorySurgeryItem,
  addHistoryReferralItem,
  deleteHistoryDiseaseItem,
  deleteHistorySurgeryItem,
  deleteHistoryReferralItem,
  normalizeHistoryMasterKind,
} from "./db.js";
import {
  filterHistoryTreeLeavesByQuery,
  filterHistoryReferralByQuery,
} from "./history-item-match.js";
import { enableRowGestures } from "./row-gestures.js";
import {
  createSwipeableMasterPickerItem,
  requestMasterDelete,
} from "./master-delete-ui.js";
import { canHandleShortcut, isImeKey } from "./ime-keys.js";

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
  unsubscribeDisease: null,
  unsubscribeSurgery: null,
  unsubscribeReferral: null,
  diseaseItems: [],
  surgeryItems: [],
  referralItems: [],
  expandedIds: new Set(),
  addDraft: {
    title: "",
    type: "disease",
    firstNoted: "",
    noteText: "",
  },
  /** 階層選択: 大分類 id / 中分類 id（疾患・手術） */
  pickTopId: null,
  pickMidId: null,
  searchMode: false,
  searchQuery: "",
  itemAddOpen: false,
};

// --- DOM -----------------------------------------------------------------

const historyList = document.getElementById("patient-history-list");
const historyEmpty = document.getElementById("patient-history-empty");
const btnHistoryAdd = document.getElementById("btn-history-add");

const addModal = document.getElementById("history-add-modal");
const addPickerLabel = document.getElementById("history-add-picker-label");
const addTypeButtons = document.getElementById("history-add-type-buttons");
const addFirstNoted = document.getElementById("history-add-first-noted");
const addNote = document.getElementById("history-add-note");
const addError = document.getElementById("history-add-error");
const addSelectedNote = document.getElementById("history-add-selected");
const btnAddSave = document.getElementById("btn-history-add-save");
const btnAddCancel = document.getElementById("btn-history-add-cancel");
const btnCloseAddModal = document.getElementById("btn-close-history-add");

const addLinearPicker = document.getElementById("history-add-linear-picker");
const addColCategory = document.getElementById("history-add-col-category");
const addColCategoryList = document.getElementById("history-add-col-category-list");
const addColGroup = document.getElementById("history-add-col-group");
const addColGroupList = document.getElementById("history-add-col-group-list");
const addColLeaf = document.getElementById("history-add-col-leaf");
const addColLeafList = document.getElementById("history-add-col-leaf-list");
const addColLeafHeadLabel = document.getElementById("history-add-col-leaf-head-label");
const addSearchWrap = document.getElementById("history-add-search");
const addSearchInput = document.getElementById("history-add-search-input");
const addItemsEmpty = document.getElementById("history-add-items-empty");
const btnAddToggle = document.getElementById("btn-history-add-toggle");
const addItemAdd = document.getElementById("history-add-item-add");
const addNewItemLabel = document.getElementById("history-add-new-item-label");
const addNewItemInput = document.getElementById("history-add-new-item");
const btnAddNewItem = document.getElementById("btn-history-add-new-item");
const addItemError = document.getElementById("history-add-item-error");

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

function isGroup(item) {
  return normalizeHistoryMasterKind(item?.kind) === "group";
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
  return [...entries].sort((a, b) => {
    const sa = a.status === "active" ? 0 : 1;
    const sb = b.status === "active" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const ud = (b.lastUpdated || "").localeCompare(a.lastUpdated || "");
    if (ud !== 0) return ud;
    return (a.title || "").localeCompare(b.title || "");
  });
}

function treeItemsForType(type) {
  if (type === "surgery") return state.surgeryItems;
  return state.diseaseItems;
}

function topGroups(items) {
  return items.filter((i) => isGroup(i) && !i.parentId);
}

function midGroups(items, topId) {
  return items.filter((i) => isGroup(i) && i.parentId === topId);
}

function leavesUnder(items, parentId) {
  return items.filter((i) => !isGroup(i) && i.parentId === parentId);
}

/** 大分類直下に小分類があり、中分類が無い（または未選択で直下葉を出す）か */
function topHasDirectLeaves(items, topId) {
  return leavesUnder(items, topId).length > 0;
}

function topHasMidGroups(items, topId) {
  return midGroups(items, topId).length > 0;
}

// --- 公開API --------------------------------------------------------------

export function initHistoryUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  wireToolbar();
  wireAddModal();
  wireNoteModal();
  buildTypeButtons();

  state.unsubscribeDisease = subscribeHistoryDiseaseItems((items) => {
    state.diseaseItems = items;
    if (addModal && !addModal.hidden && state.addDraft.type === "disease") {
      renderHistoryLinearPicker();
    }
  });
  state.unsubscribeSurgery = subscribeHistorySurgeryItems((items) => {
    state.surgeryItems = items;
    if (addModal && !addModal.hidden && state.addDraft.type === "surgery") {
      renderHistoryLinearPicker();
    }
  });
  state.unsubscribeReferral = subscribeHistoryReferralItems((items) => {
    state.referralItems = items;
    if (addModal && !addModal.hidden && state.addDraft.type === "referral") {
      renderHistoryLinearPicker();
    }
  });
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
      },
    ],
    onActivate: (e) => {
      if (e.target.closest(".hist-card__detail")) return;
      toggleExpand();
    },
  });

  return li;
}

function createHistoryDetail(entry) {
  const detail = document.createElement("div");
  detail.className = "hist-card__detail";

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

  const dates = document.createElement("p");
  dates.className = "field__note";
  dates.textContent = `初回記載日: ${ymdFromStr(entry.firstNoted) || "—"}　／　最終更新日: ${
    ymdFromStr(entry.lastUpdated) || "—"
  }`;
  detail.appendChild(dates);

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
  li.appendChild(info);

  enableRowGestures(li, {
    actions: [
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
  });
  return li;
}

// --- リニアピッカー -------------------------------------------------------

function createLinearItemButton({ label, selected, onClick }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "med-linear-picker__item";
  if (selected) btn.classList.add("is-selected");
  btn.setAttribute("role", "option");
  btn.setAttribute("aria-selected", selected ? "true" : "false");
  const text = document.createElement("span");
  text.className = "med-linear-picker__item-label";
  text.textContent = label;
  btn.appendChild(text);
  if (selected) {
    const check = document.createElement("span");
    check.className = "med-linear-picker__check";
    check.textContent = "✓";
    btn.appendChild(check);
  }
  btn.addEventListener("click", onClick);
  return btn;
}

function historyMasterDeleteFn(type) {
  if (type === "surgery") return deleteHistorySurgeryItem;
  if (type === "referral") return deleteHistoryReferralItem;
  return deleteHistoryDiseaseItem;
}

function askDeleteHistoryMasterItem(item, type) {
  if (!item?.id) return;
  const label = (item.label || "").trim() || "この項目";
  requestMasterDelete({
    label,
    performDelete: async () => {
      await historyMasterDeleteFn(type)(item.id);
      if (type === "referral") {
        if (state.addDraft.title === label) state.addDraft.title = "";
      } else {
        if (state.pickTopId === item.id) {
          state.pickTopId = null;
          state.pickMidId = null;
          state.addDraft.title = "";
        } else if (state.pickMidId === item.id) {
          state.pickMidId = null;
          state.addDraft.title = "";
        } else if (state.addDraft.title === label) {
          state.addDraft.title = "";
        }
      }
      renderHistoryLinearPicker();
      deps.showToast(`「${label}」をマスタから削除しました。`);
    },
  });
}

function appendHistoryMasterItem(listEl, item, { selected, onSelect, type, label }) {
  listEl.appendChild(
    createSwipeableMasterPickerItem({
      label: label || item.label,
      selected,
      onSelect,
      onDelete: () => askDeleteHistoryMasterItem(item, type),
    })
  );
}

function fillPlaceholder(listEl, message) {
  if (!listEl) return;
  listEl.innerHTML = "";
  const hint = document.createElement("p");
  hint.className = "med-linear-picker__hint";
  hint.textContent = message;
  listEl.appendChild(hint);
}

function setColState(colEl, stateName) {
  if (!colEl) return;
  colEl.classList.toggle("is-placeholder", stateName === "placeholder");
  colEl.hidden = stateName === "absent";
}

function exitSearchMode() {
  state.searchMode = false;
  state.searchQuery = "";
  if (addSearchInput) addSearchInput.value = "";
}

function enterSearchMode() {
  state.searchMode = true;
  state.pickTopId = null;
  state.pickMidId = null;
  state.addDraft.title = "";
  setItemAddOpen(false);
  renderHistoryLinearPicker();
  queueMicrotask(() => addSearchInput?.focus({ preventScroll: true }));
}

function resetPickerSelection() {
  state.pickTopId = null;
  state.pickMidId = null;
  state.addDraft.title = "";
  exitSearchMode();
  setItemAddOpen(false);
}

function setItemAddOpen(open) {
  state.itemAddOpen = Boolean(open);
  if (addItemAdd) addItemAdd.hidden = !state.itemAddOpen;
  if (btnAddToggle) {
    btnAddToggle.setAttribute("aria-expanded", state.itemAddOpen ? "true" : "false");
  }
  if (!state.itemAddOpen && addNewItemInput) addNewItemInput.value = "";
  deps.showError(addItemError, "");
}

function canAddMasterItem() {
  const type = state.addDraft.type;
  if (state.searchMode) return false;
  if (type === "referral") return true;
  if (!state.pickTopId) return false;
  return true;
}

function updateLeafAddUI() {
  const show = canAddMasterItem();
  if (btnAddToggle) btnAddToggle.hidden = !show;
  if (!show) setItemAddOpen(false);

  const type = state.addDraft.type;
  const items =
    type === "disease" || type === "surgery" ? treeItemsForType(type) : [];
  // 大分類直下に小分類を持つ（＝中分類を使わない）大分類のときだけ小分類を足す。
  // それ以外は中分類の追加として扱い、最初の中分類も作れるようにする。
  const addingLeafUnderTop =
    Boolean(state.pickTopId) &&
    !state.pickMidId &&
    topHasDirectLeaves(items, state.pickTopId);

  if (addNewItemLabel) {
    if (type === "referral") {
      addNewItemLabel.textContent = "新しい紹介先を追加";
    } else if (state.pickMidId || addingLeafUnderTop) {
      addNewItemLabel.textContent = "新しい小分類を追加";
    } else {
      addNewItemLabel.textContent = "新しい中分類を追加";
    }
  }
  if (addNewItemInput) {
    addNewItemInput.placeholder =
      type === "referral"
        ? "例）○○動物病院"
        : state.pickMidId || addingLeafUnderTop
          ? "例）僧帽弁閉鎖不全症"
          : "例）心疾患";
  }
}

function updateSelectedNote() {
  if (!addSelectedNote) return;
  const title = (state.addDraft.title || "").trim();
  if (!title) {
    addSelectedNote.hidden = true;
    addSelectedNote.textContent = "";
    return;
  }
  addSelectedNote.hidden = false;
  addSelectedNote.textContent = `選択中: ${title}`;
}

function renderHistoryLinearPicker() {
  const type = state.addDraft.type;
  const hierarchical = type === "disease" || type === "surgery";
  const searching = Boolean(state.searchMode);

  if (addPickerLabel) {
    addPickerLabel.textContent =
      type === "surgery" ? "手術名" : type === "referral" ? "紹介先" : "疾患名";
  }

  if (!hierarchical) {
    // 紹介先: 2カラム（モード / 一覧）
    if (addLinearPicker) addLinearPicker.dataset.cols = "2";
    setColState(addColGroup, "absent");
    setColState(addColLeaf, "active");
    if (addColCategory?.querySelector(".med-linear-picker__head")) {
      addColCategory.querySelector(".med-linear-picker__head").textContent = "選択";
    }
    if (addColLeafHeadLabel) {
      addColLeafHeadLabel.textContent = searching ? "検索結果" : "紹介先";
    }
  } else {
    if (addColCategory?.querySelector(".med-linear-picker__head")) {
      addColCategory.querySelector(".med-linear-picker__head").textContent = "大分類";
    }
    const midState = searching
      ? "absent"
      : state.pickTopId
        ? "active"
        : "placeholder";
    // 大分類選択後は小分類列を操作可能にし、＋で中分類／小分類を追加できるようにする
    // （is-placeholder だと CSS で ＋ が display:none になる）
    const leafState = searching || state.pickTopId ? "active" : "placeholder";
    if (addLinearPicker) addLinearPicker.dataset.cols = midState === "absent" ? "2" : "3";
    setColState(addColGroup, midState);
    setColState(addColLeaf, leafState);
    if (addColLeafHeadLabel) {
      addColLeafHeadLabel.textContent = searching ? "検索結果" : "小分類";
    }
  }

  if (addSearchWrap) addSearchWrap.hidden = !searching;
  if (searching && addSearchInput && addSearchInput.value !== state.searchQuery) {
    addSearchInput.value = state.searchQuery || "";
  }

  // 左列
  if (addColCategoryList) {
    addColCategoryList.innerHTML = "";
    if (!hierarchical) {
      addColCategoryList.appendChild(
        createLinearItemButton({
          label: "紹介先",
          selected: !searching,
          onClick: () => {
            exitSearchMode();
            state.addDraft.title = "";
            renderHistoryLinearPicker();
          },
        })
      );
    } else {
      const items = treeItemsForType(type);
      topGroups(items).forEach((group) => {
        appendHistoryMasterItem(addColCategoryList, group, {
          type,
          selected: !searching && state.pickTopId === group.id,
          onSelect: () => {
            const changed = state.searchMode || state.pickTopId !== group.id;
            exitSearchMode();
            state.pickTopId = group.id;
            if (changed) {
              state.pickMidId = null;
              state.addDraft.title = "";
            }
            renderHistoryLinearPicker();
          },
        });
      });
    }
    addColCategoryList.appendChild(
      createLinearItemButton({
        label: "検索",
        selected: searching,
        onClick: () => {
          if (searching) {
            queueMicrotask(() => addSearchInput?.focus({ preventScroll: true }));
            return;
          }
          enterSearchMode();
        },
      })
    );
  }

  // 中列（疾患・手術）
  if (hierarchical && addColGroupList) {
    if (!state.pickTopId || searching) {
      if (!searching) fillPlaceholder(addColGroupList, "大分類を選ぶと表示されます");
      else addColGroupList.innerHTML = "";
    } else {
      addColGroupList.innerHTML = "";
      const items = treeItemsForType(type);
      const mids = midGroups(items, state.pickTopId);
      if (!mids.length && topHasDirectLeaves(items, state.pickTopId)) {
        fillPlaceholder(addColGroupList, "中項目なし（右列で小項目を選択）");
      } else {
        mids.forEach((group) => {
          appendHistoryMasterItem(addColGroupList, group, {
            type,
            selected:
              state.pickMidId === group.id ||
              state.addDraft.title === group.label,
            onSelect: () => {
              state.pickMidId = group.id;
              state.addDraft.title = group.label;
              renderHistoryLinearPicker();
            },
          });
        });
      }
    }
  }

  // 右列（葉 / 紹介先 / 検索）
  if (addColLeafList) {
    if (searching) {
      renderSearchResults();
    } else if (!hierarchical) {
      addColLeafList.innerHTML = "";
      const list = state.referralItems;
      if (addItemsEmpty) addItemsEmpty.hidden = list.length > 0;
      list.forEach((item) => {
        appendHistoryMasterItem(addColLeafList, item, {
          type: "referral",
          selected: state.addDraft.title === item.label,
          onSelect: () => {
            state.addDraft.title = item.label;
            renderHistoryLinearPicker();
          },
        });
      });
    } else if (!state.pickTopId) {
      fillPlaceholder(addColLeafList, "大分類を選ぶと表示されます");
      if (addItemsEmpty) addItemsEmpty.hidden = true;
    } else {
      const items = treeItemsForType(type);
      const leafParentId = state.pickMidId || state.pickTopId;
      const showDirectLeaves =
        !state.pickMidId && topHasDirectLeaves(items, state.pickTopId);
      const showMidLeaves = Boolean(state.pickMidId);
      if (!showDirectLeaves && !showMidLeaves) {
        fillPlaceholder(
          addColLeafList,
          "中分類を選ぶとその名前で確定できます（＋で中分類を追加／小分類も選べます）"
        );
        if (addItemsEmpty) addItemsEmpty.hidden = true;
      } else {
        addColLeafList.innerHTML = "";
        const leafs = leavesUnder(items, leafParentId);
        if (addItemsEmpty) addItemsEmpty.hidden = leafs.length > 0;
        leafs.forEach((item) => {
          appendHistoryMasterItem(addColLeafList, item, {
            type,
            selected: state.addDraft.title === item.label,
            onSelect: () => {
              state.addDraft.title = item.label;
              renderHistoryLinearPicker();
            },
          });
        });
      }
    }
  }

  updateLeafAddUI();
  updateSelectedNote();
}

function renderSearchResults() {
  if (!addColLeafList) return;
  addColLeafList.innerHTML = "";
  const type = state.addDraft.type;
  let rows = [];
  if (type === "referral") {
    rows = filterHistoryReferralByQuery(state.referralItems, state.searchQuery);
  } else {
    rows = filterHistoryTreeLeavesByQuery(treeItemsForType(type), state.searchQuery);
  }
  if (addItemsEmpty) addItemsEmpty.hidden = true;
  if (!state.searchQuery.trim()) {
    fillPlaceholder(addColLeafList, "キーワードを入力してください");
    return;
  }
  if (!rows.length) {
    fillPlaceholder(addColLeafList, "一致する項目がありません");
    return;
  }
  rows.forEach((row) => {
    const item =
      type === "referral"
        ? state.referralItems.find((i) => i.id === row.id) || {
            id: row.id,
            label: row.label,
          }
        : treeItemsForType(type).find((i) => i.id === row.id) || {
            id: row.id,
            label: row.label,
          };
    appendHistoryMasterItem(addColLeafList, item, {
      type,
      label: row.displayLabel || row.label,
      selected: state.addDraft.title === row.label,
      onSelect: () => {
        state.addDraft.title = row.label;
        if (type !== "referral") {
          const items = treeItemsForType(type);
          const leaf = items.find((i) => i.id === row.id);
          const parent = leaf
            ? items.find((i) => i.id === leaf.parentId)
            : null;
          if (parent && isGroup(parent) && !parent.parentId) {
            // 大分類直下の小分類
            state.pickTopId = parent.id;
            state.pickMidId = null;
          } else {
            state.pickMidId = parent?.id || null;
            state.pickTopId = parent?.parentId || null;
          }
        }
        renderHistoryLinearPicker();
      },
    });
  });
}

async function handleAddMasterItem() {
  if (!canAddMasterItem()) return;
  const label = addNewItemInput?.value.trim() || "";
  if (!label) {
    deps.showError(addItemError, "名称を入力してください。");
    return;
  }
  const type = state.addDraft.type;
  deps.showError(addItemError, "");
  deps.setBusy(btnAddNewItem, true, "追加中...", "追加");
  try {
    if (type === "referral") {
      const exists = state.referralItems.find(
        (i) => (i.label || "").trim() === label
      );
      if (exists) {
        state.addDraft.title = label;
        setItemAddOpen(false);
        renderHistoryLinearPicker();
        deps.showToast("既存の紹介先を選択しました。");
        return;
      }
      await addHistoryReferralItem({ label });
      state.addDraft.title = label;
      deps.showToast(`「${label}」を紹介先に追加しました。`);
    } else {
      const items = treeItemsForType(type);
      const addFn =
        type === "surgery" ? addHistorySurgeryItem : addHistoryDiseaseItem;
      const addLeafUnderTop =
        !state.pickMidId && topHasDirectLeaves(items, state.pickTopId);
      if (state.pickMidId || addLeafUnderTop) {
        // 小分類（葉）…中項目配下、または中項目なし大分類の直下
        const parentId = state.pickMidId || state.pickTopId;
        const exists = items.find(
          (i) =>
            !isGroup(i) &&
            (i.label || "").trim() === label &&
            i.parentId === parentId
        );
        if (exists) {
          state.addDraft.title = label;
          setItemAddOpen(false);
          renderHistoryLinearPicker();
          deps.showToast("既存の項目を選択しました。");
          return;
        }
        await addFn({ label, kind: "leaf", parentId });
        state.addDraft.title = label;
        deps.showToast(`「${label}」を小分類に追加しました。`);
      } else {
        // 中分類（グループ）
        const exists = items.find(
          (i) =>
            isGroup(i) &&
            (i.label || "").trim() === label &&
            i.parentId === state.pickTopId
        );
        if (exists) {
          state.pickMidId = exists.id;
          state.addDraft.title = label;
          setItemAddOpen(false);
          renderHistoryLinearPicker();
          deps.showToast("既存の中分類を選択しました。");
          return;
        }
        const id = await addFn({
          label,
          kind: "group",
          parentId: state.pickTopId,
        });
        state.pickMidId = id;
        state.addDraft.title = label;
        deps.showToast(`「${label}」を中分類に追加・選択しました。`);
      }
    }
    setItemAddOpen(false);
    renderHistoryLinearPicker();
  } catch (err) {
    console.error(err);
    deps.showError(addItemError, "追加に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnAddNewItem, false, "追加中...", "追加");
  }
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
      if (state.addDraft.type === t.id) return;
      state.addDraft.type = t.id;
      resetPickerSelection();
      renderAddTypeSelection();
      renderHistoryLinearPicker();
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

  btnAddToggle?.addEventListener("click", () => {
    if (!canAddMasterItem()) return;
    setItemAddOpen(!state.itemAddOpen);
    if (state.itemAddOpen) {
      queueMicrotask(() => addNewItemInput?.focus({ preventScroll: true }));
    }
    updateLeafAddUI();
  });
  btnAddNewItem?.addEventListener("click", () => {
    handleAddMasterItem();
  });
  addNewItemInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (isImeKey(e)) return;
    e.preventDefault();
    handleAddMasterItem();
  });
  addSearchInput?.addEventListener("input", () => {
    state.searchQuery = addSearchInput.value || "";
    renderHistoryLinearPicker();
  });
}

function openAddModal() {
  state.addDraft = {
    title: "",
    type: "disease",
    firstNoted: todayStr(),
    noteText: "",
  };
  resetPickerSelection();
  addFirstNoted.value = todayStr();
  addNote.value = "";
  deps.showError(addError, "");
  renderAddTypeSelection();
  renderHistoryLinearPicker();
  addModal.hidden = false;
}

function closeAddModal() {
  if (addModal) addModal.hidden = true;
  setItemAddOpen(false);
}

async function handleAddSave() {
  const title = (state.addDraft.title || "").trim();
  const firstNoted = addFirstNoted.value;
  const noteText = addNote.value.trim();

  if (!title) {
    deps.showError(addError, "マスタから項目を選択するか、＋で追加してください。");
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
