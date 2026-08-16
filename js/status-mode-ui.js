// 状態モード: 患者の状態を全画面で一覧する。
// 既存の3カラム画面には手を入れず、同じカルテのデータを別購読で描画する。
// 各項目のタップは、既存タブで使っている編集ポップアップをそのまま開く。

import {
  subscribeMedications,
  subscribeExamPlan,
  subscribeProcedureBundle,
  subscribePatientHistory,
  subscribeSpecialNotes,
} from "./db.js";
import {
  deriveStatus,
  getExpiryStatus,
  isPrnDrug,
  openMedicationDetailById,
  openMedicationAddModal,
  deleteMedicationById,
} from "./meds-ui.js";
import {
  getDueCountdown,
  formatDueCountdown,
  getPlanDueDate,
  getPlanBaselineDate,
  openExamPlanEditorById,
  openExamPlanCreateModal,
  reviveExamHistoryEntryById,
} from "./exam-plan-ui.js";
import {
  openProcedurePlanEditorById,
  openProcedureHistoryEditorById,
  openProcedurePlanCreateModal,
  reviveProcedureHistoryById,
  deleteProcedureHistoryById,
} from "./procedures-ui.js";
import {
  openSpecialNoteEditorById,
  openSpecialNoteCreateModal,
  deleteSpecialNoteById,
} from "./special-notes-ui.js";
import {
  buildHistoryDetailNode,
  openPatientHistoryAddModal,
  deletePatientHistoryEntryById,
} from "./history-ui.js";
import { enableRowGestures } from "./row-gestures.js";

let deps = {
  showToast: () => {},
  onChangeKarte: () => {},
  getPatient: () => ({ karteNumber: "", animalName: "" }),
};

const state = {
  karteNumber: null,
  visible: false,
  drugs: [],
  plan: null,
  procPlans: [],
  procHistory: [],
  historyEntries: [],
  notes: [],
  unsubscribes: [],
};

// --- DOM -----------------------------------------------------------------

const screenStatus = document.getElementById("screen-status");
const layoutEl = document.querySelector("#app-shell .layout");

const patientKarteEl = document.getElementById("status-patient-karte");
const patientNameEl = document.getElementById("status-patient-name");
const btnChangeKarte = document.getElementById("btn-status-change-karte");

const medsList = document.getElementById("status-meds-list");
const medsEmpty = document.getElementById("status-meds-empty");
const medsCount = document.getElementById("status-meds-count");

const examPlanList = document.getElementById("status-exam-plan-list");
const examPlanEmpty = document.getElementById("status-exam-plan-empty");
const examHistoryList = document.getElementById("status-exam-history-list");
const examHistoryEmpty = document.getElementById("status-exam-history-empty");
const examPlanCount = document.getElementById("status-exam-plan-count");
const examHistoryCount = document.getElementById("status-exam-history-count");

const histList = document.getElementById("status-history-list");
const histEmpty = document.getElementById("status-history-empty");
const histCount = document.getElementById("status-history-count");

const procPlanList = document.getElementById("status-proc-plan-list");
const procPlanEmpty = document.getElementById("status-proc-plan-empty");
const procHistoryList = document.getElementById("status-proc-history-list");
const procHistoryEmpty = document.getElementById("status-proc-history-empty");
const procPlanCount = document.getElementById("status-proc-plan-count");
const procHistoryCount = document.getElementById("status-proc-history-count");

const notesList = document.getElementById("status-notes-list");
const notesEmpty = document.getElementById("status-notes-empty");
const notesCount = document.getElementById("status-notes-count");

const btnStatusHistoryAdd = document.getElementById("btn-status-history-add");
const btnStatusExamAdd = document.getElementById("btn-status-exam-add");
const btnStatusMedsAdd = document.getElementById("btn-status-meds-add");
const btnStatusProcAdd = document.getElementById("btn-status-proc-add");
const btnStatusNotesAdd = document.getElementById("btn-status-notes-add");

const detailModal = document.getElementById("status-detail-modal");
const detailTitle = document.getElementById("status-detail-title");
const detailBody = document.getElementById("status-detail-body");
const btnCloseDetail = document.getElementById("btn-close-status-detail");

