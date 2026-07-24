import {
  getAnimalName,
  setAnimalName,
  addEntry,
  updateEntry,
  setEntryImportant,
  deleteEntry,
  subscribeEntries,
  sortEntriesDescending,
  subscribeTemplates,
  addTemplate,
  updateTemplate,
  deleteTemplate,
} from "./db.js";
import {
  initExamPlanUI,
  enterExamPlan,
  leaveExamPlan,
  setRightTabChangeHandler,
} from "./exam-plan-ui.js";
import {
  initMedsUI,
  enterMeds,
  leaveMeds,
} from "./meds-ui.js";
import {
  initHistoryUI,
  enterHistory,
  leaveHistory,
} from "./history-ui.js";
import {
  initProceduresUI,
  enterProcedures,
  leaveProcedures,
} from "./procedures-ui.js";
import {
  initSpecialNotesUI,
  enterSpecialNotes,
  leaveSpecialNotes,
} from "./special-notes-ui.js";
import { initSettingsUI } from "./settings-ui.js";
import {
  initFreeQaUI,
  enterFreeQa,
  leaveFreeQa,
  notifyApiKeyChanged,
  ensureFreeQaActive,
  onFreeQaTabShown,
} from "./free-qa-ui.js";
import {
  initAiSuggestUI,
  runAiSuggestAfterSave,
  isAiReviewBlocking,
} from "./ai-suggest-ui.js";
import {
  initServiceWorkerUpdates,
  applyWaitingUpdate,
} from "./sw-update.js";
import {
  isPasscodeVerified,
  setPasscodeVerified,
  clearPasscodeVerified,
} from "./passcode-auth.js";
import { enableRowGestures } from "./row-gestures.js";
import { isImeKey } from "./ime-keys.js";

// 記入者（獣医師・看護師を区別せず1列）
const AUTHORS = [
  "院長", "大辻", "川邉", "齋藤", "横井", "德永",
  "種田", "竹内", "神子島", "大澤", "川合", "嶋本", "道野",
];

// 見出しカテゴリ（細分化しない）
const CATEGORIES = [
  { id: "none", label: "通常", short: "" },
  { id: "ope", label: "オペ / 救急 / 麻酔", short: "オペ" },
  { id: "admission", label: "入院", short: "入院" },
  { id: "referral", label: "紹介", short: "紹介" },
];

const PASSCODE = "2211";
const LEFT_COLLAPSE_STORAGE_KEY = "nyuta-left-collapsed";

const state = {
  centerState: "karte",
  unlocked: false,
  karteNumber: null,
  animalName: null,
  entries: [],
  unsubscribeEntries: null,
  templates: [],
  starFilter: false,
  // 入力中エントリの下書き状態
  draft: {
    author: null,
    category: "none",
    important: false,
    usedTemplate: false,
  },
  // 定型文編集中のID（null なら新規追加モード）
  editingTemplateId: null,
  // 新規記録の入力エリアが開いているか
  composing: false,
  // 直近に選択した記入者（右カラムの自動記録用。compose 終了後も保持）
  lastAuthor: null,
  // 編集中エントリ
  editingEntryId: null,
  editDraft: {
    author: null,
    category: "none",
    important: false,
  },
};

// --- DOM参照 -------------------------------------------------------------

const screenLock = document.getElementById("screen-lock");
const appShell = document.getElementById("app-shell");

const gateKarte = document.getElementById("gate-karte");
const gateAnimal = document.getElementById("gate-animal");
const centerMain = document.getElementById("center-main");

const passcodeInput = document.getElementById("passcode-input");
const passcodeError = document.getElementById("passcode-error");
const btnPasscodeNext = document.getElementById("btn-passcode-next");
let passcodeNumpadBound = false;

const karteNumberInput = document.getElementById("karte-number-input");
const karteError = document.getElementById("karte-error");
const btnKarteNext = document.getElementById("btn-karte-next");
let karteNumpadBound = false;

const animalKarteNumberEl = document.getElementById("animal-karte-number");
const animalNameInput = document.getElementById("animal-name-input");
const animalRegisteredHint = document.getElementById("animal-registered-hint");
const animalError = document.getElementById("animal-error");
const btnAnimalNext = document.getElementById("btn-animal-next");
const btnAnimalBack = document.getElementById("btn-animal-back");

const btnChangeKarte = document.getElementById("btn-change-karte");
const leftPatientKarte = document.getElementById("left-patient-karte");
const leftPatientName = document.getElementById("left-patient-name");
const layoutEl = document.querySelector("#app-shell .layout");
const btnLeftCollapse = document.getElementById("btn-left-collapse");
const leftCollapseIcon = btnLeftCollapse?.querySelector(".left-collapse-btn__icon");
const btnOpenTemplates = document.getElementById("btn-open-templates");
const btnStartCompose = document.getElementById("btn-start-compose");
const entryComposer = document.getElementById("entry-composer");
const authorField = document.getElementById("author-field");

const authorRow = document.getElementById("author-row");
const headlineInput = document.getElementById("headline-input");
const categoryButtonsEl = document.getElementById("category-buttons");
const btnImportant = document.getElementById("btn-important");
const recordDateInput = document.getElementById("record-date-input");
const recordDateNote = document.getElementById("record-date-note");
const bodyInput = document.getElementById("body-input");
const templateButtonsEl = document.getElementById("template-buttons");
const templateEmptyEl = document.getElementById("template-empty");
const entryError = document.getElementById("entry-error");
const btnEntrySave = document.getElementById("btn-entry-save");
const btnEntryCancel = document.getElementById("btn-entry-cancel");

