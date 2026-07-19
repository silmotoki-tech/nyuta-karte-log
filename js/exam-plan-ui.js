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

const QUICK_OFFSETS = [
  { label: "2週間後", months: 0, days: 14 },
  { label: "1ヶ月後", months: 1, days: 0 },
  { label: "3ヶ月後", months: 3, days: 0 },
  { label: "6ヶ月後", months: 6, days: 0 },
  { label: "1年後", months: 12, days: 0 },
];

const DEFAULT_WINDOW_DAYS = 14;
const APPROACHING_DAYS = 7;

const INTERVAL_OPTIONS = [1, 2, 3, 6, 12];

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
    intervalMonths: 3,
    mode: "create", // create | edit | afterComplete
  },
  editingExamItemId: null,
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
const planQuickDates = document.getElementById("exam-plan-quick-dates");
const planWindowNote = document.getElementById("exam-plan-window-note");
const planNote = document.getElementById("exam-plan-note");
const planRecurringCheck = document.getElementById("exam-plan-enable-recurring");
const planIntervalSelect = document.getElementById("exam-plan-interval");
const planRecurringFields = document.getElementById("exam-plan-recurring-fields");
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
 * 基準日 + ○ヶ月 を中心に、幅を持たせた目安期間を作る。
 */
export function computeDueWindow(baseDateStr, intervalMonths, windowDays = DEFAULT_WINDOW_DAYS) {
  const target = addMonths(baseDateStr, intervalMonths);
  if (!target) return null;
  return {
    dueDateFrom: addDays(target, -windowDays),
    dueDateTo: addDays(target, windowDays),
    targetDate: target,
  };
}

/**
 * カレンダーで選んだ単一日付を、±windowDays の目安期間に広げる。
 */
export function expandSingleDate(dateStr, windowDays = DEFAULT_WINDOW_DAYS) {
  if (!dateStr) return null;
  return {
    dueDateFrom: addDays(dateStr, -windowDays),
    dueDateTo: addDays(dateStr, windowDays),
    targetDate: dateStr,
  };
}

/**
 * 期限ステータスを返す: "ok" | "approaching" | "in_window" | "overdue"
 */
export function getDueStatus(nextPlan, today = todayStr()) {
  if (!nextPlan?.dueDateFrom || !nextPlan?.dueDateTo) return "ok";
  const { dueDateFrom, dueDateTo } = nextPlan;
  if (today > dueDateTo) return "overdue";
  if (today >= dueDateFrom && today <= dueDateTo) return "in_window";
  const daysUntilFrom = daysBetween(today, dueDateFrom);
  if (daysUntilFrom != null && daysUntilFrom <= APPROACHING_DAYS) return "approaching";
  return "ok";
}

