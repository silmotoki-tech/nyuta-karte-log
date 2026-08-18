// カルテ本文からの薬剤・検査・既往歴チップ検出（あいまい照合）
//
// 完全一致（本文にマスタ名がそのまま出現）を最優先しつつ、
// - 検査: 英数字コードの編集距離（ACTH⇔ACDH等）・臨床表現の類義語辞書（血液検査→CBC等）
// - 薬剤・既往歴: 表記ゆれ向けの総当たり近似一致（軽い編集距離フォールバック）
// もあわせて拾う（exam-item-match.js の scanExamLabelInText 等を参照）。
//
// 「肝スクリーニング」から「肝スク」と「スクリーニング」が両方検出されるように、
// 完全一致どうしが本文中の同じ範囲で重なるケースは、開始位置が早く・長い方を
// 優先して1件にまとめる（あいまい一致由来のヒットは本文中の位置を持たないため対象外）。

import { listExamMatchTargets, scanExamLabelInText } from "./exam-item-match.js";
import { listMedicationMatchTargets, scanMedicationLabelInText } from "./med-item-match.js";
import { listHistoryTreeMatchTargets, scanHistoryLabelInText } from "./history-item-match.js";

export const DEFAULT_CHIP_LIMIT = 10;
const PER_KIND_RAW_LIMIT = 20;

function collectHits(body, targets, scanFn, kind) {
  const hits = [];
  for (const target of targets) {
    const result = scanFn(body, target);
    if (!result) continue;
    hits.push({
      kind,
      label: target.label,
      score: result.score,
      exact: Boolean(result.exact),
      span:
        result.exact && Number.isInteger(result.start) && result.start >= 0
          ? { start: result.start, end: result.end }
          : null,
      item: target.item || target,
    });
    if (hits.length >= PER_KIND_RAW_LIMIT * 3) break; // 暴走防止の安全弁
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, PER_KIND_RAW_LIMIT);
}

/**
 * 完全一致どうしが本文中で重なる場合、開始位置が早く・長い方を残して
 * それ以外を捨てる（貪欲法。いわゆる最長一致優先のトークナイズと同じ考え方）。
 * あいまい一致（span なし）は重なりを判定できないためそのまま残す。
 */
function resolveOverlaps(hits) {
  const positional = hits.filter((h) => h.span);
  const rest = hits.filter((h) => !h.span);

  positional.sort((a, b) => {
    if (a.span.start !== b.span.start) return a.span.start - b.span.start;
    const lenA = a.span.end - a.span.start;
    const lenB = b.span.end - b.span.start;
    if (lenB !== lenA) return lenB - lenA;
    return b.score - a.score;
  });

  const kept = [];
  let lastEnd = -Infinity;
  for (const hit of positional) {
    if (hit.span.start >= lastEnd) {
      kept.push(hit);
      lastEnd = hit.span.end;
    }
  }
  return [...kept, ...rest];
}

/**
 * カルテ本文から、薬剤・検査・既往歴（疾患・手術名）マスタに近い語を検出する。
 * @returns {{ kind: "exam"|"med"|"history", label: string, score: number, exact: boolean, item: any }[]}
 */
export function detectNoteChips(
  body,
  { medItems = [], examItems = [], historyItems = [] } = {},
  { limit = DEFAULT_CHIP_LIMIT } = {}
) {
  const text = String(body || "");
  if (!text.trim()) return [];

  const examTargets = listExamMatchTargets(examItems);
  const medTargets = listMedicationMatchTargets(medItems);
  const historyTargets = listHistoryTreeMatchTargets(historyItems);

  let hits = [
    ...collectHits(text, examTargets, scanExamLabelInText, "exam"),
    ...collectHits(text, medTargets, scanMedicationLabelInText, "med"),
    ...collectHits(text, historyTargets, scanHistoryLabelInText, "history"),
  ];

  hits = resolveOverlaps(hits);

  const seen = new Set();
  const deduped = [];
  for (const hit of hits) {
    const key = `${hit.kind}::${hit.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(hit);
  }

  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, limit);
}
