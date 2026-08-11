// 入力モード: 本文の記入と、その日の登録（薬・検査・処置）を1画面で完結させる。
// 既存の中央カラム記録フォームには手を入れず、同じデータを別購読で扱う独立画面。
//
// 「今日の登録」は保存を押すまでDBに書かず、この画面のキューに積む。
// 記入者と記録日は画面上部の値をキュー全体に適用するため、個別入力は求めない。

import {
  addEntry,
  addMedication,
  updateMedication,
  addMedicationEvent,
  saveExamScheduledPlan,
  addExamHistory,
  deleteExamScheduledPlan,
  saveProcedurePlan,
  addProcedure,
  subscribeMedications,
  subscribeExamPlan,
  subscribeMedicationItems,
  subscribeExamItems,
  subscribeTemplates,
} from "./db.js";
import { listMedicationMatchTargets } from "./med-item-match.js";
import { listExamMatchTargets } from "./exam-item-match.js";
import { canHandleShortcut } from "./ime-keys.js";

const AUTHORS = [
  "院長", "大辻", "川邉", "齋藤", "横井", "德永",
  "種田", "竹内", "神子島", "大澤", "川合", "嶋本", "道野",
];

const CATEGORIES = [
  { id: "none", label: "通常" },
  { id: "ope", label: "オペ / 救急 / 麻酔" },
  { id: "admission", label: "入院" },
  { id: "referral", label: "紹介" },
];

const MED_EVENT_TYPES = [
  { id: "add", label: "開始" },
  { id: "increase", label: "増量" },
  { id: "decrease", label: "減量" },
  { id: "temporary", label: "一時的" },
  { id: "hard", label: "投与難" },
  { id: "hold", label: "休薬" },
  { id: "resume", label: "再開" },
  { id: "stop", label: "中止" },
];

/** 検出の最小文字数。1文字のマスタ名は本文中で偶然一致しやすいため対象外にする */
const MIN_DETECT_LENGTH = 2;
/** 入力が止まったとみなすまでの待ち時間 */
const DETECT_IDLE_MS = 1000;

let deps = {
  showToast: () => {},
  setBusy: () => {},
  getPatient: () => ({ karteNumber: "", animalName: "" }),
  getCarriedAuthor: () => null,
  onAuthorChosen: () => {},
  onClose: () => {},
  onSavedAndNext: () => {},
  onOpenTemplates: () => {},
};

const state = {
  karteNumber: null,
  visible: false,
  author: null,
  category: "none",
  important: false,
  usedTemplate: false,
  drugs: [],
  plan: null,
  medItems: [],
  examItems: [],
  templates: [],
  chips: [],
  queue: [],
  queueSeq: 0,
  /** マスタ・定型文（カルテ非依存。アプリ起動中ずっと張る） */
  globalUnsubs: [],
  /** カルテ依存（カルテを離れたら解除する） */
  karteUnsubs: [],
  sheet: null,
  detectTimer: null,
};

// --- DOM -----------------------------------------------------------------

const screenInput = document.getElementById("screen-input");
const layoutEl = document.querySelector("#app-shell .layout");

const patientKarteEl = document.getElementById("input-patient-karte");
const patientNameEl = document.getElementById("input-patient-name");
const btnBack = document.getElementById("btn-input-back");
const btnTemplates = document.getElementById("btn-input-templates");

const errorEl = document.getElementById("input-error");
const authorRow = document.getElementById("input-author-row");
const headlineInput = document.getElementById("input-headline");
const categoryButtons = document.getElementById("input-category-buttons");
const btnImportant = document.getElementById("btn-input-important");
const recordDateInput = document.getElementById("input-record-date");
const recordDateNote = document.getElementById("input-record-date-note");
const bodyInput = document.getElementById("input-body-text");

const chipList = document.getElementById("input-chip-list");
const chipsHint = document.getElementById("input-chips-hint");

const templateButtons = document.getElementById("input-template-buttons");
const templateEmpty = document.getElementById("input-template-empty");

