// 中央カラム保存直後の AI 提案・確認フロー。
// 定型文入力は対象外。APIキー未設定時は案内してスキップする。

import {
  askClaudeWithPrompt,
  extractJsonObject,
  ApiKeyMissingError,
} from "./anthropic.js";
import { hasApiKey } from "./api-key.js";
import { addHistoryFromExternal } from "./history-ui.js";
import { addProcedureFromExternal } from "./procedures-ui.js";
import { addExamPlanFromExternal, expandSingleDate, unitToDays } from "./exam-plan-ui.js";
import { applyMedicationSuggestionFromExternal } from "./meds-ui.js";
import { updateMedication, fetchMedicationsOnce, setNextExamPlan } from "./db.js";
import { mountNumpad } from "./freq-picker.js";

const KIND_LABELS = {
  exam: "検査予定",
  medication: "薬剤情報",
  procedure: "処置ログ",
  history: "既往歴",
  followup_date: "次回／切れ目安日",
};

let deps = {
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "",
  onBlockingChange: () => {},
};

const state = {
  blocking: false,
  karteNumber: null,
  recordDate: "",
  author: "",
  suggestions: [], // { localId, kind, summary, data, status: "pending"|"done"|"ignored" }
  adjustingId: null,
  adjustDraft: null,
  dueRelative: { unit: "day", buffer: "", value: 0 },
};

// --- DOM ------------------------------------------------------------------

const loadingModal = document.getElementById("ai-suggest-loading-modal");
const reviewModal = document.getElementById("ai-suggest-review-modal");
const reviewList = document.getElementById("ai-suggest-list");
const reviewEmpty = document.getElementById("ai-suggest-empty");
const reviewProgress = document.getElementById("ai-suggest-progress");
const reviewError = document.getElementById("ai-suggest-error");

const adjustModal = document.getElementById("ai-suggest-adjust-modal");
const adjustTitle = document.getElementById("ai-suggest-adjust-title");
const adjustBody = document.getElementById("ai-suggest-adjust-body");
const adjustError = document.getElementById("ai-suggest-adjust-error");
const btnAdjustConfirm = document.getElementById("btn-ai-suggest-adjust-confirm");
const btnAdjustCancel = document.getElementById("btn-ai-suggest-adjust-cancel");
const btnCloseAdjust = document.getElementById("btn-close-ai-suggest-adjust");

// --- 公開API --------------------------------------------------------------

export function initAiSuggestUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  btnAdjustConfirm?.addEventListener("click", handleAdjustConfirm);
  btnAdjustCancel?.addEventListener("click", closeAdjustModal);
  btnCloseAdjust?.addEventListener("click", closeAdjustModal);
  // 確認フロー中は閉じられない（見落とし防止）
  reviewModal?.querySelector("[data-close-modal]")?.addEventListener("click", (e) => {
    e.preventDefault();
    deps.showToast("すべての提案に「確定」または「無視」を選んでください。", {
      isError: true,
    });
  });
}

export function isAiReviewBlocking() {
  return state.blocking;
}

/**
 * 手動保存直後に呼ぶ。template ソースは呼び出し側で除外すること。
 */
export async function runAiSuggestAfterSave({
  karteNumber,
  body,
  headline,
  recordDate,
  author,
}) {
  if (!body || !karteNumber) return;

  if (!hasApiKey()) {
    deps.showToast("設定画面でAPIキーを設定してください（AI提案はスキップしました）");
    return;
  }

  setBlocking(true);
  showLoading(true);

  try {
    const raw = await askClaudeWithPrompt({
      system: buildSuggestSystemPrompt(),
      user: buildSuggestUserPrompt({ body, headline, recordDate }),
      maxTokens: 2048,
    });
    const parsed = extractJsonObject(raw);
    const list = normalizeSuggestions(parsed);

    showLoading(false);

    if (list.length === 0) {
      setBlocking(false);
      deps.showToast("AI提案: 該当なし");
      return;
    }

    state.karteNumber = karteNumber;
    state.recordDate = recordDate || todayStr();
    state.author = author || deps.getSelectedAuthor() || "";
    state.suggestions = list.map((s, i) => ({
      ...s,
      localId: `s-${Date.now()}-${i}`,
      status: "pending",
    }));
    openReviewModal();
  } catch (err) {
    console.error(err);
    showLoading(false);
    setBlocking(false);
    if (err instanceof ApiKeyMissingError) {
      deps.showToast("設定画面でAPIキーを設定してください（AI提案はスキップしました）");
    } else {
      deps.showToast(`AI解析に失敗しました: ${err.message || "不明なエラー"}`, {
        isError: true,
      });
    }
  }
}

