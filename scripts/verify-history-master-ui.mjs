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
initHistoryUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? a : b; },
  getSelectedAuthor: () => "院長",
});
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
  return page.locator(`${sel} .med-linear-picker__item-label`).allTextContents();
}
async function clickLabel(sel, text) {
  await page
    .locator(`${sel} .med-linear-picker__item`)
    .filter({
      has: page.locator(".med-linear-picker__item-label", {
        hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      }),
    })
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
// 中分類追加時点で中分類名が選択確定されていること
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

// 中分類をクリックすると中分類名で再確定できること
await clickLabel("#history-add-col-group-list", "心疾患");
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

// referral flat
await page.locator("#history-add-type-buttons .exam-item-btn", { hasText: "紹介・専門治療歴" }).click();
await page.waitForTimeout(100);
const refModes = await labels("#history-add-col-category-list");
assert.deepEqual(refModes, ["紹介先", "検索"]);
await page.click("#btn-history-add-toggle");
await page.fill("#history-add-new-item", "サンプル動物病院");
await page.click("#btn-history-add-new-item");
await page.waitForTimeout(120);
assert.ok((await labels("#history-add-col-leaf-list")).includes("サンプル動物病院"));
await page.screenshot({ path: path.join(root, "tools/history-master-referral.png") });

await browser.close();
server.close();
console.log("OK: history masters picker + add + search");
