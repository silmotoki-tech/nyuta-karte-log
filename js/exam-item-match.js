// 検査項目名の表記ゆれマッチング（AI提案の候補提示用）
// 血液の大項目／内訳、画像・病理・その他の独立項目をすべて対象にする。

/**
 * 比較用に正規化する（空白・括弧・中黒を除き、英数字は小文字）。
 */
export function normalizeExamLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（）()【】\[\]「」『』・･\-＿_／/]/g, "");
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

/**
 * 選択可能な検査項目（leaf）かどうか。
 * - kind === "group" は除外
 * - 他項目の parentId になっているID（大項目）も除外（kind 欠落・誤記の保険）
 * - parentId 付きの内訳項目は対象に含める
 */
export function isExamLeafItem(item, parentIdSet) {
  if (!item) return false;
  const label = String(item.label || "").trim();
  if (!label) return false;
  const kind = String(item.kind || "").trim();
  if (kind === "group") return false;
  const id = String(item.id || "").trim();
  if (id && parentIdSet && parentIdSet.has(id)) return false;
  return true;
}

/**
 * マスタ配列から照合対象の leaf だけを取り出す（内訳・独立項目の両方）。
 */
export function listExamLeafItems(items) {
  const list = Array.isArray(items) ? items : [];
  const parentIdSet = new Set(
    list
      .map((item) => String(item?.parentId || "").trim())
      .filter(Boolean)
  );
  return list.filter((item) => isExamLeafItem(item, parentIdSet));
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
 * よくある表記ゆれ → マスタ側で優先したいラベル断片。
 * （部分一致でブーストする）
 */
const EXAM_ALIAS_BOOSTS = [
  {
    test: (q) => /acth/.test(q) && /刺激|試験|test|stim/.test(q),
    prefer: [/acth通常/, /acth松木/, /acth/],
  },
  {
    test: (q) => /upc/.test(q) && /外注|尿蛋白|尿/.test(q),
    prefer: [/upc外注/, /尿検査upc/, /upc/],
  },
  {
    test: (q) => /尿検査|尿沈渣|尿/.test(q) && !/upc外注/.test(q),
    prefer: [/尿検査/, /upc/],
  },
  {
    test: (q) => /便|糞|下痢パネル|下痢/.test(q),
    prefer: [/下痢パネル/, /便検査/],
  },
  {
    test: (q) => /胸部.*スク|胸部セット|胸スク/.test(q),
    prefer: [/胸部スク/],
  },
  {
    test: (q) => /腹部.*スク|腹部セット|腹スク/.test(q),
    prefer: [/腹部スク/],
  },
];

function aliasBoost(queryNorm, candidateNorm) {
  let boost = 0;
  for (const rule of EXAM_ALIAS_BOOSTS) {
    if (!rule.test(queryNorm)) continue;
    for (let i = 0; i < rule.prefer.length; i += 1) {
      if (rule.prefer[i].test(candidateNorm)) {
        boost = Math.max(boost, 70 - i * 5);
        break;
      }
    }
  }
  return boost;
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

  score = Math.max(score, aliasBoost(q, c));

  return Math.min(100, score);
}

/**
 * 検査項目マスタから、query に近そうな leaf 項目をスコア順で返す。
 * 大項目の内訳・独立項目・全タブを対象にする。
 * @returns {{ label: string, score: number, item: object }[]}
 */
export function findExamItemCandidates(query, items, { minScore = 48, limit = 8 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];

  const leaves = listExamLeafItems(items);

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