// --- 日付ヘルパー ---------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateStr(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function ymdFromStr(str) {
  const d = parseDateStr(str);
  if (!d) return "";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function daysBetween(fromStr, toStr) {
  const a = parseDateStr(fromStr);
  const b = parseDateStr(toStr);
  if (!a || !b) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// --- 公開API --------------------------------------------------------------

export function initStatusModeUI(helpers = {}) {
  deps = { ...deps, ...helpers };

  btnChangeKarte?.addEventListener("click", () => deps.onChangeKarte());

  btnStatusHistoryAdd?.addEventListener("click", () => openPatientHistoryAddModal());
  btnStatusExamAdd?.addEventListener("click", () => openExamPlanCreateModal());
  btnStatusMedsAdd?.addEventListener("click", () => openMedicationAddModal());
  btnStatusProcAdd?.addEventListener("click", () => openProcedurePlanCreateModal());
  btnStatusNotesAdd?.addEventListener("click", () => openSpecialNoteCreateModal());

  btnCloseDetail?.addEventListener("click", closeDetailModal);
  detailModal
    ?.querySelector("[data-close-modal]")
    ?.addEventListener("click", closeDetailModal);
}

/** カルテを開いたときに購読を張る。表示・非表示とは独立（切替を即時にするため）。 */
export function enterStatusMode(karteNumber) {
  leaveStatusMode();
  state.karteNumber = karteNumber;

  state.unsubscribes.push(
    subscribeMedications(karteNumber, (drugs) => {
      state.drugs = drugs || [];
      renderMeds();
    })
  );
  state.unsubscribes.push(
    subscribeExamPlan(karteNumber, (plan) => {
      state.plan = plan;
      renderExam();
    })
  );
  state.unsubscribes.push(
    subscribeProcedureBundle(karteNumber, (bundle) => {
      state.procPlans = bundle?.plans || [];
      state.procHistory = bundle?.history || [];
      renderProcedures();
    })
  );
  state.unsubscribes.push(
    subscribePatientHistory(karteNumber, (entries) => {
      state.historyEntries = entries || [];
      renderPatientHistory();
    })
  );
  state.unsubscribes.push(
    subscribeSpecialNotes(karteNumber, (items) => {
      state.notes = items || [];
      renderNotes();
    })
  );

  updatePatientHeader();
}

export function leaveStatusMode() {
  state.unsubscribes.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
  state.unsubscribes = [];
  state.karteNumber = null;
  state.drugs = [];
  state.plan = null;
  state.procPlans = [];
  state.procHistory = [];
  state.historyEntries = [];
  state.notes = [];
  closeDetailModal();
  hideStatusMode();
  renderAll();
}

/** 状態モードを表示する（3カラム画面は隠す。データは購読済みなので再読み込みなし）。 */
export function showStatusMode() {
  if (!screenStatus) return;
  state.visible = true;
  if (layoutEl) layoutEl.hidden = true;
  screenStatus.hidden = false;
  updatePatientHeader();
  renderAll();
  if (screenStatus) screenStatus.scrollTop = 0;
}

/** 3カラム画面に戻す。 */
export function hideStatusMode() {
  if (!screenStatus) return;
  state.visible = false;
  screenStatus.hidden = true;
  if (layoutEl) layoutEl.hidden = false;
}

export function isStatusModeVisible() {
  return state.visible;
}

export function updatePatientHeader() {
  const { karteNumber, animalName } = deps.getPatient() || {};
  if (patientKarteEl) patientKarteEl.textContent = karteNumber || "-----";
  if (patientNameEl) patientNameEl.textContent = animalName || "";
}

// --- 描画 ----------------------------------------------------------------

function renderAll() {
  renderMeds();
  renderExam();
  renderPatientHistory();
  renderProcedures();
  renderNotes();
}

function setCount(el, n) {
  if (el) el.textContent = n > 0 ? `（${n}）` : "";
}

function createRow({ onOpen, handleClick = true } = {}) {
  const li = document.createElement("li");
  li.className = "status-row";
  if (onOpen) {
    li.classList.add("is-tappable");
    li.setAttribute("role", "button");
    li.tabIndex = 0;
    // スワイプ行は enableRowGestures の onActivate に任せる。
    // click を残すと、スワイプ終了の mouseup で編集が開いてしまう。
    if (handleClick) li.addEventListener("click", onOpen);
    li.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      onOpen();
    });
  }
  return li;
}

function dueLevelClass(level) {
  if (level === "overdue") return "exam-due-text--overdue";
  if (level === "close") return "exam-due-text--close";
  if (level === "near") return "exam-due-text--near";
  return "exam-due-text--far";
}

// --- 薬剤 ----------------------------------------------------------------

const MED_STATUS_ORDER = {
  continue: 0,
  active: 0,
  temporary: 1,
  hard: 2,
  hold: 3,
  stopped: 4,
  unknown: 5,
};

