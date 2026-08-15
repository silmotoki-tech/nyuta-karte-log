// 右カラム「検査予定」タブのUIと操作ロジック。
// AI解析には頼らず、手動操作で完結する。

import {
  subscribeExamPlan,
  subscribeExamItems,
  saveExamScheduledPlan,
  deleteExamScheduledPlan,
  endExamScheduledPlan,
  reviveExamPlanByItem,
  addExamHistory,
  addExamItem,
  deleteExamItem,
  EXAM_ITEM_CATEGORIES,
  normalizeExamItemCategory,
  normalizeExamFasting,
  examFastingLabel,
} from "./db.js";
import { enableRowGestures } from "./row-gestures.js";
import {
  createMasterPickerGroupSelectItem,
  createSwipeableMasterPickerItem,
  requestMasterDelete,
} from "./master-delete-ui.js";
import { isImeKey } from "./ime-keys.js";
import { filterExamLeavesByQuery } from "./exam-item-match.js";
import {
  maxDueAlertLevel,
  setRightTabDueAlert,
} from "./right-tab-alerts.js";

/**
 * 残り日数の色分け閾値（仮。後で調整可能）。
 * yellow: 残りが「全体の yellowRatio」または yellowCapDays の小さい方以下で黄
 * orange: 残りが「全体の orangeRatio」または orangeCapDays の小さい方以下で橙
 * Floor: 短期予定でも色がほとんど変わらないのを防ぐ下限
 */
const DUE_COLOR_THRESHOLDS = {
  yellowRatio: 0.3,
  yellowCapDays: 30,
  yellowFloorDays: 2,
  orangeRatio: 0.15,
  orangeCapDays: 14,
  orangeFloorDays: 1,
};

const DAYS_PER_MONTH = 30;
const DAYS_PER_WEEK = 7;

const INTERVAL_UNITS = [
  { id: "day", label: "日" },
  { id: "week", label: "週" },
  { id: "month", label: "月" },
];

let deps = {
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
};

const state = {
  karteNumber: null,
  plan: null,
  examItems: [],
  /** 予定登録モーダル内の検査大分類（null=未選択） */
  examItemCategory: null,
  /** 血液・画像の中項目ID（null=未選択） */
  examBloodParentId: null,
  /** 大分類末尾の「検索」モード */
  examItemSearchMode: false,
  examItemSearchQuery: "",
  unsubscribePlan: null,
  unsubscribeItems: null,
  activeTab: "exam",
  activePlanId: null,
  editingPlanId: null,
  // 予定編集フォームの下書き
  draft: {
    item: "",
    /** 予定登録時の複数選択（{ id, label, category, parentId, order }[]） */
    selectedItems: [],
    customItem: "",
    dueDate: "",
    note: "",
    fasting: "",
    baselineDate: null,
    dueRelativeUnit: "day",
    dueRelativeValue: 0,
    dueRelativeBuffer: "",
    mode: "create", // create | edit | afterComplete
    /** 登録モーダル内の切り替え。history は予定を作らず実施履歴のみ追加する */
    registerMode: "plan", // plan | history
  },
  /** カレンダー↔相対の同期ループ防止 */
  syncingDueFromRelative: false,
};

// --- DOM -----------------------------------------------------------------

const rightTabs = document.getElementById("right-tabs");
const rightEmpty = document.getElementById("right-empty");

const examRoot = document.getElementById("panel-exam");
const btnExamNew = document.getElementById("btn-exam-new");

/** タブ切替時の外部フック（自由質問の再同期など） */
let onRightTabChange = null;

function getRightPanels() {
  return document.querySelectorAll(".right-panel");
}

const planList = document.getElementById("exam-plan-list");
const planEmpty = document.getElementById("exam-plan-empty");

const historyList = document.getElementById("exam-history-list");
const historyEmpty = document.getElementById("exam-history-empty");

const itemSheet = document.getElementById("exam-item-sheet");
const itemSheetTitle = document.getElementById("exam-item-sheet-title");
const itemSheetItem = document.getElementById("exam-item-sheet-item");
const sheetDueDate = document.getElementById("exam-sheet-due-date");
const sheetDueUnits = document.getElementById("exam-sheet-due-units");
const sheetDueDisplay = document.getElementById("exam-sheet-due-display");
const sheetDueNumpad = document.getElementById("exam-sheet-due-numpad");
const sheetWindowNote = document.getElementById("exam-sheet-window-note");
const sheetNote = document.getElementById("exam-sheet-note");
const sheetError = document.getElementById("exam-sheet-error");
const btnSheetSave = document.getElementById("btn-exam-sheet-save");
const btnSheetComplete = document.getElementById("btn-exam-sheet-complete");
const btnSheetEnd = document.getElementById("btn-exam-sheet-end");
const btnCloseItemSheet = document.getElementById("btn-close-exam-item-sheet");

const planModal = document.getElementById("exam-plan-modal");
const planModalTitle = document.getElementById("exam-plan-modal-title");
const planLinearPicker = document.getElementById("exam-plan-linear-picker");
const planModeToggle = document.getElementById("exam-plan-mode-toggle");
const btnPlanModePlan = document.getElementById("btn-exam-mode-plan");
const btnPlanModeHistory = document.getElementById("btn-exam-mode-history");
const planSectionPlan = document.getElementById("exam-plan-section-plan");
const planDoneCheckRow = document.getElementById("exam-plan-done-check-row");
const planDoneSectionTitle = document.getElementById("exam-plan-section-done-title");
const planColCategoryList = document.getElementById("exam-plan-col-category-list");
const planColGroup = document.getElementById("exam-plan-col-group");
const planColGroupList = document.getElementById("exam-plan-col-group-list");
const planColLeaf = document.getElementById("exam-plan-col-leaf");
const planColLeafList = document.getElementById("exam-plan-col-leaf-list");
const planColLeafHeadLabel = document.getElementById("exam-plan-col-leaf-head-label");
const planItemsEmpty = document.getElementById("exam-plan-items-empty");
const planSelectionSummary = document.getElementById("exam-plan-selection-summary");
const planItemAddDefault = document.getElementById("exam-plan-item-add-default");
const btnPlanAddToggle = document.getElementById("btn-exam-plan-add-toggle");
const planNewItemLabel = document.getElementById("exam-plan-new-item-label");
const planNewItemInput = document.getElementById("exam-plan-new-item");
const btnPlanAddItem = document.getElementById("btn-exam-plan-add-item");
const planItemError = document.getElementById("exam-plan-item-error");
const planSearchWrap = document.getElementById("exam-plan-search");
const planSearchInput = document.getElementById("exam-plan-search-input");
const planFastingField = document.getElementById("exam-plan-fasting-field");
const planFastingButtons = document.getElementById("exam-plan-fasting-buttons");
const planDueDate = document.getElementById("exam-plan-due-date");
const btnPlanDueCalendar = document.getElementById("btn-exam-plan-due-calendar");
const planDueUnits = document.getElementById("exam-plan-due-units");
const planDueDisplay = document.getElementById("exam-plan-due-display");
const planDueNumpad = document.getElementById("exam-plan-due-numpad");
const planWindowNote = document.getElementById("exam-plan-window-note");
const planDoneField = document.getElementById("exam-plan-done-field");
const planDoneCheck = document.getElementById("exam-plan-done-check");
const planDoneBlock = document.getElementById("exam-plan-done-block");
const planDoneDate = document.getElementById("exam-plan-done-date");
const planDoneNote = document.getElementById("exam-plan-done-note");
const planNote = document.getElementById("exam-plan-note");
const planError = document.getElementById("exam-plan-error");
const btnPlanSave = document.getElementById("btn-exam-plan-save");
const btnPlanCancel = document.getElementById("btn-exam-plan-cancel");
const btnClosePlanModal = document.getElementById("btn-close-exam-plan");

const itemSheetFasting = document.getElementById("exam-item-sheet-fasting");
const sheetFastingField = document.getElementById("exam-sheet-fasting-field");
const sheetFastingButtons = document.getElementById("exam-sheet-fasting-buttons");
const btnSheetDueCalendar = document.getElementById("btn-exam-sheet-due-calendar");

const completeModal = document.getElementById("exam-complete-modal");
const completeDate = document.getElementById("exam-complete-date");
const completeNote = document.getElementById("exam-complete-note");
const completeError = document.getElementById("exam-complete-error");
const btnCompleteSave = document.getElementById("btn-exam-complete-save");
const btnCompleteCancel = document.getElementById("btn-exam-complete-cancel");
const btnCloseCompleteModal = document.getElementById("btn-close-exam-complete");

const afterModal = document.getElementById("exam-after-modal");
const afterSummary = document.getElementById("exam-after-summary");
const btnAfterNext = document.getElementById("btn-exam-after-next");
const btnAfterEnd = document.getElementById("btn-exam-after-end");
const btnCloseAfterModal = document.getElementById("btn-close-exam-after");

// --- 日付ユーティリティ ---------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateStr(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDateStr(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function ymdFromStr(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${y}/${Number(m)}/${Number(d)}`;
}

/** 実施履歴用: 年と月日を分けて返す（表示は2段組み） */
function historyDateParts(dateStr) {
  if (!dateStr) return { year: "", md: "日付未設定" };
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return { year: "", md: dateStr };
  return { year: y, md: `${Number(m)}/${Number(d)}` };
}

function addDays(dateStr, days) {
  const d = parseDateStr(dateStr);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return formatDateStr(d);
}

function daysBetween(fromStr, toStr) {
  const a = parseDateStr(fromStr);
  const b = parseDateStr(toStr);
  if (!a || !b) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * 単位と数値を日数へ変換する（月は 30 日換算）。
 */
export function unitToDays(unit, value) {
  const n = Math.max(0, Number(value) || 0);
  if (unit === "week") return n * DAYS_PER_WEEK;
  if (unit === "month") return n * DAYS_PER_MONTH;
  return n;
}

/**
 * 表示用ラベル（例: 14日ごと / 2週ごと / 3ヶ月ごと）。
 */
export function formatIntervalLabel(unit, value) {
  const n = Number(value) || 0;
  if (unit === "week") return `${n}週ごと`;
  if (unit === "month") return `${n}ヶ月ごと`;
  return `${n}日ごと`;
}

/**
 * 相対指定の表示用ラベル（例: 14日後 / 2週後 / 3ヶ月後）。
 */
export function formatRelativeOffsetLabel(unit, value) {
  const n = Number(value) || 0;
  if (unit === "week") return `${n}週後`;
  if (unit === "month") return `${n}ヶ月後`;
  return `${n}日後`;
}

/**
 * カレンダー月＋日の差から「（前回からXヶ月Y日）」を返す。
 * fromStr = より古い日付、toStr = より新しい日付。
 */
export function formatHistoryGapLabel(fromStr, toStr) {
  const from = parseDateStr(fromStr);
  const to = parseDateStr(toStr);
  if (!from || !to) return "";
  if (to < from) return formatHistoryGapLabel(toStr, fromStr);

  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  let days = to.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    const lastDayPrevMonth = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
    days = lastDayPrevMonth - from.getDate() + to.getDate();
  }
  if (months < 0) return "";

  const parts = [];
  if (months > 0) parts.push(`${months}ヶ月`);
  if (days > 0) parts.push(`${days}日`);
  if (parts.length === 0) parts.push("0日");
  return `（前回から${parts.join("")}）`;
}

