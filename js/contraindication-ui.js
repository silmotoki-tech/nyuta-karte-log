// 右カラムの「気をつけること」。カルテごとに1件の自由記述。
// 保存先は contraindications/{カルテ番号} のまま。
// 空の患者もカードは出し、「なし」と表示する。状態モードには出さない。

import { subscribeContraindication, saveContraindication } from "./db.js";
import { refreshChartSearch } from "./chart-search-ui.js";

let deps = {
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
};

const state = {
  karteNumber: null,
  record: emptyRecord(),
  unsubscribe: null,
  editing: false,
};

const wrap = document.getElementById("right-block-contra");
const card = document.getElementById("contra-card");
const view = document.getElementById("contra-card-view");
const edit = document.getElementById("contra-card-edit");
const textEl = document.getElementById("contra-card-text");
const input = document.getElementById("contra-card-input");
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
      metaEl.hidden = false;
      metaEl.textContent = `最終更新 ${date}`;
    }
  }
  refreshChartSearch();
}

export function getContraindicationSearchText() {
  return String(state.record?.text || "").trim();
}

export function focusContraindicationSearchTarget() {
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function startEdit() {
  if (!state.karteNumber || state.editing) return;
  state.editing = true;
  if (input) input.value = state.record.text || "";
  deps.showError(errorEl, "");
  render();
  input?.focus();
}

function cancelEdit() {
  state.editing = false;
  deps.showError(errorEl, "");
  render();
}

async function handleSave() {
  if (!state.karteNumber) return;
  deps.setBusy(btnSave, true, "保存中...", "保存");
  deps.showError(errorEl, "");
  try {
    const saved = await saveContraindication(state.karteNumber, {
      text: input?.value ?? "",
    });
    state.record = asRecord(saved);
    state.editing = false;
    deps.showToast("気をつけることを保存しました。");
    render();
  } catch (err) {
    console.error(err);
    deps.showError(errorEl, "保存に失敗しました。通信状況を確認してください。");
  } finally {
    deps.setBusy(btnSave, false, "保存中...", "保存");
  }
}

export function initContraindicationUI(helpers = {}) {
  deps = { ...deps, ...helpers };
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
  deps.showError(errorEl, "");
  render();
}
