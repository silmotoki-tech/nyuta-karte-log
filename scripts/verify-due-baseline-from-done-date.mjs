/**
 * 検査・処置の「実施記録を追加」画面: カレンダーで選んだ次回予定は
 * 実施日を変えても書き換わらないこと、予定と実施記録の同時保存ができること。
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

function pad2(n) {
  return String(n).padStart(2, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// アプリの相対日数は月=30日固定換算（DAYS_PER_MONTH）。暦月ではない。
const DAYS_PER_MONTH = 30;
function addDays(base, days) {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function addMonths(base, months) {
  return addDays(base, months * DAYS_PER_MONTH);
}

function startServer(harness) {
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
  return server;
}

async function typeNumpad(page, numpadSel, digits) {
  for (const d of String(digits)) {
    await page.locator(`${numpadSel} .numpad__btn`, { hasText: d }).first().click();
  }
  await page.locator(`${numpadSel} .numpad__btn--confirm`).click();
}

// ---------------------------------------------------------------------
// 1) 検査: exam-plan-ui.js
// ---------------------------------------------------------------------
async function runExamCase() {
  const mockDb = fs.readFileSync(
    path.join(__dirname, "mock-db-exam-categories.js"),
    "utf-8"
  );
  const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
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
  <button id="btn-close-exam-item-sheet" type="button"></button>
  <p id="exam-item-sheet-title"></p>
  <p id="exam-item-sheet-item"></p>
  <p id="exam-item-sheet-fasting" hidden></p>
  <div id="exam-sheet-fasting-field" hidden>
    <div id="exam-sheet-fasting-buttons"></div>
  </div>
  <input id="exam-sheet-due-date" type="date" />
  <input id="exam-sheet-due-date-to" type="date" />
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
            <div class="med-linear-picker__list" id="exam-plan-col-category-list"></div>
          </div>
          <div class="med-linear-picker__col" id="exam-plan-col-group">
            <div class="med-linear-picker__list" id="exam-plan-col-group-list"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="exam-plan-col-leaf">
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list"></div>
            <p id="exam-plan-items-empty" hidden></p>
            <div class="exam-item-add" id="exam-plan-item-add-default">
              <label id="exam-plan-new-item-label" for="exam-plan-new-item"></label>
              <input id="exam-plan-new-item" class="input" type="text" />
              <button id="btn-exam-plan-add-item" type="button">追加</button>
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
          <input id="exam-plan-due-date" class="input input--date" type="date" />
          <input id="exam-plan-due-date-to" class="input input--date" type="date" />
          <p class="field__note" id="exam-plan-window-note"></p>
          <input id="exam-plan-note" type="text" />
        </section>
        <section class="exam-plan-section exam-plan-section--done exam-plan-done-field" id="exam-plan-done-field">
          <label class="exam-other-check">
            <input type="checkbox" id="exam-plan-done-check" />
            <span>実施履歴に登録する</span>
          </label>
          <div class="exam-plan-done-block" id="exam-plan-done-block">
            <input id="exam-plan-done-date" class="input input--date" type="date" disabled />
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
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterExamPlan("karte-baseline");
window.__ready = true;
</script>
</body>
</html>`;

  const server = startServer(harness);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: mockDb })
  );
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);

  await page.click("#btn-exam-new");
  await page.waitForSelector("#exam-plan-modal:not([hidden])");
  await page.locator("#exam-plan-col-category-list [role='option']").first().click();
  await page.waitForTimeout(60);
  await page.locator("#exam-plan-col-leaf-list [role='option']").first().click();
  await page.waitForTimeout(60);

  // カレンダーで選んだ日付は、実施日を変えても書き換わらない
  await page.check("#exam-plan-done-check");
  await page.waitForFunction(
    () => document.getElementById("exam-plan-done-date")?.disabled === false
  );
  const pastDone = "2026-07-22";
  await page.fill("#exam-plan-done-date", pastDone);
  await page.dispatchEvent("#exam-plan-done-date", "change");
  await page.waitForTimeout(60);

  const dueFrom = addDays(todayStr(), 45);
  const dueTo = addDays(todayStr(), 60);
  await page.fill("#exam-plan-due-date", dueFrom);
  await page.dispatchEvent("#exam-plan-due-date", "change");
  await page.fill("#exam-plan-due-date-to", dueTo);
  await page.dispatchEvent("#exam-plan-due-date-to", "change");
  await page.waitForTimeout(60);
  console.log("[exam] calendar due:", await page.inputValue("#exam-plan-due-date"));

  await page.fill("#exam-plan-done-date", todayStr());
  await page.dispatchEvent("#exam-plan-done-date", "change");
  await page.waitForTimeout(60);
  const stillFrom = await page.inputValue("#exam-plan-due-date");
  const stillTo = await page.inputValue("#exam-plan-due-date-to");
  console.log("[exam] after done-date change:", { stillFrom, stillTo });
  if (stillFrom !== dueFrom || stillTo !== dueTo) {
    throw new Error(
      `exam: calendar dates should stay ${dueFrom}〜${dueTo}, got ${stillFrom}〜${stillTo}`
    );
  }

  if (errors.length) throw new Error("exam page errors: " + errors.join("; "));
  await browser.close();
  server.close();
  console.log("OK: exam 次回予定の相対計算は実施日基準（過去日／今日とも）");
}

// ---------------------------------------------------------------------
// 2) 処置: procedures-ui.js
// ---------------------------------------------------------------------
async function runProcedureCase() {
  const mockDb = fs.readFileSync(
    path.join(__dirname, "mock-db-procedures.js"),
    "utf-8"
  );
  const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<link rel="stylesheet" href="/css/style.css" />
</head><body>
<aside class="right-column" style="max-width:420px;margin:0 auto;min-height:100vh;background:var(--color-cream)">
  <div class="right-panel" id="panel-proc" data-panel="proc">
    <button id="btn-procedure-plan-add" class="btn btn--small btn--primary" type="button">予定を登録</button>
    <button id="btn-procedure-add" class="btn btn--small btn--outline" type="button">実施を記録</button>
    <ul class="exam-list" id="procedure-plan-list"></ul>
    <p id="procedure-plan-empty"></p>
    <ul class="proc-list" id="procedures-list"></ul>
    <p id="procedures-empty"></p>
  </div>
</aside>

<div class="modal" id="procedure-plan-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--procedure-plan">
    <div class="modal__header">
      <h2 class="modal__title" id="procedure-plan-modal-title">処置予定を登録</h2>
      <button class="modal__close" id="btn-close-procedure-plan-modal" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <textarea id="procedure-plan-content" class="textarea" rows="3"></textarea>
      </div>
      <div class="view-toggle procedure-plan-mode-toggle" id="procedure-plan-mode-toggle">
        <button type="button" class="view-toggle__btn is-active" id="btn-procedure-mode-plan" data-mode="plan">予定を登録</button>
        <button type="button" class="view-toggle__btn" id="btn-procedure-mode-history" data-mode="history">実施を記録</button>
      </div>
      <div class="field" id="procedure-plan-history-date-field" hidden>
        <input id="procedure-plan-history-date" class="input input--date" type="date" />
      </div>
      <div class="exam-plan-dual" id="procedure-plan-dual">
        <section class="exam-plan-section exam-plan-section--plan exam-due-field" id="procedure-plan-due-field">
          <div class="exam-due-compact">
            <input id="procedure-plan-due-date" class="input input--date exam-due-compact__date" type="date" />
            <input id="procedure-plan-due-date-to" class="input input--date exam-due-compact__date" type="date" />
            <p class="field__note" id="procedure-plan-window-note"></p>
          </div>
        </section>
        <section class="exam-plan-section exam-plan-section--done exam-plan-done-field" id="procedure-plan-done-field">
          <label class="exam-other-check" id="procedure-plan-done-check-row">
            <input type="checkbox" id="procedure-plan-done-check" />
            <span>実施履歴に登録する</span>
          </label>
          <div class="exam-plan-done-block" id="procedure-plan-done-block">
            <input id="procedure-plan-done-date" class="input input--date" type="date" disabled />
            <input id="procedure-plan-done-note" class="input" type="text" disabled />
          </div>
        </section>
      </div>
      <div class="field">
        <input id="procedure-plan-note" class="input" type="text" />
      </div>
      <p id="procedure-plan-error" class="error-text" hidden></p>
    </div>
    <div class="modal__footer">
      <button id="btn-procedure-plan-save" class="btn btn--small btn--primary" type="button">保存する</button>
      <button id="btn-procedure-plan-complete" class="btn btn--small btn--outline" type="button" hidden>完了として記録</button>
      <button id="btn-procedure-plan-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<div class="modal" id="procedure-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <h2 class="modal__title" id="procedure-modal-title">実施を記録</h2>
    <button class="modal__close" id="btn-close-procedure-modal" type="button">&times;</button>
    <input id="procedure-date" class="input input--date" type="date" />
    <textarea id="procedure-content" class="textarea"></textarea>
    <input id="procedure-note" class="input" type="text" />
    <p id="procedure-error" hidden></p>
    <button id="btn-procedure-save" type="button">追加する</button>
    <button id="btn-procedure-cancel" type="button">キャンセル</button>
  </div>
</div>

<script type="module">
import { initProceduresUI, enterProcedures } from "/js/procedures-ui.js";
initProceduresUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterProcedures("karte-proc-baseline");
window.__ready = true;
</script>
</body></html>`;

  const server = startServer(harness);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 460, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: mockDb })
  );
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);

  await page.click("#btn-procedure-plan-add");
  await page.waitForSelector("#procedure-plan-modal:not([hidden])");
  await page.fill("#procedure-plan-content", "抜糸");

  const pastDone = "2026-07-22";
  const picked = addDays(todayStr(), 45);
  await page.fill("#procedure-plan-due-date", picked);
  await page.dispatchEvent("#procedure-plan-due-date", "change");
  await page.check("#procedure-plan-done-check");
  await page.waitForFunction(
    () => document.getElementById("procedure-plan-done-date")?.disabled === false
  );
  await page.fill("#procedure-plan-done-date", pastDone);
  await page.dispatchEvent("#procedure-plan-done-date", "change");
  await page.waitForTimeout(60);
  const dueFromPast = await page.inputValue("#procedure-plan-due-date");
  console.log("[procedure] after past done:", dueFromPast, "picked:", picked);
  if (dueFromPast !== picked) {
    throw new Error(`procedure: calendar date should stay ${picked}, got ${dueFromPast}`);
  }

  await page.uncheck("#procedure-plan-done-check");
  await page.waitForTimeout(60);
  const dueFromToday = await page.inputValue("#procedure-plan-due-date");
  console.log("[procedure] after uncheck done:", dueFromToday);
  if (dueFromToday !== picked) {
    throw new Error(`procedure: calendar date should stay ${picked}, got ${dueFromToday}`);
  }

  // 予定＋実施記録を同時保存できること（結合保存の回帰確認）
  await page.check("#procedure-plan-done-check");
  await page.waitForFunction(
    () => document.getElementById("procedure-plan-done-date")?.disabled === false
  );
  await page.fill("#procedure-plan-done-date", pastDone);
  await page.dispatchEvent("#procedure-plan-done-date", "change");
  await page.click("#btn-procedure-plan-save");
  await page.waitForFunction(
    () => document.getElementById("procedure-plan-modal")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  const planCount = await page.locator("#procedure-plan-list .exam-list-item").count();
  // モックDBには互換確認用の旧形式履歴が1件あらかじめ入っているため、
  // 「今回追加した実施履歴」は 抜糸 の見出しグループで判定する。
  const histGroupTitles = await page
    .locator("#procedures-list .exam-history-group-title__label")
    .allTextContents();
  console.log("[procedure] combined save:", { planCount, histGroupTitles });
  if (planCount !== 1) throw new Error("procedure: combined save should create 1 plan");
  if (!histGroupTitles.some((t) => t.includes("抜糸"))) {
    throw new Error("procedure: combined save should add 実施履歴 for 抜糸");
  }

  if (errors.length) throw new Error("procedure page errors: " + errors.join("; "));
  await browser.close();
  server.close();
  console.log("OK: 処置 次回予定の相対計算は実施日基準（過去日／今日とも）＋結合保存");
}

await runExamCase();
await runProcedureCase();
console.log("OK: due-date baseline follows 実施日 (exam + procedure)");