/**
 * 基準日 + 間隔日数 → 予定日（単一）。
 * 旧互換のため dueDateFrom/To も同日で返す。
 */
export function computeDueWindow(baseDateStr, intervalDays, _windowDays = 0) {
  const days = Number(intervalDays) || 0;
  const target = addDays(baseDateStr, days);
  if (!target) return null;
  return {
    dueDate: target,
    dueDateFrom: target,
    dueDateTo: target,
    targetDate: target,
    baselineDate: baseDateStr,
  };
}

/**
 * 単一日付を次回予定ペイロード用に整える（幅は持たせない）。
 */
export function expandSingleDate(dateStr, _windowDays = 0) {
  if (!dateStr) return null;
  return {
    dueDate: dateStr,
    dueDateFrom: dateStr,
    dueDateTo: dateStr,
    targetDate: dateStr,
  };
}

/**
 * 予定から予定日（単一）を取り出す。旧 dueDateFrom/To にも対応。
 */
export function getPlanDueDate(nextPlan) {
  if (!nextPlan) return "";
  if (nextPlan.dueDate) return nextPlan.dueDate;
  if (nextPlan.targetDate) return nextPlan.targetDate;
  if (nextPlan.dueDateFrom && nextPlan.dueDateTo) {
    if (nextPlan.dueDateFrom === nextPlan.dueDateTo) return nextPlan.dueDateFrom;
    const span = daysBetween(nextPlan.dueDateFrom, nextPlan.dueDateTo);
    if (span != null && span >= 0) {
      return addDays(nextPlan.dueDateFrom, Math.floor(span / 2));
    }
  }
  return nextPlan.dueDateFrom || nextPlan.dueDateTo || "";
}

/**
 * カウントダウン用の基準日。無い場合は null（絶対日数キャップのみで色分け）。
 */
export function getPlanBaselineDate(nextPlan) {
  if (nextPlan?.baselineDate) return nextPlan.baselineDate;
  return null;
}

/**
 * 残り日数と色レベルを計算する。
 * level: "far" | "near" | "close" | "overdue"
 */
export function getDueCountdown(dueDate, baselineDate = null, today = todayStr()) {
  if (!dueDate) return null;
  const remaining = daysBetween(today, dueDate);
  if (remaining == null) return null;

  let totalDays = null;
  if (baselineDate) {
    const span = daysBetween(baselineDate, dueDate);
    if (span != null && span > 0) totalDays = span;
  }
  // baseline が無い／不正なときは、キャップが効くよう十分長い全体日数とみなす
  if (totalDays == null || totalDays <= 0) {
    totalDays = Math.max(
      remaining > 0 ? remaining : 1,
      Math.ceil(DUE_COLOR_THRESHOLDS.yellowCapDays / DUE_COLOR_THRESHOLDS.yellowRatio)
    );
  }

  const yellowAt = Math.max(
    DUE_COLOR_THRESHOLDS.yellowFloorDays,
    Math.min(
      totalDays * DUE_COLOR_THRESHOLDS.yellowRatio,
      DUE_COLOR_THRESHOLDS.yellowCapDays
    )
  );
  const orangeAt = Math.max(
    DUE_COLOR_THRESHOLDS.orangeFloorDays,
    Math.min(
      totalDays * DUE_COLOR_THRESHOLDS.orangeRatio,
      DUE_COLOR_THRESHOLDS.orangeCapDays
    )
  );

  let level = "far";
  if (remaining < 0) level = "overdue";
  else if (remaining <= orangeAt) level = "close";
  else if (remaining <= yellowAt) level = "near";

  return {
    dueDate,
    baselineDate: baselineDate || null,
    remaining,
    totalDays,
    yellowAt,
    orangeAt,
    level,
  };
}

/**
 * 「あと○日」／「○日超過」／「本日期日」。
 * includeDate=true のときだけ括弧付き日付を付ける（詳細・入力欄用）。
 */
export function formatDueCountdown(info, { includeDate = true } = {}) {
  if (!info) return "";
  let text = "";
  if (info.remaining < 0) {
    text = `${Math.abs(info.remaining)}日超過`;
  } else if (info.remaining === 0) {
    text = "本日期日";
  } else {
    text = `あと${info.remaining}日`;
  }
  if (!includeDate) return text;
  const dateLabel = ymdFromStr(info.dueDate);
  return dateLabel ? `${text}（${dateLabel}）` : text;
}

/**
 * 旧API互換ステータス。
 */
export function getDueStatus(nextPlan, today = todayStr()) {
  const dueDate = getPlanDueDate(nextPlan);
  if (!dueDate) return "ok";
  const info = getDueCountdown(dueDate, getPlanBaselineDate(nextPlan), today);
  if (!info) return "ok";
  if (info.level === "overdue") return "overdue";
  if (info.level === "close" || info.level === "near") return "approaching";
  return "ok";
}

function dueLevelClass(level) {
  if (level === "overdue") return "exam-due-text--overdue";
  if (level === "close") return "exam-due-text--close";
  if (level === "near") return "exam-due-text--near";
  return "exam-due-text--far";
}

// --- 公開API --------------------------------------------------------------

export function initExamPlanUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  wireTabs();
  wireNextPlanActions();
  wirePlanModal();
  wireCompleteModal();
  wireAfterModal();
  buildPlanDueRelativeUI();

  state.unsubscribeItems = subscribeExamItems((items) => {
    state.examItems = items;
    // 予定登録モーダルが開いているときだけ描画（起動時の不要なDOM更新を避ける）
    if (planModal && !planModal.hidden) {
      renderExamLinearPicker();
    }
  });

  showRightEmpty(true);
  switchTab("exam");
}

export function enterExamPlan(karteNumber) {
  leaveExamPlan();
  state.karteNumber = karteNumber;
  showRightEmpty(false);
  switchTab("exam");
  state.unsubscribePlan = subscribeExamPlan(karteNumber, (plan) => {
    state.plan = plan;
    renderExamPlan();
  });
}

export function leaveExamPlan() {
  if (state.unsubscribePlan) {
    state.unsubscribePlan();
    state.unsubscribePlan = null;
  }
  state.karteNumber = null;
  state.plan = null;
  state.activePlanId = null;
  state.editingPlanId = null;
  setRightTabDueAlert("exam", null);
  closeExamItemSheet();
  closePlanModal();
  closeCompleteModal();
  closeAfterModal();
  showRightEmpty(true);
}

// --- タブ切替 ------------------------------------------------------------

function wireTabs() {
  rightTabs?.querySelectorAll(".right-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      switchTab(btn.dataset.tab);
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  rightTabs?.querySelectorAll(".right-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tabId);
  });
  const panels = getRightPanels();
  // カルテ未オープン時は案内メッセージのみ表示
  if (!state.karteNumber) {
    panels.forEach((panel) => {
      panel.hidden = true;
    });
    if (typeof onRightTabChange === "function") {
      onRightTabChange(tabId, false);
    }
    return;
  }
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tabId;
  });
  if (typeof onRightTabChange === "function") {
    onRightTabChange(tabId, true);
  }
}

/** AI提案など外部から右カラムタブを開く */
export function switchRightTab(tabId) {
  switchTab(tabId);
}

/** 右カラムタブ切替の通知を登録する（自由質問など） */
export function setRightTabChangeHandler(handler) {
  onRightTabChange = typeof handler === "function" ? handler : null;
}

function showRightEmpty(empty) {
  if (rightEmpty) rightEmpty.hidden = !empty;
  examRoot?.classList.toggle("is-disabled", empty);
  if (empty) {
    getRightPanels().forEach((p) => {
      p.hidden = true;
    });
  } else if (state.activeTab) {
    switchTab(state.activeTab);
  }
}

// --- 描画 ----------------------------------------------------------------

function renderExamPlan() {
  if (!state.plan) return;
  renderUnifiedPlanList();
  renderHistory();
  updateExamTabDueAlert();
}

function updateExamTabDueAlert() {
  const levels = collectUnifiedPlanEntries()
    .map((entry) => entry.countdown?.level)
    .filter(Boolean);
  setRightTabDueAlert("exam", maxDueAlertLevel(levels));
}

/**
 * plans/ を1一覧にし、予定日昇順で表示。
 */
function collectUnifiedPlanEntries() {
  const entries = [];

  Object.entries(state.plan.plans || {}).forEach(([id, p]) => {
    if (!p) return;
    const dueDate = getPlanDueDate(p);
    const countdown = getDueCountdown(dueDate, getPlanBaselineDate(p));
    entries.push({
      id,
      kind: "plan",
      sortKey: dueDate || "9999-99-99",
      item: p.item || "（項目未設定）",
      dueDate,
      countdown,
      note: p.note || "",
      fasting: normalizeExamFasting(p.fasting),
      plan: { id, ...p },
    });
  });

  entries.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey.localeCompare(b.sortKey);
    return (a.item || "").localeCompare(b.item || "");
  });
  return entries;
}

function renderUnifiedPlanList() {
  if (!planList) return;
  planList.innerHTML = "";
  const entries = collectUnifiedPlanEntries();
  if (planEmpty) planEmpty.hidden = entries.length > 0;

  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.className = "exam-list-item";
    li.dataset.planId = entry.id;

    const info = document.createElement("div");
    info.className = "exam-list-item__info";
    const head = document.createElement("div");
    head.className = "exam-list-item__head";
    const title = document.createElement("div");
    title.className = "exam-list-item__title";
    title.textContent = entry.item;
    const dueEl = document.createElement("div");
    dueEl.className = `exam-list-item__due ${dueLevelClass(entry.countdown?.level || "far")}`;
    if (entry.countdown) {
      dueEl.textContent = formatDueCountdown(entry.countdown, { includeDate: false });
    } else {
      dueEl.textContent = "予定日未設定";
      dueEl.className = "exam-list-item__due";
    }
    head.append(title, dueEl);
    info.appendChild(head);
    const fastingText = examFastingLabel(entry.fasting);
    if (fastingText) {
      const fastingEl = document.createElement("div");
      fastingEl.className = "exam-list-item__meta";
      fastingEl.textContent = `絶食：${fastingText}`;
      info.appendChild(fastingEl);
    }
    if (entry.note) {
      const noteEl = document.createElement("div");
      noteEl.className = "exam-list-item__note";
      noteEl.textContent = entry.note;
      info.appendChild(noteEl);
    }
    li.appendChild(info);

    // スワイプ: 左=詳細（編集） / 右=終了。完了は詳細シートから。
    enableRowGestures(li, {
      actions: [
        {
          action: "edit",
          title: "編集",
          onClick: () => openExamItemSheet(entry),
        },
        {
          action: "delete",
          title: "終了",
          onClick: () => handleEndPlan(entry.id),
        },
      ],
      onActivate: () => openExamItemSheet(entry),
    });
    planList.appendChild(li);
  });
}

