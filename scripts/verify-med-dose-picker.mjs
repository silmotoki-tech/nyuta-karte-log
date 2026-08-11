/**
 * 投与頻度ラベル変更＋投与量リニア段階選択を検証する。
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
const outDir = path.join(root, "tools", "med-dose-picker-verify");
fs.mkdirSync(outDir, { recursive: true });
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
  for (const executablePath of [
    findChromeHeadlessShell(),
    fs.existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : null,
  ].filter(Boolean)) {
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
  return chromium.launch({ headless: true });
}

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(
  indexHtml.includes(">投与頻度（任意）<"),
  "freq label not updated"
);
assert.ok(!indexHtml.includes("初期の投与頻度"), "old freq label remains");
assert.ok(
  indexHtml.includes('id="med-add-dose-picker"') &&
    indexHtml.includes('id="med-add-dose-modes"'),
  "dose linear picker missing"
);
assert.ok(!indexHtml.includes("med-dose-picker__grid"), "old dose grid remains");

const mockDb = `
const store = { medicationItems: {}, medications: {} };
const medListeners = new Map();
const itemListeners = [];
function ensureMeds(k) {
  if (!store.medications[k]) store.medications[k] = {};
  return store.medications[k];
}
function notifyMeds(k) {
  const drugs = Object.entries(ensureMeds(k)).map(([id, d]) => ({ id, ...d, events: d.events || {} }));
  (medListeners.get(k) || []).forEach((cb) => cb(drugs.map((x) => structuredClone(x))));
}
function notifyItems() {
  const items = Object.entries(store.medicationItems).map(([id, it]) => ({ id, ...it }));
  itemListeners.forEach((cb) => cb(items.map((x) => structuredClone(x))));
}
export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" }, { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" }, { id: "eye", label: "点眼薬" },
];
export function normalizeMedicationItemCategory(c) {
  return ["inject","oral","topical","eye"].includes(c) ? c : "oral";
}
export function normalizeMedicationItemKind(k) { return k === "group" ? "group" : "leaf"; }
export function medicationItemCategoryLabel(c) {
  return ({ inject:"注射薬", oral:"内服薬", topical:"外用薬", eye:"点眼薬" })[normalizeMedicationItemCategory(c)] || c;
}
export function subscribeMedicationItems(cb) {
  itemListeners.push(cb); notifyItems();
  return () => { const i = itemListeners.indexOf(cb); if (i >= 0) itemListeners.splice(i, 1); };
}
export function subscribeMedications(karte, cb) {
  const list = medListeners.get(karte) || [];
  list.push(cb); medListeners.set(karte, list); notifyMeds(karte);
  return () => medListeners.set(karte, (medListeners.get(karte)||[]).filter((x) => x !== cb));
}
export async function addMedication(karte, payload) {
  const id = "new-" + Math.random().toString(36).slice(2, 8);
  const date = payload.eventDate || new Date().toISOString().slice(0, 10);
  ensureMeds(karte)[id] = {
    schemaVersion: 1,
    name: payload.name,
    category: payload.category || "A",
    sideEffectNote: payload.sideEffectNote || "",
    expiryEstimate: payload.expiryEstimate || "",
    events: {
      e0: {
        date, type: "add", detail: "開始／継続",
        frequencyChange: payload.frequencyChange || "",
        frequency: payload.frequency || null,
        amountChange: payload.amountChange || "",
        changedBy: payload.changedBy || "",
      },
    },
  };
  notifyMeds(karte);
  return id;
}
export async function updateMedication() {}
export async function deleteMedication() {}
export async function addMedicationItem(payload) {
  const id = "mi-" + Math.random().toString(36).slice(2, 8);
  store.medicationItems[id] = {
    schemaVersion: 1,
    label: payload.label,
    category: payload.category || "oral",
    kind: payload.kind || "leaf",
    parentId: payload.parentId || null,
    order: Date.now(),
  };
  notifyItems();
  return id;
}
export async function updateMedicationItem() {}
export async function deleteMedicationItem() {}
export async function addMedicationEvent() { return "e"; }
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function fetchMedicationItemsOnce() {
  return Object.entries(store.medicationItems).map(([id, it]) => ({ id, ...it }));
}
export async function fetchMedicationsOnce(karte) {
  return Object.entries(ensureMeds(karte)).map(([id, d]) => ({ id, ...d, events: d.events || {} }));
}
export function __dumpStore() { return structuredClone(store); }

store.medicationItems["g1"] = { schemaVersion:1, label:"抗菌薬", category:"oral", kind:"group", parentId:null, order:1 };
store.medicationItems["l1"] = { schemaVersion:1, label:"アモキシシリン", category:"oral", kind:"leaf", parentId:"g1", order:1 };
store.medicationItems["l2"] = { schemaVersion:1, label:"セファレキシン", category:"oral", kind:"leaf", parentId:"g1", order:2 };

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

export const MED_ORAL_OTHER_GROUP_ID = "seed-med-oral-other";

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

const harness = indexHtml
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
  .replace(
    "</body>",
    `<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
import { __dumpStore } from "/js/db.js";
initMedsUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
  getSelectedAuthor: () => "検証",
});
enterMeds("karte-dose");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
document.querySelectorAll(".right-panel").forEach((p) => { p.hidden = true; });
document.getElementById("panel-meds").hidden = false;
window.__dumpStore = __dumpStore;
window.__ready = true;
</script>`
  );

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/" || urlPath === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  if (urlPath === "/js/db.js") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(mockDb);
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
const page = await browser.newPage({ viewport: { width: 980, height: 1200 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ready === true);

async function openAddAndPickDrug(name) {
  await page.click("#btn-med-add");
  await page.waitForSelector("#med-add-modal:not([hidden])");
  await page.getByRole("option", { name: "内服薬" }).click();
  await page.getByRole("option", { name: "抗菌薬" }).click();
  await page.getByRole("option", { name: name }).click();
}

async function amountFor(name) {
  return page.evaluate((drugName) => {
    const store = window.__dumpStore();
    const drugs = Object.values(store.medications["karte-dose"] || {});
    const drug = drugs.find((d) => d.name === drugName);
    if (!drug) return null;
    const ev = Object.values(drug.events || {})[0];
    return ev?.amountChange ?? null;
  }, name);
}

async function clickDrugCard(name) {
  await page.locator(`#meds-list .med-card__name[aria-label="${name}"]`).click();
  await page.waitForSelector("#med-detail-sheet:not([hidden])");
}

async function waitForDrugInList(name) {
  await page.waitForFunction((drugName) => {
    return [...document.querySelectorAll("#meds-list .med-card__name")].some(
      (el) =>
        (el.getAttribute("aria-label") || el.dataset.name || "").replace(/\u200B/g, "") ===
        drugName
    );
  }, name);
}

await openAddAndPickDrug("アモキシシリン");
await page.locator("#med-add-freq-picker").scrollIntoViewIfNeeded();

const layout = await page.evaluate(() => {
  const body = document.querySelector("#med-add-modal .modal__body");
  const text = body.innerText;
  const freq = document.getElementById("med-add-freq-picker");
  const dose = document.getElementById("med-add-dose-picker");
  const freqModes = [...document.querySelectorAll("#med-add-freq-modes .med-linear-picker__item")].map(
    (el) => el.textContent.replace("✓", "").trim()
  );
  const doseModes = [...document.querySelectorAll("#med-add-dose-modes .med-linear-picker__item")].map(
    (el) => el.textContent.replace("✓", "").trim()
  );
  const freqCs = getComputedStyle(freq);
  const doseCs = getComputedStyle(dose);
  return {
    text,
    hasOldLabel: text.includes("初期の投与頻度"),
    hasNewLabel: text.includes("投与頻度（任意）"),
    freqModes,
    doseModes,
    freqDisplay: freqCs.display,
    doseDisplay: doseCs.display,
    freqTemplate: freqCs.gridTemplateColumns,
    doseTemplate: doseCs.gridTemplateColumns,
    freqDataCols: freq.getAttribute("data-cols"),
    doseDataCols: dose.getAttribute("data-cols"),
    doseHasFreqClass: dose.classList.contains("med-linear-picker--freq"),
    doseDetailHidden: document.getElementById("med-add-dose-detail")?.hidden === true,
  };
});
console.log("layout", layout);
assert.equal(layout.hasOldLabel, false);
assert.equal(layout.hasNewLabel, true);
assert.deepEqual(layout.doseModes, ["錠数（整数）", "分数", "その他"]);
assert.equal(layout.freqDisplay, "grid");
assert.equal(layout.doseDisplay, "grid");
assert.equal(layout.freqDataCols, "2");
assert.equal(layout.doseDataCols, "2");
assert.equal(layout.doseHasFreqClass, true);
assert.equal(layout.doseDetailHidden, true);
assert.ok(
  layout.freqTemplate === layout.doseTemplate,
  "freq/dose grid templates differ: " + layout.freqTemplate + " vs " + layout.doseTemplate
);

await page.screenshot({
  path: path.join(outDir, "01-freq-and-dose-unified.png"),
  fullPage: false,
});

// 錠数 → 3錠
await page.getByRole("option", { name: "錠数（整数）" }).click();
await page.waitForSelector("#med-add-dose-detail:not([hidden])");
await page.getByRole("option", { name: "3錠" }).click();
const integerUi = await page.evaluate(() => ({
  head: document.getElementById("med-add-dose-detail-head")?.textContent,
  selected: [...document.querySelectorAll("#med-add-dose-integer .is-selected")].map((el) =>
    el.textContent.replace("✓", "").trim()
  ),
  ints: [...document.querySelectorAll("#med-add-dose-integer .med-linear-picker__item")].map((el) =>
    el.textContent.replace("✓", "").trim()
  ),
}));
console.log("integerUi", integerUi);
assert.equal(integerUi.head, "錠数（整数）");
assert.deepEqual(integerUi.selected, ["3錠"]);
assert.equal(integerUi.ints.length, 10);
await page.screenshot({
  path: path.join(outDir, "02-dose-integer-selected.png"),
  fullPage: false,
});
await page.click("#btn-med-add-save");
await page.waitForFunction(() => document.getElementById("med-add-modal")?.hidden === true);
await waitForDrugInList("アモキシシリン");
assert.equal(await amountFor("アモキシシリン"), "3錠");
await clickDrugCard("アモキシシリン");
assert.ok((await page.locator("#med-detail-sheet-body").innerText()).includes("量: 3錠"));
await page.screenshot({
  path: path.join(outDir, "03-detail-integer-saved.png"),
  fullPage: false,
});
await page.click("#btn-med-detail-sheet-close");

// その他
await openAddAndPickDrug("セファレキシン");
await page.locator("#med-add-dose-picker").scrollIntoViewIfNeeded();
await page.locator("#med-add-dose-modes").getByRole("option", { name: "その他" }).click();
await page.waitForSelector("#med-add-dose-panel-other:not([hidden])");
await page.fill("#med-add-dose-other-input", "0.5ml");
await page.screenshot({
  path: path.join(outDir, "04-dose-other-input.png"),
  fullPage: false,
});
await page.click("#btn-med-add-save");
await page.waitForFunction(() => document.getElementById("med-add-modal")?.hidden === true);
await waitForDrugInList("セファレキシン");
assert.equal(await amountFor("セファレキシン"), "0.5ml");

// 分数
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.getByRole("option", { name: "内服薬" }).click();
await page.getByRole("option", { name: "抗菌薬" }).click();
await page.locator("#btn-med-add-toggle").click();
await page.fill("#med-add-new-item", "メトロニダゾール");
await page.click("#btn-med-add-new-item");
await page.waitForFunction(() =>
  [...document.querySelectorAll("#med-add-col-leaf-list .med-linear-picker__item")].some((el) =>
    (el.textContent || "").includes("メトロニダゾール")
  )
);
await page.getByRole("option", { name: "メトロニダゾール" }).click();
await page.locator("#med-add-dose-modes").getByRole("option", { name: "分数" }).click();
await page.locator("#med-add-dose-fraction").getByRole("option", { name: "1/2錠" }).click();
await page.screenshot({
  path: path.join(outDir, "05-dose-fraction-selected.png"),
  fullPage: false,
});
await page.click("#btn-med-add-save");
await page.waitForFunction(() => document.getElementById("med-add-modal")?.hidden === true);
await waitForDrugInList("メトロニダゾール");
assert.equal(await amountFor("メトロニダゾール"), "1/2錠");

await browser.close();
server.close();
console.log("OK: med dose linear picker");
console.log("shots:", outDir);
