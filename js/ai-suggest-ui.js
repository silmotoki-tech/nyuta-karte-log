// 中央カラム保存直後の AI 提案・確認フロー。
// 登録は必ず確認ポップアップで「確定する」を押したときだけ行う。
// 定型文入力は対象外。APIキー未設定時は案内してスキップする。

import {
  askClaudeWithPrompt,
  extractJsonObject,
  ApiKeyMissingError,
} from "./anthropic.js";
import { hasApiKey } from "./api-key.js";
import { addHistoryFromExternal } from "./history-ui.js";
import { addProcedureFromExternal } from "./procedures-ui.js";
import {
  addExamPlanFromExternal,
  unitToDays,
  switchRightTab,
} from "./exam-plan-ui.js";
import {
  ensureMedicationNameFromExternal,
  focusMedicationByName,
} from "./meds-ui.js";
import {
  updateMedication,
  fetchMedicationsOnce,
  fetchMedicationItemsOnce,
  fetchExamItemsOnce,
} from "./db.js";
import { findExamItemCandidates } from "./exam-item-match.js";
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
  suggestions: [],
  /** 各提案カード内の相対日付UI用 */
  dueRelativeById: {},
  /** 検査項目マスタ（AI確認時の候補照合用） */
  examMasterItems: [],
};

// --- DOM ------------------------------------------------------------------

const loadingModal = document.getElementById("ai-suggest-loading-modal");
const reviewModal = document.getElementById("ai-suggest-review-modal");
const reviewList = document.getElementById("ai-suggest-list");
const reviewEmpty = document.getElementById("ai-suggest-empty");
const reviewProgress = document.getElementById("ai-suggest-progress");
const reviewError = document.getElementById("ai-suggest-error");

// --- 公開API --------------------------------------------------------------

