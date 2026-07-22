// 検査項目名の表記ゆれマッチング（AI提案の候補提示用）

/**
 * 比較用に正規化する（空白・括弧・中黒を除き、英数字は小文字）。
 */
export function normalizeExamLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（）()【】\[\]「」『』・･\-＿_]/g, "");
}

/**
 * 英数字トークンを抽出する（例: ACTH刺激試験 → ["acth"]）。
 */
export function extractExamTokens(value) {
  const raw = String(value || "");
  const tokens = [];
  for (const m of raw.matchAll(/[A-Za-z][A-Za-z0-9]{1,}|[0-9]+/g)) {
    tokens.push(m[0].toLowerCase());
  }
  return tokens;
}

function longestCommonSubstring(a, b) {
  if (!a || !b) return "";
  const m = a.length;
  const n = b.length;
  let best = "";
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > best.length) {
          best = a.slice(i - dp[i][j], i);
        }
      }
    }
  }
  return best;
}

/**
 * query と候補ラベルの類似スコア（0〜100）。
 */
export function scoreExamLabelMatch(query, candidate) {
  const q = normalizeExamLabel(query);
  const c = normalizeExamLabel(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;

  let score = 0;
  if (q.includes(c) || c.includes(q)) {
    const ratio = Math.min(q.length, c.length) / Math.max(q.length, c.length);
    score = Math.max(score, Math.round(70 + 25 * ratio));
  }

  const qTokens = extractExamTokens(query);
  const cTokens = extractExamTokens(candidate);
  for (const qt of qTokens) {
    for (const ct of cTokens) {
      if (qt.length < 3 || ct.length < 3) continue;
      if (qt === ct || qt.includes(ct) || ct.includes(qt)) {
        score = Math.max(score, 55 + Math.min(qt.length, ct.length) * 3);
      }
    }
  }

  const lcs = longestCommonSubstring(q, c);
  if (lcs.length >= 3) {
    const ratio = lcs.length / Math.max(q.length, c.length);
    score = Math.max(score, Math.round(40 + 50 * ratio));
  }

  return Math.min(100, score);
}

/**
 * 検査項目マスタから、query に近そうな leaf 項目をスコア順で返す。
 * @returns {{ label: string, score: number, item: object }[]}
 */
export function findExamItemCandidates(query, items, { minScore = 50, limit = 8 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];

  const leaves = (items || []).filter(
    (item) => item && item.kind !== "group" && String(item.label || "").trim()
  );

  const scored = leaves.map((item) => {
    const label = String(item.label || "").trim();
    return {
      item,
      label,
      score: scoreExamLabelMatch(q, label),
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label, "ja");
  });

  const seen = new Set();
  const out = [];
  for (const row of scored) {
    if (row.score < minScore) continue;
    if (seen.has(row.label)) continue;
    seen.add(row.label);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}
