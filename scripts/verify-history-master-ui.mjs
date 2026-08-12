/**
 * 既往歴マスタ: 疾患/手術の階層選択・紹介先フラット・新規追加・検索を検証する。
 */
import assert from "node:assert/strict";
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

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function findChromeHeadlessShell() {
  const cacheRoot = path.join(os.tmpdir(), "cursor-sandbox-cache");
  if (!fs.existsSync(cacheRoot)) return null;
  for (const dir of fs.readdirSync(cacheRoot)) {
    for (const arch of ["mac-arm64", "mac-x64"]) {
      const c = path.join(
        cacheRoot,
        dir,
        `playwright/chromium_headless_shell-1228/chrome-headless-shell-${arch}/chrome-headless-shell`
      );
      if (fs.existsSync(c)) return c;
    }
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
      const browser = await chromium.launch({
        executablePath,
        headless: true,
        timeout: 30_000,
      });
      console.log("browser:", executablePath);
      return browser;
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }

  try {
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      timeout: 30_000,
    });
    console.log("browser: channel chrome");
    return browser;
  } catch (err) {
    console.warn("launch failed (channel chrome):", err.message);
  }

  throw new Error("Could not launch Chromium");
}

const mockDb = `
const store = {
  disease: {},
  surgery: {},
  referral: {},
  history: {},
};
const listeners = { disease: [], surgery: [], referral: [], history: new Map() };

function sortItems(items) {
  return items.sort((a, b) => {
    const ord = (a.order ?? 0) - (b.order ?? 0);
    if (ord !== 0) return ord;
    return (a.label || "").localeCompare(b.label || "", "ja");
  });
}
function notifyTree(key) {
  const items = sortItems(
    Object.entries(store[key]).map(([id, raw]) => ({ id, ...raw }))
  );
  listeners[key].forEach((cb) => cb(items.map((x) => structuredClone(x))));
}
function notifyHistory(karte) {
  const entries = Object.entries(store.history[karte] || {}).map(([id, raw]) => ({
    id,
    ...raw,
    notes: raw.notes || {},
  }));
  (listeners.history.get(karte) || []).forEach((cb) =>
    cb(entries.map((x) => structuredClone(x)))
  );
}
function seedTops(map, seeds) {
  seeds.forEach((s) => {
    map[s.id] = { label: s.label, kind: "group", parentId: "", order: s.order };
  });
}
seedTops(store.disease, [
  { id: "seed-hist-disease-cardio", label: "循環器", order: 10 },
  { id: "seed-hist-disease-gi", label: "消化器", order: 20 },
  { id: "seed-hist-disease-kidney", label: "腎臓・泌尿器", order: 30 },
  { id: "seed-hist-disease-resp", label: "呼吸器", order: 40 },
  { id: "seed-hist-disease-neuro", label: "神経・行動", order: 50 },
  { id: "seed-hist-disease-endo", label: "内分泌・代謝", order: 60 },
  { id: "seed-hist-disease-skin", label: "皮膚", order: 70 },
  { id: "seed-hist-disease-eye", label: "眼科", order: 80 },
  { id: "seed-hist-disease-ortho", label: "整形外科", order: 90 },
  { id: "seed-hist-disease-onco", label: "腫瘍", order: 100 },
  { id: "seed-hist-disease-infect", label: "感染症", order: 110 },
  { id: "seed-hist-disease-other", label: "その他", order: 120 },
]);
seedTops(store.surgery, [
  { id: "seed-hist-surgery-ortho", label: "整形外科", order: 10 },
  { id: "seed-hist-surgery-soft", label: "軟部外科", order: 20 },
  { id: "seed-hist-surgery-dental", label: "歯科", order: 30 },
  { id: "seed-hist-surgery-eye", label: "眼科", order: 40 },
  { id: "seed-hist-surgery-ent", label: "耳鼻科", order: 50 },
  { id: "seed-hist-surgery-other", label: "その他", order: 60 },
]);

let nid = 1;
function nextId(prefix) { return prefix + (nid++); }

export function normalizeHistoryMasterKind(kind) {
  return String(kind || "").trim() === "group" ? "group" : "leaf";
}
export const DEFAULT_ADMIN_PASSCODE = "oono";
export async function ensureAdminPasscodeDefault() {}
export async function verifyAdminPasscode(input) {
  return String(input ?? "") === "oono";
}
export async function ensureHistoryDiseaseItemDefaults() {}
export async function ensureHistorySurgeryItemDefaults() {}
export function subscribeHistoryDiseaseItems(cb) {
  listeners.disease.push(cb); notifyTree("disease");
  return () => { listeners.disease = listeners.disease.filter((x) => x !== cb); };
}
export function subscribeHistorySurgeryItems(cb) {
  listeners.surgery.push(cb); notifyTree("surgery");
  return () => { listeners.surgery = listeners.surgery.filter((x) => x !== cb); };
}
export async function ensureHistoryReferralItemDefaults() {
  const seeds = [
    { id: "seed-hist-referral-petemo", label: "ペテモ", order: 10 },
    { id: "seed-hist-referral-jarmec", label: "JARMeC", order: 20 },
    { id: "seed-hist-referral-jasmine", label: "JASMINE", order: 30 },
    { id: "seed-hist-referral-azabu", label: "麻布大学", order: 40 },
    { id: "seed-hist-referral-nihon", label: "日本大学", order: 50 },
    { id: "seed-hist-referral-nvlu", label: "日本獣医生命科学大学", order: 60 },
  ];
  seeds.forEach((s) => {
    store.referral[s.id] = { label: s.label, order: s.order };
  });
  notifyTree("referral");
}
export function subscribeHistoryReferralItems(cb) {
  listeners.referral.push(cb);
  ensureHistoryReferralItemDefaults().then(() => notifyTree("referral"));
  return () => { listeners.referral = listeners.referral.filter((x) => x !== cb); };
}
export async function addHistoryDiseaseItem({ label, kind = "leaf", parentId = "" }) {
  const id = nextId("d");
  store.disease[id] = { label, kind: normalizeHistoryMasterKind(kind), parentId: parentId || "", order: 10 };
  notifyTree("disease");
  return id;
}
export async function addHistorySurgeryItem({ label, kind = "leaf", parentId = "" }) {
  const id = nextId("s");
  store.surgery[id] = { label, kind: normalizeHistoryMasterKind(kind), parentId: parentId || "", order: 10 };
  notifyTree("surgery");
  return id;
}
export async function addHistoryReferralItem({ label }) {
  const id = nextId("r");
  store.referral[id] = { label, order: 10 };
  notifyTree("referral");
  return id;
}
export async function deleteHistoryDiseaseItem(itemId) {
  delete store.disease[itemId];
  notifyTree("disease");
}
export async function deleteHistorySurgeryItem(itemId) {
  delete store.surgery[itemId];
  notifyTree("surgery");
}
export async function deleteHistoryReferralItem(itemId) {
  delete store.referral[itemId];
  notifyTree("referral");
}
export function subscribePatientHistory(karte, cb) {
  const list = listeners.history.get(karte) || [];
  list.push(cb); listeners.history.set(karte, list);
  if (!store.history[karte]) store.history[karte] = {};
  notifyHistory(karte);
  return () => listeners.history.set(karte, (listeners.history.get(karte)||[]).filter((x)=>x!==cb));
}
export async function addPatientHistoryEntry(karte, { title, type, firstNoted, noteText, author }) {
  if (!store.history[karte]) store.history[karte] = {};
  const id = nextId("h");
  store.history[karte][id] = {
    schemaVersion:1, title, type, status:"active", firstNoted, lastUpdated:firstNoted, source:"manual", notes:{}
  };
  if (noteText) {
    store.history[karte][id].notes.n1 = { date: firstNoted, text: noteText, author: author || "" };
  }
  notifyHistory(karte);
  return id;
}
export async function updatePatientHistoryEntry() {}
export async function setPatientHistoryStatus() {}
export async function appendPatientHistoryNote() {}
export async function deletePatientHistoryNote() {}
export async function deletePatientHistoryEntry() {}

// ==== ここから自動生成: node scripts/check-mock-db-exports.mjs --write ====
// db.js にあってこのモックが定義していない名前を、起動が通る最小限の実装で埋める。
// 挙動が必要になったら、この上でその名前を普通に定義すれば生成対象から外れる。

let __mockSeq = 0;
const __mockNextId = () => "mock" + (__mockSeq += 1);

export async function getAnimalName() {}

export async function setAnimalName() {}

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

export const PATIENT_HISTORY_SCHEMA_VERSION = 1;

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

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const harness = indexHtml
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
  .replace(
    "</body>",
    `<script type="module">
