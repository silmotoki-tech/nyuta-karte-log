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

const mockDb = fs.readFileSync(path.join(__dirname, "mock-db-exam-categories.js"), "utf-8");

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>exam multiselect harness</title>
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
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="exam-plan-modal-title">予定を登録</h2>
      <button class="modal__close" id="btn-close-exam-plan" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <span class="label">検査項目</span>
        <div class="exam-item-category-tabs" id="exam-plan-item-categories" role="tablist"></div>
        <div class="exam-item-blood-nav" id="exam-plan-blood-nav" hidden>
          <button type="button" class="exam-item-blood-nav__back" id="btn-exam-plan-blood-back">← 戻る</button>
          <span class="exam-item-blood-nav__label" id="exam-plan-blood-nav-label"></span>
        </div>
        <div class="exam-item-buttons" id="exam-plan-item-buttons"></div>
        <p class="field__note" id="exam-plan-items-empty" hidden></p>
        <p class="field__note exam-plan-selection-summary" id="exam-plan-selection-summary" hidden></p>
        <div class="exam-item-add" id="exam-plan-item-add-default">
          <label class="label label--sub" id="exam-plan-new-item-label" for="exam-plan-new-item">新しい項目を追加</label>
          <div class="exam-item-add__row">
            <input id="exam-plan-new-item" class="input" type="text" />
            <button id="btn-exam-plan-add-item" class="btn btn--small btn--outline" type="button">追加</button>
          </div>
        </div>
        <p id="exam-plan-item-error" class="error-text" hidden></p>
      </div>
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
enterExamPlan("karte-multi");
window.__ready = true;
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/exam-multiselect-harness.html") {
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
const page = await browser.newPage({ viewport: { width: 420, height: 920 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/exam-multiselect-harness.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(300);

await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");

// 肝スク / 腎スクが先頭
await page.locator("#exam-plan-item-buttons .exam-item-btn", { hasText: /^肝臓$/ }).click();
await page.waitForTimeout(50);
let liver = await page.locator("#exam-plan-item-buttons .exam-item-btn").allTextContents();
console.log("LIVER", liver);
if (liver[0] !== "肝スク") throw new Error(`肝スク should be first, got ${liver[0]}`);
await page.screenshot({ path: path.join(root, "tools/exam-multiselect-liver-scr.png") });

await page.click("#btn-exam-plan-blood-back");
await page.locator("#exam-plan-item-buttons .exam-item-btn", { hasText: /^腎臓$/ }).click();
await page.waitForTimeout(50);
let kidney = await page.locator("#exam-plan-item-buttons .exam-item-btn").allTextContents();
console.log("KIDNEY", kidney);
if (kidney[0] !== "腎スク") throw new Error(`腎スク should be first, got ${kidney[0]}`);
await page.screenshot({ path: path.join(root, "tools/exam-multiselect-kidney-scr.png") });

await page.click("#btn-exam-plan-blood-back");
await page.locator("#exam-plan-item-buttons .exam-item-btn", { hasText: /^肝臓$/ }).click();
await page.waitForTimeout(50);

// 複数選択: ALT・AST・ALP
for (const label of ["ALT", "AST", "ALP"]) {
  await page.locator("#exam-plan-item-buttons .exam-item-btn", { hasText: new RegExp(`^${label}$`) }).click();
}
const selectedCount = await page.locator("#exam-plan-item-buttons .exam-item-btn.is-selected").count();
if (selectedCount !== 3) throw new Error(`expected 3 selected, got ${selectedCount}`);

// トグル解除
await page.locator("#exam-plan-item-buttons .exam-item-btn", { hasText: /^ALP$/ }).click();
if ((await page.locator("#exam-plan-item-buttons .exam-item-btn.is-selected").count()) !== 2) {
  throw new Error("deselect ALP failed");
}
await page.locator("#exam-plan-item-buttons .exam-item-btn", { hasText: /^ALP$/ }).click();

const summary = await page.locator("#exam-plan-selection-summary").innerText();
console.log("SUMMARY", summary);
if (!summary.includes("肝臓（ALT・AST・ALP）")) {
  throw new Error(`summary format wrong: ${summary}`);
}
await page.screenshot({ path: path.join(root, "tools/exam-multiselect-stage.png") });

await page.locator('#exam-plan-fasting-buttons [data-fasting="required"]').click();
await page.fill("#exam-plan-due-date", "2026-09-01");
await page.click("#btn-exam-plan-save");
await page.waitForSelector("#exam-plan-modal[hidden]", { state: "attached" });
await page.waitForTimeout(120);

const listText = await page.locator("#exam-plan-list").innerText();
console.log("LIST", listText);
if (!listText.includes("肝臓（ALT・AST・ALP）")) {
  throw new Error("grouped label missing in list");
}
if (!listText.includes("絶食：必要")) throw new Error("fasting missing in list");
await page.screenshot({ path: path.join(root, "tools/exam-multiselect-list.png") });

await page.locator("#exam-plan-list .exam-list-item").filter({ hasText: "肝臓（ALT・AST・ALP）" }).click();
await page.waitForSelector("#exam-item-sheet:not([hidden])");
const sheetItem = await page.locator("#exam-item-sheet-item").innerText();
const sheetFasting = await page.locator("#exam-item-sheet-fasting").innerText();
console.log("SHEET", sheetItem, sheetFasting);
if (sheetItem !== "肝臓（ALT・AST・ALP）") throw new Error(`sheet item wrong: ${sheetItem}`);
if (sheetFasting !== "絶食：必要") throw new Error(`sheet fasting wrong: ${sheetFasting}`);
await page.screenshot({ path: path.join(root, "tools/exam-multiselect-sheet.png") });
await page.click("#btn-close-exam-item-sheet");

// 画像タブの複数選択
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await page.locator('.exam-item-category-tab[data-category="imaging"]').click();
await page.waitForTimeout(50);
await page.locator("#exam-plan-item-buttons .exam-item-btn", { hasText: /^胸部スク$/ }).click();
await page.locator("#exam-plan-item-buttons .exam-item-btn", { hasText: /^腹部スク$/ }).click();
const imgSummary = await page.locator("#exam-plan-selection-summary").innerText();
console.log("IMG SUMMARY", imgSummary);
if (!imgSummary.includes("胸部スク・腹部スク")) {
  throw new Error(`imaging multi summary wrong: ${imgSummary}`);
}
if (!(await page.isHidden("#exam-plan-fasting-field"))) {
  throw new Error("fasting should hide for imaging-only selection");
}
await page.fill("#exam-plan-due-date", "2026-09-02");
await page.click("#btn-exam-plan-save");
await page.waitForTimeout(120);
const listText2 = await page.locator("#exam-plan-list").innerText();
if (!listText2.includes("胸部スク・腹部スク")) {
  throw new Error("imaging multi missing in list");
}

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: 肝スク/腎スク + multiselect + grouped display");
await browser.close();
server.close();
