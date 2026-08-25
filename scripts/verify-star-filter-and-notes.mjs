/**
 * ★フィルターがカテゴリ付き記録も含むこと、特記の並び・メタ表示を検証する。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlFragment } from "./html-fragment.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const mockDb = `
const store = { notes: {} };
let noteSeq = 1;
const listeners = new Set();

function emit() {
  const items = Object.entries(store.notes).map(([id, raw]) => ({ id, ...raw }));
  const rank = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => {
    const ir = (rank[a.importance] ?? 1) - (rank[b.importance] ?? 1);
    if (ir !== 0) return ir;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
  listeners.forEach((cb) => cb(items));
}

export function subscribeSpecialNotes(_karte, cb) {
  listeners.add(cb);
  emit();
  return () => listeners.delete(cb);
}
export async function addSpecialNote(_karte, { content, importance, createdBy }) {
  const id = "n" + noteSeq++;
  store.notes[id] = {
    content, importance, createdBy,
    createdAt: new Date().toISOString(),
    lastEditedAt: "", lastEditedBy: "",
  };
  emit();
  return id;
}
export async function updateSpecialNote(_karte, id, { content, importance, editedBy }) {
  store.notes[id] = {
    ...store.notes[id],
    content, importance,
    lastEditedAt: new Date().toISOString(),
    lastEditedBy: editedBy,
  };
  emit();
}
export async function deleteSpecialNote(_karte, id) {
  delete store.notes[id];
  emit();
}
// stubs for other imports if any
export function subscribeProcedures(){return ()=>{};}

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

export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" },
  { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" },
  { id: "eye", label: "点眼薬" },
  { id: "supplement", label: "サプリメント・商品" },
  { id: "food", label: "フード" },
];

export const MED_ORAL_OTHER_GROUP_ID = "seed-med-oral-other";

export function normalizeMedicationItemCategory(value) {
  return value;
}

export function normalizeMedicationItemKind(value) {
  return value;
}

export function medicationItemCategoryLabel() {
  return "";
}

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

export function subscribeMedicationItems(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function fetchMedicationItemsOnce() {
  return [];
}

export async function fetchExamItemsOnce() {
  return [];
}

export async function addMedicationItem() {
  return __mockNextId();
}

export async function updateMedicationItem() {}

export async function deleteMedicationItem() {}

export const MEDICATION_SCHEMA_VERSION = 1;

export function subscribeMedications(...args) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") cb([]);
  return () => {};
}

export async function fetchMedicationsOnce() {
  return [];
}

export async function addMedication() {
  return __mockNextId();
}

export async function updateMedication() {}

export async function deleteMedication() {}

export async function addMedicationEvent() {
  return __mockNextId();
}

export async function updateMedicationEvent() {}

export async function deleteMedicationEvent() {}

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

const harness = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8" />
<link rel="stylesheet" href="/css/style.css" />
<style>body{margin:0;padding:16px;background:#f5f6f7;font-family:system-ui}</style>
</head><body>
<section style="margin-bottom:24px">
  <h2>★フィルター</h2>
  <label><input type="checkbox" id="star-filter" /> ★のみ</label>
  <ul id="headline-out"></ul>
</section>
<aside class="col col--right" style="width:340px;border:1px solid #ddd;background:#fff;padding:8px">
  <div class="right-tabs" id="right-tabs">
    <button class="right-tab is-active" type="button" data-tab="notes">特記</button>
  </div>
  <div class="right-panel" id="panel-notes" data-panel="notes">
    <div class="exam-toolbar">
      <button id="btn-special-note-add" class="btn btn--small btn--primary" type="button">特記を追加</button>
    </div>
    <section class="exam-section">
      <h3 class="exam-section__title">特記事項</h3>
      <p class="field__note" id="special-notes-empty">登録された特記事項はありません。</p>
      <ul class="note-list" id="special-notes-list"></ul>
    </section>
  </div>
</aside>
${htmlFragment("special-note-modal")}
<script type="module">
  import {
    initSpecialNotesUI,
    enterSpecialNotes,
  } from "/js/special-notes-ui.js";

  // --- star filter unit (inline, mirrors app.js) ---
  function entryMatchesStarFilter(entry) {
    if (entry?.important) return true;
    const cat = entry?.category || "none";
    return cat === "ope" || cat === "admission" || cat === "referral";
  }
  const entries = [
    { id: "1", headline: "通常のみ", important: false, category: "none" },
    { id: "2", headline: "手動★", important: true, category: "none" },
    { id: "3", headline: "オペ（★なし）", important: false, category: "ope" },
    { id: "4", headline: "紹介（★なし）", important: false, category: "referral" },
  ];
  const out = document.getElementById("headline-out");
  const box = document.getElementById("star-filter");
  function render() {
    const list = box.checked ? entries.filter(entryMatchesStarFilter) : entries;
    out.innerHTML = list.map((e) => "<li>" + e.headline + "</li>").join("");
    out.dataset.count = String(list.length);
    out.dataset.titles = list.map((e) => e.headline).join("|");
  }
  box.addEventListener("change", render);
  render();

  initSpecialNotesUI({
    showToast: () => {},
    showError: (el, msg) => { if (el) { el.textContent = msg || ""; el.hidden = !msg; } },
    setBusy: () => {},
    getSelectedAuthor: () => "院長",
  });
  enterSpecialNotes("12345");
  window.__test = { render };
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
    res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
    res.end(mockDb);
    return;
  }
  const fp = path.join(root, u.replace(/^\//, ""));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  const ext = path.extname(fp);
  const type =
    ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({
  executablePath: SYSTEM_CHROME,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

// 1) star filter
const before = await page.locator("#headline-out").getAttribute("data-titles");
await page.check("#star-filter");
await page.waitForTimeout(50);
const after = await page.locator("#headline-out").getAttribute("data-titles");
const starOk =
  before === "通常のみ|手動★|オペ（★なし）|紹介（★なし）" &&
  after === "手動★|オペ（★なし）|紹介（★なし）";

// 2) special notes: add low, high, medium — order should be high, medium, low
await page.click("#btn-special-note-add");
await page.fill("#special-note-content", "低：参考メモ");
await page.click('#special-note-importance-row [data-importance="low"]');
await page.click('#special-note-author-row [data-author="院長"]');
await page.click("#btn-special-note-save");
await page.waitForTimeout(200);

await page.click("#btn-special-note-add");
await page.fill("#special-note-content", "高：金銭制限あり");
await page.click('#special-note-importance-row [data-importance="high"]');
await page.click('#special-note-author-row [data-author="院長"]');
await page.click("#btn-special-note-save");
await page.waitForTimeout(200);

await page.click("#btn-special-note-add");
await page.fill("#special-note-content", "中：飼い主は説明を好む");
await page.click('#special-note-importance-row [data-importance="medium"]');
await page.click('#special-note-author-row [data-author="大辻"]');
await page.click("#btn-special-note-save");
await page.waitForTimeout(300);

const order = await page.locator(".note-card__content").allTextContents();
const badges = await page.locator(".note-card__importance").allTextContents();
const metas = await page.locator(".note-card__meta").allTextContents();
const sortOk =
  order[0]?.includes("高：") &&
  order[1]?.includes("中：") &&
  order[2]?.includes("低：") &&
  badges[0]?.includes("高") &&
  badges[1]?.includes("中") &&
  badges[2]?.includes("低");
const createMetaOk = metas.every((m) => /追加 /.test(m) && /院長|大辻/.test(m));

// edit first (high) card
await page.locator(".note-card").first().click();
await page.waitForSelector("#special-note-modal:not([hidden])");
await page.fill("#special-note-content", "高：金銭制限あり（更新）");
await page.click('#special-note-author-row [data-author="川邉"]');
await page.click("#btn-special-note-save");
await page.waitForTimeout(300);
const metaAfterEdit = await page.locator(".note-card__meta").first().textContent();
const editOk = /更新 /.test(metaAfterEdit || "") && /川邉/.test(metaAfterEdit || "");
const contentAfter = await page.locator(".note-card__content").first().textContent();

await page.screenshot({
  path: path.join(root, "tools/special-notes-verify.png"),
  fullPage: true,
});

console.log(
  JSON.stringify(
    {
      starOk,
      before,
      after,
      sortOk,
      order,
      badges,
      createMetaOk,
      metas,
      editOk,
      metaAfterEdit,
      contentAfter,
    },
    null,
    2
  )
);

await browser.close();
server.close();
if (!starOk || !sortOk || !createMetaOk || !editOk) {
  console.error("VERIFY_FAILED");
  process.exit(1);
}
console.log("VERIFY_OK");