// --- プロンプト -----------------------------------------------------------

function buildSuggestSystemPrompt() {
  return [
    "あなたは動物病院のカルテ記録から、右カラムへ登録できそうな項目を抽出する補助です。",
    "見落としがあっても構いませんが、誤った情報を断定的に提案しないでください。",
    "本文に明確に書かれていない内容は推測で作らず、該当がなければ suggestions を空配列にしてください。",
    "必ず JSON オブジェクトのみを返してください（説明文は不要）。",
    "スキーマ:",
    '{ "suggestions": [ { "kind": "exam"|"medication"|"procedure"|"history"|"followup_date", "summary": "短い日本語", "data": {} } ] }',
    "",
    "kind別 data:",
    '- exam: { "item": "検査名", "dueDate": "YYYY-MM-DD", "note": "" }',
    '- medication: { "name": "薬剤名", "action": "add"|"increase"|"decrease"|"stop"|"resume", "frequencyChange": "例:1日2回→1回", "detail": "", "category": "A"|"B"|"C" }',
    '- procedure: { "date": "YYYY-MM-DD", "content": "処置内容" }',
    '- history: { "title": "病名など", "type": "disease"|"surgery"|"referral", "status": "active"|"resolved", "noteText": "" }',
    '- followup_date: ワクチン接種・予防薬処方を検出した場合のみ。{ "purpose": "exam_next"|"med_expiry", "label": "説明", "suggestedDate": "YYYY-MM-DD", "relatedName": "ワクチン名や薬名" }',
    "日付は記録日を基準に計算してください。不確かな提案は含めないでください。",
  ].join("\n");
}

function buildSuggestUserPrompt({ body, headline, recordDate }) {
  return [
    `記録日: ${recordDate || "（不明）"}`,
    `見出し: ${headline || "（なし）"}`,
    "",
    "本文:",
    body,
  ].join("\n");
}

function normalizeSuggestions(parsed) {
  if (!parsed || !Array.isArray(parsed.suggestions)) return [];
  const allowed = new Set(["exam", "medication", "procedure", "history", "followup_date"]);
  return parsed.suggestions
    .filter((s) => s && allowed.has(s.kind) && (s.summary || s.data))
    .map((s) => ({
      kind: s.kind,
      summary: String(s.summary || KIND_LABELS[s.kind] || "提案").trim(),
      data: s.data && typeof s.data === "object" ? s.data : {},
    }));
}

// --- レビューUI -----------------------------------------------------------

function setBlocking(on) {
  state.blocking = on;
  deps.onBlockingChange?.(on);
}

function showLoading(on) {
  if (loadingModal) loadingModal.hidden = !on;
}

function openReviewModal() {
  renderReviewList();
  if (reviewModal) reviewModal.hidden = false;
}

function closeReviewModal() {
  if (reviewModal) reviewModal.hidden = true;
  state.suggestions = [];
  state.karteNumber = null;
}

function pendingCount() {
  return state.suggestions.filter((s) => s.status === "pending").length;
}