function formatDueRange(from, to) {
  if (!from && !to) return "";
  if (from === to) return ymdFromStr(from);
  return `${ymdFromStr(from)} 〜 ${ymdFromStr(to)}`;
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
  buildQuickDateButtons();
  buildIntervalSelect();

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
    nextPlanCard.classList.remove("is-alert", "is-overdue");
    return;
  }

  nextPlanEmpty.hidden = true;
  nextPlanBody.hidden = false;
  nextPlanItem.textContent = next.item || "（項目未設定）";
  nextPlanDate.textContent = formatDueRange(next.dueDateFrom, next.dueDateTo);
  if (next.note) {
    nextPlanNote.hidden = false;
    nextPlanNote.textContent = next.note;
  } else {
    nextPlanNote.hidden = true;
    nextPlanNote.textContent = "";
  }

  const status = getDueStatus(next);
  nextPlanCard.classList.toggle("is-alert", status === "approaching" || status === "in_window");
  nextPlanCard.classList.toggle("is-overdue", status === "overdue");

  if (status === "overdue") {
    nextPlanAlert.hidden = false;
    nextPlanAlert.textContent = "期限超過";
    nextPlanAlert.className = "exam-alert exam-alert--overdue";
  } else if (status === "in_window") {
    nextPlanAlert.hidden = false;
    nextPlanAlert.textContent = "実施目安期間です";
    nextPlanAlert.className = "exam-alert exam-alert--window";
  } else if (status === "approaching") {
    nextPlanAlert.hidden = false;
    nextPlanAlert.textContent = "期限が近づいています";
    nextPlanAlert.className = "exam-alert exam-alert--approaching";
  } else {
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
    const window = r.windowDays ?? DEFAULT_WINDOW_DAYS;
    meta.textContent = `${r.intervalMonths}ヶ月ごと　最終実施: ${
      r.lastDone ? ymdFromStr(r.lastDone) : "未設定"
    }　（目安 ±${window}日）`;
    info.append(title, meta);

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
  const window = computeDueWindow(
    recurring.lastDone,
    recurring.intervalMonths,
    recurring.windowDays ?? DEFAULT_WINDOW_DAYS
  );
  if (!window) return;

  const overwrite = state.plan.nextPlan
    ? window.confirm("現在の次回予定を上書きして反映しますか？")
    : true;
  if (!overwrite) return;

  try {
    await setNextExamPlan(state.karteNumber, {
      item: recurring.item,
      dueDateFrom: window.dueDateFrom,
      dueDateTo: window.dueDateTo,
      note: `${recurring.intervalMonths}ヶ月ごとの定期検査（目安）`,
      recurringId: recurring.id,
    });
    deps.showToast("次回予定に反映しました。");
  } catch (err) {
    console.error(err);
    deps.showToast("反映に失敗しました。", { isError: true });
  }
}

function openRecurringEdit(recurring) {
  const months = window.prompt(
    `「${recurring.item}」の間隔（ヶ月）を入力`,
    String(recurring.intervalMonths || 3)
  );
  if (months == null) return;
  const intervalMonths = Number(months);
  if (!intervalMonths || intervalMonths < 1) {
    deps.showToast("1以上の数値を入力してください。", { isError: true });
    return;
  }
  const lastDone = window.prompt(
    "最終実施日（YYYY-MM-DD）。空欄でクリア",
    recurring.lastDone || todayStr()
  );
  if (lastDone == null) return;
  if (lastDone && !/^\d{4}-\d{2}-\d{2}$/.test(lastDone)) {
    deps.showToast("日付は YYYY-MM-DD 形式で入力してください。", { isError: true });
    return;
  }

  updateExamRecurring(state.karteNumber, recurring.id, {
    intervalMonths,
    lastDone: lastDone || "",
  })
    .then(() => deps.showToast("定期スケジュールを更新しました。"))
    .catch((err) => {
      console.error(err);
      deps.showToast("更新に失敗しました。", { isError: true });
    });
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

  planDueDate.addEventListener("change", updateWindowNote);
  planIntervalSelect.addEventListener("change", () => {
    state.draft.intervalMonths = Number(planIntervalSelect.value) || 3;
  });
}

function buildQuickDateButtons() {
  planQuickDates.innerHTML = "";
  QUICK_OFFSETS.forEach((q) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-date-btn";
    btn.textContent = q.label;
    btn.addEventListener("click", () => {
      let date = todayStr();
      if (q.months) date = addMonths(date, q.months);
      if (q.days) date = addDays(date, q.days);
      planDueDate.value = date;
      state.draft.dueDate = date;
      updateWindowNote();
    });
    planQuickDates.appendChild(btn);
  });
}

function buildIntervalSelect() {
  planIntervalSelect.innerHTML = "";
  INTERVAL_OPTIONS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = `${m}ヶ月ごと`;
    planIntervalSelect.appendChild(opt);
  });
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
    planWindowNote.textContent = `選択した日付を中心に、前後${DEFAULT_WINDOW_DAYS}日を目安期間として登録します。`;
    return;
  }
  const w = expandSingleDate(date, DEFAULT_WINDOW_DAYS);
  planWindowNote.textContent = `目安期間: ${ymdFromStr(w.dueDateFrom)} 〜 ${ymdFromStr(
    w.dueDateTo
  )}（±${DEFAULT_WINDOW_DAYS}日）`;
}

