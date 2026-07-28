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
} from "./db.js";
import {
  getDueCountdown,
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
  dueRelativeBuffer: "",
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
const planDueDate = document.getElementById("procedure-plan-due-date");
const planDueUnits = document.getElementById("procedure-plan-due-units");
const planDueDisplay = document.getElementById("procedure-plan-due-display");
const planDueNumpad = document.getElementById("procedure-plan-due-numpad");
const planWindowNote = document.getElementById("procedure-plan-window-note");
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

  btnCloseHistModal?.addEventListener("click", closeHistModal);
  btnHistCancel?.addEventListener("click", closeHistModal);
  histModal?.querySelector("[data-close-modal]")?.addEventListener("click", closeHistModal);
  btnHistSave?.addEventListener("click", handleHistSave);

  wireDueDateInput(planDueDate);
  planDueDate?.addEventListener("click", () => openDueCalendarPicker(planDueDate));
}

export function enterProcedures(karteNumber) {
  leaveProcedures();
  state.karteNumber = karteNumber;
  state.unsubscribe = subscribeProcedureBundle(karteNumber, (bundle) => {
    state.plans = bundle.plans || [];
    state.history = bundle.history || [];
    renderAll();
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

// --- 描画 ----------------------------------------------------------------

function renderAll() {
  renderPlanList();
  renderHistoryList();
  updateProcTabDueAlert();
}

function updateProcTabDueAlert() {
  const levels = (state.plans || [])
    .map((plan) => {
      if (!plan?.dueDate) return null;
      return getDueCountdown(plan.dueDate, plan.baselineDate || null)?.level || null;
    })
    .filter(Boolean);
  setRightTabDueAlert("proc", maxDueAlertLevel(levels));
}

function renderPlanList() {
  if (!planList) return;
  planList.innerHTML = "";
  const plans = state.plans;
  if (planEmpty) planEmpty.hidden = plans.length > 0;

  plans.forEach((plan) => {
    const countdown = plan.dueDate
      ? getDueCountdown(plan.dueDate, plan.baselineDate || null)
      : null;
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

  items.forEach((item) => {
    histList.appendChild(createHistoryCard(item));
  });
}

function createHistoryCard(item) {
  const li = document.createElement("li");
  li.className = "proc-card";
  li.dataset.entryId = item.id;
  li.dataset.store = item.store || "history";

  const dateEl = document.createElement("p");
  dateEl.className = "proc-card__date";
  dateEl.textContent = ymdFromStr(item.date) || "（日付なし）";

  const contentEl = document.createElement("p");
  contentEl.className = "proc-card__content";
  contentEl.textContent = item.content || "（内容なし）";

  li.append(dateEl, contentEl);

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
        onClick: async () => {
          const ok = window.confirm("この実施履歴を削除しますか？");
          if (!ok) return;
          try {
            await deleteProcedure(state.karteNumber, item.id, {
              store: item.store || "history",
            });
            deps.showToast("削除しました。");
          } catch (err) {
            console.error(err);
            deps.showToast("削除に失敗しました。", { isError: true });
          }
        },
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

function wireDueDateInput(inputEl) {
  if (!inputEl || inputEl.dataset.dueWired === "1") return;
  inputEl.dataset.dueWired = "1";
  const onPick = () => {
    if (state.syncingDueFromRelative) return;
    syncRelativeFromCalendar(inputEl.value);
    updateWindowNote();
  };
  inputEl.addEventListener("change", onPick);
  inputEl.addEventListener("input", onPick);
}

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

function resetDueRelative() {
  state.dueRelativeUnit = "day";
  state.dueRelativeValue = 0;
  state.dueRelativeBuffer = "";
}

function syncRelativeFromCalendar(dateStr) {
  if (!dateStr) {
    resetDueRelative();
    syncDueRelativeUI();
    return;
  }
  const days = daysBetween(todayStr(), dateStr);
  if (days == null) return;
  if (days < 0) {
    state.dueRelativeUnit = "day";
    state.dueRelativeValue = 0;
    state.dueRelativeBuffer = "0";
  } else {
    const expressed = expressDaysAsRelative(days);
    state.dueRelativeUnit = expressed.unit;
    state.dueRelativeValue = expressed.value;
    state.dueRelativeBuffer = String(expressed.value);
  }
  syncDueRelativeUI();
}

function applyDueRelativeToCalendar() {
  const buffered = Number(state.dueRelativeBuffer);
  const value =
    buffered >= 0 && state.dueRelativeBuffer !== ""
      ? buffered
      : Number(state.dueRelativeValue) || 0;
  state.dueRelativeValue = value;
  state.dueRelativeBuffer = String(value);
  const days = unitToDays(state.dueRelativeUnit, value);
  const date = addDays(todayStr(), days);
  state.syncingDueFromRelative = true;
  if (planDueDate) planDueDate.value = date;
  state.syncingDueFromRelative = false;
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
    const prevValue =
      state.dueRelativeBuffer !== ""
        ? Number(state.dueRelativeBuffer) || 0
        : Number(state.dueRelativeValue) || 0;
    const days = unitToDays(prevUnit, prevValue);
    let nextValue = days;
    if (unit === "week") nextValue = Math.max(0, Math.round(days / DAYS_PER_WEEK));
    else if (unit === "month") nextValue = Math.max(0, Math.round(days / DAYS_PER_MONTH));
    state.dueRelativeUnit = unit;
    state.dueRelativeValue = nextValue;
    state.dueRelativeBuffer = nextValue > 0 || days === 0 ? String(nextValue) : "";
    if (nextValue > 0 || planDueDate?.value) {
      applyDueRelativeToCalendar();
    } else {
      syncDueRelativeUI();
    }
  };

  mountUnitButtons(planDueUnits, state.dueRelativeUnit, onUnitSelect);
  if (planDueDisplay) {
    const shown =
      state.dueRelativeBuffer !== ""
        ? state.dueRelativeBuffer
        : String(state.dueRelativeValue ?? "");
    planDueDisplay.textContent = formatRelativeOffsetLabel(
      state.dueRelativeUnit,
      shown === "" ? 0 : shown
    );
  }
}

function updateWindowNote() {
  if (!planWindowNote) return;
  const due = planDueDate?.value || "";
  if (!due) {
    planWindowNote.textContent = "";
    return;
  }
  const info = getDueCountdown(due, todayStr());
  planWindowNote.textContent = info
    ? `予定日: ${formatDueCountdown(info)}`
    : "";
  planWindowNote.className = `field__note ${dueLevelClass(info?.level || "far")}`;
}

// --- 予定モーダル --------------------------------------------------------

function openPlanModal(mode, plan = null) {
  state.editingPlanId = mode === "edit" && plan ? plan.id : null;
  if (planModalTitle) {
    planModalTitle.textContent =
      mode === "edit" ? "処置予定を編集" : "処置予定を登録";
  }
  if (planContent) planContent.value = plan?.content || "";
  if (planNote) planNote.value = plan?.note || "";
  const due = plan?.dueDate || "";
  if (planDueDate) planDueDate.value = due;
  if (due) {
    syncRelativeFromCalendar(due);
  } else {
    resetDueRelative();
    syncDueRelativeUI();
  }
  updateWindowNote();
  if (btnPlanComplete) btnPlanComplete.hidden = mode !== "edit";
  deps.showError(planError, "");
  if (planModal) planModal.hidden = false;
  setTimeout(() => planContent?.focus(), 0);
}

function closePlanModal() {
  state.editingPlanId = null;
  if (planModal) planModal.hidden = true;
  deps.showError(planError, "");
}

async function handlePlanSave() {
  const content = (planContent?.value || "").trim();
  const dueBuffered = Number(state.dueRelativeBuffer);
  if (state.dueRelativeBuffer !== "" && dueBuffered >= 1) {
    applyDueRelativeToCalendar();
  }
  const dueDate = planDueDate?.value || "";
  const note = (planNote?.value || "").trim();

  if (!content) {
    deps.showError(planError, "処置内容を入力してください。");
    return;
  }
  if (!dueDate) {
    deps.showError(planError, "予定日を選択してください。");
    return;
  }
  if (!state.karteNumber) {
    deps.showError(planError, "カルテを開いてから操作してください。");
    return;
  }

  deps.showError(planError, "");
  deps.setBusy(btnPlanSave, true, "保存中...", "保存する");
  try {
    await saveProcedurePlan(state.karteNumber, {
      planId: state.editingPlanId,
      content,
      dueDate,
      note,
      baselineDate: todayStr(),
      source: "manual",
    });
    closePlanModal();
    deps.showToast(state.editingPlanId ? "予定を更新しました。" : "予定を登録しました。");
  } catch (err) {
    console.error(err);
    deps.showError(planError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnPlanSave, false, "保存中...", "保存する");
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
  const dueDate = planDueDate?.value || "";
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
