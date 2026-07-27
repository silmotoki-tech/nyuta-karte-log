/**
 * 薬剤一覧: 使用状況→カテゴリ順、頓服マーク、期限超過「○日超過」を検証する。
 */
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

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(base, n) {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const T = today();
const overdue3 = addDays(T, -3);
const near2 = addDays(T, 2);

const mockDb = `
const store = { medicationItems: {}, medications: {} };
const medListeners = new Map();
function ensureMeds(k) {
  if (!store.medications[k]) store.medications[k] = {};
  return store.medications[k];
}
function notifyMeds(k) {
  const drugs = Object.entries(ensureMeds(k)).map(([id, d]) => ({ id, ...d, events: d.events || {} }));
  (medListeners.get(k) || []).forEach((cb) => cb(drugs.map((x) => structuredClone(x))));
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
export function subscribeMedicationItems(cb) { cb([]); return () => {}; }
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
export async function addMedicationEvent() { return "x"; }
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function fetchMedicationItemsOnce() { return []; }
export async function fetchMedicationsOnce() { return []; }

// seed: 意図的にカテゴリ順と異なる登録順で、使用状況混在
ensureMeds("karte-sort")["d1"] = {
  schemaVersion:1, name:"中止のA薬", category:"A", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"stop", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d2"] = {
  schemaVersion:1, name:"使用中のC薬", category:"C", sideEffectNote:"", expiryEstimate:"${near2}",
  events:{ e:{ date:"${T}", type:"add", frequencyChange:"1日1回", frequency:{kind:"preset",label:"1日1回"}, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d3"] = {
  schemaVersion:1, name:"休薬のB薬", category:"B", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"hold", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d4"] = {
  schemaVersion:1, name:"使用中のA頓服", category:"A", sideEffectNote:"", expiryEstimate:"${overdue3}",
  events:{ e:{ date:"${T}", type:"add", frequencyChange:"頓服", frequency:{kind:"preset",label:"頓服"}, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d5"] = {
  schemaVersion:1, name:"使用中のB薬", category:"B", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"resume", frequencyChange:"1日2回", frequency:{kind:"preset",label:"1日2回"}, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d6"] = {
  schemaVersion:1, name:"休薬のA薬", category:"A", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"hold", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
};
ensureMeds("karte-sort")["d7"] = {
  schemaVersion:1, name:"中止のC薬", category:"C", sideEffectNote:"", expiryEstimate:"",
  events:{ e:{ date:"${T}", type:"stop", frequencyChange:"", frequency:null, amountChange:"", changedBy:"院長" } }
};
`;

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head>
<body style="margin:0;background:var(--color-cream)">
<aside class="right-column" style="width:100%;max-width:420px;margin:0 auto;min-height:100vh;background:var(--color-cream)">
  <div class="right-panel" id="panel-meds">
    <div class="exam-toolbar">
      <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    </div>
    <section class="exam-section">
      <h3 class="exam-section__title">薬剤一覧</h3>
      <p class="field__note" id="meds-empty"></p>
      <ul class="meds-list" id="meds-list" spellcheck="false"></ul>
    </section>
  </div>
</aside>
<div class="modal" id="med-detail-sheet" hidden>
  <button id="btn-close-med-detail-sheet" type="button"></button>
  <p id="med-detail-sheet-name"></p>
  <p id="med-detail-sheet-status"></p>
  <div id="med-detail-sheet-body"></div>
  <button id="btn-med-detail-sheet-close" type="button"></button>
</div>
<div class="modal" id="med-add-modal" hidden>
  <button id="btn-close-med-add" type="button"></button>
  <div id="med-add-col-category-list"></div>
  <div id="med-add-col-group-list"></div>
  <div id="med-add-col-leaf-list"></div>
  <p id="med-add-items-empty" hidden></p>
  <div id="med-add-item-add" hidden>
    <label id="med-add-new-item-label"></label>
    <input id="med-add-new-item" /><button id="btn-med-add-new-item" type="button"></button>
    <p id="med-add-item-error" hidden></p>
  </div>
  <button id="btn-med-add-toggle" hidden type="button"></button>
  <div id="med-add-category-buttons"></div>
  <div id="med-add-freq-modes"></div>
  <div id="med-add-freq-presets"></div>
  <div id="med-add-freq-panel-preset"></div>
  <div id="med-add-freq-panel-every-n" hidden></div>
  <div id="med-add-freq-every-n-presets"></div>
  <div id="med-add-freq-every-n-numpad"></div>
  <button id="med-add-freq-period" type="button"></button>
  <button id="med-add-freq-times" type="button"></button>
  <div id="med-add-freq-panel-weekly" hidden></div>
  <div id="med-add-freq-weekly-presets"></div>
  <div id="med-add-freq-weekly-numpad"></div>
  <p id="med-add-freq-weekly-display"></p>
  <div id="med-add-freq-panel-weekdays" hidden></div>
  <div id="med-add-freq-weekdays"></div>
  <div id="med-add-freq-panel-other" hidden></div>
  <input id="med-add-freq-other-input" type="text" />
  <input id="med-add-date" type="date" />
  <input id="med-add-note" type="text" />
  <p id="med-add-error" hidden></p>
  <button id="btn-med-add-save" type="button"></button>
  <button id="btn-med-add-cancel" type="button"></button>
  <button id="btn-med-add-toggle" type="button" hidden></button>
</div>
<div class="modal" id="med-event-modal" hidden>
  <button id="btn-close-med-event" type="button"></button>
  <div id="med-event-type-buttons"></div>
  <div id="med-event-change-options"></div>
  <input id="med-event-freq-check" type="checkbox" />
  <input id="med-event-amount-check" type="checkbox" />
  <div id="med-event-freq-block"></div>
  <div id="med-event-amount-block"></div>
  <div id="med-event-amount-presets"></div>
  <input id="med-event-amount-other" type="checkbox" />
  <input id="med-event-amount-other-input" type="text" />
  <input id="med-event-date" type="date" />
  <input id="med-event-detail" type="text" />
  <p id="med-event-error" hidden></p>
  <button id="btn-med-event-save" type="button"></button>
  <button id="btn-med-event-cancel" type="button"></button>
  <div id="med-event-freq-modes"></div>
  <div id="med-event-freq-presets"></div>
  <div id="med-event-freq-panel-preset"></div>
  <div id="med-event-freq-panel-every-n" hidden></div>
  <div id="med-event-freq-every-n-presets"></div>
  <div id="med-event-freq-every-n-numpad"></div>
  <button id="med-event-freq-period" type="button"></button>
  <button id="med-event-freq-times" type="button"></button>
  <div id="med-event-freq-panel-weekly" hidden></div>
  <div id="med-event-freq-weekly-presets"></div>
  <div id="med-event-freq-weekly-numpad"></div>
  <p id="med-event-freq-weekly-display"></p>
  <div id="med-event-freq-panel-weekdays" hidden></div>
  <div id="med-event-freq-weekdays"></div>
  <div id="med-event-freq-panel-other" hidden></div>
  <input id="med-event-freq-other-input" type="text" />
  <div id="med-event-freq-detail-head"></div>
</div>
<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
initMedsUI({
  showToast: () => {},
  showError: () => {},
  setBusy: () => {},
  getSelectedAuthor: () => "院長",
});
enterMeds("karte-sort");
window.__ready = true;
</script>
</body></html>`;

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
  viewport: { width: 440, height: 900 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.warn("pageerror", e.message));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(120);

const info = await page.evaluate(() => {
  const nameOf = (el) =>
    el?.getAttribute("aria-label") ||
    (el?.dataset.name || "").replace(/\u200B/g, "") ||
    (el?.textContent || "").replace(/\u200B/g, "");
  const cards = [...document.querySelectorAll("#meds-list .med-card")].map((li) => ({
    name: nameOf(li.querySelector(".med-card__name")),
    status: li.querySelector(".med-status")?.textContent?.trim() || "",
    cat: li.querySelector(".med-cat")?.textContent?.trim() || "",
    prn: Boolean(li.querySelector(".med-sign--prn")),
    expiry: li.querySelector(".med-inline-status")?.textContent?.trim() || "",
    overdueClass: Boolean(li.querySelector(".med-inline-status--overdue")),
  }));
  return cards;
});

console.log("order", info);

const expectedNames = [
  "使用中のA頓服",
  "使用中のB薬",
  "使用中のC薬",
  "休薬のA薬",
  "休薬のB薬",
  "中止のA薬",
  "中止のC薬",
];
const gotNames = info.map((x) => x.name);
if (gotNames.join("|") !== expectedNames.join("|")) {
  throw new Error(`sort mismatch\n expected ${expectedNames.join("|")}\n got ${gotNames.join("|")}`);
}

const statuses = info.map((x) => x.status);
if (
  statuses.join("|") !==
  "使用中|使用中|使用中|休薬中|休薬中|中止|中止"
) {
  throw new Error(`status order wrong: ${statuses.join("|")}`);
}

const prnCard = info.find((x) => x.name === "使用中のA頓服");
if (!prnCard?.prn) throw new Error("prn mark missing on 頓服 drug");
if (!prnCard.overdueClass || prnCard.expiry !== "3日超過") {
  throw new Error(`overdue label wrong: ${JSON.stringify(prnCard)}`);
}

const nearCard = info.find((x) => x.name === "使用中のC薬");
if (nearCard?.expiry !== "あと2日") {
  throw new Error(`near label wrong: ${JSON.stringify(nearCard)}`);
}

await page.screenshot({
  path: path.join(root, "tools/med-sort-status-order.png"),
});

await browser.close();
server.close();
console.log("OK: med sort + prn + overdue days");
