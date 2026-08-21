// 右カラム「処置」タブ: 予定一覧＋実施履歴。
// 予定日入力は検査予定と同じカレンダー／相対テンキー方式。

import {
  subscribeProcedureBundle,
  addProcedure,
  updateProcedure,
  deleteProcedure,
  saveProcedurePlan,
  deleteProcedurePlan,
  completeProcedurePlan,
  reviveProcedurePlan,
  addEntry,
} from "./db.js";
import {
  getPlanDueCountdown,
  getPlanDueRange,
  formatDueCountdown,
  unitToDays,
  formatRelativeOffsetLabel,
} from "./exam-plan-ui.js";
import { enableRowGestures } from "./row-gestures.js";
import { maxDueAlertLevel, setRightTabDueAlert } from "./right-tab-alerts.js";

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
  getSelectedAuthor: () => "",
};

const state = {
  karteNumber: null,
  plans: [],
  history: [],
  unsubscribe: null,
  editingHistoryId: null,
  editingHistoryStore: "history",
  editingPlanId: null,
  syncingDueFromRelative: false,
  dueRelativeUnit: "day",
  dueRelativeValue: 0,
  dueRelativeValueFrom: 0,
  dueRelativeValueTo: 0,
  dueRelativeBuffer: "",
  dueRelativeFocus: "from",
  // 予定登録モーダルの「予定を登録」／「実施を記録」切り替え
  registerMode: "plan",
  // 相対日数計算の基準日（本日実施した内容の記録に実施日があればそれ、
  // なければ今日）。
  baselineDate: null,
  /** 「本日実施した内容の記録」の記録方法。continuous=処置履歴として蓄積、single=時系列に単発イベントとして記録 */
  doneRecordMode: "continuous", // continuous | single
};

const planList = document.getElementById("procedure-plan-list");
const planEmpty = document.getElementById("procedure-plan-empty");
const histList = document.getElementById("procedures-list");
const histEmpty = document.getElementById("procedures-empty");
const btnPlanAdd = document.getElementById("btn-procedure-plan-add");
const btnHistAdd = document.getElementById("btn-procedure-add");

const planModal = document.getElementById("procedure-plan-modal");
const planModalTitle = document.getElementById("procedure-plan-modal-title");
const planContent = document.getElementById("procedure-plan-content");
const planModeToggle = document.getElementById("procedure-plan-mode-toggle");
const btnPlanModePlan = document.getElementById("btn-procedure-mode-plan");
const btnPlanModeHistory = document.getElementById("btn-procedure-mode-history");
const planDueField = document.getElementById("procedure-plan-due-field");
const planDueDate = document.getElementById("procedure-plan-due-date");
const planDueDateTo = document.getElementById("procedure-plan-due-date-to");
const planDueUnits = document.getElementById("procedure-plan-due-units");
const planDueDisplay = document.getElementById("procedure-plan-due-display");
const planDueNumpad = document.getElementById("procedure-plan-due-numpad");
const planWindowNote = document.getElementById("procedure-plan-window-note");
const planHistDateField = document.getElementById("procedure-plan-history-date-field");
const planHistDate = document.getElementById("procedure-plan-history-date");
const planDoneField = document.getElementById("procedure-plan-done-field");
const planDoneCheck = document.getElementById("procedure-plan-done-check");
const planDoneBlock = document.getElementById("procedure-plan-done-block");
const planDoneDate = document.getElementById("procedure-plan-done-date");
const planDoneRecordMode = document.getElementById("procedure-plan-done-record-mode");
const btnDoneModeContinuous = document.getElementById("btn-procedure-done-mode-continuous");
const btnDoneModeSingle = document.getElementById("btn-procedure-done-mode-single");
const planDoneRecordModeNote = document.getElementById("procedure-plan-done-record-mode-note");
const planDoneNote = document.getElementById("procedure-plan-done-note");
const planLastDone = document.getElementById("procedure-plan-last-done");
const planNote = document.getElementById("procedure-plan-note");
const planError = document.getElementById("procedure-plan-error");
const btnPlanSave = document.getElementById("btn-procedure-plan-save");
const btnPlanComplete = document.getElementById("btn-procedure-plan-complete");
const btnPlanCancel = document.getElementById("btn-procedure-plan-cancel");
const btnClosePlanModal = document.getElementById("btn-close-procedure-plan-modal");

const histModal = document.getElementById("procedure-modal");
const histModalTitle = document.getElementById("procedure-modal-title");
const histDate = document.getElementById("procedure-date");
const histContent = document.getElementById("procedure-content");
const histNote = document.getElementById("procedure-note");
const histError = document.getElementById("procedure-error");
const btnHistSave = document.getElementById("btn-procedure-save");
const btnHistCancel = document.getElementById("btn-procedure-cancel");
const btnCloseHistModal = document.getElementById("btn-close-procedure-modal");

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

function mdFromStr(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  if (!m || !d) return dateStr;
  return `${Number(m)}/${Number(d)}`;
}

function latestProcedureHistoryDateForContent(content) {
  const needle = String(content || "").trim();
  if (!needle) return "";
  let latest = "";
  (state.history || []).forEach((h) => {
    if (!h) return;
    if (String(h.content || "").trim() !== needle) return;
    if ((h.date || "") > latest) latest = h.date;
  });
  return latest;
}

