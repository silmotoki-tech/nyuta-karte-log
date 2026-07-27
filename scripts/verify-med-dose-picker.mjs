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
