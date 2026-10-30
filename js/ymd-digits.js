// 記録日・既往歴の開始日を、カレンダーではなく YYYYMMDD の8桁で入れる。
// 保存値は従来どおり YYYY-MM-DD。欄の横には、8桁が実在する日付のときだけ
// 「2026/10/10」と出す（曜日は付けない）。一覧の開始日は年/月まで。

export const YMD_MIN_YEAR = 1990;

export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function isoToDigits(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").slice(0, 10));
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

function parseDigits(digits) {
  if (!/^\d{8}$/.test(digits)) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return {
    y,
    m,
    d,
    iso: `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`,
  };
}

/** 8桁が実在する日付のときだけ「2026/10/10」。途中入力や存在しない日は空。 */
export function ymdPreview(digits) {
  return ymdDisplay(digits);
}

/** 一覧用。YYYY-MM-DD を「2023/04」にする。空欄や月が取れない値は空文字。 */
export function ymdYearMonth(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso || "").trim());
  if (!m) return "";
  const month = Number(m[2]);
  if (month < 1 || month > 12) return "";
  return `${m[1]}/${m[2]}`;
}

/** 曜日なしの表示。キュー案内など、既存の「2026/10/10」表記に使う。 */
export function ymdDisplay(digits) {
  const parsed = parseDigits(String(digits || ""));
  if (!parsed) return "";
  return `${parsed.y}/${parsed.m}/${parsed.d}`;
}

/**
 * 保存直前の検査。打鍵中には呼ばない。
 * @returns {{ ok: true, iso: string } | { ok: false, iso: "", message: string }}
 */
export function validateYmdDigits(digits, { allowEmpty = false, label = "日付", today = todayIso() } = {}) {
  const raw = String(digits || "").trim();
  if (!raw) {
    return allowEmpty
      ? { ok: true, iso: "" }
      : { ok: false, iso: "", message: `${label}を8桁で入力してください。` };
  }
  if (!/^\d{8}$/.test(raw)) {
    return { ok: false, iso: "", message: `${label}は8桁の数字で入力してください。` };
  }
  const parsed = parseDigits(raw);
  if (!parsed) {
    return { ok: false, iso: "", message: "存在しない日付です。" };
  }
  if (parsed.y < YMD_MIN_YEAR) {
    return { ok: false, iso: "", message: "1990年以降の日付を入力してください。" };
  }
  if (parsed.iso > today) {
    return { ok: false, iso: "", message: "今日より先の日付は入力できません。" };
  }
  return { ok: true, iso: parsed.iso };
}

/**
 * 8桁欄にする。iPad では数字キーボード。タップで全選択。
 * @param {HTMLInputElement | null} input
 * @param {HTMLElement | null} preview
 */
export function bindYmdDigitsInput(input, preview, { onInput } = {}) {
  const paint = () => {
    if (preview) preview.textContent = ymdPreview(input.value);
  };
  const api = {
    setIso(iso) {
      if (!input) return;
      input.value = isoToDigits(iso);
      paint();
    },
  };
  if (!input) return api;

  input.type = "text";
  input.inputMode = "numeric";
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("pattern", "[0-9]*");
  input.maxLength = 8;
  input.autocomplete = "off";
  input.autocapitalize = "off";
  input.spellcheck = false;
  input.enterKeyHint = "done";
  input.classList.add("input--ymd");

  const selectAll = () => {
    requestAnimationFrame(() => input.select());
  };
  input.addEventListener("focus", selectAll);
  input.addEventListener("click", selectAll);
  // クリック後の mouseup が選択を外すのを止める
  input.addEventListener("mouseup", (event) => event.preventDefault());
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").slice(0, 8);
    if (digits !== input.value) {
      input.value = digits;
    }
    paint();
    onInput?.();
  });
  paint();
  return api;
}