const entryEditModal = document.getElementById("entry-edit-modal");
const btnCloseEntryEdit = document.getElementById("btn-close-entry-edit");
const entryEditAuthorRow = document.getElementById("entry-edit-author-row");
const entryEditHeadline = document.getElementById("entry-edit-headline");
const entryEditCategoryButtons = document.getElementById("entry-edit-category-buttons");
const entryEditImportant = document.getElementById("entry-edit-important");
const entryEditBody = document.getElementById("entry-edit-body");
const entryEditError = document.getElementById("entry-edit-error");
const btnEntryEditSave = document.getElementById("btn-entry-edit-save");
const btnEntryEditCancel = document.getElementById("btn-entry-edit-cancel");

const timelineEl = document.getElementById("timeline");
const timelineEmptyEl = document.getElementById("timeline-empty");
const timelineItemTemplate = document.getElementById("timeline-item-template");

const leftEmpty = document.getElementById("left-empty");
const headlineList = document.getElementById("headline-list");
const headlineItemTemplate = document.getElementById("headline-item-template");
const starFilterWrap = document.getElementById("star-filter-wrap");
const starFilterInput = document.getElementById("star-filter");

const templatesModal = document.getElementById("templates-modal");
const btnCloseTemplates = document.getElementById("btn-close-templates");
const tplList = document.getElementById("tpl-list");
const tplListEmpty = document.getElementById("tpl-list-empty");
const tplLabelInput = document.getElementById("tpl-label-input");
const tplTextInput = document.getElementById("tpl-text-input");
const tplError = document.getElementById("tpl-error");
const tplEditorTitle = document.getElementById("tpl-editor-title");
const btnTplSave = document.getElementById("btn-tpl-save");
const btnTplCancel = document.getElementById("btn-tpl-cancel");

const toastEl = document.getElementById("toast");

// --- 共通ユーティリティ ---------------------------------------------------

