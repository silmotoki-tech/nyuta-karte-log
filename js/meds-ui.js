// 右カラム「薬剤情報」タブのUIと操作ロジック。
// 使用状況は出来事履歴の最新イベントから導出する（別途の状態保存はしない）。

import {
  subscribeMedications,
  subscribeMedicationItems,
  addMedication,
  updateMedication,
  deleteMedication,
  addMedicationEvent,
  updateMedicationEvent,
  deleteMedicationEvent,
  addMedicationItem,
  fetchMedicationsOnce,
  MEDICATION_ITEM_CATEGORIES,
  normalizeMedicationItemCategory,
  normalizeMedicationItemKind,
  medicationItemCategoryLabel,
} from "./db.js";
import { enableRowGestures } from "./row-gestures.js";
import { canHandleShortcut, isImeKey } from "./ime-keys.js";
import {
  FREQ_PRESETS_ABSOLUTE,
  createEmptyFreqDraft,
  freqDraftFromEvent,
  resolveFrequencyDraft,
  eventFrequencyText,
  bindFrequencyPicker,
} from "./freq-picker.js";

const APPROACHING_DAYS = 7;
const RECENT_DAYS = 30;

const EVENT_TYPES = [
  { id: "add", label: "継続" },
  { id: "increase", label: "増量" },
  { id: "decrease", label: "減量" },
  { id: "stop", label: "中止" },
  { id: "resume", label: "再開" },
  { id: "hold", label: "休薬中" },
];

/** 量変更のよくあるパターン（増量・減量の両方で使う） */
const AMOUNT_PRESETS = [
  "半分に減らす",
  "3分の1に減らす",
  "4分の1に減らす",
  "1.5倍に増やす",
  "2倍に増やす",
  "3倍に増やす",
];

let deps = {
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "",
};

const state = {
  karteNumber: null,
  drugs: [],
  medicationItems: [],
  unsubscribeDrugs: null,
  unsubscribeItems: null,
  /** 詳細シートで開いている薬剤ID（アコーディオンは使わない） */
  detailDrugId: null,
  eventDraft: {
    mode: "create", // create | edit
    drugId: null,
    eventId: null,
    type: "add",
    date: "",
    changeFrequency: false,
    changeAmount: false,
    freq: createEmptyFreqDraft(null),
    amountPreset: "",
    amountOther: "",
    detail: "",
  },
  addDraft: {
    name: "",
    category: "A",
    freq: createEmptyFreqDraft(null),
  },
  /** 薬剤マスタ・リニアピッカー: 大分類 inject|oral|topical|eye|null、中項目 parentId（未選択は null） */
  medItemCategory: null,
  medItemParentId: null,
};

let addFreqPicker = null;
let eventFreqPicker = null;

// --- DOM -----------------------------------------------------------------

const medsList = document.getElementById("meds-list");
const medsEmpty = document.getElementById("meds-empty");
const btnMedAdd = document.getElementById("btn-med-add");

const detailSheet = document.getElementById("med-detail-sheet");
const detailSheetName = document.getElementById("med-detail-sheet-name");
const detailSheetStatus = document.getElementById("med-detail-sheet-status");
const detailSheetBody = document.getElementById("med-detail-sheet-body");
const btnCloseDetailSheet = document.getElementById("btn-close-med-detail-sheet");
const btnDetailSheetClose = document.getElementById("btn-med-detail-sheet-close");

const addModal = document.getElementById("med-add-modal");
const addLinearPicker = document.getElementById("med-add-linear-picker");
const addColCategoryList = document.getElementById("med-add-col-category-list");
const addColGroup = document.getElementById("med-add-col-group");
const addColGroupList = document.getElementById("med-add-col-group-list");
const addColLeaf = document.getElementById("med-add-col-leaf");
const addColLeafList = document.getElementById("med-add-col-leaf-list");
const addItemsEmpty = document.getElementById("med-add-items-empty");
const addItemAdd = document.getElementById("med-add-item-add");
const addNewItemLabel = document.getElementById("med-add-new-item-label");
const addNewItemInput = document.getElementById("med-add-new-item");
const btnAddNewItem = document.getElementById("btn-med-add-new-item");
const addItemError = document.getElementById("med-add-item-error");
const addCategoryButtons = document.getElementById("med-add-category-buttons");
const addError = document.getElementById("med-add-error");
const btnAddSave = document.getElementById("btn-med-add-save");
const btnAddCancel = document.getElementById("btn-med-add-cancel");
const btnCloseAddModal = document.getElementById("btn-close-med-add");

const eventModal = document.getElementById("med-event-modal");
const eventModalTitle = document.getElementById("med-event-modal-title");
const eventTypeButtons = document.getElementById("med-event-type-buttons");
const eventDate = document.getElementById("med-event-date");
const eventChangeOptions = document.getElementById("med-event-change-options");
const eventFreqCheck = document.getElementById("med-event-freq-check");
const eventAmountCheck = document.getElementById("med-event-amount-check");
const eventFreqBlock = document.getElementById("med-event-freq-block");
const eventAmountBlock = document.getElementById("med-event-amount-block");
const eventAmountPresets = document.getElementById("med-event-amount-presets");
const eventAmountOtherCheck = document.getElementById("med-event-amount-other");
const eventAmountOtherInput = document.getElementById("med-event-amount-other-input");
const eventDetail = document.getElementById("med-event-detail");
const eventError = document.getElementById("med-event-error");
const btnEventSave = document.getElementById("btn-med-event-save");
const btnEventCancel = document.getElementById("btn-med-event-cancel");
const btnCloseEventModal = document.getElementById("btn-close-med-event");

const addFreqEls = {
  detailCol: document.getElementById("med-add-freq-detail"),
  detailHead: document.getElementById("med-add-freq-detail-head"),
  modes: document.getElementById("med-add-freq-modes"),
  presets: document.getElementById("med-add-freq-presets"),
  panelPreset: document.getElementById("med-add-freq-panel-preset"),
  panelEveryN: document.getElementById("med-add-freq-panel-every-n"),
  panelWeekly: document.getElementById("med-add-freq-panel-weekly"),
  panelWeekdays: document.getElementById("med-add-freq-panel-weekdays"),
  panelOther: document.getElementById("med-add-freq-panel-other"),
  everyNPresets: document.getElementById("med-add-freq-every-n-presets"),
  everyNOtherBlock: document.getElementById("med-add-freq-every-n-other"),
  everyNPeriod: document.getElementById("med-add-freq-period"),
  everyNTimes: document.getElementById("med-add-freq-times"),
  everyNNumpad: document.getElementById("med-add-freq-every-n-numpad"),
  weeklyPresets: document.getElementById("med-add-freq-weekly-presets"),
  weekdays: document.getElementById("med-add-freq-weekdays"),
  otherInput: document.getElementById("med-add-freq-other-input"),
};

