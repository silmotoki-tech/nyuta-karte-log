// 検査項目名の表記ゆれマッチング（AI提案の候補提示用）
//
// 方針:
// - レーベンシュタイン距離（編集距離）による類似度を主軸にする
// - 英数字トークン同士の編集距離で「ACDH」↔「ACTH」のような1文字違いを拾う
// - 臨床表現の類義語ブーストは補助
//
// 照合対象:
// - 血液の独立項目・大項目の内訳、画像・病理・その他の独立項目
// - 大項目（group）自体は候補に出さない

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
 * 英数字トークンを抽出する（例: ACTH刺激試験 → ["acth"]、ACDH → ["acdh"]）。
 */
export function extractExamTokens(value) {
  const raw = String(value || "");
  const tokens = [];
  for (const m of raw.matchAll(/[A-Za-z][A-Za-z0-9]*|[0-9]+/g)) {
    tokens.push(m[0].toLowerCase());
  }
  return tokens;
}

/**
 * レーベンシュタイン距離（編集距離）。
 */
export function levenshteinDistance(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const rows = s.length + 1;
  const cols = t.length + 1;
  const prev = new Array(cols);
  const curr = new Array(cols);
  for (let j = 0; j < cols; j += 1) prev[j] = j;

  for (let i = 1; i < rows; i += 1) {
    curr[0] = i;
    const sChar = s.charCodeAt(i - 1);
    for (let j = 1; j < cols; j += 1) {
      const cost = sChar === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j];
  }
  return prev[cols - 1];
}

/**
 * 編集距離ベースの類似度（0〜1）。1が完全一致。
 */