function renderReviewList() {
  if (!reviewList) return;
  reviewList.innerHTML = "";
  const pending = pendingCount();
  if (reviewProgress) {
    reviewProgress.textContent =
      pending > 0
        ? `未対応の提案が ${pending} 件あります。すべて確定または無視してください。`
        : "すべての提案に対応しました。";
  }
  if (reviewEmpty) reviewEmpty.hidden = state.suggestions.length > 0;

  state.suggestions.forEach((s) => {
    const li = document.createElement("li");
    li.className = "ai-suggest-card";
    if (s.status !== "pending") li.classList.add("is-done");

    const badge = document.createElement("span");
    badge.className = "ai-suggest-card__kind";
    badge.textContent = KIND_LABELS[s.kind] || s.kind;

    const summary = document.createElement("p");
    summary.className = "ai-suggest-card__summary";
    summary.textContent = s.summary;

    const detail = document.createElement("p");
    detail.className = "ai-suggest-card__detail";
    detail.textContent = formatSuggestionDetail(s);

    const actions = document.createElement("div");
    actions.className = "ai-suggest-card__actions";

    if (s.status === "pending") {
      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "btn btn--small btn--primary";
      confirmBtn.textContent = "確定する";
      confirmBtn.addEventListener("click", () => handleConfirmClick(s.localId));

      const ignoreBtn = document.createElement("button");
      ignoreBtn.type = "button";
      ignoreBtn.className = "btn btn--small btn--outline";
      ignoreBtn.textContent = "無視する";
      ignoreBtn.addEventListener("click", () => markIgnored(s.localId));

      actions.append(confirmBtn, ignoreBtn);
    } else {
      const done = document.createElement("span");
      done.className = "ai-suggest-card__status";
      done.textContent = s.status === "done" ? "確定済み" : "無視済み";
      actions.appendChild(done);
    }

    li.append(badge, summary, detail, actions);
    reviewList.appendChild(li);
  });
}

function formatSuggestionDetail(s) {
  const d = s.data || {};
  if (s.kind === "exam") {
    return `項目: ${d.item || "—"}　目安日: ${d.dueDate || "—"}`;
  }
  if (s.kind === "medication") {
    return `薬剤: ${d.name || "—"}　操作: ${d.action || "add"}　${d.frequencyChange || ""}`;
  }
  if (s.kind === "procedure") {
    return `${d.date || "—"}　${d.content || ""}`;
  }
  if (s.kind === "history") {
    return `${d.title || "—"}（${d.type || "disease"} / ${d.status || "active"}）`;
  }
  if (s.kind === "followup_date") {
    const purpose =
      d.purpose === "med_expiry" ? "処方切れ目安" : "次回予定（検査）";
    return `${purpose}: ${d.relatedName || d.label || "—"}　案: ${d.suggestedDate || "—"}`;
  }
  return "";
}

function markIgnored(localId) {
  const s = state.suggestions.find((x) => x.localId === localId);
  if (!s || s.status !== "pending") return;
  s.status = "ignored";
  renderReviewList();
  maybeFinishReview();
}

async function handleConfirmClick(localId) {
  const s = state.suggestions.find((x) => x.localId === localId);
  if (!s || s.status !== "pending") return;

  // 検査・薬剤・日付提案は調整画面を挟む
  if (s.kind === "exam" || s.kind === "medication" || s.kind === "followup_date") {
    openAdjustModal(s);
    return;
  }

  try {
    await applySuggestion(s, s.data);
    s.status = "done";
    deps.showToast(`${KIND_LABELS[s.kind] || "提案"}を登録しました。`);
    renderReviewList();
    maybeFinishReview();
  } catch (err) {
    console.error(err);
    deps.showError(reviewError, err.message || "登録に失敗しました。");
  }
}

function maybeFinishReview() {
  if (pendingCount() > 0) return;
  closeReviewModal();
  setBlocking(false);
  deps.showToast("AI提案の確認が完了しました。");
}

// --- 調整モーダル ---------------------------------------------------------