const eventFreqEls = {
  detailCol: document.getElementById("med-event-freq-detail"),
  detailHead: document.getElementById("med-event-freq-detail-head"),
  modes: document.getElementById("med-event-freq-modes"),
  presets: document.getElementById("med-event-freq-presets"),
  panelPreset: document.getElementById("med-event-freq-panel-preset"),
  panelEveryN: document.getElementById("med-event-freq-panel-every-n"),
  panelWeekly: document.getElementById("med-event-freq-panel-weekly"),
  panelWeekdays: document.getElementById("med-event-freq-panel-weekdays"),
  panelOther: document.getElementById("med-event-freq-panel-other"),
  everyNPresets: document.getElementById("med-event-freq-every-n-presets"),
  everyNOtherBlock: document.getElementById("med-event-freq-every-n-other"),
  everyNPeriod: document.getElementById("med-event-freq-period"),
  everyNTimes: document.getElementById("med-event-freq-times"),
  everyNNumpad: document.getElementById("med-event-freq-every-n-numpad"),
  weeklyPresets: document.getElementById("med-event-freq-weekly-presets"),
  weekdays: document.getElementById("med-event-freq-weekdays"),
  otherInput: document.getElementById("med-event-freq-other-input"),
};

// --- 日付・ステータス -----------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateStr(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function ymdFromStr(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${y}/${Number(m)}/${Number(d)}`;
}

function mdhmFromIso(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function daysBetween(fromStr, toStr) {
  const a = parseDateStr(fromStr);
  const b = parseDateStr(toStr);
  if (!a || !b) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function eventTypeLabel(type) {
  return EVENT_TYPES.find((t) => t.id === type)?.label || type || "";
}

/**
 * 出来事一覧を日付降順（同日なら追加順の新しい方優先）で返す。
 */
export function sortEvents(eventsObj) {
  return Object.entries(eventsObj || {})
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => {
      const rd = (b.date || "").localeCompare(a.date || "");
      if (rd !== 0) return rd;
      return (b.id || "").localeCompare(a.id || "");
    });
}

/**
 * 最新イベントから使用状況を導出する。
 * 使用中 / 休薬中 / 中止（イベントなしは未設定）
 */
export function deriveStatus(drug) {
  const events = sortEvents(drug.events);
  const latest = events[0];
  if (!latest) return { id: "unknown", label: "未設定" };
  if (latest.type === "stop") return { id: "stopped", label: "中止" };
  if (latest.type === "hold") return { id: "hold", label: "休薬中" };
  // 継続・増量・減量・再開 など → 使用中
  return { id: "active", label: "使用中" };
}

/**
 * 処方切れ目安のステータス: "ok" | "approaching" | "overdue"
 * 検査予定タブと同様、7日以内を「近づいている」、超過を「期限超過」とする。
 */
export function getExpiryStatus(expiryEstimate, today = todayStr()) {
  if (!expiryEstimate) return "ok";
  if (today > expiryEstimate) return "overdue";
  const days = daysBetween(today, expiryEstimate);
  if (days != null && days <= APPROACHING_DAYS) return "approaching";
  return "ok";
}

export function hasRecentEvent(drug, today = todayStr()) {
  return sortEvents(drug.events).some((e) => {
    if (!e.date) return false;
    const days = daysBetween(e.date, today);
    return days != null && days >= 0 && days <= RECENT_DAYS;
  });
}

function categoryOrder(cat) {
  return { A: 0, B: 1, C: 2 }[cat] ?? 9;
}

function sortedDrugs(drugs) {
  return [...drugs].sort((a, b) => {
    const c = categoryOrder(a.category) - categoryOrder(b.category);
    if (c !== 0) return c;
    return (a.name || "").localeCompare(b.name || "");
  });
}

// --- 公開API --------------------------------------------------------------

export function initMedsUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  wireToolbar();
  wireDetailSheet();
  wireAddModal();
  wireEventModal();
  buildEventTypeButtons();
  buildAmountPresets();
  buildAddCategoryButtons();
  initFrequencyPickers();
  renderMedLinearPicker();

  state.unsubscribeItems = subscribeMedicationItems((items) => {
    state.medicationItems = items;
    if (addModal && !addModal.hidden) {
      renderMedLinearPicker();
    }
  });
}

export function enterMeds(karteNumber) {
  leaveMeds();
  state.karteNumber = karteNumber;
  state.detailDrugId = null;
  state.unsubscribeDrugs = subscribeMedications(karteNumber, (drugs) => {
    state.drugs = drugs;
    renderMedsList();
    if (isDetailSheetOpen()) {
      const drug = drugs.find((d) => d.id === state.detailDrugId);
      if (drug) renderMedDetailSheet(drug);
      else closeMedDetailSheet();
    }
  });
}

export function leaveMeds() {
  if (state.unsubscribeDrugs) {
    state.unsubscribeDrugs();
    state.unsubscribeDrugs = null;
  }
  state.karteNumber = null;
  state.drugs = [];
  state.detailDrugId = null;
  closeMedDetailSheet();
  closeAddModal();
  closeEventModal();
  if (medsList) medsList.innerHTML = "";
}

// --- 描画 ----------------------------------------------------------------

function renderMedsList() {
  if (!medsList) return;
  medsList.innerHTML = "";
  const drugs = sortedDrugs(state.drugs);
  medsEmpty.hidden = drugs.length > 0;

  // 並びは A→B→C のまま。カテゴリ見出し帯は出さずフラットに並べる
  // （各行右の A/B/C バッジで十分）
  drugs.forEach((drug) => {
    medsList.appendChild(createDrugCard(drug));
  });
}

/**
 * 薬剤名を canvas で描画する。
 * iPad Safari は静的テキスト／::before にも赤いスペル波線を付けることがあるため、
 * テキストノードを持たせず描画する（読み上げは aria-label）。
 */
function fillMedNameEl(nameEl, displayName) {
  nameEl.replaceChildren();
  nameEl.spellcheck = false;
  nameEl.contentEditable = "false";
  nameEl.translate = false;
  nameEl.dataset.name = displayName;
  nameEl.setAttribute("aria-label", displayName);
  nameEl.setAttribute("role", "text");

  const canvas = document.createElement("canvas");
  canvas.className = "med-card__name-canvas";
  canvas.setAttribute("aria-hidden", "true");
  nameEl.appendChild(canvas);

  const paint = () => {
    if (!nameEl.isConnected) return;
    const cs = getComputedStyle(nameEl);
    const maxW = Math.max(0, Math.floor(nameEl.clientWidth));
    if (!maxW) return;

    const dpr = window.devicePixelRatio || 1;
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const fontPx = parseFloat(cs.fontSize) || 14;
    const h = Math.ceil(fontPx * 1.35);

    const probe = canvas.getContext("2d");
    if (!probe) return;
    probe.font = font;

    let text = displayName;
    let width = probe.measureText(text).width;
    if (width > maxW) {
      const ell = "…";
      while (text.length > 0 && probe.measureText(text + ell).width > maxW) {
        text = text.slice(0, -1);
      }
      text += ell;
      width = probe.measureText(text).width;
    }

    const w = Math.max(1, Math.ceil(Math.min(width, maxW)));
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = font;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(text, 0, h / 2);
  };

  const ro = new ResizeObserver(() => paint());
  ro.observe(nameEl);
  requestAnimationFrame(paint);
}

