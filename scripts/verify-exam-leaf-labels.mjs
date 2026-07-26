/**
 * 小項目ラベルの親名重複表示がないことを検証し、スクショを残す。
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

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-exam-categories.js"),
  "utf-8"
);

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>exam leaf labels</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="max-width:440px;margin:0 auto;background:var(--color-cream);min-height:100vh;padding:12px">
  <button id="btn-exam-new" class="btn btn--small btn--primary" type="button">予定を登録</button>
  <ul class="exam-list" id="exam-plan-list"></ul>
  <p id="exam-plan-empty"></p>
  <ul class="exam-list" id="exam-history-list"></ul>
  <p id="exam-history-empty"></p>
</aside>

<div class="modal" id="exam-item-sheet" hidden>
  <button id="btn-close-exam-item-sheet" type="button"></button>
  <p id="exam-item-sheet-title"></p>
  <p id="exam-item-sheet-item"></p>
  <p id="exam-item-sheet-fasting" hidden></p>
  <div id="exam-sheet-fasting-field" hidden>
    <div id="exam-sheet-fasting-buttons">
      <button type="button" data-fasting="required">必要</button>
      <button type="button" data-fasting="none">不要</button>
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

<div class="modal" id="exam-plan-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--exam-plan">
    <div class="modal__header">
      <h2 class="modal__title" id="exam-plan-modal-title">予定を登録</h2>
      <button class="modal__close" id="btn-close-exam-plan" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <span class="label">検査項目</span>
        <div class="med-linear-picker" id="exam-plan-linear-picker" data-cols="3">
          <div class="med-linear-picker__col" id="exam-plan-col-category">
            <div class="med-linear-picker__head">大項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-category-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col" id="exam-plan-col-group">
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-group-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="exam-plan-col-leaf">
            <div class="med-linear-picker__head">検査項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list" role="listbox"></div>
            <p id="exam-plan-items-empty" hidden></p>
            <div class="exam-item-add" id="exam-plan-item-add-default">
              <label id="exam-plan-new-item-label" for="exam-plan-new-item">新しい項目を追加</label>
              <div class="exam-item-add__row">
                <input id="exam-plan-new-item" class="input" type="text" />
                <button id="btn-exam-plan-add-item" type="button">追加</button>
              </div>
            </div>
          </div>
        </div>
        <p class="field__note exam-plan-selection-summary" id="exam-plan-selection-summary" hidden></p>
        <p id="exam-plan-item-error" hidden></p>
      </div>
      <div class="field" id="exam-plan-fasting-field" hidden>
        <div id="exam-plan-fasting-buttons" class="exam-fasting-buttons">
          <button type="button" class="exam-fasting-btn" data-fasting="required">必要</button>
          <button type="button" class="exam-fasting-btn" data-fasting="none">不要</button>
        </div>
      </div>
      <div class="field exam-due-field">
        <input id="exam-plan-due-date" type="date" />
        <div id="exam-plan-due-units"></div>
        <p id="exam-plan-due-display"></p>
        <div id="exam-plan-due-numpad"></div>
        <p id="exam-plan-window-note"></p>
      </div>
      <div id="exam-plan-done-field" hidden></div>
      <input id="exam-plan-note" type="text" />
      <p id="exam-plan-error" hidden></p>
      <button id="btn-exam-plan-save" type="button">保存する</button>
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
enterExamPlan("karte-leaf");
window.__ready = true;
</script>
</body>
</html>`;

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
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const browser = await launchBrowser();
const page = await browser.newPage({
  viewport: { width: 460, height: 920 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);

async function clickLinear(listSel, text) {
  await page.locator(`${listSel} [role='option']`, { hasText: text }).first().click();
  await page.waitForTimeout(60);
}

async function leafLabels() {
  return page.locator("#exam-plan-col-leaf-list .med-linear-picker__item-label").allTextContents();
}

async function summary() {
  const el = page.locator("#exam-plan-selection-summary");
  if (await el.isHidden()) return "";
  return (await el.innerText()).trim();
}

function assertNoDup(text, parent) {
  if (
    text.includes(`${parent}（${parent}`) ||
    text.includes(`${parent}(${parent}`) ||
    text.includes(`${parent} ＞ ${parent}`)
  ) {
    throw new Error(`duplicated parent in: ${text}`);
  }
}

await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");

// 1) レントゲン → 腹部
await clickLinear("#exam-plan-col-category-list", "画像");
await clickLinear("#exam-plan-col-group-list", "レントゲン");
const xrayLeaves = await leafLabels();
console.log("xray leaves:", xrayLeaves);
if (!xrayLeaves.includes("腹部") || xrayLeaves.includes("レントゲン(腹部)")) {
  throw new Error(`xray leaf labels wrong: ${xrayLeaves.join(",")}`);
}
await clickLinear("#exam-plan-col-leaf-list", "腹部");
let sum = await summary();
console.log("xray summary:", sum);
if (!sum.includes("レントゲン ＞ 腹部")) throw new Error(`xray summary wrong: ${sum}`);
assertNoDup(sum, "レントゲン");
await page.locator("#exam-plan-selection-summary").scrollIntoViewIfNeeded();
await page.screenshot({
  path: path.join(root, "tools/exam-leaf-labels-01-xray.png"),
});

// 2) 心エコー → スクリーニング（前選択を外すためモーダル再オープン）
await page.click("#btn-close-exam-plan");
await page.waitForTimeout(40);
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await clickLinear("#exam-plan-col-category-list", "画像");
await clickLinear("#exam-plan-col-group-list", "心エコー");
const heartLeaves = await leafLabels();
console.log("heart leaves:", heartLeaves);
if (!heartLeaves.includes("スクリーニング") || heartLeaves.some((l) => l.includes("心エコー("))) {
  throw new Error(`heart echo leaves wrong: ${heartLeaves.join(",")}`);
}
await clickLinear("#exam-plan-col-leaf-list", "スクリーニング");
sum = await summary();
console.log("heart summary:", sum);
if (!sum.includes("心エコー ＞ スクリーニング")) throw new Error(`heart summary wrong: ${sum}`);
assertNoDup(sum, "心エコー");
await page.screenshot({
  path: path.join(root, "tools/exam-leaf-labels-02-heart-echo.png"),
});

// 3) 腹部エコー → 脾臓
await page.click("#btn-close-exam-plan");
await page.waitForTimeout(40);
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await clickLinear("#exam-plan-col-category-list", "画像");
await clickLinear("#exam-plan-col-group-list", "腹部エコー");
const abdLeaves = await leafLabels();
console.log("abdomen leaves:", abdLeaves);
if (!abdLeaves.includes("脾臓") || abdLeaves.some((l) => l.includes("腹部エコー("))) {
  throw new Error(`abdomen echo leaves wrong: ${abdLeaves.join(",")}`);
}
await clickLinear("#exam-plan-col-leaf-list", "脾臓");
sum = await summary();
console.log("abdomen summary:", sum);
if (!sum.includes("腹部エコー ＞ 脾臓")) throw new Error(`abdomen summary wrong: ${sum}`);
assertNoDup(sum, "腹部エコー");
await page.screenshot({
  path: path.join(root, "tools/exam-leaf-labels-03-abdomen-echo.png"),
});

// 4) 血液 → 肝臓 → ALT・AST
await page.click("#btn-close-exam-plan");
await page.waitForTimeout(40);
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await clickLinear("#exam-plan-col-category-list", "血液");
await clickLinear("#exam-plan-col-group-list", "肝臓");
const liverLeaves = await leafLabels();
console.log("liver leaves:", liverLeaves);
if (!liverLeaves.includes("ALT") || !liverLeaves.includes("肝スク")) {
  throw new Error(`liver leaves wrong: ${liverLeaves.join(",")}`);
}
await clickLinear("#exam-plan-col-leaf-list", "ALT");
await clickLinear("#exam-plan-col-leaf-list", "AST");
sum = await summary();
console.log("liver summary:", sum);
if (!sum.includes("肝臓 ＞ ALT・AST") && !sum.includes("肝臓 ＞ AST・ALT")) {
  throw new Error(`liver summary wrong: ${sum}`);
}
assertNoDup(sum, "肝臓");
await page.screenshot({
  path: path.join(root, "tools/exam-leaf-labels-04-blood-liver.png"),
});

if (errors.length) throw new Error("page errors: " + errors.join("; "));
console.log("OK: exam leaf labels without parent duplication");
await browser.close();
server.close();
