// 一覧行の編集・削除などのアイコンボタン。

const SVG = {
  edit: `<svg class="icon-btn__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.999-1.66z"/></svg>`,
  delete: `<svg class="icon-btn__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  refresh: `<svg class="icon-btn__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.76-4.24L14 10h6V4l-2.35 2.35z"/></svg>`,
  complete: `<svg class="icon-btn__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`,
};

/**
 * @param {{ action: "edit"|"delete"|"refresh"|"complete", title: string, onClick?: (e: Event) => void, className?: string }} opts
 */
export function createIconButton({ action, title, onClick, className = "" }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = ["icon-btn", `icon-btn--${action}`, className].filter(Boolean).join(" ");
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.innerHTML = SVG[action] || "";
  if (onClick) btn.addEventListener("click", onClick);
  return btn;
}

/**
 * @param {Array<{ action: "edit"|"delete"|"refresh"|"complete", title: string, onClick?: (e: Event) => void, className?: string } | null | undefined>} items
 * @param {string} [wrapClass="icon-actions"]
 */
export function createIconActions(items, wrapClass = "icon-actions") {
  const wrap = document.createElement("div");
  wrap.className = wrapClass;
  items.filter(Boolean).forEach((item) => {
    wrap.appendChild(createIconButton(item));
  });
  return wrap;
}