function updateLastDoneHint() {
  if (!planLastDone) return;
  const content = (planContent?.value || "").trim();
  if (!content) {
    planLastDone.hidden = true;
    planLastDone.textContent = "";
    return;
  }
  const last = latestProcedureHistoryDateForContent(content);
  const md = mdFromStr(last);
  planLastDone.hidden = false;
  planLastDone.textContent = md ? `前回：${md}` : "初回";
}

function parseDateStr(dateStr) {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(dateStr, days) {
  const d = parseDateStr(dateStr);
  if (!d) return "";
  d.setDate(d.getDate() + (Number(days) || 0));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function daysBetween(fromStr, toStr) {
  const from = parseDateStr(fromStr);
  const to = parseDateStr(toStr);
  if (!from || !to) return null;
  return Math.round((to - from) / 86400000);
}

function dueLevelClass(level) {
  if (level === "overdue") return "exam-due-text--overdue";
  if (level === "close") return "exam-due-text--close";
  if (level === "near") return "exam-due-text--near";
  return "exam-due-text--far";
}

// --- 公開API --------------------------------------------------------------

export function initProceduresUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  buildPlanDueRelativeUI();

  btnPlanAdd?.addEventListener("click", () => openPlanModal("create"));
  btnHistAdd?.addEventListener("click", () => openHistModal("create"));

  btnClosePlanModal?.addEventListener("click", closePlanModal);
  btnPlanCancel?.addEventListener("click", closePlanModal);
  planModal?.querySelector("[data-close-modal]")?.addEventListener("click", closePlanModal);
  btnPlanSave?.addEventListener("click", handlePlanSave);
  btnPlanComplete?.addEventListener("click", handlePlanCompleteFromModal);
  btnPlanModePlan?.addEventListener("click", () => setRegisterMode("plan"));
  btnPlanModeHistory?.addEventListener("click", () => setRegisterMode("history"));

  btnCloseHistModal?.addEventListener("click", closeHistModal);
  btnHistCancel?.addEventListener("click", closeHistModal);
  histModal?.querySelector("[data-close-modal]")?.addEventListener("click", closeHistModal);
  btnHistSave?.addEventListener("click", handleHistSave);

  wireDueDateInput(planDueDate, "from");
  wireDueDateInput(planDueDateTo, "to");
  bindDueDateCalendar(planDueDate);
  bindDueDateCalendar(planDueDateTo);
  planDoneDate?.addEventListener("click", () => {
    if (!planDoneDate.disabled) openDueCalendarPicker(planDoneDate);
  });
  planDoneCheck?.addEventListener("change", () => {
    syncPlanDoneBlockVisibility();
    syncBaselineFromDoneDate();
  });
  planDoneDate?.addEventListener("change", syncBaselineFromDoneDate);
  planDoneDate?.addEventListener("input", syncBaselineFromDoneDate);
  btnDoneModeContinuous?.addEventListener("click", () => setDoneRecordMode("continuous"));
  btnDoneModeSingle?.addEventListener("click", () => setDoneRecordMode("single"));
  planContent?.addEventListener("input", updateLastDoneHint);
  planContent?.addEventListener("change", updateLastDoneHint);
}

export function enterProcedures(karteNumber) {
  leaveProcedures();
  state.karteNumber = karteNumber;
  state.unsubscribe = subscribeProcedureBundle(karteNumber, (bundle) => {
    state.plans = bundle.plans || [];
    state.history = bundle.history || [];
    renderAll();
    if (planModal && !planModal.hidden) updateLastDoneHint();
  });
}

export function leaveProcedures() {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }
  state.karteNumber = null;
  state.plans = [];
  state.history = [];
  setRightTabDueAlert("proc", null);
  closePlanModal();
  closeHistModal();
  if (planList) planList.innerHTML = "";
  if (histList) histList.innerHTML = "";
}

export async function addProcedureFromExternal(karteNumber, payload) {
  return addProcedure(karteNumber, {
    ...payload,
    note: payload.note || "",
    source: payload.source || "ai",
  });
}

/**
 * 処置予定の新規追加モーダルを開く（状態モードなど別画面から使う）。
 */
export function openProcedurePlanCreateModal() {
  if (!state.karteNumber) return false;
  openPlanModal("create");
  return true;
}

/**
 * 処置予定IDを指定して既存の編集モーダルを開く（状態モードなど別画面から使う）。
 */
export function openProcedurePlanEditorById(planId) {
  const plan = (state.plans || []).find((p) => p.id === planId);
  if (!plan) return false;
  openPlanModal("edit", plan);
  return true;
}

/**
 * 処置実施履歴IDを指定して既存の編集モーダルを開く。
 */
export function openProcedureHistoryEditorById(entryId) {
  const item = (state.history || []).find((h) => h.id === entryId);
  if (!item) return false;
  openHistModal("edit", item);
  return true;
}

/**
 * 処置実施履歴IDを指定して「予定に戻す」操作を行う（状態モードなど別画面から使う）。
 */