const todayList = document.getElementById("input-today-list");
const todayEmpty = document.getElementById("input-today-empty");
const todayCount = document.getElementById("input-today-count");
const todayNote = document.getElementById("input-today-note");
const btnAddMed = document.getElementById("btn-input-add-med");
const btnAddExam = document.getElementById("btn-input-add-exam");
const btnAddProc = document.getElementById("btn-input-add-proc");

const btnSave = document.getElementById("btn-input-save");
const btnSaveNext = document.getElementById("btn-input-save-next");

const sheetModal = document.getElementById("input-sheet-modal");
const sheetTitle = document.getElementById("input-sheet-title");
const sheetBody = document.getElementById("input-sheet-body");
const sheetError = document.getElementById("input-sheet-error");
const btnSheetAdd = document.getElementById("btn-input-sheet-add");
const btnSheetCancel = document.getElementById("btn-input-sheet-cancel");
const btnSheetClose = document.getElementById("btn-close-input-sheet");

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

function showError(el, message) {
  if (!el) return;
  el.textContent = message || "";
  el.hidden = !message;
}

// --- 公開API --------------------------------------------------------------

export function initInputModeUI(helpers = {}) {
  deps = { ...deps, ...helpers };

  buildAuthorButtons();
  buildCategoryButtons();

  btnBack?.addEventListener("click", () => requestClose());
  btnTemplates?.addEventListener("click", () => deps.onOpenTemplates());

  btnImportant?.addEventListener("click", () => {
    state.important = !state.important;
    btnImportant.setAttribute("aria-pressed", String(state.important));
  });

  recordDateInput?.addEventListener("change", updateRecordDateNote);

  bodyInput?.addEventListener("input", () => {
    clearTimeout(state.detectTimer);
    state.detectTimer = setTimeout(runDetection, DETECT_IDLE_MS);
  });
  // 貼り付けは待たずにすぐ検出する
  bodyInput?.addEventListener("paste", () => {
    clearTimeout(state.detectTimer);
    setTimeout(runDetection, 0);
  });

  btnAddMed?.addEventListener("click", () => openMedSheet({ mode: "new" }));
  btnAddExam?.addEventListener("click", () => openExamSheet({ mode: "plan" }));
  btnAddProc?.addEventListener("click", () => openProcSheet());

  btnSave?.addEventListener("click", () => handleSave({ next: false }));
  btnSaveNext?.addEventListener("click", () => handleSave({ next: true }));

  btnSheetAdd?.addEventListener("click", commitSheet);
  btnSheetCancel?.addEventListener("click", closeSheet);
  btnSheetClose?.addEventListener("click", closeSheet);
  sheetModal
    ?.querySelector("[data-close-modal]")
    ?.addEventListener("click", closeSheet);

  state.globalUnsubs.push(
    subscribeMedicationItems((items) => {
      state.medItems = items || [];
      runDetection();
    })
  );
  state.globalUnsubs.push(
    subscribeExamItems((items) => {
      state.examItems = items || [];
      runDetection();
    })
  );
  state.globalUnsubs.push(
    subscribeTemplates((templates) => {
      state.templates = templates || [];
      renderTemplateButtons();
    })
  );
}

/** カルテを開いたときに患者データを購読する（表示・非表示とは独立） */
export function enterInputMode(karteNumber) {
  leaveInputMode();
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
}

export function leaveInputMode() {
  state.karteUnsubs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
  state.karteUnsubs = [];
  state.karteNumber = null;
  state.drugs = [];
  state.plan = null;
  resetForm();
  closeSheet();
  hideInputMode();
}

/** 入力モードを開く。記入者は直前の選択を引き継ぐ。 */
export function showInputMode() {
  if (!screenInput) return;
  state.visible = true;
  if (layoutEl) layoutEl.hidden = true;
  screenInput.hidden = false;
  updatePatientHeader();
  if (recordDateInput) recordDateInput.max = todayStr();
  updateRecordDateNote();
  renderAuthorSelection();
  renderCategorySelection();
  renderChips();
  renderQueue();
  renderTemplateButtons();
  const body = document.getElementById("input-body");
  if (body) body.scrollTop = 0;
  setTimeout(() => {
    if (!state.author) return;
    headlineInput?.focus();
  }, 0);
}