function openAdjustModal(suggestion) {
  state.adjustingId = suggestion.localId;
  state.adjustDraft = JSON.parse(JSON.stringify(suggestion.data || {}));
  deps.showError(adjustError, "");
  if (adjustTitle) {
    adjustTitle.textContent = `${KIND_LABELS[suggestion.kind] || "提案"}の確認`;
  }
  renderAdjustBody(suggestion.kind, state.adjustDraft);
  if (adjustModal) adjustModal.hidden = false;
}

function closeAdjustModal() {
  if (adjustModal) adjustModal.hidden = true;
  state.adjustingId = null;
  state.adjustDraft = null;
  if (adjustBody) adjustBody.innerHTML = "";
}

function renderAdjustBody(kind, data) {
  if (!adjustBody) return;
  adjustBody.innerHTML = "";

  if (kind === "exam") {
    adjustBody.appendChild(
      fieldText("item", "検査項目", data.item || "", (v) => {
        state.adjustDraft.item = v;
      })
    );
    adjustBody.appendChild(buildDateField("dueDate", "目安日", data.dueDate || ""));
    adjustBody.appendChild(
      fieldText("note", "メモ（任意）", data.note || "", (v) => {
        state.adjustDraft.note = v;
      })
    );
    return;
  }

  if (kind === "medication") {
    adjustBody.appendChild(
      fieldText("name", "薬剤名", data.name || "", (v) => {
        state.adjustDraft.name = v;
      })
    );
    adjustBody.appendChild(buildActionButtons(data.action || "decrease"));
    adjustBody.appendChild(
      fieldText("frequencyChange", "頻度（任意）", data.frequencyChange || "", (v) => {
        state.adjustDraft.frequencyChange = v;
      })
    );
    adjustBody.appendChild(
      fieldText("detail", "メモ（任意）", data.detail || "", (v) => {
        state.adjustDraft.detail = v;
      })
    );
    return;
  }

  if (kind === "followup_date") {
    const purposeLabel =
      data.purpose === "med_expiry" ? "処方切れ目安日" : "次回予定日（検査）";
    const note = document.createElement("p");
    note.className = "field__note";
    note.textContent = `${data.label || data.relatedName || ""}（${purposeLabel}）`;
    adjustBody.appendChild(note);
    adjustBody.appendChild(
      fieldText("relatedName", "名称", data.relatedName || data.label || "", (v) => {
        state.adjustDraft.relatedName = v;
      })
    );
    adjustBody.appendChild(
      buildDateField("suggestedDate", purposeLabel, data.suggestedDate || "")
    );
  }
}

function fieldText(key, label, value, onInput) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const lab = document.createElement("label");
  lab.className = "label";
  lab.textContent = label;
  const input = document.createElement("input");
  input.className = "input";
  input.type = "text";
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  wrap.append(lab, input);
  return wrap;
}

function buildActionButtons(selected) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const lab = document.createElement("span");
  lab.className = "label";
  lab.textContent = "操作";
  const row = document.createElement("div");
  row.className = "exam-item-buttons";
  ["add", "increase", "decrease", "stop", "resume"].forEach((id) => {
    const labels = {
      add: "追加/継続",
      increase: "増量",
      decrease: "減量",
      stop: "中止",
      resume: "再開",
    };
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.textContent = labels[id];
    btn.classList.toggle("is-selected", selected === id);
    btn.addEventListener("click", () => {
      state.adjustDraft.action = id;
      row.querySelectorAll(".exam-item-btn").forEach((b) => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
    });
    row.appendChild(btn);
  });
  wrap.append(lab, row);
  return wrap;
}