export function reviveProcedureHistoryById(entryId) {
  const item = (state.history || []).find((h) => h.id === entryId);
  if (!item) return false;
  handleRevive(item);
  return true;
}

/**
 * 処置実施履歴IDを指定して削除する（確認ダイアログ付き。状態モードなど別画面から使う）。
 */
export async function deleteProcedureHistoryById(entryId, store = "history") {
  const ok = window.confirm("この実施履歴を削除しますか？");
  if (!ok) return;
  try {
    await deleteProcedure(state.karteNumber, entryId, { store });
    deps.showToast("削除しました。");
  } catch (err) {
    console.error(err);
    deps.showToast("削除に失敗しました。", { isError: true });
  }
}

// --- 描画 ----------------------------------------------------------------

function renderAll() {
  renderPlanList();
  renderHistoryList();
  updateProcTabDueAlert();
}

function updateProcTabDueAlert() {
  const levels = (state.plans || [])
    .map((plan) => getPlanDueCountdown(plan)?.level || null)
    .filter(Boolean);
  setRightTabDueAlert("proc", maxDueAlertLevel(levels));
}

function renderPlanList() {
  if (!planList) return;
  planList.innerHTML = "";
  const plans = state.plans;
  if (planEmpty) planEmpty.hidden = plans.length > 0;

  plans.forEach((plan) => {
    const countdown = getPlanDueCountdown(plan);
    const li = document.createElement("li");
    li.className = "exam-list-item";
    li.dataset.planId = plan.id;

    const info = document.createElement("div");
    info.className = "exam-list-item__info";
    const head = document.createElement("div");
    head.className = "exam-list-item__head";
    const title = document.createElement("div");
    title.className = "exam-list-item__title";
    title.textContent = plan.content || "（内容なし）";
    const dueEl = document.createElement("div");
    if (countdown) {
      dueEl.className = `exam-list-item__due ${dueLevelClass(countdown.level)}`;
      dueEl.textContent = formatDueCountdown(countdown, { includeDate: false });
    } else {
      dueEl.className = "exam-list-item__due";
      dueEl.textContent = "予定日未設定";
    }
    head.append(title, dueEl);
    info.appendChild(head);
    if (plan.note) {
      const noteEl = document.createElement("div");
      noteEl.className = "exam-list-item__note";
      noteEl.textContent = plan.note;
      info.appendChild(noteEl);
    }
    li.appendChild(info);

    enableRowGestures(li, {
      actions: [
        {
          action: "edit",
          title: "編集",
          onClick: () => openPlanModal("edit", plan),
        },
        {
          action: "delete",
          title: "完了",
          onClick: () => handleCompletePlan(plan),
        },
      ],
      onActivate: () => openPlanModal("edit", plan),
    });
    planList.appendChild(li);
  });
}

function renderHistoryList() {
  if (!histList) return;
  histList.innerHTML = "";
  const items = state.history;
  if (histEmpty) histEmpty.hidden = items.length > 0;

  // 内容ごとにグループ化し、見出し＋実施日の降順で並べる
  const groups = new Map();
  items.forEach((item) => {
    const key = (item.content || "").trim() || "（内容なし）";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  const groupKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b, "ja"));
  groupKeys.forEach((content) => {
    const groupItems = [...groups.get(content)].sort((a, b) =>
      (b.date || "").localeCompare(a.date || "")
    );

    const groupTitle = document.createElement("li");
    groupTitle.className = "exam-history-group-title";
    const groupLabel = document.createElement("div");
    groupLabel.className = "exam-history-group-title__label";
    groupLabel.textContent = content;
    const groupHint = document.createElement("div");
    groupHint.className = "exam-history-group-title__hint";
    groupHint.textContent = `${groupItems.length}件 · 新しい順`;
    groupTitle.append(groupLabel, groupHint);
    histList.appendChild(groupTitle);

    groupItems.forEach((item) => {
      histList.appendChild(createHistoryCard(item, { hideContent: true }));
    });
  });
}

function createHistoryCard(item, { hideContent = false } = {}) {
  const li = document.createElement("li");
  li.className = "proc-card";
  li.dataset.entryId = item.id;
  li.dataset.store = item.store || "history";

  const dateEl = document.createElement("p");
  dateEl.className = "proc-card__date";
  dateEl.textContent = ymdFromStr(item.date) || "（日付なし）";

  li.appendChild(dateEl);

  if (!hideContent) {
    const contentEl = document.createElement("p");
    contentEl.className = "proc-card__content";
    contentEl.textContent = item.content || "（内容なし）";
    li.appendChild(contentEl);
  }

  if (item.note) {
    const noteEl = document.createElement("p");
    noteEl.className = "proc-card__note";
    noteEl.textContent = item.note;
    li.appendChild(noteEl);
  }

  enableRowGestures(li, {
    actions: [
      {
        action: "refresh",
        title: "予定に戻す",
        onClick: () => handleRevive(item),
      },
      {
        action: "edit",
        title: "編集",
        onClick: () => openHistModal("edit", item),
      },
      {
        action: "delete",
        title: "削除",
        onClick: () => deleteProcedureHistoryById(item.id, item.store || "history"),
      },
    ],
    onActivate: () => openHistModal("edit", item),
  });
  return li;
}