export function hideInputMode() {
  if (!screenInput) return;
  state.visible = false;
  screenInput.hidden = true;
  if (layoutEl) layoutEl.hidden = false;
}

export function isInputModeVisible() {
  return state.visible;
}

export function updatePatientHeader() {
  const { karteNumber, animalName } = deps.getPatient() || {};
  if (patientKarteEl) patientKarteEl.textContent = karteNumber || "-----";
  if (patientNameEl) patientNameEl.textContent = animalName || "";
}

// --- フォーム -------------------------------------------------------------

function buildAuthorButtons() {
  if (!authorRow) return;
  authorRow.innerHTML = "";
  AUTHORS.forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "author-btn";
    btn.textContent = name;
    btn.dataset.author = name;
    btn.addEventListener("click", () => {
      state.author = name;
      deps.onAuthorChosen(name);
      renderAuthorSelection();
      authorRow.classList.remove("is-error-target");
      showError(errorEl, "");
      renderQueue();
    });
    authorRow.appendChild(btn);
  });
}

function renderAuthorSelection() {
  authorRow?.querySelectorAll(".author-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.author === state.author);
  });
}

function buildCategoryButtons() {
  if (!categoryButtons) return;
  categoryButtons.innerHTML = "";
  CATEGORIES.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-btn";
    btn.dataset.category = cat.id;
    const dot = document.createElement("span");
    dot.className = "category-btn__dot";
    const label = document.createElement("span");
    label.textContent = cat.label;
    btn.append(dot, label);
    btn.addEventListener("click", () => {
      state.category = cat.id;
      renderCategorySelection();
    });
    categoryButtons.appendChild(btn);
  });
}

function renderCategorySelection() {
  categoryButtons?.querySelectorAll(".category-btn").forEach((btn) => {
    const on = btn.dataset.category === state.category;
    btn.classList.toggle("is-selected", on);
    btn.classList.toggle(`is-${btn.dataset.category}`, on);
  });
}

function updateRecordDateNote() {
  if (!recordDateNote) return;
  const value = recordDateInput?.value || "";
  recordDateNote.textContent =
    !value || value === todayStr() ? "" : `${ymdFromStr(value)} として記録します`;
  renderQueue();
}

function renderTemplateButtons() {
  if (!templateButtons) return;
  templateButtons.innerHTML = "";
  if (templateEmpty) templateEmpty.hidden = state.templates.length > 0;
  state.templates.forEach((tpl) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "template-btn";
    btn.textContent = tpl.label || "(名称未設定)";
    btn.addEventListener("click", () => applyTemplate(tpl));
    templateButtons.appendChild(btn);
  });
}

function applyTemplate(tpl) {
  if (headlineInput && !headlineInput.value.trim() && tpl.label) {
    headlineInput.value = tpl.label;
  }
  if (bodyInput) {
    const current = bodyInput.value;
    const insertText = tpl.text || "";
    bodyInput.value = current
      ? `${current.replace(/\s*$/, "")}\n${insertText}`
      : insertText;
    bodyInput.focus();
  }
  state.usedTemplate = true;
  showError(errorEl, "");
  runDetection();
}

function resetForm({ keepAuthor = false } = {}) {
  if (!keepAuthor) state.author = null;
  state.category = "none";
  state.important = false;
  state.usedTemplate = false;
  state.chips = [];
  state.queue = [];
  if (headlineInput) headlineInput.value = "";
  if (bodyInput) bodyInput.value = "";
  if (recordDateInput) recordDateInput.value = todayStr();
  btnImportant?.setAttribute("aria-pressed", "false");
  showError(errorEl, "");
  renderAuthorSelection();
  renderCategorySelection();
  updateRecordDateNote();
  renderChips();
  renderQueue();
}

/** カルテ入場時に呼ぶ。引き継ぎ記入者を初期選択にする。 */
export function prepareInputDraft() {
  resetForm();
  state.author = deps.getCarriedAuthor() || null;
  renderAuthorSelection();
}

function requestClose() {
  if (state.queue.length) {
    const ok = window.confirm(
      `「今日の登録」に${state.queue.length}件たまっています。保存せずに閉じますか？`
    );
    if (!ok) return;
  }
  resetForm();
  hideInputMode();
  deps.onClose();
}