function openPlanModal(mode, { focusRecurring = false, preset = null } = {}) {
  state.draft.mode = mode;
  const next = state.plan?.nextPlan;

  if (mode === "edit" && next) {
    planModalTitle.textContent = "次回予定を編集";
    state.draft.item = next.item || "";
    state.draft.customItem = "";
    state.draft.dueDate = next.dueDateFrom || "";
    // 編集時は期間の中心（from〜toの中間）ではなく from を初期表示。厳密でなくてよい。
    if (next.dueDateFrom && next.dueDateTo) {
      const mid = addDays(
        next.dueDateFrom,
        Math.floor((daysBetween(next.dueDateFrom, next.dueDateTo) || 0) / 2)
      );
      state.draft.dueDate = mid || next.dueDateFrom;
    }
    state.draft.note = next.note || "";
    state.draft.recurringId = next.recurringId || null;
    state.draft.enableRecurring = false;
  } else if (preset) {
    planModalTitle.textContent = "次の予定を登録";
    state.draft.item = preset.item || "";
    state.draft.customItem = "";
    state.draft.dueDate = preset.dueDate || "";
    state.draft.note = preset.note || "";
    state.draft.recurringId = preset.recurringId || null;
    state.draft.enableRecurring = Boolean(preset.enableRecurring);
    state.draft.intervalMonths = preset.intervalMonths || 3;
  } else {
    planModalTitle.textContent = "次回予定を登録";
    state.draft.item = "";
    state.draft.customItem = "";
    state.draft.dueDate = "";
    state.draft.note = "";
    state.draft.recurringId = null;
    state.draft.enableRecurring = focusRecurring;
    state.draft.intervalMonths = 3;
  }

  planOtherCheck.checked = false;
  planCustomItem.hidden = true;
  planCustomItem.value = "";
  planDueDate.value = state.draft.dueDate;
  planNote.value = state.draft.note;
  planRecurringCheck.checked = state.draft.enableRecurring;
  planRecurringFields.hidden = !state.draft.enableRecurring;
  planIntervalSelect.value = String(state.draft.intervalMonths);
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
  const dueDate = planDueDate.value;
  const note = planNote.value.trim();
  const enableRecurring = planRecurringCheck.checked;
  const intervalMonths = Number(planIntervalSelect.value) || 3;

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
    const window = expandSingleDate(dueDate, DEFAULT_WINDOW_DAYS);
    let recurringId = state.draft.recurringId || null;

    if (enableRecurring) {
      // 定期として登録（最終実施は「今日」ではなく、予定の起点として dueDate の intervalMonths 前でもよいが、
      // 運用上は「これから定期にする」ので lastDone を空、または今日にする）。
      // 次回計算の起点は今回の予定日（実施前）なので、lastDone は空のままにしておき、
      // 完了時に埋める。ただし「次回に反映」で使うため、ここでは lastDone を dueDate - interval 相当にせず空にする。
      recurringId = await addExamRecurring(state.karteNumber, {
        item,
        intervalMonths,
        lastDone: "",
        windowDays: DEFAULT_WINDOW_DAYS,
      });
    }

    await setNextExamPlan(state.karteNumber, {
      item,
      dueDateFrom: window.dueDateFrom,
      dueDateTo: window.dueDateTo,
      note,
      recurringId: recurringId || null,
    });

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
      const window = computeDueWindow(
        date,
        recurring.intervalMonths,
        recurring.windowDays ?? DEFAULT_WINDOW_DAYS
      );
      if (window) {
        suggested = {
          item: recurring.item,
          dueDate: window.targetDate,
          dueDateFrom: window.dueDateFrom,
          dueDateTo: window.dueDateTo,
          note: `${recurring.intervalMonths}ヶ月ごとの定期検査（目安）`,
          recurringId,
          intervalMonths: recurring.intervalMonths,
          enableRecurring: false,
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
    afterSummary.innerHTML = `定期スケジュールに基づく次回目安:<br /><strong>${
      suggested.item
    }</strong><br />${ymdFromStr(suggested.dueDateFrom)} 〜 ${ymdFromStr(suggested.dueDateTo)}`;
    btnAfterNext.textContent = "この目安で次の予定を登録";
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