function isSheetOpen() {
  return Boolean(itemSheet && !itemSheet.hidden);
}

function openExamItemSheet(entry) {
  if (!itemSheet || !entry?.id) return;
  const plan = state.plan?.plans?.[entry.id];
  if (!plan) return;

  state.activePlanId = entry.id;
  state.editingPlanId = entry.id;
  state.draft.mode = "edit";
  state.draft.item = plan.item || entry.item || "";
  state.draft.dueDate = getPlanDueDate(plan) || entry.dueDate || "";
  state.draft.note = plan.note || entry.note || "";
  state.draft.fasting = normalizeExamFasting(plan.fasting ?? entry.fasting);
  state.draft.baselineDate = plan.baselineDate || getPlanBaselineDate(plan) || null;

  if (itemSheetTitle) itemSheetTitle.textContent = "検査予定";
  if (itemSheetItem) itemSheetItem.textContent = state.draft.item || "（項目未設定）";
  syncSheetFastingUI();
  if (sheetDueDate) sheetDueDate.value = state.draft.dueDate || "";
  if (sheetNote) sheetNote.value = state.draft.note || "";
  deps.showError(sheetError, "");

  if (state.draft.dueDate) {
    syncRelativeFromCalendar(state.draft.dueDate);
  } else {
    resetDraftDueRelative();
    syncDueRelativeUI();
  }
  updateWindowNote();
  itemSheet.hidden = false;
}

function closeExamItemSheet() {
  if (itemSheet) itemSheet.hidden = true;
  if (planModal?.hidden !== false) {
    state.editingPlanId = null;
  }
}

function findActivePlanByItemName(itemName) {
  const name = (itemName || "").trim();
  if (!name) return null;
  const entry = Object.entries(state.plan?.plans || {}).find(
    ([, p]) => p && (p.item || "").trim() === name
  );
  if (!entry) return null;
  const [id, plan] = entry;
  return { id, plan };
}

function openPlanSheetById(planId) {
  const plan = state.plan?.plans?.[planId];
  if (!plan) return false;
  openExamItemSheet({
    id: planId,
    item: plan.item,
    dueDate: getPlanDueDate(plan) || "",
    note: plan.note || "",
    fasting: normalizeExamFasting(plan.fasting),
    countdown: getDueCountdown(getPlanDueDate(plan), getPlanBaselineDate(plan)),
  });
  return true;
}

function openPlanSheetWhenReady(planId, attempt = 0) {
  if (openPlanSheetById(planId)) return;
  if (attempt < 30) setTimeout(() => openPlanSheetWhenReady(planId, attempt + 1), 40);
}

/**
 * 実施履歴の検査項目を検査予定一覧へ戻す（次回予定日は未設定）。
 */
async function handleReviveFromHistory(itemName, note = "") {
  const label = itemName || "予定";
  const existing = findActivePlanByItemName(itemName);
  if (existing) {
    deps.showToast("すでに検査予定一覧にあります。次回予定を入力してください。");
    openPlanSheetById(existing.id);
    return;
  }
  const ok = window.confirm(
    `「${label}」を検査予定一覧に戻しますか？\n次回予定日は未設定のまま戻ります（実施履歴はそのまま残ります）。`
  );
  if (!ok) return;
  try {
    const planId = await reviveExamPlanByItem(state.karteNumber, {
      item: itemName,
      note,
    });
    deps.showToast("予定に戻しました。次回予定日を入力してください。");
    openPlanSheetWhenReady(planId);
  } catch (err) {
    console.error(err);
    deps.showToast("予定に戻す操作に失敗しました。", { isError: true });
  }
}

function renderHistory() {
  if (!historyList) return;
  historyList.innerHTML = "";
  const items = Object.entries(state.plan.history || {}).map(([id, h]) => ({ id, ...h }));
  if (historyEmpty) historyEmpty.hidden = items.length > 0;

  // 項目名ごとにグループ化し、見出し＋実施日の降順で並べる
  const groups = new Map();
  items.forEach((h) => {
    const key = h.item || "（項目未設定）";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  });

  const groupKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b, "ja"));

  groupKeys.forEach((itemName) => {
    const groupItems = groups.get(itemName);
    groupItems.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const oldestFirst = [...groupItems].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "")
    );
    const oldestId = oldestFirst[0]?.id;

    const groupTitle = document.createElement("li");
    groupTitle.className = "exam-history-group-title";
    groupTitle.dataset.historyGroup = itemName;
    const groupLabel = document.createElement("div");
    groupLabel.className = "exam-history-group-title__label";
    groupLabel.textContent = itemName;
    const groupHint = document.createElement("div");
    groupHint.className = "exam-history-group-title__hint";
    groupHint.textContent = `${groupItems.length}件 · 新しい順`;
    groupTitle.append(groupLabel, groupHint);
    historyList.appendChild(groupTitle);

    groupItems.forEach((h) => {
      const li = document.createElement("li");
      li.className = "exam-list-item exam-list-item--history";
      li.dataset.historyId = h.id;
      li.dataset.historyItem = itemName;

      const info = document.createElement("div");
      info.className = "exam-list-item__info";

      const head = document.createElement("div");
      head.className = "exam-list-item__head";

      const dateEl = document.createElement("div");
      dateEl.className = "exam-history-date";
      const parts = historyDateParts(h.date);
      if (parts.year) {
        const yearEl = document.createElement("span");
        yearEl.className = "exam-history-date__year";
        yearEl.textContent = parts.year;
        dateEl.appendChild(yearEl);
      }
      const mdEl = document.createElement("span");
      mdEl.className = "exam-history-date__md";
      mdEl.textContent = parts.md;
      dateEl.appendChild(mdEl);

      head.appendChild(dateEl);
      info.appendChild(head);

      if (h.id !== oldestId && h.date) {
        const idx = oldestFirst.findIndex((x) => x.id === h.id);
        const prevOlder = idx > 0 ? oldestFirst[idx - 1] : null;
        if (prevOlder?.date) {
          const gapEl = document.createElement("div");
          gapEl.className = "exam-list-item__meta";
          gapEl.textContent = formatHistoryGapLabel(prevOlder.date, h.date);
          info.appendChild(gapEl);
        }
      }
      if (h.note) {
        const meta = document.createElement("div");
        meta.className = "exam-list-item__note";
        meta.textContent = h.note;
        info.appendChild(meta);
      }
      li.appendChild(info);

      enableRowGestures(li, {
        actions: [
          {
            action: "refresh",
            title: "予定に戻す",
            onClick: () => handleReviveFromHistory(itemName, h.note || ""),
          },
        ],
      });
      historyList.appendChild(li);
    });
  });
}

// --- 予定アクション -------------------------------------------------------

function wireNextPlanActions() {
  btnExamNew?.addEventListener("click", () => openPlanModal("create"));
  btnCloseItemSheet?.addEventListener("click", closeExamItemSheet);
  itemSheet?.querySelector("[data-close-modal]")?.addEventListener("click", closeExamItemSheet);
  btnSheetSave?.addEventListener("click", handleSheetSave);
  btnSheetComplete?.addEventListener("click", () => {
    const id = state.activePlanId || state.editingPlanId;
    closeExamItemSheet();
    openCompleteModal(id);
  });
  btnSheetEnd?.addEventListener("click", () => {
    const id = state.activePlanId || state.editingPlanId;
    closeExamItemSheet();
    handleEndPlan(id);
  });
  wireDueDateInput(sheetDueDate);
  btnSheetDueCalendar?.addEventListener("click", () => openDueCalendarPicker(sheetDueDate));
}

async function handleSheetSave() {
  const planId = state.editingPlanId || state.activePlanId;
  const plan = planId ? state.plan?.plans?.[planId] : null;
  if (!planId || !plan) return;

  const dueBuffered = Number(state.draft.dueRelativeBuffer);
  if (state.draft.dueRelativeBuffer !== "" && dueBuffered >= 1) {
    applyDueRelativeToCalendar();
  }
  const dueDate = sheetDueDate?.value || state.draft.dueDate || "";
  const note = sheetNote?.value.trim() || "";
  const item = plan.item || state.draft.item || "";
  const fasting = planNeedsFasting(item)
    ? normalizeExamFasting(state.draft.fasting)
    : "";

  if (!dueDate) {
    deps.showError(sheetError, "日付を選択してください。");
    return;
  }
  if (planNeedsFasting(item) && !fasting) {
    deps.showError(sheetError, "絶食の要不要を選んでください。");
    return;
  }

  deps.showError(sheetError, "");
  deps.setBusy(btnSheetSave, true, "保存中...", "保存する");
  try {
    await saveExamScheduledPlan(state.karteNumber, {
      planId,
      item,
      dueDate,
      note,
      fasting,
      baselineDate: state.draft.baselineDate || plan.baselineDate || todayStr(),
    });
    closeExamItemSheet();
    deps.showToast("予定を保存しました。");
  } catch (err) {
    console.error(err);
    deps.showError(sheetError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnSheetSave, false, "保存中...", "保存する");
  }
}

async function handleEndPlan(planId) {
  if (!planId) return;
  const plan = state.plan?.plans?.[planId];
  const label = plan?.item || "予定";
  const ok = window.confirm(
    `「${label}」の予定を終了しますか？\n検査予定一覧からは消えます。実施履歴は残り、そこから「予定に戻す」ができます。`
  );
  if (!ok) return;
  try {
    await endExamScheduledPlan(state.karteNumber, planId);
    if (state.activePlanId === planId) state.activePlanId = null;
    if (state.editingPlanId === planId) state.editingPlanId = null;
    deps.showToast("予定を終了しました。");
  } catch (err) {
    console.error(err);
    deps.showToast("終了に失敗しました。", { isError: true });
  }
}

// --- 予定編集モーダル -----------------------------------------------------