// --- 予定日（相対テンキー） ----------------------------------------------

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

function openDueCalendarPicker(inputEl) {
  if (!inputEl) return;
  inputEl.focus({ preventScroll: true });
  try {
    if (typeof inputEl.showPicker === "function") inputEl.showPicker();
  } catch {
    // ignore
  }
}

function bindDueDateCalendar(inputEl) {
  if (!inputEl || inputEl.dataset.dueCalWired === "1") return;
  inputEl.dataset.dueCalWired = "1";
  inputEl.addEventListener("click", () => openDueCalendarPicker(inputEl));
}

function writeDueRangeInputs(from, to) {
  let start = from || "";
  let end = to || start;
  if (!start) start = end;
  if (start && end && start > end) {
    const tmp = start;
    start = end;
    end = tmp;
    const vf = Number(state.dueRelativeValueFrom) || 0;
    const vt = Number(state.dueRelativeValueTo) || 0;
    if (vf > vt) {
      state.dueRelativeValueFrom = vt;
      state.dueRelativeValueTo = vf;
    }
  }
  state.syncingDueFromRelative = true;
  if (planDueDate) planDueDate.value = start;
  if (planDueDateTo) planDueDateTo.value = end;
  state.syncingDueFromRelative = false;
}

function readDueRangeForSave() {
  const from = planDueDate?.value || "";
  const to = planDueDateTo?.value || from;
  let start = from || to;
  let end = to || from;
  if (start && end && start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  return { from: start, to: end };
}

function pickSharedRelativeUnit(d1, d2) {
  const a = Math.max(0, Number(d1) || 0);
  const b = Math.max(0, Number(d2) || 0);
  if (
    (a === 0 || a % DAYS_PER_MONTH === 0) &&
    (b === 0 || b % DAYS_PER_MONTH === 0) &&
    (a >= DAYS_PER_MONTH || b >= DAYS_PER_MONTH)
  ) {
    return "month";
  }
  if (
    (a === 0 || a % DAYS_PER_WEEK === 0) &&
    (b === 0 || b % DAYS_PER_WEEK === 0) &&
    (a >= DAYS_PER_WEEK || b >= DAYS_PER_WEEK)
  ) {
    return "week";
  }
  return "day";
}

function daysToUnitValue(unit, days) {
  const d = Math.max(0, Number(days) || 0);
  if (unit === "week") return Math.max(0, Math.round(d / DAYS_PER_WEEK));
  if (unit === "month") return Math.max(0, Math.round(d / DAYS_PER_MONTH));
  return d;
}

function focusedRelativeValue() {
  return state.dueRelativeFocus === "to"
    ? Number(state.dueRelativeValueTo) || 0
    : Number(state.dueRelativeValueFrom) || 0;
}

function wireDueDateInput(inputEl, side) {
  if (!inputEl || inputEl.dataset.dueWired === "1") return;
  inputEl.dataset.dueWired = "1";
  const key = side === "to" ? "to" : "from";
  const onFocus = () => {
    state.dueRelativeFocus = key;
    const v = focusedRelativeValue();
    state.dueRelativeValue = v;
    if (state.dueRelativeBuffer === "") {
      state.dueRelativeBuffer = v ? String(v) : "";
    }
    syncDueRelativeUI();
  };
  const onPick = () => {
    if (state.syncingDueFromRelative) return;
    state.dueRelativeFocus = key;
    const value = inputEl.value;
    if (key === "from") {
      if (!planDueDateTo?.value) {
        if (planDueDateTo) planDueDateTo.value = value;
      }
    } else if (!planDueDate?.value) {
      if (planDueDate) planDueDate.value = value;
    }
    syncRelativeFromRange();
    updateWindowNote();
  };
  inputEl.addEventListener("focus", onFocus);
  inputEl.addEventListener("click", onFocus);
  inputEl.addEventListener("change", onPick);
  inputEl.addEventListener("input", onPick);
}

function resetDueRelative() {
  state.dueRelativeUnit = "day";
  state.dueRelativeValue = 0;
  state.dueRelativeValueFrom = 0;
  state.dueRelativeValueTo = 0;
  state.dueRelativeBuffer = "";
  state.dueRelativeFocus = "from";
}

/**
 * 相対日数計算の基準日。
 * 「本日実施した内容の記録」に実施日が入力・有効化されていればその日付を、
 * それ以外（今日のまま／未入力）は今日を基準にする。
 */
function dueRelativeBaselineDate() {
  return state.baselineDate || todayStr();
}

/**
 * 「本日実施した内容の記録」の実施日欄が変わったら、相対日数の基準日も
 * 追従させる。すでに次回予定（相対指定）が入力済みなら、新しい基準日で
 * 予定日を再計算する。
 */
function syncBaselineFromDoneDate() {
  const usingDone = Boolean(
    planDoneCheck?.checked && planDoneDate && !planDoneDate.disabled && planDoneDate.value
  );
  state.baselineDate = usingDone ? planDoneDate.value : todayStr();
  if (planDueDate?.value || planDueDateTo?.value) {
    syncRelativeFromRange();
  }
  updateWindowNote();
}

function syncRelativeFromRange() {
  const from = planDueDate?.value || "";
  const to = planDueDateTo?.value || from;
  const start = from || to;
  const end = to || from;
  if (!start && !end) {
    resetDueRelative();
    syncDueRelativeUI();
    return;
  }
  const base = dueRelativeBaselineDate();
  const daysFrom = start ? daysBetween(base, start) : 0;
  const daysTo = end ? daysBetween(base, end) : daysFrom;
  if (daysFrom == null && daysTo == null) return;
  const df = Math.max(0, daysFrom || 0);
  const dt = Math.max(0, daysTo || 0);
  const unit = pickSharedRelativeUnit(df, dt);
  state.dueRelativeUnit = unit;
  state.dueRelativeValueFrom = daysToUnitValue(unit, df);
  state.dueRelativeValueTo = daysToUnitValue(unit, dt);
  const focused = focusedRelativeValue();
  state.dueRelativeValue = focused;
  state.dueRelativeBuffer = String(focused);
  syncDueRelativeUI();
}

function applyDueRelativeToCalendar() {
  const buffered = Number(state.dueRelativeBuffer);
  const value =
    buffered >= 0 && state.dueRelativeBuffer !== ""
      ? buffered
      : Number(state.dueRelativeValue) || 0;
  const focus = state.dueRelativeFocus === "to" ? "to" : "from";
  const date = addDays(dueRelativeBaselineDate(), unitToDays(state.dueRelativeUnit, value));
  const prevFrom = planDueDate?.value || "";
  const prevTo = planDueDateTo?.value || "";

  if (focus === "from") {
    state.dueRelativeValueFrom = value;
    const toWasLinked = !prevTo || prevTo === prevFrom;
    if (toWasLinked) {
      state.dueRelativeValueTo = value;
      writeDueRangeInputs(date, date);
    } else {
      writeDueRangeInputs(date, prevTo);
    }
    state.dueRelativeFocus = "to";
    state.dueRelativeBuffer = "";
    state.dueRelativeValue = state.dueRelativeValueTo;
  } else {
    state.dueRelativeValueTo = value;
    writeDueRangeInputs(prevFrom || date, date);
    state.dueRelativeBuffer = String(value);
    state.dueRelativeValue = value;
  }
  updateWindowNote();
  syncDueRelativeUI();
}

function buildPlanDueRelativeUI() {
  mountNumpad(planDueNumpad, {
    onDigit: (d) => {
      if (state.dueRelativeBuffer.length >= 4) return;
      state.dueRelativeBuffer =
        state.dueRelativeBuffer === "0" ? d : state.dueRelativeBuffer + d;
      syncDueRelativeUI();
    },
    onDelete: () => {
      state.dueRelativeBuffer = state.dueRelativeBuffer.slice(0, -1);
      syncDueRelativeUI();
    },
    onConfirm: () => {
      const n = Number(state.dueRelativeBuffer);
      if (state.dueRelativeBuffer === "" || Number.isNaN(n) || n < 0) {
        deps.showError(planError, "相対日数は0以上の数値を入力し、「確定」してください。");
        return;
      }
      if (n < 1) {
        deps.showError(
          planError,
          "1以上の相対日数を入力するか、カレンダーで日付を選んでください。"
        );
        return;
      }
      deps.showError(planError, "");
      applyDueRelativeToCalendar();
    },
  });
  syncDueRelativeUI();
}

function syncDueRelativeUI() {
  const onUnitSelect = (unit) => {
    const prevUnit = state.dueRelativeUnit;
    if (state.dueRelativeBuffer !== "") {
      const n = Number(state.dueRelativeBuffer) || 0;
      if (state.dueRelativeFocus === "to") state.dueRelativeValueTo = n;
      else state.dueRelativeValueFrom = n;
    }
    const convert = (v) => daysToUnitValue(unit, unitToDays(prevUnit, v));
    state.dueRelativeUnit = unit;
    state.dueRelativeValueFrom = convert(state.dueRelativeValueFrom);
    state.dueRelativeValueTo = convert(state.dueRelativeValueTo);
    const focused = focusedRelativeValue();
    state.dueRelativeValue = focused;
    const zeroBoth = state.dueRelativeValueFrom === 0 && state.dueRelativeValueTo === 0;
    state.dueRelativeBuffer = focused > 0 || zeroBoth ? String(focused) : "";
    if (state.dueRelativeValueFrom > 0 || state.dueRelativeValueTo > 0 || planDueDate?.value) {
      const base = dueRelativeBaselineDate();
      writeDueRangeInputs(
        addDays(base, unitToDays(unit, state.dueRelativeValueFrom)),
        addDays(base, unitToDays(unit, state.dueRelativeValueTo))
      );
      updateWindowNote();
    }
    syncDueRelativeUI();
  };

  mountUnitButtons(planDueUnits, state.dueRelativeUnit, onUnitSelect);
  if (planDueDisplay) {
    const unit = state.dueRelativeUnit;
    const fromN =
      state.dueRelativeFocus === "from" && state.dueRelativeBuffer !== ""
        ? state.dueRelativeBuffer
        : String(state.dueRelativeValueFrom ?? 0);
    const toN =
      state.dueRelativeFocus === "to" && state.dueRelativeBuffer !== ""
        ? state.dueRelativeBuffer
        : String(state.dueRelativeValueTo ?? 0);
    planDueDisplay.textContent =
      String(fromN) === String(toN)
        ? formatRelativeOffsetLabel(unit, fromN === "" ? 0 : fromN)
        : `${fromN || 0}〜${formatRelativeOffsetLabel(unit, toN === "" ? 0 : toN)}`;
  }
  document.querySelectorAll("#procedure-plan-due-field .exam-due-compact__date-pair[data-due-side]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.dueSide === state.dueRelativeFocus);
  });
}

