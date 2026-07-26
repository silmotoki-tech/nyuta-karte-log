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

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-exam-categories.js"),
  "utf-8"
);

const pickerField = `
      <div class="field">
        <span class="label">検査項目</span>
        <div class="med-linear-picker" id="exam-plan-linear-picker" data-cols="3" aria-label="検査項目の階層選択">
          <div class="med-linear-picker__col" id="exam-plan-col-category" data-col="category">
            <div class="med-linear-picker__head">大項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-category-list" role="listbox" aria-label="大項目"></div>
          </div>
          <div class="med-linear-picker__col is-placeholder" id="exam-plan-col-group" data-col="group">
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-group-list" role="listbox" aria-label="中項目"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf is-placeholder" id="exam-plan-col-leaf" data-col="leaf">
            <div class="med-linear-picker__head">
              <span class="med-linear-picker__head-label">検査項目</span>
              <button type="button" class="exam-item-add__toggle" id="btn-exam-plan-add-toggle" hidden aria-expanded="false">＋</button>
            </div>
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list" role="listbox" aria-label="検査項目"></div>
            <p class="field__note med-linear-picker__empty" id="exam-plan-items-empty" hidden></p>
            <div class="exam-item-add" id="exam-plan-item-add-default" hidden>
              <label class="label label--sub" for="exam-plan-new-item" id="exam-plan-new-item-label">新しい項目を追加</label>
              <div class="exam-item-add__row">
                <input id="exam-plan-new-item" class="input" type="text" />
                <button id="btn-exam-plan-add-item" class="btn btn--small btn--outline" type="button">追加</button>
              </div>
            </div>
          </div>
        </div>
        <p class="field__note exam-plan-selection-summary" id="exam-plan-selection-summary" hidden></p>
        <p id="exam-plan-item-error" class="error-text" hidden></p>
      </div>`;

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>exam linear picker harness</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <div id="right-tabs" class="right-tabs">
    <button type="button" class="right-tab is-active" data-tab="exam">検査</button>
  </div>
  <p id="right-empty" hidden></p>
  <div class="right-panel" id="panel-exam" data-panel="exam">
    <div class="exam-toolbar">
      <button id="btn-exam-new" class="btn btn--small btn--primary" type="button">予定を登録</button>
    </div>
    <section class="exam-section">
      <div class="exam-section__head"><h3 class="exam-section__title">検査予定一覧</h3></div>
      <p class="field__note" id="exam-plan-empty"></p>
      <ul class="exam-list" id="exam-plan-list"></ul>
    </section>
    <section class="exam-section">
      <h3 class="exam-section__title">実施履歴</h3>
      <p class="field__note" id="exam-history-empty"></p>
      <ul class="exam-list" id="exam-history-list"></ul>
    </section>
  </div>
</aside>

<div class="modal" id="exam-item-sheet" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button id="btn-close-exam-item-sheet" type="button"></button>
    <p id="exam-item-sheet-title"></p>
    <p id="exam-item-sheet-item"></p>
    <p id="exam-item-sheet-fasting" hidden></p>
    <div id="exam-sheet-fasting-field" hidden>
      <div id="exam-sheet-fasting-buttons" class="exam-fasting-buttons">
        <button type="button" class="exam-fasting-btn" data-fasting="required">必要</button>
        <button type="button" class="exam-fasting-btn" data-fasting="none">不要</button>
      </div>
    </div>
    <input id="exam-sheet-due-date" type="date" />
    <div id="exam-sheet-due-units"></div>
    <p id="exam-sheet-due-display"></p>
    <div id="exam-sheet-due-numpad"></div>
    <p id="exam-sheet-window-note"></p>
    <input id="exam-sheet-note" type="text" />
    <p id="exam-sheet-error" hidden></p>
    <button id="btn-exam-sheet-save" type="button"></button>
    <button id="btn-exam-sheet-complete" type="button"></button>
    <button id="btn-exam-sheet-end" type="button"></button>
  </div>
</div>