function wirePlanModal() {
  btnClosePlanModal?.addEventListener("click", closePlanModal);
  btnPlanCancel?.addEventListener("click", closePlanModal);
  planModal?.querySelector("[data-close-modal]")?.addEventListener("click", closePlanModal);
  btnPlanSave?.addEventListener("click", handlePlanSave);
  btnPlanModePlan?.addEventListener("click", () => setRegisterMode("plan"));
  btnPlanModeHistory?.addEventListener("click", () => setRegisterMode("history"));
  btnPlanAddItem?.addEventListener("click", () => handleAddExamItemFromPlanModal());
  btnPlanAddToggle?.addEventListener("click", () => {
    const open = planItemAddDefault && !planItemAddDefault.hidden;
    setExamItemAddFormOpen(!open);
  });
  planNewItemInput?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setExamItemAddFormOpen(false);
      return;
    }
    if (e.key === "Enter" && !isImeKey(e)) {
      e.preventDefault();
      handleAddExamItemFromPlanModal();
    }
  });
  planSearchInput?.addEventListener("input", () => {
    state.examItemSearchQuery = planSearchInput.value || "";
    renderExamLinearPicker();
  });
  wireFastingButtons(planFastingButtons, () => {
    renderPlanFastingButtons();
  });
  wireFastingButtons(sheetFastingButtons, () => {
    syncSheetFastingUI();
  });

  wireDueDateInput(planDueDate);
  planDueDate?.addEventListener("click", () => openDueCalendarPicker(planDueDate));
  planDueDate?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDueCalendarPicker(planDueDate);
    }
  });
  planDoneDate?.addEventListener("click", () => {
    if (!planDoneDate.disabled) openDueCalendarPicker(planDoneDate);
  });
  planDoneCheck?.addEventListener("change", syncPlanDoneBlockVisibility);
}

/**
 * ネイティブ日付ピッカーを開く（iPad モーダル内でもボタン経由なら開きやすい）。
 */
function openDueCalendarPicker(inputEl) {
  if (!inputEl) return;
  inputEl.focus({ preventScroll: true });
  try {
    if (typeof inputEl.showPicker === "function") {
      inputEl.showPicker();
      return;
    }
  } catch {
    // showPicker が拒否されても focus だけでネイティブ UI が出る端末がある
  }
  // 日付欄が見える位置までスクロール
  inputEl
    .closest(".exam-plan-section, .exam-due-field")
    ?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
}

/**
 * カレンダー日付変更 → 相対指定へ反映（change / input の両方）。
 */
function wireDueDateInput(inputEl) {
  if (!inputEl || inputEl.dataset.dueWired === "1") return;
  inputEl.dataset.dueWired = "1";
  const onPick = () => {
    if (state.syncingDueFromRelative) return;
    state.draft.dueDate = inputEl.value;
    syncRelativeFromCalendar(inputEl.value);
    updateWindowNote();
  };
  inputEl.addEventListener("change", onPick);
  inputEl.addEventListener("input", onPick);
}

/**
 * テンキー風 UI を組み立てる（0〜9・削除・確定）。
 */
function mountNumpad(container, { onDigit, onDelete, onConfirm }) {
  if (!container) return;
  container.innerHTML = "";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "削除", "0", "確定"];
  keys.forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "numpad__btn";
    btn.textContent = key;
    if (key === "削除") {
      btn.classList.add("numpad__btn--action");
      btn.addEventListener("click", onDelete);
    } else if (key === "確定") {
      btn.classList.add("numpad__btn--action", "numpad__btn--confirm");
      btn.addEventListener("click", onConfirm);
    } else {
      btn.addEventListener("click", () => onDigit(key));
    }
    container.appendChild(btn);
  });
}

function mountUnitButtons(container, selectedUnit, onSelect) {
  if (!container) return;
  container.innerHTML = "";
  INTERVAL_UNITS.forEach((u) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "interval-unit-btn";
    btn.textContent = u.label;
    btn.classList.toggle("is-selected", u.id === selectedUnit);
    btn.addEventListener("click", () => onSelect(u.id));
    container.appendChild(btn);
  });
}

function displayRelativeBufferLabel(unit, buffer, confirmedValue) {
  const shown = buffer !== "" ? buffer : String(confirmedValue ?? "");
  return formatRelativeOffsetLabel(unit, shown === "" ? 0 : shown);
}

/**
 * 日数を、できるだけきれいな単位で表現する。
 */
function expressDaysAsRelative(days) {
  const d = Math.max(0, Number(days) || 0);
  if (d > 0 && d % DAYS_PER_MONTH === 0) {
    return { unit: "month", value: d / DAYS_PER_MONTH };
  }
  if (d > 0 && d % DAYS_PER_WEEK === 0) {
    return { unit: "week", value: d / DAYS_PER_WEEK };
  }
  return { unit: "day", value: d };
}

/**
 * カレンダー日付 → 相対指定表示へ反映。
 */
function syncRelativeFromCalendar(dateStr) {
  if (!dateStr) {
    state.draft.dueRelativeUnit = "day";
    state.draft.dueRelativeValue = 0;
    state.draft.dueRelativeBuffer = "";
    syncDueRelativeUI();
    return;
  }
  const days = daysBetween(todayStr(), dateStr);
  if (days == null) return;
  if (days < 0) {
    state.draft.dueRelativeUnit = "day";
    state.draft.dueRelativeValue = 0;
    state.draft.dueRelativeBuffer = "0";
  } else {
    const expressed = expressDaysAsRelative(days);
    state.draft.dueRelativeUnit = expressed.unit;
    state.draft.dueRelativeValue = expressed.value;
    state.draft.dueRelativeBuffer = String(expressed.value);
  }
  syncDueRelativeUI();
}

/**
 * 相対指定 → カレンダー日付へ反映。
 */
function applyDueRelativeToCalendar() {
  const buffered = Number(state.draft.dueRelativeBuffer);
  const value =
    buffered >= 0 && state.draft.dueRelativeBuffer !== ""
      ? buffered
      : Number(state.draft.dueRelativeValue) || 0;
  state.draft.dueRelativeValue = value;
  state.draft.dueRelativeBuffer = String(value);

  const days = unitToDays(state.draft.dueRelativeUnit, value);
  const date = addDays(todayStr(), days);
  state.syncingDueFromRelative = true;
  if (sheetDueDate) sheetDueDate.value = date;
  if (planDueDate) planDueDate.value = date;
  state.draft.dueDate = date;
  state.syncingDueFromRelative = false;
  updateWindowNote();
  syncDueRelativeUI();
}

function buildPlanDueRelativeUI() {
  const bindNumpad = (container, errorEl) => {
    if (!container) return;
    mountNumpad(container, {
      onDigit: (d) => {
        if (state.draft.dueRelativeBuffer.length >= 4) return;
        state.draft.dueRelativeBuffer =
          state.draft.dueRelativeBuffer === "0" ? d : state.draft.dueRelativeBuffer + d;
        syncDueRelativeUI();
      },
      onDelete: () => {
        state.draft.dueRelativeBuffer = state.draft.dueRelativeBuffer.slice(0, -1);
        syncDueRelativeUI();
      },
      onConfirm: () => {
        const n = Number(state.draft.dueRelativeBuffer);
        if (state.draft.dueRelativeBuffer === "" || Number.isNaN(n) || n < 0) {
          deps.showError(errorEl, "相対日数は0以上の数値を入力し、「確定」してください。");
          return;
        }
        if (n < 1) {
          deps.showError(
            errorEl,
            "1以上の相対日数を入力するか、カレンダーで日付を選んでください。"
          );
          return;
        }
        deps.showError(errorEl, "");
        applyDueRelativeToCalendar();
      },
    });
  };
  bindNumpad(planDueNumpad, planError);
  bindNumpad(sheetDueNumpad, sheetError);
  syncDueRelativeUI();
}

function syncDueRelativeUI() {
  const onUnitSelect = (unit) => {
    const prevUnit = state.draft.dueRelativeUnit;
    const prevValue =
      state.draft.dueRelativeBuffer !== ""
        ? Number(state.draft.dueRelativeBuffer) || 0
        : Number(state.draft.dueRelativeValue) || 0;
    const days = unitToDays(prevUnit, prevValue);
    let nextValue = days;
    if (unit === "week") nextValue = Math.max(0, Math.round(days / DAYS_PER_WEEK));
    else if (unit === "month") nextValue = Math.max(0, Math.round(days / DAYS_PER_MONTH));
    state.draft.dueRelativeUnit = unit;
    state.draft.dueRelativeValue = nextValue;
    state.draft.dueRelativeBuffer = nextValue > 0 || days === 0 ? String(nextValue) : "";
    const hasDate = Boolean(sheetDueDate?.value || planDueDate?.value);
    if (nextValue > 0 || hasDate) {
      applyDueRelativeToCalendar();
    } else {
      syncDueRelativeUI();
    }
  };

  mountUnitButtons(planDueUnits, state.draft.dueRelativeUnit, onUnitSelect);
  mountUnitButtons(sheetDueUnits, state.draft.dueRelativeUnit, onUnitSelect);

  const label = displayRelativeBufferLabel(
    state.draft.dueRelativeUnit,
    state.draft.dueRelativeBuffer,
    state.draft.dueRelativeValue
  );
  if (planDueDisplay) planDueDisplay.textContent = label;
  if (sheetDueDisplay) sheetDueDisplay.textContent = label;
}

function resetDraftDueRelative() {
  state.draft.dueRelativeUnit = "day";
  state.draft.dueRelativeValue = 0;
  state.draft.dueRelativeBuffer = "";
}

function examItemCategoryLabel(categoryId) {
  const found = EXAM_ITEM_CATEGORIES.find((c) => c.id === categoryId);
  return found?.label || "その他";
}

function isExamGroup(item) {
  return item && item.kind === "group";
}

function findExamItemByLabel(label) {
  const name = (label || "").trim();
  if (!name) return null;
  return (
    state.examItems.find(
      (item) => !isExamGroup(item) && (item.label || "").trim() === name
    ) ||
    state.examItems.find((item) => (item.label || "").trim() === name) ||
    null
  );
}

function toSelectedExamRef(item) {
  return {
    id: item.id || "",
    label: (item.label || "").trim(),
    category: normalizeExamItemCategory(item.category),
    parentId: item.parentId || "",
    order: typeof item.order === "number" ? item.order : 0,
  };
}

function examItemParentKey(item) {
  return String(item?.parentId || "").trim();
}

function examItemsShareSlot(a, b) {
  if (!a || !b) return false;
  return (
    normalizeExamItemCategory(a.category) === normalizeExamItemCategory(b.category) &&
    examItemParentKey(a) === examItemParentKey(b)
  );
}