function createDrugCard(drug) {
  const li = document.createElement("li");
  li.className = "med-card";
  li.spellcheck = false;
  li.contentEditable = "false";
  li.dataset.drugId = drug.id;

  const status = deriveStatus(drug);
  const expiryStatus = getExpiryStatus(drug.expiryEstimate);
  const recent = hasRecentEvent(drug);

  if (expiryStatus === "overdue") li.classList.add("is-overdue");
  else if (expiryStatus === "approaching") li.classList.add("is-alert");

  const header = document.createElement("div");
  header.className = "med-card__header";
  header.setAttribute("role", "button");
  header.tabIndex = 0;
  header.spellcheck = false;
  header.setAttribute("aria-haspopup", "dialog");

  const signs = document.createElement("span");
  signs.className = "med-card__signs";
  if (recent) {
    const recentSign = document.createElement("span");
    recentSign.className = "med-sign med-sign--recent";
    recentSign.title = "直近30日以内に出来事あり";
    recentSign.textContent = "●";
    signs.appendChild(recentSign);
  }

  const displayName = drug.name || "（名称未設定）";
  const nameEl = document.createElement("span");
  nameEl.className = "med-card__name";
  fillMedNameEl(nameEl, displayName);

  const statusEl = document.createElement("span");
  statusEl.className = `med-status med-status--${status.id}`;
  statusEl.textContent = status.label;

  const catEl = document.createElement("span");
  catEl.className = `med-cat med-cat--${drug.category}`;
  catEl.textContent = drug.category;

  const chevron = document.createElement("span");
  chevron.className = "med-card__chevron";
  chevron.textContent = "▸";

  header.append(signs, nameEl, statusEl, catEl, chevron);
  li.appendChild(header);

  // 処方切れは行内の短いラベルで示す（詳細はシートへ）
  if (expiryStatus === "overdue" || expiryStatus === "approaching") {
    const inline = document.createElement("span");
    inline.className =
      expiryStatus === "overdue"
        ? "med-inline-status med-inline-status--overdue"
        : "med-inline-status med-inline-status--near";
    if (expiryStatus === "overdue") {
      inline.textContent = "期限超過";
    } else {
      const daysLeft = daysBetween(todayStr(), drug.expiryEstimate);
      inline.textContent =
        daysLeft === 0 ? "本日まで" : `あと${daysLeft}日`;
    }
    nameEl.after(inline);
  }

  const openDetail = () => openMedDetailSheet(drug);

  header.addEventListener("keydown", (e) => {
    // Space は IME 漢字変換の候補送りと衝突するため使わない（Enter のみ）。
    if (e.key !== "Enter") return;
    if (!canHandleShortcut(e)) return;
    e.preventDefault();
    openDetail();
  });

  enableRowGestures(li, {
    actions: [
      {
        action: "edit",
        title: "詳細",
        onClick: openDetail,
      },
      {
        action: "delete",
        title: "削除",
        onClick: async () => {
          const ok = window.confirm(
            `薬剤「${drug.name}」を削除しますか？履歴もまとめて削除されます。`
          );
          if (!ok) return;
          try {
            await deleteMedication(state.karteNumber, drug.id);
            if (state.detailDrugId === drug.id) closeMedDetailSheet();
            deps.showToast("薬剤を削除しました。");
          } catch (err) {
            console.error(err);
            deps.showToast("削除に失敗しました。", { isError: true });
          }
        },
      },
    ],
    onActivate: openDetail,
  });

  return li;
}

function isDetailSheetOpen() {
  return Boolean(detailSheet && !detailSheet.hidden && state.detailDrugId);
}

function wireDetailSheet() {
  btnCloseDetailSheet?.addEventListener("click", closeMedDetailSheet);
  btnDetailSheetClose?.addEventListener("click", closeMedDetailSheet);
  detailSheet
    ?.querySelector("[data-close-modal]")
    ?.addEventListener("click", closeMedDetailSheet);
}

function openMedDetailSheet(drug) {
  if (!drug?.id || !detailSheet) return;
  state.detailDrugId = drug.id;
  renderMedDetailSheet(drug);
  detailSheet.hidden = false;
}

function closeMedDetailSheet() {
  state.detailDrugId = null;
  if (detailSheetBody) detailSheetBody.innerHTML = "";
  if (detailSheetName) detailSheetName.textContent = "";
  if (detailSheetStatus) detailSheetStatus.textContent = "";
  if (detailSheet) detailSheet.hidden = true;
}

function renderMedDetailSheet(drug) {
  if (!drug || !detailSheetBody) return;
  const status = deriveStatus(drug);
  if (detailSheetName) {
    detailSheetName.textContent = drug.name || "（名称未設定）";
  }
  if (detailSheetStatus) {
    const expiryStatus = getExpiryStatus(drug.expiryEstimate);
    const bits = [`使用状況: ${status.label}`, `重要度: ${drug.category || "—"}`];
    if (expiryStatus === "overdue") bits.push("期限超過");
    else if (expiryStatus === "approaching") {
      const daysLeft = daysBetween(todayStr(), drug.expiryEstimate);
      bits.push(
        daysLeft === 0 ? "本日まで" : `あと${daysLeft}日`
      );
    }
    detailSheetStatus.textContent = bits.join(" · ");
  }
  detailSheetBody.replaceChildren(createDrugDetail(drug));
}

