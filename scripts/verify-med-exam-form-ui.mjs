/**
 * 検査・薬剤登録の8点修正をスクショ付きで確認する。
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
const outDir = path.join(root, "tools", "med-exam-form-verify");
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

const examMock = fs.readFileSync(
  path.join(__dirname, "mock-db-exam-categories.js"),
  "utf8"
);

const medMock = `
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
export async function updateMedication(karte, id, fields) {
  Object.assign(ensureMeds(karte)[id], fields);
  notifyMeds(karte);
}
export async function deleteMedication() {}
export async function addMedicationItem() { return "x"; }
export async function updateMedicationItem() {}
export async function deleteMedicationItem() {}
export async function addMedicationEvent() { return "e"; }
export async function updateMedicationEvent(karte, drugId, eventId, fields) {
  Object.assign(ensureMeds(karte)[drugId].events[eventId], fields);
  notifyMeds(karte);
}
export async function deleteMedicationEvent() {}
export async function fetchMedicationItemsOnce() {
  return Object.entries(store.medicationItems).map(([id, it]) => ({ id, ...it }));
}
export async function fetchMedicationsOnce(karte) {
  return Object.entries(ensureMeds(karte)).map(([id, d]) => ({ id, ...d, events: d.events || {} }));
}
// exam stubs so exam-plan-ui import doesn't explode if loaded
export const EXAM_ITEM_CATEGORIES = [];
export const EXAM_FASTING = {};
export function normalizeExamItemCategory() { return "blood"; }
export function normalizeExamItemKind() { return "leaf"; }
export function normalizeExamFasting() { return ""; }
export function examFastingLabel() { return ""; }
export async function ensureExamItemDefaults() {}
export function subscribeExamItems(cb) { cb([]); return () => {}; }
export function subscribeExamPlan(karte, cb) { cb([]); return () => {}; }
export async function getExamPlan() { return []; }
export async function addExamItem() { return "x"; }
export async function saveExamScheduledPlan() { return "p"; }
export async function deleteExamScheduledPlan() {}
export async function endExamScheduledPlan() {}
export async function reviveExamPlanByItem() { return "p"; }
export async function addExamHistory() { return "h"; }
export const EXAM_PLAN_SCHEMA_VERSION = 2;

store.medicationItems["g1"] = { schemaVersion:1, label:"抗菌薬", category:"oral", kind:"group", parentId:null, order:1 };
store.medicationItems["l1"] = { schemaVersion:1, label:"アモキシシリン", category:"oral", kind:"leaf", parentId:"g1", order:1 };
ensureMeds("karte-form-verify")["d1"] = {
  schemaVersion:1,
  name:"既存プレドニゾロン",
  category:"B",
  sideEffectNote:"多飲多尿に注意",
  expiryEstimate:"2026-08-15",
  events:{ e1:{ date:"2026-06-01", type:"add", detail:"開始", frequencyChange:"", amountChange:"", changedBy:"院長" } }
};
`;

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

function makeHarness(boot) {
  return indexHtml
    .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
    .replace("</body>", `${boot}\n</body>`);
}

const examHarness = makeHarness(`<script type="module">
import { initExamPlanUI, enterExamPlan } from "/js/exam-plan-ui.js";
initExamPlanUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterExamPlan("karte-form-verify");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
document.querySelectorAll(".right-panel").forEach((p) => { p.hidden = true; });
document.getElementById("panel-exam").hidden = false;
window.__ready = true;
</script>`);

const medHarness = makeHarness(`<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
initMedsUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
  getSelectedAuthor: () => "検証",
});
enterMeds("karte-form-verify");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
document.querySelectorAll(".right-panel").forEach((p) => { p.hidden = true; });
document.getElementById("panel-meds").hidden = false;
window.__ready = true;
</script>`);

let mode = "exam";
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/" || urlPath === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(mode === "exam" ? examHarness : medHarness);
    return;
  }
  if (urlPath === "/js/db.js") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(mode === "exam" ? examMock : medMock);
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

// --- exam ---
mode = "exam";
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ready === true);
  await page.click("#btn-exam-new");
  await page.waitForSelector("#exam-plan-modal:not([hidden])");
  const examH = await page
    .locator("#exam-plan-linear-picker")
    .evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(examH >= 240, `exam picker too short: ${examH}`);
  await page.screenshot({ path: path.join(outDir, "01-exam-plan-tall-list.png") });
  await page.close();
}

// --- med ---
mode = "med";
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ready === true);
  await page.click("#btn-med-add");
  await page.waitForSelector("#med-add-modal:not([hidden])");

  const add = await page.evaluate(() => {
    const body = document.querySelector("#med-add-modal .modal__body");
    const text = body.innerText;
    const freq = document.getElementById("med-add-freq-picker");
    const dose = document.getElementById("med-add-dose");
    const note = document.getElementById("med-add-note");
    const picker = document.getElementById("med-add-linear-picker");
    const fields = [...body.querySelectorAll(":scope > .field")];
    const last = fields[fields.length - 1];
    return {
      text,
      pickerH: picker.getBoundingClientRect().height,
      hasExplanation: text.includes("A=治療の主力"),
      hasOldMemo: text.includes("副作用・問題"),
      hasOldExpiry: text.includes("効果／処方"),
      hasC: text.includes("C（過去に使用）"),
      doseAfterFreq:
        freq.getBoundingClientRect().bottom <= dose.getBoundingClientRect().top + 2,
      memoLast: last.contains(note),
    };
  });
  console.log("add", add);
  assert.ok(add.pickerH >= 240, "med picker too short");
  assert.equal(add.hasExplanation, false);
  assert.equal(add.hasOldMemo, false);
  assert.equal(add.hasOldExpiry, false);
  assert.ok(add.hasC);
  assert.ok(add.doseAfterFreq);
  assert.ok(add.memoLast);

  await page.screenshot({ path: path.join(outDir, "02-med-add-full.png") });
  await page.locator("#med-add-note").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(outDir, "03-med-add-dose-memo-bottom.png"),
  });
  await page.locator(".med-cat-btn", { hasText: "C（過去に使用）" }).click();
  await page.screenshot({ path: path.join(outDir, "04-med-add-category-c.png") });
  await page.click("#btn-med-add-cancel");

  await page.locator("#meds-list .med-card__header").first().click();
  await page.waitForSelector("#med-detail-sheet:not([hidden])");
  await page.waitForSelector("#med-detail-sheet-body .med-detail-meta__dates");
  const detail = await page.evaluate(() => {
    const root = document.querySelector("#med-detail-sheet-body .med-sheet__detail");
    const text = root.innerText;
    const start = document.querySelector(".med-detail-meta__start input");
    const exp = document.querySelector(".med-detail-meta__expiry input");
    const children = [...root.children];
    const last = children[children.length - 1];
    const a = start.getBoundingClientRect();
    const b = exp.getBoundingClientRect();
    const overlap = !(
      a.right <= b.left + 1 ||
      b.right <= a.left + 1 ||
      a.bottom <= b.top + 1 ||
      b.bottom <= a.top + 1
    );
    return {
      text,
      hasStart: text.includes("開始日"),
      hasExpiryLabel: text.includes("期限"),
      hasOldExpiry: text.includes("効果／処方"),
      hasOldMemo: text.includes("副作用・問題"),
      hasC: text.includes("過去に使用"),
      memoLast: last.classList.contains("med-detail-meta__note"),
      overlap,
    };
  });
  console.log("detail", detail);
  assert.ok(detail.hasStart);
  assert.ok(detail.hasExpiryLabel);
  assert.equal(detail.hasOldExpiry, false);
  assert.equal(detail.hasOldMemo, false);
  assert.ok(detail.hasC);
  assert.ok(detail.memoLast);
  assert.equal(detail.overlap, false);

  await page.screenshot({
    path: path.join(outDir, "05-med-detail-dates-no-overlap.png"),
  });
  await page.locator(".med-detail-meta__note").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(outDir, "06-med-detail-memo-last.png"),
  });
  await page.close();
}

await browser.close();
server.close();
console.log("OK: med/exam form verify");
console.log("shots:", outDir);
