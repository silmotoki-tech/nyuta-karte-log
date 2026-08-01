/**
 * 使用状況5段階（継続/一時的/投与難/休薬中/中止）の導出・並び・履歴文言を検証する。
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
const T = new Date().toISOString().slice(0, 10);

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
      return await chromium.launch({
        executablePath,
        headless: true,
        timeout: 30_000,
      });
    } catch {
      /* next */
    }
  }
  return chromium.launch({ channel: "chrome", headless: true, timeout: 30_000 });
}

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-med-hierarchy.js"),
  "utf8"
) + `
const _ensure = (typeof ensureMeds === "function") ? ensureMeds : (k) => {
  if (!globalThis.__medStore) globalThis.__medStore = {};
  globalThis.__medStore[k] ||= {};
  return globalThis.__medStore[k];
};
`;

// Use the same mock as sort-status by inlining a self-contained store
const mockFull = `
const store = { meds: {}, items: {} };
const listeners = { meds: {}, items: new Set() };
function notifyMeds(k) {
  const list = Object.entries(store.meds[k] || {}).map(([id, d]) => ({ id, ...d }));
  (listeners.meds[k] || []).forEach((cb) => cb(list));
}
function ensureMeds(k) { store.meds[k] ||= {}; return store.meds[k]; }
export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" }, { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" }, { id: "eye", label: "点眼薬" },
  { id: "supplement", label: "サプリメント・商品" }, { id: "food", label: "フード" },
];
export function normalizeMedicationItemCategory(c) { return c || "oral"; }
export function normalizeMedicationItemKind(k) { return k === "group" ? "group" : "leaf"; }
export function medicationItemCategoryLabel(c) {
  return MEDICATION_ITEM_CATEGORIES.find((x) => x.id === c)?.label || c || "";
}
export function subscribeMedicationItems(cb) {
  listeners.items.add(cb); cb([]); return () => listeners.items.delete(cb);
}
export function subscribeMedications(karte, cb) {
  listeners.meds[karte] ||= []; listeners.meds[karte].push(cb);
  notifyMeds(karte);
  return () => { listeners.meds[karte] = (listeners.meds[karte]||[]).filter((x)=>x!==cb); };
}
export async function addMedication(karte, fields) {
  const id = "n" + Date.now();
  ensureMeds(karte)[id] = {
    schemaVersion:1, name: fields.name||"", category: fields.category||"A", prn:false,
    sideEffectNote:"", expiryEstimate: fields.expiryEstimate||"",
    events: { e0: { date: fields.eventDate||"${T}", type:"add", detail:"開始／継続",
      frequencyChange: fields.frequencyChange||"", frequency: fields.frequency||null,
      amountChange:"", changedBy: fields.changedBy||"" } }
  };
  notifyMeds(karte); return id;
}
export async function updateMedication(karte, id, fields) {
  Object.assign(ensureMeds(karte)[id] || {}, fields); notifyMeds(karte);
}
export async function deleteMedication(karte, id) { delete ensureMeds(karte)[id]; notifyMeds(karte); }
export async function addMedicationEvent(karte, drugId, fields) {
  const id = "ev" + Date.now() + Math.random().toString(36).slice(2,5);
  const drug = ensureMeds(karte)[drugId]; drug.events ||= {};
  drug.events[id] = { date: fields.date||"${T}", type: fields.type||"add", detail: fields.detail||"",
    frequencyChange: fields.frequencyChange||"", frequency: fields.frequency||null,
    amountChange: fields.amountChange||"", changedBy: fields.changedBy||"" };
  notifyMeds(karte); return id;
}
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function addMedicationItem() { return "x"; }
export async function fetchMedicationsOnce() { return []; }
export async function fetchMedicationItemsOnce() { return []; }

ensureMeds("karte-5")["cA"] = {
  schemaVersion:1, name:"継続A", category:"A",
  events:{ e:{ date:"${T}", type:"add", changedBy:"院長" } }
};
ensureMeds("karte-5")["tB"] = {
  schemaVersion:1, name:"一時的B", category:"B",
  events:{ e:{ date:"${T}", type:"temporary", changedBy:"院長" } }
};
ensureMeds("karte-5")["hC"] = {
  schemaVersion:1, name:"投与難C", category:"C",
  events:{ e:{ date:"${T}", type:"hard", changedBy:"院長" } }
};
ensureMeds("karte-5")["holdA"] = {
  schemaVersion:1, name:"休薬A", category:"A",
  events:{ e:{ date:"${T}", type:"hold", changedBy:"院長" } }
};
ensureMeds("karte-5")["stopB"] = {
  schemaVersion:1, name:"中止B", category:"B",
  events:{ e:{ date:"${T}", type:"stop", changedBy:"院長" } }
};
// 旧「使用中」相当（resume）→ 継続へ移行されること
ensureMeds("karte-5")["legacy"] = {
  schemaVersion:1, name:"旧使用中C", category:"C",
  events:{ e:{ date:"${T}", type:"resume", changedBy:"院長" } }
};
`;

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head>
<body style="margin:0;background:var(--color-cream)">
<aside style="width:100%;max-width:420px;margin:0 auto;min-height:100vh;background:var(--color-cream);padding:8px">
  <div id="panel-meds">
    <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    <p id="meds-empty"></p>
    <ul class="meds-list" id="meds-list"></ul>
  </div>