export function initAiSuggestUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  // 確認フロー中は閉じられない（見落とし防止）
  reviewModal?.querySelector("[data-close-modal]")?.addEventListener("click", (e) => {
    e.preventDefault();
    deps.showToast("すべての提案に「確定」または「無視」を選んでください。", {
      isError: true,
    });
  });
  // 調整用モーダルは使わない（確認画面内で編集する）
  const adjustModal = document.getElementById("ai-suggest-adjust-modal");
  if (adjustModal) adjustModal.hidden = true;
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
  deps.showError(reviewError, "");

  try {
    let masterLabels = [];
    let examMasterLabels = [];
    try {
      const items = await fetchMedicationItemsOnce();
      masterLabels = items.map((i) => i.label).filter(Boolean);
    } catch (_) {
      masterLabels = [];
    }
    try {
      state.examMasterItems = await fetchExamItemsOnce();
      examMasterLabels = state.examMasterItems
        .filter((i) => i && i.kind !== "group")
        .map((i) => i.label)
        .filter(Boolean);
    } catch (_) {
      state.examMasterItems = [];
      examMasterLabels = [];
    }

    const raw = await askClaudeWithPrompt({
      system: buildSuggestSystemPrompt(),
      user: buildSuggestUserPrompt({
        body,
        headline,
        recordDate,
        masterLabels,
        examMasterLabels,
      }),
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
    state.dueRelativeById = {};
    state.suggestions = list.map((s, i) => {
      const data = s.data && typeof s.data === "object" ? { ...s.data } : {};
      if (s.kind === "exam") {
        const detected = String(data.item || "").trim();
        data.detectedItem = detected;
        data.item = detected;
      }
      return {
        ...s,
        data,
        localId: `s-${Date.now()}-${i}`,
        status: "pending",
        applying: false,
      };
    });

    // ローディングを閉じたあと、必ず確認ポップアップを前面に出す
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
    "  検査名は本文の表現でよい。最終的な正式名称は確認画面でマスタ候補から人間が選ぶ。",
    "  note は必ず空文字。説明文・由来メモは絶対に入れない。",
    '- medication: 薬剤名の検出のみ。増量・減量・頻度・用法は絶対に提案しない。',
    '  { "name": "薬剤名" }',
    '  summary は必ず「〇〇について、薬剤情報タブで記録しますか？」の形式。',
    '- procedure: { "date": "YYYY-MM-DD", "content": "処置内容" }',
    '- history: { "title": "病名など", "type": "disease"|"surgery"|"referral", "status": "active"|"resolved", "noteText": "" }',
    "  noteText は必ず空文字。説明文は絶対に入れない。",
    '- followup_date: ワクチン接種・予防薬処方を検出した場合のみ。',
    '  { "purpose": "exam_next"|"med_expiry", "label": "説明", "suggestedDate": "YYYY-MM-DD", "relatedName": "ワクチン名や薬名" }',
    "日付は記録日を基準に計算してください。不確かな提案は含めないでください。",
    "重要: あなたは提案の叩き台だけを返す。登録は人間が確認画面で確定するまで行われない。",
  ].join("\n");
}

function buildSuggestUserPrompt({ body, headline, recordDate, masterLabels, examMasterLabels }) {
  const masterLine =
    masterLabels && masterLabels.length
      ? `薬剤マスタ（参考）: ${masterLabels.join("、")}`
      : "薬剤マスタ: （未取得。薬剤らしき固有名があれば name のみ提案してよい）";
  const examLine =
    examMasterLabels && examMasterLabels.length
      ? `検査項目マスタ（参考・可能なら近い名称を使う）: ${examMasterLabels.join("、")}`
      : "検査項目マスタ: （未取得。本文の検査名をそのまま item にしてよい）";
  return [
    `記録日: ${recordDate || "（不明）"}`,
    `見出し: ${headline || "（なし）"}`,
    masterLine,
    examLine,
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
    .map((s) => {
      const data = s.data && typeof s.data === "object" ? { ...s.data } : {};
      // 薬剤は名前以外のフィールドを落とす
      if (s.kind === "medication") {
        const name = String(data.name || "").trim();
        return {
          kind: "medication",
          summary:
            name
              ? `${name}について、薬剤情報タブで記録しますか？`
              : String(s.summary || "薬剤情報タブで記録しますか？").trim(),
          data: { name },
        };
      }
      // AIが生成した説明メモは捨てる（確認画面・登録とも空から開始。ユーザー入力のみ残す）
      if (s.kind === "exam") {
        data.note = "";
      }
      if (s.kind === "history") {
        data.noteText = "";
      }
      return {
        kind: s.kind,
        summary: String(s.summary || KIND_LABELS[s.kind] || "提案").trim(),
        data,
      };
    })
    .filter((s) => {
      if (s.kind === "medication") return Boolean(s.data.name);
      return true;
    });
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
  if (reviewModal) {
    reviewModal.hidden = false;
    reviewModal.classList.add("ai-suggest-modal");
  }
  // フォーカスを確認画面へ
  setTimeout(() => {
    reviewModal?.querySelector(".ai-suggest-card input, .ai-suggest-card button")?.focus?.();
  }, 0);
}

function closeReviewModal() {
  if (reviewModal) reviewModal.hidden = true;
  state.suggestions = [];
  state.karteNumber = null;
  state.dueRelativeById = {};
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
        ? `未対応の提案が ${pending} 件あります。内容を確認・修正してから「確定する」か「無視する」を選んでください。登録は確定後のみ行います。`
        : "すべての提案に対応しました。";
  }
  if (reviewEmpty) reviewEmpty.hidden = state.suggestions.length > 0;

  state.suggestions.forEach((s) => {
    reviewList.appendChild(createSuggestionCard(s));
  });
}

function createSuggestionCard(s) {
  const li = document.createElement("li");
  li.className = "ai-suggest-card";
  li.dataset.localId = s.localId;
  if (s.status !== "pending") li.classList.add("is-done");

  const badge = document.createElement("span");
  badge.className = "ai-suggest-card__kind";
  badge.textContent = KIND_LABELS[s.kind] || s.kind;

  const summary = document.createElement("p");
  summary.className = "ai-suggest-card__summary";
  summary.textContent = s.summary;

  li.append(badge, summary);

  if (s.status === "pending") {
    const form = document.createElement("div");
    form.className = "ai-suggest-card__form";
    form.appendChild(buildInlineFields(s));
    li.appendChild(form);

    const actions = document.createElement("div");
    actions.className = "ai-suggest-card__actions";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn btn--small btn--primary";
    confirmBtn.textContent = "確定する";
    confirmBtn.disabled = Boolean(s.applying);
    confirmBtn.addEventListener("click", () => handleConfirmClick(s.localId, confirmBtn));

    const ignoreBtn = document.createElement("button");
    ignoreBtn.type = "button";
    ignoreBtn.className = "btn btn--small btn--outline";
    ignoreBtn.textContent = "無視する";
    ignoreBtn.disabled = Boolean(s.applying);
    ignoreBtn.addEventListener("click", () => markIgnored(s.localId));

    actions.append(confirmBtn, ignoreBtn);
    li.appendChild(actions);
  } else {
    const done = document.createElement("span");
    done.className = "ai-suggest-card__status";
    done.textContent = s.status === "done" ? "確定済み（登録済）" : "無視済み（未登録）";
    li.appendChild(done);
  }

  return li;
}

/**
 * 提案カード内でその場編集できるフィールドを組み立てる。
 * 入力値は s.data に直接反映する（確定時にこれを登録）。
 */
function buildInlineFields(s) {
  const wrap = document.createElement("div");
  wrap.className = "ai-suggest-inline";
  const d = s.data;

  if (s.kind === "exam") {
    wrap.appendChild(buildExamItemField(s, d));
    wrap.appendChild(buildInlineDateField(s.localId, "dueDate", "目安日", d));
    wrap.appendChild(
      fieldText("メモ（任意）", d.note || "", (v) => {
        d.note = v;
      })
    );
    return wrap;
  }

  if (s.kind === "medication") {
    const hint = document.createElement("p");
    hint.className = "field__note";
    hint.textContent =
      "薬剤名の検出のみです。増量・減量などの記録は、確定後に薬剤情報タブで手動操作してください。";
    wrap.appendChild(hint);
    wrap.appendChild(
      fieldText("薬剤名", d.name || "", (v) => {
        d.name = v;
        s.summary = v
          ? `${v}について、薬剤情報タブで記録しますか？`
          : "薬剤情報タブで記録しますか？";
      })
    );
    return wrap;
  }

  if (s.kind === "procedure") {
    wrap.appendChild(
      fieldDateSimple("実施日", d.date || state.recordDate || todayStr(), (v) => {
        d.date = v;
      })
    );
    wrap.appendChild(
      fieldText("処置内容", d.content || "", (v) => {
        d.content = v;
      })
    );
    return wrap;
  }

  if (s.kind === "history") {
    wrap.appendChild(
      fieldText("タイトル", d.title || "", (v) => {
        d.title = v;
      })
    );
    wrap.appendChild(
      fieldSelect(
        "区分",
        [
          { id: "disease", label: "疾病" },
          { id: "surgery", label: "手術" },
          { id: "referral", label: "紹介" },
        ],
        d.type || "disease",
        (v) => {
          d.type = v;
        }
      )
    );
    wrap.appendChild(
      fieldSelect(
        "状態",
        [
          { id: "active", label: "進行中" },
          { id: "resolved", label: "終了" },
        ],
        d.status || "active",
        (v) => {
          d.status = v;
        }
      )
    );
    wrap.appendChild(
      fieldText("メモ（任意）", d.noteText || "", (v) => {
        d.noteText = v;
      })
    );
    return wrap;
  }

  if (s.kind === "followup_date") {
    const purposeLabel =
      d.purpose === "med_expiry" ? "処方切れ目安日" : "次回予定日（検査）";
    wrap.appendChild(
      fieldText("名称", d.relatedName || d.label || "", (v) => {
        d.relatedName = v;
      })
    );
    wrap.appendChild(buildInlineDateField(s.localId, "suggestedDate", purposeLabel, d));
    return wrap;
  }

  return wrap;
}

function fieldText(label, value, onInput) {
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

/**
 * 検査項目: マスタに近そうな候補があればボタンで選べるようにする。
 * 「検出どおりの文言」も必ず選択肢に残す。
 */
function buildExamItemField(s, d) {
  const detected = String(d.detectedItem || d.item || "").trim();
  d.detectedItem = detected;
  if (!d.item) d.item = detected;

  const masterItems = state.examMasterItems || [];
  const candidates = findExamItemCandidates(detected, masterItems);
  const masterExact = masterItems.some(
    (item) => item && item.kind !== "group" && String(item.label || "").trim() === detected
  );
  const nearby = candidates.filter((c) => c.label !== detected);

  // 完全一致のみ／候補なし → 従来どおり手入力
  if (!detected || (masterExact && nearby.length === 0) || nearby.length === 0) {
    return fieldText("検査項目", d.item || "", (v) => {
      d.item = v;
    });
  }

  const wrap = document.createElement("div");
  wrap.className = "field";
  const lab = document.createElement("span");
  lab.className = "label";
  lab.textContent = "検査項目";

  const note = document.createElement("p");
  note.className = "field__note";
  note.textContent = `AI検出「${detected}」に近いマスタ項目があります。登録に使う名称を選んでください。`;

  const DETECTED_ID = "__detected__";
  const options = [
    ...nearby.map((c) => ({ id: c.label, label: c.label })),
    { id: DETECTED_ID, label: `検出どおり「${detected}」で登録` },
  ];

  // 既にマスタ名を選んでいればそれを、なければ検出文言を初期選択
  const current = String(d.item || "").trim();
  const selectedId = nearby.some((c) => c.label === current)
    ? current
    : current === detected || !current
      ? DETECTED_ID
      : nearby[0]?.label || DETECTED_ID;

  if (selectedId === DETECTED_ID) {
    d.item = detected;
  } else {
    d.item = selectedId;
  }

  const row = document.createElement("div");
  row.className = "exam-item-buttons ai-suggest-exam-candidates";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.textContent = opt.label;
    btn.classList.toggle("is-selected", selectedId === opt.id);
    btn.addEventListener("click", () => {
      d.item = opt.id === DETECTED_ID ? detected : opt.id;
      row.querySelectorAll(".exam-item-btn").forEach((b) => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      if (customInput) {
        customInput.value = d.item;
      }
    });
    row.appendChild(btn);
  });

  const customLab = document.createElement("label");
  customLab.className = "label label--sub";
  customLab.textContent = "手入力で上書き（任意）";
  const customInput = document.createElement("input");
  customInput.className = "input";
  customInput.type = "text";
  customInput.value = d.item || "";
  customInput.placeholder = "例）ACTH通常";
  customInput.addEventListener("input", () => {
    d.item = customInput.value;
    row.querySelectorAll(".exam-item-btn").forEach((b) => b.classList.remove("is-selected"));
  });

  wrap.append(lab, note, row, customLab, customInput);
  return wrap;
}

function fieldDateSimple(label, value, onInput) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const lab = document.createElement("label");
  lab.className = "label";
  lab.textContent = label;
  const input = document.createElement("input");
  input.className = "input input--date";
  input.type = "date";
  input.value = value || "";
  input.addEventListener("change", () => onInput(input.value));
  wrap.append(lab, input);
  return wrap;
}

