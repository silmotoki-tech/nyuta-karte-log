import {
  getAnimalName,
  setAnimalName,
  addEntry,
  setEntryImportant,
  deleteEntry,
  subscribeEntries,
  subscribeTemplates,
  addTemplate,
  updateTemplate,
  deleteTemplate,
} from "./db.js";
import {
  initExamPlanUI,
  enterExamPlan,
  leaveExamPlan,
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
import { initSettingsUI } from "./settings-ui.js";
import {
  initFreeQaUI,
  enterFreeQa,
  leaveFreeQa,
  notifyApiKeyChanged,
} from "./free-qa-ui.js";

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
const PASSCODE_SESSION_KEY = "nyutaKartePasscodeVerified";

const state = {
  centerState: "passcode",
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
};

// --- DOM参照 -------------------------------------------------------------

const gatePasscode = document.getElementById("gate-passcode");
const gateKarte = document.getElementById("gate-karte");
const gateAnimal = document.getElementById("gate-animal");
const centerMain = document.getElementById("center-main");

const passcodeInput = document.getElementById("passcode-input");
const passcodeError = document.getElementById("passcode-error");
const btnPasscodeNext = document.getElementById("btn-passcode-next");

const karteNumberInput = document.getElementById("karte-number-input");
const karteError = document.getElementById("karte-error");
const btnKarteNext = document.getElementById("btn-karte-next");

const animalKarteNumberEl = document.getElementById("animal-karte-number");
const animalNameInput = document.getElementById("animal-name-input");
const animalRegisteredHint = document.getElementById("animal-registered-hint");
const animalError = document.getElementById("animal-error");
const btnAnimalNext = document.getElementById("btn-animal-next");
const btnAnimalBack = document.getElementById("btn-animal-back");

const mainKarteNumberEl = document.getElementById("main-karte-number");
const mainAnimalNameEl = document.getElementById("main-animal-name");
const btnChangeKarte = document.getElementById("btn-change-karte");
const btnOpenTemplates = document.getElementById("btn-open-templates");

const headerKarte = document.getElementById("header-karte");
const headerKarteNumber = document.getElementById("header-karte-number");
const headerAnimalName = document.getElementById("header-animal-name");

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

function showCenterState(s) {
  state.centerState = s;
  gatePasscode.hidden = s !== "passcode";
  gateKarte.hidden = s !== "karte";
  gateAnimal.hidden = s !== "animal";
  centerMain.hidden = s !== "main";

  const inMain = s === "main";
  leftEmpty.hidden = inMain;
  headlineList.hidden = !inMain;
  starFilterWrap.hidden = !inMain;
  headerKarte.hidden = !inMain;
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
 * 時系列エントリのメタ情報テキストを生成する。
 * 遡って入力された（記録日と入力日が異なる）場合は両方の日付を併記する。
 */
function buildEntryMeta(entry) {
  const rec = entry.recordDate;
  const ms = entry.enteredMs || Date.parse(entry.enteredAtIso || "") || 0;
  const enteredDateStr = ms ? dateStrFromMs(ms) : "";
  const author = entry.author || "";

  if (rec && enteredDateStr && enteredDateStr !== rec) {
    return `${mdFromStr(rec)}の記録　（${mdhmFromMs(ms)} 入力・記入者：${author}）`;
  }
  const timePart = ms ? `${hmFromMs(ms)} 入力・` : "";
  return `${mdFromStr(rec)}　（${timePart}記入者：${author}）`;
}

// --- 状態0: パスコード入力 -----------------------------------------------

passcodeInput.addEventListener("input", () => {
  passcodeInput.value = passcodeInput.value.replace(/[^0-9]/g, "").slice(0, 4);
  showError(passcodeError, "");
});

passcodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handlePasscodeNext();
  }
});

btnPasscodeNext.addEventListener("click", handlePasscodeNext);

function handlePasscodeNext() {
  const value = passcodeInput.value.trim();
  if (value !== PASSCODE) {
    showError(passcodeError, "パスコードが正しくありません。");
    passcodeInput.value = "";
    passcodeInput.focus();
    return;
  }
  showError(passcodeError, "");
  try {
    sessionStorage.setItem(PASSCODE_SESSION_KEY, "1");
  } catch (err) {
    console.error("セッション情報の保存に失敗しました", err);
  }
  passcodeInput.value = "";
  goToKarte();
}

function isPasscodeVerified() {
  try {
    return sessionStorage.getItem(PASSCODE_SESSION_KEY) === "1";
  } catch (err) {
    return false;
  }
}

// --- 状態1: カルテ番号入力 -----------------------------------------------

function goToKarte() {
  showCenterState("karte");
  setTimeout(() => karteNumberInput.focus(), 0);
}

karteNumberInput.addEventListener("input", () => {
  karteNumberInput.value = karteNumberInput.value.replace(/[^0-9]/g, "").slice(0, 5);
  showError(karteError, "");
});

karteNumberInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleKarteNext();
  }
});

btnKarteNext.addEventListener("click", handleKarteNext);

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
  if (event.key === "Enter") {
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
    renderAuthorSelection();
    showError(entryError, "");
  });
  authorRow.appendChild(btn);
});

function renderAuthorSelection() {
  authorRow.querySelectorAll(".author-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.author === state.draft.author);
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
  categoryButtonsEl.querySelectorAll(".category-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.category === state.draft.category);
  });
}

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
  leaveMain();
  goToKarte();
  karteNumberInput.value = "";
});

btnEntrySave.addEventListener("click", handleEntrySave);

