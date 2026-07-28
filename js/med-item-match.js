// 薬剤マスタの名前照合（AI提案・検索候補の表示用）
//
// 表示:
// - 薬剤名（大分類 > 中項目）例: アモキシシリン（内服薬 > 抗生剤）
// - 中項目なし（注射薬・点眼など）: セファゾリン（注射薬）

import { formatMasterItemDisplayLabel } from "./exam-item-match.js";

const MED_CATEGORY_LABELS = {
  inject: "注射薬",
  oral: "内服薬",
  topical: "外用薬",
  eye: "点眼薬",
  supplement: "サプリメント・商品",
};

function medCategoryLabelFromId(category) {
  const id = String(category || "").trim();
  return MED_CATEGORY_LABELS[id] || MED_CATEGORY_LABELS.oral;
}

function normalizeMedKind(kind) {
  return String(kind || "").trim() === "group" ? "group" : "leaf";
}

function findParentLabel(items, parentId) {
  if (!parentId) return "";
  const parent = (items || []).find((i) => String(i?.id || "").trim() === parentId);
  return parent ? String(parent.label || "").trim() : "";
}

/**
 * 照合・候補提示の対象薬剤（葉）を集める。中項目（group）は除外。
 */
export function listMedicationMatchTargets(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const targets = [];

  for (const item of list) {
    const label = String(item.label || "").trim();
    if (!label) continue;
    if (normalizeMedKind(item.kind) === "group") continue;

    const parentId = String(item.parentId || "").trim();
    const category = String(item.category || "").trim() || "oral";
    targets.push({
      item,
      id: String(item.id || "").trim(),
      label,
      parentId,
      parentLabel: findParentLabel(list, parentId),
      nested: Boolean(parentId),
      category,
      categoryLabel: medCategoryLabelFromId(category),
    });
  }

  return targets;
}

function normalizeMedQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function scoreMedicationLabelMatch(query, candidate) {
  const q = normalizeMedQuery(query);
  const c = normalizeMedQuery(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;
  if (c.includes(q) || q.includes(c)) {
    const ratio = Math.min(q.length, c.length) / Math.max(q.length, c.length);
    return Math.round(70 + 25 * ratio);
  }
  if (c.startsWith(q) || q.startsWith(c)) return 80;
  return 0;
}

function toMedicationCandidateRow(t, score = 0) {
  return {
    item: t.item,
    label: t.label,
    displayLabel: formatMasterItemDisplayLabel(t.label, {
      categoryLabel: t.categoryLabel,
      parentLabel: t.parentLabel,
    }),
    parentLabel: t.parentLabel,
    categoryLabel: t.categoryLabel,
    nested: t.nested,
    score,
  };
}

/**
 * リニアピッカー用: 薬剤名の部分一致で横断検索する。
 */
export function filterMedicationLeavesByQuery(query, items, { limit = 100 } = {}) {
  const q = normalizeMedQuery(query);
  if (!q) return [];

  const matched = listMedicationMatchTargets(items)
    .filter((t) => normalizeMedQuery(t.label).includes(q))
    .map((t) =>
      toMedicationCandidateRow(t, scoreMedicationLabelMatch(query, t.label))
    );

  matched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label, "ja");
  });

  const seen = new Set();
  const out = [];
  for (const row of matched) {
    const key =
      row.item?.id || `${row.categoryLabel}::${row.parentLabel}::${row.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 薬剤マスタから query に近い葉項目をスコア順で返す。
 */
export function findMedicationItemCandidates(
  query,
  items,
  { minScore = 70, limit = 8 } = {}
) {
  const q = String(query || "").trim();
  if (!q) return [];

  const targets = listMedicationMatchTargets(items);
  const scored = targets.map((t) =>
    toMedicationCandidateRow(t, scoreMedicationLabelMatch(q, t.label))
  );

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label, "ja");
  });

  const seen = new Set();
  const out = [];
  for (const row of scored) {
    if (row.score < minScore) continue;
    const key =
      row.item?.id || `${row.categoryLabel}::${row.parentLabel}::${row.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}