function updateWindowNote() {
  if (!planWindowNote) return;
  const { from, to } = readDueRangeForSave();
  const end = to || from;
  if (!end) {
    planWindowNote.textContent = "";
    return;
  }
  const info = getPlanDueCountdown({
    dueDate: end,
    dueDateFrom: from || end,
    dueDateTo: end,
    baselineDate: dueRelativeBaselineDate(),
  });
  planWindowNote.textContent = info ? `予定日: ${formatDueCountdown(info)}` : "";
  planWindowNote.className = `field__note ${dueLevelClass(info?.level || "far")}`;
}

// --- 予定モーダル --------------------------------------------------------

/** 保存ボタンの文言。モードで意味が変わるため合わせる。 */
function procedurePlanSaveButtonLabel() {
  return state.registerMode === "history" ? "追加する" : "保存する";
}

/**
 * 「予定を登録」／「実施を記録」の切り替え。
 * history では予定日セクションを隠し、実施日のみの単独フォームにする
 * （予定を経由せず、その場で処置の実施だけを記録する場面を想定）。
 * plan では、次回予定に加えて「本日実施した内容の記録（任意）」も
 * 同じ画面で入力できる（編集時は対象外、常に予定のみを扱う）。
 */
function setRegisterMode(mode) {
  const isHistory = mode === "history";
  state.registerMode = isHistory ? "history" : "plan";

  btnPlanModePlan?.classList.toggle("is-active", !isHistory);
  btnPlanModePlan?.setAttribute("aria-pressed", String(!isHistory));
  btnPlanModeHistory?.classList.toggle("is-active", isHistory);
  btnPlanModeHistory?.setAttribute("aria-pressed", String(isHistory));

  if (planDueField) planDueField.hidden = isHistory;
  if (planDoneField) planDoneField.hidden = isHistory || state.editingPlanId != null;
  if (planHistDateField) planHistDateField.hidden = !isHistory;
  if (btnPlanComplete) btnPlanComplete.hidden = isHistory || state.editingPlanId == null;

  if (btnPlanSave && !btnPlanSave.disabled) {
    btnPlanSave.textContent = procedurePlanSaveButtonLabel();
  }
}