function sortedDrugs(drugs) {
  const catOrder = (c) => ({ A: 0, B: 1, C: 2 }[c] ?? 3);
  return [...(drugs || [])].sort((a, b) => {
    const sa = MED_STATUS_ORDER[deriveStatus(a).id] ?? 9;
    const sb = MED_STATUS_ORDER[deriveStatus(b).id] ?? 9;
    if (sa !== sb) return sa - sb;
    const c = catOrder(a.category) - catOrder(b.category);
    if (c !== 0) return c;
    return (a.name || "").localeCompare(b.name || "", "ja");
  });
}

function renderMeds() {
  if (!medsList) return;
  medsList.innerHTML = "";
  const drugs = sortedDrugs(state.drugs);
  if (medsEmpty) medsEmpty.hidden = drugs.length > 0;
  setCount(medsCount, drugs.length);

  drugs.forEach((drug) => {
    const status = deriveStatus(drug);
    const expiry = getExpiryStatus(drug.expiryEstimate);

    const li = createRow({
      onOpen: () => openMedicationDetailById(drug.id),
      handleClick: false,
    });
    if (expiry === "overdue") li.classList.add("is-overdue");
    else if (expiry === "approaching") li.classList.add("is-alert");

    const head = document.createElement("div");
    head.className = "status-row__head";

    const cat = document.createElement("span");
    cat.className = `med-cat med-cat--${drug.category} med-cat--leading`;
    cat.textContent = drug.category;
    cat.title = `重要度 ${drug.category}`;

    const name = document.createElement("span");
    name.className = "status-row__title";
    name.textContent = drug.name || "（名称未設定）";

    head.append(cat, name);

    if (isPrnDrug(drug)) {
      const prn = document.createElement("span");
      prn.className = "med-sign med-sign--prn";
      prn.title = "頓服";
      prn.textContent = "頓";
      head.appendChild(prn);
    }

    const statusEl = document.createElement("span");
    statusEl.className = `med-status med-status--${status.id}`;
    statusEl.textContent = status.label;
    head.appendChild(statusEl);

    li.appendChild(head);

    if (expiry === "overdue" || expiry === "approaching") {
      const inline = document.createElement("div");
      inline.className =
        expiry === "overdue"
          ? "med-inline-status med-inline-status--overdue"
          : "med-inline-status med-inline-status--near";
      if (expiry === "overdue") {
        const over = daysBetween(drug.expiryEstimate, todayStr());
        inline.textContent = over != null && over > 0 ? `${over}日超過` : "期限超過";
      } else {
        const left = daysBetween(todayStr(), drug.expiryEstimate);
        inline.textContent = left === 0 ? "本日まで" : `あと${left}日`;
      }
      inline.title = drug.expiryEstimate
        ? `目安期限: ${ymdFromStr(drug.expiryEstimate)}`
        : "";
      li.appendChild(inline);
    }

    enableRowGestures(li, {
      actions: [
        {
          action: "delete",
          title: "削除",
          onClick: () => deleteMedicationById(drug.id),
        },
      ],
      onActivate: () => openMedicationDetailById(drug.id),
    });

    medsList.appendChild(li);
  });
}

// --- 検査 ----------------------------------------------------------------

function renderExam() {
  renderExamPlans();
  renderExamHistory();
}

function renderExamPlans() {
  if (!examPlanList) return;
  examPlanList.innerHTML = "";

  const entries = Object.entries(state.plan?.plans || {})
    .filter(([, p]) => Boolean(p))
    .map(([id, p]) => {
      const dueDate = getPlanDueDate(p);
      return {
        id,
        item: p.item || "（項目未設定）",
        note: p.note || "",
        dueDate,
        countdown: getDueCountdown(dueDate, getPlanBaselineDate(p)),
        sortKey: dueDate || "9999-99-99",
      };
    })
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) return a.sortKey.localeCompare(b.sortKey);
      return a.item.localeCompare(b.item, "ja");
    });

  if (examPlanEmpty) examPlanEmpty.hidden = entries.length > 0;
  setCount(examPlanCount, entries.length);

  entries.forEach((entry) => {
    const li = createRow({ onOpen: () => openExamPlanEditorById(entry.id) });

    const head = document.createElement("div");
    head.className = "status-row__head";

    const title = document.createElement("span");
    title.className = "status-row__title";
    title.textContent = entry.item;

    const due = document.createElement("span");
    if (entry.countdown) {
      due.className = `status-row__due ${dueLevelClass(entry.countdown.level)}`;
      due.textContent = formatDueCountdown(entry.countdown, { includeDate: false });
    } else {
      due.className = "status-row__due";
      due.textContent = "予定日未設定";
    }

    head.append(title, due);
    li.appendChild(head);

    if (entry.note) {
      const note = document.createElement("div");
      note.className = "status-row__note";
      note.textContent = entry.note;
      li.appendChild(note);
    }

    examPlanList.appendChild(li);
  });
}

