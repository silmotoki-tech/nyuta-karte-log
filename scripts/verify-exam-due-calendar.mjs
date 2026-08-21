/**
 * 検査予定のカレンダー2欄（目安の始め／目安の終わり）で日付を直接選択できることを検証する。
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
  <title>exam due calendar</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh;padding:12px">
  <button id="btn-exam-new" class="btn btn--small btn--primary" type="button">予定を登録</button>
  <ul class="exam-list" id="exam-plan-list"></ul>
  <p id="exam-plan-empty"></p>
  <ul class="exam-list" id="exam-history-list"></ul>
  <p id="exam-history-empty"></p>
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
    <div class="field exam-due-field">
      <span class="label">次回予定</span>
      <div class="exam-due-calendar">
        <div class="exam-due-calendar__row exam-due-calendar__row--range">
          <label class="exam-due-calendar__pair">
            <span class="label label--sub">目安の始め</span>
            <input id="exam-sheet-due-date" class="input input--date exam-due-calendar__input" type="date" />
          </label>
          <span class="exam-due-calendar__tilde">〜</span>
          <label class="exam-due-calendar__pair">
            <span class="label label--sub">目安の終わり</span>
            <input id="exam-sheet-due-date-to" class="input input--date exam-due-calendar__input" type="date" />
          </label>
        </div>
      </div>
      <p class="field__note" id="exam-sheet-window-note"></p>
    </div>
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
      <div class="field">
        <span class="label">検査項目</span>
        <div class="med-linear-picker" id="exam-plan-linear-picker" data-cols="3">
          <div class="med-linear-picker__col" id="exam-plan-col-category">
            <div class="med-linear-picker__head">大項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-category-list"></div>
          </div>
          <div class="med-linear-picker__col" id="exam-plan-col-group">
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-group-list"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="exam-plan-col-leaf">
            <div class="med-linear-picker__head">検査項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list"></div>
            <p id="exam-plan-items-empty" hidden></p>
            <div class="exam-item-add" id="exam-plan-item-add-default">
              <label id="exam-plan-new-item-label" for="exam-plan-new-item">新しい項目</label>
              <div class="exam-item-add__row">
                <input id="exam-plan-new-item" class="input" type="text" />
                <button id="btn-exam-plan-add-item" type="button">追加</button>
              </div>
            </div>
          </div>
        </div>
        <p id="exam-plan-selection-summary" hidden></p>
        <p id="exam-plan-item-error" hidden></p>
      </div>
      <div class="field" id="exam-plan-fasting-field" hidden>
        <div id="exam-plan-fasting-buttons"></div>
      </div>
      <div class="exam-plan-dual" id="exam-plan-dual">
        <section class="exam-plan-section exam-plan-section--plan exam-due-field">
          <h3 class="exam-plan-section__title">次回予定の登録</h3>
          <div class="exam-due-compact">
            <div class="exam-due-compact__date-row exam-due-compact__date-row--range">
              <div class="exam-due-compact__date-pair">
                <label class="label label--sub" for="exam-plan-due-date">目安の始め</label>
                <input id="exam-plan-due-date" class="input input--date exam-due-compact__date" type="date" />
              </div>
              <span class="exam-due-compact__date-tilde">〜</span>
              <div class="exam-due-compact__date-pair">
                <label class="label label--sub" for="exam-plan-due-date-to">目安の終わり</label>
                <input id="exam-plan-due-date-to" class="input input--date exam-due-compact__date" type="date" />
              </div>
            </div>
            <p class="field__note" id="exam-plan-window-note"></p>
            <input id="exam-plan-note" type="text" />
          </div>
        </section>
        <section class="exam-plan-section exam-plan-section--done exam-plan-done-field" id="exam-plan-done-field">
          <h3 class="exam-plan-section__title">本日実施した内容の記録</h3>
          <label class="exam-other-check">
            <input type="checkbox" id="exam-plan-done-check" />
            <span>実施履歴に登録する</span>
          </label>
          <div class="exam-plan-done-block" id="exam-plan-done-block">
            <label class="label label--sub" for="exam-plan-done-date">実施日</label>
            <input id="exam-plan-done-date" class="input input--date" type="date" disabled />
            <label class="label label--sub" for="exam-plan-done-note">実施メモ（任意）</label>
            <input id="exam-plan-done-note" class="input" type="text" disabled />
          </div>
        </section>
      </div>
      <p id="exam-plan-error" hidden></p>
    </div>
    <div class="modal__footer">
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
enterExamPlan("karte-due");
window.__ready = true;
</script>
</body>
</html>`;

function pad2(n) {
  return String(n).padStart(2, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDays(base, days) {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

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
  viewport: { width: 440, height: 900 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);

await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await page.waitForTimeout(100);

// 日付欄があり、重複カレンダーボタンは無いこと
const planModal = page.locator("#exam-plan-modal");
const dateVisible = await page.locator("#exam-plan-due-date").isVisible();
const btnCount = await page.locator("#btn-exam-plan-due-calendar").count();
if (!dateVisible) throw new Error("date input missing");
if (btnCount !== 0) throw new Error("calendar button should be removed");
await planModal.locator(".exam-due-field").scrollIntoViewIfNeeded();
await page.screenshot({
  path: path.join(root, "tools/exam-due-calendar-01-ui.png"),
});

// 予定日帯が検査選択枠の下（枠外）にあること
const layoutOk = await page.evaluate(() => {
  const picker = document.getElementById("exam-plan-linear-picker");
  const due = document.querySelector("#exam-plan-modal .exam-due-field");
  if (!picker || !due) return false;
  const pr = picker.getBoundingClientRect();
  const dr = due.getBoundingClientRect();
  return dr.top >= pr.bottom - 1;
});
if (!layoutOk) throw new Error("due field overlaps / sits inside picker");

const doneVisible = await page.locator("#exam-plan-done-field").isVisible();
if (!doneVisible) throw new Error("done field missing");

// カレンダーで日付を直接選択（片方だけならもう片方は空のまま）
const target = addDays(todayStr(), 14);
const targetTo = addDays(todayStr(), 30);
await page.fill("#exam-plan-due-date", target);
await page.dispatchEvent("#exam-plan-due-date", "change");
await page.waitForTimeout(80);
const dateVal = await page.inputValue("#exam-plan-due-date");
const emptyTo = await page.inputValue("#exam-plan-due-date-to");
console.log("after calendar from only:", { dateVal, emptyTo, target });
if (dateVal !== target) throw new Error(`date not set: ${dateVal}`);
if (emptyTo) throw new Error(`empty to should stay empty, got ${emptyTo}`);
await page.fill("#exam-plan-due-date-to", targetTo);
await page.dispatchEvent("#exam-plan-due-date-to", "change");
const toVal = await page.inputValue("#exam-plan-due-date-to");
if (toVal !== targetTo) throw new Error(`to date not set: ${toVal}`);
await page.screenshot({
  path: path.join(root, "tools/exam-due-calendar-02-from-cal.png"),
});

await page.screenshot({
  path: path.join(root, "tools/exam-due-calendar-03-from-numpad.png"),
});

// 日付欄タップで showPicker / focus されること
const pickerOk = await page.evaluate(() => {
  const input = document.getElementById("exam-plan-due-date");
  if (!input) return false;
  let called = false;
  const orig = input.showPicker;
  input.showPicker = () => {
    called = true;
  };
  input.click();
  input.showPicker = orig;
  return called || document.activeElement === input;
});
if (!pickerOk) throw new Error("date input did not open/focus picker");

// 当日実施チェック → 保存で予定＋履歴（絶食不要の「その他」を使う）
await page.locator("#exam-plan-col-category-list [role='option']", { hasText: "その他" }).click();
await page.waitForTimeout(80);
await page.locator("#exam-plan-col-leaf-list [role='option']").first().click();
await page.check("#exam-plan-done-check");
await page.waitForFunction(
  () => document.getElementById("exam-plan-done-date")?.disabled === false
);
await page.fill("#exam-plan-done-note", "当日実施メモ");
await page.click("#btn-exam-plan-save");
await page.waitForTimeout(200);
const saveErr = (await page.locator("#exam-plan-error").innerText().catch(() => "")).trim();
if (saveErr) throw new Error(`save failed: ${saveErr}`);
const saved = await page.evaluate(async () => {
  const { getExamPlan } = await import("/js/db.js");
  const plan = await getExamPlan("karte-due");
  const plans = Object.values(plan?.plans || {});
  const history = Object.values(plan?.history || {});
  return {
    planCount: plans.length,
    historyCount: history.length,
    historyNote: history[0]?.note || "",
    historyItem: history[0]?.item || "",
  };
});
console.log("after save with done:", saved);
if (saved.planCount < 1) throw new Error("plan not saved");
if (saved.historyCount < 1) throw new Error("history not saved");
if (saved.historyNote !== "当日実施メモ") {
  throw new Error(`history note wrong: ${saved.historyNote}`);
}
await page.screenshot({
  path: path.join(root, "tools/exam-due-calendar-04-done-saved.png"),
});

if (errors.length) throw new Error("page errors: " + errors.join("; "));
console.log("OK: exam due calendar + done history");
await browser.close();
server.close();