function isExamItemSelected(item) {
  if (!item) return false;
  return state.draft.selectedItems.some((sel) => {
    if (item.id && sel.id) return sel.id === item.id;
    return (
      (sel.label || "") === (item.label || "").trim() && examItemsShareSlot(sel, item)
    );
  });
}

/** @deprecated 互換用エイリアス */
function isExamLeafSelected(item) {
  return isExamItemSelected(item);
}

const EXAM_CATEGORY_SORT = { blood: 0, imaging: 1, pathology: 2, other: 3 };

/**
 * 小項目ラベルから中項目名の重複プレフィックスを取り除く。
 * 例: parent=レントゲン, leaf=レントゲン(腹部) → 腹部
 */
function leafLabelWithoutParentPrefix(leafLabel, parentLabel) {
  const leaf = String(leafLabel || "").trim();
  const parent = String(parentLabel || "").trim();
  if (!leaf || !parent) return leaf;
  const escaped = parent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wrapped = new RegExp(`^${escaped}\\s*[（(]\\s*(.+?)\\s*[）)]$`);
  const m = leaf.match(wrapped);
  if (m?.[1]?.trim()) return m[1].trim();
  if (leaf === parent) return leaf;
  return leaf;
}

/**
 * 複数選択を「肝臓 ＞ ALT・AST・ALP」「レントゲン ＞ 腹部」形式の表示名にまとめる。
 * 中項目名は一度だけ付け、小項目側に親名が残っていても二重表示しない。
 */
function formatSelectedExamLabels(selected, examItems = state.examItems) {
  const list = Array.isArray(selected) ? selected.filter((s) => (s.label || "").trim()) : [];
  if (!list.length) return "";

  const byId = new Map((examItems || []).map((item) => [item.id, item]));
  const sorted = [...list].sort((a, b) => {
    const ca = EXAM_CATEGORY_SORT[normalizeExamItemCategory(a.category)] ?? 9;
    const cb = EXAM_CATEGORY_SORT[normalizeExamItemCategory(b.category)] ?? 9;
    if (ca !== cb) return ca - cb;
    const pa = a.parentId ? byId.get(a.parentId) : null;
    const pb = b.parentId ? byId.get(b.parentId) : null;
    const poa = pa ? (pa.order ?? 0) : (a.order ?? 0);
    const pob = pb ? (pb.order ?? 0) : (b.order ?? 0);
    if (poa !== pob) return poa - pob;
    if ((a.parentId || "") !== (b.parentId || "")) {
      return String(a.parentId || "").localeCompare(String(b.parentId || ""));
    }
    return (a.order ?? 0) - (b.order ?? 0);
  });

  const parentBuckets = new Map();
  sorted.forEach((sel) => {
    if (!sel.parentId) return;
    if (!parentBuckets.has(sel.parentId)) parentBuckets.set(sel.parentId, []);
    parentBuckets.get(sel.parentId).push(sel);
  });

  const segments = [];
  const seenParents = new Set();
  sorted.forEach((sel) => {
    if (sel.parentId) {
      if (seenParents.has(sel.parentId)) return;
      seenParents.add(sel.parentId);
      const parent = byId.get(sel.parentId);
      const parentLabel = (parent?.label || "").trim() || "検査";
      const children = parentBuckets.get(sel.parentId) || [];
      const childLabels = children
        .map((c) => leafLabelWithoutParentPrefix(c.label, parentLabel))
        .filter(Boolean)
        .join("・");
      segments.push(`${parentLabel} ＞ ${childLabels}`);
      return;
    }
    segments.push(sel.label);
  });
  return segments.join("・");
}

function syncDraftItemFromSelection() {
  if (!state.draft.selectedItems.length) return;
  state.draft.item = formatSelectedExamLabels(state.draft.selectedItems);
}

function selectionNeedsFasting(selected = state.draft.selectedItems) {
  return (selected || []).some(
    (sel) => normalizeExamItemCategory(sel.category) === "blood"
  );
}

/** 選択中の血液項目からマスタ既定の絶食を解決する（不一致・未設定は空） */
function resolveDefaultFastingFromSelection(selected = state.draft.selectedItems) {
  const values = (selected || [])
    .filter((sel) => normalizeExamItemCategory(sel.category) === "blood")
    .map((sel) => {
      const item =
        (sel.id && state.examItems.find((x) => x.id === sel.id)) ||
        findExamItemByLabel(sel.label);
      return normalizeExamFasting(item?.defaultFasting);
    })
    .filter(Boolean);
  if (!values.length) return "";
  const first = values[0];
  return values.every((v) => v === first) ? first : "";
}

/** 選択変更時にマスタ既定の絶食を反映（未設定なら空のまま手動必須） */
function applyDefaultFastingFromSelection() {
  if (!selectionNeedsFasting()) {
    state.draft.fasting = "";
    return;
  }
  state.draft.fasting = resolveDefaultFastingFromSelection();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 複合名（例: 肝臓 ＞ ALT・AST / 旧: 肝臓（ALT・AST））に血液項目が含まれるか */
function compositeLabelNeedsFasting(itemLabel) {
  const text = (itemLabel || "").trim();
  if (!text) return false;
  const bloodLeaves = state.examItems.filter(
    (item) =>
      normalizeExamItemCategory(item.category) === "blood" && !isExamGroup(item)
  );
  return bloodLeaves.some((leaf) => {
    const name = (leaf.label || "").trim();
    if (!name) return false;
    if (text === name) return true;
    const re = new RegExp(
      `(?:^|[（・＞>]\\s*)${escapeRegExp(name)}(?:[）・]|$)`
    );
    return re.test(text);
  });
}

function planNeedsFasting(itemLabel) {
  if (state.draft.selectedItems.length) {
    return selectionNeedsFasting();
  }
  const item = findExamItemByLabel(itemLabel);
  if (item) {
    return normalizeExamItemCategory(item.category) === "blood" && !isExamGroup(item);
  }
  if (compositeLabelNeedsFasting(itemLabel)) return true;
  if (!(itemLabel || "").trim()) return false;
  // 追加直後でマスタ未反映のときだけ、血液分類の登録モーダルをフォールバック
  return (
    activeExamCategoryId() === "blood" && Boolean(planModal && !planModal.hidden)
  );
}

function renderPlanSelectionSummary() {
  if (!planSelectionSummary) return;
  syncDraftItemFromSelection();
  const label = (state.draft.item || "").trim();
  const count = state.draft.selectedItems.length;
  if (!count || !label) {
    planSelectionSummary.hidden = true;
    planSelectionSummary.textContent = "";
    return;
  }
  planSelectionSummary.hidden = false;
  planSelectionSummary.textContent =
    count === 1 ? `選択中: ${label}` : `選択中（${count}件）: ${label}`;
}

function activeExamCategoryId() {
  const raw = state.examItemCategory;
  if (raw == null || raw === "") return null;
  return normalizeExamItemCategory(raw);
}

function itemsInActiveCategory(category = activeExamCategoryId()) {
  if (!category) return [];
  const cat = normalizeExamItemCategory(category);
  return state.examItems.filter(
    (item) => normalizeExamItemCategory(item.category) === cat
  );
}

function categorySupportsExamDrilldown(category) {
  const cat = normalizeExamItemCategory(category);
  return cat === "blood" || cat === "imaging";
}

function examGroupsForCategory(category) {
  return itemsInActiveCategory(category).filter((item) => isExamGroup(item));
}

function examRootLeavesForCategory(category) {
  return itemsInActiveCategory(category).filter(
    (item) => !isExamGroup(item) && !(item.parentId || "")
  );
}

function examLeavesForPicker() {
  const cat = activeExamCategoryId();
  if (!cat) return [];
  const items = itemsInActiveCategory(cat);
  if (!categorySupportsExamDrilldown(cat)) {
    return items.filter((item) => !isExamGroup(item));
  }
  if (state.examBloodParentId) {
    return items.filter(
      (item) =>
        !isExamGroup(item) && (item.parentId || "") === state.examBloodParentId
    );
  }
  // 中項目未選択時は大分類直下の具体項目（CBC など）を3列目に出す
  return examRootLeavesForCategory(cat);
}

/** 葉（小項目）を追加できるか */
function canAddExamLeaf() {
  const cat = activeExamCategoryId();
  if (!cat) return false;
  if (!categorySupportsExamDrilldown(cat)) return true;
  return Boolean(state.examBloodParentId);
}

/** 中項目を追加できるか（ドリルダウン大項目を選び、中未選択） */
function canAddExamMidGroup() {
  const cat = activeExamCategoryId();
  if (!cat || !categorySupportsExamDrilldown(cat)) return false;
  return !state.examBloodParentId;
}

function canAddExamMasterItem() {
  return canAddExamLeaf() || canAddExamMidGroup();
}

function createExamLinearItemButton({ label, selected, onClick }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "med-linear-picker__item";
  btn.setAttribute("role", "option");
  btn.setAttribute("aria-selected", String(Boolean(selected)));
  btn.classList.toggle("is-selected", Boolean(selected));

  const text = document.createElement("span");
  text.className = "med-linear-picker__item-label";
  text.textContent = label;

  const check = document.createElement("span");
  check.className = "med-linear-picker__check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";

  btn.append(text, check);
  btn.addEventListener("click", onClick);
  return btn;
}

function askDeleteExamMasterItem(item) {
  if (!item?.id) return;
  const label = (item.label || "").trim() || "この項目";
  requestMasterDelete({
    label,
    performDelete: async () => {
      await deleteExamItem(item.id);
      const removedIds = new Set([item.id]);
      state.examItems
        .filter((row) => row.parentId === item.id)
        .forEach((row) => removedIds.add(row.id));
      state.draft.selectedItems = state.draft.selectedItems.filter(
        (sel) => !removedIds.has(sel.id) && sel.label !== label
      );
      if (state.examBloodParentId === item.id) {
        state.examBloodParentId = null;
      }
      syncDraftItemFromSelection();
      if (!state.draft.selectedItems.length) {
        state.draft.item = "";
        state.draft.fasting = "";
      }
      renderExamLinearPicker();
      renderPlanSelectionSummary();
      renderPlanFastingButtons();
      deps.showToast(`「${label}」をマスタから削除しました。`);
    },
  });
}

function appendExamMasterItem(listEl, item, { selected, open, onSelect, label }) {
  listEl.appendChild(
    createSwipeableMasterPickerItem({
      label: label || item.label,
      selected,
      open,
      onSelect,
      onDelete: () => askDeleteExamMasterItem(item),
    })
  );
}

/** いま中身を開いている中項目。開いていなければ null */
function openExamMidGroup() {
  if (!state.examBloodParentId) return null;
  return (
    state.examItems.find((item) => item.id === state.examBloodParentId) || null
  );
}

/** active=操作可 / placeholder=枠だけ確保 / absent=列ごと非表示（2列レイアウト用） */
function setExamLinearColState(col, mode) {
  if (!col) return;
  if (mode === "absent") {
    col.hidden = true;
    col.classList.remove("is-placeholder");
    col.setAttribute("aria-hidden", "true");
    return;
  }
  col.hidden = false;
  col.classList.toggle("is-placeholder", mode === "placeholder");
  col.setAttribute("aria-hidden", mode === "placeholder" ? "true" : "false");
}

function fillExamLinearPlaceholder(listEl, message) {
  if (!listEl) return;
  listEl.innerHTML = "";
  const hint = document.createElement("p");
  hint.className = "med-linear-picker__hint";
  hint.textContent = message;
  listEl.appendChild(hint);
}

function isExamLeafColActive() {
  return Boolean(
    planColLeaf && !planColLeaf.hidden && !planColLeaf.classList.contains("is-placeholder")
  );
}

function wireFastingButtons(container, onChange) {
  if (!container || container.dataset.wired === "1") return;
  container.dataset.wired = "1";
  container.querySelectorAll("[data-fasting]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.draft.fasting = normalizeExamFasting(btn.dataset.fasting);
      onChange?.();
    });
  });
}