function fieldSelect(label, options, selected, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const lab = document.createElement("span");
  lab.className = "label";
  lab.textContent = label;
  const row = document.createElement("div");
  row.className = "exam-item-buttons";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.textContent = opt.label;
    btn.classList.toggle("is-selected", selected === opt.id);
    btn.addEventListener("click", () => {
      onSelect(opt.id);
      row.querySelectorAll(".exam-item-btn").forEach((b) => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
    });
    row.appendChild(btn);
  });
  wrap.append(lab, row);
  return wrap;
}

function buildInlineDateField(localId, key, label, dataObj) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const lab = document.createElement("label");
  lab.className = "label";
  lab.textContent = label;

  const dateInput = document.createElement("input");
  dateInput.className = "input input--date";
  dateInput.type = "date";
  dateInput.value = dataObj[key] || "";

  if (!state.dueRelativeById[localId]) {
    state.dueRelativeById[localId] = { unit: "day", buffer: "", value: 0 };
  }
  const rel = state.dueRelativeById[localId];

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
    btn.classList.toggle("is-selected", rel.unit === u);
    btn.addEventListener("click", () => {
      rel.unit = u;
      unitRow.querySelectorAll(".interval-unit-btn").forEach((b) => {
        b.classList.toggle("is-selected", b.dataset.unit === u);
      });
      applyRelativeToData(rel, dateInput, dataObj, key, display);
    });
    unitRow.appendChild(btn);
  });

  const display = document.createElement("p");
  display.className = "interval-value-display";
  display.textContent = relativeLabel(rel.unit, rel.buffer || String(rel.value || 0));

  const numpad = document.createElement("div");
  numpad.className = "numpad";
  mountNumpad(numpad, {
    onDigit: (d) => {
      if (rel.buffer.length >= 4) return;
      rel.buffer = rel.buffer === "0" ? d : rel.buffer + d;
      display.textContent = relativeLabel(rel.unit, rel.buffer);
    },
    onDelete: () => {
      rel.buffer = rel.buffer.slice(0, -1);
      display.textContent = relativeLabel(rel.unit, rel.buffer || "0");
    },
    onConfirm: () => {
      const n = Number(rel.buffer);
      if (!n || n < 1) {
        deps.showError(reviewError, "1以上の相対日数を入力し、確定してください。");
        return;
      }
      rel.value = n;
      deps.showError(reviewError, "");
      applyRelativeToData(rel, dateInput, dataObj, key, display);
    },
  });

  dateInput.addEventListener("change", () => {
    dataObj[key] = dateInput.value;
    syncRelativeFromDate(dateInput.value, rel, display, unitRow);
  });

  if (dataObj[key]) syncRelativeFromDate(dataObj[key], rel, display, unitRow);

  wrap.append(lab, dateInput, sub, unitRow, display, numpad);
  return wrap;
}

