// 中央カラム「一括登録」：電子カルテ本文から薬・検査・既往歴を名前だけで登録する。
// 検出は入力モードと同じ chip-detect.js。確認モーダルは出さず、時系列にも書かない。

import {
  addMedication,
  saveExamScheduledPlan,
  addPatientHistoryEntry,
  subscribeMedications,
  subscribeExamPlan,
  subscribePatientHistory,
  subscribeMedicationItems,
  subscribeExamItems,
  subscribeHistoryDiseaseItems,
} from "./db.js";
import { detectNoteChips } from "./chip-detect.js";

/** 入力が止まったとみなすまでの待ち時間（入力モードと同じ） */
const DETECT_IDLE_MS = 1000;
const CHIP_LIMIT = 40;

let deps = {
  showToast: () => {},
};

const state = {
  karteNumber: null,
  visible: false,
  medItems: [],
  examItems: [],
  historyMasterItems: [],
  drugs: [],
  plan: null,
  historyEntries: [],
  chips: [],
  /** この画面でタップ登録した項目。購読反映前でも登録済み表示にする */
  tappedKeys: new Set(),
  detectTimer: 0,
  globalUnsubs: [],
  karteUnsubs: [],
};

const btnOpen = document.getElementById("btn-bulk-register");
const modal = document.getElementById("bulk-register-modal");
const textInput = document.getElementById("bulk-register-text");
const chipList = document.getElementById("bulk-register-chip-list");
const chipsHint = document.getElementById("bulk-register-chips-hint");
const btnClose = document.getElementById("btn-close-bulk-register");

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function chipKey(kind, label) {
  return `${kind}::${label}`;
}

function isRegistered(chip) {
  if (state.tappedKeys.has(chipKey(chip.kind, chip.label))) return true;
  if (chip.kind === "med") {
    return (state.drugs || []).some((d) => (d.name || "").trim() === chip.label);
  }
  if (chip.kind === "history") {
    return (state.historyEntries || []).some(
      (e) => (e.title || "").trim() === chip.label
    );
  }
  return Object.values(state.plan?.plans || {}).some(
    (p) => p && (p.item || "").trim() === chip.label
  );
}

function runDetection() {
  const body = textInput?.value || "";
  const hits = detectNoteChips(
    body,
    {
      medItems: state.medItems,
      examItems: state.examItems,
      historyItems: state.historyMasterItems,
    },
    { limit: CHIP_LIMIT }
  );
  state.chips = hits.map((hit) => ({
    kind: hit.kind,
    label: hit.label,
  }));
  renderChips();
}

function renderChips() {
  if (!chipList) return;
  chipList.innerHTML = "";
  if (chipsHint) chipsHint.hidden = state.chips.length > 0;

  state.chips.forEach((chip) => {
    const registered = isRegistered(chip);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `input-chip bulk-register-chip input-chip--${chip.kind} ${
      registered ? "is-registered" : "is-new"
    }`;
    btn.dataset.chipKind = chip.kind;
    btn.dataset.chipLabel = chip.label;
    btn.dataset.chipRegistered = String(registered);

    const kindEl = document.createElement("span");
    kindEl.className = "input-chip__kind";
    kindEl.textContent =
      chip.kind === "med" ? "薬" : chip.kind === "history" ? "既往" : "検査";

    const nameEl = document.createElement("span");
    nameEl.className = "input-chip__name";
    nameEl.textContent = chip.label;

    const stateEl = document.createElement("span");
    stateEl.className = "input-chip__state";
    stateEl.textContent = registered ? "✓ 登録済み" : "タップで登録";

    btn.append(kindEl, nameEl, stateEl);
    btn.addEventListener("click", () => handleChipClick(chip, btn));
    li.appendChild(btn);
    chipList.appendChild(li);
  });
}

async function handleChipClick(chip, btn) {
  if (!state.karteNumber || !chip?.label) return;
  const today = todayStr();
  if (btn) btn.disabled = true;
  try {
    if (chip.kind === "med") {
      await addMedication(state.karteNumber, {
        name: chip.label,
        eventDate: today,
        changedBy: "",
        sideEffectNote: "",
        expiryEstimate: "",
        frequencyChange: "",
        amountChange: "",
      });
    } else if (chip.kind === "history") {
      await addPatientHistoryEntry(state.karteNumber, {
        title: chip.label,
        type: "disease",
        status: "active",
        firstNoted: today,
        noteText: "",
        author: "",
      });
    } else {
      await saveExamScheduledPlan(state.karteNumber, {
        item: chip.label,
        dueDate: "",
        dueDateFrom: "",
        dueDateTo: "",
        note: "",
        baselineDate: today,
        fasting: "",
      });
    }
    state.tappedKeys.add(chipKey(chip.kind, chip.label));
    renderChips();
    deps.showToast(`「${chip.label}」を登録しました`);
  } catch (err) {
    console.error(err);
    deps.showToast("登録に失敗しました。通信状況を確認してください。");
    if (btn) btn.disabled = false;
  }
}

function openModal() {
  if (!state.karteNumber || !modal) return;
  state.visible = true;
  modal.hidden = false;
  runDetection();
  textInput?.focus();
}

function closeModal() {
  state.visible = false;
  if (modal) modal.hidden = true;
  clearTimeout(state.detectTimer);
}

function resetPaste() {
  if (textInput) textInput.value = "";
  state.chips = [];
  state.tappedKeys = new Set();
  clearTimeout(state.detectTimer);
  renderChips();
}

export function initBulkRegisterUI(helpers = {}) {
  deps = { ...deps, ...helpers };

  btnOpen?.addEventListener("click", openModal);
  btnClose?.addEventListener("click", closeModal);
  modal?.querySelector("[data-close-modal]")?.addEventListener("click", closeModal);

  textInput?.addEventListener("input", () => {
    clearTimeout(state.detectTimer);
    state.detectTimer = setTimeout(runDetection, DETECT_IDLE_MS);
  });
  textInput?.addEventListener("paste", () => {
    clearTimeout(state.detectTimer);
    setTimeout(runDetection, 0);
  });

  state.globalUnsubs.push(
    subscribeMedicationItems((items) => {
      state.medItems = items || [];
      if (state.visible) runDetection();
    })
  );
  state.globalUnsubs.push(
    subscribeExamItems((items) => {
      state.examItems = items || [];
      if (state.visible) runDetection();
    })
  );
  state.globalUnsubs.push(
    subscribeHistoryDiseaseItems((items) => {
      state.historyMasterItems = items || [];
      if (state.visible) runDetection();
    })
  );
}

export function enterBulkRegister(karteNumber) {
  leaveBulkRegister();
  state.karteNumber = karteNumber;
  state.karteUnsubs.push(
    subscribeMedications(karteNumber, (drugs) => {
      state.drugs = drugs || [];
      renderChips();
    })
  );
  state.karteUnsubs.push(
    subscribeExamPlan(karteNumber, (plan) => {
      state.plan = plan;
      renderChips();
    })
  );
  state.karteUnsubs.push(
    subscribePatientHistory(karteNumber, (entries) => {
      state.historyEntries = entries || [];
      renderChips();
    })
  );
}

export function leaveBulkRegister() {
  closeModal();
  resetPaste();
  state.karteUnsubs.forEach((u) => {
    try {
      u();
    } catch {
      /* ignore */
    }
  });
  state.karteUnsubs = [];
  state.karteNumber = null;
  state.drugs = [];
  state.plan = null;
  state.historyEntries = [];
}
