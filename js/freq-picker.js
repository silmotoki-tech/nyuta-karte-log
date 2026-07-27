// 投与頻度の入力UI・ラベル生成。
// 薬剤の出来事（追加・増量・減量など）に付随して保存する。
// UI は薬剤マスタと同じ「指定方法→内容」の横並びリニア選択。

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

/** 1日N回のよくあるパターン（頓服＋1〜8回） */
export const FREQ_PRESETS_ABSOLUTE = [
  "頓服",
  ...Array.from({ length: 8 }, (_, i) => `1日${i + 1}回`),
];

/** @deprecated 矢印付き遷移表現は廃止。互換のため空配列を残す */
export const FREQ_PRESETS_TRANSITION = [];

/** ○日に○回モードの決まった選択肢（その他は自由入力） */
export const FREQ_EVERY_N_PRESETS = [
  "2日に1回",
  "3日に1回",
  "4日に1回",
  "5日に1回",
  "6日に1回",
  "2投1休",
  "3投1休",
  "4投1休",
  "5投1休",
];

/** 週○回モードの選択肢 */
export const FREQ_WEEKLY_PRESETS = [
  "週1回",
  "週2回",
  "週3回",
  "週4回",
  "週5回",
  "週6回",
];

const EVERY_N_OTHER = "other";

function emptyEveryN() {
  return {
    selection: "",
    periodBuffer: "3",
    periodValue: 3,
    timesBuffer: "1",
    timesValue: 1,
    activeField: "period",
  };
}

function emptyWeekly() {
  return {
    selection: "",
    buffer: "1",
    value: 1,
  };
}

export function createEmptyFreqDraft(mode = null) {
  return {
    mode: mode || null,
    preset: "",
    everyN: emptyEveryN(),
    weekly: emptyWeekly(),
    weekdays: [],
    other: "",
  };
}