</aside>
<div class="modal" id="med-detail-sheet" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 id="med-detail-sheet-name"></h2>
      <p id="med-detail-sheet-status"></p>
      <button id="btn-close-med-detail-sheet" type="button">×</button>
    </div>
    <div class="modal__body" id="med-detail-sheet-body"></div>
    <div class="modal__footer">
      <button id="btn-med-detail-sheet-close" type="button">閉じる</button>
    </div>
  </div>
</div>
<div class="modal" id="med-add-modal" hidden>
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
  <div id="med-add-freq-every-n-numpad"></div>
  <div id="med-add-freq-weekly-numpad"></div>
  <div id="med-add-freq-weekdays"></div>
  <input id="med-add-freq-other" />
  <div id="med-add-dose-modes"></div>
  <div id="med-add-dose-presets"></div>
  <input id="med-add-dose-other" />
  <input id="med-add-start-date" type="date" />
  <input id="med-add-expiry" type="date" />
  <textarea id="med-add-note"></textarea>
  <p id="med-add-error" hidden></p>
  <button id="btn-med-add-save" type="button"></button>
  <button id="btn-med-add-cancel" type="button"></button>
  <button id="btn-close-med-add" type="button"></button>
</div>
<div class="modal" id="med-event-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__body">
      <div id="med-event-type-buttons"></div>
      <input id="med-event-date" type="date" />
      <div id="med-event-change-options" hidden></div>
      <div id="med-event-freq-block" hidden>
        <div id="med-event-freq-modes"></div>
        <div id="med-event-freq-presets"></div>
        <div id="med-event-freq-every-n-numpad"></div>
        <div id="med-event-freq-weekly-numpad"></div>
        <div id="med-event-freq-weekdays"></div>
        <input id="med-event-freq-other" />
      </div>
      <div id="med-event-amount-block" hidden>
        <div id="med-event-amount-presets"></div>
        <input id="med-event-amount-other" type="checkbox" />
        <input id="med-event-amount-other-input" />
      </div>
      <input id="med-event-detail" />
      <p id="med-event-error" hidden></p>
    </div>
    <div class="modal__footer">
      <button id="btn-med-event-save" type="button">保存する</button>
      <button id="btn-med-event-cancel" type="button">キャンセル</button>
      <button id="btn-close-med-event" type="button">×</button>
    </div>
  </div>