function readLeftCollapsed() {
  try {
    return localStorage.getItem(LEFT_COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeLeftCollapsed(collapsed) {
  try {
    localStorage.setItem(LEFT_COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

/**
 * 左カラム（見出し一覧）の開閉。中央カラムが空いた幅を受け取る。
 */
function setLeftCollapsed(collapsed) {
  if (!layoutEl || !btnLeftCollapse) return;
  layoutEl.classList.toggle("is-left-collapsed", collapsed);
  btnLeftCollapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
  btnLeftCollapse.title = collapsed
    ? "見出し一覧を開く"
    : "見出し一覧を折りたたむ";
  if (leftCollapseIcon) {
    leftCollapseIcon.textContent = collapsed ? "›" : "‹";
  }
  writeLeftCollapsed(collapsed);
}

function initLeftCollapse() {
  if (!btnLeftCollapse || !layoutEl) return;
  setLeftCollapsed(readLeftCollapsed());
  btnLeftCollapse.addEventListener("click", () => {
    const next = !layoutEl.classList.contains("is-left-collapsed");
    setLeftCollapsed(next);
  });
}

function showLockScreen() {
  state.unlocked = false;
  document.documentElement.classList.remove("is-unlocked");
  if (screenLock) screenLock.hidden = false;
  if (appShell) appShell.hidden = true;
  setupPasscodeNumpad();
  // 読取専用テンキー欄へ focus しない（iPad で後続の通常入力の
  // システムキーボードが抑制されるため）。ハードキーは document 側で受ける。
  blurDigitGateInputs();
}

function unlockAppShell() {
  state.unlocked = true;
  document.documentElement.classList.add("is-unlocked");
  if (screenLock) screenLock.hidden = true;
  if (appShell) appShell.hidden = false;
  // ロック画面の読取専用入力が activeElement のまま残らないようにする
  passcodeInput?.blur();
}

function showCenterState(s) {
  // 本編内の中央カラム状態のみ（ロック画面とは独立）
  state.centerState = s;
  if (!state.unlocked) return;
  gateKarte.hidden = s !== "karte";
  gateAnimal.hidden = s !== "animal";
  centerMain.hidden = s !== "main";

  // カルテ番号ゲートを離れたら読取専用欄のフォーカスを必ず外す
  if (s !== "karte") karteNumberInput?.blur();

  const inMain = s === "main";
  leftEmpty.hidden = inMain;
  headlineList.hidden = !inMain;
  starFilterWrap.hidden = !inMain;
  if (btnChangeKarte) btnChangeKarte.hidden = !inMain;
  if (!inMain) closeCompose({ reset: true });
}

function formatAnimalDisplayName(animalName) {
  const name = (animalName || "").trim() || "（名前未設定）";
  return /ちゃん$/.test(name) ? name : `${name}ちゃん`;
}

function updateLeftPatient() {
  if (leftPatientKarte) {
    leftPatientKarte.textContent = state.karteNumber || "-----";
  }
  if (leftPatientName) {
    leftPatientName.textContent = formatAnimalDisplayName(state.animalName);
  }
}

function setAuthorFieldVisible(visible) {
  if (authorField) authorField.hidden = !visible;
}

function openCompose() {
  state.composing = true;
  if (entryComposer) entryComposer.hidden = false;
  if (btnStartCompose) btnStartCompose.hidden = true;
  resetDraft({ keepAuthor: false });
  // 記入者が未選択なら表示。選択済みなら隠す
  setAuthorFieldVisible(!state.draft.author);
  renderAuthorSelection();
  showError(entryError, "");
  setTimeout(() => {
    if (!state.draft.author) return;
    headlineInput?.focus();
  }, 0);
}

function closeCompose({ reset = true } = {}) {
  state.composing = false;
  if (entryComposer) entryComposer.hidden = true;
  if (btnStartCompose) btnStartCompose.hidden = false;
  if (reset) {
    resetDraft({ keepAuthor: false });
    showError(entryError, "");
  }
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}

let toastTimer = null;
function showToast(message, { isError = false } = {}) {
  toastEl.textContent = message;
  toastEl.classList.toggle("toast--error", isError);
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2600);
}

function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dateStrFromMs(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function mdFromStr(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  if (!m || !d) return dateStr;
  return `${Number(m)}/${Number(d)}`;
}

function yearFromStr(dateStr) {
  if (!dateStr) return "";
  const [y] = dateStr.split("-");
  return y || "";
}

function hmFromMs(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getHours()}:${pad2(d.getMinutes())}`;
}

function mdhmFromMs(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad2(d.getMinutes())}`;
}

function categoryShort(id) {
  const c = CATEGORIES.find((cat) => cat.id === id);
  return c ? c.short : "";
}

/**
 * 時系列エントリの補足メタ（時間・記入者など）。
 * 日付は見出し行に出すため、ここには含めない。
 */
function buildEntrySideMeta(entry) {
  const rec = entry.recordDate;
  const ms = entry.enteredMs || Date.parse(entry.enteredAtIso || "") || 0;
  const enteredDateStr = ms ? dateStrFromMs(ms) : "";
  const author = entry.author || "";

  let base = "";
  if (rec && enteredDateStr && enteredDateStr !== rec) {
    // 遡って入力: 入力日時を明示
    const when = ms ? `${mdhmFromMs(ms)}入力` : "入力日不明";
    base = author ? `${when}・記入者：${author}` : when;
  } else {
    const timePart = ms ? `${hmFromMs(ms)}入力` : "";
    if (timePart && author) base = `${timePart}・記入者：${author}`;
    else if (timePart) base = timePart;
    else if (author) base = `記入者：${author}`;
  }

  const editMs =
    entry.lastEditedMs || Date.parse(entry.lastEditedAtIso || "") || 0;
  if (editMs && entry.lastEditedBy) {
    return base
      ? `${base}　／　最終編集 ${mdhmFromMs(editMs)}・${entry.lastEditedBy}`
      : `最終編集 ${mdhmFromMs(editMs)}・${entry.lastEditedBy}`;
  }
  if (editMs) {
    return base
      ? `${base}　／　最終編集 ${mdhmFromMs(editMs)}`
      : `最終編集 ${mdhmFromMs(editMs)}`;
  }
  return base;
}

// --- 状態0: パスコード入力 -----------------------------------------------

/**
 * 数字専用ゲート欄（パスコード／カルテ番号）を「表示専用」にする。
 * iPad では inputmode="none" + readonly のフィールドに focus すると、
 * その後の通常テキスト欄でもシステムキーボードが出なくなることがあるため、
 * タップではフォーカスさせず、値の更新はテンキー／ハードキー経由のみにする。
 */
function hardenDigitGateInput(el) {
  if (!el || el.dataset.digitGateHardened === "1") return;
  el.dataset.digitGateHardened = "1";
  el.readOnly = true;
  el.setAttribute("inputmode", "none");
  el.setAttribute("autocomplete", "off");
  el.tabIndex = -1;
  const blockPointerFocus = (event) => {
    event.preventDefault();
  };
  el.addEventListener("touchstart", blockPointerFocus, { passive: false });
  el.addEventListener("mousedown", blockPointerFocus);
  el.addEventListener("focus", () => {
    // プログラム focus やアクセシビリティ経路でも残さない
    el.blur();
  });
}

function blurDigitGateInputs() {
  passcodeInput?.blur();
  karteNumberInput?.blur();
}

function isEditableTextTarget(target) {
  if (!target || target === document.body || target === document.documentElement) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "TEXTAREA") return !target.readOnly && !target.disabled;
  if (tag === "INPUT") {
    if (target.readOnly || target.disabled) return false;
    const type = String(target.type || "text").toLowerCase();
    if (
      [
        "button",
        "submit",
        "checkbox",
        "radio",
        "file",
        "reset",
        "hidden",
        "range",
        "color",
      ].includes(type)
    ) {
      return false;
    }
    return true;
  }
  return !!target.isContentEditable;
}

function setPasscodeDigits(next) {
  if (!passcodeInput) return;
  passcodeInput.value = String(next || "").replace(/[^0-9]/g, "").slice(0, 4);
  showError(passcodeError, "");
}

function ensurePasscodeNumpadEl() {
  if (!passcodeInput) {
    console.error("[passcode-numpad] #passcode-input が見つかりません");
    return null;
  }
  hardenDigitGateInput(passcodeInput);
  passcodeInput.setAttribute("maxlength", "4");

  let pad = document.getElementById("passcode-numpad");
  if (!pad) {
    pad = document.createElement("div");
    pad.id = "passcode-numpad";
    pad.className = "numpad numpad--gate";
    pad.setAttribute("aria-label", "パスコードのテンキー");
    passcodeInput.insertAdjacentElement("afterend", pad);
  }
  return pad;
}

function ensureGateNumpadButtons(pad, digitAttr, actionAttr) {
  if (pad.querySelector(".numpad__btn")) return;
  const keys = [
    ["1", "digit"],
    ["2", "digit"],
    ["3", "digit"],
    ["4", "digit"],
    ["5", "digit"],
    ["6", "digit"],
    ["7", "digit"],
    ["8", "digit"],
    ["9", "digit"],
    ["削除", "delete"],
    ["0", "digit"],
    ["確定", "confirm"],
  ];
  keys.forEach(([label, kind]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "numpad__btn";
    btn.textContent = label;
    if (kind === "digit") {
      btn.setAttribute(digitAttr, label);
    } else if (kind === "delete") {
      btn.classList.add("numpad__btn--action");
      btn.setAttribute(actionAttr, "delete");
    } else {
      btn.classList.add("numpad__btn--action", "numpad__btn--confirm");
      btn.setAttribute(actionAttr, "confirm");
    }
    pad.appendChild(btn);
  });
}

function setupPasscodeNumpad() {
  const pad = ensurePasscodeNumpadEl();
  if (!pad) return;
  ensureGateNumpadButtons(pad, "data-pass-digit", "data-pass-action");

  if (passcodeNumpadBound) return;
  passcodeNumpadBound = true;
  pad.addEventListener("click", (event) => {
    const btn = event.target.closest("button");
    if (!btn || !pad.contains(btn)) return;
    const digit = btn.getAttribute("data-pass-digit");
    const action = btn.getAttribute("data-pass-action");
    if (digit != null) {
      if ((passcodeInput.value || "").length >= 4) return;
      setPasscodeDigits(`${passcodeInput.value || ""}${digit}`);
      return;
    }
    if (action === "delete") {
      setPasscodeDigits((passcodeInput.value || "").slice(0, -1));
      return;
    }
    if (action === "confirm") {
      handlePasscodeNext();
    }
  });
}

if (passcodeInput) {
  passcodeInput.addEventListener("input", () => {
    setPasscodeDigits(passcodeInput.value);
  });
}

btnPasscodeNext?.addEventListener("click", handlePasscodeNext);

function handlePasscodeNext() {
  const value = (passcodeInput?.value || "").trim();
  if (value !== PASSCODE) {
    showError(passcodeError, "パスコードが正しくありません。");
    setPasscodeDigits("");
    return;
  }
  showError(passcodeError, "");
  try {
    setPasscodeVerified();
  } catch (err) {
    console.error("パスコード認証状態の保存に失敗しました", err);
  }
  setPasscodeDigits("");
  goToKarte();
}

function logoutToPasscode() {
  if (isAiReviewBlocking()) {
    showToast("AI提案の確認が終わるまで、ログアウトできません。", { isError: true });
    return;
  }
  try {
    clearPasscodeVerified();
  } catch (err) {
    console.error(err);
    showToast("ログアウトに失敗しました。", { isError: true });
    return;
  }
  leaveMain();
  showCenterState("karte");
  if (karteNumberInput) karteNumberInput.value = "";
  showLockScreen();
  showToast("ログアウトしました。");
}

// --- 状態1: カルテ番号入力 -----------------------------------------------

function goToKarte() {
  unlockAppShell();
  showCenterState("karte");
  setupKarteNumpad();
  // 読取専用欄へは focus しない（通常テキスト欄のキーボード阻害を防ぐ）
  blurDigitGateInputs();
}

function setKarteNumberDigits(next) {
  if (!karteNumberInput) return;
  karteNumberInput.value = String(next || "").replace(/[^0-9]/g, "").slice(0, 5);
  showError(karteError, "");
}

/**
 * カルテ番号テンキーを確実に用意する。
 * 古いキャッシュ HTML（#karte-numpad 無し）でも JS 側で生成する。
 * standalone / Chrome 固有の分岐は持たない（全環境同一）。
 */
function ensureKarteNumpadEl() {
  if (!karteNumberInput) {
    console.error("[karte-numpad] #karte-number-input が見つかりません");
    return null;
  }
  // 標準キーボードを出さない（古い HTML でも属性を揃える）
  hardenDigitGateInput(karteNumberInput);
  karteNumberInput.setAttribute("maxlength", "5");

  let pad = document.getElementById("karte-numpad");
  if (!pad) {
    pad = document.createElement("div");
    pad.id = "karte-numpad";
    pad.className = "numpad numpad--gate";
    pad.setAttribute("aria-label", "カルテ番号のテンキー");
    karteNumberInput.insertAdjacentElement("afterend", pad);
  }
  return pad;
}

function setupKarteNumpad() {
  const pad = ensureKarteNumpadEl();
  if (!pad) return;
  ensureGateNumpadButtons(pad, "data-karte-digit", "data-karte-action");

  if (karteNumpadBound) return;
  karteNumpadBound = true;
  pad.addEventListener("click", (event) => {
    const btn = event.target.closest("button");
    if (!btn || !pad.contains(btn)) return;
    const digit = btn.getAttribute("data-karte-digit");
    const action = btn.getAttribute("data-karte-action");
    if (digit != null) {
      if ((karteNumberInput.value || "").length >= 5) return;
      setKarteNumberDigits(`${karteNumberInput.value || ""}${digit}`);
      return;
    }
    if (action === "delete") {
      setKarteNumberDigits((karteNumberInput.value || "").slice(0, -1));
      return;
    }
    if (action === "confirm") {
      handleKarteNext();
    }
  });
}

if (karteNumberInput) {
  karteNumberInput.addEventListener("input", () => {
    // readonly でも外部入力や貼り付けに備えて正規化する
    setKarteNumberDigits(karteNumberInput.value);
  });
}

// ゲート画面ではフィールドに focus しないため、ハードキーは document で受ける。
// 通常のテキスト入力中は isEditableTextTarget でスキップする。
document.addEventListener("keydown", (event) => {
  if (isEditableTextTarget(event.target)) return;
  if (isImeKey(event)) return;

  const onPasscode = !!(screenLock && !screenLock.hidden && passcodeInput);
  const onKarte =
    !!(state.unlocked && state.centerState === "karte" && karteNumberInput);

  if (!onPasscode && !onKarte) return;

  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    if (onPasscode) {
      if ((passcodeInput.value || "").length >= 4) return;
      setPasscodeDigits(`${passcodeInput.value || ""}${event.key}`);
      return;
    }
    if ((karteNumberInput.value || "").length >= 5) return;
    setKarteNumberDigits(`${karteNumberInput.value || ""}${event.key}`);
    return;
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    if (onPasscode) {
      setPasscodeDigits((passcodeInput.value || "").slice(0, -1));
      return;
    }
    setKarteNumberDigits((karteNumberInput.value || "").slice(0, -1));
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (onPasscode) handlePasscodeNext();
    else handleKarteNext();
  }
});

btnKarteNext?.addEventListener("click", handleKarteNext);

async function handleKarteNext() {
  const value = karteNumberInput.value.trim();
  if (!/^[0-9]{5}$/.test(value)) {
    showError(karteError, "カルテ番号は5桁の数字で入力してください。");
    return;
  }

  showError(karteError, "");
  setBusy(btnKarteNext, true, "確認中...", "次へ");

  try {
    const existingName = await getAnimalName(value);
    state.karteNumber = value;
    state.animalName = existingName;

    animalKarteNumberEl.textContent = value;
    animalNameInput.value = existingName || "";
    animalRegisteredHint.hidden = !existingName;
    showError(animalError, "");

    showCenterState("animal");
    setTimeout(() => animalNameInput.focus(), 0);
  } catch (err) {
    console.error(err);
    showError(
      karteError,
      "通信に失敗しました。Firebaseの設定をご確認のうえ、もう一度お試しください。"
    );
  } finally {
    setBusy(btnKarteNext, false, "確認中...", "次へ");
  }
}

// --- 状態2: 動物名の確認・登録 --------------------------------------------

btnAnimalBack.addEventListener("click", () => {
  showError(animalError, "");
  goToKarte();
});

animalNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !isImeKey(event)) {
    event.preventDefault();
    handleAnimalNext();
  }
});