// --- 検出チップ -----------------------------------------------------------

function medMasterLabels() {
  return listMedicationMatchTargets(state.medItems).map((t) => t.label);
}

function examMasterLabels() {
  return listExamMatchTargets(state.examItems).map((t) => t.label);
}

/**
 * 本文に「そのまま」出てくるマスタ名だけを拾う（表記ゆれは吸収しない）。
 * 別のヒットの一部でしかない名前は、重複表示になるので落とす。
 */
function matchLabels(body, labels) {
  const hits = [];
  const seen = new Set();
  for (const label of labels) {
    if (!label || label.length < MIN_DETECT_LENGTH) continue;
    if (seen.has(label)) continue;
    if (!body.includes(label)) continue;
    seen.add(label);
    hits.push(label);
  }
  return hits.filter(
    (label) => !hits.some((other) => other !== label && other.includes(label))
  );
}

function runDetection() {
  const body = bodyInput?.value || "";
  const chips = [];

  matchLabels(body, medMasterLabels()).forEach((label) => {
    const drug = (state.drugs || []).find((d) => (d.name || "").trim() === label);
    chips.push({
      kind: "med",
      label,
      registered: Boolean(drug),
      drugId: drug?.id || null,
    });
  });

  matchLabels(body, examMasterLabels()).forEach((label) => {
    const found = Object.entries(state.plan?.plans || {}).find(
      ([, p]) => p && (p.item || "").trim() === label
    );
    chips.push({
      kind: "exam",
      label,
      registered: Boolean(found),
      planId: found?.[0] || null,
    });
  });

  state.chips = chips;
  renderChips();
}

function renderChips() {
  if (!chipList) return;
  chipList.innerHTML = "";

  // 登録状況は購読で変わるため、描画のたびに突き合わせ直す
  state.chips.forEach((chip) => {
    if (chip.kind === "med") {
      const drug = (state.drugs || []).find(
        (d) => (d.name || "").trim() === chip.label
      );
      chip.registered = Boolean(drug);
      chip.drugId = drug?.id || null;
    } else {
      const found = Object.entries(state.plan?.plans || {}).find(
        ([, p]) => p && (p.item || "").trim() === chip.label
      );
      chip.registered = Boolean(found);
      chip.planId = found?.[0] || null;
    }
  });

  if (chipsHint) {
    chipsHint.hidden = state.chips.length > 0;
  }

  state.chips.forEach((chip) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `input-chip input-chip--${chip.kind} ${
      chip.registered ? "is-registered" : "is-new"
    }`;
    btn.dataset.chipKind = chip.kind;
    btn.dataset.chipLabel = chip.label;
    btn.dataset.chipRegistered = String(chip.registered);

    const kindEl = document.createElement("span");
    kindEl.className = "input-chip__kind";
    kindEl.textContent = chip.kind === "med" ? "薬" : "検査";

    const nameEl = document.createElement("span");
    nameEl.className = "input-chip__name";
    nameEl.textContent = chip.label;

    const stateEl = document.createElement("span");
    stateEl.className = "input-chip__state";
    stateEl.textContent = chip.registered ? "登録済 → 追記" : "未登録 → 新規";

    btn.append(kindEl, nameEl, stateEl);
    btn.addEventListener("click", () => handleChipClick(chip));
    li.appendChild(btn);
    chipList.appendChild(li);
  });
}

function handleChipClick(chip) {
  if (chip.kind === "med") {
    if (chip.registered && chip.drugId) {
      openMedSheet({ mode: "event", name: chip.label, drugId: chip.drugId });
    } else {
      openMedSheet({ mode: "new", name: chip.label });
    }
    return;
  }
  if (chip.registered && chip.planId) {
    const plan = state.plan?.plans?.[chip.planId];
    openExamSheet({
      mode: "complete",
      item: chip.label,
      planId: chip.planId,
      note: plan?.note || "",
    });
    return;
  }
  openExamSheet({ mode: "plan", item: chip.label });
}

// --- 追加シート -----------------------------------------------------------