function renderExamHistory() {
  if (!examHistoryList) return;
  examHistoryList.innerHTML = "";

  const items = Object.entries(state.plan?.history || {})
    .filter(([, h]) => Boolean(h))
    .map(([id, h]) => ({ id, ...h }));

  if (examHistoryEmpty) examHistoryEmpty.hidden = items.length > 0;
  setCount(examHistoryCount, items.length);
  if (!items.length) return;

  const groups = new Map();
  items.forEach((h) => {
    const key = h.item || "（項目未設定）";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  });

  [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, "ja"))
    .forEach((itemName) => {
      const rows = groups
        .get(itemName)
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      const head = document.createElement("li");
      head.className = "status-group-title";
      head.textContent = `${itemName}（${rows.length}件）`;
      examHistoryList.appendChild(head);

      rows.forEach((h) => {
        const li = createRow();
        li.classList.add("status-row--compact");

        const date = document.createElement("span");
        date.className = "status-row__date";
        date.textContent = ymdFromStr(h.date) || "（日付なし）";
        li.appendChild(date);

        if (h.note) {
          const note = document.createElement("span");
          note.className = "status-row__note";
          note.textContent = h.note;
          li.appendChild(note);
        }

        enableRowGestures(li, {
          actions: [
            {
              action: "refresh",
              title: "予定に戻す",
              onClick: () => reviveExamHistoryEntryById(h.id),
            },
          ],
        });

        examHistoryList.appendChild(li);
      });
    });
}

// --- 既往歴 --------------------------------------------------------------

const HIST_TYPE_ABBR = { disease: "疾", surgery: "術", referral: "紹" };

function renderPatientHistory() {
  if (!histList) return;
  histList.innerHTML = "";

  const entries = [...(state.historyEntries || [])].sort((a, b) => {
    const sa = a.status === "active" ? 0 : 1;
    const sb = b.status === "active" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const d = (b.lastUpdated || "").localeCompare(a.lastUpdated || "");
    if (d !== 0) return d;
    return (a.title || "").localeCompare(b.title || "", "ja");
  });

  if (histEmpty) histEmpty.hidden = entries.length > 0;
  setCount(histCount, entries.length);

  let lastGroup = null;
  entries.forEach((entry) => {
    const group = entry.status === "active" ? "active" : "resolved";
    if (group !== lastGroup) {
      lastGroup = group;
      const heading = document.createElement("li");
      heading.className = "status-group-title";
      heading.textContent = group === "active" ? "🟢 進行中" : "⚪ 終了";
      histList.appendChild(heading);
    }

    const li = createRow({
      onOpen: () => openHistoryDetail(entry.id),
      handleClick: false,
    });

    const head = document.createElement("div");
    head.className = "status-row__head";

    const type = document.createElement("span");
    type.className = `hist-type hist-type--leading hist-type--${entry.type}`;
    type.textContent = HIST_TYPE_ABBR[entry.type] || "他";
    type.title =
      { disease: "疾患", surgery: "手術歴", referral: "紹介・専門治療歴" }[entry.type] ||
      entry.type ||
      "";

    const title = document.createElement("span");
    title.className = "status-row__title";
    title.textContent = entry.title || "（タイトル未設定）";

    head.append(type, title);

    const statusEl = document.createElement("span");
    statusEl.className = `hist-status hist-status--${
      entry.status === "active" ? "active" : "resolved"
    }`;
    statusEl.textContent = entry.status === "active" ? "進行中" : "終了";
    head.appendChild(statusEl);

    li.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "status-row__note";
    meta.textContent = `初回 ${ymdFromStr(entry.firstNoted) || "—"}　更新 ${
      ymdFromStr(entry.lastUpdated) || "—"
    }`;
    li.appendChild(meta);

    enableRowGestures(li, {
      actions: [
        {
          action: "delete",
          title: "削除",
          onClick: () => deletePatientHistoryEntryById(entry.id),
        },
      ],
      onActivate: () => openHistoryDetail(entry.id),
    });

    histList.appendChild(li);
  });
}

function openHistoryDetail(entryId) {
  const built = buildHistoryDetailNode(entryId);
  if (!built || !detailModal || !detailBody) return false;
  detailBody.innerHTML = "";
  detailBody.appendChild(built.node);
  if (detailTitle) detailTitle.textContent = built.title;
  detailModal.hidden = false;
  return true;
}

