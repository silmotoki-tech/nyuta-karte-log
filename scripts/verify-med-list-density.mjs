/**
 * 薬剤一覧の行密度（余白・文字サイズ）を検証し、スクリーンショットを残す。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const label = process.argv[2] || "after";
const out = path.join(root, `tools/med-list-density-${label}.png`);

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

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
export function subscribeMedicationItems(cb) { itemListeners.push(cb); cb([]); return () => {}; }
export function subscribeMedications(karte, cb) {
  const list = medListeners.get(karte) || [];
  list.push(cb); medListeners.set(karte, list); notifyMeds(karte);
  return () => {};
}
function seed() {
  const k = "karte-density";
  const m = ensureMeds(k);
  m.d1 = { schemaVersion:1, name:"プレドニゾロン", category:"A", sideEffectNote:"", expiryEstimate:"2026-08-01",
    events:{ e1:{ date:"2026-07-20", type:"add", detail:"開始", frequencyChange:"1日1回", frequency:null, amountChange:"", changedBy:"院長" } } };
  m.d2 = { schemaVersion:1, name:"アモキシシリン", category:"A", sideEffectNote:"", expiryEstimate:"2026-07-26",
    events:{ e1:{ date:"2026-07-10", type:"add", detail:"開始", frequencyChange:"1日2回", frequency:null, amountChange:"", changedBy:"" } } };
  m.d3 = { schemaVersion:1, name:"マロピタント", category:"B", sideEffectNote:"", expiryEstimate:"",
    events:{ e1:{ date:"2026-06-01", type:"hold", detail:"休薬", frequencyChange:"", frequency:null, amountChange:"", changedBy:"" } } };
  m.d4 = { schemaVersion:1, name:"イソジンゲル", category:"B", sideEffectNote:"", expiryEstimate:"2026-06-01",
    events:{ e1:{ date:"2026-05-01", type:"stop", detail:"中止", frequencyChange:"", frequency:null, amountChange:"", changedBy:"" } } };
  m.d5 = { schemaVersion:1, name:"ヒアレイン", category:"C", sideEffectNote:"", expiryEstimate:"",
    events:{ e1:{ date:"2026-07-01", type:"add", detail:"開始", frequencyChange:"1日3回", frequency:null, amountChange:"", changedBy:"" } } };
}
seed();
export async function addMedication() {}
export async function updateMedication() {}
export async function deleteMedication() {}
export async function addMedicationItem() { return nid("mi"); }
export async function updateMedicationItem() {}
export async function deleteMedicationItem() {}
export async function addMedicationEvent() { return nid("me"); }
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function fetchMedicationItemsOnce() { return []; }
export async function fetchMedicationsOnce(karte) {
  return Object.entries(ensureMeds(karte)).map(([id, d]) => ({ id, ...d, events: d.events || {} }));
}
`;

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head><body>
<aside class="right-column" style="width:100%;max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <div id="right-tabs" class="right-tabs">
    <button type="button" class="right-tab" data-tab="exam">検査</button>
    <button type="button" class="right-tab is-active" data-tab="meds">薬剤情報</button>
  </div>
  <p id="right-empty" hidden></p>
  <div class="right-panel" id="panel-exam" data-panel="exam" hidden></div>
  <div class="right-panel" id="panel-meds" data-panel="meds">
    <div class="exam-toolbar">
      <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    </div>
    <section class="exam-section">
      <h3 class="exam-section__title">薬剤一覧</h3>
      <p class="field__note" id="meds-empty" hidden></p>
      <ul class="meds-list" id="meds-list"></ul>
    </section>
  </div>
</aside>
<div class="modal" id="med-add-modal" hidden>
  <div class="modal__panel modal__panel--med-add">
    <button id="btn-close-med-add" type="button"></button>
    <div id="med-add-linear-picker" class="med-linear-picker" data-cols="3">
      <div class="med-linear-picker__col"><div id="med-add-col-category-list"></div></div>
      <div class="med-linear-picker__col is-placeholder" id="med-add-col-group"><div id="med-add-col-group-list"></div></div>
      <div class="med-linear-picker__col med-linear-picker__col--leaf is-placeholder" id="med-add-col-leaf">
        <div id="med-add-col-leaf-list"></div>
        <p id="med-add-items-empty" hidden></p>
        <div id="med-add-item-add"><label id="med-add-new-item-label"></label>
          <input id="med-add-new-item" /><button id="btn-med-add-new-item" type="button">追加</button></div>
        <p id="med-add-item-error" hidden></p>
      </div>
    </div>
    <div id="med-add-category-buttons"></div>
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
    <div id="med-add-freq-panel-other" hidden><input id="med-add-freq-other-input" /></div>
    <p id="med-add-error" hidden></p>
    <button id="btn-med-add-save" type="button"></button>
    <button id="btn-med-add-cancel" type="button"></button>
  </div>
</div>
<div class="modal" id="med-detail-sheet" hidden>
  <button id="btn-close-med-detail-sheet" type="button"></button>
  <p id="med-detail-sheet-name"></p>
  <p id="med-detail-sheet-status"></p>
  <div id="med-detail-sheet-body"></div>
  <button id="btn-med-detail-sheet-close" type="button"></button>
</div>
<div class="modal" id="med-event-modal" hidden>
  <button id="btn-close-med-event" type="button"></button>
  <h2 id="med-event-modal-title"></h2>
  <div id="med-event-type-buttons"></div>
  <input id="med-event-date" type="date" />
  <div id="med-event-change-options" hidden>
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
      <div id="med-event-freq-panel-other" hidden><input id="med-event-freq-other-input" /></div>
    </div>
    <input id="med-event-amount-check" type="checkbox" />
    <div id="med-event-amount-block" hidden>
      <div id="med-event-amount-presets"></div>
      <input id="med-event-amount-other-check" type="checkbox" />
      <input id="med-event-amount-other-input" hidden />
    </div>
  </div>
  <input id="med-event-detail" />
  <input id="med-event-changed-by" />
  <p id="med-event-error" hidden></p>
  <button id="btn-med-event-save" type="button"></button>
  <button id="btn-med-event-cancel" type="button"></button>
</div>
<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
initMedsUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterMeds("karte-density");
window.__ready = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/med-density.html") {
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
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`http://127.0.0.1:${port}/tools/med-density.html`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(400);

const metrics = await page.evaluate(() => {
  const header = document.querySelector(".med-card__header");
  const name = document.querySelector(".med-card__name");
  const st = document.querySelector(".med-status");
  const cat = document.querySelector(".med-cat");
  const inline = document.querySelector(".med-inline-status");
  const cs = (el) => (el ? getComputedStyle(el) : null);
  return {
    rowCount: document.querySelectorAll(".med-card").length,
    headerH: header?.getBoundingClientRect().height,
    headerPad: cs(header)?.padding,
    nameSize: cs(name)?.fontSize,
    statusSize: cs(st)?.fontSize,
    inlineSize: cs(inline)?.fontSize,
    cat: cat
      ? {
          w: Math.round(cat.getBoundingClientRect().width),
          h: Math.round(cat.getBoundingClientRect().height),
          font: cs(cat).fontSize,
        }
      : null,
  };
});
console.log(label, metrics);

if (metrics.rowCount < 5) throw new Error("expected seeded med rows");
if (label === "after") {
  if (metrics.headerH < 44) {
    throw new Error(`row height too small after densify: ${metrics.headerH}`);
  }
  const namePx = parseFloat(metrics.nameSize);
  if (namePx < 15) {
    throw new Error(`name font too small after densify: ${metrics.nameSize}`);
  }
}

await page.screenshot({ path: out });
console.log("wrote", out);

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}

await browser.close();
server.close();