/** 「本日実施した内容の記録」の実施日／メモ欄の有効・無効を切り替える。 */
function syncPlanDoneBlockVisibility() {
  const on = Boolean(planDoneCheck?.checked);
  if (planDoneBlock) planDoneBlock.classList.toggle("is-disabled", !on);
  if (planDoneDate) planDoneDate.disabled = !on;
  if (planDoneNote) planDoneNote.disabled = !on;
  if (btnDoneModeContinuous) btnDoneModeContinuous.disabled = !on;
  if (btnDoneModeSingle) btnDoneModeSingle.disabled = !on;
}

/** 「継続として記録」／「単発として記録」の切り替え。 */
function setDoneRecordMode(mode) {
  const normalized = mode === "single" ? "single" : "continuous";
  state.doneRecordMode = normalized;
  btnDoneModeContinuous?.classList.toggle("is-active", normalized === "continuous");
  btnDoneModeContinuous?.setAttribute("aria-pressed", String(normalized === "continuous"));
  btnDoneModeSingle?.classList.toggle("is-active", normalized === "single");
  btnDoneModeSingle?.setAttribute("aria-pressed", String(normalized === "single"));
  if (planDoneRecordModeNote) {
    planDoneRecordModeNote.textContent =
      normalized === "single"
        ? "処置履歴には残さず、中央カラムの時系列にこの日の出来事として記録します。"
        : "この処置の実施履歴として蓄積され、状態モードの処置ブロックに表示されます。";
  }
}

function openPlanModal(mode, plan = null) {
  state.editingPlanId = mode === "edit" && plan ? plan.id : null;
  if (planModalTitle) {
    planModalTitle.textContent =
      mode === "edit" ? "処置予定を編集" : "処置予定を登録";
  }
  if (planContent) planContent.value = plan?.content || "";
  if (planNote) planNote.value = plan?.note || "";
  state.baselineDate = plan?.baselineDate || todayStr();
  const range = getPlanDueRange(plan || {});
  const dueFrom = range.from || plan?.dueDate || "";
  const dueTo = range.to || dueFrom;
  writeDueRangeInputs(dueFrom, dueTo);
  state.dueRelativeFocus = "from";
  if (dueFrom || dueTo) {
    syncRelativeFromRange();
  } else {
    resetDueRelative();
    syncDueRelativeUI();
  }
  if (planDoneCheck) planDoneCheck.checked = false;
  if (planDoneDate) planDoneDate.value = todayStr();
  if (planDoneNote) planDoneNote.value = "";
  setDoneRecordMode("continuous");
  syncPlanDoneBlockVisibility();
  updateWindowNote();
  if (planHistDate) planHistDate.value = todayStr();
  // 新規登録時のみ「実施を記録」への切替を出す。編集は常に予定として扱う。
  if (planModeToggle) planModeToggle.hidden = mode === "edit";
  setRegisterMode("plan");
  if (btnPlanComplete) btnPlanComplete.hidden = mode !== "edit";
  deps.showError(planError, "");
  if (planModal) planModal.hidden = false;
  updateLastDoneHint();
  setTimeout(() => planContent?.focus(), 0);
}

