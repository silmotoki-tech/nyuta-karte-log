// 右カラム「検査予定」タブのUIと操作ロジック。
// AI解析には頼らず、手動操作で完結する。

import {
  subscribeExamPlan,
  subscribeExamItems,
  setNextExamPlan,
  clearNextExamPlan,
  addExamHistory,
  deleteExamHistory,
  addExamRecurring,
  updateExamRecurring,
  deleteExamRecurring,
  addExamItem,
  updateExamItem,
  deleteExamItem,
} from "./db.js";

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
  // 予定編集フォームの下書き
  draft: {
    item: "",
    customItem: "",
    dueDate: "",
    note: "",
    recurringId: null,
    enableRecurring: false,
    baselineDate: null,
    intervalUnit: "month",
    intervalValue: 3,
    intervalBuffer: "3",
    dueRelativeUnit: "day",
    dueRelativeValue: 0,
    dueRelativeBuffer: "",
    mode: "create", // create | edit | afterComplete
  },
  editingExamItemId: null,
  editingRecurringId: null,
  editInterval: {
    unit: "month",
    value: 3,
    buffer: "3",
  },
  /** カレンダー↔相対の同期ループ防止 */
  syncingDueFromRelative: false,
};

// --- DOM -----------------------------------------------------------------

const rightTabs = document.getElementById("right-tabs");
const rightPanels = document.querySelectorAll(".right-panel");
const rightEmpty = document.getElementById("right-empty");

const examRoot = document.getElementById("panel-exam");
const nextPlanCard = document.getElementById("exam-next-card");
const nextPlanEmpty = document.getElementById("exam-next-empty");
const nextPlanBody = document.getElementById("exam-next-body");
const nextPlanAlert = document.getElementById("exam-next-alert");
const nextPlanItem = document.getElementById("exam-next-item");
const nextPlanDate = document.getElementById("exam-next-date");
const nextPlanNote = document.getElementById("exam-next-note");
const btnExamComplete = document.getElementById("btn-exam-complete");
const btnExamEnd = document.getElementById("btn-exam-end");
const btnExamEdit = document.getElementById("btn-exam-edit");
const btnExamNew = document.getElementById("btn-exam-new");

const recurringList = document.getElementById("exam-recurring-list");
const recurringEmpty = document.getElementById("exam-recurring-empty");
const btnRecurringAdd = document.getElementById("btn-exam-recurring-add");

const historyList = document.getElementById("exam-history-list");
const historyEmpty = document.getElementById("exam-history-empty");

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
const planRecurringCheck = document.getElementById("exam-plan-enable-recurring");
const planIntervalUnits = document.getElementById("exam-plan-interval-units");
const planIntervalDisplay = document.getElementById("exam-plan-interval-display");
const planIntervalNumpad = document.getElementById("exam-plan-interval-numpad");
const planRecurringFields = document.getElementById("exam-plan-recurring-fields");
const planError = document.getElementById("exam-plan-error");
const btnPlanSave = document.getElementById("btn-exam-plan-save");
const btnPlanCancel = document.getElementById("btn-exam-plan-cancel");
const btnClosePlanModal = document.getElementById("btn-close-exam-plan");

const recurringEditModal = document.getElementById("exam-recurring-edit-modal");
const recurringEditItem = document.getElementById("exam-recurring-edit-item");
const recurringIntervalUnits = document.getElementById("exam-recurring-interval-units");
const recurringIntervalDisplay = document.getElementById("exam-recurring-interval-display");
const recurringIntervalNumpad = document.getElementById("exam-recurring-interval-numpad");
const recurringLastDone = document.getElementById("exam-recurring-last-done");
const recurringEditError = document.getElementById("exam-recurring-edit-error");
const btnRecurringEditSave = document.getElementById("btn-exam-recurring-edit-save");
const btnRecurringEditCancel = document.getElementById("btn-exam-recurring-edit-cancel");
const btnCloseRecurringEdit = document.getElementById("btn-close-exam-recurring-edit");

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