function buildDateField(key, label, initialDate) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const lab = document.createElement("label");
  lab.className = "label";
  lab.textContent = label;

  const dateInput = document.createElement("input");
  dateInput.className = "input input--date";
  dateInput.type = "date";
  dateInput.value = initialDate || "";
  dateInput.addEventListener("change", () => {
    state.adjustDraft[key] = dateInput.value;
    syncRelativeFromDate(dateInput.value, display, unitRow);
  });

  const sub = document.createElement("span");
  sub.className = "label label--sub";
  sub.textContent = "今日からの相対指定";

  const unitRow = document.createElement("div");
  unitRow.className = "interval-unit-buttons";
  ["day", "week", "month"].forEach((u) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "interval-unit-btn";
    btn.textContent = u === "day" ? "日" : u === "week" ? "週" : "月";
    btn.dataset.unit = u;
    btn.addEventListener("click", () => {
      state.dueRelative.unit = u;
      unitRow.querySelectorAll(".interval-unit-btn").forEach((b) => {
        b.classList.toggle("is-selected", b.dataset.unit === u);
      });
      applyRelativeToDate(dateInput, key, display);
    });
    unitRow.appendChild(btn);
  });
  state.dueRelative = { unit: "day", buffer: "", value: 0 };
  unitRow.querySelector('[data-unit="day"]')?.classList.add("is-selected");

  const display = document.createElement("p");
  display.className = "interval-value-display";
  display.textContent = "0日後";

  const numpad = document.createElement("div");
  numpad.className = "numpad";
  mountNumpad(numpad, {
    onDigit: (d) => {
      if (state.dueRelative.buffer.length >= 4) return;
      state.dueRelative.buffer =
        state.dueRelative.buffer === "0" ? d : state.dueRelative.buffer + d;
      display.textContent = relativeLabel(state.dueRelative.unit, state.dueRelative.buffer);
    },
    onDelete: () => {
      state.dueRelative.buffer = state.dueRelative.buffer.slice(0, -1);
      display.textContent = relativeLabel(
        state.dueRelative.unit,
        state.dueRelative.buffer || "0"
      );
    },
    onConfirm: () => {
      const n = Number(state.dueRelative.buffer);
      if (!n || n < 1) {
        deps.showError(adjustError, "1以上の相対日数を入力してください。");
        return;
      }
      state.dueRelative.value = n;
      deps.showError(adjustError, "");
      applyRelativeToDate(dateInput, key, display);
    },
  });

  if (initialDate) syncRelativeFromDate(initialDate, display, unitRow);

  wrap.append(lab, dateInput, sub, unitRow, display, numpad);
  return wrap;
}

function relativeLabel(unit, value) {
  const n = value === "" ? 0 : Number(value) || 0;
  if (unit === "week") return `${n}週後`;
  if (unit === "month") return `${n}ヶ月後`;
  return `${n}日後`;
}

function applyRelativeToDate(dateInput, key, display) {
  const n = Number(state.dueRelative.buffer || state.dueRelative.value) || 0;
  if (n < 1) return;
  const days = unitToDays(state.dueRelative.unit, n);
  const date = addDays(todayStr(), days);
  dateInput.value = date;
  state.adjustDraft[key] = date;
  display.textContent = relativeLabel(state.dueRelative.unit, String(n));
}

function syncRelativeFromDate(dateStr, display, unitRow) {
  const days = daysBetween(todayStr(), dateStr);
  if (days == null || days < 0) return;
  let unit = "day";
  let value = days;
  if (days > 0 && days % 30 === 0) {
    unit = "month";
    value = days / 30;
  } else if (days > 0 && days % 7 === 0) {
    unit = "week";
    value = days / 7;
  }
  state.dueRelative = { unit, buffer: String(value), value };
  display.textContent = relativeLabel(unit, String(value));
  unitRow?.querySelectorAll(".interval-unit-btn").forEach((b) => {
    b.classList.toggle("is-selected", b.dataset.unit === unit);
  });
}