function createDrugDetail(drug) {
  const detail = document.createElement("div");
  detail.className = "med-sheet__detail";

  // 重要度（A/B/C）切替
  const catRow = document.createElement("div");
  catRow.className = "med-detail-row";
  const catLabel = document.createElement("span");
  catLabel.className = "label";
  catLabel.textContent = "重要度";
  const catBtns = document.createElement("div");
  catBtns.className = "med-category-buttons";
  ["A", "B", "C"].forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `med-cat-btn med-cat--${cat}`;
    btn.textContent = cat;
    btn.classList.toggle("is-selected", drug.category === cat);
    btn.title =
      cat === "A"
        ? "治療の主力"
        : cat === "B"
          ? "補助的"
          : "過去に使った程度";
    btn.addEventListener("click", async () => {
      try {
        await updateMedication(state.karteNumber, drug.id, { category: cat });
        deps.showToast(`重要度を ${cat} に変更しました。`);
      } catch (err) {
        console.error(err);
        deps.showToast("重要度の更新に失敗しました。", { isError: true });
      }
    });
    catBtns.appendChild(btn);
  });
  catRow.append(catLabel, catBtns);
  detail.appendChild(catRow);

  // 副作用メモ
  const seBlock = document.createElement("div");
  seBlock.className = "field";
  const seLabel = document.createElement("label");
  seLabel.className = "label";
  seLabel.textContent = "副作用・問題メモ";
  const seInput = document.createElement("textarea");
  seInput.className = "textarea";
  seInput.rows = 2;
  seInput.placeholder = "任意";
  seInput.value = drug.sideEffectNote || "";
  const seSave = document.createElement("button");
  seSave.type = "button";
  seSave.className = "btn btn--small btn--outline";
  seSave.textContent = "メモを保存";
  seSave.addEventListener("click", async () => {
    try {
      await updateMedication(state.karteNumber, drug.id, {
        sideEffectNote: seInput.value.trim(),
      });
      deps.showToast("メモを保存しました。");
    } catch (err) {
      console.error(err);
      deps.showToast("保存に失敗しました。", { isError: true });
    }
  });
  seBlock.append(seLabel, seInput, seSave);
  detail.appendChild(seBlock);

  // 処方切れ目安（カレンダー確定＝即保存。クイック／保存ボタンなし）
  const expBlock = document.createElement("div");
  expBlock.className = "field";
  const expLabel = document.createElement("label");
  expLabel.className = "label";
  expLabel.textContent = "効果／処方の目安期限（任意）";
  const expRow = document.createElement("div");
  expRow.className = "med-expiry-row";
  const expInput = document.createElement("input");
  expInput.type = "date";
  expInput.className = "input input--date";
  expInput.value = drug.expiryEstimate || "";
  let savingExpiry = false;
  const saveExpiryEstimate = async (value, { cleared = false } = {}) => {
    if (savingExpiry) return;
    const next = value || "";
    if (next === (drug.expiryEstimate || "")) return;
    savingExpiry = true;
    try {
      await updateMedication(state.karteNumber, drug.id, {
        expiryEstimate: next,
      });
      deps.showToast(
        cleared ? "処方切れ目安をクリアしました。" : "処方切れ目安を保存しました。"
      );
    } catch (err) {
      console.error(err);
      deps.showToast(
        cleared ? "クリアに失敗しました。" : "保存に失敗しました。",
        { isError: true }
      );
      expInput.value = drug.expiryEstimate || "";
    } finally {
      savingExpiry = false;
    }
  };
  // ネイティブ日付ピッカーで日付を選び ✅ 確定したとき（change）に保存
  expInput.addEventListener("change", () => {
    void saveExpiryEstimate(expInput.value);
  });
  const expClear = document.createElement("button");
  expClear.type = "button";
  expClear.className = "btn btn--small btn--outline med-expiry-clear";
  expClear.textContent = "クリア";
  expClear.addEventListener("click", async () => {
    expInput.value = "";
    await saveExpiryEstimate("", { cleared: true });
  });
  expRow.append(expInput, expClear);
  expBlock.append(expLabel, expRow);
  if (drug.expiryEstimate) {
    const note = document.createElement("p");
    note.className = "field__note";
    const status = getExpiryStatus(drug.expiryEstimate);
    const daysLeft = daysBetween(todayStr(), drug.expiryEstimate);
    let extra = "";
    if (status === "overdue") extra = "（期限超過）";
    else if (daysLeft === 0) extra = "（本日まで）";
    else if (daysLeft != null) extra = `（あと${daysLeft}日）`;
    note.textContent = `現在の目安: ${ymdFromStr(drug.expiryEstimate)}${extra}`;
    if (status === "overdue") note.classList.add("med-expiry-note--overdue");
    else if (status === "approaching") note.classList.add("med-expiry-note--near");
    expBlock.appendChild(note);
  }
  detail.appendChild(expBlock);

  // 出来事の種類（詳細シート上で明示的に選ぶ）
  const eventQuick = document.createElement("div");
  eventQuick.className = "field med-event-quick";
  const eventQuickLabel = document.createElement("span");
  eventQuickLabel.className = "label";
  eventQuickLabel.textContent = "出来事を記録";
  const eventQuickNote = document.createElement("p");
  eventQuickNote.className = "field__note";
  eventQuickNote.textContent =
    "種類を選ぶと、日付・頻度などの入力画面が開きます。";
  const eventQuickBtns = document.createElement("div");
  eventQuickBtns.className = "exam-item-buttons med-event-quick__buttons";
  eventQuickBtns.setAttribute("role", "group");
  eventQuickBtns.setAttribute("aria-label", "出来事の種類");
  EVENT_TYPES.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn med-event-quick__btn";
    btn.dataset.type = t.id;
    btn.textContent = t.label;
    btn.addEventListener("click", () => {
      openEventModal(drug.id, null, { type: t.id });
    });
    eventQuickBtns.appendChild(btn);
  });
  eventQuick.append(eventQuickLabel, eventQuickBtns, eventQuickNote);
  detail.appendChild(eventQuick);

  // 出来事履歴
  const histHead = document.createElement("div");
  histHead.className = "exam-section__head";
  const histTitle = document.createElement("h4");
  histTitle.className = "exam-section__title";
  histTitle.textContent = "出来事の履歴";
  histHead.appendChild(histTitle);
  detail.appendChild(histHead);

  const events = sortEvents(drug.events);
  if (events.length === 0) {
    const empty = document.createElement("p");
    empty.className = "field__note";
    empty.textContent = "まだ出来事がありません。";
    detail.appendChild(empty);
  } else {
    const ul = document.createElement("ul");
    ul.className = "exam-list";
    events.forEach((ev) => {
      ul.appendChild(createEventItem(drug, ev));
    });
    detail.appendChild(ul);
  }

  return detail;
}