function openSheet(title, buildBody, onCommit) {
  if (!sheetModal || !sheetBody) return;
  state.sheet = { onCommit };
  if (sheetTitle) sheetTitle.textContent = title;
  sheetBody.innerHTML = "";
  buildBody(sheetBody);
  showError(sheetError, "");
  sheetModal.hidden = false;
}

function closeSheet() {
  state.sheet = null;
  if (sheetModal) sheetModal.hidden = true;
  if (sheetBody) sheetBody.innerHTML = "";
  showError(sheetError, "");
}

function commitSheet() {
  const onCommit = state.sheet?.onCommit;
  if (!onCommit) return;
  const result = onCommit();
  if (result === false) return;
  closeSheet();
}

function fieldBlock(labelText) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = labelText;
  wrap.appendChild(label);
  return wrap;
}

function buttonGroup(options, selectedId, onSelect) {
  const row = document.createElement("div");
  row.className = "exam-item-buttons";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.textContent = opt.label;
    btn.dataset.value = opt.id;
    btn.classList.toggle("is-selected", opt.id === selectedId);
    btn.addEventListener("click", () => {
      row.querySelectorAll(".exam-item-btn").forEach((b) => {
        b.classList.toggle("is-selected", b === btn);
      });
      onSelect(opt.id);
    });
    row.appendChild(btn);
  });
  return row;
}

/** マスタ名の候補リスト。名前を直接打つこともできる。 */
function masterPicker(targets, initialValue, onPick) {
  const wrap = fieldBlock("名称");
  const input = document.createElement("input");
  input.className = "input";
  input.type = "text";
  input.autocomplete = "off";
  input.value = initialValue || "";
  input.placeholder = "マスタ名を入力、または下から選ぶ";

  const list = document.createElement("ul");
  list.className = "input-picker-list";

  const render = () => {
    const q = input.value.trim();
    list.innerHTML = "";
    if (!q) return;
    targets
      .filter((t) => `${t.label}${t.parentLabel || ""}`.includes(q))
      .slice(0, 12)
      .forEach((t) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "input-picker-item";
        const name = document.createElement("span");
        name.className = "input-picker-item__label";
        name.textContent = t.label;
        const path = document.createElement("span");
        path.className = "input-picker-item__path";
        path.textContent = [t.categoryLabel, t.parentLabel].filter(Boolean).join(" › ");
        btn.append(name, path);
        btn.addEventListener("click", () => {
          input.value = t.label;
          onPick(t.label);
          list.innerHTML = "";
        });
        li.appendChild(btn);
        list.appendChild(li);
      });
  };

  input.addEventListener("input", () => {
    onPick(input.value.trim());
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !canHandleShortcut(e)) return;
    e.preventDefault();
    list.innerHTML = "";
  });

  wrap.append(input, list);
  return wrap;
}

function textareaField(labelText, placeholder, initial, onInput) {
  const wrap = fieldBlock(labelText);
  const ta = document.createElement("textarea");
  ta.className = "textarea";
  ta.rows = 3;
  ta.placeholder = placeholder || "";
  ta.value = initial || "";
  ta.addEventListener("input", () => onInput(ta.value));
  wrap.appendChild(ta);
  return wrap;
}

function dateField(labelText, initial, onInput) {
  const wrap = fieldBlock(labelText);
  const input = document.createElement("input");
  input.className = "input input--date";
  input.type = "date";
  input.value = initial || "";
  input.addEventListener("input", () => onInput(input.value));
  wrap.appendChild(input);
  return wrap;
}

function appliedNote() {
  const p = document.createElement("p");
  p.className = "field__note";
  p.textContent = `記入者「${state.author || "未選択"}」と記録日 ${
    ymdFromStr(recordDateInput?.value) || "—"
  } が自動で適用されます。`;
  return p;
}