function paintFastingButtons(container, selected) {
  if (!container) return;
  const value = normalizeExamFasting(selected);
  container.querySelectorAll("[data-fasting]").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.fasting === value);
  });
}

function renderPlanFastingButtons() {
  // 実施記録のみのモードでは、絶食は次回予定の絡みでしか使わないため出さない
  if (state.draft.registerMode === "history") {
    if (planFastingField) planFastingField.hidden = true;
    return;
  }
  const hasSelection =
    state.draft.selectedItems.length > 0 || Boolean((state.draft.item || "").trim());
  const needs = hasSelection && planNeedsFasting(state.draft.item);
  if (planFastingField) planFastingField.hidden = !needs;
  paintFastingButtons(planFastingButtons, state.draft.fasting);
}

/** 登録モーダルの保存ボタンに出す文言。モードで意味が変わるため合わせる。 */
function examPlanSaveButtonLabel() {
  return state.draft.registerMode === "history" ? "実施記録を追加" : "保存する";
}

/**
 * 「予定として登録」／「実施記録を追加」の切り替え。
 * history では次回予定セクションを隠し、実施記録セクションを必須の単独フォームにする
 * （電子カルテからの過去データ移行で、同じ項目を何件も追加する場面を想定）。
 */
function setRegisterMode(mode) {
  const isHistory = mode === "history";
  state.draft.registerMode = isHistory ? "history" : "plan";

  btnPlanModePlan?.classList.toggle("is-active", !isHistory);
  btnPlanModePlan?.setAttribute("aria-pressed", String(!isHistory));
  btnPlanModeHistory?.classList.toggle("is-active", isHistory);
  btnPlanModeHistory?.setAttribute("aria-pressed", String(isHistory));

  if (planSectionPlan) planSectionPlan.hidden = isHistory;
  if (planDoneCheckRow) planDoneCheckRow.hidden = isHistory;
  if (planDoneSectionTitle) {
    planDoneSectionTitle.textContent = isHistory
      ? "実施記録を追加"
      : "本日実施した内容の記録（任意）";
  }

  if (isHistory) {
    // history では常に有効な単独フォームとして扱う（チェック不要）
    if (planDoneBlock) {
      planDoneBlock.hidden = false;
      planDoneBlock.classList.remove("is-disabled");
    }
    if (planDoneDate) planDoneDate.disabled = false;
    if (planDoneNote) planDoneNote.disabled = false;
  } else {
    syncPlanDoneBlockVisibility();
  }

  renderPlanFastingButtons();
  if (btnPlanSave && !btnPlanSave.disabled) {
    btnPlanSave.textContent = examPlanSaveButtonLabel();
  }
}

function syncSheetFastingUI() {
  const item = state.draft.item || "";
  const needs = Boolean(item) && planNeedsFasting(item);
  const label = examFastingLabel(state.draft.fasting);
  if (itemSheetFasting) {
    itemSheetFasting.hidden = !label;
    itemSheetFasting.textContent = label ? `絶食：${label}` : "";
  }
  if (sheetFastingField) sheetFastingField.hidden = !needs;
  paintFastingButtons(sheetFastingButtons, state.draft.fasting);
}

/**
 * 検査項目（葉）または中項目（グループ）を選択トグルする。
 * 中項目を選ぶとその名前で確定でき、配下の葉を選ぶと中項目選択は外れる。
 */
function toggleExamItem(item) {
  if (!item) return;
  const ref = toSelectedExamRef(item);
  if (!ref.label) return;

  const idx = state.draft.selectedItems.findIndex((sel) => {
    if (ref.id && sel.id) return sel.id === ref.id;
    return sel.label === ref.label && examItemsShareSlot(sel, ref);
  });

  if (idx >= 0) {
    state.draft.selectedItems.splice(idx, 1);
  } else {
    if (isExamGroup(item)) {
      // 中項目を選ぶときは、その配下の葉選択を外す
      state.draft.selectedItems = state.draft.selectedItems.filter(
        (sel) => sel.parentId !== item.id
      );
    } else if (item.parentId) {
      // 葉を選ぶときは、親の中項目選択を外す
      state.draft.selectedItems = state.draft.selectedItems.filter(
        (sel) => sel.id !== item.parentId
      );
    }
    state.draft.selectedItems.push(ref);
  }

  state.draft.customItem = "";
  if (!state.draft.selectedItems.length) {
    state.draft.item = "";
    state.draft.fasting = "";
  } else {
    syncDraftItemFromSelection();
    if (!selectionNeedsFasting()) {
      state.draft.fasting = "";
    } else {
      applyDefaultFastingFromSelection();
    }
  }

  renderExamLinearPicker();
  renderPlanSelectionSummary();
  renderPlanFastingButtons();
}

function toggleExamLeaf(item) {
  if (!item || isExamGroup(item)) return;
  toggleExamItem(item);
}

function setExamItemAddFormOpen(open) {
  if (planItemAddDefault) planItemAddDefault.hidden = !open;
  if (btnPlanAddToggle) {
    btnPlanAddToggle.setAttribute("aria-expanded", open ? "true" : "false");
    btnPlanAddToggle.textContent = open ? "×" : "＋";
    btnPlanAddToggle.setAttribute(
      "aria-label",
      open ? "追加フォームを閉じる" : "新しい項目を追加"
    );
    btnPlanAddToggle.title = open ? "閉じる" : "新しい項目を追加";
  }
  if (!open) {
    clearExamItemAddInputs();
    deps.showError(planItemError, "");
  } else {
    queueMicrotask(() => planNewItemInput?.focus({ preventScroll: true }));
  }
}

function updateExamItemAddUI() {
  const searching = Boolean(state.examItemSearchMode);
  const category = searching ? null : activeExamCategoryId();
  const canAdd = !searching && canAddExamMasterItem();
  const addingMid = canAddExamMidGroup();
  const inDrillGroup =
    Boolean(category) &&
    categorySupportsExamDrilldown(category) &&
    Boolean(state.examBloodParentId);
  const parent = inDrillGroup
    ? state.examItems.find((item) => item.id === state.examBloodParentId)
    : null;
  const label = category ? examItemCategoryLabel(category) : "";

  if (btnPlanAddToggle) btnPlanAddToggle.hidden = !canAdd;
  if (!canAdd) {
    setExamItemAddFormOpen(false);
  }

  if (planNewItemLabel) {
    planNewItemLabel.textContent = addingMid
      ? `新しい中項目を追加（${label}）`
      : inDrillGroup
        ? `新しい検査項目を追加（${parent?.label || label}）`
        : label
          ? `新しい項目を追加（${label}）`
          : "新しい項目を追加";
  }
  if (planNewItemInput) {
    planNewItemInput.placeholder = addingMid
      ? category === "imaging"
        ? "例）レントゲン"
        : "例）肝臓"
      : inDrillGroup
        ? category === "imaging"
          ? "例）流速あり"
          : "例）ALT"
        : category === "pathology"
          ? "例）病理追加項目"
          : "例）その他の検査";
  }
  if (planItemsEmpty) {
    planItemsEmpty.textContent = canAdd
      ? "この分類にはまだ項目がありません。＋から追加できます。"
      : "この分類にはまだ項目がありません。";
  }
}

function enterExamSearchMode() {
  state.examItemSearchMode = true;
  state.examItemCategory = null;
  state.examBloodParentId = null;
  setExamItemAddFormOpen(false);
  renderExamLinearPicker();
  renderPlanSelectionSummary();
  renderPlanFastingButtons();
  queueMicrotask(() => planSearchInput?.focus({ preventScroll: true }));
}

function exitExamSearchMode({ clearQuery = true } = {}) {
  state.examItemSearchMode = false;
  if (clearQuery) {
    state.examItemSearchQuery = "";
    if (planSearchInput) planSearchInput.value = "";
  }
}

function renderExamSearchResults() {
  if (!planColLeafList) return;
  planColLeafList.innerHTML = "";
  const query = String(state.examItemSearchQuery || "").trim();
  if (!query) {
    fillExamLinearPlaceholder(
      planColLeafList,
      "検査項目名の一部を入力すると候補が表示されます"
    );
    if (planItemsEmpty) planItemsEmpty.hidden = true;
    return;
  }
  const rows = filterExamLeavesByQuery(query, state.examItems);
  if (planItemsEmpty) planItemsEmpty.hidden = true;
  if (!rows.length) {
    fillExamLinearPlaceholder(planColLeafList, "一致する検査項目がありません");
    return;
  }
  rows.forEach((row) => {
    appendExamMasterItem(planColLeafList, row.item, {
      label: row.displayLabel || row.label,
      selected: isExamItemSelected(row.item),
      onSelect: () => toggleExamItem(row.item),
    });
  });
}