function createEventItem(drug, ev) {
  const li = document.createElement("li");
  li.className = "exam-list-item";

  const info = document.createElement("div");
  info.className = "exam-list-item__info";
  const title = document.createElement("div");
  title.className = "exam-list-item__title";
  title.textContent = `${ymdFromStr(ev.date)}　${eventTypeLabel(ev.type)}`;
  const meta = document.createElement("div");
  meta.className = "exam-list-item__meta";
  const parts = [];
  const freqText = eventFrequencyText(ev);
  if (freqText) parts.push(`回数: ${freqText}`);
  if (ev.amountChange) parts.push(`量: ${ev.amountChange}`);
  if (ev.detail) parts.push(ev.detail);
  if (ev.changedBy) parts.push(`記入: ${ev.changedBy}`);
  if (ev.lastEditedAt) {
    const when = mdhmFromIso(ev.lastEditedAt);
    const by = ev.lastEditedBy ? `・${ev.lastEditedBy}` : "";
    parts.push(`最終編集 ${when}${by}`);
  }
  meta.textContent = parts.join("　") || "—";
  info.append(title, meta);
  li.appendChild(info);

  enableRowGestures(li, {
    actions: [
      {
        action: "edit",
        title: "編集",
        onClick: () => openEventModal(drug.id, ev),
      },
      {
        action: "delete",
        title: "削除",
        onClick: async () => {
          const ok = window.confirm(
            "この出来事を削除しますか？（入力ミスの訂正向けです）"
          );
          if (!ok) return;
          try {
            await deleteMedicationEvent(state.karteNumber, drug.id, ev.id);
            deps.showToast("出来事を削除しました。");
          } catch (err) {
            console.error(err);
            deps.showToast("削除に失敗しました。", { isError: true });
          }
        },
      },
    ],
    onActivate: () => openEventModal(drug.id, ev),
  });
  return li;
}

// --- ツールバー -----------------------------------------------------------

function wireToolbar() {
  btnMedAdd?.addEventListener("click", openAddModal);
}

// --- 薬剤追加モーダル -----------------------------------------------------

function initFrequencyPickers() {
  addFreqPicker = bindFrequencyPicker(addFreqEls, {
    getDraft: () => state.addDraft.freq,
    setDraft: (next) => {
      state.addDraft.freq = next;
    },
    getPresets: () => FREQ_PRESETS_ABSOLUTE,
    showError: (msg) => deps.showError(addError, msg),
  });
  addFreqPicker.init();

  eventFreqPicker = bindFrequencyPicker(eventFreqEls, {
    getDraft: () => state.eventDraft.freq,
    setDraft: (next) => {
      state.eventDraft.freq = next;
    },
    getPresets: () => FREQ_PRESETS_ABSOLUTE,
    showError: (msg) => deps.showError(eventError, msg),
  });
  eventFreqPicker.init();
}

function isMedGroup(item) {
  return normalizeMedicationItemKind(item?.kind) === "group";
}

function categorySupportsMedMidGroups(category) {
  return category === "oral" || category === "topical";
}

function activeMedCategoryId() {
  const raw = state.medItemCategory;
  if (raw == null || raw === "") return null;
  return normalizeMedicationItemCategory(raw);
}

function itemsInMedCategory(category) {
  const cat = normalizeMedicationItemCategory(category);
  return state.medicationItems.filter(
    (item) => normalizeMedicationItemCategory(item.category) === cat
  );
}

function medGroupsForCategory(category) {
  return itemsInMedCategory(category).filter((item) => isMedGroup(item));
}

function medLeavesForPicker() {
  const cat = activeMedCategoryId();
  if (!cat) return [];
  const items = itemsInMedCategory(cat);
  if (!categorySupportsMedMidGroups(cat)) {
    return items.filter((item) => !isMedGroup(item));
  }
  if (!state.medItemParentId) return [];
  return items.filter(
    (item) => !isMedGroup(item) && (item.parentId || "") === state.medItemParentId
  );
}

function canAddMedicationLeaf() {
  const cat = activeMedCategoryId();
  if (!cat) return false;
  if (!categorySupportsMedMidGroups(cat)) return true;
  return Boolean(state.medItemParentId);
}

function createMedLinearItemButton({ label, selected, onClick }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "med-linear-picker__item";
  btn.setAttribute("role", "option");
  btn.setAttribute("aria-selected", String(Boolean(selected)));
  btn.classList.toggle("is-selected", Boolean(selected));

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

/** active=操作可 / placeholder=枠だけ確保 / absent=列ごと非表示（2列レイアウト用） */
function setMedLinearColState(col, mode) {
  if (!col) return;
  if (mode === "absent") {
    col.hidden = true;
    col.classList.remove("is-placeholder");
    col.setAttribute("aria-hidden", "true");
    return;
  }
  col.hidden = false;
  col.classList.toggle("is-placeholder", mode === "placeholder");
  col.setAttribute("aria-hidden", mode === "placeholder" ? "true" : "false");
}

function fillMedLinearPlaceholder(listEl, message) {
  if (!listEl) return;
  listEl.innerHTML = "";
  const hint = document.createElement("p");
  hint.className = "med-linear-picker__hint";
  hint.textContent = message;
  listEl.appendChild(hint);
}

function wireAddModal() {
  btnCloseAddModal?.addEventListener("click", closeAddModal);
  btnAddCancel?.addEventListener("click", closeAddModal);
  addModal?.querySelector("[data-close-modal]")?.addEventListener("click", closeAddModal);
  btnAddSave?.addEventListener("click", handleAddSave);
  btnAddNewItem?.addEventListener("click", handleAddMedicationItemFromModal);
  addNewItemInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !isImeKey(e)) {
      e.preventDefault();
      handleAddMedicationItemFromModal();
    }
  });
}

function buildAddCategoryButtons() {
  if (!addCategoryButtons) return;
  addCategoryButtons.innerHTML = "";
  [
    { id: "A", hint: "治療の主力" },
    { id: "B", hint: "補助的" },
    { id: "C", hint: "過去に使った程度" },
  ].forEach(({ id, hint }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `med-cat-btn med-cat--${id}`;
    btn.textContent = `${id}（${hint}）`;
    btn.dataset.category = id;
    btn.addEventListener("click", () => {
      state.addDraft.category = id;
      renderAddCategorySelection();
    });
    addCategoryButtons.appendChild(btn);
  });
}

function renderAddCategorySelection() {
  addCategoryButtons?.querySelectorAll(".med-cat-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.category === state.addDraft.category);
  });
}

function updateMedLeafAddUI() {
  const category = activeMedCategoryId();
  const showLeaf = canAddMedicationLeaf();
  const parent = state.medItemParentId
    ? state.medicationItems.find((item) => item.id === state.medItemParentId)
    : null;
  const label = category ? medicationItemCategoryLabel(category) : "";

  if (addNewItemLabel) {
    addNewItemLabel.textContent = parent
      ? `新しい薬剤を追加（${parent.label || label}）`
      : label
        ? `新しい薬剤を追加（${label}）`
        : "新しい薬剤を追加";
  }
  if (addNewItemInput) {
    addNewItemInput.placeholder =
      category === "eye"
        ? "例）ヒアレイン"
        : category === "topical"
          ? "例）イソジン"
          : category === "inject"
            ? "例）セファゾリン"
            : "例）アモキシシリン";
  }
  if (addItemsEmpty) {
    addItemsEmpty.textContent =
      "この分類にはまだ薬剤がありません。下で追加できます。";
  }
  if (addItemAdd) addItemAdd.hidden = !showLeaf;
}