</div>
<script type="module">
import { initMedsUI, enterMeds, deriveStatus } from "/js/meds-ui.js";
window.__deriveStatus = deriveStatus;
initMedsUI({
  showToast: () => {},
  showError: () => {},
  setBusy: (b, busy, _, idle) => { if (b) { b.disabled = !!busy; b.textContent = busy ? "…" : idle; } },
  getSelectedAuthor: () => "院長",
});
enterMeds("karte-5");
window.__ready = true;
</script>
</body></html>
`;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/" || rel === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(harness);
        return;
      }
      if (rel === "/js/db.js") {
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(mockFull);
        return;
      }
      if (rel === "/service-worker.js") {
        res.writeHead(200, { "Content-Type": "text/javascript" });
        res.end("");
        return;
      }
      const fp = path.join(root, rel.replace(/^\//, ""));
      if (!fp.startsWith(root) || !fs.existsSync(fp)) {
        res.writeHead(404);
        res.end("nf");
        return;
      }
      const ct = rel.endsWith(".css")
        ? "text/css"
        : rel.endsWith(".js")
          ? "text/javascript"
          : "text/html";
      res.writeHead(200, { "Content-Type": ct });
      res.end(fs.readFileSync(fp));
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

const { server, base } = await startServer();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);

  const unit = await page.evaluate(() => {
    const d = window.__deriveStatus;
    return [
      ["add→継続", d({ events: { a: { date: "2026-08-01", type: "add" } } }), "continue", "継続"],
      ["temporary", d({ events: { a: { date: "2026-08-01", type: "temporary" } } }), "temporary", "一時的"],
      ["hard", d({ events: { a: { date: "2026-08-01", type: "hard" } } }), "hard", "投与難"],
      ["hold", d({ events: { a: { date: "2026-08-01", type: "hold" } } }), "hold", "休薬中"],
      ["stop", d({ events: { a: { date: "2026-08-01", type: "stop" } } }), "stopped", "中止"],
      ["resume→継続", d({ events: { a: { date: "2026-08-01", type: "resume" } } }), "continue", "継続"],
    ].map(([name, got, id, label]) => ({
      name,
      ok: got.id === id && got.label === label,
      got,
      want: { id, label },
    }));
  });
  console.log("UNIT", unit);
  assert.ok(unit.every((u) => u.ok), "deriveStatus unit failed");

  await page.waitForTimeout(120);
  const list = await page.evaluate(() =>
    [...document.querySelectorAll("#meds-list .med-card")].map((li) => ({
      name: li.querySelector(".med-card__name")?.textContent?.trim(),
      status: li.querySelector(".med-status")?.textContent?.trim(),
      cls: li.querySelector(".med-status")?.className || "",
    }))
  );
  console.log("LIST", list);
  assert.deepEqual(
    list.map((x) => x.status),
    ["継続", "継続", "一時的", "投与難", "休薬中", "中止"]
  );
  assert.deepEqual(
    list.map((x) => x.name),
    ["継続A", "旧使用中C", "一時的B", "投与難C", "休薬A", "中止B"]
  );
  assert.ok(list[0].cls.includes("med-status--continue"));
  assert.ok(list[2].cls.includes("med-status--temporary"));
  assert.ok(list[3].cls.includes("med-status--hard"));

  const shotList = path.join(root, "tools/med-status-5way-list.png");
  await page.screenshot({ path: shotList, fullPage: true });
  console.log("screenshot:", shotList);

  // 詳細: 出来事ボタンに一時的・投与難があること
  await page.locator("#meds-list .med-card", { hasText: "継続A" }).click();
  await page.waitForSelector("#med-detail-sheet:not([hidden])");
  const quickLabels = await page
    .locator("#med-detail-sheet-body .med-event-quick__btn")
    .allTextContents();
  console.log("QUICK", quickLabels);
  for (const need of ["継続", "一時的", "投与難", "休薬中", "中止"]) {
    assert.ok(quickLabels.includes(need), `missing quick btn ${need}`);
  }
  const shotBtns = path.join(root, "tools/med-status-5way-event-buttons.png");
  await page.screenshot({ path: shotBtns, fullPage: true });

  // 一時的を記録
  await page.locator(".med-event-quick__btn", { hasText: "一時的" }).click();
  await page.waitForSelector("#med-event-modal:not([hidden])");
  await page.click("#btn-med-event-save");
  await page.waitForTimeout(200);
  let status = await page.locator("#meds-list .med-card", { hasText: "継続A" })
    .locator(".med-status")
    .textContent();
  assert.equal(status?.trim(), "一時的");

  // 投与難を記録
  await page.locator(".med-event-quick__btn", { hasText: "投与難" }).click();
  await page.waitForSelector("#med-event-modal:not([hidden])");
  await page.click("#btn-med-event-save");
  await page.waitForTimeout(200);
  status = await page.locator("#meds-list .med-card", { hasText: "継続A" })
    .locator(".med-status")
    .textContent();
  assert.equal(status?.trim(), "投与難");

  const hist = await page.locator("#med-detail-sheet-body").innerText();
  assert.ok(hist.includes("一時的にした"), "history missing 一時的にした");
  assert.ok(hist.includes("投与難になった"), "history missing 投与難になった");
  const shotHist = path.join(root, "tools/med-status-5way-history.png");
  await page.screenshot({ path: shotHist, fullPage: true });
  console.log("screenshot:", shotHist);

  assert.equal(errors.length, 0, "page errors: " + errors.join(" | "));
  console.log("PASS");
} finally {
  await browser.close();
  server.close();
}