function closeDetailModal() {
  if (!detailModal) return;
  detailModal.hidden = true;
  if (detailBody) detailBody.innerHTML = "";
}

// --- 処置 ----------------------------------------------------------------

function renderProcedures() {
  renderProcPlans();
  renderProcHistory();
}

function renderProcPlans() {
  if (!procPlanList) return;
  procPlanList.innerHTML = "";

  const plans = [...(state.procPlans || [])].sort((a, b) =>
    (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99")
  );

  if (procPlanEmpty) procPlanEmpty.hidden = plans.length > 0;
  setCount(procPlanCount, plans.length);

  plans.forEach((plan) => {
    const li = createRow({ onOpen: () => openProcedurePlanEditorById(plan.id) });

    const head = document.createElement("div");
    head.className = "status-row__head";

    const title = document.createElement("span");
    title.className = "status-row__title";
    title.textContent = plan.content || "（内容なし）";

    const countdown = plan.dueDate
      ? getDueCountdown(plan.dueDate, plan.baselineDate || null)
      : null;
    const due = document.createElement("span");
    if (countdown) {
      due.className = `status-row__due ${dueLevelClass(countdown.level)}`;
      due.textContent = formatDueCountdown(countdown, { includeDate: false });
    } else {
      due.className = "status-row__due";
      due.textContent = "予定日未設定";
    }

    head.append(title, due);
    li.appendChild(head);

    if (plan.note) {
      const note = document.createElement("div");
      note.className = "status-row__note";
      note.textContent = plan.note;
      li.appendChild(note);
    }

    procPlanList.appendChild(li);
  });
}

function renderProcHistory() {
  if (!procHistoryList) return;
  procHistoryList.innerHTML = "";

  const items = state.procHistory || [];
  if (procHistoryEmpty) procHistoryEmpty.hidden = items.length > 0;
  setCount(procHistoryCount, items.length);
  if (!items.length) return;

  const groups = new Map();
  items.forEach((item) => {
    const key = (item.content || "").trim() || "（内容なし）";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, "ja"))
    .forEach((content) => {
      const rows = groups
        .get(content)
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      const head = document.createElement("li");
      head.className = "status-group-title";
      head.textContent = `${content}（${rows.length}件）`;
      procHistoryList.appendChild(head);

      rows.forEach((item) => {
        const li = createRow({
          onOpen: () => openProcedureHistoryEditorById(item.id),
          handleClick: false,
        });
        li.classList.add("status-row--compact");

        const date = document.createElement("span");
        date.className = "status-row__date";
        date.textContent = ymdFromStr(item.date) || "（日付なし）";
        li.appendChild(date);

        if (item.note) {
          const note = document.createElement("span");
          note.className = "status-row__note";
          note.textContent = item.note;
          li.appendChild(note);
        }

        enableRowGestures(li, {
          actions: [
            {
              action: "refresh",
              title: "予定に戻す",
              onClick: () => reviveProcedureHistoryById(item.id),
            },
            {
              action: "delete",
              title: "削除",
              onClick: () => deleteProcedureHistoryById(item.id, item.store || "history"),
            },
          ],
          onActivate: () => openProcedureHistoryEditorById(item.id),
        });

        procHistoryList.appendChild(li);
      });
    });
}

// --- 特記（重要度に関わらずすべて） -----------------------------------------

function renderNotes() {
  if (!notesList) return;
  notesList.innerHTML = "";

  const items = state.notes || [];
  if (notesEmpty) notesEmpty.hidden = items.length > 0;
  setCount(notesCount, items.length);

  items.forEach((note) => {
    const li = createRow({
      onOpen: () => openSpecialNoteEditorById(note.id),
      handleClick: false,
    });

    const head = document.createElement("div");
    head.className = "status-row__head";

    const badge = document.createElement("span");
    badge.className = `note-card__importance note-card__importance--${
      note.importance || "medium"
    }`;
    badge.textContent = `重要度：${
      note.importance === "high" ? "高" : note.importance === "low" ? "低" : "中"
    }`;
    head.appendChild(badge);
    li.appendChild(head);

    const content = document.createElement("div");
    content.className = "status-row__body";
    content.textContent = note.content || "（内容なし）";
    li.appendChild(content);

    enableRowGestures(li, {
      actions: [
        {
          action: "delete",
          title: "削除",
          onClick: () => deleteSpecialNoteById(note.id),
        },
      ],
      onActivate: () => openSpecialNoteEditorById(note.id),
    });

    notesList.appendChild(li);
  });
}