function renderMedLinearPicker() {
  const category = activeMedCategoryId();
  const usesMid = Boolean(category && categorySupportsMedMidGroups(category));
  const midState = !category ? "placeholder" : usesMid ? "active" : "absent";
  const leafState = !category
    ? "placeholder"
    : usesMid && !state.medItemParentId
      ? "placeholder"
      : "active";
  const colCount = midState === "absent" ? "2" : "3";

  if (addLinearPicker) addLinearPicker.dataset.cols = colCount;
  setMedLinearColState(addColGroup, midState);
  setMedLinearColState(addColLeaf, leafState);

  if (addColCategoryList) {
    addColCategoryList.innerHTML = "";
    MEDICATION_ITEM_CATEGORIES.forEach((cat) => {
      addColCategoryList.appendChild(
        createMedLinearItemButton({
          label: cat.label,
          selected: category === cat.id,
          onClick: () => {
            const changed = state.medItemCategory !== cat.id;
            state.medItemCategory = cat.id;
            if (changed) {
              state.medItemParentId = null;
              state.addDraft.name = "";
            }
            renderMedLinearPicker();
          },
        })
      );
    });
  }

  if (addColGroupList) {
    if (midState === "placeholder") {
      fillMedLinearPlaceholder(addColGroupList, "大項目を選ぶと表示されます");
    } else if (midState === "active") {
      addColGroupList.innerHTML = "";
      medGroupsForCategory(category).forEach((group) => {
        addColGroupList.appendChild(
          createMedLinearItemButton({
            label: group.label,
            selected: state.medItemParentId === group.id,
            onClick: () => {
              const changed = state.medItemParentId !== group.id;
              state.medItemParentId = group.id;
              if (changed) state.addDraft.name = "";
              renderMedLinearPicker();
            },
          })
        );
      });
    } else {
      addColGroupList.innerHTML = "";
    }
  }

  if (addColLeafList) {
    if (leafState === "placeholder") {
      fillMedLinearPlaceholder(
        addColLeafList,
        category ? "中項目を選ぶと表示されます" : "大項目を選ぶと表示されます"
      );
      if (addItemsEmpty) addItemsEmpty.hidden = true;
    } else {
      addColLeafList.innerHTML = "";
      const leaves = medLeavesForPicker();
      if (addItemsEmpty) addItemsEmpty.hidden = leaves.length > 0;
      leaves.forEach((item) => {
        addColLeafList.appendChild(
          createMedLinearItemButton({
            label: item.label,
            selected: state.addDraft.name === item.label,
            onClick: () => {
              state.addDraft.name = item.label;
              renderMedLinearPicker();
            },
          })
        );
      });
    }
  }

  updateMedLeafAddUI();
}

/**
 * 薬剤追加モーダル内でマスタへ新規追加し、その薬剤を選択する。
 * 内服薬・外用薬は中項目内、注射薬・点眼薬は大分類直下に追加する。
 */
async function handleAddMedicationItemFromModal() {
  const category = activeMedCategoryId();
  if (!category || !canAddMedicationLeaf()) return;

  const label = addNewItemInput?.value.trim() || "";
  if (!label) {
    deps.showError(addItemError, "薬剤名を入力してください。");
    return;
  }

  const parentId =
    categorySupportsMedMidGroups(category) && state.medItemParentId
      ? state.medItemParentId
      : "";

  const exists = state.medicationItems.find(
    (item) =>
      (item.label || "").trim() === label &&
      normalizeMedicationItemCategory(item.category) === category &&
      !isMedGroup(item)
  );
  if (exists) {
    state.medItemCategory = normalizeMedicationItemCategory(exists.category);
    state.medItemParentId = exists.parentId || null;
    state.addDraft.name = label;
    if (addNewItemInput) addNewItemInput.value = "";
    deps.showError(addItemError, "");
    renderMedLinearPicker();
    deps.showToast("既存の薬剤を選択しました。");
    return;
  }

  deps.showError(addItemError, "");
  deps.setBusy(btnAddNewItem, true, "追加中...", "追加");
  try {
    await addMedicationItem({
      label,
      category,
      kind: "leaf",
      parentId,
    });
    state.addDraft.name = label;
    if (addNewItemInput) addNewItemInput.value = "";
    renderMedLinearPicker();
    deps.showToast(
      `「${label}」を${medicationItemCategoryLabel(category)}に追加しました。`
    );
  } catch (err) {
    console.error(err);
    deps.showError(addItemError, "追加に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnAddNewItem, false, "追加中...", "追加");
  }
}

function openAddModal() {
  state.addDraft = {
    name: "",
    category: "A",
    freq: createEmptyFreqDraft(null),
  };
  state.medItemCategory = null;
  state.medItemParentId = null;
  if (addNewItemInput) addNewItemInput.value = "";
  deps.showError(addItemError, "");
  if (addFreqEls.otherInput) addFreqEls.otherInput.value = "";
  deps.showError(addError, "");
  renderMedLinearPicker();
  renderAddCategorySelection();
  addFreqPicker?.render();
  addModal.hidden = false;
}

function closeAddModal() {
  if (addModal) addModal.hidden = true;
}

async function handleAddSave() {
  const name = (state.addDraft.name || "").trim();
  if (!name) {
    deps.showError(addError, "薬剤名を選ぶか、新しい薬剤を追加してください。");
    return;
  }

  const freqResolved = resolveFrequencyDraft(state.addDraft.freq, { required: false });
  if (!freqResolved.ok) {
    deps.showError(addError, freqResolved.message);
    return;
  }

  // 同名の重複チェック（警告のみ）
  if (state.drugs.some((d) => d.name === name)) {
    const ok = window.confirm(
      `「${name}」はすでに登録されています。それでも追加しますか？`
    );
    if (!ok) return;
  }

  deps.showError(addError, "");
  deps.setBusy(btnAddSave, true, "保存中...", "追加する");
  try {
    await addMedication(state.karteNumber, {
      name,
      category: state.addDraft.category,
      changedBy: deps.getSelectedAuthor() || "",
      eventDate: todayStr(),
      frequencyChange: freqResolved.frequencyChange || "",
      frequency: freqResolved.frequency || null,
    });
    closeAddModal();
    deps.showToast("薬剤を追加しました。");
  } catch (err) {
    console.error(err);
    deps.showError(addError, "追加に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnAddSave, false, "保存中...", "追加する");
  }
}

// --- 出来事追加モーダル ---------------------------------------------------

function wireEventModal() {
  btnCloseEventModal?.addEventListener("click", closeEventModal);
  btnEventCancel?.addEventListener("click", closeEventModal);
  eventModal?.querySelector("[data-close-modal]")?.addEventListener("click", closeEventModal);
  btnEventSave?.addEventListener("click", handleEventSave);

  eventFreqCheck?.addEventListener("change", () => {
    state.eventDraft.changeFrequency = eventFreqCheck.checked;
    eventFreqBlock.hidden = !eventFreqCheck.checked;
    if (eventFreqCheck.checked) eventFreqPicker?.render();
  });
  eventAmountCheck?.addEventListener("change", () => {
    state.eventDraft.changeAmount = eventAmountCheck.checked;
    eventAmountBlock.hidden = !eventAmountCheck.checked;
    if (eventAmountCheck.checked) renderAmountPresets();
  });
  eventAmountOtherCheck?.addEventListener("change", () => {
    eventAmountOtherInput.hidden = !eventAmountOtherCheck.checked;
    if (eventAmountOtherCheck.checked) {
      state.eventDraft.amountPreset = "";
      renderAmountPresets();
      eventAmountOtherInput.focus();
    } else {
      state.eventDraft.amountOther = "";
      if (eventAmountOtherInput) eventAmountOtherInput.value = "";
      renderAmountPresets();
    }
  });
  eventAmountOtherInput?.addEventListener("input", () => {
    state.eventDraft.amountOther = eventAmountOtherInput.value;
  });
}

function buildEventTypeButtons() {
  if (!eventTypeButtons) return;
  eventTypeButtons.innerHTML = "";
  EVENT_TYPES.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exam-item-btn";
    btn.dataset.type = t.id;
    btn.textContent = t.label;
    btn.addEventListener("click", () => {
      state.eventDraft.type = t.id;
      renderEventTypeSelection();
      applyEventChangeOptionsVisibility();
    });
    eventTypeButtons.appendChild(btn);
  });
}

