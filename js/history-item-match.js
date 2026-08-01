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
 * 疾患・手術の小分類（葉）を検索対象にする。
 * パスは 大分類 > 中分類。中項目なし（大分類直下の葉）は大分類のみ。
 */
export function listHistoryTreeMatchTargets(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const targets = [];
  for (const item of list) {
    if (normalizeKind(item.kind) !== "leaf") continue;
    const parentId = String(item.parentId || "").trim();
    const parent = list.find((i) => i.id === parentId);
    let path = "";
    if (parent && normalizeKind(parent.kind) === "group") {
      const grandId = String(parent.parentId || "").trim();
      if (!grandId) {
        // 親が大分類（中項目なし）
        path = String(parent.label || "").trim();
      } else {
        const topLabel = findLabel(list, grandId);
        const midLabel = String(parent.label || "").trim();
        path = [topLabel, midLabel].filter(Boolean).join(" > ");
      }
    }
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
