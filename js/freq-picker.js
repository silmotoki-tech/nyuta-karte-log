// 投与頻度の入力UI・ラベル生成。
// 薬剤の出来事（追加・増量・減量など）に付随して保存する。

export const WEEKDAY_OPTIONS = [
  { id: 1, label: "月", full: "月曜日" },
  { id: 2, label: "火", full: "火曜日" },
  { id: 3, label: "水", full: "水曜日" },
  { id: 4, label: "木", full: "木曜日" },
  { id: 5, label: "金", full: "金曜日" },
  { id: 6, label: "土", full: "土曜日" },
  { id: 7, label: "日", full: "日曜日" },
];

export const FREQ_MODES = [
  { id: "preset", label: "よくある" },
  { id: "every_n", label: "○日に○回" },
  { id: "weekly", label: "週○回" },
  { id: "weekdays", label: "曜日指定" },
  { id: "other", label: "その他" },
];

/** 新規開始時など、絶対指定のよくあるパターン */
export const FREQ_PRESETS_ABSOLUTE = ["1日1回", "1日2回", "1日3回", "1日4回"];

/** 増量・減量時の遷移パターン */
export const FREQ_PRESETS_TRANSITION = [
  "1日2回→1回",
  "1日3回→2回",
  "1日3回→1回",
  "1日1回→2回",
  "1日2回→3回",
];

export function createEmptyFreqDraft(mode = "preset") {
  return {
    mode,
    preset: "",
    everyN: {
      periodBuffer: "3",
      periodValue: 3,
      timesBuffer: "1",
      timesValue: 1,
      activeField: "period",
    },
    weekly: {
      buffer: "1",
      value: 1,
    },
    weekdays: [],
    other: "",
  };
}

/**
 * 保存済みイベントの frequency / frequencyChange から入力ドラフトを復元する。
 */
export function freqDraftFromEvent(ev) {
  const f = ev?.frequency;
  if (f?.kind === "every_n_days") {
    const d = createEmptyFreqDraft("every_n");
    const period = Number(f.periodDays) || 1;
    const times = Number(f.times) || 1;
    d.everyN = {
      periodBuffer: String(period),
      periodValue: period,
      timesBuffer: String(times),
      timesValue: times,
      activeField: "period",
    };
    return d;
  }
  if (f?.kind === "weekly_count") {
    const d = createEmptyFreqDraft("weekly");
    const times = Number(f.times) || 1;
    d.weekly = { buffer: String(times), value: times };
    return d;
  }
  if (f?.kind === "weekdays") {
    const d = createEmptyFreqDraft("weekdays");
    d.weekdays = Array.isArray(f.weekdays) ? [...f.weekdays] : [];
    return d;
  }
  if (f?.kind === "other") {
    const d = createEmptyFreqDraft("other");
    d.other = f.label || ev.frequencyChange || "";
    return d;
  }
  if (f?.kind === "preset" || f?.kind === "daily") {
    const d = createEmptyFreqDraft("preset");
    d.preset = f.label || (f.kind === "daily" ? `1日${f.times}回` : "") || ev.frequencyChange || "";
    return d;
  }
  // 構造化なし・ラベルのみ（旧データ含む）
  if (ev?.frequencyChange) {
    const label = ev.frequencyChange;
    const everyN = label.match(/^(\d+)日に(\d+)回$/);
    if (everyN) {
      const d = createEmptyFreqDraft("every_n");
      const period = Number(everyN[1]);
      const times = Number(everyN[2]);
      d.everyN = {
        periodBuffer: String(period),
        periodValue: period,
        timesBuffer: String(times),
        timesValue: times,
        activeField: "period",
      };
      return d;
    }
    const weekly = label.match(/^週(\d+)回$/);
    if (weekly) {
      const d = createEmptyFreqDraft("weekly");
      const times = Number(weekly[1]);
      d.weekly = { buffer: String(times), value: times };
      return d;
    }
    const d = createEmptyFreqDraft("preset");
    d.preset = label;
    // プリセット一覧に無い文言は「その他」へ
    const known = new Set([...FREQ_PRESETS_ABSOLUTE, ...FREQ_PRESETS_TRANSITION]);
    if (!known.has(label) && !/^1日\d+回$/.test(label)) {
      const other = createEmptyFreqDraft("other");
      other.other = label;
      return other;
    }
    return d;
  }
  return createEmptyFreqDraft("preset");
}