<div class="modal" id="exam-plan-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--exam-plan">
    <div class="modal__header">
      <h2 class="modal__title" id="exam-plan-modal-title">予定を登録</h2>
      <button class="modal__close" id="btn-close-exam-plan" type="button">&times;</button>
    </div>
    <div class="modal__body">
      ${pickerField}
      <div class="field" id="exam-plan-fasting-field" hidden>
        <span class="label">絶食</span>
        <div class="exam-fasting-buttons" id="exam-plan-fasting-buttons" role="group">
          <button type="button" class="exam-fasting-btn" data-fasting="required">必要</button>
          <button type="button" class="exam-fasting-btn" data-fasting="none">不要</button>
        </div>
      </div>
      <input id="exam-plan-due-date" class="input" type="date" />
      <div id="exam-plan-due-units"></div>
      <p id="exam-plan-due-display"></p>
      <div id="exam-plan-due-numpad"></div>
      <p id="exam-plan-window-note"></p>
      <input id="exam-plan-note" class="input" type="text" />
      <p id="exam-plan-error" class="error-text" hidden></p>
      <button id="btn-exam-plan-save" class="btn btn--small btn--primary" type="button">保存する</button>
      <button id="btn-exam-plan-cancel" type="button">キャンセル</button>
    </div>
  </div>
</div>

<div class="modal" id="exam-complete-modal" hidden>
  <button id="btn-close-exam-complete" type="button"></button>
  <input id="exam-complete-date" type="date" />
  <input id="exam-complete-note" type="text" />
  <p id="exam-complete-error" hidden></p>
  <button id="btn-exam-complete-save" type="button"></button>
  <button id="btn-exam-complete-cancel" type="button"></button>
</div>
<div class="modal" id="exam-after-modal" hidden>
  <button id="btn-close-exam-after" type="button"></button>
  <p id="exam-after-summary" hidden></p>
  <button id="btn-exam-after-next" type="button"></button>
  <button id="btn-exam-after-end" type="button"></button>
</div>

