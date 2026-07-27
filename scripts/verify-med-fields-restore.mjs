/**
 * 薬剤: 追加（日付・期限・メモ）／詳細（期限・メモ）／出来事（日付）の復元を検証する。
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
const near = addDays(T, 14);
const later = addDays(T, 30);

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
  const date = payload.eventDate || "${T}";
  ensureMeds(karte)[id] = {
    schemaVersion: 1,
    name: payload.name,
    category: payload.category || "A",
    sideEffectNote: payload.sideEffectNote || "",
    expiryEstimate: payload.expiryEstimate || "",
    events: {
      e0: {
        date,
        type: "add",
        detail: "開始／継続",
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
  const d = ensureMeds(karte)[id];
  if (!d) throw new Error("missing");
  Object.assign(d, fields);
  notifyMeds(karte);
}
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
export async function addMedicationEvent(karte, drugId, payload) {
  const id = "ev-" + Math.random().toString(36).slice(2, 8);
  const d = ensureMeds(karte)[drugId];
  if (!d.events) d.events = {};
  d.events[id] = { ...payload };
  notifyMeds(karte);
  return id;
}
export async function updateMedicationEvent(karte, drugId, eventId, fields) {
  const d = ensureMeds(karte)[drugId];
  Object.assign(d.events[eventId], fields);
  notifyMeds(karte);
}
export async function deleteMedicationEvent() {}
export async function fetchMedicationItemsOnce() {
  return Object.entries(store.medicationItems).map(([id, it]) => ({ id, ...it }));
}
export async function fetchMedicationsOnce(karte) {
  return Object.entries(ensureMeds(karte)).map(([id, d]) => ({ id, ...d, events: d.events || {} }));
}

// seed master + existing drug with data (DB残存確認用)
store.medicationItems["g1"] = { schemaVersion:1, label:"抗菌薬", category:"oral", kind:"group", parentId:null, order:1 };
store.medicationItems["l1"] = { schemaVersion:1, label:"アモキシシリン", category:"oral", kind:"leaf", parentId:"g1", order:1 };
ensureMeds("karte-restore")["d-exist"] = {
  schemaVersion:1,
  name:"既存プレドニゾロン",
  category:"A",
  sideEffectNote:"多飲多尿に注意",
  expiryEstimate:"${near}",
  events:{
    e1:{ date:"2026-06-01", type:"add", detail:"開始", frequencyChange:"1日1回", frequency:{kind:"preset",label:"1日1回"}, amountChange:"", changedBy:"院長" }
  }
};
`;

const harnessHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
// Strip SW/app bootstrap; inject med harness boot at end of body
const harness = harnessHtml
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
  .replace(
    "</body>",
    `<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
initMedsUI({
  showToast: (m) => { window.__toasts = window.__toasts || []; window.__toasts.push(m); },
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: () => {},
  getSelectedAuthor: () => "院長",
});
enterMeds("karte-restore");
// unlock right panel bits if needed
document.getElementById("panel-meds")?.removeAttribute("hidden");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.querySelector(".app")?.removeAttribute("hidden");
window.__ready = true;
</script>
</body>`
  );

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/" || urlPath === "/index.html" || urlPath === "/harness") {
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
  viewport: { width: 900, height: 1100 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.warn("pageerror", e.message));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.route("**/service-worker.js", (route) => route.abort());