function parseEveryNLabel(label) {
  const everyN = String(label || "").match(/^(\d+)日に(\d+)回$/);
  if (everyN) {
    return {
      kind: "every_n_days",
      periodDays: Number(everyN[1]),
      times: Number(everyN[2]),
      label,
    };
  }
  const cycle = String(label || "").match(/^(\d+)投(\d+)休$/);
  if (cycle) {
    return {
      kind: "on_off_cycle",
      onDays: Number(cycle[1]),
      offDays: Number(cycle[2]),
      label,
    };
  }
  return null;
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
    const label = f.label || `${period}日に${times}回`;
    if (FREQ_EVERY_N_PRESETS.includes(label)) {
      d.everyN.selection = label;
    } else {
      d.everyN.selection = EVERY_N_OTHER;
      d.everyN.periodBuffer = String(period);
      d.everyN.periodValue = period;
      d.everyN.timesBuffer = String(times);
      d.everyN.timesValue = times;
    }
    return d;
  }
  if (f?.kind === "on_off_cycle") {
    const d = createEmptyFreqDraft("every_n");
    const label =
      f.label || `${Number(f.onDays) || 1}投${Number(f.offDays) || 1}休`;
    d.everyN.selection = FREQ_EVERY_N_PRESETS.includes(label)
      ? label
      : EVERY_N_OTHER;
    if (d.everyN.selection === EVERY_N_OTHER) {
      // 投休の自由入力は「その他」テキスト側へ逃がす
      const other = createEmptyFreqDraft("other");
      other.other = label;
      return other;
    }
    return d;
  }
  if (f?.kind === "weekly_count") {
    const d = createEmptyFreqDraft("weekly");
    const times = Number(f.times) || 1;
    const label = f.label || `週${times}回`;
    if (FREQ_WEEKLY_PRESETS.includes(label)) {
      d.weekly.selection = label;
      d.weekly.value = times;
      d.weekly.buffer = String(times);
    } else if (times >= 1 && times <= 6) {
      d.weekly.selection = `週${times}回`;
      d.weekly.value = times;
      d.weekly.buffer = String(times);
    } else {
      const other = createEmptyFreqDraft("other");
      other.other = label;
      return other;
    }
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
    d.preset =
      f.label ||
      (f.kind === "daily" ? `1日${f.times}回` : "") ||
      ev.frequencyChange ||
      "";
    if (d.preset && !FREQ_PRESETS_ABSOLUTE.includes(d.preset)) {
      const parsed = parseEveryNLabel(d.preset);
      if (parsed) {
        const every = createEmptyFreqDraft("every_n");
        every.everyN.selection = FREQ_EVERY_N_PRESETS.includes(d.preset)
          ? d.preset
          : EVERY_N_OTHER;
        if (every.everyN.selection === EVERY_N_OTHER && parsed.kind === "every_n_days") {
          every.everyN.periodBuffer = String(parsed.periodDays);
          every.everyN.periodValue = parsed.periodDays;
          every.everyN.timesBuffer = String(parsed.times);
          every.everyN.timesValue = parsed.times;
        } else if (every.everyN.selection === EVERY_N_OTHER) {
          const other = createEmptyFreqDraft("other");
          other.other = d.preset;
          return other;
        }
        return every;
      }
      if (FREQ_WEEKLY_PRESETS.includes(d.preset)) {
        const weekly = createEmptyFreqDraft("weekly");
        weekly.weekly.selection = d.preset;
        return weekly;
      }
      const other = createEmptyFreqDraft("other");
      other.other = d.preset;
      return other;
    }
    return d;
  }
  // 構造化なし・ラベルのみ（旧データ含む）
  if (ev?.frequencyChange) {
    const label = ev.frequencyChange;
    if (FREQ_PRESETS_ABSOLUTE.includes(label) || /^1日\d+回$/.test(label)) {
      const d = createEmptyFreqDraft("preset");
      d.preset = label;
      return d;
    }
    if (FREQ_EVERY_N_PRESETS.includes(label)) {
      const d = createEmptyFreqDraft("every_n");
      d.everyN.selection = label;
      return d;
    }
    const parsed = parseEveryNLabel(label);
    if (parsed?.kind === "every_n_days") {
      const d = createEmptyFreqDraft("every_n");
      d.everyN.selection = EVERY_N_OTHER;
      d.everyN.periodBuffer = String(parsed.periodDays);
      d.everyN.periodValue = parsed.periodDays;
      d.everyN.timesBuffer = String(parsed.times);
      d.everyN.timesValue = parsed.times;
      return d;
    }
    if (FREQ_WEEKLY_PRESETS.includes(label)) {
      const d = createEmptyFreqDraft("weekly");
      d.weekly.selection = label;
      return d;
    }
    const weekly = label.match(/^週(\d+)回$/);
    if (weekly) {
      const times = Number(weekly[1]);
      if (times >= 1 && times <= 6) {
        const d = createEmptyFreqDraft("weekly");
        d.weekly.selection = `週${times}回`;
        d.weekly.value = times;
        d.weekly.buffer = String(times);
        return d;
      }
    }
    const other = createEmptyFreqDraft("other");
    other.other = label;
    return other;
  }
  return createEmptyFreqDraft(null);
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
  if (frequency.kind === "on_off_cycle") {
    return `${frequency.onDays}投${frequency.offDays}休`;
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

  const mode = draft.mode || null;
  if (!mode) {
    if (required) return { ok: false, message: "投与頻度の指定方法を選んでください。" };
    return { ok: true, empty: true, frequencyChange: "", frequency: null };
  }

  if (mode === "preset") {
    if (!draft.preset) {
      if (required) {
        return {
          ok: false,
          message: "よくあるパターンを選ぶか、他の指定方法を選んでください。",
        };
      }
      return { ok: true, empty: true, frequencyChange: "", frequency: null };
    }
    return {
      ok: true,
      frequencyChange: draft.preset,
      frequency: { kind: "preset", label: draft.preset },
    };
  }

  if (mode === "every_n") {
    const sel = draft.everyN?.selection || "";
    if (!sel) {
      if (required) {
        return { ok: false, message: "「○日に○回」の内容を選んでください。" };
      }
      return { ok: true, empty: true, frequencyChange: "", frequency: null };
    }
    if (sel !== EVERY_N_OTHER) {
      const parsed = parseEveryNLabel(sel);
      if (!parsed) {
        return { ok: false, message: "「○日に○回」の内容が不正です。" };
      }
      return {
        ok: true,
        frequencyChange: sel,
        frequency: parsed,
      };
    }
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
        message:
          "「○日に○回」のその他は日数・回数をそれぞれ1以上で入力し、確定してください。",
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
    const sel = draft.weekly?.selection || "";
    if (!sel) {
      if (required) {
        return { ok: false, message: "「週○回」の回数を選んでください。" };
      }
      return { ok: true, empty: true, frequencyChange: "", frequency: null };
    }
    const m = sel.match(/^週(\d+)回$/);
    const times = m ? Number(m[1]) : Number(draft.weekly?.value) || 0;
    if (times < 1) {
      return { ok: false, message: "「週○回」の回数を選んでください。" };
    }
    const label = `週${times}回`;
    return {
      ok: true,
      frequencyChange: label,
      frequency: { kind: "weekly_count", times, label },
    };
  }

  if (mode === "weekdays") {
    const days = Array.isArray(draft.weekdays)
      ? [...draft.weekdays].sort((a, b) => a - b)
      : [];
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

function createLinearItemButton({ label, selected, onClick, title }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "med-linear-picker__item";
  btn.setAttribute("role", "option");
  btn.setAttribute("aria-selected", String(Boolean(selected)));
  btn.classList.toggle("is-selected", Boolean(selected));
  if (title) btn.title = title;

  const text = document.createElement("span");
  text.className = "med-linear-picker__item-label";
  text.textContent = label;

  const check = document.createElement("span");
  check.className = "med-linear-picker__check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";

  btn.append(text, check);
  btn.addEventListener("click", onClick);
  return btn;
}

/**
 * 頻度ピッカーを指定ルート要素群にバインドする。
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

  function modeLabel(modeId) {
    return FREQ_MODES.find((m) => m.id === modeId)?.label || "内容";
  }

  function renderModes() {
    if (!els.modes) return;
    els.modes.innerHTML = "";
    const current = draft().mode || null;
    FREQ_MODES.forEach((m) => {
      els.modes.appendChild(
        createLinearItemButton({
          label: m.label,
          selected: current === m.id,
          onClick: () => setMode(m.id),
        })
      );
    });
  }

  function renderPanels() {
    const mode = draft().mode || null;
    const everyNOther = draft().everyN?.selection === EVERY_N_OTHER;
    if (els.detailCol) els.detailCol.hidden = !mode;
    if (els.detailHead && mode) {
      els.detailHead.textContent = modeLabel(mode);
    }
    if (els.panelPreset) els.panelPreset.hidden = mode !== "preset";
    if (els.panelEveryN) els.panelEveryN.hidden = mode !== "every_n";
    if (els.panelWeekly) els.panelWeekly.hidden = mode !== "weekly";
    if (els.panelWeekdays) els.panelWeekdays.hidden = mode !== "weekdays";
    if (els.panelOther) els.panelOther.hidden = mode !== "other";
    if (els.everyNOtherBlock) {
      const showOther = mode === "every_n" && everyNOther;
      els.everyNOtherBlock.hidden = !showOther;
      if (showOther) {
        // テンキーがモーダル下部に隠れるのを避ける
        requestAnimationFrame(() => {
          els.everyNOtherBlock.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      }
    }
  }

  function renderPresets() {
    if (!els.presets) return;
    els.presets.innerHTML = "";
    const list = typeof getPresets === "function" ? getPresets() : getPresets || [];
    list.forEach((label) => {
      els.presets.appendChild(
        createLinearItemButton({
          label,
          selected: draft().preset === label,
          onClick: () => {
            commit({ ...draft(), mode: "preset", preset: label });
          },
        })
      );
    });
  }

  function renderEveryNPresets() {
    if (!els.everyNPresets) return;
    els.everyNPresets.innerHTML = "";
    const selected = draft().everyN?.selection || "";
    FREQ_EVERY_N_PRESETS.forEach((label) => {
      els.everyNPresets.appendChild(
        createLinearItemButton({
          label,
          selected: selected === label,
          onClick: () => {
            commit({
              ...draft(),
              mode: "every_n",
              everyN: { ...draft().everyN, selection: label },
            });
          },
        })
      );
    });
    els.everyNPresets.appendChild(
      createLinearItemButton({
        label: "その他",
        selected: selected === EVERY_N_OTHER,
        onClick: () => {
          commit({
            ...draft(),
            mode: "every_n",
            everyN: { ...draft().everyN, selection: EVERY_N_OTHER },
          });
        },
      })
    );
  }

  function renderWeeklyPresets() {
    if (!els.weeklyPresets) return;
    els.weeklyPresets.innerHTML = "";
    const selected = draft().weekly?.selection || "";
    FREQ_WEEKLY_PRESETS.forEach((label) => {
      els.weeklyPresets.appendChild(
        createLinearItemButton({
          label,
          selected: selected === label,
          onClick: () => {
            const times = Number(label.match(/^週(\d+)回$/)?.[1]) || 1;
            commit({
              ...draft(),
              mode: "weekly",
              weekly: {
                ...draft().weekly,
                selection: label,
                value: times,
                buffer: String(times),
              },
            });
          },
        })
      );
    });
  }

  function syncEveryNDisplays() {
    const en = draft().everyN || emptyEveryN();
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

  function renderWeekdays() {
    if (!els.weekdays) return;
    els.weekdays.innerHTML = "";
    const selected = new Set(draft().weekdays || []);
    WEEKDAY_OPTIONS.forEach((w) => {
      els.weekdays.appendChild(
        createLinearItemButton({
          label: w.full,
          title: w.full,
          selected: selected.has(w.id),
          onClick: () => {
            const next = new Set(draft().weekdays || []);
            if (next.has(w.id)) next.delete(w.id);
            else next.add(w.id);
            commit({
              ...draft(),
              mode: "weekdays",
              weekdays: [...next].sort((a, b) => a - b),
            });
          },
        })
      );
    });
  }

  function wireEveryNOnce() {
    if (els._everyNWired) return;
    els._everyNWired = true;
    els.everyNPeriod?.addEventListener("click", () => {
      commit({
        ...draft(),
        mode: "every_n",
        everyN: {
          ...draft().everyN,
          selection: EVERY_N_OTHER,
          activeField: "period",
        },
      });
    });
    els.everyNTimes?.addEventListener("click", () => {
      commit({
        ...draft(),
        mode: "every_n",
        everyN: {
          ...draft().everyN,
          selection: EVERY_N_OTHER,
          activeField: "times",
        },
      });
    });
    if (!els.everyNNumpad) return;
    mountNumpad(els.everyNNumpad, {
      onDigit: (d) => {
        const en = { ...draft().everyN, selection: EVERY_N_OTHER };
        const key = en.activeField === "times" ? "timesBuffer" : "periodBuffer";
        if ((en[key] || "").length >= 3) return;
        en[key] = en[key] === "0" ? d : (en[key] || "") + d;
        commit({ ...draft(), mode: "every_n", everyN: en });
      },
      onDelete: () => {
        const en = { ...draft().everyN, selection: EVERY_N_OTHER };
        const key = en.activeField === "times" ? "timesBuffer" : "periodBuffer";
        en[key] = (en[key] || "").slice(0, -1);
        commit({ ...draft(), mode: "every_n", everyN: en });
      },
      onConfirm: () => {
        const en = { ...draft().everyN, selection: EVERY_N_OTHER };
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
    renderEveryNPresets();
    renderWeeklyPresets();
    syncEveryNDisplays();
    renderWeekdays();
    if (els.otherInput && draft().mode === "other") {
      if (els.otherInput.value !== draft().other) {
        els.otherInput.value = draft().other || "";
      }
    }
  }

  function init() {
    wireEveryNOnce();
    wireOtherOnce();
    render();
  }

  return { init, render, setMode };
}