async function handleAdjustConfirm() {
  const localId = state.adjustingId;
  const s = state.suggestions.find((x) => x.localId === localId);
  if (!s) {
    closeAdjustModal();
    return;
  }
  const data = state.adjustDraft || {};
  if (s.kind === "exam" && (!data.item || !data.dueDate)) {
    deps.showError(adjustError, "検査項目と目安日を入力してください。");
    return;
  }
  if (s.kind === "medication" && !data.name) {
    deps.showError(adjustError, "薬剤名を入力してください。");
    return;
  }
  if (s.kind === "followup_date" && !data.suggestedDate) {
    deps.showError(adjustError, "日付を入力してください。");
    return;
  }

  deps.showError(adjustError, "");
  deps.setBusy(btnAdjustConfirm, true, "登録中...", "この内容で確定");
  try {
    await applySuggestion(s, data);
    s.data = data;
    s.status = "done";
    closeAdjustModal();
    deps.showToast(`${KIND_LABELS[s.kind] || "提案"}を登録しました。`);
    renderReviewList();
    maybeFinishReview();
  } catch (err) {
    console.error(err);
    deps.showError(adjustError, err.message || "登録に失敗しました。");
  } finally {
    deps.setBusy(btnAdjustConfirm, false, "登録中...", "この内容で確定");
  }
}

// --- 登録処理 -------------------------------------------------------------

async function applySuggestion(suggestion, data) {
  const karte = state.karteNumber;
  const author = state.author || deps.getSelectedAuthor() || "";
  const recordDate = state.recordDate || todayStr();

  if (suggestion.kind === "history") {
    await addHistoryFromExternal(karte, {
      title: data.title || suggestion.summary,
      type: data.type || "disease",
      status: data.status || "active",
      firstNoted: data.firstNoted || recordDate,
      noteText: data.noteText || "",
      author,
      source: "ai",
    });
    return;
  }

  if (suggestion.kind === "procedure") {
    await addProcedureFromExternal(karte, {
      date: data.date || recordDate,
      content: data.content || suggestion.summary,
      confirmedBy: author,
      source: "ai",
    });
    return;
  }

  if (suggestion.kind === "exam") {
    await addExamPlanFromExternal(karte, {
      item: data.item,
      dueDate: data.dueDate,
      note: data.note || "AI提案から登録",
    });
    return;
  }

  if (suggestion.kind === "medication") {
    await applyMedicationSuggestionFromExternal(karte, {
      name: data.name,
      action: data.action || "add",
      category: data.category || "B",
      frequencyChange: data.frequencyChange || "",
      frequency: data.frequency || null,
      detail: data.detail || suggestion.summary,
      eventDate: data.eventDate || recordDate,
      changedBy: author,
      expiryEstimate: data.expiryEstimate || "",
    });
    return;
  }

  if (suggestion.kind === "followup_date") {
    await applyFollowupDate(karte, data, author, recordDate);
  }
}

async function applyFollowupDate(karte, data, author, recordDate) {
  const date = data.suggestedDate;
  const name = data.relatedName || data.label || "ワクチン／予防薬";
  if (data.purpose === "med_expiry") {
    const drugs = await fetchMedicationsOnce(karte);
    const drug = drugs.find((d) => d.name === name);
    if (!drug) {
      await applyMedicationSuggestionFromExternal(karte, {
        name,
        action: "add",
        category: "B",
        eventDate: recordDate,
        changedBy: author,
        expiryEstimate: date,
        detail: "予防薬（AI提案）",
      });
    } else {
      await updateMedication(karte, drug.id, { expiryEstimate: date });
    }
    return;
  }

  // exam_next
  const window = expandSingleDate(date, 14);
  await setNextExamPlan(karte, {
    item: name,
    dueDateFrom: window.dueDateFrom,
    dueDateTo: window.dueDateTo,
    note: data.label || "ワクチン等の次回予定（AI提案）",
    recurringId: null,
  });
}

// --- 日付ユーティリティ ---------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateStr(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDateStr(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(dateStr, days) {
  const d = parseDateStr(dateStr);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return formatDateStr(d);
}

function daysBetween(fromStr, toStr) {
  const a = parseDateStr(fromStr);
  const b = parseDateStr(toStr);
  if (!a || !b) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/** テスト用: JSON正規化を公開 */
export function __testNormalizeSuggestions(parsed) {
  return normalizeSuggestions(parsed);
}