<script type="module">
import { initExamPlanUI, enterExamPlan } from "/js/exam-plan-ui.js";
initExamPlanUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
});
enterExamPlan("karte-linear");
window.__ready = true;
</script>
</body>
</html>`;

async function itemLabels(page, listSel) {
  return page
    .locator(`${listSel} .med-linear-picker__item-label`)
    .allTextContents();
}

async function clickItem(page, listSel, label) {
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

async function shot(page, name) {
  await page.screenshot({
    path: path.join(root, "tools", name),
    fullPage: false,
  });
}

async function visibleColWidths(page) {
  return page.evaluate(() => {
    const root = document.getElementById("exam-plan-linear-picker");
    return [...root.querySelectorAll(".med-linear-picker__col")]
      .filter((el) => !el.hidden)
      .map((el) => Math.round(el.getBoundingClientRect().width));
  });
}

function assertBalancedWidths(widths, label) {
  if (widths.length < 2) return;
  const max = Math.max(...widths);
  const min = Math.min(...widths);
  if (max - min > 24) {
    throw new Error(`${label}: column widths uneven ${JSON.stringify(widths)}`);
  }
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/exam-linear-picker-harness.html") {
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
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 900, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/exam-linear-picker-harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__ready === true);
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await page.waitForTimeout(200);

// 初期: 3列枠を確保し、中・葉はプレースホルダー
const cats = await itemLabels(page, "#exam-plan-col-category-list");
console.log("categories:", cats);
if (JSON.stringify(cats) !== JSON.stringify(["血液", "画像", "病理", "その他"])) {
  throw new Error("category list mismatch");
}
if (
  (await page.locator("#exam-plan-linear-picker").getAttribute("data-cols")) !== "3"
) {
  throw new Error("initial data-cols should be 3");
}
if (!(await page.locator("#exam-plan-col-group").evaluate((el) => el.classList.contains("is-placeholder")))) {
  throw new Error("mid col should be placeholder initially");
}
if (!(await page.locator("#exam-plan-col-leaf").evaluate((el) => el.classList.contains("is-placeholder")))) {
  throw new Error("leaf col should be placeholder initially");
}
let widths = await visibleColWidths(page);
console.log("initial widths:", widths);
assertBalancedWidths(widths, "initial");
await shot(page, "exam-linear-layout-01-stage1.png");
await shot(page, "exam-linear-picker-01-initial.png");

// ---- 血液: 大項目 → 中項目 → 肝臓内訳 ----
await clickItem(page, "#exam-plan-col-category-list", "血液");
await page.waitForTimeout(100);
if (await page.locator("#exam-plan-col-group").isHidden()) {
  throw new Error("blood should show mid column");
}
if (await page.locator("#exam-plan-col-group").evaluate((el) => el.classList.contains("is-placeholder"))) {
  throw new Error("blood mid should be active");
}
widths = await visibleColWidths(page);
console.log("blood stage2 widths:", widths);
assertBalancedWidths(widths, "blood stage2");
await shot(page, "exam-linear-layout-02-stage2.png");
const bloodGroups = await itemLabels(page, "#exam-plan-col-group-list");
console.log("blood groups:", bloodGroups.slice(0, 6));
for (const label of ["肝臓", "腎臓", "脂質", "ホルモン"]) {
  if (!bloodGroups.includes(label)) throw new Error(`blood mid missing ${label}`);
}
const bloodRoots = await itemLabels(page, "#exam-plan-col-leaf-list");
console.log("blood root leaves:", bloodRoots.slice(0, 6));
for (const label of ["CBC", "血糖(アントセンス)", "CRP"]) {
  if (!bloodRoots.includes(label)) throw new Error(`blood root leaf missing ${label}`);
}
if (bloodRoots.includes("ALT")) throw new Error("ALT should not appear before mid select");
if (!(await page.locator("#exam-plan-item-add-default").isHidden())) {
  throw new Error("blood root should hide add field");
}
if (!(await page.locator("#btn-exam-plan-add-toggle").isHidden())) {
  throw new Error("blood root should hide add toggle");
}
await shot(page, "exam-linear-picker-02-blood-mid.png");

await clickItem(page, "#exam-plan-col-group-list", "肝臓");
await page.waitForTimeout(100);
const liver = await itemLabels(page, "#exam-plan-col-leaf-list");
console.log("liver leaves:", liver.slice(0, 5));
if (liver[0] !== "肝スク") throw new Error(`肝スク should be first, got ${liver[0]}`);
if (!liver.includes("ALT") || !liver.includes("AST")) {
  throw new Error("liver children missing");
}
if (!(await page.locator("#btn-exam-plan-add-toggle").isVisible())) {
  throw new Error("add toggle should show inside liver");
}
if (!(await page.locator("#exam-plan-item-add-default").isHidden())) {
  throw new Error("add field should stay collapsed until + is pressed");
}
await clickItem(page, "#exam-plan-col-leaf-list", "ALT");
await clickItem(page, "#exam-plan-col-leaf-list", "AST");
const selectedLeaves = await page
  .locator("#exam-plan-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
  .allTextContents();
if (!selectedLeaves.includes("ALT") || !selectedLeaves.includes("AST")) {
  throw new Error("multi-select leaves failed");
}
const summary = await page.locator("#exam-plan-selection-summary").innerText();
console.log("blood summary:", summary);
if (!summary.includes("肝臓 ＞ ALT・AST")) {
  throw new Error(`summary wrong: ${summary}`);
}
widths = await visibleColWidths(page);
console.log("blood stage3 widths:", widths);
assertBalancedWidths(widths, "blood stage3");
await shot(page, "exam-linear-layout-03-stage3.png");
await shot(page, "exam-linear-picker-03-blood-liver.png");

// 中項目の選び直し
await clickItem(page, "#exam-plan-col-group-list", "腎臓");
await page.waitForTimeout(80);
const kidney = await itemLabels(page, "#exam-plan-col-leaf-list");
if (kidney[0] !== "腎スク") throw new Error("腎スク should be first after reselect");
if (kidney.includes("ALT")) throw new Error("ALT leaked into kidney");
await shot(page, "exam-linear-picker-04-blood-kidney-reselect.png");

// ---- 画像 ----
await clickItem(page, "#exam-plan-col-category-list", "画像");
await page.waitForTimeout(100);
const imgGroups = await itemLabels(page, "#exam-plan-col-group-list");
console.log("imaging groups:", imgGroups);
for (const label of ["セット", "心エコー", "腹部エコー", "レントゲン"]) {
  if (!imgGroups.includes(label)) throw new Error(`imaging mid missing ${label}`);
}
if (!(await page.locator("#btn-exam-plan-add-toggle").isVisible())) {
  throw new Error("imaging root should show add toggle");
}
if (!(await page.locator("#exam-plan-item-add-default").isHidden())) {
  throw new Error("imaging root add form should stay collapsed");
}
await shot(page, "exam-linear-picker-05-imaging-mid.png");

await clickItem(page, "#exam-plan-col-group-list", "心エコー");
await page.waitForTimeout(80);
const echo = await itemLabels(page, "#exam-plan-col-leaf-list");
console.log("echo leaves count:", echo.length);
if (!echo.includes("スクリーニング")) {
  throw new Error("echo leaf missing");
}
await clickItem(page, "#exam-plan-col-leaf-list", "スクリーニング");
await shot(page, "exam-linear-picker-06-imaging-echo.png");

await clickItem(page, "#exam-plan-col-group-list", "レントゲン");
await page.waitForTimeout(80);
const xray = await itemLabels(page, "#exam-plan-col-leaf-list");
if (!xray.includes("胸部")) throw new Error("xray leaf missing");
await shot(page, "exam-linear-picker-07-imaging-xray.png");

// ---- 病理（中項目なし） ----
await clickItem(page, "#exam-plan-col-category-list", "病理");
await page.waitForTimeout(100);
if (!(await page.locator("#exam-plan-col-group").isHidden())) {
  throw new Error("pathology should hide mid column");
}
if (await page.locator("#exam-plan-col-leaf").isHidden()) {
  throw new Error("pathology should show leaf column");
}
const pathology = await itemLabels(page, "#exam-plan-col-leaf-list");
console.log("pathology:", pathology);
for (const label of ["細胞診(院内)", "組織検査", "細菌培養(院内)"]) {
  if (!pathology.includes(label)) throw new Error(`pathology missing ${label}`);
}
await clickItem(page, "#exam-plan-col-leaf-list", "組織検査");
await page.click("#btn-exam-plan-add-toggle");
await page.waitForSelector("#exam-plan-item-add-default:not([hidden])");
await page.fill("#exam-plan-new-item", "追加病理");
await page.click("#btn-exam-plan-add-item");
await page.waitForTimeout(200);
const pathologyAfter = await itemLabels(page, "#exam-plan-col-leaf-list");
if (!pathologyAfter.includes("追加病理")) throw new Error("add pathology failed");
await shot(page, "exam-linear-picker-08-pathology.png");

// ---- その他 ----
await clickItem(page, "#exam-plan-col-category-list", "その他");
await page.waitForTimeout(100);
if (!(await page.locator("#exam-plan-col-group").isHidden())) {
  throw new Error("other should hide mid column");
}
const other = await itemLabels(page, "#exam-plan-col-leaf-list");
console.log("other:", other);
for (const label of ["尿検査(UPCなし)", "便検査", "下痢パネル"]) {
  if (!other.includes(label)) throw new Error(`other missing ${label}`);
}
await clickItem(page, "#exam-plan-col-leaf-list", "便検査");
await shot(page, "exam-linear-picker-09-other.png");

// チェックマークが各列に出ていること（大項目＋検査項目）
const checks = await page
  .locator(
    "#exam-plan-linear-picker .med-linear-picker__item.is-selected .med-linear-picker__check"
  )
  .count();
if (checks < 2) throw new Error(`expected checkmarks on selected columns, got ${checks}`);

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: exam linear picker blood/imaging/pathology/other");
await browser.close();
server.close();