function closePlanModal() {
  state.editingPlanId = null;
  if (planModal) planModal.hidden = true;
  deps.showError(planError, "");
}

async function handlePlanSave() {
  if (state.registerMode === "history") {
    await handleProcedureHistoryOnlySave();
    return;
  }

  const content = (planContent?.value || "").trim();
  const dueBuffered = Number(state.dueRelativeBuffer);
  if (state.dueRelativeBuffer !== "" && dueBuffered >= 1) {
    applyDueRelativeToCalendar();
  }
  const { from: dueDateFrom, to: dueDateTo } = readDueRangeForSave();
  const dueDate = dueDateTo || dueDateFrom;
  const note = (planNote?.value || "").trim();
  // 次回予定と実施記録は独立。どちらか一方、または両方で保存できる。
  const saveDoneHistory =
    Boolean(planDoneCheck?.checked) && planDoneField && !planDoneField.hidden;
  const doneDate = planDoneDate?.value || "";
  const doneNote = (planDoneNote?.value || "").trim();
  const savePlan = Boolean(dueDate);

  if (!content) {
    deps.showError(planError, "処置内容を入力してください。");
    return;
  }
  if (!savePlan && !saveDoneHistory) {
    deps.showError(
      planError,
      "予定日を入力するか、「実施履歴に登録する」にチェックしてください。"
    );
    return;
  }
  if (saveDoneHistory && !doneDate) {
    deps.showError(planError, "実施日を選択してください。");
    return;
  }
  if (!state.karteNumber) {
    deps.showError(planError, "カルテを開いてから操作してください。");
    return;
  }

  deps.showError(planError, "");
  deps.setBusy(btnPlanSave, true, "保存中...", "保存する");
  try {
    if (savePlan) {
      await saveProcedurePlan(state.karteNumber, {
        planId: state.editingPlanId,
        content,
        dueDate,
        dueDateFrom,
        dueDateTo,
        note,
        baselineDate: state.baselineDate || todayStr(),
        source: "manual",
      });
    }
    const doneAsSingleEvent = saveDoneHistory && state.doneRecordMode === "single";

    if (saveDoneHistory && !doneAsSingleEvent) {
      await addProcedure(state.karteNumber, {
        date: doneDate,
        content,
        note: doneNote,
        source: "manual",
      });
    }

    if (doneAsSingleEvent) {
      await addEntry(state.karteNumber, {
        recordDate: doneDate,
        headline: `${content}実施`,
        body: doneNote,
        category: "none",
        important: false,
        changed: false,
        author: deps.getSelectedAuthor?.() || "",
        source: "manual",
      });
    }

    closePlanModal();
    deps.showToast(
      savePlan && saveDoneHistory
        ? doneAsSingleEvent
          ? "予定を保存し、実施内容を時系列に記録しました。"
          : "予定と本日の実施内容を保存しました。"
        : saveDoneHistory
          ? doneAsSingleEvent
            ? "実施内容を時系列に記録しました。"
            : "実施内容を保存しました。"
          : state.editingPlanId
            ? "予定を更新しました。"
            : "予定を登録しました。"
    );
  } catch (err) {
    console.error(err);
    deps.showError(planError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnPlanSave, false, "保存中...", "保存する");
  }
}

/**
 * 「実施を記録」モードの保存。予定は作らず、実施履歴にだけ直接追加する。
 */
async function handleProcedureHistoryOnlySave() {
  const content = (planContent?.value || "").trim();
  const date = planHistDate?.value || "";
  const note = (planNote?.value || "").trim();

  if (!content) {
    deps.showError(planError, "処置内容を入力してください。");
    return;
  }
  if (!date) {
    deps.showError(planError, "実施日を選択してください。");
    return;
  }
  if (!state.karteNumber) {
    deps.showError(planError, "カルテを開いてから操作してください。");
    return;
  }

  deps.showError(planError, "");
  const label = procedurePlanSaveButtonLabel();
  deps.setBusy(btnPlanSave, true, "追加中...", label);
  try {
    await addProcedure(state.karteNumber, { date, content, note, source: "manual" });
    closePlanModal();
    deps.showToast("実施履歴に追加しました。");
  } catch (err) {
    console.error(err);
    deps.showError(planError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnPlanSave, false, "追加中...", label);
  }
}

