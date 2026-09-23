// 状態モード: 患者の状態を全画面で一覧する。
// 既存の3カラム画面には手を入れず、同じカルテのデータを別購読で描画する。
// 各項目のタップは、既存タブで使っている編集ポップアップをそのまま開く。

import {
  subscribeMedications,
  subscribeExamPlan,
  subscribePatientHistory,
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
  getPlanDueCountdown,
  formatDueCountdown,
  getPlanDueRange,
  openExamPlanEditorById,
  openExamPlanCreateModal,
  reviveExamHistoryEntryById,
} from "./exam-plan-ui.js";
import {
  buildHistoryDetailNode,
  openPatientHistoryAddModal,
  deletePatientHistoryEntryById,
  createHistoryKindIcons,
} from "./history-ui.js";
import {
  resolveHistoryKinds,
  isNoteKindGroup,
  sortHistoryEntries,
} from "./history-kinds.js";
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
  historyEntries: [],
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

const btnStatusHistoryAdd = document.getElementById("btn-status-history-add");
const btnStatusExamAdd = document.getElementById("btn-status-exam-add");
const btnStatusMedsAdd = document.getElementById("btn-status-meds-add");

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
    subscribePatientHistory(karteNumber, (entries) => {
      state.historyEntries = entries || [];
      renderPatientHistory();
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
  state.historyEntries = [];
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
      const range = getPlanDueRange(p);
      return {
        id,
        item: p.item || "（項目未設定）",
        note: p.note || "",
        dueDate: range.to || range.from,
        countdown: getPlanDueCountdown(p),
        sortKey: range.from || range.to || "9999-99-99",
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

function examHistoryItemKey(name) {
  return (name || "").trim() || "（項目未設定）";
}

function examActivePlanItemKeys() {
  const keys = new Set();
  Object.values(state.plan?.plans || {}).forEach((p) => {
    if (!p) return;
    keys.add(examHistoryItemKey(p.item));
  });
  return keys;
}

function renderExamHistory() {
  if (!examHistoryList) return;
  examHistoryList.innerHTML = "";

  const planned = examActivePlanItemKeys();
  const items = Object.entries(state.plan?.history || {})
    .filter(([, h]) => Boolean(h))
    .map(([id, h]) => ({ id, ...h }))
    .filter((h) => !planned.has(examHistoryItemKey(h.item)));

  if (examHistoryEmpty) examHistoryEmpty.hidden = items.length > 0;
  setCount(examHistoryCount, items.length);
  if (!items.length) return;

  const groups = new Map();
  items.forEach((h) => {
    const key = examHistoryItemKey(h.item);
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

function renderPatientHistory() {
  if (!histList) return;
  histList.innerHTML = "";

  const entries = sortHistoryEntries(state.historyEntries || []);

  if (histEmpty) histEmpty.hidden = entries.length > 0;
  setCount(histCount, entries.length);

  let prevIsNote = null;
  entries.forEach((entry) => {
    const kinds = resolveHistoryKinds(entry);
    const isNote = isNoteKindGroup(kinds);
    if (prevIsNote === true && isNote === false) {
      const split = document.createElement("li");
      split.className = "status-hist-split";
      split.setAttribute("aria-hidden", "true");
      histList.appendChild(split);
    }
    prevIsNote = isNote;

    const li = createRow({
      onOpen: () => openHistoryDetail(entry.id),
      handleClick: false,
    });
    li.dataset.kinds = kinds.join(" ");

    const head = document.createElement("div");
    head.className = "status-row__head";

    const icons = createHistoryKindIcons(kinds);
    icons.classList.add("hist-kind-icons--leading");

    const title = document.createElement("span");
    title.className = "status-row__title";
    title.textContent = entry.title || "（タイトル未設定）";

    head.append(icons, title);
    li.appendChild(head);

    enableRowGestures(li, {
      actions: [
        {
          action: "delete",
          title: "削除",
          onClick: () => deletePatientHistoryEntryById(entry.id, state.karteNumber),
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

export function closeStatusDetailModal() {
  closeDetailModal();
}

function closeDetailModal() {
  if (!detailModal) return;
  detailModal.hidden = true;
  if (detailBody) detailBody.innerHTML = "";
}