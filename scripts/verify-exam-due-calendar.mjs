/**
 * 検査予定のカレンダー直接選択 ↔ 相対テンキー連動を検証する。
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
      <span class="label">次回予定日</span>
      <div class="exam-due-calendar">
        <span class="label label--sub exam-due-calendar__caption">カレンダーで直接選択</span>
        <div class="exam-due-calendar__row">
          <input id="exam-sheet-due-date" class="input input--date exam-due-calendar__input" type="date" />
          <button id="btn-exam-sheet-due-calendar" class="btn btn--small btn--outline exam-due-calendar__btn" type="button">カレンダー</button>
        </div>
      </div>
      <span class="label label--sub">今日からの相対指定</span>
      <div class="interval-unit-buttons" id="exam-sheet-due-units"></div>
      <p class="interval-value-display" id="exam-sheet-due-display">0日後</p>
      <div class="numpad" id="exam-sheet-due-numpad"></div>
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
      <div class="field exam-due-field">
        <span class="label">予定日</span>
        <div class="exam-due-calendar">
          <span class="label label--sub exam-due-calendar__caption">カレンダーで直接選択</span>
          <div class="exam-due-calendar__row">
            <input id="exam-plan-due-date" class="input input--date exam-due-calendar__input" type="date" />
            <button id="btn-exam-plan-due-calendar" class="btn btn--small btn--outline exam-due-calendar__btn" type="button">カレンダー</button>
          </div>
        </div>
        <span class="label label--sub">今日からの相対指定</span>
        <div class="interval-unit-buttons" id="exam-plan-due-units"></div>
        <p class="interval-value-display" id="exam-plan-due-display">0日後</p>
        <div class="numpad" id="exam-plan-due-numpad"></div>
        <p class="field__note">カレンダーで選ぶか、テンキーで相対日数を指定してください（どちらも連動します）。</p>
        <p class="field__note" id="exam-plan-window-note"></p>
      </div>
      <div class="field exam-plan-done-field" id="exam-plan-done-field">
        <span class="label">当日のやった内容（任意）</span>
        <label class="exam-other-check">
          <input type="checkbox" id="exam-plan-done-check" />
          <span>選択した検査を実施履歴に登録する</span>
        </label>
        <div class="exam-plan-done-block" id="exam-plan-done-block" hidden>
          <label class="label label--sub" for="exam-plan-done-date">実施日</label>
          <input id="exam-plan-done-date" class="input input--date" type="date" />
          <label class="label label--sub" for="exam-plan-done-note">実施メモ（任意）</label>
          <input id="exam-plan-done-note" class="input" type="text" />
        </div>
      </div>
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

// カレンダーUIが表示されていること
const planModal = page.locator("#exam-plan-modal");
const calendarVisible = await planModal.locator(".exam-due-calendar").isVisible();
const dateVisible = await page.locator("#exam-plan-due-date").isVisible();
const btnVisible = await page.locator("#btn-exam-plan-due-calendar").isVisible();
if (!calendarVisible || !dateVisible || !btnVisible) {
  throw new Error("calendar UI missing");
}
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

// カレンダーで日付を直接選択 → 相対表示へ連動
const target = addDays(todayStr(), 14);
await page.fill("#exam-plan-due-date", target);
await page.dispatchEvent("#exam-plan-due-date", "change");
await page.waitForTimeout(80);
const dateVal = await page.inputValue("#exam-plan-due-date");
const relative = await page.locator("#exam-plan-due-display").innerText();
console.log("after calendar:", { dateVal, relative, target });
if (dateVal !== target) throw new Error(`date not set: ${dateVal}`);
if (
  !relative.includes("2週間後") &&
  !relative.includes("2週後") &&
  !relative.includes("14日後")
) {
  throw new Error(`relative not synced from calendar: ${relative}`);
}
await page.screenshot({
  path: path.join(root, "tools/exam-due-calendar-02-from-cal.png"),
});

// テンキー（相対）→ カレンダーへ連動
await page.locator("#exam-plan-due-units .interval-unit-btn", { hasText: "日" }).click();
await page.locator("#exam-plan-due-numpad .numpad__btn", { hasText: "削除" }).click();
await page.locator("#exam-plan-due-numpad .numpad__btn", { hasText: "削除" }).click();
await page.locator("#exam-plan-due-numpad .numpad__btn", { hasText: "削除" }).click();
await page.locator("#exam-plan-due-numpad .numpad__btn", { hasText: "削除" }).click();
await page.locator("#exam-plan-due-numpad .numpad__btn", { hasText: "3" }).click();
await page.locator("#exam-plan-due-numpad .numpad__btn", { hasText: "0" }).click();
await page.locator("#exam-plan-due-numpad .numpad__btn--confirm").click();
await page.waitForTimeout(80);
const afterNumpadDate = await page.inputValue("#exam-plan-due-date");
const afterNumpadRel = await page.locator("#exam-plan-due-display").innerText();
const expect30 = addDays(todayStr(), 30);
console.log("after numpad:", { afterNumpadDate, afterNumpadRel, expect30 });
if (afterNumpadDate !== expect30) {
  throw new Error(`calendar not synced from numpad: ${afterNumpadDate}`);
}
if (!afterNumpadRel.includes("30日後") && !afterNumpadRel.includes("1ヶ月後")) {
  throw new Error(`relative label wrong after numpad: ${afterNumpadRel}`);
}
await page.screenshot({
  path: path.join(root, "tools/exam-due-calendar-03-from-numpad.png"),
});

// カレンダーボタンが showPicker / focus を呼べること
const pickerOk = await page.evaluate(() => {
  const input = document.getElementById("exam-plan-due-date");
  const btn = document.getElementById("btn-exam-plan-due-calendar");
  if (!input || !btn) return false;
  let called = false;
  const orig = input.showPicker;
  input.showPicker = () => {
    called = true;
  };
  btn.click();
  input.showPicker = orig;
  return called || document.activeElement === input;
});
if (!pickerOk) throw new Error("calendar button did not open/focus picker");

// 当日実施チェック → 保存で予定＋履歴（絶食不要の「その他」を使う）
await page.locator("#exam-plan-col-category-list [role='option']", { hasText: "その他" }).click();
await page.waitForTimeout(80);
await page.locator("#exam-plan-col-leaf-list [role='option']").first().click();
await page.check("#exam-plan-done-check");
await page.waitForSelector("#exam-plan-done-block:not([hidden])");
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
