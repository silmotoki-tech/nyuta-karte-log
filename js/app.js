import {
  getAnimalName,
  setAnimalName,
  addEntry,
  updateEntry,
  deleteEntry,
  subscribeEntries,
} from "./db.js";

const VETS = ["院長", "大辻", "川邉", "齋藤", "横井", "德永"];
const NURSES = ["種田", "竹内", "神子島", "大澤", "川合", "嶋本", "道野"];

const state = {
  karteNumber: null,
  animalName: null,
  selectedAuthor: null,
  entries: [],
  unsubscribeEntries: null,
};

// --- DOM参照 -----------------------------------------------------------

const screens = {
  passcode: document.getElementById("screen-passcode"),
  karte: document.getElementById("screen-karte"),
  animal: document.getElementById("screen-animal"),
  entry: document.getElementById("screen-entry"),
};

const PASSCODE = "2211";
const PASSCODE_SESSION_KEY = "nyutaKartePasscodeVerified";

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

const entryKarteNumberEl = document.getElementById("entry-karte-number");
const entryAnimalNameEl = document.getElementById("entry-animal-name");
const btnEntryBack = document.getElementById("btn-entry-back");
const authorButtonsVet = document.getElementById("author-buttons-vet");
const authorButtonsNurse = document.getElementById("author-buttons-nurse");
const entryTextInput = document.getElementById("entry-text-input");
const entryError = document.getElementById("entry-error");
const btnEntrySave = document.getElementById("btn-entry-save");

const entriesListEl = document.getElementById("entries-list");
const entriesEmptyEl = document.getElementById("entries-empty");
const entryItemTemplate = document.getElementById("entry-item-template");

const toastEl = document.getElementById("toast");

// --- 共通ユーティリティ ---------------------------------------------------

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
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

function formatDateTime(value) {
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

/**
 * 記入者選択ボタン群を生成する。
 * 同じ selectionState オブジェクトを共有する複数グループ（獣医師/看護師）で
 * 単一選択（1人だけ選べる）を実現する。
 */
function createAuthorButtonGroup(names, selectionState, onChange) {
  return names.map((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "author-btn";
    btn.textContent = name;
    btn.dataset.author = name;
    btn.addEventListener("click", () => {
      selectionState.selected = name;
      onChange(name);
    });
    return btn;
  });
}

function renderAuthorSelection(buttons, selectionState) {
  buttons.forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.author === selectionState.selected);
  });
}

// --- 画面0: パスコード入力 -----------------------------------------------

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
  showScreen("karte");
  setTimeout(() => karteNumberInput.focus(), 0);
}

function isPasscodeVerified() {
  try {
    return sessionStorage.getItem(PASSCODE_SESSION_KEY) === "1";
  } catch (err) {
    return false;
  }
}

// --- 画面1: カルテ番号入力 -----------------------------------------------

