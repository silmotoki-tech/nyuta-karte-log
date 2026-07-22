// 検査項目名の表記ゆれマッチング（AI提案の候補提示用）
//
// 照合対象:
// - 血液タブの独立項目（CBC 等）
// - 血液タブの大項目の内訳（肝臓→ALT、ホルモン→ACTH通常 等）※必須
// - 画像・病理・その他の独立項目
// 大項目（group / 子を持つ行）自体は候補に出さない。

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

function buildParentIdSet(items) {
  const set = new Set();
  for (const item of items || []) {
    const pid = String(item?.parentId || "").trim();
    if (pid) set.add(pid);
  }
  return set;
}

function findParentLabel(items, parentId) {
  if (!parentId) return "";
  const parent = (items || []).find((i) => String(i?.id || "").trim() === parentId);
  return parent ? String(parent.label || "").trim() : "";
}

/**
 * AI照合・候補提示の対象項目を集める。
 * parentId を持つ内訳は必ず含める。大項目だけ除外する。
 */
export function listExamMatchTargets(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const parentIds = buildParentIdSet(list);
  const targets = [];

  for (const item of list) {
    const label = String(item.label || "").trim();
    if (!label) continue;

    const id = String(item.id || "").trim();
    const kind = String(item.kind || "").trim();
    const parentId = String(item.parentId || "").trim();

    // 大項目は候補にしない
    if (kind === "group") continue;
    // kind 欠落でも「子を持つ行」は大項目扱い
    if (id && parentIds.has(id)) continue;

    targets.push({
      item,
      id,
      label,
      parentId,
      parentLabel: findParentLabel(list, parentId),
      nested: Boolean(parentId),
      category: item.category || "",
    });
  }

  return targets;
}

/** @deprecated listExamMatchTargets を使う。互換のため残す。 */
export function listExamLeafItems(items) {
  return listExamMatchTargets(items).map((t) => ({
    ...(t.item || {}),
    id: t.id,
    label: t.label,
    parentId: t.parentId,
    kind: "leaf",
    category: t.category,
  }));
}

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
 * 検査項目マスタから、query に近そうな選択可能項目をスコア順で返す。
 * 内訳（parentId 付き）も独立項目も同じ土台で照合する。
 * @returns {{ label: string, displayLabel: string, score: number, nested: boolean, parentLabel: string, item: object }[]}
 */
export function findExamItemCandidates(query, items, { minScore = 48, limit = 8 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];

  const targets = listExamMatchTargets(items);

  const scored = targets.map((t) => {
    const score = scoreExamLabelMatch(q, t.label);
    const displayLabel = t.parentLabel ? `${t.label}（${t.parentLabel}）` : t.label;
    return {
      item: t.item,
      label: t.label,
      displayLabel,
      parentLabel: t.parentLabel,
      nested: t.nested,
      score,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // 内訳を同点なら先に（階層由来でも確実に候補へ）
    if (a.nested !== b.nested) return a.nested ? -1 : 1;
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
