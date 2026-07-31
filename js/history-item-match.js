// 既往歴マスタの検索候補（疾患・手術の葉／紹介先）

import { formatMasterItemDisplayLabel } from "./exam-item-match.js";

function normalizeKind(kind) {
  return String(kind || "").trim() === "group" ? "group" : "leaf";
}

function findLabel(items, id) {
  if (!id) return "";
  const hit = (items || []).find((i) => String(i?.id || "").trim() === id);
  return hit ? String(hit.label || "").trim() : "";
}

/**
 * 疾患・手術の小分類（葉）を検索対象にする。パスは 大分類 > 中分類。
 */
export function listHistoryTreeMatchTargets(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const targets = [];
  for (const item of list) {
    if (normalizeKind(item.kind) !== "leaf") continue;
    const midId = String(item.parentId || "").trim();
    const mid = list.find((i) => i.id === midId);
    const topId = mid ? String(mid.parentId || "").trim() : "";
    const topLabel = findLabel(list, topId);
    const midLabel = mid ? String(mid.label || "").trim() : "";
    const path = [topLabel, midLabel].filter(Boolean).join(" > ");
    targets.push({
      id: item.id,
      label: item.label || "",
      path,
      displayLabel: formatMasterItemDisplayLabel(item.label || "", path),
    });
  }
  return targets;
}

export function filterHistoryTreeLeavesByQuery(items, query) {
  const q = String(query || "").trim().toLowerCase();
  const targets = listHistoryTreeMatchTargets(items);
  if (!q) return targets;
  return targets.filter((t) => {
    const hay = `${t.label} ${t.path}`.toLowerCase();
    return hay.includes(q);
  });
}

export function filterHistoryReferralByQuery(items, query) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const q = String(query || "").trim().toLowerCase();
  const mapped = list.map((item) => ({
    id: item.id,
    label: item.label || "",
    displayLabel: item.label || "",
  }));
  if (!q) return mapped;
  return mapped.filter((t) => (t.label || "").toLowerCase().includes(q));
}
