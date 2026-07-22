// 一覧行のスワイプ・長押しで編集/削除を出す。
// 左スワイプ → 編集、右スワイプ → 削除。普段はアクションを表示しない。

import { createIconButton } from "./icon-actions.js";

const SWIPE_THRESHOLD = 44;
const LONG_PRESS_MS = 480;
/** スワイプで開く操作領域の幅（指で押しやすいサイズ）。通常表示には影響しない。 */
const ACTION_BTN_WIDTH = 56;

let openRow = null;
let longPressMenu = null;

export function closeAllRowGestures() {
  closeLongPressMenu();
  if (openRow) {
    setRowOpen(openRow, null);
    openRow = null;
  }
}

function sideWidth(row, side) {
  const key = side === "edit" ? "editActionCount" : "deleteActionCount";
  const n = Number(row.dataset[key] || 0);
  return n > 0 ? n * ACTION_BTN_WIDTH : 0;
}

function setRowOpen(row, side) {
  row.classList.toggle("is-actions-open-edit", side === "edit");
  row.classList.toggle("is-actions-open-delete", side === "delete");
  row.classList.toggle("is-actions-open", Boolean(side));
  const front = row.querySelector(".swipeable__front");
  if (!front) return;
  if (side === "edit") {
    front.style.transform = `translateX(-${sideWidth(row, "edit")}px)`;
  } else if (side === "delete") {
    front.style.transform = `translateX(${sideWidth(row, "delete")}px)`;
  } else {
    front.style.transform = "";
  }
}

function closeLongPressMenu() {
  if (longPressMenu) {
    longPressMenu.remove();
    longPressMenu = null;
  }
}

function showLongPressMenu(actions, clientX, clientY) {
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

function buildActionsPanel(side, items) {
  const el = document.createElement("div");
  el.className = `swipeable__actions swipeable__actions--${side}`;
  items.forEach((item) => {
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
    el.appendChild(btn);
  });
  return el;
}

/**
 * 行要素をスワイプ／長押し対応にする。
 * 左スワイプで編集、右スワイプで削除。長押しでは渡された全アクションのメニュー。
 * @param {HTMLElement} rowEl
 * @param {{ actions: Array<{ action: string, title: string, onClick?: Function }>, onActivate?: Function }} opts
 */
export function enableRowGestures(rowEl, { actions = [], onActivate = null } = {}) {
  if (!rowEl || rowEl.dataset.gesturesBound === "1") return rowEl;
  rowEl.dataset.gesturesBound = "1";
  rowEl.classList.add("swipeable");

  const filtered = actions.filter(Boolean);
  const editActions = filtered.filter((a) => a.action === "edit");
  const deleteActions = filtered.filter((a) => a.action === "delete");
  rowEl.dataset.editActionCount = String(editActions.length);
  rowEl.dataset.deleteActionCount = String(deleteActions.length);

  const editW = sideWidth(rowEl, "edit");
  const deleteW = sideWidth(rowEl, "delete");
  rowEl.style.setProperty("--swipe-edit-width", `${editW}px`);
  rowEl.style.setProperty("--swipe-delete-width", `${deleteW}px`);

  const front = document.createElement("div");
  front.className = "swipeable__front";
  while (rowEl.firstChild) {
    front.appendChild(rowEl.firstChild);
  }

  const parts = [];
  if (deleteActions.length) {
    parts.push(buildActionsPanel("delete", deleteActions));
  }
  if (editActions.length) {
    parts.push(buildActionsPanel("edit", editActions));
  }
  rowEl.append(...parts, front);

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
        if (openRow && openRow !== rowEl) setRowOpen(openRow, null);
        openRow = null;
        setRowOpen(rowEl, null);
        showLongPressMenu(filtered, e.clientX, e.clientY);
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
          tracking = false;
          clearLong();
          return;
        }
        swiping = true;
        moved = true;
        clearLong();
        if (openRow && openRow !== rowEl) {
          setRowOpen(openRow, null);
          openRow = null;
        }
      }
      // 左スワイプ(負)→編集、右スワイプ(正)→削除。無い側は動かさない。
      let x = dx;
      if (x < 0) {
        x = editW > 0 ? Math.max(x, -editW) : 0;
      } else if (x > 0) {
        x = deleteW > 0 ? Math.min(x, deleteW) : 0;
      }
      front.style.transform = x ? `translateX(${x}px)` : "";
      rowEl.classList.toggle("is-actions-open-edit", x < 0);
      rowEl.classList.toggle("is-actions-open-delete", x > 0);
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
      let side = null;
      if (dx <= -SWIPE_THRESHOLD && editW > 0) side = "edit";
      else if (dx >= SWIPE_THRESHOLD && deleteW > 0) side = "delete";
      setRowOpen(rowEl, side);
      openRow = side ? rowEl : openRow === rowEl ? null : openRow;
      if (!side) front.style.transform = "";
      return;
    }

    if (rowEl.classList.contains("is-actions-open")) {
      setRowOpen(rowEl, null);
      if (openRow === rowEl) {
        openRow = null;
      }
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