function openMedSheet({ mode, name = "", drugId = null }) {
  const draft = {
    name,
    category: "B",
    prn: false,
    eventType: mode === "new" ? "add" : "increase",
    detail: "",
  };
  const isEvent = mode === "event";
  const title = isEvent ? `${name} に出来事を追加` : "薬を追加（新規）";

  openSheet(
    title,
    (body) => {
      if (isEvent) {
        const nameWrap = fieldBlock("薬剤");
        const p = document.createElement("p");
        p.className = "input-sheet__fixed";
        p.textContent = `${name}（登録済み。新しい薬剤としては追加しません）`;
        nameWrap.appendChild(p);
        body.appendChild(nameWrap);
      } else {
        body.appendChild(
          masterPicker(listMedicationMatchTargets(state.medItems), name, (v) => {
            draft.name = v;
          })
        );

        const catWrap = fieldBlock("重要度");
        catWrap.appendChild(
          buttonGroup(
            [
              { id: "A", label: "A" },
              { id: "B", label: "B" },
              { id: "C", label: "C" },
            ],
            draft.category,
            (v) => {
              draft.category = v;
            }
          )
        );
        body.appendChild(catWrap);

        const prnWrap = fieldBlock("頓服");
        prnWrap.appendChild(
          buttonGroup(
            [
              { id: "no", label: "定期" },
              { id: "yes", label: "頓服" },
            ],
            "no",
            (v) => {
              draft.prn = v === "yes";
            }
          )
        );
        body.appendChild(prnWrap);
      }

      const evWrap = fieldBlock("出来事");
      evWrap.appendChild(
        buttonGroup(MED_EVENT_TYPES, draft.eventType, (v) => {
          draft.eventType = v;
        })
      );
      body.appendChild(evWrap);

      body.appendChild(
        textareaField("詳細（用法・用量など）", "例）1回0.5錠 1日2回", "", (v) => {
          draft.detail = v;
        })
      );
      body.appendChild(appliedNote());
    },
    () => {
      const finalName = (isEvent ? name : draft.name).trim();
      if (!finalName) {
        showError(sheetError, "薬剤名を入力してください。");
        return false;
      }
      const typeLabel =
        MED_EVENT_TYPES.find((t) => t.id === draft.eventType)?.label || "";
      pushQueue({
        kind: "med",
        action: isEvent ? "event" : "new",
        name: finalName,
        drugId,
        category: draft.category,
        prn: draft.prn,
        eventType: draft.eventType,
        detail: draft.detail.trim(),
        badge: "薬",
        title: finalName,
        summary: [isEvent ? "出来事を追記" : "新規登録", typeLabel, draft.detail.trim()]
          .filter(Boolean)
          .join(" · "),
      });
      return true;
    }
  );
}

function openExamSheet({ mode, item = "", planId = null, note = "" }) {
  const draft = {
    item,
    mode: mode === "complete" ? "history" : mode === "history" ? "history" : "plan",
    dueDate: "",
    fasting: "",
    note,
  };
  const isComplete = mode === "complete";
  const title = isComplete ? `${item} の実施を記録` : "検査を追加";

  openSheet(
    title,
    (body) => {
      if (isComplete) {
        const wrap = fieldBlock("検査項目");
        const p = document.createElement("p");
        p.className = "input-sheet__fixed";
        p.textContent = `${item}（予定あり。実施を記録すると予定から外れます）`;
        wrap.appendChild(p);
        body.appendChild(wrap);
      } else {
        body.appendChild(
          masterPicker(listExamMatchTargets(state.examItems), item, (v) => {
            draft.item = v;
          })
        );
      }

      const modeWrap = fieldBlock("登録の種類");
      const modeRow = buttonGroup(
        [
          { id: "plan", label: "予定として登録" },
          { id: "history", label: "実施として記録" },
        ],
        draft.mode,
        (v) => {
          draft.mode = v;
          planFields.hidden = v !== "plan";
        }
      );
      modeWrap.appendChild(modeRow);
      body.appendChild(modeWrap);

      const planFields = document.createElement("div");
      planFields.hidden = draft.mode !== "plan";
      planFields.appendChild(
        dateField("次回予定日", "", (v) => {
          draft.dueDate = v;
        })
      );
      const fastWrap = fieldBlock("絶食");
      fastWrap.appendChild(
        buttonGroup(
          [
            { id: "", label: "指定なし" },
            { id: "required", label: "必要" },
            { id: "none", label: "不要" },
          ],
          "",
          (v) => {
            draft.fasting = v;
          }
        )
      );
      planFields.appendChild(fastWrap);
      body.appendChild(planFields);

      body.appendChild(
        textareaField("メモ", "例）絶食で来院", draft.note, (v) => {
          draft.note = v;
        })
      );
      body.appendChild(appliedNote());
    },
    () => {
      const finalItem = (isComplete ? item : draft.item).trim();
      if (!finalItem) {
        showError(sheetError, "検査項目を入力してください。");
        return false;
      }
      const action = isComplete
        ? "complete"
        : draft.mode === "plan"
          ? "plan"
          : "history";
      const summary =
        action === "plan"
          ? ["予定として登録", draft.dueDate ? `予定日 ${ymdFromStr(draft.dueDate)}` : "予定日未設定"]
              .filter(Boolean)
              .join(" · ")
          : action === "complete"
            ? "実施を記録（予定から外す）"
            : "実施を記録";
      pushQueue({
        kind: "exam",
        action,
        item: finalItem,
        planId,
        dueDate: draft.dueDate,
        fasting: draft.fasting,
        note: draft.note.trim(),
        badge: "検査",
        title: finalItem,
        summary: [summary, draft.note.trim()].filter(Boolean).join(" · "),
      });
      return true;
    }
  );
}