function applyEventChangeOptionsVisibility() {
  const type = state.eventDraft.type;
  const isEdit = state.eventDraft.mode === "edit";
  const needsChange = type === "increase" || type === "decrease";

  if (isEdit) {
    // 編集時は種別を問わず頻度・量を直せる（入力ミス訂正用）
    eventChangeOptions.hidden = false;
    return;
  }

  eventChangeOptions.hidden = !needsChange;
  if (!needsChange) {
    eventFreqCheck.checked = false;
    eventAmountCheck.checked = false;
    eventFreqBlock.hidden = true;
    eventAmountBlock.hidden = true;
    state.eventDraft.changeFrequency = false;
    state.eventDraft.changeAmount = false;
    return;
  }

  // 増量・減量は頻度リニア選択をすぐ表示
  eventFreqCheck.checked = true;
  eventFreqBlock.hidden = false;
  state.eventDraft.changeFrequency = true;
  eventFreqPicker?.render();
}

function renderEventTypeSelection() {
  eventTypeButtons?.querySelectorAll(".exam-item-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.type === state.eventDraft.type);
  });
}

function buildAmountPresets() {
  renderAmountPresets();
}

function renderAmountPresets() {
  if (!eventAmountPresets) return;
  eventAmountPresets.innerHTML = "";
  const selected = state.eventDraft.amountPreset || "";
  const useOther = Boolean(eventAmountOtherCheck?.checked);
  AMOUNT_PRESETS.forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "med-linear-picker__item";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", String(!useOther && selected === label));
    btn.classList.toggle("is-selected", !useOther && selected === label);

    const text = document.createElement("span");
    text.className = "med-linear-picker__item-label";
    text.textContent = label;

    const check = document.createElement("span");
    check.className = "med-linear-picker__check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";

    btn.append(text, check);
    btn.addEventListener("click", () => {
      if (eventAmountOtherCheck) eventAmountOtherCheck.checked = false;
      if (eventAmountOtherInput) {
        eventAmountOtherInput.hidden = true;
        eventAmountOtherInput.value = "";
      }
      state.eventDraft.amountPreset = label;
      state.eventDraft.amountOther = "";
      renderAmountPresets();
    });
    eventAmountPresets.appendChild(btn);
  });
}

function openEventModal(drugId, eventToEdit = null, options = {}) {
  const drug = state.drugs.find((d) => d.id === drugId);
  const isEdit = Boolean(eventToEdit);
  const preferredType =
    options?.type && EVENT_TYPES.some((t) => t.id === options.type)
      ? options.type
      : null;

  if (isEdit) {
    const hasFreq = Boolean(eventFrequencyText(eventToEdit) || eventToEdit.frequencyChange);
    const hasAmount = Boolean(eventToEdit.amountChange);
    let amountPreset = "";
    let amountOther = "";
    let useAmountOther = false;
    if (hasAmount) {
      if (AMOUNT_PRESETS.includes(eventToEdit.amountChange)) {
        amountPreset = eventToEdit.amountChange;
      } else {
        useAmountOther = true;
        amountOther = eventToEdit.amountChange;
      }
    }

    state.eventDraft = {
      mode: "edit",
      drugId,
      eventId: eventToEdit.id,
      type: eventToEdit.type || "add",
      date: eventToEdit.date || todayStr(),
      changeFrequency: hasFreq,
      changeAmount: hasAmount,
      freq: freqDraftFromEvent(eventToEdit),
      amountPreset,
      amountOther,
      detail: eventToEdit.detail || "",
    };

    eventModalTitle.textContent = `出来事を編集 — ${drug?.name || ""}`;
    eventDate.value = state.eventDraft.date;
    eventDetail.value = state.eventDraft.detail;
    eventFreqCheck.checked = hasFreq;
    eventAmountCheck.checked = hasAmount;
    eventFreqBlock.hidden = !hasFreq;
    eventAmountBlock.hidden = !hasAmount;
    eventAmountOtherCheck.checked = useAmountOther;
    eventAmountOtherInput.hidden = !useAmountOther;
    eventAmountOtherInput.value = amountOther;
    if (eventFreqEls.otherInput) {
      eventFreqEls.otherInput.value = state.eventDraft.freq.other || "";
    }
  } else {
    const type = preferredType || "add";
    const needsFreq = type === "increase" || type === "decrease";
    state.eventDraft = {
      mode: "create",
      drugId,
      eventId: null,
      type,
      date: todayStr(),
      changeFrequency: needsFreq,
      changeAmount: false,
      freq: createEmptyFreqDraft(null),
      amountPreset: "",
      amountOther: "",
      detail: "",
    };
    const typeLabel = eventTypeLabel(type);
    eventModalTitle.textContent = `${typeLabel}を記録 — ${drug?.name || ""}`;
    eventDate.value = todayStr();
    eventDetail.value = "";
    eventFreqCheck.checked = needsFreq;
    eventAmountCheck.checked = false;
    eventFreqBlock.hidden = !needsFreq;
    eventAmountBlock.hidden = true;
    eventAmountOtherCheck.checked = false;
    eventAmountOtherInput.hidden = true;
    eventAmountOtherInput.value = "";
    if (eventFreqEls.otherInput) eventFreqEls.otherInput.value = "";
  }

  deps.showError(eventError, "");
  renderEventTypeSelection();
  renderAmountPresets();
  applyEventChangeOptionsVisibility();
  // 増量・減量は頻度入力をすぐ使えるようにする
  if (
    state.eventDraft.mode === "create" &&
    (state.eventDraft.type === "increase" || state.eventDraft.type === "decrease")
  ) {
    eventChangeOptions.hidden = false;
    eventFreqCheck.checked = true;
    eventFreqBlock.hidden = false;
    state.eventDraft.changeFrequency = true;
  }
  eventFreqPicker?.render();
  eventModal.hidden = false;
}

