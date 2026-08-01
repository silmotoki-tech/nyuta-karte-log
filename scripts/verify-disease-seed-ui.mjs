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
