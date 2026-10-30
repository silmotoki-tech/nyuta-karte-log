// 右カラムの種類別検査カード。カルテごとに6枚、登録前から常に出す。
// 空のカードは見出し1行。本文があるときだけ本文と最終更新を出す。
// 状態モードには出さない。examPlan の予定・実施履歴は触らない。

import { EXAM_CARD_KINDS, subscribeExamCards, saveExamCard } from "./db.js";
import { refreshChartSearch } from "./chart-search-ui.js";

const PLACEHOLDER = "例）肝スク（絶食）11月中旬\nT4 3ヶ月後 1/下旬";

let deps = {
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
};

const state = {
  karteNumber: null,
  records: emptyCards(),
  unsubscribe: null,
  editingKind: null,
};

const nodes = new Map();
const root = document.getElementById("right-block-exam-cards");

function emptyRecord() {
  return { schemaVersion: 1, text: "", updatedAt: "", updatedBy: "" };
}

function emptyCards() {
  const cards = {};
  EXAM_CARD_KINDS.forEach((kind) => {
    cards[kind.id] = emptyRecord();
  });
  return cards;
}

function asRecord(raw) {
  const entry = emptyRecord();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return entry;
  entry.text = typeof raw.text === "string" ? raw.text : "";
  entry.updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : "";
  entry.updatedBy = typeof raw.updatedBy === "string" ? raw.updatedBy : "";
  return entry;
}

function asCards(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const cards = {};
  EXAM_CARD_KINDS.forEach((kind) => {
    cards[kind.id] = asRecord(source[kind.id]);
  });
  return cards;
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

function kindMeta(kindId) {
  return EXAM_CARD_KINDS.find((kind) => kind.id === kindId);
}

function render() {
  nodes.forEach((node, kindId) => {
    const saved = String(state.records[kindId]?.text || "").trim();
    const editing = state.editingKind === kindId;
    node.root.classList.toggle("has-text", saved.length > 0);
    node.root.classList.toggle("is-editing", editing);
    node.mark.hidden = saved.length > 0;
    node.text.hidden = saved.length === 0;
    node.text.textContent = saved;
    node.view.hidden = editing;
    node.edit.hidden = !editing;

    const date = formatUpdatedDate(state.records[kindId]?.updatedAt);
    if (saved && date) {
      node.meta.hidden = false;
      node.meta.textContent = `最終更新 ${date}`;
    } else {
      node.meta.hidden = true;
      node.meta.textContent = "";
    }
  });
  refreshChartSearch();
}

export function getExamCardSearchItems() {
  return EXAM_CARD_KINDS.map((kind) => ({
    id: kind.id,
    label: `${kind.icon} ${kind.label}`,
    text: String(state.records[kind.id]?.text || "").trim(),
  })).filter((item) => item.text);
}

export function focusExamCardSearchTarget(kindId) {
  const node = nodes.get(kindId);
  node?.root?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function startEdit(kindId) {
  if (!state.karteNumber || state.editingKind) return;
  const node = nodes.get(kindId);
  if (!node) return;
  state.editingKind = kindId;
  node.input.value = state.records[kindId]?.text || "";
  deps.showError(node.error, "");
  render();
  node.input.focus();
}

function cancelEdit() {
  const node = state.editingKind ? nodes.get(state.editingKind) : null;
  state.editingKind = null;
  if (node) deps.showError(node.error, "");
  render();
}

async function handleSave(kindId) {
  if (!state.karteNumber || state.editingKind !== kindId) return;
  const node = nodes.get(kindId);
  const meta = kindMeta(kindId);
  if (!node || !meta) return;
  deps.setBusy(node.save, true, "保存中...", "保存");
  deps.showError(node.error, "");
  try {
    const saved = await saveExamCard(state.karteNumber, kindId, {
      text: node.input.value,
    });
    state.records[kindId] = asRecord(saved);
    state.editingKind = null;
    deps.showToast(`${meta.label}を保存しました。`);
    render();
  } catch (err) {
    console.error(err);
    deps.showError(node.error, "保存に失敗しました。通信状況を確認してください。");
  } finally {
    deps.setBusy(node.save, false, "保存中...", "保存");
  }
}

function buildCard(kind) {
  const wrap = document.createElement("div");
  wrap.className = "exam-note-wrap";
  wrap.dataset.kind = kind.id;

  const card = document.createElement("section");
  card.className = "exam-note";

  const view = document.createElement("div");
  view.className = "exam-note__view";
  view.setAttribute("role", "button");
  view.tabIndex = 0;
  view.setAttribute("aria-label", `${kind.icon} ${kind.label}を編集`);

  const line = document.createElement("div");
  line.className = "exam-note__line";

  const title = document.createElement("h2");
  title.className = "exam-note__title";
  title.textContent = `${kind.icon} ${kind.label}`;

  const mark = document.createElement("span");
  mark.className = "exam-note__mark";
  mark.textContent = "　—";

  const text = document.createElement("p");
  text.className = "exam-note__text";
  text.hidden = true;

  line.append(title, mark);
  view.append(line, text);

  const edit = document.createElement("div");
  edit.className = "exam-note__edit";
  edit.hidden = true;

  const editTitle = document.createElement("h2");
  editTitle.className = "exam-note__title";
  editTitle.textContent = `${kind.icon} ${kind.label}`;

  const label = document.createElement("label");
  label.className = "label";
  label.textContent = "内容";

  const input = document.createElement("textarea");
  input.className = "textarea";
  input.rows = 3;
  input.placeholder = PLACEHOLDER;
  input.setAttribute("inputmode", "text");
  input.setAttribute("enterkeyhint", "enter");
  label.htmlFor = `exam-card-input-${kind.id}`;
  input.id = `exam-card-input-${kind.id}`;

  const error = document.createElement("p");
  error.className = "error-text";
  error.hidden = true;
  error.setAttribute("role", "alert");

  const actions = document.createElement("div");
  actions.className = "exam-note__actions";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn btn--small btn--primary";
  save.textContent = "保存";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn btn--small btn--ghost";
  cancel.textContent = "取り消し";

  actions.append(save, cancel);
  edit.append(editTitle, label, input, error, actions);

  const meta = document.createElement("p");
  meta.className = "exam-note__meta";
  meta.hidden = true;

  card.append(view, edit);
  wrap.append(card, meta);

  const open = () => startEdit(kind.id);
  view.addEventListener("click", open);
  view.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  });
  save.addEventListener("click", () => handleSave(kind.id));
  cancel.addEventListener("click", cancelEdit);

  nodes.set(kind.id, { root: wrap, view, edit, mark, text, input, error, save, meta });
  return wrap;
}

export function initExamCardsUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  if (!root || root.childElementCount > 0) {
    render();
    return;
  }
  EXAM_CARD_KINDS.forEach((kind) => {
    root.appendChild(buildCard(kind));
  });
  render();
}

export function enterExamCards(karteNumber) {
  leaveExamCards();
  state.karteNumber = karteNumber;
  state.records = emptyCards();
  state.editingKind = null;
  render();
  state.unsubscribe = subscribeExamCards(karteNumber, (cards) => {
    state.records = asCards(cards);
    render();
  });
}

export function leaveExamCards() {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }
  const editing = state.editingKind ? nodes.get(state.editingKind) : null;
  state.karteNumber = null;
  state.records = emptyCards();
  state.editingKind = null;
  if (editing) deps.showError(editing.error, "");
  render();
}
