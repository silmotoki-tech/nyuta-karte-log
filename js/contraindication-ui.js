// 右カラムの禁忌・副作用歴。カルテごとに1件の自由記述。
// 空の患者もカードは出し、「なし」と表示する。状態モードには出さない。

import { subscribeContraindication, saveContraindication } from "./db.js";

const AUTHORS = [
  "院長", "大辻", "川邉", "齋藤", "横井", "德永",
  "種田", "竹内", "神子島", "大澤", "川合", "嶋本", "道野",
];

let deps = {
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "",
  onAuthorChosen: () => {},
};

const state = {
  karteNumber: null,
  record: emptyRecord(),
  unsubscribe: null,
  editing: false,
  author: "",
};

const wrap = document.getElementById("right-block-contra");
const card = document.getElementById("contra-card");
const view = document.getElementById("contra-card-view");
const edit = document.getElementById("contra-card-edit");
const textEl = document.getElementById("contra-card-text");
const input = document.getElementById("contra-card-input");
const authorRow = document.getElementById("contra-card-authors");
const errorEl = document.getElementById("contra-card-error");
const metaEl = document.getElementById("contra-card-meta");
const btnSave = document.getElementById("contra-card-save");
const btnCancel = document.getElementById("contra-card-cancel");

function emptyRecord() {
  return { schemaVersion: 1, text: "", updatedAt: "", updatedBy: "" };
}

function asRecord(raw) {
  const entry = emptyRecord();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return entry;
  entry.text = typeof raw.text === "string" ? raw.text : "";
  entry.updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : "";
  entry.updatedBy = typeof raw.updatedBy === "string" ? raw.updatedBy : "";
  return entry;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatUpdatedDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

function currentText() {
  if (state.editing) return String(input?.value || "").trim();
  return String(state.record.text || "").trim();
}

function renderAuthors() {
  authorRow?.querySelectorAll(".author-btn").forEach((btn) => {
    const on = btn.dataset.author === state.author;
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

function render() {
  if (!card || !textEl) return;
  const saved = String(state.record.text || "").trim();
  const showing = currentText();
  card.classList.toggle("is-filled", showing.length > 0);
  textEl.textContent = saved || "なし";
  textEl.classList.toggle("is-empty", !saved);
  if (view) view.hidden = state.editing;
  if (edit) edit.hidden = !state.editing;

  const date = formatUpdatedDate(state.record.updatedAt);
  if (metaEl) {
    if (!date) {
      metaEl.hidden = true;
      metaEl.textContent = "";
    } else {
      const who = state.record.updatedBy ? ` ${state.record.updatedBy}` : "";
      metaEl.hidden = false;
      metaEl.textContent = `最終更新 ${date}${who}`;
    }
  }
  renderAuthors();
}

function startEdit() {
  if (!state.karteNumber || state.editing) return;
  state.editing = true;
  state.author = deps.getSelectedAuthor() || state.record.updatedBy || "";
  if (input) input.value = state.record.text || "";
  deps.showError(errorEl, "");
  render();
  input?.focus();
}

function cancelEdit() {
  state.editing = false;
  state.author = "";
  deps.showError(errorEl, "");
  render();
}

async function handleSave() {
  if (!state.karteNumber) return;
  const author = state.author || "";
  if (!author) {
    deps.showError(errorEl, "記入者を選択してください。");
    authorRow?.classList.add("is-error-target");
    return;
  }
  authorRow?.classList.remove("is-error-target");
  deps.setBusy(btnSave, true, "保存中...", "保存");
  deps.showError(errorEl, "");
  try {
    const saved = await saveContraindication(state.karteNumber, {
      text: input?.value ?? "",
      updatedBy: author,
    });
    state.record = asRecord(saved);
    state.editing = false;
    deps.onAuthorChosen(author);
    deps.showToast("禁忌・副作用歴を保存しました。");
    render();
  } catch (err) {
    console.error(err);
    deps.showError(errorEl, "保存に失敗しました。通信状況を確認してください。");
  } finally {
    deps.setBusy(btnSave, false, "保存中...", "保存");
  }
}

function buildAuthorButtons() {
  if (!authorRow || authorRow.childElementCount > 0) return;
  AUTHORS.forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "author-btn";
    btn.textContent = name;
    btn.dataset.author = name;
    btn.addEventListener("click", () => {
      state.author = name;
      authorRow.classList.remove("is-error-target");
      deps.showError(errorEl, "");
      deps.onAuthorChosen(name);
      renderAuthors();
    });
    authorRow.appendChild(btn);
  });
}

export function initContraindicationUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  buildAuthorButtons();
  view?.addEventListener("click", startEdit);
  view?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    startEdit();
  });
  input?.addEventListener("input", () => {
    card?.classList.toggle("is-filled", currentText().length > 0);
  });
  btnSave?.addEventListener("click", handleSave);
  btnCancel?.addEventListener("click", cancelEdit);
  render();
}

export function enterContraindication(karteNumber) {
  leaveContraindication();
  state.karteNumber = karteNumber;
  state.record = emptyRecord();
  state.editing = false;
  render();
  state.unsubscribe = subscribeContraindication(karteNumber, (record) => {
    state.record = asRecord(record);
    if (!state.editing) render();
  });
}

export function leaveContraindication() {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }
  state.karteNumber = null;
  state.record = emptyRecord();
  state.editing = false;
  state.author = "";
  deps.showError(errorEl, "");
  render();
}