export function formatWeekdaysLabel(weekdayIds) {
  const set = new Set(weekdayIds || []);
  const names = WEEKDAY_OPTIONS.filter((w) => set.has(w.id)).map((w) => w.full);
  return names.join("・");
}

/**
 * 構造化頻度 → 表示ラベル。
 */
export function formatFrequencyLabel(frequency) {
  if (!frequency) return "";
  if (frequency.label) return frequency.label;
  if (frequency.kind === "every_n_days") {
    return `${frequency.periodDays}日に${frequency.times}回`;
  }
  if (frequency.kind === "weekly_count") {
    return `週${frequency.times}回`;
  }
  if (frequency.kind === "weekdays") {
    return formatWeekdaysLabel(frequency.weekdays);
  }
  if (frequency.kind === "daily") {
    return `1日${frequency.times}回`;
  }
  return frequency.label || "";
}

/**
 * イベントに保存する頻度情報を組み立てる。
 * 未入力・不正時は { ok: false, message }。
 * 任意入力で空のときは { ok: true, empty: true }。
 */
export function resolveFrequencyDraft(draft, { required = false } = {}) {
  if (!draft) {
    if (required) return { ok: false, message: "投与頻度を指定してください。" };
    return { ok: true, empty: true, frequencyChange: "", frequency: null };
  }

  const mode = draft.mode || "preset";

  if (mode === "preset") {
    if (!draft.preset) {
      if (required) return { ok: false, message: "よくあるパターンを選ぶか、他の指定方法を選んでください。" };
      return { ok: true, empty: true, frequencyChange: "", frequency: null };
    }
    return {
      ok: true,
      frequencyChange: draft.preset,
      frequency: { kind: "preset", label: draft.preset },
    };
  }

  if (mode === "every_n") {
    const periodBuf = Number(draft.everyN?.periodBuffer);
    const timesBuf = Number(draft.everyN?.timesBuffer);
    const period =
      draft.everyN?.periodBuffer !== "" && periodBuf >= 1
        ? periodBuf
        : Number(draft.everyN?.periodValue) || 0;
    const times =
      draft.everyN?.timesBuffer !== "" && timesBuf >= 1
        ? timesBuf
        : Number(draft.everyN?.timesValue) || 0;
    if (period < 1 || times < 1) {
      return {
        ok: false,
        message: "「○日に○回」は日数・回数をそれぞれ1以上で入力し、確定してください。",
      };
    }
    const label = `${period}日に${times}回`;
    return {
      ok: true,
      frequencyChange: label,
      frequency: {
        kind: "every_n_days",
        periodDays: period,
        times,
        label,
      },
    };
  }

  if (mode === "weekly") {
    const buf = Number(draft.weekly?.buffer);
    const times =
      draft.weekly?.buffer !== "" && buf >= 1 ? buf : Number(draft.weekly?.value) || 0;
    if (times < 1) {
      return { ok: false, message: "「週○回」は1以上の回数を入力し、確定してください。" };
    }
    const label = `週${times}回`;
    return {
      ok: true,
      frequencyChange: label,
      frequency: { kind: "weekly_count", times, label },
    };
  }

  if (mode === "weekdays") {
    const days = Array.isArray(draft.weekdays) ? [...draft.weekdays].sort((a, b) => a - b) : [];
    if (days.length === 0) {
      return { ok: false, message: "曜日を1つ以上選んでください。" };
    }
    const label = formatWeekdaysLabel(days);
    return {
      ok: true,
      frequencyChange: label,
      frequency: { kind: "weekdays", weekdays: days, label },
    };
  }

  if (mode === "other") {
    const text = (draft.other || "").trim();
    if (!text) {
      if (required) return { ok: false, message: "その他の頻度を入力してください。" };
      return { ok: true, empty: true, frequencyChange: "", frequency: null };
    }
    return {
      ok: true,
      frequencyChange: text,
      frequency: { kind: "other", label: text },
    };
  }

  return { ok: true, empty: true, frequencyChange: "", frequency: null };
}