function addMonths(dateStr, months) {
  const d = parseDateStr(dateStr);
  if (!d) return "";
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // 月末ずれ補正（例: 1/31 + 1ヶ月 → 2/28）
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return formatDateStr(d);
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
 * 定期レコードから表示用の単位・数値を取り出す（旧 intervalMonths 互換）。
 */
export function getRecurringIntervalParts(recurring) {
  if (!recurring) return { unit: "month", value: 3 };
  if (recurring.intervalUnit && recurring.intervalValue != null && Number(recurring.intervalValue) > 0) {
    return {
      unit: recurring.intervalUnit,
      value: Number(recurring.intervalValue),
    };
  }
  if (recurring.intervalDays != null && Number(recurring.intervalDays) > 0) {
    const days = Number(recurring.intervalDays);
    if (days % DAYS_PER_MONTH === 0) {
      return { unit: "month", value: days / DAYS_PER_MONTH };
    }
    if (days % DAYS_PER_WEEK === 0) {
      return { unit: "week", value: days / DAYS_PER_WEEK };
    }
    return { unit: "day", value: days };
  }
  // 旧データ: intervalMonths のみ
  return {
    unit: "month",
    value: Number(recurring.intervalMonths) || 3,
  };
}

/**
 * 定期レコードから計算用の日数を得る。
 * 新データは intervalDays。旧データは intervalMonths × 30。
 */
export function getRecurringIntervalDays(recurring) {
  if (!recurring) return 0;
  if (recurring.intervalDays != null && Number(recurring.intervalDays) > 0) {
    return Number(recurring.intervalDays);
  }
  const months = Number(recurring.intervalMonths) || 0;
  return months * DAYS_PER_MONTH;
}

export function formatRecurringIntervalLabel(recurring) {
  const parts = getRecurringIntervalParts(recurring);
  return formatIntervalLabel(parts.unit, parts.value);
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
 * 定期レコードから次回予定日を計算する。
 * 旧データ（intervalMonths のみ）はカレンダー月加算を維持する。
 */
export function computeDueWindowFromRecurring(baseDateStr, recurring) {
  if (recurring?.intervalDays != null && Number(recurring.intervalDays) > 0) {
    return computeDueWindow(baseDateStr, Number(recurring.intervalDays), 0);
  }
  const months = Number(recurring?.intervalMonths) || 0;
  const target = addMonths(baseDateStr, months);
  if (!target) return null;
  return {
    dueDate: target,
    dueDateFrom: target,
    dueDateTo: target,
    targetDate: target,
    baselineDate: baseDateStr,
  };
}

function buildIntervalPayload(unit, value) {
  const n = Number(value) || 0;
  const days = unitToDays(unit, n);
  const payload = {
    intervalDays: days,
    intervalUnit: unit,
    intervalValue: n,
    intervalMonths: unit === "month" ? n : null,
  };
  return payload;
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
 * 次回予定から予定日（単一）を取り出す。旧 dueDateFrom/To にも対応。
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

function buildNextPlanPayload({ item, dueDate, note, recurringId, baselineDate }) {
  const date = dueDate || "";
  return {
    item: item || "",
    dueDate: date,
    baselineDate: baselineDate || todayStr(),
    // 旧クライアント互換（幅なし＝同日）
    dueDateFrom: date,
    dueDateTo: date,
    note: note || "",
    recurringId: recurringId || null,
  };
}

// --- 公開API --------------------------------------------------------------

export function initExamPlanUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  wireTabs();
  wireNextPlanActions();
  wirePlanModal();
  wireRecurringEditModal();
  wireCompleteModal();
  wireAfterModal();
  wireExamItemsModal();
  buildPlanDueRelativeUI();
  buildPlanIntervalUI();
  buildRecurringEditIntervalUI();

  state.unsubscribeItems = subscribeExamItems((items) => {
    state.examItems = items;
    renderPlanItemButtons();
    if (!examItemsModal.hidden) renderExamItemsList();
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
  closePlanModal();
  closeCompleteModal();
  closeAfterModal();
  showRightEmpty(true);
}

// --- タブ切替 ------------------------------------------------------------

function wireTabs() {
  rightTabs.querySelectorAll(".right-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      switchTab(btn.dataset.tab);
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  rightTabs.querySelectorAll(".right-tab").forEach((btn) => {
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
  rightEmpty.hidden = !empty;
  examRoot?.classList.toggle("is-disabled", empty);
  if (empty) {
    // カルテ未オープン時は検査予定パネルを隠し、案内を出す
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
  renderNextPlan();
  renderRecurring();
  renderHistory();
}

function renderNextPlan() {
  const next = state.plan.nextPlan;
  if (!next) {
    nextPlanEmpty.hidden = false;
    nextPlanBody.hidden = true;
    nextPlanAlert.hidden = true;
    nextPlanAlert.textContent = "";
    nextPlanCard.classList.remove(
      "is-alert",
      "is-overdue",
      "is-due-far",
      "is-due-near",
      "is-due-close"
    );
    return;
  }

  nextPlanEmpty.hidden = true;
  nextPlanBody.hidden = false;
  nextPlanItem.textContent = next.item || "（項目未設定）";

  const dueDate = getPlanDueDate(next);
  const info = getDueCountdown(dueDate, getPlanBaselineDate(next));
  nextPlanDate.textContent = formatDueCountdown(info) || ymdFromStr(dueDate);
  nextPlanDate.className = `exam-next-date ${dueLevelClass(info?.level || "far")}`;

  if (next.note) {
    nextPlanNote.hidden = false;
    nextPlanNote.textContent = next.note;
  } else {
    nextPlanNote.hidden = true;
    nextPlanNote.textContent = "";
  }

  nextPlanCard.classList.remove("is-alert", "is-overdue", "is-due-far", "is-due-near", "is-due-close");
  if (info?.level === "overdue") {
    nextPlanCard.classList.add("is-overdue");
    nextPlanAlert.hidden = false;
    nextPlanAlert.textContent = "予定日を過ぎています";
    nextPlanAlert.className = "exam-alert exam-alert--overdue";
  } else if (info?.level === "close") {
    nextPlanCard.classList.add("is-due-close", "is-alert");
    nextPlanAlert.hidden = false;
    nextPlanAlert.textContent = "予定日がかなり近いです";
    nextPlanAlert.className = "exam-alert exam-alert--close";
  } else if (info?.level === "near") {
    nextPlanCard.classList.add("is-due-near", "is-alert");
    nextPlanAlert.hidden = false;
    nextPlanAlert.textContent = "予定日が近づいています";
    nextPlanAlert.className = "exam-alert exam-alert--near";
  } else {
    nextPlanCard.classList.add("is-due-far");
    nextPlanAlert.hidden = true;
    nextPlanAlert.textContent = "";
  }
}

function renderRecurring() {
  recurringList.innerHTML = "";
  const items = Object.entries(state.plan.recurring || {}).map(([id, r]) => ({ id, ...r }));
  recurringEmpty.hidden = items.length > 0;

  items.sort((a, b) => (a.item || "").localeCompare(b.item || ""));

  items.forEach((r) => {
    const li = document.createElement("li");
    li.className = "exam-list-item";

    const info = document.createElement("div");
    info.className = "exam-list-item__info";
    const title = document.createElement("div");
    title.className = "exam-list-item__title";
    title.textContent = r.item || "（項目未設定）";
    const meta = document.createElement("div");
    meta.className = "exam-list-item__meta";

    const lines = [`${formatRecurringIntervalLabel(r)}　最終実施: ${
      r.lastDone ? ymdFromStr(r.lastDone) : "未設定"
    }`];

    if (r.lastDone) {
      const due = computeDueWindowFromRecurring(r.lastDone, r);
      if (due?.targetDate) {
        const countdown = getDueCountdown(due.targetDate, r.lastDone);
        const dueEl = document.createElement("div");
        dueEl.className = `exam-list-item__due ${dueLevelClass(countdown?.level || "far")}`;
        dueEl.textContent = `次回目安: ${formatDueCountdown(countdown)}`;
        info.append(title, meta, dueEl);
        meta.textContent = lines[0];
      } else {
        meta.textContent = lines[0];
        info.append(title, meta);
      }
    } else {
      meta.textContent = lines[0];
      info.append(title, meta);
    }

    const actions = document.createElement("div");
    actions.className = "exam-list-item__actions";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "btn btn--small btn--outline";
    applyBtn.textContent = "次回に反映";
    applyBtn.title = "最終実施日＋間隔から次回予定を計算して反映";
    applyBtn.addEventListener("click", () => applyRecurringToNext(r));

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--small btn--outline";
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", () => openRecurringEdit(r));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn--small btn--danger-outline";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", () => handleDeleteRecurring(r));

    actions.append(applyBtn, editBtn, delBtn);
    li.append(info, actions);
    recurringList.appendChild(li);
  });
}

function renderHistory() {
  historyList.innerHTML = "";
  const items = Object.entries(state.plan.history || {}).map(([id, h]) => ({ id, ...h }));
  historyEmpty.hidden = items.length > 0;

  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  items.forEach((h) => {
    const li = document.createElement("li");
    li.className = "exam-list-item";

    const info = document.createElement("div");
    info.className = "exam-list-item__info";
    const title = document.createElement("div");
    title.className = "exam-list-item__title";
    title.textContent = h.item || "（項目未設定）";
    const meta = document.createElement("div");
    meta.className = "exam-list-item__meta";
    meta.textContent = h.date ? ymdFromStr(h.date) : "";
    if (h.note) meta.textContent += `　${h.note}`;
    info.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "exam-list-item__actions";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn--small btn--danger-outline";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", async () => {
      const ok = window.confirm(`履歴「${h.item}（${ymdFromStr(h.date)}）」を削除しますか？`);
      if (!ok) return;
      try {
        await deleteExamHistory(state.karteNumber, h.id);
        deps.showToast("履歴を削除しました。");
      } catch (err) {
        console.error(err);
        deps.showToast("削除に失敗しました。", { isError: true });
      }
    });
    actions.appendChild(delBtn);
    li.append(info, actions);
    historyList.appendChild(li);
  });
}

// --- 次回予定アクション ---------------------------------------------------

function wireNextPlanActions() {
  btnExamNew.addEventListener("click", () => openPlanModal("create"));
  btnExamEdit.addEventListener("click", () => openPlanModal("edit"));
  btnExamComplete.addEventListener("click", openCompleteModal);
  btnExamEnd.addEventListener("click", handleEndPlan);
  btnRecurringAdd.addEventListener("click", () => openPlanModal("create", { focusRecurring: true }));
  btnOpenExamItems.addEventListener("click", openExamItemsModal);
}

async function handleEndPlan() {
  const ok = window.confirm("次回予定を終了しますか？（履歴・定期スケジュールは残ります）");
  if (!ok) return;
  try {
    await clearNextExamPlan(state.karteNumber);
    deps.showToast("次回予定を終了しました。");
  } catch (err) {
    console.error(err);
    deps.showToast("終了に失敗しました。", { isError: true });
  }
}

async function applyRecurringToNext(recurring) {
  if (!recurring.lastDone) {
    deps.showToast("最終実施日が未設定です。編集から設定してください。", { isError: true });
    return;
  }
  const dueWindow = computeDueWindowFromRecurring(recurring.lastDone, recurring);
  if (!dueWindow) return;

  const overwrite = state.plan.nextPlan
    ? window.confirm("現在の次回予定を上書きして反映しますか？")
    : true;
  if (!overwrite) return;

  try {
    await setNextExamPlan(
      state.karteNumber,
      buildNextPlanPayload({
        item: recurring.item,
        dueDate: dueWindow.targetDate || dueWindow.dueDate,
        note: `${formatRecurringIntervalLabel(recurring)}の定期検査`,
        recurringId: recurring.id,
        baselineDate: recurring.lastDone,
      })
    );
    deps.showToast("次回予定に反映しました。");
  } catch (err) {
    console.error(err);
    deps.showToast("反映に失敗しました。", { isError: true });
  }
}

function openRecurringEdit(recurring) {
  state.editingRecurringId = recurring.id;
  const parts = getRecurringIntervalParts(recurring);
  state.editInterval = {
    unit: parts.unit,
    value: parts.value,
    buffer: String(parts.value),
  };
  recurringEditItem.textContent = `項目: ${recurring.item || "（未設定）"}`;
  recurringLastDone.value = recurring.lastDone || "";
  deps.showError(recurringEditError, "");
  syncRecurringEditIntervalUI();
  recurringEditModal.hidden = false;
}

function closeRecurringEditModal() {
  recurringEditModal.hidden = true;
  state.editingRecurringId = null;
}

function wireRecurringEditModal() {
  btnCloseRecurringEdit?.addEventListener("click", closeRecurringEditModal);
  btnRecurringEditCancel?.addEventListener("click", closeRecurringEditModal);
  recurringEditModal?.querySelector("[data-close-modal]")?.addEventListener("click", closeRecurringEditModal);
  btnRecurringEditSave?.addEventListener("click", handleRecurringEditSave);
}

async function handleRecurringEditSave() {
  const id = state.editingRecurringId;
  if (!id) return;

  const buffered = Number(state.editInterval.buffer);
  if (buffered >= 1) {
    state.editInterval.value = buffered;
    state.editInterval.buffer = String(buffered);
  }
  const value = Number(state.editInterval.value) || 0;
  if (value < 1) {
    deps.showError(recurringEditError, "間隔は1以上をテンキーで入力し、「確定」してください。");
    return;
  }

  const lastDone = recurringLastDone.value || "";
  if (lastDone && !/^\d{4}-\d{2}-\d{2}$/.test(lastDone)) {
    deps.showError(recurringEditError, "最終実施日の形式が正しくありません。");
    return;
  }

  deps.showError(recurringEditError, "");
  deps.setBusy(btnRecurringEditSave, true, "保存中...", "保存する");

  try {
    const interval = buildIntervalPayload(state.editInterval.unit, value);
    await updateExamRecurring(state.karteNumber, id, {
      ...interval,
      lastDone,
    });
    closeRecurringEditModal();
    deps.showToast("定期スケジュールを更新しました。");
  } catch (err) {
    console.error(err);
    deps.showError(recurringEditError, "更新に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnRecurringEditSave, false, "保存中...", "保存する");
  }
}

async function handleDeleteRecurring(recurring) {
  const ok = window.confirm(`定期スケジュール「${recurring.item}」を削除しますか？`);
  if (!ok) return;
  try {
    await deleteExamRecurring(state.karteNumber, recurring.id);
    deps.showToast("定期スケジュールを削除しました。");
  } catch (err) {
    console.error(err);
    deps.showToast("削除に失敗しました。", { isError: true });
  }
}

// --- 予定編集モーダル -----------------------------------------------------

function wirePlanModal() {
  btnClosePlanModal.addEventListener("click", closePlanModal);
  btnPlanCancel.addEventListener("click", closePlanModal);
  planModal.querySelector("[data-close-modal]")?.addEventListener("click", closePlanModal);
  btnPlanSave.addEventListener("click", handlePlanSave);

  planOtherCheck.addEventListener("change", () => {
    planCustomItem.hidden = !planOtherCheck.checked;
    if (planOtherCheck.checked) {
      state.draft.item = "";
      renderPlanItemButtons();
      planCustomItem.focus();
    }
  });

  planRecurringCheck.addEventListener("change", () => {
    state.draft.enableRecurring = planRecurringCheck.checked;
    planRecurringFields.hidden = !planRecurringCheck.checked;
  });

  planDueDate.addEventListener("change", () => {
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

function displayBufferLabel(unit, buffer, confirmedValue) {
  const shown = buffer !== "" ? buffer : String(confirmedValue || "");
  return formatIntervalLabel(unit, shown === "" ? 0 : shown);
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
    // 過去日は相対0として表示（日付自体はカレンダー側を優先）
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
  planDueDate.value = date;
  state.draft.dueDate = date;
  state.syncingDueFromRelative = false;
  updateWindowNote();
  syncDueRelativeUI();
}

function buildPlanDueRelativeUI() {
  mountNumpad(planDueNumpad, {
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
        deps.showError(planError, "相対日数は0以上の数値を入力し、「確定」してください。");
        return;
      }
      if (n < 1) {
        deps.showError(planError, "1以上の相対日数を入力するか、カレンダーで日付を選んでください。");
        return;
      }
      deps.showError(planError, "");
      applyDueRelativeToCalendar();
    },
  });
  syncDueRelativeUI();
}

function syncDueRelativeUI() {
  mountUnitButtons(planDueUnits, state.draft.dueRelativeUnit, (unit) => {
    const prevUnit = state.draft.dueRelativeUnit;
    const prevValue =
      state.draft.dueRelativeBuffer !== ""
        ? Number(state.draft.dueRelativeBuffer) || 0
        : Number(state.draft.dueRelativeValue) || 0;
    // 単位切替時は、現在の相対日数を保ったまま新しい単位に換算
    const days = unitToDays(prevUnit, prevValue);
    let nextValue = days;
    if (unit === "week") nextValue = Math.max(0, Math.round(days / DAYS_PER_WEEK));
    else if (unit === "month") nextValue = Math.max(0, Math.round(days / DAYS_PER_MONTH));
    state.draft.dueRelativeUnit = unit;
    state.draft.dueRelativeValue = nextValue;
    state.draft.dueRelativeBuffer = nextValue > 0 || days === 0 ? String(nextValue) : "";
    // カレンダーも新しい単位換算に合わせる
    if (nextValue > 0 || planDueDate.value) {
      applyDueRelativeToCalendar();
    } else {
      syncDueRelativeUI();
    }
  });
  if (planDueDisplay) {
    planDueDisplay.textContent = displayRelativeBufferLabel(
      state.draft.dueRelativeUnit,
      state.draft.dueRelativeBuffer,
      state.draft.dueRelativeValue
    );
  }
}

function resetDraftDueRelative() {
  state.draft.dueRelativeUnit = "day";
  state.draft.dueRelativeValue = 0;
  state.draft.dueRelativeBuffer = "";
}

function buildPlanIntervalUI() {
  mountUnitButtons(planIntervalUnits, state.draft.intervalUnit, (unit) => {
    state.draft.intervalUnit = unit;
    state.draft.intervalBuffer = String(state.draft.intervalValue || "");
    syncPlanIntervalUI();
  });
  mountNumpad(planIntervalNumpad, {
    onDigit: (d) => {
      if (state.draft.intervalBuffer.length >= 4) return;
      state.draft.intervalBuffer =
        state.draft.intervalBuffer === "0" ? d : state.draft.intervalBuffer + d;
      syncPlanIntervalUI();
    },
    onDelete: () => {
      state.draft.intervalBuffer = state.draft.intervalBuffer.slice(0, -1);
      syncPlanIntervalUI();
    },
    onConfirm: () => {
      const n = Number(state.draft.intervalBuffer);
      if (!n || n < 1) {
        deps.showError(planError, "間隔は1以上の数値を入力し、「確定」してください。");
        return;
      }
      state.draft.intervalValue = n;
      state.draft.intervalBuffer = String(n);
      deps.showError(planError, "");
      syncPlanIntervalUI();
    },
  });
  syncPlanIntervalUI();
}

function syncPlanIntervalUI() {
  mountUnitButtons(planIntervalUnits, state.draft.intervalUnit, (unit) => {
    state.draft.intervalUnit = unit;
    state.draft.intervalBuffer = String(state.draft.intervalValue || "");
    syncPlanIntervalUI();
  });
  if (planIntervalDisplay) {
    planIntervalDisplay.textContent = displayBufferLabel(
      state.draft.intervalUnit,
      state.draft.intervalBuffer,
      state.draft.intervalValue
    );
  }
}

function buildRecurringEditIntervalUI() {
  mountNumpad(recurringIntervalNumpad, {
    onDigit: (d) => {
      if (state.editInterval.buffer.length >= 4) return;
      state.editInterval.buffer =
        state.editInterval.buffer === "0" ? d : state.editInterval.buffer + d;
      syncRecurringEditIntervalUI();
    },
    onDelete: () => {
      state.editInterval.buffer = state.editInterval.buffer.slice(0, -1);
      syncRecurringEditIntervalUI();
    },
    onConfirm: () => {
      const n = Number(state.editInterval.buffer);
      if (!n || n < 1) {
        deps.showError(recurringEditError, "間隔は1以上の数値を入力し、「確定」してください。");
        return;
      }
      state.editInterval.value = n;
      state.editInterval.buffer = String(n);
      deps.showError(recurringEditError, "");
      syncRecurringEditIntervalUI();
    },
  });
  syncRecurringEditIntervalUI();
}

function syncRecurringEditIntervalUI() {
  mountUnitButtons(recurringIntervalUnits, state.editInterval.unit, (unit) => {
    state.editInterval.unit = unit;
    state.editInterval.buffer = String(state.editInterval.value || "");
    syncRecurringEditIntervalUI();
  });
  if (recurringIntervalDisplay) {
    recurringIntervalDisplay.textContent = displayBufferLabel(
      state.editInterval.unit,
      state.editInterval.buffer,
      state.editInterval.value
    );
  }
}

function resetDraftInterval(unit = "month", value = 3) {
  state.draft.intervalUnit = unit;
  state.draft.intervalValue = value;
  state.draft.intervalBuffer = String(value);
}

function renderPlanItemButtons() {
  planItemButtons.innerHTML = "";
  state.examItems.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.textContent = item.label;
    btn.classList.toggle("is-selected", !planOtherCheck.checked && state.draft.item === item.label);
    btn.addEventListener("click", () => {
      planOtherCheck.checked = false;
      planCustomItem.hidden = true;
      state.draft.item = item.label;
      state.draft.customItem = "";
      renderPlanItemButtons();
    });
    planItemButtons.appendChild(btn);
  });
}

function updateWindowNote() {
  const date = planDueDate.value;
  if (!date) {
    planWindowNote.textContent = "予定日を選ぶと、残り日数が表示されます。";
    planWindowNote.className = "field__note";
    return;
  }
  // 登録画面では「いま選んでいる日付」を基準にプレビュー（保存時の baseline は別途保持）
  const baseline = state.draft.baselineDate || todayStr();
  const info = getDueCountdown(date, baseline);
  planWindowNote.textContent = `予定日: ${formatDueCountdown(info)}`;
  planWindowNote.className = `field__note ${dueLevelClass(info?.level || "far")}`;
}

function openPlanModal(mode, { focusRecurring = false, preset = null } = {}) {
  state.draft.mode = mode;
  const next = state.plan?.nextPlan;

  if (mode === "edit" && next) {
    planModalTitle.textContent = "次回予定を編集";
    state.draft.item = next.item || "";
    state.draft.customItem = "";
    state.draft.dueDate = getPlanDueDate(next) || "";
    state.draft.note = next.note || "";
    state.draft.recurringId = next.recurringId || null;
    state.draft.enableRecurring = false;
    state.draft.baselineDate = next.baselineDate || null;
  } else if (preset) {
    planModalTitle.textContent = "次の予定を登録";
    state.draft.item = preset.item || "";
    state.draft.customItem = "";
    state.draft.dueDate = preset.dueDate || "";
    state.draft.note = preset.note || "";
    state.draft.recurringId = preset.recurringId || null;
    state.draft.enableRecurring = Boolean(preset.enableRecurring);
    state.draft.baselineDate = preset.baselineDate || todayStr();
    if (preset.intervalUnit && preset.intervalValue) {
      resetDraftInterval(preset.intervalUnit, preset.intervalValue);
    } else if (preset.intervalMonths) {
      resetDraftInterval("month", preset.intervalMonths);
    } else {
      resetDraftInterval("month", 3);
    }
  } else {
    planModalTitle.textContent = "次回予定を登録";
    state.draft.item = "";
    state.draft.customItem = "";
    state.draft.dueDate = "";
    state.draft.note = "";
    state.draft.recurringId = null;
    state.draft.enableRecurring = focusRecurring;
    state.draft.baselineDate = todayStr();
    resetDraftInterval("month", 3);
  }

  planOtherCheck.checked = false;
  planCustomItem.hidden = true;
  planCustomItem.value = "";
  planDueDate.value = state.draft.dueDate;
  planNote.value = state.draft.note;
  planRecurringCheck.checked = state.draft.enableRecurring;
  planRecurringFields.hidden = !state.draft.enableRecurring;
  syncPlanIntervalUI();
  if (state.draft.dueDate) {
    syncRelativeFromCalendar(state.draft.dueDate);
  } else {
    resetDraftDueRelative();
    syncDueRelativeUI();
  }
  deps.showError(planError, "");
  renderPlanItemButtons();
  updateWindowNote();
  planModal.hidden = false;
}

function closePlanModal() {
  planModal.hidden = true;
}

async function handlePlanSave() {
  let item = state.draft.item;
  if (planOtherCheck.checked) {
    item = planCustomItem.value.trim();
  }
  // 相対テンキー入力済みなら、保存前にカレンダーへ反映
  const dueBuffered = Number(state.draft.dueRelativeBuffer);
  if (state.draft.dueRelativeBuffer !== "" && dueBuffered >= 1) {
    applyDueRelativeToCalendar();
  }
  const dueDate = planDueDate.value;
  const note = planNote.value.trim();
  const enableRecurring = planRecurringCheck.checked;
  const buffered = Number(state.draft.intervalBuffer);
  if (buffered >= 1) {
    state.draft.intervalValue = buffered;
    state.draft.intervalBuffer = String(buffered);
  }
  const intervalValue = Number(state.draft.intervalValue) || 0;
  const intervalUnit = state.draft.intervalUnit || "month";

  if (!item) {
    deps.showError(planError, "検査項目を選択するか、「その他」で入力してください。");
    return;
  }
  if (!dueDate) {
    deps.showError(planError, "日付を選択してください。");
    return;
  }
  if (enableRecurring && intervalValue < 1) {
    deps.showError(planError, "間隔はテンキーで数値を入力し、「確定」してください。");
    return;
  }

  deps.showError(planError, "");
  deps.setBusy(btnPlanSave, true, "保存中...", "保存する");

  try {
    let recurringId = state.draft.recurringId || null;

    if (enableRecurring) {
      const interval = buildIntervalPayload(intervalUnit, intervalValue);
      recurringId = await addExamRecurring(state.karteNumber, {
        item,
        ...interval,
        lastDone: "",
        windowDays: 0,
      });
    }

    // 編集・完了後の再登録は既存 baseline を維持。新規は登録日を基準にする。
    const keepBaseline = state.draft.baselineDate || todayStr();

    await setNextExamPlan(
      state.karteNumber,
      buildNextPlanPayload({
        item,
        dueDate,
        note,
        recurringId,
        baselineDate: keepBaseline,
      })
    );

    closePlanModal();
    deps.showToast("次回予定を保存しました。");
  } catch (err) {
    console.error(err);
    deps.showError(planError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnPlanSave, false, "保存中...", "保存する");
  }
}

// --- 完了フロー -----------------------------------------------------------

function wireCompleteModal() {
  btnCloseCompleteModal.addEventListener("click", closeCompleteModal);
  btnCompleteCancel.addEventListener("click", closeCompleteModal);
  completeModal.querySelector("[data-close-modal]")?.addEventListener("click", closeCompleteModal);
  btnCompleteSave.addEventListener("click", handleCompleteSave);
}

function openCompleteModal() {
  if (!state.plan?.nextPlan) return;
  completeDate.value = todayStr();
  completeNote.value = "";
  deps.showError(completeError, "");
  completeModal.hidden = false;
}

function closeCompleteModal() {
  completeModal.hidden = true;
}

async function handleCompleteSave() {
  const next = state.plan?.nextPlan;
  if (!next) return;

  const date = completeDate.value;
  const note = completeNote.value.trim();
  if (!date) {
    deps.showError(completeError, "実施日を選択してください。");
    return;
  }

  deps.showError(completeError, "");
  deps.setBusy(btnCompleteSave, true, "保存中...", "完了として記録");

  try {
    await addExamHistory(state.karteNumber, {
      item: next.item,
      date,
      note,
    });

    // 紐づく定期があれば lastDone を更新し、次回目安を自動計算
    let suggested = null;
    let recurringId = next.recurringId || null;
    let recurring = recurringId ? state.plan.recurring?.[recurringId] : null;

    // recurringId が無い場合でも、同名項目の定期があればそれを使う
    if (!recurring) {
      const match = Object.entries(state.plan.recurring || {}).find(
        ([, r]) => r.item === next.item
      );
      if (match) {
        recurringId = match[0];
        recurring = match[1];
      }
    }

    if (recurring && recurringId) {
      await updateExamRecurring(state.karteNumber, recurringId, { lastDone: date });
      const window = computeDueWindowFromRecurring(date, recurring);
      if (window) {
        const parts = getRecurringIntervalParts(recurring);
        suggested = {
          item: recurring.item,
          dueDate: window.targetDate || window.dueDate,
          note: `${formatRecurringIntervalLabel(recurring)}の定期検査`,
          recurringId,
          intervalUnit: parts.unit,
          intervalValue: parts.value,
          enableRecurring: false,
          baselineDate: date,
        };
      }
    }

    // 次回予定はいったんクリアし、続けて登録するか選ばせる
    await clearNextExamPlan(state.karteNumber);
    closeCompleteModal();
    deps.showToast("実施を記録しました。");
    openAfterModal(suggested);
  } catch (err) {
    console.error(err);
    deps.showError(completeError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnCompleteSave, false, "保存中...", "完了として記録");
  }
}

function wireAfterModal() {
  btnCloseAfterModal.addEventListener("click", () => closeAfterModal(true));
  btnAfterEnd.addEventListener("click", () => closeAfterModal(true));
  btnAfterNext.addEventListener("click", () => {
    const preset = afterModal._suggested || null;
    closeAfterModal(false);
    openPlanModal("afterComplete", { preset: preset || undefined });
  });
  afterModal.querySelector("[data-close-modal]")?.addEventListener("click", () =>
    closeAfterModal(true)
  );
}

function openAfterModal(suggested) {
  afterModal._suggested = suggested || null;
  if (suggested) {
    afterSummary.hidden = false;
    afterSummary.innerHTML = `定期スケジュールに基づく次回予定:<br /><strong>${
      suggested.item
    }</strong><br />${formatDueCountdown(
      getDueCountdown(suggested.dueDate, suggested.baselineDate || null)
    )}`;
    btnAfterNext.textContent = "この予定で次を登録";
  } else {
    afterSummary.hidden = true;
    afterSummary.textContent = "";
    btnAfterNext.textContent = "次の予定を入力する";
  }
  afterModal.hidden = false;
}

function closeAfterModal() {
  afterModal.hidden = true;
  afterModal._suggested = null;
}

// --- 検査項目マスタ管理 ---------------------------------------------------

function wireExamItemsModal() {
  btnCloseExamItems.addEventListener("click", closeExamItemsModal);
  examItemsModal.querySelector("[data-close-modal]")?.addEventListener("click", closeExamItemsModal);
  btnExamItemSave.addEventListener("click", handleExamItemSave);
  btnExamItemCancel.addEventListener("click", resetExamItemEditor);
}

function openExamItemsModal() {
  resetExamItemEditor();
  renderExamItemsList();
  examItemsModal.hidden = false;
}

function closeExamItemsModal() {
  examItemsModal.hidden = true;
}

function renderExamItemsList() {
  examItemsList.innerHTML = "";
  examItemsListEmpty.hidden = state.examItems.length > 0;

  state.examItems.forEach((item) => {
    const li = document.createElement("li");
    li.className = "tpl-list-item";

    const info = document.createElement("div");
    info.className = "tpl-list-item__info";
    const label = document.createElement("div");
    label.className = "tpl-list-item__label";
    label.textContent = item.label || "(名称未設定)";
    info.appendChild(label);

    const actions = document.createElement("div");
    actions.className = "tpl-list-item__actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--small btn--outline";
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", () => {
      state.editingExamItemId = item.id;
      examItemEditorTitle.textContent = "検査項目を編集";
      examItemLabelInput.value = item.label || "";
      btnExamItemSave.textContent = "更新する";
      btnExamItemCancel.hidden = false;
      deps.showError(examItemError, "");
      examItemLabelInput.focus();
    });
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn--small btn--danger-outline";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", async () => {
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
    });
    actions.append(editBtn, delBtn);
    li.append(info, actions);
    examItemsList.appendChild(li);
  });
}

function resetExamItemEditor() {
  state.editingExamItemId = null;
  examItemEditorTitle.textContent = "新しい検査項目を追加";
  examItemLabelInput.value = "";
  btnExamItemSave.textContent = "追加する";
  btnExamItemCancel.hidden = true;
  deps.showError(examItemError, "");
}

async function handleExamItemSave() {
  const label = examItemLabelInput.value.trim();
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
 * AI提案フローなど外部からの次回予定登録。
 */
export async function addExamPlanFromExternal(karteNumber, { item, dueDate, note, baselineDate }) {
  if (!dueDate) throw new Error("検査予定の日付が不正です。");
  await setNextExamPlan(
    karteNumber,
    buildNextPlanPayload({
      item: item || "",
      dueDate,
      note: note || "",
      recurringId: null,
      baselineDate: baselineDate || todayStr(),
    })
  );
}
