// 一覧行のスワイプ（左）・長押しで編集/削除を出す。
// 普段はアクションを表示しない。

import { createIconButton } from "./icon-actions.js";

const HINT_STORAGE_KEY = "nyuta-row-gesture-hint-dismissed";
const SWIPE_THRESHOLD = 48;
const LONG_PRESS_MS = 480;
const ACTION_BTN_WIDTH = 36;

let openRow = null;
let longPressMenu = null;

function readHintDismissed() {
  try {
    return localStorage.getItem(HINT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHintDismissed() {
  try {
    localStorage.setItem(HINT_STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

/**
 * ヒント帯を作る。既に閉じ済みなら null。
 */
export function createRowGestureHint({ className = "" } = {}) {
  if (readHintDismissed()) return null;
  const wrap = document.createElement("p");
  wrap.className = ["row-gesture-hint", className].filter(Boolean).join(" ");
  wrap.setAttribute("role", "note");

  const text = document.createElement("span");
  text.className = "row-gesture-hint__text";
  text.textContent = "左にスワイプまたは長押しで編集・削除ができます";

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "row-gesture-hint__dismiss";
  dismiss.setAttribute("aria-label", "ヒントを閉じる");
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => {
    writeHintDismissed();
    document.querySelectorAll(".row-gesture-hint").forEach((el) => el.remove());
  });

  wrap.append(text, dismiss);
  return wrap;
}

/**
 * 親要素内にヒントが無ければ先頭付近へ挿入する。
 * @param {HTMLElement|null} parent
 * @param {HTMLElement|null} beforeEl insertBefore の基準（省略時は先頭）
 * @param {string} className
 */
export function ensureRowGestureHint(parent, beforeEl = null, className = "") {
  if (!parent) return null;
  const selector = className
    ? `.row-gesture-hint.${className.split(/\s+/).join(".")}`
    : ".row-gesture-hint";
  const existing = parent.querySelector(selector);
  if (existing) return existing;
  const hint = createRowGestureHint({ className });
  if (!hint) return null;
  if (beforeEl && beforeEl.parentElement === parent) {
    parent.insertBefore(hint, beforeEl);
  } else {
    parent.prepend(hint);
  }
  return hint;
}

export function closeAllRowGestures() {
  closeLongPressMenu();
  if (openRow) {
    setRowOpen(openRow, false);
    openRow = null;
  }
}

function actionsWidth(row) {
  const n = Number(row.dataset.actionCount || 2);
  return Math.max(ACTION_BTN_WIDTH, n * ACTION_BTN_WIDTH);
}

function setRowOpen(row, open) {
  row.classList.toggle("is-actions-open", open);
  const front = row.querySelector(".swipeable__front");
  if (front) {
    const w = actionsWidth(row);
    front.style.transform = open ? `translateX(-${w}px)` : "";
  }
}

function closeLongPressMenu() {
  if (longPressMenu) {
    longPressMenu.remove();
    longPressMenu = null;
  }
}

function showLongPressMenu(anchorEl, actions, clientX, clientY) {
  closeLongPressMenu();
  const menu = document.createElement("div");
  menu.className = "row-longpress-menu";
  menu.setAttribute("role", "menu");

  actions.filter(Boolean).forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `row-longpress-menu__item${
      item.action === "delete" ? " row-longpress-menu__item--danger" : ""
    }`;
    btn.setAttribute("role", "menuitem");
    btn.textContent = item.title;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeLongPressMenu();
      closeAllRowGestures();
      item.onClick?.(e);
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  longPressMenu = menu;

  const pad = 8;
  const rect = menu.getBoundingClientRect();
  let left = clientX - rect.width / 2;
  let top = clientY - rect.height - 12;
  left = Math.max(pad, Math.min(left, window.innerWidth - rect.width - pad));
  top = Math.max(pad, Math.min(top, window.innerHeight - rect.height - pad));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const onDoc = (e) => {
    if (menu.contains(e.target)) return;
    closeLongPressMenu();
    document.removeEventListener("pointerdown", onDoc, true);
  };
  setTimeout(() => document.addEventListener("pointerdown", onDoc, true), 0);
}

/**
 * 行要素をスワイプ／長押し対応にする。
 * @param {HTMLElement} rowEl 行ルート（li など）
 * @param {{ actions: Array<{ action: string, title: string, onClick?: Function }>, onActivate?: Function }} opts
 */
export function enableRowGestures(rowEl, { actions = [], onActivate = null } = {}) {
  if (!rowEl || rowEl.dataset.gesturesBound === "1") return rowEl;
  rowEl.dataset.gesturesBound = "1";
  rowEl.classList.add("swipeable");

  const filtered = actions.filter(Boolean);
  rowEl.dataset.actionCount = String(filtered.length || 1);
  const width = actionsWidth(rowEl);
  rowEl.style.setProperty("--swipe-actions-width", `${width}px`);

  const front = document.createElement("div");
  front.className = "swipeable__front";
  while (rowEl.firstChild) {
    front.appendChild(rowEl.firstChild);
  }

  const actionsEl = document.createElement("div");
  actionsEl.className = "swipeable__actions";
  filtered.forEach((item) => {
    const btn = createIconButton({
      action: item.action,
      title: item.title,
      className: "swipeable__action-btn",
      onClick: (e) => {
        e.stopPropagation();
        closeAllRowGestures();
        item.onClick?.(e);
      },
    });
    actionsEl.appendChild(btn);
  });

  rowEl.append(actionsEl, front);

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let swiping = false;
  let moved = false;
  let longTimer = null;
  let longFired = false;
  let pointerId = null;

  const clearLong = () => {
    if (longTimer) {
      clearTimeout(longTimer);
      longTimer = null;
    }
  };

  front.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button != null && e.button !== 0) return;
      // 星ボタン等の操作はジェスチャ対象外
      if (e.target.closest("button, a, input, select, textarea, label")) return;

      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      tracking = true;
      swiping = false;
      moved = false;
      longFired = false;
      clearLong();

      longTimer = setTimeout(() => {
        if (!tracking || moved) return;
        longFired = true;
        tracking = false;
        if (openRow && openRow !== rowEl) setRowOpen(openRow, false);
        openRow = null;
        setRowOpen(rowEl, false);
        showLongPressMenu(rowEl, filtered, e.clientX, e.clientY);
        try {
          if (navigator.vibrate) navigator.vibrate(12);
        } catch {
          // ignore
        }
      }, LONG_PRESS_MS);

      try {
        front.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    { passive: true }
  );

  front.addEventListener(
    "pointermove",
    (e) => {
      if (!tracking || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!swiping) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          // 縦スクロール優先
          tracking = false;
          clearLong();
          return;
        }
        swiping = true;
        moved = true;
        clearLong();
        if (openRow && openRow !== rowEl) {
          setRowOpen(openRow, false);
          openRow = null;
        }
      }
      const max = -width;
      const x = Math.min(0, Math.max(dx, max));
      front.style.transform = `translateX(${x}px)`;
    },
    { passive: true }
  );

  const endPointer = (e) => {
    if (pointerId != null && e.pointerId !== pointerId) return;
    clearLong();
    if (!tracking && !swiping) {
      pointerId = null;
      return;
    }
    const wasSwiping = swiping;
    const wasLong = longFired;
    tracking = false;
    swiping = false;
    pointerId = null;

    if (wasLong) return;

    if (wasSwiping) {
      const dx = e.clientX - startX;
      const open = dx <= -SWIPE_THRESHOLD;
      setRowOpen(rowEl, open);
      openRow = open ? rowEl : openRow === rowEl ? null : openRow;
      if (!open) front.style.transform = "";
      return;
    }

    // タップ
    if (rowEl.classList.contains("is-actions-open")) {
      setRowOpen(rowEl, false);
      if (openRow === rowEl) openRow = null;
      return;
    }
    if (onActivate && !moved) {
      onActivate(e);
    }
  };

  front.addEventListener("pointerup", endPointer);
  front.addEventListener("pointercancel", endPointer);

  return rowEl;
}

// 画面タップで開いている行を閉じる
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!openRow) return;
      if (e.target.closest(".swipeable")) return;
      if (e.target.closest(".row-longpress-menu")) return;
      closeAllRowGestures();
    },
    true
  );
}