export function levenshteinSimilarity(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (!s && !t) return 1;
  if (!s || !t) return 0;
  const dist = levenshteinDistance(s, t);
  const maxLen = Math.max(s.length, t.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
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

    if (kind === "group") continue;
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

/**
 * 臨床表現 → マスタ正式名の補助ブースト（意味的な近さ）。
 */
const EXAM_QUERY_SYNONYMS = [
  { test: /acth|acdh|athc|atch/i, labels: ["ACTH通常", "ACTH松木式"] },
  { test: /コレステロール|総コレ|t-?cho/i, labels: ["T-Cho"] },
  { test: /中性脂肪|トリグリセリド|(^|[^a-z])tg([^a-z]|$)/i, labels: ["TG"] },
  { test: /ビリルビン|t-?bil/i, labels: ["総ビリルビン"] },
  { test: /電解質|ナトリウム|カリウム|クロール/i, labels: ["電解質"] },
  { test: /腎パネル/i, labels: ["腎パネル(IDEXX)"] },
  { test: /血糖|グルコース/i, labels: ["血糖(アントセンス)", "血糖(ドライケム)"] },
  { test: /アントセンス/i, labels: ["血糖(アントセンス)"] },
  { test: /ドライケム/i, labels: ["血糖(ドライケム)"] },
  { test: /甲状腺|サイロイド/i, labels: ["T4", "fT4"] },
  { test: /(^|[^a-z0-9])t4([^a-z0-9]|$)/i, labels: ["T4"] },
  { test: /ft4|フリーt4|遊離t4/i, labels: ["fT4"] },
  { test: /(^|[^a-z])alt([^a-z]|$)|gpt/i, labels: ["ALT"] },
  { test: /(^|[^a-z])ast([^a-z]|$)|got/i, labels: ["AST"] },
  { test: /(^|[^a-z])alp([^a-z]|$)/i, labels: ["ALP"] },
  { test: /(^|[^a-z])ggt([^a-z]|$)|γ-?gt|ガンマgt/i, labels: ["GGT"] },
  { test: /(^|[^a-z])bun([^a-z]|$)/i, labels: ["BUN"] },
  { test: /(^|[^a-z])cre(a)?([^a-z]|$)|クレアチニン/i, labels: ["Cre"] },
  { test: /cbc|血算|全血球/i, labels: ["CBC"] },
  { test: /(^|[^a-z])crp([^a-z]|$)/i, labels: ["CRP"] },
  { test: /(^|[^a-z])saa([^a-z]|$)/i, labels: ["SAA"] },
  { test: /tba/i, labels: ["TBA(pre・post)", "TBA(post)"] },
  { test: /upc/i, labels: ["尿検査(UPC)", "尿検査(UPCなし)", "UPC(外注)"] },
  { test: /尿検査|尿沈渣|検尿/i, labels: ["尿検査(UPCなし)", "尿検査(UPC)", "UPC(外注)"] },
  { test: /便検査|糞便|検便/i, labels: ["便検査"] },
  { test: /下痢パネル|下痢/i, labels: ["下痢パネル", "便検査"] },
  { test: /健診セット|健康診断|ドック/i, labels: ["健診セット(FUJIFILM)", "健診セット(IDEXX)"] },
  { test: /肝機能|肝臓|肝酵素|肝数値/i, parentLabels: ["肝臓"] },
  { test: /腎機能|腎臓|腎数値/i, parentLabels: ["腎臓"] },
  { test: /脂質|脂血/i, parentLabels: ["脂質"] },
  { test: /ホルモン|内分泌/i, parentLabels: ["ホルモン"] },
  {
    test: /血液検査|血検|採血して|採血を|血液を検査/,
    labels: ["CBC", "血糖(アントセンス)", "血糖(ドライケム)", "健診セット(FUJIFILM)", "健診セット(IDEXX)", "CRP", "SAA"],
  },
  {
    test: /レントゲン|x線|エックス線|\bxp\b|放射線撮影|単純撮影/,
    parentLabels: ["レントゲン"],
    labels: ["胸部set", "腹部set", "全set"],
  },
  { test: /胸部スク|胸部セット|胸部set|胸スク|胸写/, labels: ["胸部set"] },
  { test: /腹部スク|腹部セット|腹部set|腹スク|腹写/, labels: ["腹部set"] },
  { test: /全スク|全set|全身スク/, labels: ["全set"] },
  {
    test: /レントゲン\s*[（(]?胸部[）)]?|胸部X線|胸部ｘ線|胸部x線|胸XP/,
    labels: ["レントゲン(胸部)"],
  },
  {
    test: /レントゲン\s*[（(]?気管[）)]?/,
    labels: ["レントゲン(気管)"],
  },
  {
    test: /レントゲン\s*[（(]?腹部[）)]?|腹部X線/,
    labels: ["レントゲン(腹部)"],
  },
  {
    test: /レントゲン\s*[（(]?股関節[）)]?/,
    labels: ["レントゲン(股関節)"],
  },
  {
    test: /レントゲン\s*[（(]?肩[）)]?/,
    labels: ["レントゲン(肩)"],
  },
  {
    test: /レントゲン\s*[（(]?前肢[）)]?/,
    labels: ["レントゲン(前肢)"],
  },
  {
    test: /レントゲン\s*[（(]?後肢[）)]?/,
    labels: ["レントゲン(後肢)"],
  },
  {
    test: /レントゲン\s*[（(]?鼻[）)]?/,
    labels: ["レントゲン(鼻)"],
  },
  {
    test: /レントゲン\s*[（(]?歯[）)]?|歯科レントゲン/,
    labels: ["レントゲン(歯)"],
  },
  {
    test: /心エコー\s*[（(]?スクリーニング[）)]?|心エコースク/,
    labels: ["心エコー(スクリーニング)"],
  },
  {
    test: /心エコー\s*[（(]?流速|流速あり/,
    labels: ["心エコー(流速あり)"],
  },
  {
    test: /心エコー\s*[（(]?拡大|拡大チェック/,
    labels: ["心エコー(拡大チェック)"],
  },
  {
    test: /腹部エコー\s*[（(]?スクリーニング[）)]?|腹エコースク/,
    labels: ["腹部エコー(スクリーニング)"],
  },
  {
    test: /腹部エコー\s*[（(]?脾臓[）)]?|腹エコー.*脾/,
    labels: ["腹部エコー(脾臓)"],
  },
  {
    test: /腹部エコー\s*[（(]?肝臓[）)]?|腹エコー.*肝臓/,
    labels: ["腹部エコー(肝臓)"],
  },
  {
    test: /腹部エコー\s*[（(]?腎臓[）)]?|腹エコー.*腎/,
    labels: ["腹部エコー(腎臓)"],
  },
  {
    test: /腹部エコー\s*[（(]?尿管[）)]?|腹エコー.*尿管/,
    labels: ["腹部エコー(尿管)"],
  },
  {
    test: /腹部エコー\s*[（(]?膀胱[）)]?|腹エコー.*膀胱/,
    labels: ["腹部エコー(膀胱)"],
  },
  {
    test: /腹部エコー\s*[（(]?前立腺[）)]?|腹エコー.*前立腺/,
    labels: ["腹部エコー(前立腺)"],
  },
  {
    test: /エコー|超音波/,
    parentLabels: ["エコー"],
  },
  { test: /心エコー|心臓エコー|心臓超音波/, parentLabels: ["エコー"], labels: ["心エコー(スクリーニング)", "心エコー(流速あり)", "心エコー(拡大チェック)"] },
  { test: /腹部エコー|お腹のエコー|腹エコー/, parentLabels: ["エコー"], labels: ["腹部エコー(スクリーニング)", "腹部エコー(脾臓)", "腹部エコー(肝臓)", "腹部エコー(腎臓)", "腹部エコー(尿管)", "腹部エコー(膀胱)", "腹部エコー(前立腺)"] },
  {
    test: /病理検査|病理に|病理へ|病理提出|組織診|生検|バイオプシー/,
    labels: ["組織検査", "細胞診(院内)", "細胞診(外注)"],
  },
  { test: /細胞診/, labels: ["細胞診(院内)", "細胞診(外注)"] },
  { test: /組織検査|組織病理/, labels: ["組織検査"] },
  { test: /細菌培養|細菌の培養/, labels: ["細菌培養(院内)", "細菌培養(外注)"] },
  { test: /真菌培養|皮膚糸状菌|カビ培養/, labels: ["真菌培養(院内)", "真菌培養(外注)"] },
];

function synonymBoost(query, target) {
  const q = String(query || "");
  const label = String(target.label || "");
  const parentLabel = String(target.parentLabel || "");
  let boost = 0;
  for (const rule of EXAM_QUERY_SYNONYMS) {
    if (!rule.test.test(q)) continue;
    if (rule.labels?.includes(label)) boost = Math.max(boost, 78);
    if (rule.parentLabels?.includes(parentLabel)) boost = Math.max(boost, 62);
  }
  return boost;
}

/**
 * 英数字トークン同士の最大類似度（編集距離）。
 * 例: ACDH ↔ ACTH → 0.75
 */
function bestTokenSimilarity(query, candidate) {
  const qTokens = extractExamTokens(query).filter((t) => t.length >= 3);
  const cTokens = extractExamTokens(candidate).filter((t) => t.length >= 2);
  if (!qTokens.length || !cTokens.length) return 0;

  let best = 0;
  for (const qt of qTokens) {
    for (const ct of cTokens) {
      // 長さが大きく違うと誤爆しやすいので制限
      if (Math.abs(qt.length - ct.length) > 2) continue;
      const sim = levenshteinSimilarity(qt, ct);
      if (sim > best) best = sim;
    }
  }
  return best;
}

/**
 * 候補ラベル先頭の英数字塊（ACTH通常 → acth）との類似度。
 */
function leadingCodeSimilarity(query, candidate) {
  const qTokens = extractExamTokens(query).filter((t) => t.length >= 3);
  const lead = normalizeExamLabel(candidate).match(/^[a-z0-9]+/);
  if (!qTokens.length || !lead) return 0;
  const code = lead[0];
  let best = 0;
  for (const qt of qTokens) {
    if (Math.abs(qt.length - code.length) > 2) continue;
    best = Math.max(best, levenshteinSimilarity(qt, code));
  }
  return best;
}

/**
 * query と候補ラベルの類似スコア（0〜100）。
 * 編集距離を主軸に、部分一致・類義語を補助する。
 */
export function scoreExamLabelMatch(query, candidate, targetMeta = null) {
  const q = normalizeExamLabel(query);
  const c = normalizeExamLabel(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;

  let score = 0;

  // 部分一致
  if (q.includes(c) || c.includes(q)) {
    const ratio = Math.min(q.length, c.length) / Math.max(q.length, c.length);
    score = Math.max(score, Math.round(70 + 25 * ratio));
  }

  // 全体の編集距離類似度
  const fullSim = levenshteinSimilarity(q, c);
  if (fullSim >= 0.55) {
    score = Math.max(score, Math.round(35 + 65 * fullSim));
  }

  // トークン編集距離（ACDH↔ACTH の本命）
  const tokenSim = bestTokenSimilarity(query, candidate);
  if (tokenSim >= 0.6) {
    // 0.75 → 約 88、0.67 → 約 80、1.0 → 100
    score = Math.max(score, Math.round(40 + 60 * tokenSim));
  }

  // 先頭コードとの編集距離
  const leadSim = leadingCodeSimilarity(query, candidate);
  if (leadSim >= 0.6) {
    score = Math.max(score, Math.round(42 + 56 * leadSim));
  }

  // 親大項目名が本文にあれば底上げ
  if (targetMeta?.parentLabel) {
    const parentNorm = normalizeExamLabel(targetMeta.parentLabel);
    if (parentNorm.length >= 2 && q.includes(parentNorm)) {
      score = Math.max(score, 58);
    }
  }

  score = Math.max(score, synonymBoost(query, targetMeta || { label: candidate }));
  return Math.min(100, score);
}

/**
 * 検査項目マスタから、query に近そうな選択可能項目をスコア順で返す。
 */
export function findExamItemCandidates(query, items, { minScore = 48, limit = 8 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];

  const targets = listExamMatchTargets(items);

  const scored = targets.map((t) => {
    const score = scoreExamLabelMatch(q, t.label, t);
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
