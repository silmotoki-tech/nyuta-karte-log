// Anthropic Messages API をブラウザから直接呼び出す。
// キーは localStorage（api-key.js）から取得する。コードには埋め込まない。

import { getApiKey, hasApiKey } from "./api-key.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

export class ApiKeyMissingError extends Error {
  constructor() {
    super("APIキーが未設定です。設定画面でAPIキーを設定してください。");
    this.name = "ApiKeyMissingError";
  }
}

/**
 * カルテ時系列エントリ配列から、AIへ渡すコンテキスト文字列を組み立てる。
 * 古い→新しいの時系列で並べ、本文テキストを中心に含める。
 */
export function buildChartContext(entries) {
  if (!entries || entries.length === 0) {
    return "（この患者のカルテ記録はまだありません）";
  }

  // 表示は降順だが、AIへの文脈は時系列（古い→新しい）の方が読みやすい
  const chronological = [...entries].sort((a, b) => {
    const rd = (a.recordDate || "").localeCompare(b.recordDate || "");
    if (rd !== 0) return rd;
    return (a.enteredAtIso || "").localeCompare(b.enteredAtIso || "");
  });

  return chronological
    .map((e, i) => {
      const lines = [
        `--- 記録 ${i + 1} ---`,
        `記録日: ${e.recordDate || "（不明）"}`,
        `見出し: ${e.headline || "（なし）"}`,
      ];
      if (e.author) lines.push(`記入者: ${e.author}`);
      if (e.category && e.category !== "none") {
        lines.push(`カテゴリ: ${e.category}`);
      }
      lines.push(`本文:\n${e.body || "（本文なし）"}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function buildSystemPrompt() {
  return [
    "あなたは動物病院のカルテ記録を参照する補助アシスタントです。",
    "与えられたカルテ時系列の内容だけをもとに、獣医師の質問に答えてください。",
    "カルテに書かれていないこと・推測で補えないことは断定せず、「カルテ上では確認できません」などと明記してください。",
    "わからないこと・記載がないことは断定しないでください。",
    "回答は簡潔で実務的な日本語にしてください。",
  ].join("\n");
}

function buildUserPrompt(question, chartContext) {
  return [
    "以下はこの患者のカルテ時系列データ（全文）です。",
    "",
    chartContext,
    "",
    "---",
    "",
    `質問: ${question}`,
  ].join("\n");
}

/**
 * Anthropic API に質問し、回答テキストを返す。
 */
export async function askClaude({
  question,
  chartContext,
  model = DEFAULT_MODEL,
}) {
  if (!hasApiKey()) {
    throw new ApiKeyMissingError();
  }
  const apiKey = getApiKey();
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: buildUserPrompt(question, chartContext),
        },
      ],
    }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Anthropic APIエラー (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const text = (data?.content || [])
    .filter((block) => block && block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!text) {
    throw new Error("AIからの回答が空でした。");
  }
  return text;
}

/**
 * Anthropic API に任意の system / user プロンプトで問い合わせ、回答テキストを返す。
 * 自由質問（askClaude）と同じ通信経路を使う。
 */
export async function askClaudeWithPrompt({
  system,
  user,
  model = DEFAULT_MODEL,
  maxTokens = MAX_TOKENS,
}) {
  if (!hasApiKey()) {
    throw new ApiKeyMissingError();
  }
  const apiKey = getApiKey();
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: system || "",
      messages: [{ role: "user", content: user || "" }],
    }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Anthropic APIエラー (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const text = (data?.content || [])
    .filter((block) => block && block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!text) {
    throw new Error("AIからの回答が空でした。");
  }
  return text;
}

/**
 * 回答テキストから JSON オブジェクトを取り出す（```json フェンス対応）。
 */
export function extractJsonObject(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}