await page.goto(`http://127.0.0.1:${port}/harness`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(150);

// --- 既存データが表示されること（詳細） ---
await page.click("#meds-list .med-card__header");
await page.waitForSelector("#med-detail-sheet:not([hidden])");
await page.waitForSelector("#med-detail-sheet-body .med-detail-meta__dates");
const detailText = await page.locator("#med-detail-sheet-body").innerText();
if (!detailText.includes("メモ")) throw new Error("detail memo missing");
if (!detailText.includes("期限")) throw new Error("detail expiry missing");
if (!detailText.includes("開始日")) throw new Error("detail start date missing");
if (detailText.includes("副作用・問題メモ")) throw new Error("old memo label remains");
if (detailText.includes("効果／処方の目安期限")) throw new Error("old expiry label remains");
if (detailText.includes("過去に使った程度")) throw new Error("old C label remains");
// メモが最後にあること
const memoLast = await page.evaluate(() => {
  const body = document.querySelector("#med-detail-sheet-body .med-sheet__detail");
  const children = [...(body?.children || [])];
  const last = children[children.length - 1];
  return last?.classList?.contains("med-detail-meta__note") && last?.textContent?.includes("メモ");
});
if (!memoLast) throw new Error("memo should be last in detail");
// 開始日と期限が重なっていないこと
const noOverlap = await page.evaluate(() => {
  const start = document.querySelector(".med-detail-meta__start input");
  const exp = document.querySelector(".med-detail-meta__expiry input");
  if (!start || !exp) return false;
  const a = start.getBoundingClientRect();
  const b = exp.getBoundingClientRect();
  const overlap = !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
  return !overlap;
});
if (!noOverlap) throw new Error("start date and expiry inputs overlap");
const noteVal = await page
  .locator("#med-detail-sheet-body textarea")
  .inputValue();
if (noteVal !== "多飲多尿に注意") throw new Error("existing note not loaded: " + noteVal);
const expVal = await page
  .locator("#med-detail-sheet-body .med-expiry-row input[type=date]")
  .inputValue();
if (expVal !== near) throw new Error("existing expiry not loaded: " + expVal);
await page.screenshot({
  path: path.join(root, "tools/med-fields-restore-detail.png"),
  fullPage: false,
});
await page.click("#btn-med-detail-sheet-close");

// --- 追加モーダルに開始日・期限・メモがあること ---
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
for (const id of ["#med-add-date", "#med-add-expiry", "#med-add-note", "#med-add-dose"]) {
  if (!(await page.locator(id).count())) throw new Error("missing " + id);
}
const addBodyText = await page.locator("#med-add-modal .modal__body").innerText();
if (addBodyText.includes("A=治療の主力")) throw new Error("importance explanation remains");
if (addBodyText.includes("副作用・問題メモ")) throw new Error("old add memo label remains");
if (addBodyText.includes("効果／処方")) throw new Error("old add expiry label remains");
if (!addBodyText.includes("C（過去に使用）")) throw new Error("C label not updated");
if (!addBodyText.includes("投与量")) throw new Error("dose field missing");
// 投与量が頻度の後、メモが最後
const addOrderOk = await page.evaluate(() => {
  const body = document.querySelector("#med-add-modal .modal__body");
  const freq = document.getElementById("med-add-freq-picker");
  const dose = document.getElementById("med-add-dose");
  const note = document.getElementById("med-add-note");
  if (!freq || !dose || !note) return false;
  const fields = [...body.querySelectorAll(":scope > .field, :scope > .error-text")];
  const lastField = [...fields].reverse().find((el) => el.classList.contains("field"));
  const noteIsLast = lastField?.contains(note);
  return (
    freq.getBoundingClientRect().bottom <= dose.getBoundingClientRect().top + 2 &&
    dose.getBoundingClientRect().bottom <= note.getBoundingClientRect().top + 2 &&
    noteIsLast
  );
});
if (!addOrderOk) throw new Error("add modal field order incorrect");
// リスト高さ
const pickerH = await page.locator("#med-add-linear-picker").evaluate((el) => el.getBoundingClientRect().height);
if (pickerH < 200) throw new Error("med picker too short: " + pickerH);
const startDate = await page.locator("#med-add-date").inputValue();
if (startDate !== T) throw new Error("add date not defaulted to today: " + startDate);

// pick oral > 抗菌薬 > アモキシシリン
await page.getByRole("option", { name: "内服薬" }).click();
await page.getByRole("option", { name: "抗菌薬" }).click();
await page.getByRole("option", { name: "アモキシシリン" }).click();
await page.locator("#med-add-expiry").fill(later);
await page.getByRole("option", { name: "錠数（整数）" }).click();
await page.getByRole("option", { name: "1錠" }).click();
await page.locator("#med-add-note").fill("胃腸障害に注意");
await page.locator("#med-add-date").fill(addDays(T, -2));
const selectedName = await page.evaluate(() => {
  const sel = document.querySelector("#med-add-col-leaf-list .is-selected, #med-add-col-leaf-list [aria-selected='true']");
  return sel?.textContent?.trim() || "";
});
console.log("selected leaf", selectedName);
if (!selectedName.includes("アモキシシリン")) {
  throw new Error("drug not selected before save: " + selectedName);
}
await page.screenshot({
  path: path.join(root, "tools/med-fields-restore-add.png"),
});
await page.click("#btn-med-add-save");
await page.waitForFunction(() => document.getElementById("med-add-modal")?.hidden === true);

const saved = await page.evaluate(() => {
  return [...document.querySelectorAll("#meds-list .med-card")].map((li) => {
    const nameEl = li.querySelector(".med-card__name");
    return (
      nameEl?.getAttribute("aria-label") ||
      nameEl?.dataset?.name ||
      (nameEl?.textContent || "").replace(/\u200B/g, "")
    );
  });
});
console.log("list after add", saved);
if (!saved.some((x) => (x || "").includes("アモキシシリン"))) {
  throw new Error("new drug not in list: " + JSON.stringify(saved));
}

// open new drug detail and confirm fields persisted
await page.locator("#meds-list .med-card").first().locator(".med-card__header").click();
await page.waitForSelector("#med-detail-sheet:not([hidden])");
await page.waitForFunction(
  () =>
    document.getElementById("med-detail-sheet-name")?.textContent?.includes(
      "アモキシシリン"
    )
);
const newNote = await page.locator("#med-detail-sheet-body textarea").inputValue();
const newExp = await page
  .locator("#med-detail-sheet-body .med-expiry-row input[type=date]")
  .inputValue();
if (newNote !== "胃腸障害に注意") throw new Error("saved note mismatch " + newNote);
if (newExp !== later) throw new Error("saved expiry mismatch " + newExp);

// --- 出来事: 日付入力して保存（中止は頻度不要） ---
await page.getByRole("button", { name: "中止" }).click();
await page.waitForSelector("#med-event-modal:not([hidden])");
const eventDateVisible = await page.locator("#med-event-date").isVisible();
if (!eventDateVisible) throw new Error("event date not visible");
const eventDateVal = addDays(T, -1);
await page.locator("#med-event-date").fill(eventDateVal);
await page.locator("#med-event-detail").fill("副作用のため中止");
await page.screenshot({
  path: path.join(root, "tools/med-fields-restore-event.png"),
});
await page.click("#btn-med-event-save");
await page.waitForFunction(() => document.getElementById("med-event-modal")?.hidden === true);

const historyHasDate = await page.locator("#med-detail-sheet-body").innerText();
if (!historyHasDate.includes("中止")) {
  throw new Error("event not reflected in history: " + historyHasDate.slice(0, 300));
}
if (!historyHasDate.includes(eventDateVal.slice(0, 4))) {
  throw new Error("event date not shown: " + historyHasDate.slice(0, 300));
}

await page.screenshot({
  path: path.join(root, "tools/med-fields-restore-after-event.png"),
});

// --- 量を変更（減量）が使えること ---
await page.getByRole("button", { name: "減量" }).click();
await page.waitForSelector("#med-event-modal:not([hidden])");
const amountToggleVisible = await page.locator("#med-event-amount-check").isVisible();
if (!amountToggleVisible) throw new Error("amount change toggle not visible");
const toggleOrderOk = await page.evaluate(() => {
  const toggles = document.querySelector(".med-event-change-toggles");
  const picker = document.getElementById("med-event-freq-picker");
  if (!toggles || !picker) return false;
  return toggles.getBoundingClientRect().bottom <= picker.getBoundingClientRect().top + 2;
});
if (!toggleOrderOk) throw new Error("amount toggle should appear above frequency picker");
await page.locator("#med-event-amount-check").check();
await page.waitForSelector("#med-event-amount-block:not([hidden])");
await page.getByRole("option", { name: "半分に減らす" }).click();
await page.getByRole("option", { name: "よくある" }).click();
await page.getByRole("option", { name: "1日1回" }).click();
await page.locator("#med-event-date").fill(addDays(T, -2));
await page.screenshot({
  path: path.join(root, "tools/audit-med-event-amount.png"),
});
await page.click("#btn-med-event-save");
await page.waitForFunction(() => document.getElementById("med-event-modal")?.hidden === true);
const afterAmount = await page.locator("#med-detail-sheet-body").innerText();
if (!afterAmount.includes("減量") || !afterAmount.includes("半分に減らす")) {
  throw new Error("amount change not saved: " + afterAmount.slice(0, 400));
}

await browser.close();
server.close();
console.log("OK: med fields restored (add/detail/event/amount)");
