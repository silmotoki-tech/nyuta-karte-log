/**
 * 投与頻度・投与量: 左の指定方法行高さと右の選択肢マス高さが揃うことを検証する。
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
const outDir = path.join(root, "tools", "med-freq-dose-balance");
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
export async function addMedication() { return "x"; }
export async function updateMedication() {}
export async function deleteMedication() {}
export async function addMedicationItem() { return "x"; }
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
store.medicationItems["g1"] = { schemaVersion:1, label:"抗菌薬", category:"oral", kind:"group", parentId:null, order:1 };
store.medicationItems["l1"] = { schemaVersion:1, label:"アモキシシリン", category:"oral", kind:"leaf", parentId:"g1", order:1 };
`;

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const harness = indexHtml
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
  .replace(
    "</body>",
    `<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
initMedsUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
  getSelectedAuthor: () => "検証",
});
enterMeds("karte-balance");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
document.querySelectorAll(".right-panel").forEach((p) => { p.hidden = true; });
document.getElementById("panel-meds").hidden = false;
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
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");

async function measure(pickerSel, modeName, rightListSel, expectedModes) {
  await page.locator(pickerSel).scrollIntoViewIfNeeded();
  await page.locator(`${pickerSel} [data-col="mode"]`).getByRole("option", { name: modeName }).click();
  await page.waitForSelector(`${pickerSel} ${rightListSel} .med-linear-picker__item`);
  return page.evaluate(
    ({ pickerSel: ps, rightListSel: rs, expectedModes: em }) => {
      const picker = document.querySelector(ps);
      const modes = [...picker.querySelectorAll('[data-col="mode"] .med-linear-picker__item')];
      const rights = [...picker.querySelectorAll(`${rs} .med-linear-picker__item`)];
      const modeHs = modes.map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);
      const rightHs = rights.slice(0, em).map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);
      const modeRows = getComputedStyle(picker).getPropertyValue("--mode-rows").trim();
      const leftCol = picker.querySelector('[data-col="mode"]');
      const rightCol = picker.querySelector('[data-col="detail"]');
      return {
        modeRows,
        modeCount: modes.length,
        rightCount: rights.length,
        modeHs,
        rightHs,
        leftH: Math.round(leftCol.getBoundingClientRect().height * 10) / 10,
        rightH: Math.round(rightCol.getBoundingClientRect().height * 10) / 10,
        avgMode: modeHs.reduce((a, b) => a + b, 0) / modeHs.length,
        avgRight: rightHs.reduce((a, b) => a + b, 0) / rightHs.length,
      };
    },
    { pickerSel, rightListSel, expectedModes }
  );
}

const freq = await measure(
  "#med-add-freq-picker",
  "よくある",
  "#med-add-freq-presets",
  5
);
console.log("freq", freq);
assert.equal(freq.modeRows, "5");
assert.equal(freq.modeCount, 5);
assert.ok(freq.rightCount >= 5);
const freqDiff = Math.abs(freq.avgMode - freq.avgRight);
assert.ok(freqDiff <= 2, `freq cell height mismatch ${freq.avgMode} vs ${freq.avgRight}`);
assert.ok(Math.abs(freq.leftH - freq.rightH) <= 2, "freq column heights differ");

await page.screenshot({
  path: path.join(outDir, "01-freq-balance.png"),
  fullPage: false,
});
const freqBox = await page.locator("#med-add-freq-picker").boundingBox();
await page.screenshot({
  path: path.join(outDir, "02-freq-crop.png"),
  clip: {
    x: Math.max(0, freqBox.x - 6),
    y: Math.max(0, freqBox.y - 6),
    width: freqBox.width + 12,
    height: freqBox.height + 12,
  },
});

const dose = await measure(
  "#med-add-dose-picker",
  "錠数（整数）",
  "#med-add-dose-integer",
  3
);
console.log("dose", dose);
assert.equal(dose.modeRows, "3");
assert.equal(dose.modeCount, 3);
assert.ok(dose.rightCount >= 3);
const doseDiff = Math.abs(dose.avgMode - dose.avgRight);
assert.ok(doseDiff <= 2, `dose cell height mismatch ${dose.avgMode} vs ${dose.avgRight}`);
assert.ok(Math.abs(dose.leftH - dose.rightH) <= 2, "dose column heights differ");

await page.locator("#med-add-dose-picker").scrollIntoViewIfNeeded();
await page.screenshot({
  path: path.join(outDir, "03-dose-balance.png"),
  fullPage: false,
});
const doseBox = await page.locator("#med-add-dose-picker").boundingBox();
await page.screenshot({
  path: path.join(outDir, "04-dose-crop.png"),
  clip: {
    x: Math.max(0, doseBox.x - 6),
    y: Math.max(0, doseBox.y - 6),
    width: doseBox.width + 12,
    height: doseBox.height + 12,
  },
});

await browser.close();
server.close();
console.log("OK: med freq/dose height balance");
console.log("shots:", outDir);