function closeEventModal() {
  if (eventModal) eventModal.hidden = true;
  state.eventDraft.mode = "create";
  state.eventDraft.eventId = null;
}

async function handleEventSave() {
  const draft = state.eventDraft;
  const date = eventDate.value;
  const type = draft.type;
  const isEdit = draft.mode === "edit" && draft.eventId;
  if (!date) {
    deps.showError(eventError, "日付を選択してください。");
    return;
  }
  if (!type) {
    deps.showError(eventError, "出来事の種類を選択してください。");
    return;
  }

  let frequencyChange = "";
  let frequency = null;
  let amountChange = "";

  if (isEdit) {
    // 編集: チェックONなら必須、OFFならクリア
    if (eventFreqCheck.checked) {
      const freqResolved = resolveFrequencyDraft(draft.freq, { required: true });
      if (!freqResolved.ok || freqResolved.empty) {
        deps.showError(
          eventError,
          freqResolved.message || "回数の内容を選ぶか入力してください。"
        );
        return;
      }
      frequencyChange = freqResolved.frequencyChange;
      frequency = freqResolved.frequency;
    } else {
      frequencyChange = "";
      frequency = null;
    }
    if (eventAmountCheck.checked) {
      amountChange = eventAmountOtherCheck.checked
        ? eventAmountOtherInput.value.trim()
        : draft.amountPreset;
      if (!amountChange) {
        deps.showError(eventError, "量変更の内容を選ぶか入力してください。");
        return;
      }
    } else {
      amountChange = "";
    }
  } else if (type === "increase" || type === "decrease") {
    if (eventFreqCheck.checked) {
      const freqResolved = resolveFrequencyDraft(draft.freq, { required: true });
      if (!freqResolved.ok || freqResolved.empty) {
        deps.showError(
          eventError,
          freqResolved.message || "回数変更の内容を選ぶか入力してください。"
        );
        return;
      }
      frequencyChange = freqResolved.frequencyChange;
      frequency = freqResolved.frequency;
    }
    if (eventAmountCheck.checked) {
      amountChange = eventAmountOtherCheck.checked
        ? eventAmountOtherInput.value.trim()
        : draft.amountPreset;
      if (!amountChange) {
        deps.showError(eventError, "量変更の内容を選ぶか入力してください。");
        return;
      }
    }
  }

  deps.showError(eventError, "");
  deps.setBusy(btnEventSave, true, "保存中...", "保存する");
  try {
    if (isEdit) {
      await updateMedicationEvent(
        state.karteNumber,
        draft.drugId,
        draft.eventId,
        {
          date,
          type,
          detail: eventDetail.value.trim(),
          frequencyChange,
          frequency,
          amountChange,
        },
        deps.getSelectedAuthor() || ""
      );
      closeEventModal();
      deps.showToast("編集内容を保存しました。");
    } else {
      await addMedicationEvent(state.karteNumber, draft.drugId, {
        date,
        type,
        detail: eventDetail.value.trim(),
        frequencyChange,
        frequency,
        amountChange,
        changedBy: deps.getSelectedAuthor() || "",
      });
      closeEventModal();
      deps.showToast("出来事を追加しました。");
    }
  } catch (err) {
    console.error(err);
    deps.showError(eventError, "保存に失敗しました。もう一度お試しください。");
  } finally {
    deps.setBusy(btnEventSave, false, "保存中...", "保存する");
  }
}

/**
 * AI提案フロー: 薬剤名だけの登録（増減・頻度は付けない）。
 * 未登録なら新規追加、既存なら drugId を返す。
 */
export async function ensureMedicationNameFromExternal(
  karteNumber,
  { name, changedBy, eventDate }
) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("薬剤名が空です。");
  const drugs = await fetchMedicationsOnce(karteNumber);
  const existing = drugs.find((d) => d.name === trimmed);
  if (existing) {
    return { drugId: existing.id, created: false, name: trimmed };
  }
  const drugId = await addMedication(karteNumber, {
    name: trimmed,
    category: "A",
    changedBy: changedBy || "",
    eventDate: eventDate || todayStr(),
    frequencyChange: "",
    frequency: null,
  });
  return { drugId, created: true, name: trimmed };
}

/**
 * 薬剤詳細シートを開いて目立たせる。
 */
export function focusMedicationByName(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return false;
  const drug = state.drugs.find((d) => d.name === trimmed);
  if (!drug) return false;
  openMedDetailSheet(drug);
  return true;
}

/**
 * AI提案フローなど外部からの薬剤登録・出来事追加。
 */
export async function applyMedicationSuggestionFromExternal(karteNumber, payload = {}) {
  const name = (payload.name || "").trim();
  if (!name) throw new Error("薬剤名が空です。");

  const action = payload.action || "add";
  const category = ["A", "B", "C"].includes(payload.category) ? payload.category : "B";
  const frequencyChange = payload.frequencyChange || "";
  const frequency = payload.frequency || null;
  const detail = payload.detail || "";
  const changedBy = payload.changedBy || "";
  const eventDate = payload.eventDate || todayStr();
  const expiryEstimate = payload.expiryEstimate || "";

  const drugs = await fetchMedicationsOnce(karteNumber);
  const existing = drugs.find((d) => d.name === name);

  if (!existing || action === "add") {
    if (existing && action === "add") {
      await addMedicationEvent(karteNumber, existing.id, {
        date: eventDate,
        type: "add",
        detail: detail || "開始／継続",
        frequencyChange,
        frequency,
        amountChange: "",
        changedBy,
      });
      if (expiryEstimate) {
        await updateMedication(karteNumber, existing.id, { expiryEstimate });
      }
      return existing.id;
    }
    return addMedication(karteNumber, {
      name,
      category,
      expiryEstimate,
      changedBy,
      eventDate,
      frequencyChange,
      frequency,
    });
  }

  const type = ["increase", "decrease", "hold", "stop", "resume", "add"].includes(
    action
  )
    ? action
    : "add";
  await addMedicationEvent(karteNumber, existing.id, {
    date: eventDate,
    type,
    detail,
    frequencyChange,
    frequency,
    amountChange: payload.amountChange || "",
    changedBy,
  });
  if (expiryEstimate) {
    await updateMedication(karteNumber, existing.id, { expiryEstimate });
  }
  return existing.id;
}
