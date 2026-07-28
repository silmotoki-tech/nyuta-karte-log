// 右カラムタブ名の注意色（期限の深刻度・特記の重要度）。

const DUE_RANK = {
  far: 0,
  near: 1,
  close: 2,
  overdue: 3,
};

const DUE_ALERT_CLASSES = [
  "right-tab--due-near",
  "right-tab--due-close",
  "right-tab--due-overdue",
];

const NOTE_ALERT_CLASS = "right-tab--note-high";

/**
 * 期限レベル配列から、タブ反映対象（黄以上）で最も深刻なものを返す。
 * @returns {"near"|"close"|"overdue"|null}
 */
export function maxDueAlertLevel(levels) {
  let best = null;
  let bestRank = 0;
  for (const level of levels || []) {
    const rank = DUE_RANK[level] || 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = level;
    }
  }
  return bestRank >= DUE_RANK.near ? best : null;
}

function findTabButton(tabId) {
  return document.querySelector(`#right-tabs .right-tab[data-tab="${tabId}"]`);
}

function clearDueClasses(btn) {
  if (!btn) return;
  btn.classList.remove(...DUE_ALERT_CLASSES);
}

/**
 * 検査・薬剤・処置タブの文字色を期限レベルに合わせる（far/null は通常色）。
 */
export function setRightTabDueAlert(tabId, level) {
  const btn = findTabButton(tabId);
  if (!btn) return;
  clearDueClasses(btn);
  if (level === "near" || level === "close" || level === "overdue") {
    btn.classList.add(`right-tab--due-${level}`);
  }
}

/**
 * 特記タブ: 重要度「高」が1件でもあれば赤。
 */
export function setRightTabNoteHighAlert(hasHigh) {
  const btn = findTabButton("notes");
  if (!btn) return;
  btn.classList.toggle(NOTE_ALERT_CLASS, Boolean(hasHigh));
}

/** カルテ離脱時など、注意色をすべて外す */
export function clearRightTabAlerts() {
  document.querySelectorAll("#right-tabs .right-tab").forEach((btn) => {
    clearDueClasses(btn);
    btn.classList.remove(NOTE_ALERT_CLASS);
  });
}