function relativeLabel(unit, value) {
  const n = value === "" ? 0 : Number(value) || 0;
  if (unit === "week") return `${n}週後`;
  if (unit === "month") return `${n}ヶ月後`;
  return `${n}日後`;
}

function applyRelativeToData(rel, dateInput, dataObj, key, display) {
  const n = Number(rel.buffer || rel.value) || 0;
  if (n < 1) return;
  const days = unitToDays(rel.unit, n);
  const date = addDays(todayStr(), days);
  dateInput.value = date;
  dataObj[key] = date;
  display.textContent = relativeLabel(rel.unit, String(n));
}

function syncRelativeFromDate(dateStr, rel, display, unitRow) {
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
  rel.unit = unit;
  rel.value = value;
  rel.buffer = String(value);
  display.textContent = relativeLabel(unit, String(value));
  unitRow?.querySelectorAll(".interval-unit-btn").forEach((b) => {
    b.classList.toggle("is-selected", b.dataset.unit === unit);
  });
}

function markIgnored(localId) {
  const s = state.suggestions.find((x) => x.localId === localId);
  if (!s || s.status !== "pending" || s.applying) return;
  s.status = "ignored";
  renderReviewList();
  maybeFinishReview();
}

/**
 * 「確定する」——ここで初めて DB へ登録する。
 */
