/**
 * 疾患名マスタの全大分類・中項目・小項目シードがUIで表示・選択できることを検証する。
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HISTORY_DISEASE_SEED } from "../js/history-disease-seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = path.join(root, "tools");
fs.mkdirSync(outDir, { recursive: true });

const tops = HISTORY_DISEASE_SEED.filter((s) => s.kind === "group" && !s.parentId);
const mids = HISTORY_DISEASE_SEED.filter((s) => s.kind === "group" && s.parentId);
const leaves = HISTORY_DISEASE_SEED.filter((s) => s.kind === "leaf");

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
      return await chromium.launch({ executablePath, headless: true, timeout: 30_000 });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  return chromium.launch({ channel: "chrome", headless: true, timeout: 30_000 });
}

const seedJson = JSON.stringify(HISTORY_DISEASE_SEED);
const mockDb = `
const HISTORY_DISEASE_SEED = ${seedJson};
const store = { disease: {}, surgery: {}, referral: {}, history: {} };
const listeners = { disease: [], surgery: [], referral: [], history: new Map() };
HISTORY_DISEASE_SEED.forEach((s) => {
  store.disease[s.id] = {
    label: s.label,
    kind: s.kind,
    parentId: s.parentId || "",
    order: s.order,
  };
});
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
export async function ensureHistoryReferralItemDefaults() {}
export function subscribeHistoryDiseaseItems(cb) {
  listeners.disease.push(cb); notifyTree("disease");
  return () => { listeners.disease = listeners.disease.filter((x) => x !== cb); };
}
export function subscribeHistorySurgeryItems(cb) {
  listeners.surgery.push(cb); notifyTree("surgery");
  return () => { listeners.surgery = listeners.surgery.filter((x) => x !== cb); };
}
export function subscribeHistoryReferralItems(cb) {
  listeners.referral.push(cb); notifyTree("referral");
  return () => { listeners.referral = listeners.referral.filter((x) => x !== cb); };
}
export async function addHistoryDiseaseItem() { return "x"; }
export async function addHistorySurgeryItem() { return "x"; }
export async function addHistoryReferralItem() { return "x"; }
export async function deleteHistoryDiseaseItem() {}
export async function deleteHistorySurgeryItem() {}
export async function deleteHistoryReferralItem() {}
export function subscribePatientHistory(karte, cb) {
  cb([]);
  return () => {};
}
export async function addPatientHistoryEntry() { return "h"; }
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
enterHistory("karte-seed");
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
  viewport: { width: 520, height: 1100 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.warn("pageerror", e.message));
await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);

async function labels(sel) {
  return page.locator(`${sel} .med-linear-picker__item-label`).allTextContents();
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
    .filter({ has: page.locator(".med-linear-picker__item-label", { hasText: re }) })
    .first()
    .click();
}

await page.click("#btn-history-add");
await page.waitForSelector("#history-add-modal:not([hidden])");
await page.waitForTimeout(150);

const topLabels = await labels("#history-add-col-category-list");
console.log("tops:", topLabels);
for (const top of tops) {
  assert.ok(topLabels.includes(top.label), `missing top: ${top.label}`);
}

const checked = [];
for (const top of tops) {
  await clickLabel("#history-add-col-category-list", top.label);
  await page.waitForTimeout(60);
  const topMids = mids.filter((m) => m.parentId === top.id);
  const topDirectLeaves = leaves.filter((l) => l.parentId === top.id);

  if (topMids.length) {
    const midLabels = await labels("#history-add-col-group-list");
    for (const mid of topMids) {
      assert.ok(midLabels.includes(mid.label), `${top.label} missing mid ${mid.label}`);
      await clickLabel("#history-add-col-group-list", mid.label);
      await page.waitForTimeout(40);
      assert.equal(
        (await page.locator("#history-add-selected").textContent()).trim(),
        `選択中: ${mid.label}`
      );
      const midLeaves = leaves.filter((l) => l.parentId === mid.id);
      const leafLabels = await labels("#history-add-col-leaf-list");
      for (const leaf of midLeaves) {
        assert.ok(
          leafLabels.includes(leaf.label),
          `${top.label}/${mid.label} missing leaf ${leaf.label}`
        );
      }
      // 小項目選択
      const sample = midLeaves[0];
      await clickLabel("#history-add-col-leaf-list", sample.label);
      await page.waitForTimeout(40);
      assert.equal(
        (await page.locator("#history-add-selected").textContent()).trim(),
        `選択中: ${sample.label}`
      );
      checked.push(`${top.label}>${mid.label}>${sample.label}`);
    }
  } else {
    const leafLabels = await labels("#history-add-col-leaf-list");
    for (const leaf of topDirectLeaves) {
      assert.ok(
        leafLabels.includes(leaf.label),
        `${top.label} missing direct leaf ${leaf.label}`
      );
    }
    const sample = topDirectLeaves[0];
    await clickLabel("#history-add-col-leaf-list", sample.label);
    await page.waitForTimeout(40);
    assert.equal(
      (await page.locator("#history-add-selected").textContent()).trim(),
      `選択中: ${sample.label}`
    );
    checked.push(`${top.label}>${sample.label}`);
  }
}

console.log("checked paths:", checked.length);
assert.equal(tops.length, 15);
assert.ok(mids.length >= 20);
assert.ok(leaves.length >= 80);
console.log(`seed counts: tops=${tops.length} mids=${mids.length} leaves=${leaves.length}`);

await page.screenshot({
  path: path.join(outDir, "disease-seed-verify.png"),
  fullPage: true,
});

// 代表スクショ: 皮膚 > アレルギー疾患
await clickLabel("#history-add-col-category-list", "皮膚");
await page.waitForTimeout(60);
await clickLabel("#history-add-col-group-list", "アレルギー疾患");
await page.waitForTimeout(60);
await page.screenshot({ path: path.join(outDir, "disease-seed-skin.png") });

// 中項目なし: 循環器
await clickLabel("#history-add-col-category-list", "循環器");
await page.waitForTimeout(60);
await page.screenshot({ path: path.join(outDir, "disease-seed-cardio.png") });

await browser.close();
server.close();
console.log("OK: disease master full seed display + select");
