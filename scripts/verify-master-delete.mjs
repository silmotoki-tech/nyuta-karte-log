/**
 * マスタ削除: 右スワイプ → 管理者パスコード（誤/正）を既往・検査・薬剤で検証する。
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
const outDir = path.join(root, "tools");
fs.mkdirSync(outDir, { recursive: true });

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
  return chromium.launch({ channel: "chrome", headless: true, timeout: 30_000 });
}

const mockDb = `
const ADMIN = "oono";
let adminPass = ADMIN;
const retired = {
  historyDiseaseItems: {},
  historySurgeryItems: {},
  historyReferralItems: {},
  examItems: {},
  medicationItems: {},
};
const store = {
  disease: {},
  surgery: {},
  referral: {},
  history: {},
  examItems: {},
  examPlan: {},
  medicationItems: {},
  medications: {},
};
const listeners = {
  disease: [],
  surgery: [],
  referral: [],
  history: new Map(),
  examItems: [],
  examPlan: new Map(),
  medicationItems: [],
  medications: new Map(),
};
let seq = 0;
const nid = (p) => p + (++seq);

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
function notifyExamItems() {
  const items = sortItems(
    Object.entries(store.examItems).map(([id, raw]) => ({ id, ...raw }))
  );
  listeners.examItems.forEach((cb) => cb(items.map((x) => structuredClone(x))));
}
function notifyMedItems() {
  const items = sortItems(
    Object.entries(store.medicationItems).map(([id, raw]) => ({ id, ...raw }))
  );
  listeners.medicationItems.forEach((cb) =>
    cb(items.map((x) => structuredClone(x)))
  );
}
function collectDescendants(map, rootId) {
  const ids = [];
  const queue = [rootId];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    Object.entries(map).forEach(([childId, row]) => {
      if (String(row.parentId || "") === id) queue.push(childId);
    });
  }
  return ids;
}
async function removeWithRetire(collection, map, itemId, notify) {
  const ids = collectDescendants(map, itemId);
  ids.forEach((id) => {
    delete map[id];
    retired[collection][id] = true;
  });
  notify();
}

[["seed-hist-disease-cardio","循環器",10],["seed-hist-disease-skin","皮膚",70]].forEach(([id,label,order]) => {
  store.disease[id] = { label, kind:"group", parentId:"", order };
});
[["seed-hist-surgery-soft","軟部外科",20]].forEach(([id,label,order]) => {
  store.surgery[id] = { label, kind:"group", parentId:"", order };
});

export const DEFAULT_ADMIN_PASSCODE = ADMIN;
export async function ensureAdminPasscodeDefault() {
  if (!adminPass) adminPass = ADMIN;
}
export async function verifyAdminPasscode(input) {
  await ensureAdminPasscodeDefault();
  return String(input ?? "") === String(adminPass);
}

export function normalizeHistoryMasterKind(kind) {
  return String(kind || "").trim() === "group" ? "group" : "leaf";
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
export function subscribeHistoryReferralItems(cb) {
  listeners.referral.push(cb); notifyTree("referral");
  return () => { listeners.referral = listeners.referral.filter((x) => x !== cb); };
}
export async function addHistoryDiseaseItem({ label, kind="leaf", parentId="" }) {
  const id = nid("d");
  store.disease[id] = { label, kind: normalizeHistoryMasterKind(kind), parentId: parentId||"", order: Date.now() };
  notifyTree("disease");
  return id;
}
export async function addHistorySurgeryItem({ label, kind="leaf", parentId="" }) {
  const id = nid("s");
  store.surgery[id] = { label, kind: normalizeHistoryMasterKind(kind), parentId: parentId||"", order: Date.now() };
  notifyTree("surgery");
  return id;
}
export async function addHistoryReferralItem({ label }) {
  const id = nid("r");
  store.referral[id] = { label, order: Date.now() };
  notifyTree("referral");
  return id;
}
export async function deleteHistoryDiseaseItem(itemId) {
  await removeWithRetire("historyDiseaseItems", store.disease, itemId, () => notifyTree("disease"));
}
export async function deleteHistorySurgeryItem(itemId) {
  await removeWithRetire("historySurgeryItems", store.surgery, itemId, () => notifyTree("surgery"));
}
export async function deleteHistoryReferralItem(itemId) {
  delete store.referral[itemId];
  retired.historyReferralItems[itemId] = true;
  notifyTree("referral");
}
export function subscribePatientHistory(karte, cb) {
  const list = listeners.history.get(karte) || [];
  list.push(cb); listeners.history.set(karte, list);
  if (!store.history[karte]) store.history[karte] = {};
  cb([]);
  return () => listeners.history.set(karte, (listeners.history.get(karte)||[]).filter((x)=>x!==cb));
}
export async function addPatientHistoryEntry() { return nid("h"); }
export async function updatePatientHistoryEntry() {}
export async function setPatientHistoryStatus() {}
export async function appendPatientHistoryNote() {}
export async function deletePatientHistoryNote() {}
export async function deletePatientHistoryEntry() {}

export const EXAM_ITEM_CATEGORIES = [
  { id: "blood", label: "血液" },
  { id: "imaging", label: "画像" },
  { id: "pathology", label: "病理" },
  { id: "other", label: "その他" },
];
export function normalizeExamItemCategory(c) {
  const id = String(c||"").trim();
  return EXAM_ITEM_CATEGORIES.some((x)=>x.id===id) ? id : "other";
}
export function normalizeExamFasting(v) {
  const s = String(v||"").trim();
  return s === "required" || s === "none" ? s : "";
}
export function examFastingLabel(v) {
  const s = normalizeExamFasting(v);
  return s === "required" ? "必要" : s === "none" ? "不要" : "";
}
export function subscribeExamItems(cb) {
  listeners.examItems.push(cb); notifyExamItems();
  return () => { listeners.examItems = listeners.examItems.filter((x)=>x!==cb); };
}
export function subscribeExamPlan(karte, cb) {
  const list = listeners.examPlan.get(karte) || [];
  list.push(cb); listeners.examPlan.set(karte, list);
  cb({ schemaVersion:2, plans:{}, history:{} });
  return () => listeners.examPlan.set(karte, (listeners.examPlan.get(karte)||[]).filter((x)=>x!==cb));
}
export async function addExamItem({ label, category="other", kind="leaf", parentId="" }) {
  const id = nid("e");
  store.examItems[id] = {
    label, category: normalizeExamItemCategory(category),
    kind: kind==="group"?"group":"leaf",
    parentId: kind==="group"?"":String(parentId||""),
    order: Date.now(),
  };
  notifyExamItems();
  return id;
}
export async function deleteExamItem(itemId) {
  await removeWithRetire("examItems", store.examItems, itemId, notifyExamItems);
}
export async function saveExamScheduledPlan() { return nid("p"); }
export async function deleteExamScheduledPlan() {}
export async function endExamScheduledPlan() {}
export async function reviveExamPlanByItem() {}
export async function addExamHistory() { return nid("eh"); }

export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" },
  { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" },
  { id: "eye", label: "点眼薬" },
  { id: "supplement", label: "サプリメント・商品" },
  { id: "food", label: "フード" },
];
export function normalizeMedicationItemCategory(c) {
  const id = String(c||"").trim();
  return MEDICATION_ITEM_CATEGORIES.some((x)=>x.id===id) ? id : "oral";
}
export function normalizeMedicationItemKind(k) {
  return String(k||"").trim() === "group" ? "group" : "leaf";
}
export function medicationItemCategoryLabel(c) {
  return MEDICATION_ITEM_CATEGORIES.find((x)=>x.id===normalizeMedicationItemCategory(c))?.label || c;
}
export function subscribeMedicationItems(cb) {
  listeners.medicationItems.push(cb); notifyMedItems();
  return () => { listeners.medicationItems = listeners.medicationItems.filter((x)=>x!==cb); };
}
export function subscribeMedications(karte, cb) {
  const list = listeners.medications.get(karte) || [];
  list.push(cb); listeners.medications.set(karte, list);
  cb([]);
  return () => listeners.medications.set(karte, (listeners.medications.get(karte)||[]).filter((x)=>x!==cb));
}
export async function addMedicationItem({ label, category="oral", kind="leaf", parentId="" }) {
  const id = nid("m");
  store.medicationItems[id] = {
    label,
    category: normalizeMedicationItemCategory(category),
    kind: normalizeMedicationItemKind(kind),
    parentId: kind==="group"?"":String(parentId||""),
    order: Date.now(),
  };
  notifyMedItems();
  return id;
}
export async function deleteMedicationItem(itemId) {
  await removeWithRetire("medicationItems", store.medicationItems, itemId, notifyMedItems);
}
export async function addMedication() { return nid("drug"); }
export async function updateMedication() {}
export async function deleteMedication() {}
export async function addMedicationEvent() { return nid("ev"); }
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function fetchMedicationsOnce() { return []; }
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
import { initExamPlanUI, enterExamPlan } from "/js/exam-plan-ui.js";
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
import { initMasterDeleteUI } from "/js/master-delete-ui.js";

const deps = {
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? a : b; },
  getSelectedAuthor: () => "院長",
};
initMasterDeleteUI(deps);
initHistoryUI(deps);
initExamPlanUI(deps);
initMedsUI(deps);
enterHistory("karte-del");
enterExamPlan("karte-del");
enterMeds("karte-del");

function showRightTab(tab) {
  document.querySelectorAll(".right-tab").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.tab === tab);
  });
  document.querySelectorAll(".right-panel").forEach((el) => {
    el.hidden = el.dataset.panel !== tab && el.id !== \`panel-\${tab === "exam" ? "exam" : tab}\`;
  });
  const map = {
    history: "panel-history",
    exam: "panel-exam",
    meds: "panel-meds",
  };
  document.querySelectorAll(".right-panel").forEach((el) => {
    el.hidden = el.id !== map[tab];
  });
  const rightEmpty = document.getElementById("right-empty");
  if (rightEmpty) rightEmpty.hidden = true;
}
document.querySelectorAll(".right-tab").forEach((tab) => {
  tab.addEventListener("click", () => showRightTab(tab.dataset.tab));
});
showRightTab("history");
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

async function clickExact(listSel, text) {
  const re = new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  const row = page.locator(`${listSel} .med-linear-picker__row`).filter({
    has: page.locator(".med-linear-picker__item-label", { hasText: re }),
  });
  if ((await row.count()) > 0) {
    await row.first().click();
    return;
  }
  await page
    .locator(`${listSel} .med-linear-picker__item`)
    .filter({
      has: page.locator(".med-linear-picker__item-label", { hasText: re }),
    })
    .first()
    .click();
}

async function swipeOpenDelete(listSel, text) {
  const row = page
    .locator(`${listSel} .med-linear-picker__row`)
    .filter({
      has: page.locator(".med-linear-picker__item-label", {
        hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      }),
    })
    .first();
  await row.waitFor({ state: "visible" });
  const box = await row.boundingBox();
  assert.ok(box, "row box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 16, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  await row.locator(".icon-btn--delete, .swipeable__action-btn").first().click();
  await page.waitForSelector("#master-delete-modal:not([hidden])");
}

async function assertWrongThenRightDelete({ shotWrong, shotOk, goneSelector, goneText }) {
  await page.fill("#master-delete-passcode", "wrong");
  await page.click("#btn-master-delete-confirm");
  await page.waitForTimeout(120);
  const err = await page.locator("#master-delete-error").textContent();
  assert.match(err || "", /管理者パスコードが違います/);
  assert.equal(await page.locator("#master-delete-modal").isHidden(), false);
  await page.screenshot({ path: path.join(outDir, shotWrong) });

  await page.fill("#master-delete-passcode", "oono");
  await page.click("#btn-master-delete-confirm");
  await page.waitForFunction(
    () => document.getElementById("master-delete-modal")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  await page.waitForTimeout(150);
  const labels = await page
    .locator(`${goneSelector} .med-linear-picker__item-label`)
    .allTextContents();
  assert.ok(!labels.includes(goneText), `still has ${goneText}: ${labels.join(",")}`);
  await page.screenshot({ path: path.join(outDir, shotOk) });
}

// --- 疾患名マスタ ---
await page.locator(".right-tab[data-tab=history]").click();
await page.click("#btn-history-add");
await page.waitForSelector("#history-add-modal:not([hidden])");
await clickExact("#history-add-col-category-list", "皮膚");
await page.click("#btn-history-add-toggle");
await page.fill("#history-add-new-item", "削除検証中項目");
await page.click("#btn-history-add-new-item");
await page.waitForTimeout(150);
await swipeOpenDelete("#history-add-col-group-list", "削除検証中項目");
await assertWrongThenRightDelete({
  shotWrong: "master-delete-disease-wrong.png",
  shotOk: "master-delete-disease-ok.png",
  goneSelector: "#history-add-col-group-list",
  goneText: "削除検証中項目",
});
console.log("OK disease");

// --- 手術名マスタ ---
await page.locator("#history-add-type-buttons .exam-item-btn", { hasText: "手術歴" }).click();
await page.waitForTimeout(80);
await clickExact("#history-add-col-category-list", "軟部外科");
await page.click("#btn-history-add-toggle");
await page.fill("#history-add-new-item", "削除検証手術中");
await page.click("#btn-history-add-new-item");
await page.waitForTimeout(120);
await page.click("#btn-history-add-toggle");
await page.fill("#history-add-new-item", "削除検証手術葉");
await page.click("#btn-history-add-new-item");
await page.waitForTimeout(120);
await swipeOpenDelete("#history-add-col-leaf-list", "削除検証手術葉");
await assertWrongThenRightDelete({
  shotWrong: "master-delete-surgery-wrong.png",
  shotOk: "master-delete-surgery-ok.png",
  goneSelector: "#history-add-col-leaf-list",
  goneText: "削除検証手術葉",
});
console.log("OK surgery");

// --- 紹介先マスタ ---
await page.locator("#history-add-type-buttons .exam-item-btn", { hasText: "紹介・専門治療歴" }).click();
await page.waitForTimeout(80);
await page.click("#btn-history-add-toggle");
await page.fill("#history-add-new-item", "削除検証紹介先");
await page.click("#btn-history-add-new-item");
await page.waitForTimeout(120);
await swipeOpenDelete("#history-add-col-leaf-list", "削除検証紹介先");
await assertWrongThenRightDelete({
  shotWrong: "master-delete-referral-wrong.png",
  shotOk: "master-delete-referral-ok.png",
  goneSelector: "#history-add-col-leaf-list",
  goneText: "削除検証紹介先",
});
console.log("OK referral");
await page.click("#btn-history-add-cancel").catch(() => {});

// --- 検査項目マスタ ---
await page.locator(".right-tab[data-tab=exam]").click();
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await clickExact("#exam-plan-col-category-list", "血液");
await page.click("#btn-exam-plan-add-toggle");
await page.fill("#exam-plan-new-item", "削除検証検査中");
await page.click("#btn-exam-plan-add-item");
await page.waitForTimeout(150);
await swipeOpenDelete("#exam-plan-col-group-list", "削除検証検査中");
await assertWrongThenRightDelete({
  shotWrong: "master-delete-exam-wrong.png",
  shotOk: "master-delete-exam-ok.png",
  goneSelector: "#exam-plan-col-group-list",
  goneText: "削除検証検査中",
});
console.log("OK exam");
await page.click("#btn-exam-plan-cancel").catch(() => {});

// --- 薬剤マスタ ---
await page.locator(".right-tab[data-tab=meds]").click();
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await clickExact("#med-add-col-category-list", "点眼薬");
await page.click("#btn-med-add-toggle");
await page.fill("#med-add-new-item", "削除検証点眼");
await page.click("#btn-med-add-new-item");
await page.waitForTimeout(150);
await swipeOpenDelete("#med-add-col-leaf-list", "削除検証点眼");
await assertWrongThenRightDelete({
  shotWrong: "master-delete-med-wrong.png",
  shotOk: "master-delete-med-ok.png",
  goneSelector: "#med-add-col-leaf-list",
  goneText: "削除検証点眼",
});
console.log("OK med");

await browser.close();
server.close();
console.log("OK: master delete + admin passcode for disease/surgery/referral/exam/med");