btnAnimalNext.addEventListener("click", handleAnimalNext);

async function handleAnimalNext() {
  const name = animalNameInput.value.trim();
  if (!name) {
    showError(animalError, "動物名（カナ）を入力してください。");
    return;
  }

  showError(animalError, "");
  setBusy(btnAnimalNext, true, "保存中...", "この内容で次へ");

  try {
    if (name !== state.animalName) {
      await setAnimalName(state.karteNumber, name);
    }
    state.animalName = name;
    enterMain();
  } catch (err) {
    console.error(err);
    showError(animalError, "動物名の保存に失敗しました。もう一度お試しください。");
  } finally {
    setBusy(btnAnimalNext, false, "保存中...", "この内容で次へ");
  }
}

// --- 状態3: メイン作業エリア ----------------------------------------------

// 記入者ボタン（横一列・単一選択）
AUTHORS.forEach((name) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "author-btn";
  btn.textContent = name;
  btn.dataset.author = name;
  btn.addEventListener("click", () => {
    state.draft.author = name;
    state.lastAuthor = name;
    renderAuthorSelection();
    setAuthorFieldVisible(false);
    showError(entryError, "");
    headlineInput?.focus();
  });
  authorRow?.appendChild(btn);
});

function renderAuthorSelection() {
  authorRow?.querySelectorAll(".author-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.author === state.draft.author);
  });
}

