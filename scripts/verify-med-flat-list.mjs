/**
 * 薬剤一覧からカテゴリ見出し帯が消え、A→B→C のフラット並びになることを検証する。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const mockDb = `
export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" },
  { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" },
  { id: "eye", label: "点眼薬" },
];
const CATEGORY_IDS = new Set(MEDICATION_ITEM_CATEGORIES.map((c) => c.id));
export function normalizeMedicationItemCategory(category) {
  const id = String(category || "").trim();
  return CATEGORY_IDS.has(id) ? id : "oral";
}
export function normalizeMedicationItemKind(kind) {
  return String(kind || "").trim() === "group" ? "group" : "leaf";
}
export function medicationItemCategoryLabel(category) {
  const id = normalizeMedicationItemCategory(category);
  return MEDICATION_ITEM_CATEGORIES.find((c) => c.id === id)?.label || id;
}
const store = { medicationItems: {}, medications: {} };
const itemListeners = [];
const medListeners = new Map();
let seq = 0;
const nid = (p) => p + (++seq);
function ensureMeds(k) {
  if (!store.medications[k]) store.medications[k] = {};
  return store.medications[k];
}
function notifyMeds(k) {
  const drugs = Object.entries(ensureMeds(k)).map(([id, d]) => ({ id, ...d, events: d.events || {} }));
  (medListeners.get(k) || []).forEach((cb) => cb(drugs.map((x) => structuredClone(x))));
}
export function subscribeMedicationItems(cb) {
  itemListeners.push(cb);
  cb([]);
  return () => { const i = itemListeners.indexOf(cb); if (i>=0) itemListeners.splice(i,1); };
}
export function subscribeMedications(karte, cb) {
  const list = medListeners.get(karte) || [];
  list.push(cb);
  medListeners.set(karte, list);
  notifyMeds(karte);
  return () => medListeners.set(karte, (medListeners.get(karte)||[]).filter((x) => x !== cb));
}
export async function addMedication(karte, { name, category }) {
  const id = nid("d");
  ensureMeds(karte)[id] = {
    schemaVersion: 1, name, category: category || "B",
    sideEffectNote: "", expiryEstimate: "", events: {},
  };
  notifyMeds(karte);
  return id;
}
export async function updateMedication() {}
export async function deleteMedication() {}
export async function addMedicationItem() { return nid("mi"); }
export async function updateMedicationItem() {}
export async function deleteMedicationItem() {}
export async function addMedicationEvent() { return nid("me"); }
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function fetchMedicationItemsOnce() { return []; }
export async function fetchMedicationsOnce(karte) {
  return Object.entries(ensureMeds(karte)).map(([id, d]) => ({
    id, ...d, events: d.events || {},
  }));
}

// ==== ここから自動生成: node scripts/check-mock-db-exports.mjs --write ====
// db.js にあってこのモックが定義していない名前を、起動が通る最小限の実装で埋める。
// 挙動が必要になったら、この上でその名前を普通に定義すれば生成対象から外れる。

let __mockSeq = 0;
const __mockNextId = () => "mock" + (__mockSeq += 1);

export const DEFAULT_ADMIN_PASSCODE = "oono";

export async function ensureAdminPasscodeDefault() {}

export async function verifyAdminPasscode(input) {
  return String(input ?? "") === DEFAULT_ADMIN_PASSCODE;
}

export async function getAnimalName() {}

export async function setAnimalName() {}

export async function getOwnerName() {}

export async function setOwnerName() {}

export async function listKarteNameIndex() {}

export async function searchKartesByName() {}

export async function addEntry() {
  return __mockNextId();
}

export async function setEntryImportant() {}

export async function updateEntry() {}

export async function deleteEntry() {}

export function subscribeEntries(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export function sortEntriesDescending(list) {
  return [...(list || [])];
}

export function subscribeTemplates(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addTemplate() {
  return __mockNextId();
}

export async function updateTemplate() {}

export async function deleteTemplate() {}

export const EXAM_ITEM_CATEGORIES = [
  { id: "blood", label: "血液" },
  { id: "imaging", label: "画像" },
  { id: "pathology", label: "病理" },
  { id: "other", label: "その他" },
];

export const EXAM_FASTING = {
  REQUIRED: "required",
  NONE: "none",
};

export function normalizeExamFasting(value) {
  return value;
}

export function examFastingLabel() {
  return "";
}

export function normalizeExamItemCategory(value) {
  return value;
}

export function examItemCategoryLabel() {
  return "";
}

export function normalizeExamItemKind(value) {
  return value;
}

export async function ensureExamItemDefaults() {}

export function subscribeExamItems(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addExamItem() {
  return __mockNextId();
}

export async function updateExamItem() {}

export async function deleteExamItem() {}

export const EXAM_PLAN_SCHEMA_VERSION = 2;

export function subscribeExamPlan(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function saveExamScheduledPlan() {
  return __mockNextId();
}

export async function deleteExamScheduledPlan() {}

export async function endExamScheduledPlan() {}

export async function reviveExamPlanByItem() {
  return __mockNextId();
}

export async function setNextExamPlan() {}

export async function clearNextExamPlan() {}

export async function addExamHistory() {
  return __mockNextId();
}

export async function updateExamHistory() {}

export async function deleteExamHistory() {}

export const MED_ORAL_OTHER_GROUP_ID = "seed-med-oral-other";

export const MED_INJECT_ANTIINFLAM_STEROID_GROUP_ID =
  "seed-med-inject-antiinflam-steroid";

export const MED_INJECT_ANTIBIOTIC_GROUP_ID = "seed-med-inject-antibiotic";

export const MED_INJECT_GI_GROUP_ID = "seed-med-inject-gi";

export const MED_INJECT_NEURO_GROUP_ID = "seed-med-inject-neuro";

export const MED_INJECT_ANTICANCER_GROUP_ID = "seed-med-inject-anticancer";

export const MED_INJECT_CARDIO_RESP_GROUP_ID = "seed-med-inject-cardio-resp";

export const MED_INJECT_SUPPOSITORY_GROUP_ID = "seed-med-inject-suppository";

export const MED_INJECT_OTHER_GROUP_ID = "seed-med-inject-other";

export const MED_ORAL_ANTIBIOTIC_GROUP_ID = "seed-med-oral-antibiotic";

export const MED_ORAL_ANTIINFLAM_GROUP_ID = "seed-med-oral-antiinflam";

export const MED_ORAL_STEROID_ANTIHIST_GROUP_ID = "seed-med-oral-steroid-antihist";

export const MED_ORAL_GI_STOMACH_GROUP_ID = "seed-med-oral-gi-stomach";

export const MED_ORAL_GI_INTESTINE_GROUP_ID = "seed-med-oral-gi-intestine";

export const MED_ORAL_LIVER_GROUP_ID = "seed-med-oral-liver";

export const MED_ORAL_URINARY_GROUP_ID = "seed-med-oral-urinary";

export const MED_ORAL_LIVER_KIDNEY_GROUP_ID = "seed-med-oral-liver-kidney";

export const MED_ORAL_CARDIO_GROUP_ID = "seed-med-oral-cardio";

export const MED_ORAL_RESPIRATORY_GROUP_ID = "seed-med-oral-respiratory";

export const MED_ORAL_NEURO_GROUP_ID = "seed-med-oral-neuro";

export const MED_ORAL_ANTIFUNGAL_GROUP_ID = "seed-med-oral-antifungal";

export const MED_ORAL_ANTICANCER_GROUP_ID = "seed-med-oral-anticancer";

export const MED_ORAL_IMMUNO_GROUP_ID = "seed-med-oral-immuno";

export const MED_ORAL_VITAMIN_GROUP_ID = "seed-med-oral-vitamin";

export const MED_ORAL_HORMONE_GROUP_ID = "seed-med-oral-hormone";

export const MED_ORAL_KAMPO_GROUP_ID = "seed-med-oral-kampo";

export const MED_ORAL_BLOOD_GROUP_ID = "seed-med-oral-blood";

export const MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID = "seed-med-topical-skin-steroid-abx";

export const MED_TOPICAL_SKIN_OTHER_GROUP_ID = "seed-med-topical-skin-other";

export const MED_TOPICAL_EAR_GROUP_ID = "seed-med-topical-ear";

export const MED_TOPICAL_SKIN_GROUP_ID = "seed-med-topical-skin";

export const MED_TOPICAL_DISINFECT_GROUP_ID = "seed-med-topical-disinfect";

export const MED_TOPICAL_SHAMPOO_GROUP_ID = "seed-med-topical-shampoo";

export const MED_SUPPL_JOINT_GROUP_ID = "seed-med-suppl-joint";

export const MED_SUPPL_ORAL_GROUP_ID = "seed-med-suppl-oral";

export const MED_SUPPL_GI_GROUP_ID = "seed-med-suppl-gi";

export const MED_SUPPL_KIDNEY_GROUP_ID = "seed-med-suppl-kidney";

export const MED_SUPPL_URINARY_GROUP_ID = "seed-med-suppl-urinary";

export const MED_SUPPL_NEURO_GROUP_ID = "seed-med-suppl-neuro";

export const MED_SUPPL_SKIN_GROUP_ID = "seed-med-suppl-skin";

export const MED_SUPPL_OTHER_GROUP_ID = "seed-med-suppl-other";

export const MED_FOOD_HILLS_GROUP_ID = "seed-med-food-hills";

export const MED_FOOD_DOCTORS_GROUP_ID = "seed-med-food-doctors";

export const MED_FOOD_DIETIX_GROUP_ID = "seed-med-food-dietix";

export const MED_FOOD_FARMINA_GROUP_ID = "seed-med-food-farmina";

export const MED_FOOD_PURINA_GROUP_ID = "seed-med-food-purina";

export const MED_FOOD_ROYAL_CANIN_GROUP_ID = "seed-med-food-royal-canin";

export const MED_FOOD_OTHER_GROUP_ID = "seed-med-food-other";

export async function ensureMedicationItemDefaults() {}

export async function fetchExamItemsOnce() {
  return [];
}

export const MEDICATION_SCHEMA_VERSION = 1;

export function normalizeHistoryMasterKind(value) {
  return value;
}

export async function ensureHistoryDiseaseItemDefaults() {}

export async function ensureHistorySurgeryItemDefaults() {}

export async function ensureHistoryReferralItemDefaults() {}

export async function deleteHistoryDiseaseItem() {}

export async function deleteHistorySurgeryItem() {}

export async function deleteHistoryReferralItem() {}

export function subscribeHistoryDiseaseItems(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export function subscribeHistorySurgeryItems(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export function subscribeHistoryReferralItems(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addHistoryDiseaseItem() {
  return __mockNextId();
}

export async function addHistorySurgeryItem() {
  return __mockNextId();
}

export async function addHistoryReferralItem() {
  return __mockNextId();
}

export const PATIENT_HISTORY_SCHEMA_VERSION = 1;

export function subscribePatientHistory(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addPatientHistoryEntry() {
  return __mockNextId();
}

export async function updatePatientHistoryEntry() {}

export async function setPatientHistoryStatus() {}

export async function appendPatientHistoryNote() {}

export async function deletePatientHistoryNote() {}

export async function deletePatientHistoryEntry() {}

export const FREE_QA_SCHEMA_VERSION = 1;

export function subscribeFreeQA(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addFreeQA() {
  return __mockNextId();
}

export async function updateFreeQAAnswer() {}

export async function deleteFreeQA() {}

export const PROCEDURE_SCHEMA_VERSION = 2;

export function subscribeProcedureBundle(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export function subscribeProcedures(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function saveProcedurePlan() {
  return __mockNextId();
}

export async function deleteProcedurePlan() {}

export async function reviveProcedurePlan() {
  return __mockNextId();
}

export async function completeProcedurePlan() {}

export async function addProcedure() {
  return __mockNextId();
}

export async function updateProcedure() {}

export async function deleteProcedure() {}

export const SPECIAL_NOTE_SCHEMA_VERSION = 1;

export const SPECIAL_NOTE_IMPORTANCE = ["high", "medium", "low"];

export function subscribeSpecialNotes(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function addSpecialNote() {
  return __mockNextId();
}

export async function updateSpecialNote() {}

export async function deleteSpecialNote() {}

export const MIGRATION_PROGRESS_SCHEMA_VERSION = 1;

export const MIGRATION_PROGRESS_STATUSES = [
  "not_started",
  "in_progress",
  "done",
];

export function normalizeMigrationProgressStatus(value) {
  return value;
}

export function normalizeMigrationProgress(value) {
  return value;
}

export function subscribeMigrationProgress(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function saveMigrationProgress() {
  return __mockNextId();
}

// ==== 自動生成ここまで ====
`;

function findChromeHeadlessShell() {
  const cacheRoot = path.join(os.tmpdir(), "cursor-sandbox-cache");
  if (!fs.existsSync(cacheRoot)) return null;
  for (const dir of fs.readdirSync(cacheRoot)) {
    const candidate = path.join(
      cacheRoot,
      dir,
      "playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"
    );
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function launchBrowser() {
  const candidates = [
    findChromeHeadlessShell(),
    fs.existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : null,
  ].filter(Boolean);
  for (const executablePath of candidates) {
    try {
      return await chromium.launch({
        executablePath,
        headless: true,
        timeout: 30_000,
      });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  throw new Error("Could not launch browser");
}

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<link rel="stylesheet" href="/css/style.css" />
</head>
<body style="margin:0;background:#f5f6f7">
<aside class="col col--right" style="width:340px;height:100vh;background:#fff;display:flex;flex-direction:column">
  <div class="right-tabs"><button class="right-tab is-active">薬剤</button></div>
  <div class="right-panel" id="panel-meds" style="display:flex">
    <div class="exam-toolbar">
      <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    </div>
    <section class="exam-section">
      <h3 class="exam-section__title">薬剤一覧</h3>
      <p class="field__note" id="meds-empty">登録された薬剤はありません。</p>
      <ul class="meds-list" id="meds-list" spellcheck="false"></ul>
    </section>
  </div>
</aside>

<div class="modal" id="med-add-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button class="modal__close" id="btn-close-med-add" type="button">&times;</button>
    <div class="med-linear-picker" id="med-add-linear-picker">
      <div class="med-linear-picker__list" id="med-add-col-category-list"></div>
      <div id="med-add-col-group" hidden>
        <div class="med-linear-picker__list" id="med-add-col-group-list"></div>
      </div>
      <div id="med-add-col-leaf" hidden>
        <div class="med-linear-picker__list" id="med-add-col-leaf-list"></div>
        <p id="med-add-items-empty" hidden></p>
        <div id="med-add-item-add">
          <input id="med-add-new-item" class="input" type="text" />
          <button id="btn-med-add-new-item" type="button">追加</button>
          <p id="med-add-item-error" hidden></p>
        </div>
      </div>
    </div>
    <div id="med-add-category-buttons"></div>
    <div id="med-add-freq-modes"></div>
    <div id="med-add-freq-panel-preset"><div id="med-add-freq-presets"></div></div>
    <div id="med-add-freq-panel-every-n" hidden>
      <button type="button" id="med-add-freq-period"></button>
      <button type="button" id="med-add-freq-times"></button>
      <div id="med-add-freq-every-n-numpad"></div>
    </div>
    <div id="med-add-freq-panel-weekly" hidden>
      <p id="med-add-freq-weekly-display"></p>
      <div id="med-add-freq-weekly-numpad"></div>
    </div>
    <div id="med-add-freq-panel-weekdays" hidden><div id="med-add-freq-weekdays"></div></div>
    <div id="med-add-freq-panel-other" hidden>
      <input id="med-add-freq-other-input" type="text" />
    </div>
    <p id="med-add-error" hidden></p>
    <button id="btn-med-add-save" type="button">追加する</button>
    <button id="btn-med-add-cancel" type="button">キャンセル</button>
  </div>
</div>

<div class="modal" id="med-event-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <h2 id="med-event-modal-title"></h2>
    <button id="btn-close-med-event" type="button"></button>
    <div id="med-event-type-buttons" class="exam-item-buttons"></div>
    <input id="med-event-date" type="date" />
    <div id="med-event-change-options" hidden>
      <input id="med-event-freq-check" type="checkbox" />
      <div id="med-event-freq-block" hidden>
        <div id="med-event-freq-modes"></div>
        <div id="med-event-freq-panel-preset"><div id="med-event-freq-presets"></div></div>
        <div id="med-event-freq-panel-every-n" hidden>
          <button type="button" id="med-event-freq-period"></button>
          <button type="button" id="med-event-freq-times"></button>
          <div id="med-event-freq-every-n-numpad"></div>
        </div>
        <div id="med-event-freq-panel-weekly" hidden>
          <p id="med-event-freq-weekly-display"></p>
          <div id="med-event-freq-weekly-numpad"></div>
        </div>
        <div id="med-event-freq-panel-weekdays" hidden><div id="med-event-freq-weekdays"></div></div>
        <div id="med-event-freq-panel-other" hidden>
          <input id="med-event-freq-other-input" type="text" />
        </div>
      </div>
      <input id="med-event-amount-check" type="checkbox" />
      <div id="med-event-amount-block" hidden>
        <div id="med-event-amount-presets"></div>
        <input id="med-event-amount-other" type="checkbox" />
        <input id="med-event-amount-other-input" type="text" hidden />
      </div>
    </div>
    <textarea id="med-event-detail"></textarea>
    <p id="med-event-error" hidden></p>
    <button id="btn-med-event-save" type="button">保存</button>
    <button id="btn-med-event-cancel" type="button">キャンセル</button>
  </div>
</div>

<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
import { addMedication } from "/js/db.js";
initMedsUI({
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "院長",
});
enterMeds("12345");
await addMedication("12345", { name: "アラバ", category: "C" });
await addMedication("12345", { name: "プレドニゾロン", category: "B" });
await addMedication("12345", { name: "アモキシシリン", category: "A" });
await addMedication("12345", { name: "セファレキシン", category: "A" });
await addMedication("12345", { name: "ガバペンチン", category: "B" });
window.__ready = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  if (u === "/js/db.js") {
    res.writeHead(200, {
      "Content-Type": "text/javascript",
      "Cache-Control": "no-store",
    });
    res.end(mockDb);
    return;
  }
  const fp = path.join(root, u.replace(/^\//, ""));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  const type = fp.endsWith(".css")
    ? "text/css"
    : fp.endsWith(".js")
      ? "text/javascript"
      : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
page.on("pageerror", (e) => console.warn("pageerror", String(e)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(200);

const info = await page.evaluate(() => {
  const headings = [...document.querySelectorAll(".meds-category-heading")].map(
    (el) => el.textContent
  );
  const nameOf = (el) =>
    el?.getAttribute("aria-label") ||
    (el?.dataset.name || "").replace(/\u200B/g, "") ||
    (el?.textContent || "").replace(/\u200B/g, "");
  const names = [...document.querySelectorAll(".med-card__name")].map(nameOf);
  const cats = [...document.querySelectorAll(".med-card .med-cat")].map((el) =>
    el.textContent.trim()
  );
  const listTexts = [...document.querySelectorAll("#meds-list > li")].map((el) =>
    el.className.includes("meds-category-heading")
      ? `HEAD:${el.textContent}`
      : `DRUG:${nameOf(el.querySelector(".med-card__name"))}`
  );
  return { headings, names, cats, listTexts };
});

console.log("INFO", info);
if (info.headings.length > 0) {
  throw new Error("category headings still present: " + info.headings.join(","));
}
if (info.listTexts.some((t) => t.startsWith("HEAD:"))) {
  throw new Error("heading li still in list");
}
if (info.names.length < 5) throw new Error("expected 5 drugs");
const order = info.cats.join("");
if (order !== "AABBC") {
  throw new Error("expected category order AABBC, got " + order);
}
if (info.names.join("|") !== "アモキシシリン|セファレキシン|ガバペンチン|プレドニゾロン|アラバ") {
  throw new Error("unexpected name order: " + info.names.join("|"));
}

const out = path.join(root, "tools/med-flat-list-verify.png");
await page.screenshot({ path: out });
console.log("OK: flat med list A→B→C without category headings");
await browser.close();
server.close();
