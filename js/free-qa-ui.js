// 右カラム「自由質問」タブのUIと操作ロジック。
// 中央カラムの時系列全文をコンテキストに Anthropic API へ問い合わせ、結果を Firebase に保存する。

import {
  subscribeFreeQA,
  addFreeQA,
  updateFreeQAAnswer,
  deleteFreeQA,
} from "./db.js";
import { hasApiKey } from "./api-key.js";
import {
  askClaude,
  buildChartContext,
  ApiKeyMissingError,
} from "./anthropic.js";
import { openSettings } from "./settings-ui.js";
import { enableRowGestures } from "./row-gestures.js";

let deps = {
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "",
  getTimelineEntries: () => [],
};

const state = {
  karteNumber: null,
  items: [],
  unsubscribe: null,
  asking: false,
};

const qaInput = document.getElementById("free-qa-input");
const btnAsk = document.getElementById("btn-free-qa-ask");
const qaError = document.getElementById("free-qa-error");
const qaHint = document.getElementById("free-qa-key-hint");
const qaList = document.getElementById("free-qa-list");
const qaEmpty = document.getElementById("free-qa-empty");
const btnOpenSettingsFromQa = document.getElementById("btn-free-qa-open-settings");

export function initFreeQaUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  btnAsk?.addEventListener("click", handleAsk);
  btnOpenSettingsFromQa?.addEventListener("click", () => openSettings());
  qaInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAsk();
    }
  });
  refreshKeyHint();
}

export function enterFreeQa(karteNumber) {
  leaveFreeQa();
  state.karteNumber = karteNumber;
  refreshKeyHint();
  state.unsubscribe = subscribeFreeQA(karteNumber, (items) => {
    state.items = items;
    renderQaList();
  });
}

export function leaveFreeQa() {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }
  state.karteNumber = null;
  state.items = [];
  if (qaList) qaList.innerHTML = "";
  if (qaInput) qaInput.value = "";
  deps.showError(qaError, "");
}

function refreshKeyHint() {
  const ready = hasApiKey();
  if (qaHint) qaHint.hidden = ready;
  if (btnAsk) btnAsk.disabled = false;
}

function renderQaList() {
  if (!qaList) return;
  qaList.innerHTML = "";
  const items = [...state.items].sort((a, b) =>
    (b.askedAt || "").localeCompare(a.askedAt || "")
  );
  if (qaEmpty) qaEmpty.hidden = items.length > 0;

  items.forEach((item) => {
    qaList.appendChild(createQaCard(item));
  });
}

function createQaCard(item) {
  const li = document.createElement("li");
  li.className = "qa-card";
  li.dataset.questionId = item.id;

  const qLabel = document.createElement("p");
  qLabel.className = "qa-card__label";
  qLabel.textContent = "質問";

  const qText = document.createElement("p");
  qText.className = "qa-card__question";
  qText.textContent = item.question || "";

  const meta = document.createElement("p");
  meta.className = "qa-card__meta";
  const when = formatAskedAt(item.askedAt);
  const by = item.askedBy ? `　記入: ${item.askedBy}` : "";
  meta.textContent = `${when}${by}`;

  const aLabel = document.createElement("p");
  aLabel.className = "qa-card__label";
  aLabel.textContent = "回答";

  const aText = document.createElement("p");
  aText.className = "qa-card__answer";
  aText.textContent = item.answer || "（回答なし）";

  li.append(qLabel, qText, meta, aLabel, aText);
  enableRowGestures(li, {
    actions: [
      {
        action: "refresh",
        title: "再検索",
        onClick: (e) => handleRefresh(item, e.currentTarget),
      },
      {
        action: "delete",
        title: "削除",
        onClick: async () => {
          const ok = window.confirm("この質問と回答を削除しますか？");
          if (!ok) return;
          try {
            await deleteFreeQA(state.karteNumber, item.id);
            deps.showToast("削除しました。");
          } catch (err) {
            console.error(err);
            deps.showToast("削除に失敗しました。", { isError: true });
          }
        },
      },
    ],
  });
  return li;
}

function formatAskedAt(iso) {
  if (!iso) return "日時不明";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

async function handleAsk() {
  refreshKeyHint();
  if (!hasApiKey()) {
    deps.showError(
      qaError,
      "設定画面でAPIキーを設定してください。"
    );
    return;
  }
  if (!state.karteNumber) {
    deps.showError(qaError, "カルテを開いてから質問してください。");
    return;
  }
  const question = (qaInput?.value || "").trim();
  if (!question) {
    deps.showError(qaError, "質問を入力してください。");
    return;
  }
  if (state.asking) return;

  deps.showError(qaError, "");
  state.asking = true;
  deps.setBusy(btnAsk, true, "回答生成中...", "質問する");

  try {
    const entries = deps.getTimelineEntries() || [];
    const chartContext = buildChartContext(entries);
    const answer = await askClaude({ question, chartContext });
    await addFreeQA(state.karteNumber, {
      question,
      answer,
      askedBy: deps.getSelectedAuthor() || "",
    });
    if (qaInput) qaInput.value = "";
    deps.showToast("回答を保存しました。");
  } catch (err) {
    console.error(err);
    if (err instanceof ApiKeyMissingError) {
      deps.showError(qaError, "設定画面でAPIキーを設定してください。");
      refreshKeyHint();
    } else {
      deps.showError(
        qaError,
        err?.message || "質問に失敗しました。もう一度お試しください。"
      );
    }
  } finally {
    state.asking = false;
    deps.setBusy(btnAsk, false, "回答生成中...", "質問する");
  }
}

/**
 * 再検索: 同じ質問文で最新の時系列を渡し、回答を上書き更新する。
 * （一覧が膨らまないよう、新しい質問として追記せず同一レコードを更新）
 */
async function handleRefresh(item, buttonEl) {
  refreshKeyHint();
  if (!hasApiKey()) {
    deps.showError(qaError, "設定画面でAPIキーを設定してください。");
    return;
  }
  if (state.asking) return;

  state.asking = true;
  if (buttonEl) buttonEl.disabled = true;
  deps.showError(qaError, "");

  try {
    const entries = deps.getTimelineEntries() || [];
    const chartContext = buildChartContext(entries);
    const answer = await askClaude({
      question: item.question,
      chartContext,
    });
    await updateFreeQAAnswer(state.karteNumber, item.id, {
      answer,
      askedBy: deps.getSelectedAuthor() || item.askedBy || "",
    });
    deps.showToast("最新のカルテ内容で回答を更新しました。");
  } catch (err) {
    console.error(err);
    if (err instanceof ApiKeyMissingError) {
      deps.showError(qaError, "設定画面でAPIキーを設定してください。");
      refreshKeyHint();
    } else {
      deps.showToast(err?.message || "再検索に失敗しました。", {
        isError: true,
      });
    }
  } finally {
    state.asking = false;
    if (buttonEl) buttonEl.disabled = false;
  }
}

/** 設定画面でキーが変わったときに呼ぶ。 */
export function notifyApiKeyChanged() {
  refreshKeyHint();
  if (hasApiKey() && qaError) {
    const msg = qaError.textContent || "";
    if (msg.includes("APIキー")) deps.showError(qaError, "");
  }
}