karteNumberInput.addEventListener("input", () => {
  const digitsOnly = karteNumberInput.value.replace(/[^0-9]/g, "").slice(0, 5);
  karteNumberInput.value = digitsOnly;
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

    showScreen("animal");
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

// --- 画面2: 動物名の確認・登録 --------------------------------------------

btnAnimalBack.addEventListener("click", () => {
  showError(animalError, "");
  showScreen("karte");
  setTimeout(() => karteNumberInput.focus(), 0);
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
    enterEntryScreen();
  } catch (err) {
    console.error(err);
    showError(animalError, "動物名の保存に失敗しました。もう一度お試しください。");
  } finally {
    setBusy(btnAnimalNext, false, "保存中...", "この内容で次へ");
  }
}

// --- 画面3: 記入・時系列一覧 ----------------------------------------------

const mainAuthorSelection = { selected: null };
const mainVetButtons = createAuthorButtonGroup(VETS, mainAuthorSelection, () => {
  renderAuthorSelection([...mainVetButtons, ...mainNurseButtons], mainAuthorSelection);
  showError(entryError, "");
});
const mainNurseButtons = createAuthorButtonGroup(NURSES, mainAuthorSelection, () => {
  renderAuthorSelection([...mainVetButtons, ...mainNurseButtons], mainAuthorSelection);
  showError(entryError, "");
});
mainVetButtons.forEach((btn) => authorButtonsVet.appendChild(btn));
mainNurseButtons.forEach((btn) => authorButtonsNurse.appendChild(btn));

btnEntryBack.addEventListener("click", () => {
  leaveEntryScreen();
  showScreen("karte");
  karteNumberInput.value = "";
  setTimeout(() => karteNumberInput.focus(), 0);
});

btnEntrySave.addEventListener("click", handleEntrySave);

function enterEntryScreen() {
  entryKarteNumberEl.textContent = state.karteNumber;
  entryAnimalNameEl.textContent = state.animalName;
  entryTextInput.value = "";
  showError(entryError, "");

  showScreen("entry");

  if (state.unsubscribeEntries) {
    state.unsubscribeEntries();
  }
  state.unsubscribeEntries = subscribeEntries(state.karteNumber, (entries) => {
    state.entries = entries;
    renderEntries(entries);
  });
}

function leaveEntryScreen() {
  if (state.unsubscribeEntries) {
    state.unsubscribeEntries();
    state.unsubscribeEntries = null;
  }
  state.karteNumber = null;
  state.animalName = null;
  state.entries = [];
  mainAuthorSelection.selected = null;
  renderAuthorSelection([...mainVetButtons, ...mainNurseButtons], mainAuthorSelection);
}

async function handleEntrySave() {
  const text = entryTextInput.value.trim();

  if (!mainAuthorSelection.selected) {
    showError(entryError, "記入者を選択してください。");
    return;
  }
  if (!text) {
    showError(entryError, "記入内容を入力してください。");
    return;
  }

  showError(entryError, "");
  setBusy(btnEntrySave, true, "保存中...", "保存する");

  try {
    await addEntry(state.karteNumber, {
      author: mainAuthorSelection.selected,
      text,
    });
    entryTextInput.value = "";
    showToast("保存しました。");
  } catch (err) {
    console.error(err);
    showError(entryError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    setBusy(btnEntrySave, false, "保存中...", "保存する");
  }
}

// --- 記録一覧の表示・編集・削除 -------------------------------------------

function renderEntries(entries) {
  entriesListEl.innerHTML = "";
  entriesEmptyEl.hidden = entries.length > 0;

  entries.forEach((entry) => {
    entriesListEl.appendChild(createEntryListItem(entry));
  });
}

function createEntryListItem(entry) {
  const fragment = entryItemTemplate.content.cloneNode(true);
  const li = fragment.querySelector(".entry-item");

  const viewEl = li.querySelector(".entry-item__view");
  const dateEl = li.querySelector(".entry-item__date");
  const authorEl = li.querySelector(".entry-item__author");
  const textEl = li.querySelector(".entry-item__text");

  const editEl = li.querySelector(".entry-item__edit");
  const editAuthorButtonsEl = li.querySelector(".entry-item__edit-author-buttons");
  const editTextEl = li.querySelector(".entry-item__edit-text");

  const editBtn = li.querySelector(".entry-item__edit-btn");
  const deleteBtn = li.querySelector(".entry-item__delete-btn");
  const saveBtn = li.querySelector(".entry-item__save-btn");
  const cancelBtn = li.querySelector(".entry-item__cancel-btn");

  li.classList.toggle("is-edited", Boolean(entry.updatedAt));
  dateEl.textContent = formatDateTime(entry.createdAt || entry.date);
  authorEl.textContent = entry.author;
  textEl.textContent = entry.text;

  const editSelection = { selected: entry.author };
  const editButtons = [
    ...createAuthorButtonGroup(VETS, editSelection, () => {
      renderAuthorSelection(editButtons, editSelection);
    }),
    ...createAuthorButtonGroup(NURSES, editSelection, () => {
      renderAuthorSelection(editButtons, editSelection);
    }),
  ];
  editButtons.forEach((btn) => editAuthorButtonsEl.appendChild(btn));
  renderAuthorSelection(editButtons, editSelection);

  editBtn.addEventListener("click", () => {
    editSelection.selected = entry.author;
    renderAuthorSelection(editButtons, editSelection);
    editTextEl.value = entry.text;
    viewEl.hidden = true;
    editEl.hidden = false;
  });

  cancelBtn.addEventListener("click", () => {
    editEl.hidden = true;
    viewEl.hidden = false;
  });

  saveBtn.addEventListener("click", async () => {
    const newText = editTextEl.value.trim();
    if (!editSelection.selected) {
      showToast("記入者を選択してください。", { isError: true });
      return;
    }
    if (!newText) {
      showToast("記入内容を入力してください。", { isError: true });
      return;
    }
    setBusy(saveBtn, true, "保存中...", "保存");
    try {
      await updateEntry(state.karteNumber, entry.id, {
        author: editSelection.selected,
        text: newText,
      });
      editEl.hidden = true;
      viewEl.hidden = false;
      showToast("更新しました。");
    } catch (err) {
      console.error(err);
      showToast("更新に失敗しました。", { isError: true });
    } finally {
      setBusy(saveBtn, false, "保存中...", "保存");
    }
  });

  deleteBtn.addEventListener("click", async () => {
    const ok = window.confirm("この記録を削除しますか？この操作は取り消せません。");
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

// --- 初期化 --------------------------------------------------------------

if (isPasscodeVerified()) {
  showScreen("karte");
  setTimeout(() => karteNumberInput.focus(), 0);
} else {
  showScreen("passcode");
  setTimeout(() => passcodeInput.focus(), 0);
}