function resetDraft() {
  state.draft.category = "none";
  state.draft.important = false;
  state.draft.usedTemplate = false;
  // 記入者は続けて記入することが多いため保持する
  headlineInput.value = "";
  bodyInput.value = "";
  btnImportant.setAttribute("aria-pressed", "false");
  recordDateInput.value = todayStr();
  renderCategorySelection();
  updateRecordDateNote();
  // フォームを先頭（記入者）まで戻す
  const formEl = document.querySelector(".entry-form");
  if (formEl) formEl.scrollTop = 0;
}

function enterMain() {
  mainKarteNumberEl.textContent = state.karteNumber;
  mainAnimalNameEl.textContent = state.animalName;
  headerKarteNumber.textContent = state.karteNumber;
  headerAnimalName.textContent = state.animalName;

  recordDateInput.max = todayStr();
  resetDraft();
  renderAuthorSelection();
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
  leaveFreeQa();
  state.karteNumber = null;
  state.animalName = null;
  state.entries = [];
  state.draft.author = null;
  state.starFilter = false;
  starFilterInput.checked = false;
  timelineEl.innerHTML = "";
  headlineList.innerHTML = "";
}

async function handleEntrySave() {
  const headline = headlineInput.value.trim();
  const body = bodyInput.value.trim();
  const recordDate = recordDateInput.value;

  if (!state.draft.author) {
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
    await addEntry(state.karteNumber, {
      recordDate,
      headline,
      category: state.draft.category,
      important: state.draft.important,
      author: state.draft.author,
      body,
      source: state.draft.usedTemplate ? "template" : "manual",
    });
    resetDraft();
    showToast("保存しました。");
    headlineInput.focus();
  } catch (err) {
    console.error(err);
    showError(entryError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    setBusy(btnEntrySave, false, "保存中...", "保存する");
  }
}

// --- 時系列・見出しの描画 -------------------------------------------------

function visibleEntries() {
  // db から渡される state.entries は記録日の昇順（古い→新しい）。
  // 表示は「新しい→古い」の降順にするため、コピーして反転する。
  // 時系列と左カラムの見出しは同じ配列を使うため、並び順は常に一致する。
  const list = state.starFilter
    ? state.entries.filter((e) => e.important)
    : state.entries.slice();
  return list.reverse();
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
    timelineEmptyEl.textContent = "★が付いた記録はありません。";
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
  const headlineEl = li.querySelector(".tl-item__headline");
  const catLabelEl = li.querySelector(".tl-item__cat-label");
  const metaEl = li.querySelector(".tl-item__meta");
  const bodyEl = li.querySelector(".tl-item__body");
  const deleteBtn = li.querySelector(".tl-item__delete");

  starBtn.setAttribute("aria-pressed", String(Boolean(entry.important)));
  headlineEl.textContent = entry.headline || "（見出しなし）";
  catLabelEl.textContent = categoryShort(entry.category);
  metaEl.textContent = buildEntryMeta(entry);
  bodyEl.textContent = entry.body || "";

  starBtn.addEventListener("click", async () => {
    const next = !(entry.important);
    starBtn.setAttribute("aria-pressed", String(next));
    try {
      await setEntryImportant(state.karteNumber, entry.id, next);
    } catch (err) {
      console.error(err);
      starBtn.setAttribute("aria-pressed", String(entry.important));
      showToast("★の更新に失敗しました。", { isError: true });
    }
  });

  deleteBtn.addEventListener("click", async () => {
    const ok = window.confirm(
      "この記録を削除しますか？（訂正は削除ではなく、新しい記録の追記で行ってください）"
    );
    if (!ok) return;
    setBusy(deleteBtn, true, "削除中...", "削除");
    try {
      await deleteEntry(state.karteNumber, entry.id);
      showToast("削除しました。");
    } catch (err) {
      console.error(err);
      showToast("削除に失敗しました。", { isError: true });
      setBusy(deleteBtn, false, "削除中...", "削除");
    }
  });

  return li;
}

function renderHeadlines(entries) {
  headlineList.innerHTML = "";
  entries.forEach((entry) => {
    const fragment = headlineItemTemplate.content.cloneNode(true);
    const li = fragment.querySelector(".hl-item");
    const btn = li.querySelector(".hl-item__btn");
    const dot = li.querySelector(".hl-item__dot");
    const textEl = li.querySelector(".hl-item__text");
    const dateEl = li.querySelector(".hl-item__date");

    li.classList.toggle("is-important", Boolean(entry.important));
    dot.dataset.category = entry.category || "none";
    textEl.textContent = entry.headline || "（見出しなし）";
    dateEl.textContent = mdFromStr(entry.recordDate);

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

    const actions = document.createElement("div");
    actions.className = "tpl-list-item__actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--small btn--outline";
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", () => startEditTemplate(tpl));
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn--small btn--danger-outline";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", () => handleTemplateDelete(tpl));
    actions.append(editBtn, delBtn);

    li.append(info, actions);
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
  getSelectedAuthor: () => state.draft.author || "",
});

initHistoryUI({
  showToast,
  showError,
  setBusy,
  getSelectedAuthor: () => state.draft.author || "",
});

initSettingsUI({
  showToast,
  showError,
  onApiKeyChange: notifyApiKeyChanged,
});

initFreeQaUI({
  showToast,
  showError,
  setBusy,
  getSelectedAuthor: () => state.draft.author || "",
  getTimelineEntries: () => state.entries || [],
});

if (isPasscodeVerified()) {
  goToKarte();
} else {
  showCenterState("passcode");
  setTimeout(() => passcodeInput.focus(), 0);
}
