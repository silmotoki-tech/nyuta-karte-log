import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function findChromeHeadlessShell() {
  if (process.env.PLAYWRIGHT_ARM_SHELL && fs.existsSync(process.env.PLAYWRIGHT_ARM_SHELL)) {
    return process.env.PLAYWRIGHT_ARM_SHELL;
  }
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
  const headlessShell = findChromeHeadlessShell();
  // Prefer Playwright's bundled headless shell (system Chrome often fails in sandbox).
  const candidates = [
    headlessShell,
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
      console.warn(`launch failed (${executablePath}):`, err.message);
    }
  }

  try {
    const browser = await chromium.launch({ channel: "chrome", headless: true, timeout: 30_000 });
    console.log("browser: channel chrome");
    return browser;
  } catch (err) {
    console.warn("launch failed (channel chrome):", err.message);
  }

  throw new Error(
    "Could not launch Chromium. Install Google Chrome or set PLAYWRIGHT_ARM_SHELL."
  );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function ymdOffset(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const nearDate = ymdOffset(3);
const overdueDate = ymdOffset(-2);

const mockDb = `
const store = { medicationItems: {}, medications: {} };
const itemListeners = [];
const medListeners = new Map();
let seq = 0;
const nid = (p) => p + (++seq);

function ensureMeds(k) {
  if (!store.medications[k]) store.medications[k] = {};
  return store.medications[k];
}
function notifyItems() {
  const items = Object.entries(store.medicationItems).map(([id, t]) => ({ id, ...t }));
  items.sort((a,b) => (a.label||"").localeCompare(b.label||""));
  itemListeners.forEach((cb) => cb(items.map(x => ({...x}))));
}
function notifyMeds(k) {
  const drugs = Object.entries(ensureMeds(k)).map(([id, d]) => ({ id, ...d, events: d.events || {} }));
  (medListeners.get(k) || []).forEach((cb) => cb(drugs.map(x => structuredClone(x))));
}

export function subscribeMedicationItems(cb) {
  itemListeners.push(cb);
  notifyItems();
  return () => { const i = itemListeners.indexOf(cb); if (i>=0) itemListeners.splice(i,1); };
}
export function subscribeMedications(karte, cb) {
  const list = medListeners.get(karte) || [];
  list.push(cb);
  medListeners.set(karte, list);
  notifyMeds(karte);
  return () => medListeners.set(karte, (medListeners.get(karte)||[]).filter(x => x !== cb));
}
export async function addMedicationItem({ label }) {
  const id = nid("mitem");
  store.medicationItems[id] = { label: label || "", order: Date.now() };
  notifyItems();
  return id;
}
export async function addMedication(karte, { name, category }) {
  const id = nid("drug");
  ensureMeds(karte)[id] = {
    schemaVersion: 1,
    name: name || "",
    category: category || "B",
    expiryEstimate: "",
    sideEffectNote: "",
    events: {
      [nid("ev")]: { type: "add", date: "2026-01-01", createdAt: Date.now() },
    },
  };
  notifyMeds(karte);
  return id;
}
export async function updateMedication(karte, drugId, patch) {
  const row = ensureMeds(karte)[drugId];
  if (!row) throw new Error("missing drug");
  Object.assign(row, patch || {});
  notifyMeds(karte);
}
export async function deleteMedication() {}
export async function addMedicationEvent() {}
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function fetchMedicationsOnce(karte) {
  return Object.entries(ensureMeds(karte)).map(([id, d]) => ({ id, ...d }));
}
`;

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>med expiry autosave harness</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside class="right-column" style="width:100%;max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <div id="right-tabs" class="right-tabs">
    <button type="button" class="right-tab is-active" data-tab="meds">薬剤情報</button>
  </div>
  <p id="right-empty" hidden></p>
  <div class="right-panel" id="panel-meds" data-panel="meds">
    <div class="exam-toolbar">
      <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    </div>
    <section class="exam-section">
      <h3 class="exam-section__title">薬剤一覧</h3>
      <p class="field__note" id="meds-empty">登録された薬剤はありません。</p>
      <ul class="meds-list" id="meds-list"></ul>
    </section>
  </div>
</aside>
<p id="toast" hidden style="position:fixed;bottom:12px;left:12px;right:12px;background:#333;color:#fff;padding:8px;z-index:99"></p>

<div class="modal" id="med-add-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="med-add-modal-title">薬剤を追加</h2>
      <button class="modal__close" id="btn-close-med-add" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <span class="label">薬剤名</span>
        <div class="exam-item-buttons" id="med-add-item-buttons"></div>
        <p class="field__note" id="med-add-items-empty" hidden></p>
        <div class="exam-item-add">
          <label class="label label--sub" for="med-add-new-item">新しい薬剤を追加</label>
          <div class="exam-item-add__row">
            <input id="med-add-new-item" class="input" type="text" />
            <button id="btn-med-add-new-item" class="btn btn--small btn--outline" type="button">追加</button>
          </div>
          <p id="med-add-item-error" class="error-text" hidden></p>
        </div>
      </div>
      <div class="field">
        <span class="label">カテゴリ</span>
        <div class="med-category-buttons" id="med-add-category-buttons"></div>
      </div>
      <div class="field">
        <span class="label">初期の投与頻度（任意）</span>
        <div id="med-add-freq-modes"></div>
        <div id="med-add-freq-panel-preset"><div id="med-add-freq-presets"></div></div>
        <div id="med-add-freq-panel-every-n" hidden>
          <button type="button" id="med-add-freq-period"></button>
          <button type="button" id="med-add-freq-times"></button>
          <div id="med-add-freq-every-n-numpad"></div>
        </div>
        <div id="med-add-freq-panel-weekly" hidden>
          <p id="med-add-freq-weekly-display"></p>
          <div id="med-add-freq-weekly-numpad"></div>
        </div>
        <div id="med-add-freq-panel-weekdays" hidden><div id="med-add-freq-weekdays"></div></div>
        <div id="med-add-freq-panel-other" hidden>
          <input id="med-add-freq-other-input" class="input" type="text" />
        </div>
      </div>
      <p id="med-add-error" class="error-text" hidden></p>
      <button id="btn-med-add-save" class="btn btn--small btn--primary" type="button">追加する</button>
      <button id="btn-med-add-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<div class="modal" id="med-event-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button id="btn-close-med-event" type="button"></button>
    <div id="med-event-type-buttons"></div>
    <input id="med-event-date" type="date" />
    <div id="med-event-change-options" hidden></div>
    <input id="med-event-freq-check" type="checkbox" />
    <div id="med-event-freq-block" hidden>
      <div id="med-event-freq-modes"></div>
      <div id="med-event-freq-panel-preset"><div id="med-event-freq-presets"></div></div>
      <div id="med-event-freq-panel-every-n" hidden>
        <button type="button" id="med-event-freq-period"></button>
        <button type="button" id="med-event-freq-times"></button>
        <div id="med-event-freq-every-n-numpad"></div>
      </div>
      <div id="med-event-freq-panel-weekly" hidden>
        <p id="med-event-freq-weekly-display"></p>
        <div id="med-event-freq-weekly-numpad"></div>
      </div>
      <div id="med-event-freq-panel-weekdays" hidden><div id="med-event-freq-weekdays"></div></div>
      <div id="med-event-freq-panel-other" hidden>
        <input id="med-event-freq-other-input" type="text" />
      </div>
    </div>
    <input id="med-event-amount-check" type="checkbox" />
    <div id="med-event-amount-block" hidden>
      <div id="med-event-amount-presets"></div>
      <input id="med-event-amount-other" type="checkbox" />
      <input id="med-event-amount-other-input" type="text" hidden />
    </div>
    <textarea id="med-event-detail"></textarea>
    <p id="med-event-error" hidden></p>
    <button id="btn-med-event-save" type="button"></button>
    <button id="btn-med-event-cancel" type="button"></button>
  </div>
</div>

<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
import { addMedication } from "/js/db.js";
const toast = document.getElementById("toast");
initMedsUI({
  showToast: (m) => { toast.hidden = !m; toast.textContent = m || ""; console.log("toast", m); },
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
  getSelectedAuthor: () => "院長",
});
await addMedication("karte-exp", { name: "プレドニゾロン", category: "B" });
enterMeds("karte-exp");
window.__ready = true;
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/med-expiry-harness.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const filePath = path.join(root, urlPath.replace(/^\//, ""));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/med-expiry-harness.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(200);

await page.locator(".med-card__header").first().click();
await page.waitForSelector(".med-expiry-row");

const detailText = await page.locator(".med-card.is-expanded").innerText();
if (detailText.includes("期限を保存")) throw new Error("save button still present");
if (detailText.includes("1ヶ月後") || detailText.includes("3ヶ月後")) {
  throw new Error("quick buttons still present");
}
if ((await page.locator(".med-expiry-row .med-expiry-clear").count()) !== 1) {
  throw new Error("clear button should be beside date input");
}
await page.screenshot({ path: path.join(root, "tools/med-expiry-ui.png") });

// change イベント＝カレンダーで ✅ 確定したときと同じ
await page.locator(".med-expiry-row input[type='date']").fill(nearDate);
await page.locator(".med-expiry-row input[type='date']").dispatchEvent("change");
await page.waitForFunction(
  () => (document.getElementById("toast")?.textContent || "").includes("保存")
);

const listNear = await page.locator("#meds-list").innerText();
console.log("LIST NEAR", listNear);
if (!listNear.includes("あと3日")) throw new Error(`approaching label missing: ${listNear}`);
if (!(await page.locator(".med-card.is-alert").count())) {
  throw new Error("is-alert missing");
}
const noteNear = await page.locator(".med-expiry-note--near").innerText();
console.log("NOTE NEAR", noteNear);
if (!noteNear.includes("あと3日")) throw new Error("detail note missing countdown");
await page.screenshot({ path: path.join(root, "tools/med-expiry-near.png") });

await page.locator(".med-expiry-row input[type='date']").fill(overdueDate);
await page.locator(".med-expiry-row input[type='date']").dispatchEvent("change");
await page.waitForTimeout(250);
const listOver = await page.locator("#meds-list").innerText();
console.log("LIST OVER", listOver);
if (!listOver.includes("期限超過")) throw new Error("overdue label missing");
if (!(await page.locator(".med-card.is-overdue").count())) {
  throw new Error("is-overdue missing");
}
await page.screenshot({ path: path.join(root, "tools/med-expiry-overdue.png") });

await page.locator(".med-expiry-clear").click();
await page.waitForTimeout(250);
const listClear = await page.locator("#meds-list").innerText();
if (listClear.includes("期限超過") || /あと\d+日/.test(listClear)) {
  throw new Error("alerts should disappear after clear");
}

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: med expiry autosave + alerts");
await browser.close();
server.close();