async function handleConfirmClick(localId, confirmBtn) {
  const s = state.suggestions.find((x) => x.localId === localId);
  if (!s || s.status !== "pending" || s.applying) return;

  const data = s.data || {};
  if (s.kind === "exam" && (!String(data.item || "").trim() || !data.dueDate)) {
    deps.showError(reviewError, "検査項目と目安日を入力してから確定してください。");
    return;
  }
  if (s.kind === "medication" && !String(data.name || "").trim()) {
    deps.showError(reviewError, "薬剤名を入力してから確定してください。");
    return;
  }
  if (s.kind === "procedure" && !String(data.content || "").trim()) {
    deps.showError(reviewError, "処置内容を入力してから確定してください。");
    return;
  }
  if (s.kind === "history" && !String(data.title || "").trim()) {
    deps.showError(reviewError, "タイトルを入力してから確定してください。");
    return;
  }
  if (s.kind === "followup_date" && !data.suggestedDate) {
    deps.showError(reviewError, "日付を入力してから確定してください。");
    return;
  }

  deps.showError(reviewError, "");
  s.applying = true;
  if (confirmBtn) {
    deps.setBusy(confirmBtn, true, "登録中...", "確定する");
  }

  try {
    await applySuggestion(s, data);
    s.status = "done";
    s.applying = false;
    deps.showToast(confirmToastMessage(s));
    renderReviewList();
    maybeFinishReview();
  } catch (err) {
    console.error(err);
    s.applying = false;
    deps.showError(reviewError, err.message || "登録に失敗しました。");
    renderReviewList();
  }
}

function confirmToastMessage(s) {
  if (s.kind === "medication") {
    return s._medCreated
      ? `${s.data.name} を薬剤情報に追加しました。`
      : `${s.data.name} は登録済みです。薬剤情報タブを開きます。`;
  }
  return `${KIND_LABELS[s.kind] || "提案"}を登録しました。`;
}

function maybeFinishReview() {
  if (pendingCount() > 0) return;
  closeReviewModal();
  setBlocking(false);
  deps.showToast("AI提案の確認が完了しました。");
}

// --- 登録処理（確定時のみ） -----------------------------------------------

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
      item: String(data.item || "").trim(),
      dueDate: data.dueDate,
      note: String(data.note || "").trim(),
      source: "ai",
    });
    switchRightTab("exam");
    return;
  }

  if (suggestion.kind === "medication") {
    const result = await ensureMedicationNameFromExternal(karte, {
      name: String(data.name || "").trim(),
      changedBy: author,
      eventDate: recordDate,
    });
    suggestion._medCreated = result.created;
    switchRightTab("meds");
    // subscribe 反映後に展開
    setTimeout(() => focusMedicationByName(result.name), 300);
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
      await ensureMedicationNameFromExternal(karte, {
        name,
        changedBy: author,
        eventDate: recordDate,
      });
      const again = await fetchMedicationsOnce(karte);
      const created = again.find((d) => d.name === name);
      if (created) await updateMedication(karte, created.id, { expiryEstimate: date });
    } else {
      await updateMedication(karte, drug.id, { expiryEstimate: date });
    }
    switchRightTab("meds");
    return;
  }

  await addExamPlanFromExternal(karte, {
    item: name,
    dueDate: date,
    note: "",
    baselineDate: recordDate || todayStr(),
    source: "ai",
  });
  switchRightTab("exam");
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

/** テスト用 */
export function __testNormalizeSuggestions(parsed) {
  return normalizeSuggestions(parsed);
}