function renderExamLinearPicker() {
  const searching = Boolean(state.examItemSearchMode);
  const category = searching ? null : activeExamCategoryId();
  const usesMid = Boolean(category && categorySupportsExamDrilldown(category));
  const midState = searching
    ? "absent"
    : !category
      ? "placeholder"
      : usesMid
        ? "active"
        : "absent";
  // 大項目選択後は右列を操作可能にし、＋で中項目／検査項目を追加できるようにする
  // （is-placeholder だと CSS で ＋ が display:none になる）
  const leafState = searching || category ? "active" : "placeholder";
  const colCount = midState === "absent" ? "2" : "3";

  if (planLinearPicker) planLinearPicker.dataset.cols = colCount;
  setExamLinearColState(planColGroup, midState);
  setExamLinearColState(planColLeaf, leafState);

  if (planSearchWrap) planSearchWrap.hidden = !searching;
  if (planColLeafHeadLabel) {
    planColLeafHeadLabel.textContent = searching ? "検索結果" : "検査項目";
  }
  if (planColLeafList) {
    planColLeafList.setAttribute("aria-label", searching ? "検索結果" : "検査項目");
  }
  if (searching && planSearchInput && planSearchInput.value !== state.examItemSearchQuery) {
    planSearchInput.value = state.examItemSearchQuery || "";
  }

  if (planColCategoryList) {
    planColCategoryList.innerHTML = "";
    EXAM_ITEM_CATEGORIES.forEach((cat) => {
      planColCategoryList.appendChild(
        createExamLinearItemButton({
          label: cat.label,
          selected: !searching && category === cat.id,
          onClick: () => {
            exitExamSearchMode();
            const changed = state.examItemCategory !== cat.id;
            state.examItemCategory = cat.id;
            if (changed) state.examBloodParentId = null;
            // 複数選択は大分類をまたいで保持する
            renderExamLinearPicker();
            renderPlanSelectionSummary();
            renderPlanFastingButtons();
          },
        })
      );
    });
    planColCategoryList.appendChild(
      createExamLinearItemButton({
        label: "検索",
        selected: searching,
        onClick: () => {
          if (searching) {
            queueMicrotask(() => planSearchInput?.focus({ preventScroll: true }));
            return;
          }
          enterExamSearchMode();
        },
      })
    );
  }

  if (planColGroupList) {
    if (midState === "placeholder") {
      fillExamLinearPlaceholder(planColGroupList, "大項目を選ぶと表示されます");
    } else if (midState === "active") {
      planColGroupList.innerHTML = "";
      examGroupsForCategory(category).forEach((group) => {
        appendExamMasterItem(planColGroupList, group, {
          selected: isExamItemSelected(group),
          open: state.examBloodParentId === group.id,
          // 中項目のタップは中身を開くだけ。中項目自体の登録は右列先頭のボタンで行う
          onSelect: () => {
            state.examBloodParentId = group.id;
            renderExamLinearPicker();
          },
        });
      });
    } else {
      planColGroupList.innerHTML = "";
    }
  }

  if (planColLeafList) {
    if (searching) {
      renderExamSearchResults();
    } else if (!category) {
      fillExamLinearPlaceholder(planColLeafList, "大項目を選ぶと表示されます");
      if (planItemsEmpty) planItemsEmpty.hidden = true;
    } else if (
      usesMid &&
      !state.examBloodParentId &&
      examRootLeavesForCategory(category).length === 0
    ) {
      fillExamLinearPlaceholder(
        planColLeafList,
        "中項目を選ぶと表示されます（＋で中項目を追加）"
      );
      if (planItemsEmpty) planItemsEmpty.hidden = true;
    } else {
      planColLeafList.innerHTML = "";
      const openGroup = openExamMidGroup();
      if (openGroup) {
        planColLeafList.appendChild(
          createMasterPickerGroupSelectItem({
            groupLabel: openGroup.label,
            selected: isExamItemSelected(openGroup),
            onSelect: () => toggleExamItem(openGroup),
          })
        );
      }
      const leaves = examLeavesForPicker();
      if (planItemsEmpty) planItemsEmpty.hidden = leaves.length > 0;
      leaves.forEach((item) => {
        appendExamMasterItem(planColLeafList, item, {
          selected: isExamItemSelected(item),
          onSelect: () => toggleExamItem(item),
        });
      });
    }
  }

  updateExamItemAddUI();
  renderPlanSelectionSummary();
  renderPlanFastingButtons();
}

function clearExamItemAddInputs() {
  if (planNewItemInput) planNewItemInput.value = "";
}

function collapseExamItemAddForm() {
  setExamItemAddFormOpen(false);
}

/**
 * 予定登録モーダル内で検査項目マスタへ新規追加する（内訳・画像・その他）。
 */