function openProcSheet() {
  const draft = { content: "", mode: "history", dueDate: "", note: "" };

  openSheet(
    "処置を追加",
    (body) => {
      body.appendChild(
        textareaField("処置内容", "例）皮下点滴 150mL", "", (v) => {
          draft.content = v;
        })
      );

      const modeWrap = fieldBlock("登録の種類");
      modeWrap.appendChild(
        buttonGroup(
          [
            { id: "history", label: "実施として記録" },
            { id: "plan", label: "予定として登録" },
          ],
          draft.mode,
          (v) => {
            draft.mode = v;
            planFields.hidden = v !== "plan";
          }
        )
      );
      body.appendChild(modeWrap);

      const planFields = document.createElement("div");
      planFields.hidden = draft.mode !== "plan";
      planFields.appendChild(
        dateField("次回予定日", "", (v) => {
          draft.dueDate = v;
        })
      );
      body.appendChild(planFields);

      body.appendChild(
        textareaField("メモ", "", "", (v) => {
          draft.note = v;
        })
      );
      body.appendChild(appliedNote());
    },
    () => {
      const content = draft.content.trim();
      if (!content) {
        showError(sheetError, "処置内容を入力してください。");
        return false;
      }
      pushQueue({
        kind: "proc",
        action: draft.mode,
        content,
        dueDate: draft.dueDate,
        note: draft.note.trim(),
        badge: "処置",
        title: content,
        summary: [
          draft.mode === "plan"
            ? `予定として登録${draft.dueDate ? ` · 予定日 ${ymdFromStr(draft.dueDate)}` : ""}`
            : "実施を記録",
          draft.note.trim(),
        ]
          .filter(Boolean)
          .join(" · "),
      });
      return true;
    }
  );
}

// --- 今日の登録 -----------------------------------------------------------

function pushQueue(item) {
  state.queueSeq += 1;
  state.queue.push({ id: `q${state.queueSeq}`, ...item });
  renderQueue();
}

function removeQueueItem(id) {
  state.queue = state.queue.filter((q) => q.id !== id);
  renderQueue();
}

function renderQueue() {
  if (!todayList) return;
  todayList.innerHTML = "";
  if (todayEmpty) todayEmpty.hidden = state.queue.length > 0;
  if (todayCount) {
    todayCount.textContent = state.queue.length ? `（${state.queue.length}）` : "";
  }
  if (todayNote) {
    const date = ymdFromStr(recordDateInput?.value) || "—";
    todayNote.textContent = `記入者「${state.author || "未選択"}」／記録日 ${date} がまとめて適用されます。`;
  }

  state.queue.forEach((item) => {
    const li = document.createElement("li");
    li.className = "input-today-item";
    li.dataset.queueId = item.id;
    li.dataset.queueKind = item.kind;
    li.dataset.queueAction = item.action;

    const badge = document.createElement("span");
    badge.className = `input-today-item__badge input-today-item__badge--${item.kind}`;
    badge.textContent = item.badge;

    const main = document.createElement("div");
    main.className = "input-today-item__main";
    const title = document.createElement("div");
    title.className = "input-today-item__title";
    title.textContent = item.title;
    const summary = document.createElement("div");
    summary.className = "input-today-item__summary";
    summary.textContent = item.summary;
    main.append(title, summary);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "input-today-item__remove";
    remove.textContent = "取り消す";
    remove.addEventListener("click", () => removeQueueItem(item.id));

    li.append(badge, main, remove);
    todayList.appendChild(li);
  });
}

