/**
 * 検索タブ（自由質問）の表示・送信・Anthropic 呼び出しを検証する。
 * AI提案フラグ OFF でも自由質問は動くことを確認する。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENABLE_AI_SUGGEST_AFTER_SAVE } from "../js/feature-flags.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (ENABLE_AI_SUGGEST_AFTER_SAVE) {
  console.warn("NOTE: AI suggest flag is true; free-qa must still work");
}

const freeQaSrc = fs.readFileSync(path.join(root, "js/free-qa-ui.js"), "utf8");
if (!freeQaSrc.includes("askClaude")) {
  throw new Error("free-qa-ui.js missing askClaude");
}
if (/ENABLE_AI_SUGGEST/.test(freeQaSrc)) {
  throw new Error("free-qa must not depend on AI suggest flag");
}
console.log("OK: free-qa source uses askClaude and is independent of suggest flag");

const featureFlags = fs.readFileSync(
  path.join(root, "js/feature-flags.js"),
  "utf8"
);
if (!featureFlags.includes("自由質問欄には影響しない")) {
  throw new Error("feature-flags.js should document free-qa independence");
}
console.log("OK: feature flag comment keeps free-qa enabled");

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

const mockDb = `
const store = { freeQA: {} };
const qaListeners = new Map();
let seq = 0;
const nid = (p) => p + (++seq);

function notifyQa(k) {
  const items = Object.entries(store.freeQA[k] || {}).map(([id, row]) => ({ id, ...row }));
  (qaListeners.get(k) || []).forEach((cb) => cb(items.map((x) => structuredClone(x))));
}

export function subscribeFreeQA(karte, cb) {
  if (!store.freeQA[karte]) store.freeQA[karte] = {};
  const list = qaListeners.get(karte) || [];
  list.push(cb);
  qaListeners.set(karte, list);
  notifyQa(karte);
  return () => qaListeners.set(karte, (qaListeners.get(karte)||[]).filter((x) => x !== cb));
}
export async function addFreeQA(karte, { question, answer, askedBy }) {
  if (!store.freeQA[karte]) store.freeQA[karte] = {};
  const id = nid("qa");
  store.freeQA[karte][id] = {
    schemaVersion: 1,
    question: question || "",
    answer: answer || "",
    askedAt: new Date().toISOString(),
    askedBy: askedBy || "",
  };
  notifyQa(karte);
  return id;
}
export async function updateFreeQAAnswer(karte, id, { answer, askedBy }) {
  const row = store.freeQA[karte]?.[id];
  if (!row) throw new Error("missing qa");
  row.answer = answer || "";
  if (askedBy != null) row.askedBy = askedBy;
  notifyQa(karte);
}
export async function deleteFreeQA(karte, id) {
  if (store.freeQA[karte]) delete store.freeQA[karte][id];
  notifyQa(karte);
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

const mockApiKey = `
export function hasApiKey() { return true; }
export function getApiKey() { return "sk-ant-test-key-for-verify"; }
export function setApiKey() {}
export function clearApiKey() {}
`;

const mockSettings = `
export function initSettingsUI() {}
export function openSettings() {}
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

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/tools/free-qa-search-harness.html";
  const fp = path.join(root, u.replace(/^\//, ""));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentType(fp),
    "Cache-Control": "no-store",
  });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1100, height: 800 },
  serviceWorkers: "block",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.route("**/js/api-key.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockApiKey })
);
await page.route("**/js/settings-ui.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockSettings })
);

let anthropicCalls = 0;
let lastAnthropicBody = null;
await page.route("https://api.anthropic.com/v1/messages", async (route) => {
  anthropicCalls += 1;
  lastAnthropicBody = route.request().postDataJSON();
  console.log("ANTHROPIC_CALL", {
    model: lastAnthropicBody?.model,
    hasSystem: Boolean(lastAnthropicBody?.system),
    userPreview: String(lastAnthropicBody?.messages?.[0]?.content || "").slice(
      0,
      100
    ),
  });
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      content: [
        {
          type: "text",
          text: "カルテ上では腎数値の悪化は確認できません。経過観察の記載が中心です。",
        },
      ],
    }),
  });
});

await page.goto(`${base}/tools/free-qa-search-harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__freeQaHarness?.ready === true, null, {
  timeout: 10000,
});

const flag = await page.evaluate(() => window.__freeQaHarness.flag);
if (flag !== false) {
  throw new Error("AI suggest flag should be false in harness");
}
console.log("OK: AI suggest flag is false while free-qa runs");

// Click 検索 tab
await page.locator('.right-tab[data-tab="qa"]').click();
await page.waitForTimeout(100);

const panelHidden = await page.locator("#panel-qa").evaluate((el) => el.hidden);
console.log("panel-qa hidden?", panelHidden);
if (panelHidden) throw new Error("panel-qa still hidden after clicking 検索");

const inputVisible = await page.locator("#free-qa-input").isVisible();
const btnVisible = await page.locator("#btn-free-qa-ask").isVisible();
console.log("UI", { inputVisible, btnVisible });
if (!inputVisible || !btnVisible) {
  throw new Error("free-qa input/button not visible");
}

const inputAttrs = await page.locator("#free-qa-input").evaluate((el) => ({
  readOnly: el.readOnly,
  disabled: el.disabled,
  inputmode: el.getAttribute("inputmode"),
  tag: el.tagName,
}));
console.log("INPUT_ATTRS", inputAttrs);
if (inputAttrs.readOnly || inputAttrs.disabled) {
  throw new Error("free-qa input must be editable");
}
if (inputAttrs.inputmode === "none") {
  throw new Error("free-qa must not use inputmode=none");
}

const focused = await page.evaluate(() => {
  const el = document.getElementById("free-qa-input");
  el.focus();
  return document.activeElement === el;
});
if (!focused) throw new Error("free-qa input cannot receive focus");

await page.fill("#free-qa-input", "腎臓の経過で注意すべき点は？");
await page.click("#btn-free-qa-ask");

await page.waitForFunction(
  () => document.querySelectorAll("#free-qa-list .qa-card").length > 0,
  null,
  { timeout: 10000 }
);

const answerText = await page
  .locator("#free-qa-list .qa-card__answer")
  .first()
  .innerText();
console.log("ANSWER", answerText);
if (!answerText.includes("腎")) {
  throw new Error("answer not shown in list");
}
if (anthropicCalls < 1) {
  throw new Error("Anthropic API was not called");
}
if (!String(lastAnthropicBody?.messages?.[0]?.content || "").includes("腎臓")) {
  throw new Error("Anthropic request missing question text");
}

if (pageErrors.length) {
  throw new Error("page errors: " + pageErrors.join("; "));
}

await page.screenshot({
  path: path.join(root, "tools/free-qa-search-verify.png"),
  fullPage: true,
});

console.log("OK: 検索タブ UI + Anthropic call + answer save");
await browser.close();
server.close();