async function handleAddExamItemFromPlanModal() {
  const category = activeExamCategoryId();
  if (!category || !canAddExamMasterItem()) return;

  const label = planNewItemInput?.value.trim() || "";
  if (!label) {
    deps.showError(planItemError, "項目名を入力してください。");
    return;
  }

  const addingMid = canAddExamMidGroup();
  const kind = addingMid ? "group" : "leaf";
  const parentId =
    !addingMid &&
    categorySupportsExamDrilldown(category) &&
    state.examBloodParentId
      ? state.examBloodParentId
      : "";

  const exists = state.examItems.find(
    (item) =>
      (addingMid ? isExamGroup(item) : !isExamGroup(item)) &&
      (item.label || "").trim() === label &&
      normalizeExamItemCategory(item.category) === category &&
      examItemParentKey(item) === String(parentId || "")
  );
  if (exists) {
    state.examItemCategory = category;
    // ＋から足すのは目の前の記録のためなので、追加した中項目はそのまま選択する
    if (addingMid) {
      state.examBloodParentId = exists.id;
      if (!isExamItemSelected(exists)) toggleExamItem(exists);
      else renderExamLinearPicker();
    } else {
      state.examBloodParentId = parentId || null;
      if (!isExamItemSelected(exists)) toggleExamItem(exists);
      else renderExamLinearPicker();
    }
    collapseExamItemAddForm();
    deps.showError(planItemError, "");
    deps.showToast(
      addingMid ? "既存の中項目を選択しました。" : "既存の項目を選択しました。"
    );
    return;
  }

  deps.showError(planItemError, "");
  deps.setBusy(btnPlanAddItem, true, "追加中...", "追加");
  try {
    const createdId = await addExamItem({ label, category, kind, parentId });
    const createdRef = toSelectedExamRef({
      id: createdId || "",
      label,
      category,
      kind,
      parentId,
      order: Date.now(),
    });
    if (addingMid) {
      state.examBloodParentId = createdId || null;
    }
    // ＋から足すのは目の前の記録のためなので、追加した項目はそのまま選択する
    if (!isExamItemSelected(createdRef)) {
      if (addingMid) {
        state.draft.selectedItems = state.draft.selectedItems.filter(
          (sel) => sel.parentId !== createdId
        );
      } else if (parentId) {
        state.draft.selectedItems = state.draft.selectedItems.filter(
          (sel) => sel.id !== parentId
        );
      }
      state.draft.selectedItems.push(createdRef);
      syncDraftItemFromSelection();
      applyDefaultFastingFromSelection();
    }
    collapseExamItemAddForm();
    renderExamLinearPicker();
    const parent = parentId
      ? state.examItems.find((item) => item.id === parentId)
      : null;
    const place = addingMid
      ? `${examItemCategoryLabel(category)}（中項目）`
      : parent?.label
        ? `${examItemCategoryLabel(category)}／${parent.label}`
        : examItemCategoryLabel(category);
    deps.showToast(`「${label}」を${place}に追加しました。`);
  } catch (err) {
    console.error(err);
    deps.showError(planItemError, "追加に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnPlanAddItem, false, "追加中...", "追加");
  }
}

function updateWindowNote() {
  const date = isSheetOpen()
    ? sheetDueDate?.value || state.draft.dueDate
    : planDueDate?.value || state.draft.dueDate || sheetDueDate?.value;
  const noteEls = [planWindowNote, sheetWindowNote].filter(Boolean);
  noteEls.forEach((el) => {
    if (!date) {
      el.textContent = "";
      el.className = "field__note";
      el.hidden = true;
      return;
    }
    const baseline = state.draft.baselineDate || todayStr();
    const info = getDueCountdown(date, baseline);
    el.hidden = false;
    el.textContent = `予定日: ${formatDueCountdown(info)}`;
    el.className = `field__note ${dueLevelClass(info?.level || "far")}`;
  });
}

function openPlanModal(mode, { planId = null, preset = null } = {}) {
  // 編集は詳細シートへ統合済み
  if (mode === "edit") {
    const id = planId || state.editingPlanId;
    const plan = id ? state.plan?.plans?.[id] : null;
    if (plan) {
      openExamItemSheet({
        id,
        item: plan.item,
        dueDate: getPlanDueDate(plan),
        note: plan.note || "",
        fasting: normalizeExamFasting(plan.fasting),
        countdown: getDueCountdown(getPlanDueDate(plan), getPlanBaselineDate(plan)),
      });
    }
    return;
  }

  state.draft.mode = mode;
  state.editingPlanId = null;
  state.examBloodParentId = null;
  state.draft.selectedItems = [];
  exitExamSearchMode();

  if (preset) {
    if (planModalTitle) planModalTitle.textContent = "次の予定を登録";
    state.draft.item = preset.item || "";
    state.draft.customItem = "";
    state.draft.dueDate = preset.dueDate || "";
    state.draft.note = preset.note || "";
    state.draft.fasting = normalizeExamFasting(preset.fasting);
    state.draft.baselineDate = preset.baselineDate || todayStr();
    const matched = findExamItemByLabel(state.draft.item);
    if (matched && !isExamGroup(matched)) {
      state.draft.selectedItems = [toSelectedExamRef(matched)];
      syncDraftItemFromSelection();
    }
  } else {
    if (planModalTitle) planModalTitle.textContent = "検査を登録";
    state.draft.item = "";
    state.draft.customItem = "";
    state.draft.dueDate = "";
    state.draft.note = "";
    state.draft.fasting = "";
    state.draft.baselineDate = todayStr();
  }

  collapseExamItemAddForm();
  deps.showError(planItemError, "");
  if (planDueDate) planDueDate.value = state.draft.dueDate;
  if (planNote) planNote.value = state.draft.note;
  // 完了直後の「次の予定」は予定専用の流れなので、切り替えは出さない
  if (planModeToggle) planModeToggle.hidden = mode === "afterComplete";
  setRegisterMode("plan");
  resetPlanDoneFields(mode);
  if (state.draft.dueDate) {
    syncRelativeFromCalendar(state.draft.dueDate);
  } else {
    resetDraftDueRelative();
    syncDueRelativeUI();
  }
  deps.showError(planError, "");
  // 選択済み項目があればその分類／親グループを開く。なければ大分類未選択から開始
  if (state.draft.selectedItems.length === 1) {
    const sel = state.draft.selectedItems[0];
    state.examItemCategory = normalizeExamItemCategory(sel.category);
    state.examBloodParentId = sel.parentId || null;
  } else if (state.draft.item) {
    const matched = findExamItemByLabel(state.draft.item);
    if (matched) {
      state.examItemCategory = normalizeExamItemCategory(matched.category);
      state.examBloodParentId = matched.parentId || null;
    } else {
      state.examItemCategory = null;
      state.examBloodParentId = null;
    }
  } else {
    state.examItemCategory = null;
    state.examBloodParentId = null;
  }
  renderExamLinearPicker();
  updateWindowNote();
  if (planModal) planModal.hidden = false;
}

function resetPlanDoneFields(mode) {
  // 完了直後の「次の予定」では実施履歴は既に記録済みなので出さない
  const showDone = mode !== "afterComplete";
  if (planDoneField) planDoneField.hidden = !showDone;
  if (planDoneCheck) planDoneCheck.checked = false;
  if (planDoneDate) planDoneDate.value = todayStr();
  if (planDoneNote) planDoneNote.value = "";
  syncPlanDoneBlockVisibility();
}

function syncPlanDoneBlockVisibility() {
  const on = Boolean(planDoneCheck?.checked);
  // 実施日欄は常に見せ、チェックOFF時は無効化する（スクロールなしで到達できるように）
  if (planDoneBlock) {
    planDoneBlock.hidden = false;
    planDoneBlock.classList.toggle("is-disabled", !on);
  }
  if (planDoneDate) planDoneDate.disabled = !on;
  if (planDoneNote) planDoneNote.disabled = !on;
}

function closePlanModal() {
  if (planModal) planModal.hidden = true;
  state.editingPlanId = null;
  state.examItemCategory = null;
  state.examBloodParentId = null;
  state.draft.selectedItems = [];
  state.draft.registerMode = "plan";
}

async function handlePlanSave() {
  syncDraftItemFromSelection();
  const item = (state.draft.item || "").trim();

  if (!item) {
    deps.showError(planError, "検査項目を選ぶか、新しい項目を追加してください。");
    return;
  }

  // 実施記録のみのモードでは、予定を経由せず履歴だけを追加する
  if (state.draft.registerMode === "history") {
    await handleHistoryOnlySave(item);
    return;
  }

  const dueBuffered = Number(state.draft.dueRelativeBuffer);
  if (state.draft.dueRelativeBuffer !== "" && dueBuffered >= 1) {
    applyDueRelativeToCalendar();
  }
  const dueDate = planDueDate?.value || "";
  const note = planNote?.value.trim() || "";
  const fasting = planNeedsFasting(item)
    ? normalizeExamFasting(state.draft.fasting)
    : "";
  const saveDoneHistory =
    Boolean(planDoneCheck?.checked) &&
    planDoneField &&
    !planDoneField.hidden;
  const doneDate = planDoneDate?.value || "";
  const doneNote = planDoneNote?.value.trim() || "";
  // 次回予定と実施記録は独立。どちらか一方、または両方で保存できる。
  const savePlan = Boolean(dueDate);

  if (!savePlan && !saveDoneHistory) {
    deps.showError(
      planError,
      "次回予定日を入力するか、「実施履歴に登録する」にチェックしてください。"
    );
    return;
  }
  if (savePlan && planNeedsFasting(item) && !fasting) {
    deps.showError(planError, "絶食の要不要を選んでください。");
    return;
  }
  if (saveDoneHistory && !doneDate) {
    deps.showError(planError, "実施日を選択してください。");
    return;
  }

  deps.showError(planError, "");
  deps.setBusy(btnPlanSave, true, "保存中...", "保存する");

  try {
    if (savePlan) {
      const keepBaseline = state.draft.baselineDate || todayStr();
      await saveExamScheduledPlan(state.karteNumber, {
        planId: state.draft.mode === "edit" ? state.editingPlanId : null,
        item,
        dueDate,
        note,
        fasting,
        baselineDate: keepBaseline,
      });
    }

    if (saveDoneHistory) {
      await addExamHistory(state.karteNumber, {
        item,
        date: doneDate,
        note: doneNote,
      });
    }

    closePlanModal();
    deps.showToast(
      savePlan && saveDoneHistory
        ? "予定と当日の実施内容を保存しました。"
        : saveDoneHistory
          ? "実施内容を保存しました。"
          : "予定を保存しました。"
    );
  } catch (err) {
    console.error(err);
    deps.showError(planError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnPlanSave, false, "保存中...", "保存する");
  }
}

/**
 * 「実施記録を追加」モードの保存。予定は作らず、選んだ項目の実施履歴にだけ積む。
 * 電子カルテからの過去データ移行で同じ項目を何件も追加する場面を想定し、
 * 保存後もモーダルは開いたままにして、日付を変えて続けて登録できるようにする。
 */
async function handleHistoryOnlySave(item) {
  const doneDate = planDoneDate?.value || "";
  const doneNote = planDoneNote?.value.trim() || "";

  if (!doneDate) {
    deps.showError(planError, "実施日を選択してください。");
    return;
  }

  deps.showError(planError, "");
  deps.setBusy(btnPlanSave, true, "追加中...", examPlanSaveButtonLabel());

  try {
    await addExamHistory(state.karteNumber, {
      item,
      date: doneDate,
      note: doneNote,
    });
    deps.showToast("実施記録を追加しました。");
    if (planDoneNote) planDoneNote.value = "";
    planDoneNote?.focus();
  } catch (err) {
    console.error(err);
    deps.showError(planError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnPlanSave, false, "追加中...", examPlanSaveButtonLabel());
  }
}

// --- 完了フロー -----------------------------------------------------------

function wireCompleteModal() {
  btnCloseCompleteModal?.addEventListener("click", closeCompleteModal);
  btnCompleteCancel?.addEventListener("click", closeCompleteModal);
  completeModal?.querySelector("[data-close-modal]")?.addEventListener("click", closeCompleteModal);
  btnCompleteSave?.addEventListener("click", handleCompleteSave);
}

function openCompleteModal(planId) {
  const id = planId || state.activePlanId;
  if (!id || !state.plan?.plans?.[id]) return;
  state.activePlanId = id;
  if (completeDate) completeDate.value = todayStr();
  if (completeNote) completeNote.value = "";
  deps.showError(completeError, "");
  if (completeModal) completeModal.hidden = false;
}

function closeCompleteModal() {
  if (completeModal) completeModal.hidden = true;
}

async function handleCompleteSave() {
  const planId = state.activePlanId;
  const plan = planId ? state.plan?.plans?.[planId] : null;
  if (!plan || !planId) return;

  const date = completeDate?.value || "";
  const note = completeNote?.value.trim() || "";
  if (!date) {
    deps.showError(completeError, "実施日を選択してください。");
    return;
  }

  deps.showError(completeError, "");
  deps.setBusy(btnCompleteSave, true, "保存中...", "完了として記録");

  try {
    await addExamHistory(state.karteNumber, {
      item: plan.item,
      date,
      note,
    });
    await deleteExamScheduledPlan(state.karteNumber, planId);
    state.activePlanId = null;
    closeCompleteModal();
    deps.showToast("実施を記録しました。");
    openAfterModal({
      item: plan.item,
      dueDate: "",
      baselineDate: date,
    });
  } catch (err) {
    console.error(err);
    deps.showError(completeError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnCompleteSave, false, "保存中...", "完了として記録");
  }
}

function wireAfterModal() {
  btnCloseAfterModal?.addEventListener("click", () => closeAfterModal());
  btnAfterEnd?.addEventListener("click", () => closeAfterModal());
  btnAfterNext?.addEventListener("click", () => {
    const preset = afterModal?._preset || null;
    closeAfterModal();
    openPlanModal("afterComplete", { preset: preset || undefined });
  });
  afterModal?.querySelector("[data-close-modal]")?.addEventListener("click", () =>
    closeAfterModal()
  );
}

function openAfterModal(preset) {
  if (!afterModal) return;
  afterModal._preset = preset || null;
  if (afterSummary) {
    afterSummary.hidden = true;
    afterSummary.textContent = "";
  }
  if (btnAfterNext) btnAfterNext.textContent = "次の予定を入力する";
  afterModal.hidden = false;
}

function closeAfterModal() {
  if (afterModal) {
    afterModal.hidden = true;
    afterModal._preset = null;
  }
}

/**
 * AI提案フローなど外部からの予定登録。
 */
export async function addExamPlanFromExternal(
  karteNumber,
  { item, dueDate, note, baselineDate, source }
) {
  if (!dueDate) throw new Error("検査予定の日付が不正です。");
  await saveExamScheduledPlan(karteNumber, {
    item: item || "",
    dueDate,
    note: note || "",
    baselineDate: baselineDate || todayStr(),
    source: source === "ai" ? "ai" : undefined,
  });
}

/**
 * 検査項目マスタの現在スナップショット（subscribe 反映済み）。
 * AI提案の照合フォールバック用。
 */
export function getExamItemsSnapshot() {
  return Array.isArray(state.examItems) ? state.examItems.slice() : [];
}

/**
 * 予定IDを指定して既存の検査予定シートを開く（状態モードなど別画面から使う）。
 * 右カラムのタブは切り替えない。
 */
export function openExamPlanEditorById(planId) {
  if (!state.plan) return false;
  const entry = collectUnifiedPlanEntries().find((e) => e.id === planId);
  if (!entry) return false;
  openExamItemSheet(entry);
  return true;
}

/** カルテ内検索用: 検査予定・実施履歴の横断テキスト源 */
export function getExamSearchItems() {
  if (!state.plan) return [];
  const out = [];
  Object.entries(state.plan.plans || {}).forEach(([id, p]) => {
    if (!p) return;
    out.push({
      id,
      kind: "plan",
      kindLabel: "検査予定",
      item: p.item || "",
      note: p.note || "",
      date: p.dueDate || p.baselineDate || "",
    });
  });
  Object.entries(state.plan.history || {}).forEach(([id, h]) => {
    if (!h) return;
    out.push({
      id,
      kind: "history",
      kindLabel: "検査実施",
      item: h.item || "",
      note: h.note || "",
      date: h.date || "",
    });
  });
  return out;
}

/** カルテ内検索の結果から検査タブへジャンプ */
export function focusExamSearchTarget({ kind, id, itemName } = {}) {
  switchTab("exam");
  if (!state.plan) return false;
  const flash = (el) => {
    if (!el) return;
    el.classList.add("is-search-target");
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      /* ignore */
    }
    setTimeout(() => el.classList.remove("is-search-target"), 1600);
  };

  if (kind === "plan" && id) {
    const entry = collectUnifiedPlanEntries().find((e) => e.id === id);
    if (entry) openExamItemSheet(entry);
    queueMicrotask(() => flash(planList?.querySelector(`[data-plan-id="${CSS.escape(id)}"]`)));
    return true;
  }

  if (kind === "history") {
    const byId = id
      ? historyList?.querySelector(`[data-history-id="${CSS.escape(id)}"]`)
      : null;
    if (byId) {
      flash(byId);
      return true;
    }
    if (itemName) {
      const group = historyList?.querySelector(
        `[data-history-group="${CSS.escape(itemName)}"]`
      );
      flash(group);
      return Boolean(group);
    }
  }
  return false;
}
