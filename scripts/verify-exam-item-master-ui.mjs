import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const mockDb = `
const store = { examItems: {}, examPlan: {} };
const itemListeners = [];
const planListeners = new Map();
let seq = 0;
const nid = (p) => p + (++seq);

function emptyPlan() { return { schemaVersion: 2, plans: {}, history: {} }; }
function ensurePlan(k) {
  if (!store.examPlan[k]) store.examPlan[k] = emptyPlan();
  return store.examPlan[k];
}
function notifyItems() {
  const items = Object.entries(store.examItems).map(([id, t]) => ({ id, ...t }));
  items.sort((a,b) => (a.label||"").localeCompare(b.label||""));
  itemListeners.forEach((cb) => cb(items.map(x => ({...x}))));
}
function notifyPlan(k) {
  (planListeners.get(k) || []).forEach((cb) => cb(structuredClone(ensurePlan(k))));
}

export function subscribeExamItems(cb) {
  itemListeners.push(cb);
  notifyItems();
  return () => { const i = itemListeners.indexOf(cb); if (i>=0) itemListeners.splice(i,1); };
}
export function subscribeExamPlan(karte, cb) {
  const list = planListeners.get(karte) || [];
  list.push(cb);
  planListeners.set(karte, list);
  cb(structuredClone(ensurePlan(karte)));
  return () => planListeners.set(karte, (planListeners.get(karte)||[]).filter(x => x !== cb));
}
export const EXAM_ITEM_CATEGORIES = [
  { id: "blood", label: "血液" },
  { id: "imaging", label: "画像" },
  { id: "pathology", label: "病理" },
  { id: "other", label: "その他" },
];
const CATEGORY_IDS = new Set(EXAM_ITEM_CATEGORIES.map((c) => c.id));
export function normalizeExamItemCategory(category) {
  const id = String(category || "").trim();
  return CATEGORY_IDS.has(id) ? id : "other";
}
export function normalizeExamFasting(value) {
  const v = String(value || "").trim();
  return v === "required" || v === "none" ? v : "";
}
export function examFastingLabel(value) {
  const v = normalizeExamFasting(value);
  if (v === "required") return "必要";
  if (v === "none") return "不要";
  return "";
}
export async function addExamItem({ label, category = "other", kind = "leaf", parentId = "", order }) {
  const id = nid("item");
  store.examItems[id] = {
    label: label || "",
    category: normalizeExamItemCategory(category),
    kind: kind === "group" ? "group" : "leaf",
    parentId: kind === "group" ? "" : String(parentId || "").trim(),
    order: typeof order === "number" ? order : Date.now(),
  };
  notifyItems();
  return id;
}
export async function saveExamScheduledPlan(karte, { planId=null, item, dueDate, note, baselineDate }) {
  const plan = ensurePlan(karte);
  let id = planId;
  if (!id) {
    const found = Object.entries(plan.plans).find(([,p]) => (p.item||"").trim() === (item||"").trim());
    id = found ? found[0] : nid("plan");
  }
  const date = dueDate || "";
  plan.plans[id] = { item: item||"", dueDate: date, baselineDate: baselineDate||date, note: note||"" };
  notifyPlan(karte);
  return id;
}
export async function deleteExamScheduledPlan(karte, planId) { delete ensurePlan(karte).plans[planId]; notifyPlan(karte); }
export async function endExamScheduledPlan(karte, planId) { return deleteExamScheduledPlan(karte, planId); }
export async function reviveExamPlanByItem(karte, { item, note="" }) {
  return saveExamScheduledPlan(karte, { item, dueDate: "", note, baselineDate: "2026-07-22" });
}
export async function addExamHistory(karte, { item, date, note }) {
  const id = nid("hist");
  ensurePlan(karte).history[id] = { item, date, note: note||"" };
  notifyPlan(karte);
  return id;
}
export const EXAM_PLAN_SCHEMA_VERSION = 2;
`;

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>exam item master harness</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside class="right-column" style="width:100%;max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <div id="right-tabs" class="right-tabs">
    <button type="button" class="right-tab is-active" data-tab="exam">検査予定</button>
  </div>
  <p id="right-empty" class="field__note" hidden></p>
  <div class="right-panel" id="panel-exam" data-panel="exam">
    <section class="exam-section">
      <div class="exam-section__head"><h3 class="exam-section__title">検査予定一覧</h3></div>
      <div class="exam-register-actions">
        <button id="btn-exam-new" class="btn btn--small btn--primary" type="button">予定を登録</button>
      </div>
      <p class="field__note" id="exam-plan-empty">登録された検査予定はありません。</p>
      <ul class="exam-list" id="exam-plan-list"></ul>
    </section>
    <section class="exam-section">
      <h3 class="exam-section__title">実施履歴</h3>
      <p class="field__note" id="exam-history-empty">まだ実施履歴がありません。</p>
      <ul class="exam-list" id="exam-history-list"></ul>
    </section>
  </div>
</aside>

<div class="modal" id="exam-item-sheet" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="exam-item-sheet-title">検査予定</h2>
      <button class="modal__close" id="btn-close-exam-item-sheet" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <p class="exam-sheet__item" id="exam-item-sheet-item"></p>
      <input id="exam-sheet-due-date" class="input" type="date" />
      <div id="exam-sheet-due-units"></div>
      <p id="exam-sheet-due-display"></p>
      <div id="exam-sheet-due-numpad"></div>
      <p id="exam-sheet-window-note"></p>
      <input id="exam-sheet-note" class="input" type="text" />
      <p id="exam-sheet-error" class="error-text" hidden></p>
      <button id="btn-exam-sheet-save" type="button">保存する</button>
      <button id="btn-exam-sheet-complete" type="button">完了</button>
      <button id="btn-exam-sheet-end" type="button">終了</button>
    </div>
  </div>