/**
 * 出来事表示用。構造化 frequency があれば優先。
 */
export function eventFrequencyText(ev) {
  if (!ev) return "";
  if (ev.frequency) {
    const label = formatFrequencyLabel(ev.frequency);
    if (label) return label;
  }
  return ev.frequencyChange || "";
}

/**
 * テンキー風 UI（検査予定タブと同じ見た目）。
 */
export function mountNumpad(container, { onDigit, onDelete, onConfirm }) {
  if (!container) return;
  container.innerHTML = "";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "削除", "0", "確定"];
  keys.forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "numpad__btn";
    btn.textContent = key;
    if (key === "削除") {
      btn.classList.add("numpad__btn--action");
      btn.addEventListener("click", onDelete);
    } else if (key === "確定") {
      btn.classList.add("numpad__btn--action", "numpad__btn--confirm");
      btn.addEventListener("click", onConfirm);
    } else {
      btn.addEventListener("click", () => onDigit(key));
    }
    container.appendChild(btn);
  });
}

/**
 * 頻度ピッカーを指定ルート要素群にバインドする。
 * els: {
 *   modes, presets, panelPreset, panelEveryN, panelWeekly, panelWeekdays, panelOther,
 *   everyNPeriod, everyNTimes, everyNNumpad, weeklyDisplay, weeklyNumpad, weekdays, otherInput
 * }
 */
