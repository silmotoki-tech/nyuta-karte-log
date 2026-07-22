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
  deleteExamHistory,
  addExamItem,
  updateExamItem,
  deleteExamItem,
} from "./db.js";
import { enableRowGestures } from "./row-gestures.js";

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
  unsubscribePlan: null,
  unsubscribeItems: null,
  activeTab: "exam",
  activePlanId: null,
  editingPlanId: null,
  // 予定編集フォームの下書き
  draft: {
    item: "",
    customItem: "",
    dueDate: "",
    note: "",
    baselineDate: null,
    dueRelativeUnit: "day",
    dueRelativeValue: 0,
    dueRelativeBuffer: "",
    mode: "create", // create | edit | afterComplete
  },
  editingExamItemId: null,
  /** カレンダー↔相対の同期ループ防止 */
  syncingDueFromRelative: false,
};

// --- DOM -----------------------------------------------------------------

const rightTabs = document.getElementById("right-tabs");
const rightPanels = document.querySelectorAll(".right-panel");
const rightEmpty = document.getElementById("right-empty");

const examRoot = document.getElementById("panel-exam");
const btnExamNew = document.getElementById("btn-exam-new");

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

const btnOpenExamItems = document.getElementById("btn-open-exam-items");

const planModal = document.getElementById("exam-plan-modal");
const planModalTitle = document.getElementById("exam-plan-modal-title");
const planItemButtons = document.getElementById("exam-plan-item-buttons");
const planOtherCheck = document.getElementById("exam-plan-other");
const planCustomItem = document.getElementById("exam-plan-custom-item");
const planDueDate = document.getElementById("exam-plan-due-date");
const planDueUnits = document.getElementById("exam-plan-due-units");
const planDueDisplay = document.getElementById("exam-plan-due-display");
const planDueNumpad = document.getElementById("exam-plan-due-numpad");
const planWindowNote = document.getElementById("exam-plan-window-note");
const planNote = document.getElementById("exam-plan-note");
const planError = document.getElementById("exam-plan-error");
const btnPlanSave = document.getElementById("btn-exam-plan-save");
const btnPlanCancel = document.getElementById("btn-exam-plan-cancel");
const btnClosePlanModal = document.getElementById("btn-close-exam-plan");

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

const examItemsModal = document.getElementById("exam-items-modal");
const examItemsList = document.getElementById("exam-items-list");
const examItemsListEmpty = document.getElementById("exam-items-list-empty");
const examItemLabelInput = document.getElementById("exam-item-label-input");
const examItemError = document.getElementById("exam-item-error");
const examItemEditorTitle = document.getElementById("exam-item-editor-title");
const btnExamItemSave = document.getElementById("btn-exam-item-save");
const btnExamItemCancel = document.getElementById("btn-exam-item-cancel");
const btnCloseExamItems = document.getElementById("btn-close-exam-items");

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
 * 「あと○日（日付）」／「○日超過（日付）」
 */
export function formatDueCountdown(info) {
  if (!info) return "";
  const dateLabel = ymdFromStr(info.dueDate);
  if (info.remaining < 0) {
    return `${Math.abs(info.remaining)}日超過（${dateLabel}）`;
  }
  if (info.remaining === 0) {
    return `本日期日（${dateLabel}）`;
  }
  return `あと${info.remaining}日（${dateLabel}）`;
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
  wireExamItemsModal();
  buildPlanDueRelativeUI();

  state.unsubscribeItems = subscribeExamItems((items) => {
    state.examItems = items;
    renderPlanItemButtons();
    if (!examItemsModal?.hidden) renderExamItemsList();
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
  // カルテ未オープン時は案内メッセージのみ表示
  if (!state.karteNumber) {
    rightPanels.forEach((panel) => {
      panel.hidden = true;
    });
    return;
  }
  rightPanels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tabId;
  });
}

/** AI提案など外部から右カラムタブを開く */
export function switchRightTab(tabId) {
  switchTab(tabId);
}