</div>

<div class="modal" id="exam-plan-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="exam-plan-modal-title">予定を登録</h2>
      <button class="modal__close" id="btn-close-exam-plan" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <span class="label">検査項目</span>
        <div class="med-linear-picker" id="exam-plan-linear-picker" aria-label="検査項目の階層選択">
          <div class="med-linear-picker__col" id="exam-plan-col-category">
            <div class="med-linear-picker__head">大項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-category-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col" id="exam-plan-col-group" hidden>
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-group-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="exam-plan-col-leaf" hidden>
            <div class="med-linear-picker__head">検査項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list" role="listbox"></div>
            <p class="field__note med-linear-picker__empty" id="exam-plan-items-empty" hidden></p>
            <div class="exam-item-add" id="exam-plan-item-add-default">
              <label class="label label--sub" for="exam-plan-new-item" id="exam-plan-new-item-label">新しい項目を追加</label>
              <div class="exam-item-add__row">
                <input id="exam-plan-new-item" class="input" type="text" placeholder="例）血液検査" />
                <button id="btn-exam-plan-add-item" class="btn btn--small btn--outline" type="button">追加</button>
              </div>
            </div>
          </div>
        </div>
        <p id="exam-plan-item-error" class="error-text" role="alert" hidden></p>
      </div>
      <div class="field">
        <label class="label" for="exam-plan-due-date">予定日</label>
        <input id="exam-plan-due-date" class="input input--date" type="date" />
        <div id="exam-plan-due-units"></div>
        <p id="exam-plan-due-display"></p>
        <div id="exam-plan-due-numpad"></div>
        <p id="exam-plan-window-note"></p>
      </div>
      <input id="exam-plan-note" class="input" type="text" />
      <p id="exam-plan-error" class="error-text" hidden></p>
      <button id="btn-exam-plan-save" class="btn btn--small btn--primary" type="button">保存する</button>
      <button id="btn-exam-plan-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<div class="modal" id="exam-complete-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button id="btn-close-exam-complete" type="button"></button>
    <input id="exam-complete-date" type="date" />
    <input id="exam-complete-note" type="text" />
    <p id="exam-complete-error" hidden></p>
    <button id="btn-exam-complete-save" type="button"></button>
    <button id="btn-exam-complete-cancel" type="button"></button>
  </div>
</div>
<div class="modal" id="exam-after-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button id="btn-close-exam-after" type="button"></button>
    <p id="exam-after-summary" hidden></p>
    <button id="btn-exam-after-next" type="button"></button>
    <button id="btn-exam-after-end" type="button"></button>
  </div>
</div>

<script type="module">
import { initExamPlanUI, enterExamPlan, leaveExamPlan } from "/js/exam-plan-ui.js";
initExamPlanUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
});
window.__enter = (karte) => enterExamPlan(karte);
window.__leave = () => leaveExamPlan();
window.__examReady = true;
</script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/exam-item-master-harness.html") {
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function clickLinear(listSel, label) {
  const items = page.locator(`${listSel} .med-linear-picker__item`);
  const count = await items.count();
  for (let i = 0; i < count; i += 1) {
    const text = await items.nth(i).locator(".med-linear-picker__item-label").innerText();
    if (text.trim() === label) {
      await items.nth(i).click();
      return;
    }
  }
  throw new Error(`item not found in ${listSel}: ${label}`);
}

async function leafLabels() {
  return page.locator("#exam-plan-col-leaf-list .med-linear-picker__item-label").allTextContents();
}

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/exam-item-master-harness.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__examReady === true);

// カルテA: 初めての項目を追加して予定保存
await page.evaluate(() => window.__enter("karte-a"));
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await clickLinear("#exam-plan-col-category-list", "その他");
await page.waitForTimeout(80);

let buttons = await leafLabels();
console.log("KARTE A initial buttons:", buttons);
if (buttons.length !== 0) throw new Error("expected empty master initially");

await page.fill("#exam-plan-new-item", "血液検査");
await page.click("#btn-exam-plan-add-item");
await page.waitForTimeout(200);
buttons = await leafLabels();
console.log("KARTE A after add:", buttons);
if (!buttons.includes("血液検査")) throw new Error("added item not shown as button");
const selected = await page
  .locator("#exam-plan-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
  .textContent();
if (selected !== "血液検査") throw new Error("added item not selected");

await page.fill("#exam-plan-due-date", "2026-09-01");
await page.click("#btn-exam-plan-save");
await page.waitForTimeout(200);
const plansA = await page.locator("#exam-plan-list .exam-list-item__title").allTextContents();
console.log("KARTE A plans:", plansA);
if (!plansA.includes("血液検査")) throw new Error("plan not saved on karte A");

// カルテB: 同じマスタが選べる
await page.evaluate(() => {
  window.__leave();
  window.__enter("karte-b");
});
await page.waitForTimeout(150);
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await clickLinear("#exam-plan-col-category-list", "その他");
await page.waitForTimeout(80);
buttons = await leafLabels();
console.log("KARTE B buttons:", buttons);
if (!buttons.includes("血液検査")) throw new Error("master item not available on other karte");

// 管理ボタンがないこと
if (await page.locator("#btn-open-exam-items").count()) {
  throw new Error("管理ボタンが残っている");
}
if (await page.locator("#exam-items-modal").count()) {
  throw new Error("管理モーダルが残っている");
}
if (await page.locator("#exam-plan-other").count()) {
  throw new Error("その他チェックが残っている");
}

await page.screenshot({ path: path.join(root, "tools/exam-item-master-verify.png") });

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: add on karte A → selectable on karte B; management UI removed");
await browser.close();
server.close();
