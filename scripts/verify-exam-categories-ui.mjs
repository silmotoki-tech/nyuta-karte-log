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
  <title>exam category harness</title>
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
        <div id="exam-plan-item-add-blood-root" hidden>
          <div class="exam-item-add">
            <label class="label label--sub" for="exam-plan-new-group">新しい大項目を追加</label>
            <div class="exam-item-add__row">
              <input id="exam-plan-new-group" class="input" type="text" />
              <button id="btn-exam-plan-add-group" class="btn btn--small btn--outline" type="button">追加</button>
            </div>
          </div>
          <div class="exam-item-add">
            <label class="label label--sub" for="exam-plan-new-standalone">新しい独立項目を追加</label>
            <div class="exam-item-add__row">
              <input id="exam-plan-new-standalone" class="input" type="text" />
              <button id="btn-exam-plan-add-standalone" class="btn btn--small btn--outline" type="button">追加</button>
            </div>
          </div>
        </div>
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
enterExamPlan("karte-a");
window.__ready = true;
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/exam-category-harness.html") {
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

await page.goto(`${base}/tools/exam-category-harness.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(300);

await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");

const tabLabels = await page.locator(".exam-item-category-tab").allTextContents();
console.log("TABS", tabLabels);
if (JSON.stringify(tabLabels) !== JSON.stringify(["血液", "画像", "病理", "その他"])) {
  throw new Error("category tabs wrong");
}

let active = await page.locator(".exam-item-category-tab.is-active").textContent();
if (active !== "血液") throw new Error("default should be 血液");

let buttons = await page.locator("#exam-plan-item-buttons .exam-item-btn").allTextContents();
console.log("BLOOD ROOT", buttons);
for (const label of ["肝臓", "腎臓", "脂質", "ホルモン", "CBC", "血糖(アントセンス)"]) {
  if (!buttons.includes(label)) throw new Error(`blood root missing ${label}`);
}
if (buttons.includes("ALT")) throw new Error("ALT should not appear at blood root");

// 大項目 → 内訳
await page.locator(".exam-item-btn", { hasText: "肝臓" }).click();
await page.waitForTimeout(50);
if (await page.isHidden("#exam-plan-blood-nav")) throw new Error("blood nav should show");
const navLabel = await page.locator("#exam-plan-blood-nav-label").textContent();
if (navLabel !== "肝臓") throw new Error("nav label should be 肝臓");
buttons = await page.locator("#exam-plan-item-buttons .exam-item-btn").allTextContents();
console.log("LIVER", buttons);
if (buttons[0] !== "肝スク") throw new Error("肝スク should be first in liver");
if (!buttons.includes("ALT") || !buttons.includes("AST")) throw new Error("liver children missing");
if (buttons.includes("CBC")) throw new Error("CBC leaked into liver");

await page.locator("#exam-plan-item-buttons .exam-item-btn", { hasText: /^ALT$/ }).click();
let selected = await page.locator("#exam-plan-item-buttons .exam-item-btn.is-selected").textContent();
if (selected !== "ALT") throw new Error("select ALT failed");
if (await page.isHidden("#exam-plan-fasting-field")) throw new Error("fasting should show for blood");

await page.locator('#exam-plan-fasting-buttons [data-fasting="required"]').click();
await page.fill("#exam-plan-due-date", "2026-08-01");
await page.click("#btn-exam-plan-save");
await page.waitForSelector("#exam-plan-modal[hidden]", { state: "attached" });
await page.waitForTimeout(100);

const listText = await page.locator("#exam-plan-list").innerText();
console.log("LIST", listText);
if (!listText.includes("肝臓（ALT）")) throw new Error("肝臓（ALT） not in plan list");
if (!listText.includes("絶食：必要")) throw new Error("fasting not shown in list");

// 独立項目
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await page.locator(".exam-item-btn", { hasText: "CBC" }).click();
selected = await page.locator(".exam-item-btn.is-selected").textContent();
if (selected !== "CBC") throw new Error("select CBC failed");
await page.locator('#exam-plan-fasting-buttons [data-fasting="none"]').click();
await page.fill("#exam-plan-due-date", "2026-08-02");
await page.click("#btn-exam-plan-save");
await page.waitForTimeout(100);
const listText2 = await page.locator("#exam-plan-list").innerText();
if (!listText2.includes("CBC") || !listText2.includes("絶食：不要")) {
  throw new Error("CBC fasting none not shown");
}

// 詳細シートでも絶食表示
await page.locator("#exam-plan-list .exam-list-item").filter({ hasText: "肝臓（ALT）" }).click();
await page.waitForSelector("#exam-item-sheet:not([hidden])");
const sheetFasting = await page.locator("#exam-item-sheet-fasting").textContent();
if (sheetFasting !== "絶食：必要") throw new Error("sheet fasting wrong");
await page.click("#btn-close-exam-item-sheet");

// 画像（大項目→内訳）
await page.click("#btn-exam-new");
await page.locator('.exam-item-category-tab[data-category="imaging"]').click();
await page.waitForTimeout(50);
buttons = await page.locator("#exam-plan-item-buttons .exam-item-btn").allTextContents();
console.log("IMAGING ROOT", buttons);
for (const label of ["セット", "心エコー", "腹部エコー"]) {
  if (!buttons.includes(label)) throw new Error(`imaging group missing ${label}`);
}
if (buttons.includes("胸部スク") || buttons.includes("全スク")) {
  throw new Error("old flat imaging leaves still at root");
}
await page.locator(".exam-item-btn", { hasText: /^セット$/ }).click();
await page.waitForTimeout(50);
if (!(await page.isVisible("#exam-plan-blood-nav"))) {
  throw new Error("imaging drill nav should show");
}
buttons = await page.locator("#exam-plan-item-buttons .exam-item-btn").allTextContents();
console.log("IMAGING SET", buttons);
for (const label of ["全set", "胸部set", "腹部set"]) {
  if (!buttons.includes(label)) throw new Error(`imaging set leaf missing ${label}`);
}
await page.click("#btn-exam-plan-blood-back");
await page.locator(".exam-item-btn", { hasText: /^心エコー$/ }).click();
await page.waitForTimeout(50);
buttons = await page.locator("#exam-plan-item-buttons .exam-item-btn").allTextContents();
console.log("IMAGING HEART", buttons);
for (const label of [
  "心エコー(スクリーニング)",
  "心エコー(流速あり)",
  "心エコー(拡大チェック)",
]) {
  if (!buttons.includes(label)) throw new Error(`heart echo leaf missing ${label}`);
}
await page.locator(".exam-item-btn", { hasText: "心エコー(スクリーニング)" }).click();
if (!(await page.isHidden("#exam-plan-fasting-field"))) {
  throw new Error("fasting should hide for imaging");
}
await page.click("#btn-exam-plan-blood-back");
await page.locator(".exam-item-btn", { hasText: /^腹部エコー$/ }).click();
await page.waitForTimeout(50);
buttons = await page.locator("#exam-plan-item-buttons .exam-item-btn").allTextContents();
console.log("IMAGING ABD", buttons);
for (const label of [
  "腹部エコー(スクリーニング)",
  "腹部エコー(脾臓)",
  "腹部エコー(肝臓)",
  "腹部エコー(腎臓)",
  "腹部エコー(尿管)",
  "腹部エコー(膀胱)",
  "腹部エコー(前立腺)",
]) {
  if (!buttons.includes(label)) throw new Error(`abdomen echo leaf missing ${label}`);
}
await page.locator(".exam-item-btn", { hasText: "腹部エコー(脾臓)" }).click();
const imgSummary = await page.locator("#exam-plan-selection-summary").innerText();
console.log("IMAGING SUMMARY", imgSummary);
if (!imgSummary.includes("心エコー(スクリーニング)")) {
  throw new Error(`missing heart echo in summary: ${imgSummary}`);
}
if (!imgSummary.includes("腹部エコー(脾臓)")) {
  throw new Error(`missing abdomen echo in summary: ${imgSummary}`);
}

// 病理
await page.locator('.exam-item-category-tab[data-category="pathology"]').click();
await page.waitForTimeout(50);
buttons = await page.locator("#exam-plan-item-buttons .exam-item-btn").allTextContents();
console.log("PATHOLOGY", buttons);
const pathologySeeds = [
  "細胞診(院内)",
  "細胞診(外注)",
  "組織検査",
  "細菌培養(院内)",
  "細菌培養(外注)",
  "真菌培養(院内)",
  "真菌培養(外注)",
];
for (const label of pathologySeeds) {
  if (!buttons.includes(label)) throw new Error(`pathology seed missing ${label}`);
}
await page.locator(".exam-item-btn", { hasText: "組織検査" }).click();
selected = await page.locator(".exam-item-btn.is-selected").textContent();
if (selected !== "組織検査") throw new Error("select pathology item failed");
if (!(await page.isHidden("#exam-plan-fasting-field"))) {
  throw new Error("fasting should hide for pathology");
}
await page.fill("#exam-plan-new-item", "追加病理");
await page.click("#btn-exam-plan-add-item");
await page.waitForTimeout(200);
buttons = await page.locator("#exam-plan-item-buttons .exam-item-btn").allTextContents();
console.log("PATHOLOGY after add", buttons);
if (!buttons.includes("追加病理")) throw new Error("add pathology item failed");

await page.screenshot({ path: path.join(root, "tools/exam-category-verify.png") });
if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: blood hierarchy + fasting + pathology + categories");
await browser.close();
server.close();