document.documentElement.classList.add("is-unlocked");
const lock = document.getElementById("screen-lock");
if (lock) lock.hidden = true;
const app = document.getElementById("screen-app") || document.getElementById("app-shell");
if (app) app.hidden = false;

import { initHistoryUI, enterHistory } from "/js/history-ui.js";
import { initMasterDeleteUI } from "/js/master-delete-ui.js";
const deps = {
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? a : b; },
  getSelectedAuthor: () => "院長",
};
initMasterDeleteUI(deps);
initHistoryUI(deps);
enterHistory("karte-hist");
const panel = document.getElementById("panel-history");
if (panel) panel.hidden = false;
document.querySelectorAll(".right-panel").forEach((el) => {
  if (el.id !== "panel-history") el.hidden = true;
});
document.querySelectorAll(".right-tab").forEach((tab) => {
  tab.classList.toggle("is-active", tab.dataset.tab === "history");
});
const rightEmpty = document.getElementById("right-empty");
if (rightEmpty) rightEmpty.hidden = true;
window.__ready = true;
</script>
</body>`
  );

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/" || urlPath === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const filePath = path.join(root, urlPath.replace(/^\//, ""));
  if (
    !filePath.startsWith(root) ||
    !fs.existsSync(filePath) ||
    fs.statSync(filePath).isDirectory()
  ) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const browser = await launchBrowser();
const page = await browser.newPage({
  viewport: { width: 480, height: 1000 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.warn("pageerror", e.message));
await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);

async function labels(sel) {
  // 「◯◯」で登録ボタンはマスタ項目ではないので除く
  return page
    .locator(
      `${sel} .med-linear-picker__item:not(.med-linear-picker__group-pick) .med-linear-picker__item-label`
    )
    .allTextContents();
}
async function clickLabel(sel, text) {
  const re = new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  const row = page.locator(`${sel} .med-linear-picker__row`).filter({
    has: page.locator(".med-linear-picker__item-label", { hasText: re }),
  });
  if ((await row.count()) > 0) {
    await row.first().click();
    return;
  }
  await page
    .locator(`${sel} .med-linear-picker__item`)
    .filter({
      has: page.locator(".med-linear-picker__item-label", { hasText: re }),
    })
    .first()
    .click();
}

// Open add modal via history tab + button
await page.locator(".right-tab[data-tab=history]").click().catch(() => {});
await page.click("#btn-history-add");
await page.waitForSelector("#history-add-modal:not([hidden])");
await page.waitForTimeout(120);

const diseaseTops = await labels("#history-add-col-category-list");
console.log("disease tops:", diseaseTops);
assert.ok(diseaseTops.includes("循環器"));
assert.ok(diseaseTops.includes("検索"));
assert.ok(diseaseTops.at(-1) === "検索");

await clickLabel("#history-add-col-category-list", "循環器");
await page.waitForTimeout(80);
await page.click("#btn-history-add-toggle");
await page.waitForSelector("#history-add-item-add:not([hidden])");
await page.fill("#history-add-new-item", "心疾患");
await page.click("#btn-history-add-new-item");
await page.waitForTimeout(150);
const mids = await labels("#history-add-col-group-list");
console.log("disease mids:", mids);
assert.ok(mids.includes("心疾患"));
// 中分類を足した時点では開くだけで、「「心疾患」で登録」を押すと確定すること
assert.notEqual(
  (await page.locator("#history-add-selected").textContent()).trim(),
  "選択中: 心疾患"
);
const midGroupPick = page.locator(
  "#history-add-col-leaf-list .med-linear-picker__group-pick"
);
assert.equal(
  (await midGroupPick.locator(".med-linear-picker__item-label").textContent()).trim(),
  "「心疾患」で登録"
);
await midGroupPick.click();
await page.waitForTimeout(80);
assert.equal(
  (await page.locator("#history-add-selected").textContent()).trim(),
  "選択中: 心疾患"
);

await page.click("#btn-history-add-toggle");
await page.fill("#history-add-new-item", "僧帽弁閉鎖不全症");
await page.click("#btn-history-add-new-item");
await page.waitForTimeout(150);
const leaves = await labels("#history-add-col-leaf-list");
console.log("disease leaves:", leaves);
assert.ok(leaves.includes("僧帽弁閉鎖不全症"));
assert.equal(
  (await page.locator("#history-add-selected").textContent()).trim(),
  "選択中: 僧帽弁閉鎖不全症"
);

// 中分類のタップでは選択が変わらず、「「心疾患」で登録」で再確定できること
await clickLabel("#history-add-col-group-list", "心疾患");
await page.waitForTimeout(80);
assert.equal(
  (await page.locator("#history-add-selected").textContent()).trim(),
  "選択中: 僧帽弁閉鎖不全症"
);
await page.locator("#history-add-col-leaf-list .med-linear-picker__group-pick").click();
await page.waitForTimeout(80);
assert.equal(
  (await page.locator("#history-add-selected").textContent()).trim(),
  "選択中: 心疾患"
);

fs.mkdirSync(path.join(root, "tools"), { recursive: true });
await page.screenshot({ path: path.join(root, "tools/history-master-disease.png") });

// search
await clickLabel("#history-add-col-category-list", "検索");
await page.waitForTimeout(80);
await page.fill("#history-add-search-input", "僧帽");
await page.waitForTimeout(120);
const searchHits = await labels("#history-add-col-leaf-list");
console.log("disease search:", searchHits);
assert.ok(searchHits.some((t) => t.includes("僧帽弁閉鎖不全症")));
await page.screenshot({ path: path.join(root, "tools/history-master-disease-search.png") });

// surgery
await page.locator("#history-add-type-buttons .exam-item-btn", { hasText: "手術歴" }).click();
await page.waitForTimeout(100);
const surgeryTops = await labels("#history-add-col-category-list");
console.log("surgery tops:", surgeryTops);
assert.ok(surgeryTops.includes("軟部外科"));
await clickLabel("#history-add-col-category-list", "軟部外科");
await page.click("#btn-history-add-toggle");
await page.fill("#history-add-new-item", "腹腔手術");
await page.click("#btn-history-add-new-item");
await page.waitForTimeout(120);
await page.click("#btn-history-add-toggle");
await page.fill("#history-add-new-item", "脾摘出");
await page.click("#btn-history-add-new-item");
await page.waitForTimeout(120);
assert.ok((await labels("#history-add-col-leaf-list")).includes("脾摘出"));
await page.screenshot({ path: path.join(root, "tools/history-master-surgery.png") });

// referral flat + seeds
await page.locator("#history-add-type-buttons .exam-item-btn", { hasText: "紹介・専門治療歴" }).click();
await page.waitForTimeout(120);
const refModes = await labels("#history-add-col-category-list");
assert.deepEqual(refModes, ["紹介先", "検索"]);
const referralSeeds = [
  "ペテモ",
  "JARMeC",
  "JASMINE",
  "麻布大学",
  "日本大学",
  "日本獣医生命科学大学",
];
const referralLabels = await labels("#history-add-col-leaf-list");
console.log("referral seeds:", referralLabels);
for (const name of referralSeeds) {
  assert.ok(referralLabels.includes(name), `missing referral seed: ${name}`);
}
await clickLabel("#history-add-col-leaf-list", "JARMeC");
await page.waitForTimeout(80);
assert.equal(
  (await page.locator("#history-add-selected").textContent()).trim(),
  "選択中: JARMeC"
);
await page.click("#btn-history-add-toggle");
await page.fill("#history-add-new-item", "サンプル動物病院");
await page.click("#btn-history-add-new-item");
await page.waitForTimeout(120);
assert.ok((await labels("#history-add-col-leaf-list")).includes("サンプル動物病院"));
await page.screenshot({ path: path.join(root, "tools/history-master-referral.png") });

await browser.close();
server.close();
console.log("OK: history masters picker + add + search");