// --- 保存 -----------------------------------------------------------------

async function handleSave({ next }) {
  const headline = headlineInput?.value.trim() || "";
  const body = bodyInput?.value.trim() || "";
  const recordDate = recordDateInput?.value || "";
  const author = state.author;

  if (!author) {
    showError(errorEl, "記入者を選択してください。");
    authorRow?.classList.add("is-error-target");
    authorRow?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  authorRow?.classList.remove("is-error-target");
  if (!headline) {
    showError(errorEl, "見出しを入力してください。");
    headlineInput?.focus();
    return;
  }
  if (!recordDate) {
    showError(errorEl, "記録日を選択してください。");
    return;
  }

  showError(errorEl, "");
  const btn = next ? btnSaveNext : btnSave;
  const label = next ? "保存して次のカルテへ" : "保存";
  deps.setBusy(btn, true, "保存中...", label);

  try {
    await addEntry(state.karteNumber, {
      recordDate,
      headline,
      category: state.category,
      important: state.important,
      author,
      body,
      source: state.usedTemplate ? "template" : "manual",
    });

    for (const item of state.queue) {
      await commitQueueItem(item, { recordDate, author });
    }

    const registered = state.queue.length;
    deps.onAuthorChosen(author);
    resetForm();
    state.author = author;
    renderAuthorSelection();
    deps.showToast(
      registered
        ? `記録と ${registered}件の登録を保存しました。`
        : "記録を保存しました。"
    );

    hideInputMode();
    if (next) deps.onSavedAndNext();
    else deps.onClose();
  } catch (err) {
    console.error(err);
    showError(errorEl, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btn, false, "保存中...", label);
  }
}

async function commitQueueItem(item, { recordDate, author }) {
  const karte = state.karteNumber;

  if (item.kind === "med") {
    if (item.action === "event") {
      await addMedicationEvent(karte, item.drugId, {
        date: recordDate,
        type: item.eventType,
        detail: item.detail,
        changedBy: author,
      });
      return;
    }
    const drugId = await addMedication(karte, {
      name: item.name,
      category: item.category,
      sideEffectNote: "",
      expiryEstimate: "",
      changedBy: author,
      eventDate: recordDate,
      frequencyChange: "",
      amountChange: item.detail,
    });
    if (item.prn) await updateMedication(karte, drugId, { prn: true });
    if (item.eventType !== "add") {
      await addMedicationEvent(karte, drugId, {
        date: recordDate,
        type: item.eventType,
        detail: item.detail,
        changedBy: author,
      });
    }
    return;
  }

  if (item.kind === "exam") {
    if (item.action === "plan") {
      await saveExamScheduledPlan(karte, {
        item: item.item,
        dueDate: item.dueDate,
        note: item.note,
        baselineDate: recordDate,
        fasting: item.fasting,
      });
      return;
    }
    await addExamHistory(karte, {
      item: item.item,
      date: recordDate,
      note: item.note,
    });
    if (item.action === "complete" && item.planId) {
      await deleteExamScheduledPlan(karte, item.planId);
    }
    return;
  }

  if (item.kind === "proc") {
    if (item.action === "plan") {
      await saveProcedurePlan(karte, {
        content: item.content,
        dueDate: item.dueDate,
        note: item.note,
        baselineDate: recordDate,
        confirmedBy: author,
      });
      return;
    }
    await addProcedure(karte, {
      date: recordDate,
      content: item.content,
      note: item.note,
    });
  }
}