export function bindFrequencyPicker(els, {
  getDraft,
  setDraft,
  getPresets,
  onChange,
  showError,
}) {
  function draft() {
    return getDraft();
  }

  function commit(next) {
    setDraft(next);
    render();
    onChange?.(next);
  }

  function setMode(mode) {
    const d = { ...draft(), mode };
    commit(d);
  }

  function renderModes() {
    if (!els.modes) return;
    els.modes.innerHTML = "";
    FREQ_MODES.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "interval-unit-btn";
      btn.textContent = m.label;
      btn.classList.toggle("is-selected", draft().mode === m.id);
      btn.addEventListener("click", () => setMode(m.id));
      els.modes.appendChild(btn);
    });
  }

  function renderPanels() {
    const mode = draft().mode;
    if (els.panelPreset) els.panelPreset.hidden = mode !== "preset";
    if (els.panelEveryN) els.panelEveryN.hidden = mode !== "every_n";
    if (els.panelWeekly) els.panelWeekly.hidden = mode !== "weekly";
    if (els.panelWeekdays) els.panelWeekdays.hidden = mode !== "weekdays";
    if (els.panelOther) els.panelOther.hidden = mode !== "other";
  }

  function renderPresets() {
    if (!els.presets) return;
    els.presets.innerHTML = "";
    const list = typeof getPresets === "function" ? getPresets() : getPresets || [];
    list.forEach((label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quick-date-btn";
      btn.textContent = label;
      btn.classList.toggle("is-selected", draft().preset === label);
      btn.addEventListener("click", () => {
        commit({ ...draft(), mode: "preset", preset: label });
      });
      els.presets.appendChild(btn);
    });
  }

  function syncEveryNDisplays() {
    const en = draft().everyN;
    if (els.everyNPeriod) {
      const shown = en.periodBuffer !== "" ? en.periodBuffer : String(en.periodValue || "");
      els.everyNPeriod.textContent = `日数: ${shown || "—"}`;
      els.everyNPeriod.classList.toggle("is-active", en.activeField === "period");
    }
    if (els.everyNTimes) {
      const shown = en.timesBuffer !== "" ? en.timesBuffer : String(en.timesValue || "");
      els.everyNTimes.textContent = `回数: ${shown || "—"}`;
      els.everyNTimes.classList.toggle("is-active", en.activeField === "times");
    }
  }

  function syncWeeklyDisplay() {
    if (!els.weeklyDisplay) return;
    const w = draft().weekly;
    const shown = w.buffer !== "" ? w.buffer : String(w.value || "");
    els.weeklyDisplay.textContent = `週${shown || "—"}回`;
  }

  function renderWeekdays() {
    if (!els.weekdays) return;
    els.weekdays.innerHTML = "";
    const selected = new Set(draft().weekdays || []);
    WEEKDAY_OPTIONS.forEach((w) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "weekday-btn";
      btn.textContent = w.label;
      btn.title = w.full;
      btn.classList.toggle("is-selected", selected.has(w.id));
      btn.addEventListener("click", () => {
        const next = new Set(draft().weekdays || []);
        if (next.has(w.id)) next.delete(w.id);
        else next.add(w.id);
        commit({ ...draft(), mode: "weekdays", weekdays: [...next].sort((a, b) => a - b) });
      });
      els.weekdays.appendChild(btn);
    });
  }

  function wireEveryNOnce() {
    if (els._everyNWired) return;
    els._everyNWired = true;
    els.everyNPeriod?.addEventListener("click", () => {
      commit({
        ...draft(),
        mode: "every_n",
        everyN: { ...draft().everyN, activeField: "period" },
      });
    });
    els.everyNTimes?.addEventListener("click", () => {
      commit({
        ...draft(),
        mode: "every_n",
        everyN: { ...draft().everyN, activeField: "times" },
      });
    });
    mountNumpad(els.everyNNumpad, {
      onDigit: (d) => {
        const en = { ...draft().everyN };
        const key = en.activeField === "times" ? "timesBuffer" : "periodBuffer";
        if ((en[key] || "").length >= 3) return;
        en[key] = en[key] === "0" ? d : (en[key] || "") + d;
        commit({ ...draft(), mode: "every_n", everyN: en });
      },
      onDelete: () => {
        const en = { ...draft().everyN };
        const key = en.activeField === "times" ? "timesBuffer" : "periodBuffer";
        en[key] = (en[key] || "").slice(0, -1);
        commit({ ...draft(), mode: "every_n", everyN: en });
      },
      onConfirm: () => {
        const en = { ...draft().everyN };
        if (en.activeField === "times") {
          const n = Number(en.timesBuffer);
          if (!n || n < 1) {
            showError?.("回数は1以上で確定してください。");
            return;
          }
          en.timesValue = n;
          en.timesBuffer = String(n);
        } else {
          const n = Number(en.periodBuffer);
          if (!n || n < 1) {
            showError?.("日数は1以上で確定してください。");
            return;
          }
          en.periodValue = n;
          en.periodBuffer = String(n);
        }
        showError?.("");
        commit({ ...draft(), mode: "every_n", everyN: en });
      },
    });
  }

  function wireWeeklyOnce() {
    if (els._weeklyWired) return;
    els._weeklyWired = true;
    mountNumpad(els.weeklyNumpad, {
      onDigit: (d) => {
        const w = { ...draft().weekly };
        if ((w.buffer || "").length >= 2) return;
        w.buffer = w.buffer === "0" ? d : (w.buffer || "") + d;
        commit({ ...draft(), mode: "weekly", weekly: w });
      },
      onDelete: () => {
        const w = { ...draft().weekly };
        w.buffer = (w.buffer || "").slice(0, -1);
        commit({ ...draft(), mode: "weekly", weekly: w });
      },
      onConfirm: () => {
        const w = { ...draft().weekly };
        const n = Number(w.buffer);
        if (!n || n < 1) {
          showError?.("週あたりの回数は1以上で確定してください。");
          return;
        }
        w.value = n;
        w.buffer = String(n);
        showError?.("");
        commit({ ...draft(), mode: "weekly", weekly: w });
      },
    });
  }

  function wireOtherOnce() {
    if (els._otherWired || !els.otherInput) return;
    els._otherWired = true;
    els.otherInput.addEventListener("input", () => {
      commit({ ...draft(), mode: "other", other: els.otherInput.value });
    });
  }

  function render() {
    renderModes();
    renderPanels();
    renderPresets();
    syncEveryNDisplays();
    syncWeeklyDisplay();
    renderWeekdays();
    if (els.otherInput && draft().mode === "other") {
      if (els.otherInput.value !== draft().other) {
        els.otherInput.value = draft().other || "";
      }
    }
  }

  function init() {
    wireEveryNOnce();
    wireWeeklyOnce();
    wireOtherOnce();
    render();
  }

  return { init, render, setMode };
}