async function handleCompletePlan(plan) {
  if (!plan?.id || !state.karteNumber) return;
  const label = plan.content || "処置";
  const ok = window.confirm(
    `「${label}」を完了として実施履歴に移しますか？\n実施日は本日（${ymdFromStr(todayStr())}）になります。`
  );
  if (!ok) return;
  try {
    await completeProcedurePlan(state.karteNumber, plan.id, {
      date: todayStr(),
      content: plan.content || "",
      note: plan.note || "",
    });
    deps.showToast("完了として実施履歴に移しました。");
    closePlanModal();
  } catch (err) {
    console.error(err);
    deps.showToast("完了処理に失敗しました。", { isError: true });
  }
}

async function handlePlanCompleteFromModal() {
  const plan = state.plans.find((p) => p.id === state.editingPlanId);
  if (!plan) {
    deps.showError(planError, "編集中の予定が見つかりません。");
    return;
  }
  // モーダル上の最新入力を反映してから完了
  const content = (planContent?.value || "").trim();
  const note = (planNote?.value || "").trim();
  const dueBuffered = Number(state.dueRelativeBuffer);
  if (state.dueRelativeBuffer !== "" && dueBuffered >= 1) {
    applyDueRelativeToCalendar();
  }
  const { from: dueDateFrom, to: dueDateTo } = readDueRangeForSave();
  const dueDate = dueDateTo || dueDateFrom;
  if (!content) {
    deps.showError(planError, "処置内容を入力してください。");
    return;
  }
  if (dueDate || note !== (plan.note || "") || content !== (plan.content || "")) {
    try {
      await saveProcedurePlan(state.karteNumber, {
        planId: plan.id,
        content,
        dueDate: dueDate || plan.dueDate || todayStr(),
        dueDateFrom: dueDateFrom || dueDate || plan.dueDateFrom || plan.dueDate,
        dueDateTo: dueDateTo || dueDate || plan.dueDateTo || plan.dueDate,
        note,
        baselineDate: todayStr(),
      });
    } catch (err) {
      console.error(err);
      deps.showError(planError, "保存に失敗したため完了できませんでした。");
      return;
    }
  }
  await handleCompletePlan({ ...plan, content, note });
}

async function handleRevive(item) {
  const label = item.content || "処置";
  const ok = window.confirm(
    `「${label}」を処置予定一覧に戻しますか？\n予定日は未設定のまま戻ります（実施履歴はそのまま残ります）。`
  );
  if (!ok) return;
  try {
    const planId = await reviveProcedurePlan(state.karteNumber, {
      content: item.content || "",
      note: item.note || "",
    });
    deps.showToast("予定に戻しました。予定日を入力してください。");
    // 購読反映後に編集を開く
    const openWhenReady = (attempt = 0) => {
      const plan = state.plans.find((p) => p.id === planId);
      if (plan) {
        openPlanModal("edit", plan);
        return;
      }
      if (attempt < 30) setTimeout(() => openWhenReady(attempt + 1), 40);
    };
    openWhenReady();
  } catch (err) {
    console.error(err);
    deps.showToast("予定に戻す操作に失敗しました。", { isError: true });
  }
}

// --- 実施履歴モーダル ----------------------------------------------------

function openHistModal(mode, item = null) {
  state.editingHistoryId = mode === "edit" && item ? item.id : null;
  state.editingHistoryStore =
    mode === "edit" && item ? item.store || "history" : "history";

  if (histModalTitle) {
    histModalTitle.textContent =
      mode === "edit" ? "実施履歴を編集" : "実施を記録";
  }
  if (histDate) histDate.value = item?.date || todayStr();
  if (histContent) histContent.value = item?.content || "";
  if (histNote) histNote.value = item?.note || "";

  deps.showError(histError, "");
  if (btnHistSave) btnHistSave.textContent = mode === "edit" ? "保存する" : "追加する";
  if (histModal) histModal.hidden = false;
  setTimeout(() => histContent?.focus(), 0);
}

function closeHistModal() {
  state.editingHistoryId = null;
  state.editingHistoryStore = "history";
  if (histModal) histModal.hidden = true;
  deps.showError(histError, "");
}

async function handleHistSave() {
  const date = histDate?.value || "";
  const content = (histContent?.value || "").trim();
  const note = (histNote?.value || "").trim();

  if (!date) {
    deps.showError(histError, "実施日を選択してください。");
    return;
  }
  if (!content) {
    deps.showError(histError, "処置内容を入力してください。");
    return;
  }
  if (!state.karteNumber) {
    deps.showError(histError, "カルテを開いてから操作してください。");
    return;
  }

  deps.showError(histError, "");
  const idleLabel = state.editingHistoryId ? "保存する" : "追加する";
  deps.setBusy(btnHistSave, true, "保存中...", idleLabel);

  try {
    if (state.editingHistoryId) {
      await updateProcedure(
        state.karteNumber,
        state.editingHistoryId,
        { date, content, note },
        { store: state.editingHistoryStore }
      );
      closeHistModal();
      deps.showToast("編集内容を保存しました。");
    } else {
      await addProcedure(state.karteNumber, {
        date,
        content,
        note,
        source: "manual",
      });
      closeHistModal();
      deps.showToast("実施履歴に追加しました。");
    }
  } catch (err) {
    console.error(err);
    deps.showError(histError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnHistSave, false, "保存中...", idleLabel);
  }
}