// 編集モーダル用・編集者ボタン
AUTHORS.forEach((name) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "author-btn";
  btn.textContent = name;
  btn.dataset.author = name;
  btn.addEventListener("click", () => {
    state.editDraft.author = name;
    state.lastAuthor = name;
    renderEditAuthorSelection();
    showError(entryEditError, "");
  });
  entryEditAuthorRow?.appendChild(btn);
});

function renderEditAuthorSelection() {
  entryEditAuthorRow?.querySelectorAll(".author-btn").forEach((btn) => {
    btn.classList.toggle(
      "is-selected",
      btn.dataset.author === state.editDraft.author
    );
  });
}

// カテゴリボタン
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
    state.draft.category = cat.id;
    renderCategorySelection();
  });
  categoryButtonsEl.appendChild(btn);
});

function renderCategorySelection() {
  categoryButtonsEl?.querySelectorAll(".category-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.category === state.draft.category);
  });
}

// 編集モーダル用カテゴリ
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
    state.editDraft.category = cat.id;
    renderEditCategorySelection();
  });
  entryEditCategoryButtons?.appendChild(btn);
});

function renderEditCategorySelection() {
  entryEditCategoryButtons?.querySelectorAll(".category-btn").forEach((btn) => {
    btn.classList.toggle(
      "is-selected",
      btn.dataset.category === state.editDraft.category
    );
  });
}

entryEditImportant?.addEventListener("click", () => {
  state.editDraft.important = !state.editDraft.important;
  entryEditImportant.setAttribute(
    "aria-pressed",
    String(state.editDraft.important)
  );
});

function openEntryEdit(entry) {
  state.editingEntryId = entry.id;
  state.editDraft = {
    author: state.draft.author || null,
    category: entry.category || "none",
    important: Boolean(entry.important),
  };
  if (entryEditHeadline) entryEditHeadline.value = entry.headline || "";
  if (entryEditBody) entryEditBody.value = entry.body || "";
  entryEditImportant?.setAttribute(
    "aria-pressed",
    String(state.editDraft.important)
  );
  renderEditAuthorSelection();
  renderEditCategorySelection();
  showError(entryEditError, "");
  if (entryEditModal) entryEditModal.hidden = false;
  setTimeout(() => entryEditHeadline?.focus(), 0);
}

function closeEntryEdit() {
  state.editingEntryId = null;
  state.editDraft = { author: null, category: "none", important: false };
  if (entryEditModal) entryEditModal.hidden = true;
  showError(entryEditError, "");
}