function showRightEmpty(empty) {
  if (rightEmpty) rightEmpty.hidden = !empty;
  examRoot?.classList.toggle("is-disabled", empty);
  if (empty) {
    rightPanels.forEach((p) => {
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

    const info = document.createElement("div");
    info.className = "exam-list-item__info";
    const title = document.createElement("div");
    title.className = "exam-list-item__title";
    title.textContent = entry.item;
    const dueEl = document.createElement("div");
    dueEl.className = `exam-list-item__due ${dueLevelClass(entry.countdown?.level || "far")}`;
    if (entry.countdown) {
      dueEl.textContent = formatDueCountdown(entry.countdown);
    } else {
      dueEl.textContent = "予定日未設定";
      dueEl.className = "exam-list-item__due";
    }
    info.append(title, dueEl);
    if (entry.note) {
      const noteEl = document.createElement("div");
      noteEl.className = "exam-list-item__meta";
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
  state.draft.baselineDate = plan.baselineDate || getPlanBaselineDate(plan) || null;

  if (itemSheetTitle) itemSheetTitle.textContent = "検査予定";
  if (itemSheetItem) itemSheetItem.textContent = state.draft.item || "（項目未設定）";
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

  // 項目名ごとにグループ化
  const groups = new Map();
  items.forEach((h) => {
    const key = h.item || "（項目未設定）";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  });

  // グループ見出しは項目名順
  const groupKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  groupKeys.forEach((itemName) => {
    const groupItems = groups.get(itemName);
    // 新しい順
    groupItems.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const heading = document.createElement("li");
    heading.className = "exam-history-group-title";
    const headingLabel = document.createElement("div");
    headingLabel.className = "exam-history-group-title__label";
    headingLabel.textContent = `${itemName} - 実施履歴`;
    const headingHint = document.createElement("div");
    headingHint.className = "exam-history-group-title__hint";
    headingHint.textContent = findActivePlanByItemName(itemName)
      ? "予定一覧に表示中"
      : "左スワイプで予定に戻す";
    heading.append(headingLabel, headingHint);
    enableRowGestures(heading, {
      actions: [
        {
          action: "refresh",
          title: "予定に戻す",
          onClick: () => handleReviveFromHistory(itemName),
        },
      ],
    });
    historyList.appendChild(heading);

    // 古い順配列（ギャップ計算用）
    const oldestFirst = [...groupItems].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "")
    );
    const oldestId = oldestFirst[0]?.id;

    groupItems.forEach((h) => {
      const li = document.createElement("li");
      li.className = "exam-list-item";

      const info = document.createElement("div");
      info.className = "exam-list-item__info";
      const title = document.createElement("div");
      title.className = "exam-list-item__title";
      let titleText = h.date ? ymdFromStr(h.date) : "（日付未設定）";
      if (h.id !== oldestId && h.date) {
        const idx = oldestFirst.findIndex((x) => x.id === h.id);
        const prevOlder = idx > 0 ? oldestFirst[idx - 1] : null;
        if (prevOlder?.date) {
          titleText += formatHistoryGapLabel(prevOlder.date, h.date);
        }
      }
      title.textContent = titleText;
      const meta = document.createElement("div");
      meta.className = "exam-list-item__meta";
      meta.textContent = h.note || "";
      info.appendChild(title);
      if (h.note) info.appendChild(meta);
      li.appendChild(info);

      enableRowGestures(li, {
        actions: [
          {
            action: "refresh",
            title: "予定に戻す",
            onClick: () => handleReviveFromHistory(itemName, h.note || ""),
          },
          {
            action: "delete",
            title: "削除",
            onClick: async () => {
              const ok = window.confirm(
                `履歴「${itemName}（${ymdFromStr(h.date)}）」を削除しますか？`
              );
              if (!ok) return;
              try {
                await deleteExamHistory(state.karteNumber, h.id);
                deps.showToast("履歴を削除しました。");
              } catch (err) {
                console.error(err);
                deps.showToast("削除に失敗しました。", { isError: true });
              }
            },
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
  btnOpenExamItems?.addEventListener("click", openExamItemsModal);
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
  sheetDueDate?.addEventListener("change", () => {
    if (state.syncingDueFromRelative) return;
    state.draft.dueDate = sheetDueDate.value;
    syncRelativeFromCalendar(sheetDueDate.value);
    updateWindowNote();
  });
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

  if (!dueDate) {
    deps.showError(sheetError, "日付を選択してください。");
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

  planOtherCheck?.addEventListener("change", () => {
    planCustomItem.hidden = !planOtherCheck.checked;
    if (planOtherCheck.checked) {
      state.draft.item = "";
      renderPlanItemButtons();
      planCustomItem.focus();
    }
  });

  planDueDate?.addEventListener("change", () => {
    if (state.syncingDueFromRelative) return;
    state.draft.dueDate = planDueDate.value;
    syncRelativeFromCalendar(planDueDate.value);
    updateWindowNote();
  });
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

function renderPlanItemButtons() {
  if (!planItemButtons) return;
  planItemButtons.innerHTML = "";
  state.examItems.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.textContent = item.label;
    btn.classList.toggle(
      "is-selected",
      !planOtherCheck?.checked && state.draft.item === item.label
    );
    btn.addEventListener("click", () => {
      if (planOtherCheck) planOtherCheck.checked = false;
      if (planCustomItem) planCustomItem.hidden = true;
      state.draft.item = item.label;
      state.draft.customItem = "";
      renderPlanItemButtons();
    });
    planItemButtons.appendChild(btn);
  });
}

function updateWindowNote() {
  const date = isSheetOpen()
    ? sheetDueDate?.value || state.draft.dueDate
    : planDueDate?.value || state.draft.dueDate || sheetDueDate?.value;
  const noteEls = [planWindowNote, sheetWindowNote].filter(Boolean);
  noteEls.forEach((el) => {
    if (!date) {
      el.textContent = "予定日を選ぶと、残り日数が表示されます。";
      el.className = "field__note";
      return;
    }
    const baseline = state.draft.baselineDate || todayStr();
    const info = getDueCountdown(date, baseline);
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
        countdown: getDueCountdown(getPlanDueDate(plan), getPlanBaselineDate(plan)),
      });
    }
    return;
  }

  state.draft.mode = mode;
  state.editingPlanId = null;

  if (preset) {
    if (planModalTitle) planModalTitle.textContent = "次の予定を登録";
    state.draft.item = preset.item || "";
    state.draft.customItem = "";
    state.draft.dueDate = preset.dueDate || "";
    state.draft.note = preset.note || "";
    state.draft.baselineDate = preset.baselineDate || todayStr();
  } else {
    if (planModalTitle) planModalTitle.textContent = "予定を登録";
    state.draft.item = "";
    state.draft.customItem = "";
    state.draft.dueDate = "";
    state.draft.note = "";
    state.draft.baselineDate = todayStr();
  }

  if (planOtherCheck) planOtherCheck.checked = false;
  if (planCustomItem) {
    planCustomItem.hidden = true;
    planCustomItem.value = "";
  }
  if (planDueDate) planDueDate.value = state.draft.dueDate;
  if (planNote) planNote.value = state.draft.note;
  if (state.draft.dueDate) {
    syncRelativeFromCalendar(state.draft.dueDate);
  } else {
    resetDraftDueRelative();
    syncDueRelativeUI();
  }
  deps.showError(planError, "");
  renderPlanItemButtons();
  updateWindowNote();
  if (planModal) planModal.hidden = false;
}

function closePlanModal() {
  if (planModal) planModal.hidden = true;
  state.editingPlanId = null;
}

async function handlePlanSave() {
  let item = state.draft.item;
  if (planOtherCheck?.checked) {
    item = planCustomItem?.value.trim() || "";
  }
  const dueBuffered = Number(state.draft.dueRelativeBuffer);
  if (state.draft.dueRelativeBuffer !== "" && dueBuffered >= 1) {
    applyDueRelativeToCalendar();
  }
  const dueDate = planDueDate?.value || "";
  const note = planNote?.value.trim() || "";

  if (!item) {
    deps.showError(planError, "検査項目を選択するか、「その他」で入力してください。");
    return;
  }
  if (!dueDate) {
    deps.showError(planError, "日付を選択してください。");
    return;
  }

  deps.showError(planError, "");
  deps.setBusy(btnPlanSave, true, "保存中...", "保存する");

  try {
    const keepBaseline = state.draft.baselineDate || todayStr();
    await saveExamScheduledPlan(state.karteNumber, {
      planId: state.draft.mode === "edit" ? state.editingPlanId : null,
      item,
      dueDate,
      note,
      baselineDate: keepBaseline,
    });

    closePlanModal();
    deps.showToast("予定を保存しました。");
  } catch (err) {
    console.error(err);
    deps.showError(planError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnPlanSave, false, "保存中...", "保存する");
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

// --- 検査項目マスタ管理 ---------------------------------------------------

function wireExamItemsModal() {
  btnCloseExamItems?.addEventListener("click", closeExamItemsModal);
  examItemsModal?.querySelector("[data-close-modal]")?.addEventListener("click", closeExamItemsModal);
  btnExamItemSave?.addEventListener("click", handleExamItemSave);
  btnExamItemCancel?.addEventListener("click", resetExamItemEditor);
}

function openExamItemsModal() {
  resetExamItemEditor();
  renderExamItemsList();
  if (examItemsModal) examItemsModal.hidden = false;
}

function closeExamItemsModal() {
  if (examItemsModal) examItemsModal.hidden = true;
}

function renderExamItemsList() {
  if (!examItemsList) return;
  examItemsList.innerHTML = "";
  if (examItemsListEmpty) examItemsListEmpty.hidden = state.examItems.length > 0;

  state.examItems.forEach((item) => {
    const li = document.createElement("li");
    li.className = "tpl-list-item";

    const info = document.createElement("div");
    info.className = "tpl-list-item__info";
    const label = document.createElement("div");
    label.className = "tpl-list-item__label";
    label.textContent = item.label || "(名称未設定)";
    info.appendChild(label);

    li.appendChild(info);
    enableRowGestures(li, {
      actions: [
        {
          action: "edit",
          title: "編集",
          onClick: () => {
            state.editingExamItemId = item.id;
            if (examItemEditorTitle) examItemEditorTitle.textContent = "検査項目を編集";
            if (examItemLabelInput) examItemLabelInput.value = item.label || "";
            if (btnExamItemSave) btnExamItemSave.textContent = "更新する";
            if (btnExamItemCancel) btnExamItemCancel.hidden = false;
            deps.showError(examItemError, "");
            examItemLabelInput?.focus();
          },
        },
        {
          action: "delete",
          title: "削除",
          onClick: async () => {
            const ok = window.confirm(`検査項目「${item.label}」を削除しますか？`);
            if (!ok) return;
            try {
              await deleteExamItem(item.id);
              if (state.editingExamItemId === item.id) resetExamItemEditor();
              deps.showToast("検査項目を削除しました。");
            } catch (err) {
              console.error(err);
              deps.showToast("削除に失敗しました。", { isError: true });
            }
          },
        },
      ],
    });
    examItemsList.appendChild(li);
  });
}

function resetExamItemEditor() {
  state.editingExamItemId = null;
  if (examItemEditorTitle) examItemEditorTitle.textContent = "新しい検査項目を追加";
  if (examItemLabelInput) examItemLabelInput.value = "";
  if (btnExamItemSave) btnExamItemSave.textContent = "追加する";
  if (btnExamItemCancel) btnExamItemCancel.hidden = true;
  deps.showError(examItemError, "");
}

async function handleExamItemSave() {
  const label = examItemLabelInput?.value.trim() || "";
  if (!label) {
    deps.showError(examItemError, "項目名を入力してください。");
    return;
  }
  deps.showError(examItemError, "");
  const editingId = state.editingExamItemId;
  deps.setBusy(btnExamItemSave, true, "保存中...", editingId ? "更新する" : "追加する");
  try {
    if (editingId) {
      await updateExamItem(editingId, { label });
      deps.showToast("検査項目を更新しました。");
    } else {
      await addExamItem({ label });
      deps.showToast("検査項目を追加しました。");
    }
    resetExamItemEditor();
  } catch (err) {
    console.error(err);
    deps.showError(examItemError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(
      btnExamItemSave,
      false,
      "保存中...",
      state.editingExamItemId ? "更新する" : "追加する"
    );
  }
}

/**
 * AI提案フローなど外部からの予定登録。
 */
export async function addExamPlanFromExternal(karteNumber, { item, dueDate, note, baselineDate }) {
  if (!dueDate) throw new Error("検査予定の日付が不正です。");
  await saveExamScheduledPlan(karteNumber, {
    item: item || "",
    dueDate,
    note: note || "",
    baselineDate: baselineDate || todayStr(),
  });
}