async function handleEntryEditSave() {
  if (!state.editingEntryId || !state.karteNumber) return;

  const headline = (entryEditHeadline?.value || "").trim();
  const body = (entryEditBody?.value || "").trim();

  if (!state.editDraft.author) {
    showError(entryEditError, "編集者を選択してください。");
    return;
  }
  if (!headline) {
    showError(entryEditError, "見出しを入力してください。");
    entryEditHeadline?.focus();
    return;
  }
  if (!body) {
    showError(entryEditError, "本文を入力してください。");
    entryEditBody?.focus();
    return;
  }

  showError(entryEditError, "");
  setBusy(btnEntryEditSave, true, "保存中...", "保存する");
  try {
    await updateEntry(state.karteNumber, state.editingEntryId, {
      headline,
      body,
      category: state.editDraft.category,
      important: state.editDraft.important,
      editedBy: state.editDraft.author,
    });
    closeEntryEdit();
    showToast("編集内容を保存しました。");
  } catch (err) {
    console.error(err);
    showError(entryEditError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    setBusy(btnEntryEditSave, false, "保存中...", "保存する");
  }
}

btnCloseEntryEdit?.addEventListener("click", closeEntryEdit);
btnEntryEditCancel?.addEventListener("click", closeEntryEdit);
entryEditModal
  ?.querySelector("[data-close-modal]")
  ?.addEventListener("click", closeEntryEdit);
btnEntryEditSave?.addEventListener("click", handleEntryEditSave);

// ★トグル（入力中エントリ用）
btnImportant.addEventListener("click", () => {
  state.draft.important = !state.draft.important;
  btnImportant.setAttribute("aria-pressed", String(state.draft.important));
});

// 記録日
recordDateInput.addEventListener("change", updateRecordDateNote);

function updateRecordDateNote() {
  const value = recordDateInput.value;
  if (value && value !== todayStr()) {
    recordDateNote.textContent = "過去の日付に遡って記録します";
  } else {
    recordDateNote.textContent = "";
  }
}

btnChangeKarte.addEventListener("click", () => {
  if (isAiReviewBlocking()) {
    showToast("AI提案の確認が終わるまで、カルテ切替はできません。", { isError: true });
    return;
  }
  leaveMain();
  goToKarte();
  karteNumberInput.value = "";
});

btnStartCompose?.addEventListener("click", () => {
  openCompose();
});

btnEntryCancel?.addEventListener("click", () => {
  closeCompose({ reset: true });
});

btnEntrySave.addEventListener("click", handleEntrySave);

// 本文入力開始時に記入者未選択なら記入者欄を出す
bodyInput?.addEventListener("focus", () => {
  if (!state.composing) return;
  if (!state.draft.author) setAuthorFieldVisible(true);
});

function resetDraft({ keepAuthor = false } = {}) {
  if (!keepAuthor) state.draft.author = null;
  state.draft.category = "none";
  state.draft.important = false;
  state.draft.usedTemplate = false;
  if (headlineInput) headlineInput.value = "";
  if (bodyInput) bodyInput.value = "";
  btnImportant?.setAttribute("aria-pressed", "false");
  if (recordDateInput) recordDateInput.value = todayStr();
  renderCategorySelection();
  updateRecordDateNote();
  renderAuthorSelection();
  const formEl = document.querySelector(".entry-form");
  if (formEl) formEl.scrollTop = 0;
}

function enterMain() {
  updateLeftPatient();
  if (recordDateInput) recordDateInput.max = todayStr();
  closeCompose({ reset: true });
  showError(entryError, "");

  showCenterState("main");

  if (state.unsubscribeEntries) state.unsubscribeEntries();
  state.unsubscribeEntries = subscribeEntries(state.karteNumber, (entries) => {
    state.entries = entries;
    renderEntries();
  });

  enterExamPlan(state.karteNumber);
  enterMeds(state.karteNumber);
  enterHistory(state.karteNumber);
  enterProcedures(state.karteNumber);
  enterSpecialNotes(state.karteNumber);
  enterFreeQa(state.karteNumber);
}

function leaveMain() {
  if (state.unsubscribeEntries) {
    state.unsubscribeEntries();
    state.unsubscribeEntries = null;
  }
  leaveExamPlan();
  leaveMeds();
  leaveHistory();
  leaveProcedures();
  leaveSpecialNotes();
  leaveFreeQa();
  closeCompose({ reset: true });
  closeEntryEdit();
  state.karteNumber = null;
  state.animalName = null;
  state.entries = [];
  state.draft.author = null;
  // lastAuthor は端末内の作業継続用に残す（カルテ変更後も処置ログ等で使える）
  state.starFilter = false;
  if (starFilterInput) starFilterInput.checked = false;
  if (timelineEl) timelineEl.innerHTML = "";
  if (headlineList) headlineList.innerHTML = "";
  if (leftPatientKarte) leftPatientKarte.textContent = "";
  if (leftPatientName) leftPatientName.textContent = "";
}

async function handleEntrySave() {
  if (!state.composing) {
    openCompose();
    showError(entryError, "内容を入力してから保存してください。");
    return;
  }

  const headline = headlineInput.value.trim();
  const body = bodyInput.value.trim();
  const recordDate = recordDateInput.value;

  if (!state.draft.author) {
    setAuthorFieldVisible(true);
    showError(entryError, "記入者を選択してください。");
    return;
  }
  if (!headline) {
    showError(entryError, "見出しを入力してください。");
    headlineInput.focus();
    return;
  }
  if (!body) {
    showError(entryError, "本文を入力してください。");
    bodyInput.focus();
    return;
  }
  if (!recordDate) {
    showError(entryError, "記録日を選択してください。");
    return;
  }

  showError(entryError, "");
  setBusy(btnEntrySave, true, "保存中...", "保存する");

  try {
    const source = state.draft.usedTemplate ? "template" : "manual";
    const author = state.draft.author;
    await addEntry(state.karteNumber, {
      recordDate,
      headline,
      category: state.draft.category,
      important: state.draft.important,
      author,
      body,
      source,
    });
    const karteNumber = state.karteNumber;
    closeCompose({ reset: true });
    showToast("保存しました。");

    // 定型文入力は対象外。手動入力のみ AI 提案フローへ（フラグで無効化可）
    if (source === "manual") {
      await runAiSuggestAfterSave({
        karteNumber,
        body,
        headline,
        recordDate,
        author,
      });
    }
  } catch (err) {
    console.error(err);
    showError(entryError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    setBusy(btnEntrySave, false, "保存中...", "保存する");
  }
}

// --- 時系列・見出しの描画 -------------------------------------------------

function entryMatchesStarFilter(entry) {
  if (entry?.important) return true;
  const cat = entry?.category || "none";
  return cat === "ope" || cat === "admission" || cat === "referral";
}

function visibleEntries() {
  // 記録日の降順（新しい→古い）。同一記録日は入力時刻の降順。
  // db 側でも降順だが、描画直前にもう一度並べ替えて順序を保証する。
  // 時系列（中央）と見出し（左）は同じ配列を forEach するため常に一致する。
  // ★フィルターは手動★に加え、カテゴリ付き（オペ／入院／紹介）も重要扱いで含める。
  const filtered = state.starFilter
    ? state.entries.filter(entryMatchesStarFilter)
    : state.entries;
  return sortEntriesDescending(filtered);
}

function renderEntries() {
  const entries = visibleEntries();
  renderTimeline(entries);
  renderHeadlines(entries);
}

function renderTimeline(entries) {
  timelineEl.innerHTML = "";
  timelineEmptyEl.hidden = entries.length > 0;
  if (state.starFilter && entries.length === 0) {
    timelineEmptyEl.hidden = false;
    timelineEmptyEl.textContent = "★またはカテゴリ付きの記録はありません。";
  } else {
    timelineEmptyEl.textContent = "まだ記録がありません。";
  }

  entries.forEach((entry) => {
    timelineEl.appendChild(createTimelineItem(entry));
  });
}

function createTimelineItem(entry) {
  const fragment = timelineItemTemplate.content.cloneNode(true);
  const li = fragment.querySelector(".tl-item");
  li.id = `tl-${entry.id}`;
  li.dataset.category = entry.category || "none";

  const starBtn = li.querySelector(".tl-item__star");
  const dateEl = li.querySelector(".tl-item__date");
  const headlineEl = li.querySelector(".tl-item__headline");
  const catLabelEl = li.querySelector(".tl-item__cat-label");
  const metaEl = li.querySelector(".tl-item__meta");
  const bodyEl = li.querySelector(".tl-item__body");

  starBtn.setAttribute("aria-pressed", String(Boolean(entry.important)));
  dateEl.textContent = mdFromStr(entry.recordDate) || "";
  headlineEl.textContent = entry.headline || "（見出しなし）";
  catLabelEl.textContent = categoryShort(entry.category);
  metaEl.textContent = buildEntrySideMeta(entry);
  bodyEl.textContent = entry.body || "";

  starBtn.addEventListener("click", async () => {
    const next = !entry.important;
    starBtn.setAttribute("aria-pressed", String(next));
    try {
      await setEntryImportant(state.karteNumber, entry.id, next);
    } catch (err) {
      console.error(err);
      starBtn.setAttribute("aria-pressed", String(entry.important));
      showToast("★の更新に失敗しました。", { isError: true });
    }
  });

  enableRowGestures(li, {
    actions: [
      {
        action: "edit",
        title: "編集",
        onClick: () => openEntryEdit(entry),
      },
      {
        action: "delete",
        title: "削除",
        onClick: async () => {
          const ok = window.confirm(
            "この記録を削除しますか？（入力ミスなど、明らかな誤りのときだけ削除してください）"
          );
          if (!ok) return;
          try {
            await deleteEntry(state.karteNumber, entry.id);
            showToast("削除しました。");
          } catch (err) {
            console.error(err);
            showToast("削除に失敗しました。", { isError: true });
          }
        },
      },
    ],
  });

  return li;
}

function renderHeadlines(entries) {
  headlineList.innerHTML = "";
  let lastYear = null;

  entries.forEach((entry) => {
    const year = yearFromStr(entry.recordDate);
    if (year && year !== lastYear) {
      lastYear = year;
      const yearLi = document.createElement("li");
      yearLi.className = "hl-year";
      yearLi.setAttribute("aria-hidden", "true");
      yearLi.textContent = `${year}年`;
      headlineList.appendChild(yearLi);
    }

    const fragment = headlineItemTemplate.content.cloneNode(true);
    const li = fragment.querySelector(".hl-item");
    const btn = li.querySelector(".hl-item__btn");
    const dot = li.querySelector(".hl-item__dot");
    const textEl = li.querySelector(".hl-item__text");
    const dateEl = li.querySelector(".hl-item__date");

    li.classList.toggle("is-important", Boolean(entry.important));
    dot.dataset.category = entry.category || "none";
    dateEl.textContent = mdFromStr(entry.recordDate) || "（日付なし）";
    textEl.textContent = entry.headline || "（見出しなし）";

    btn.addEventListener("click", () => jumpToEntry(entry.id, li));
    headlineList.appendChild(li);
  });
}

function jumpToEntry(entryId, headlineLi) {
  const target = document.getElementById(`tl-${entryId}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add("is-flash");
  setTimeout(() => target.classList.remove("is-flash"), 1200);

  headlineList.querySelectorAll(".hl-item__btn").forEach((b) => b.classList.remove("is-target"));
  headlineLi.querySelector(".hl-item__btn").classList.add("is-target");
}

// ★フィルタ
starFilterInput.addEventListener("change", () => {
  state.starFilter = starFilterInput.checked;
  renderEntries();
});

// --- 定型文 ---------------------------------------------------------------

function renderTemplateButtons() {
  templateButtonsEl.innerHTML = "";
  templateEmptyEl.hidden = state.templates.length > 0;

  state.templates.forEach((tpl) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "template-btn";
    btn.textContent = tpl.label || "(名称未設定)";
    btn.addEventListener("click", () => insertTemplate(tpl));
    templateButtonsEl.appendChild(btn);
  });
}

function insertTemplate(tpl) {
  // 見出しが空なら定型文名を見出しに、本文には定型文テキストを追記する。
  if (!headlineInput.value.trim() && tpl.label) {
    headlineInput.value = tpl.label;
  }
  const current = bodyInput.value;
  const insertText = tpl.text || "";
  bodyInput.value = current
    ? `${current.replace(/\s*$/, "")}\n${insertText}`
    : insertText;
  state.draft.usedTemplate = true;
  bodyInput.focus();
  showError(entryError, "");
}

// --- 定型文管理モーダル ---------------------------------------------------

btnOpenTemplates.addEventListener("click", openTemplatesModal);
btnCloseTemplates.addEventListener("click", closeTemplatesModal);
templatesModal.querySelector("[data-close-modal]").addEventListener("click", closeTemplatesModal);
btnTplSave.addEventListener("click", handleTemplateSave);
btnTplCancel.addEventListener("click", resetTemplateEditor);

function openTemplatesModal() {
  resetTemplateEditor();
  renderTemplateList();
  templatesModal.hidden = false;
}

function closeTemplatesModal() {
  templatesModal.hidden = true;
}

function renderTemplateList() {
  tplList.innerHTML = "";
  tplListEmpty.hidden = state.templates.length > 0;

  state.templates.forEach((tpl) => {
    const li = document.createElement("li");
    li.className = "tpl-list-item";

    const info = document.createElement("div");
    info.className = "tpl-list-item__info";
    const label = document.createElement("div");
    label.className = "tpl-list-item__label";
    label.textContent = tpl.label || "(名称未設定)";
    const text = document.createElement("div");
    text.className = "tpl-list-item__text";
    text.textContent = tpl.text || "";
    info.append(label, text);

    li.appendChild(info);
    enableRowGestures(li, {
      actions: [
        {
          action: "edit",
          title: "編集",
          onClick: () => startEditTemplate(tpl),
        },
        {
          action: "delete",
          title: "削除",
          onClick: () => handleTemplateDelete(tpl),
        },
      ],
    });
    tplList.appendChild(li);
  });
}

function startEditTemplate(tpl) {
  state.editingTemplateId = tpl.id;
  tplEditorTitle.textContent = "定型文を編集";
  tplLabelInput.value = tpl.label || "";
  tplTextInput.value = tpl.text || "";
  btnTplSave.textContent = "更新する";
  btnTplCancel.hidden = false;
  showError(tplError, "");
  tplLabelInput.focus();
}

function resetTemplateEditor() {
  state.editingTemplateId = null;
  tplEditorTitle.textContent = "新しい定型文を追加";
  tplLabelInput.value = "";
  tplTextInput.value = "";
  btnTplSave.textContent = "追加する";
  btnTplCancel.hidden = true;
  showError(tplError, "");
}

async function handleTemplateSave() {
  const label = tplLabelInput.value.trim();
  const text = tplTextInput.value.trim();
  if (!label) {
    showError(tplError, "ボタン名を入力してください。");
    return;
  }

  showError(tplError, "");
  const editingId = state.editingTemplateId;
  setBusy(btnTplSave, true, "保存中...", editingId ? "更新する" : "追加する");
  try {
    if (editingId) {
      await updateTemplate(editingId, { label, text });
      showToast("定型文を更新しました。");
    } else {
      await addTemplate({ label, text });
      showToast("定型文を追加しました。");
    }
    resetTemplateEditor();
  } catch (err) {
    console.error(err);
    showError(tplError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    setBusy(btnTplSave, false, "保存中...", state.editingTemplateId ? "更新する" : "追加する");
  }
}

async function handleTemplateDelete(tpl) {
  const ok = window.confirm(`定型文「${tpl.label}」を削除しますか？`);
  if (!ok) return;
  try {
    await deleteTemplate(tpl.id);
    if (state.editingTemplateId === tpl.id) resetTemplateEditor();
    showToast("定型文を削除しました。");
  } catch (err) {
    console.error(err);
    showToast("削除に失敗しました。", { isError: true });
  }
}

// --- 初期化 --------------------------------------------------------------

subscribeTemplates((templates) => {
  state.templates = templates;
  renderTemplateButtons();
  if (!templatesModal.hidden) renderTemplateList();
});

renderCategorySelection();

initExamPlanUI({
  showToast,
  showError,
  setBusy,
});

initMedsUI({
  showToast,
  showError,
  setBusy,
  getSelectedAuthor: () => state.draft.author || state.lastAuthor || "",
});

initHistoryUI({
  showToast,
  showError,
  setBusy,
  getSelectedAuthor: () => state.draft.author || state.lastAuthor || "",
});

initProceduresUI({
  showToast,
  showError,
  setBusy,
  getSelectedAuthor: () => state.draft.author || state.lastAuthor || "",
});

initSpecialNotesUI({
  showToast,
  showError,
  setBusy,
  getSelectedAuthor: () => state.draft.author || state.lastAuthor || "",
});

initSettingsUI({
  showToast,
  showError,
  onApiKeyChange: notifyApiKeyChanged,
  onLogout: logoutToPasscode,
});

initFreeQaUI({
  showToast,
  showError,
  setBusy,
  getSelectedAuthor: () => state.draft.author || state.lastAuthor || "",
  getTimelineEntries: () => state.entries || [],
});

// 検索タブ表示時に入力欄・APIキー案内を再確認（他タブ操作の影響を受けないようにする）
setRightTabChangeHandler((tabId, hasKarte) => {
  if (tabId !== "qa" || !hasKarte) return;
  if (state.karteNumber) ensureFreeQaActive(state.karteNumber);
  onFreeQaTabShown();
});

initAiSuggestUI({
  showToast,
  showError,
  setBusy,
  getSelectedAuthor: () => state.draft.author || state.lastAuthor || "",
  onBlockingChange: () => {},
});

initServiceWorkerUpdates({
  onUpdateAvailable: (reg) => {
    // 新しい SW があるときは必ず確認バナーを出す（記入中の強制リロードを避ける）
    document.querySelectorAll(".sw-update-banner").forEach((el) => el.remove());
    const banner = document.createElement("div");
    banner.className = "sw-update-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML = `
      <p class="sw-update-banner__text">新しいバージョンがあります。更新しますか？</p>
      <div class="sw-update-banner__actions">
        <button type="button" class="btn btn--small btn--primary" data-sw-update>更新する</button>
        <button type="button" class="btn btn--small btn--outline" data-sw-dismiss>あとで</button>
      </div>
    `;
    banner.querySelector("[data-sw-update]").addEventListener("click", () => {
      applyWaitingUpdate(reg);
    });
    banner.querySelector("[data-sw-dismiss]").addEventListener("click", () => {
      banner.remove();
    });
    document.body.appendChild(banner);
  },
});

initLeftCollapse();

if (isPasscodeVerified()) {
  goToKarte();
} else {
  showLockScreen();
}
