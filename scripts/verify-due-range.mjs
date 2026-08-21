/**
 * 検査・処置の次回予定をカレンダー2欄（目安の始め〜目安の終わり）で指定・保存・表示できること。
 * 単一日付は従来どおり「あとN日」。色分けは終了日（遅い方）基準。
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
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  try {
    return await chromium.launch({
      channel: "chrome",
      headless: true,
      timeout: 30_000,
    });
  } catch (err) {
    console.warn("launch failed (channel chrome):", err.message);
  }
  throw new Error("Could not launch Chromium");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDays(base, days) {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
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

async function fillDueRange(page, fromSel, toSel, fromDate, toDate) {
  await page.fill(fromSel, fromDate);
  await page.dispatchEvent(fromSel, "change");
  if (toDate) {
    await page.fill(toSel, toDate);
    await page.dispatchEvent(toSel, "change");
  } else {
    await page.fill(toSel, "");
    await page.dispatchEvent(toSel, "change");
  }
}

async function pickExamLeaf(page, index) {
  await page.locator("#exam-plan-col-category-list [role='option']").first().click();
  await page.waitForTimeout(80);
  const groups = page.locator("#exam-plan-col-group-list [role='option']");
  if (await groups.count()) {
    await groups.first().click();
    await page.waitForTimeout(80);
  }
  const leaves = page.locator("#exam-plan-col-leaf-list [role='option']");
  await leaves.nth(index).click();
  await page.waitForTimeout(80);
  if (await page.locator("#exam-plan-fasting-field").isVisible()) {
    await page.locator('#exam-plan-fasting-buttons [data-fasting="none"]').click();
  }
}

function listDues(page, listSel) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(`${sel} .exam-list-item`)].map((li) => {
      const due = li.querySelector(".exam-list-item__due");
      return {
        title: (li.querySelector(".exam-list-item__title")?.textContent || "").trim(),
        text: due?.textContent?.trim() || "",
        className: due?.className || "",
      };
    });
  }, listSel);
}

function findDue(rows, text) {
  return rows.find((row) => row.text === text) || null;
}

async function runLogicCase() {
  const mockDb = fs.readFileSync(
    path.join(__dirname, "mock-db-exam-categories.js"),
    "utf-8"
  );
  const harness = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8" /></head>
<body>
<script type="module">
import {
  getPlanDueCountdown,
  formatDueCountdown,
} from "/js/exam-plan-ui.js";
window.__dueHelpers = { getPlanDueCountdown, formatDueCountdown };
window.__ready = true;
</script>
</body></html>`;

  const server = startServer(harness);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: mockDb })
  );
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  if (errors.length) throw new Error("logic boot: " + errors.join("; "));

  const today = todayStr();
  const result = await page.evaluate(
    ({ today: t, from60, to90, from10, to25, baselinePast, legacyDue }) => {
      const { getPlanDueCountdown, formatDueCountdown } = window.__dueHelpers;
      const range = getPlanDueCountdown(
        {
          dueDateFrom: from60,
          dueDateTo: to90,
          dueDate: to90,
          baselineDate: t,
        },
        t
      );
      const single = getPlanDueCountdown(
        { dueDate: from60, baselineDate: t },
        t
      );
      const color = getPlanDueCountdown(
        {
          dueDateFrom: from10,
          dueDateTo: to25,
          dueDate: to25,
          baselineDate: baselinePast,
        },
        t
      );
      const legacy = getPlanDueCountdown(
        { dueDate: legacyDue, baselineDate: "2026-05-01" },
        t
      );
      return {
        rangeText: formatDueCountdown(range, { includeDate: false }),
        rangeLevel: range?.level,
        singleText: formatDueCountdown(single, { includeDate: false }),
        colorText: formatDueCountdown(color, { includeDate: false }),
        colorLevel: color?.level,
        legacyText: formatDueCountdown(legacy, { includeDate: false }),
      };
    },
    {
      today,
      from60: addDays(today, 60),
      to90: addDays(today, 90),
      from10: addDays(today, 10),
      to25: addDays(today, 25),
      baselinePast: addDays(today, -90),
      legacyDue: "2026-11-01",
    }
  );
  console.log("[logic]", result);
  if (result.rangeText !== "あと60日〜90日") {
    throw new Error("range countdown expected あと60日〜90日, got " + result.rangeText);
  }
  if (result.singleText !== "あと60日") {
    throw new Error("single countdown expected あと60日, got " + result.singleText);
  }
  if (result.singleText.includes("〜")) {
    throw new Error("single date should not use range display");
  }
  if (result.colorLevel !== "near") {
    throw new Error(
      "color should use end date (near), got " + result.colorLevel + " text=" + result.colorText
    );
  }
  if (result.colorText !== "あと10日〜25日") {
    throw new Error("color-range text expected あと10日〜25日, got " + result.colorText);
  }
  if (!result.legacyText || result.legacyText.includes("〜")) {
    throw new Error("legacy single dueDate should stay single display, got " + result.legacyText);
  }

  await browser.close();
  server.close();
  console.log("OK: countdown / color helpers");
}

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
  <div id="panel-exam" style="display:block">
  <button id="btn-exam-new" class="btn btn--small btn--primary" type="button">予定を登録</button>
  <ul class="exam-list" id="exam-plan-list"></ul>
  <p id="exam-plan-empty"></p>
  <ul class="exam-list" id="exam-history-list"></ul>
  <p id="exam-history-empty"></p>
  </div>
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
  <div id="exam-sheet-due-units"></div>
  <p id="exam-sheet-due-display">0日後</p>
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
        <div id="exam-plan-fasting-buttons">
          <button type="button" class="exam-fasting-btn" data-fasting="required">必要</button>
          <button type="button" class="exam-fasting-btn" data-fasting="none">不要</button>
        </div>
      </div>
      <div class="exam-plan-dual" id="exam-plan-dual">
        <section class="exam-plan-section exam-plan-section--plan exam-due-field" id="exam-plan-section-plan">
          <div class="exam-due-compact">
            <div class="exam-due-compact__date-row exam-due-compact__date-row--range">
              <div class="exam-due-compact__date-pair">
                <label class="label label--sub" for="exam-plan-due-date">目安の始め</label>
                <input id="exam-plan-due-date" class="input input--date" type="date" />
              </div>
              <span class="exam-due-compact__date-tilde">〜</span>
              <div class="exam-due-compact__date-pair">
                <label class="label label--sub" for="exam-plan-due-date-to">目安の終わり</label>
                <input id="exam-plan-due-date-to" class="input input--date" type="date" />
              </div>
            </div>
            <p class="field__note" id="exam-plan-window-note"></p>
            <input id="exam-plan-note" type="text" />
          </div>
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
enterExamPlan("karte-due-range");
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

  const today = todayStr();

  await page.click("#btn-exam-new");
  await page.waitForSelector("#exam-plan-modal:not([hidden])");
  await pickExamLeaf(page, 0);
  await fillDueRange(
    page,
    "#exam-plan-due-date",
    "#exam-plan-due-date-to",
    addDays(today, 60),
    addDays(today, 90)
  );
  await page.waitForTimeout(80);
  const fromVal = await page.inputValue("#exam-plan-due-date");
  const toVal = await page.inputValue("#exam-plan-due-date-to");
  console.log("[exam] range inputs", { fromVal, toVal });
  if (fromVal !== addDays(today, 60) || toVal !== addDays(today, 90)) {
    throw new Error(
      `exam range dates expected ${addDays(today, 60)}〜${addDays(today, 90)}, got ${fromVal}〜${toVal}`
    );
  }
  const labels = await page.evaluate(() => ({
    from: document.querySelector('label[for="exam-plan-due-date"]')?.textContent?.trim(),
    to: document.querySelector('label[for="exam-plan-due-date-to"]')?.textContent?.trim(),
    hasNumpad: Boolean(document.getElementById("exam-plan-due-numpad")),
  }));
  if (labels.from !== "目安の始め" || labels.to !== "目安の終わり") {
    throw new Error("exam due labels expected 目安の始め / 目安の終わり, got " + JSON.stringify(labels));
  }
  if (labels.hasNumpad) throw new Error("exam due numpad should be removed");
  await page.click("#btn-exam-plan-save");
  await page.waitForFunction(() => document.getElementById("exam-plan-modal")?.hidden === true);
  const examErr = await page.locator("#exam-plan-error").textContent();
  if (examErr) console.log("[exam] error after save", examErr);
  await page.waitForFunction(
    () => document.querySelectorAll("#exam-plan-list .exam-list-item").length > 0
  );
  let rows = await listDues(page, "#exam-plan-list");
  console.log("[exam] after range", rows);
  if (!findDue(rows, "あと60日〜90日")) {
    throw new Error("exam range list expected あと60日〜90日, got " + JSON.stringify(rows));
  }

  await page.click("#btn-exam-new");
  await page.waitForSelector("#exam-plan-modal:not([hidden])");
  await pickExamLeaf(page, 1);
  await fillDueRange(
    page,
    "#exam-plan-due-date",
    "#exam-plan-due-date-to",
    addDays(today, 60),
    ""
  );
  await page.click("#btn-exam-plan-save");
  await page.waitForFunction(() => document.getElementById("exam-plan-modal")?.hidden === true);
  rows = await listDues(page, "#exam-plan-list");
  console.log("[exam] after single", rows);
  if (!findDue(rows, "あと60日")) {
    throw new Error("exam single list expected あと60日, got " + JSON.stringify(rows));
  }

  await page.click("#btn-exam-new");
  await page.waitForSelector("#exam-plan-modal:not([hidden])");
  await pickExamLeaf(page, 2);
  await page.check("#exam-plan-done-check");
  await page.waitForFunction(
    () => document.getElementById("exam-plan-done-date")?.disabled === false
  );
  const pastDone = addDays(today, -90);
  await page.fill("#exam-plan-done-date", pastDone);
  await page.dispatchEvent("#exam-plan-done-date", "change");
  await page.fill("#exam-plan-due-date", addDays(today, 10));
  await page.dispatchEvent("#exam-plan-due-date", "change");
  await page.fill("#exam-plan-due-date-to", addDays(today, 25));
  await page.dispatchEvent("#exam-plan-due-date-to", "change");
  await page.click("#btn-exam-plan-save");
  await page.waitForFunction(() => document.getElementById("exam-plan-modal")?.hidden === true);
  rows = await listDues(page, "#exam-plan-list");
  console.log("[exam] after color", rows);
  const colorRow = findDue(rows, "あと10日〜25日");
  if (!colorRow) {
    throw new Error("exam color list expected あと10日〜25日, got " + JSON.stringify(rows));
  }
  if (!colorRow.className.includes("exam-due-text--near")) {
    throw new Error(
      "exam color should be near (end=25d), got " + colorRow.className + " / " + colorRow.text
    );
  }
  if (colorRow.className.includes("exam-due-text--close")) {
    throw new Error("exam color used start date (close) instead of end");
  }

  if (errors.length) throw new Error("exam page errors: " + errors.join("; "));
  await browser.close();
  server.close();
  console.log("OK: exam due range UI");
}

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
            <div class="exam-due-compact__date-row exam-due-compact__date-row--range">
              <div class="exam-due-compact__date-pair" data-due-side="from">
                <label class="label label--sub" for="procedure-plan-due-date">目安の始め</label>
                <input id="procedure-plan-due-date" class="input input--date exam-due-compact__date" type="date" />
              </div>
              <span class="exam-due-compact__date-tilde">〜</span>
              <div class="exam-due-compact__date-pair" data-due-side="to">
                <label class="label label--sub" for="procedure-plan-due-date-to">目安の終わり</label>
                <input id="procedure-plan-due-date-to" class="input input--date exam-due-compact__date" type="date" />
              </div>
            </div>
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
  <button id="btn-close-procedure-modal" type="button"></button>
  <input id="procedure-date" class="input input--date" type="date" />
  <textarea id="procedure-content" class="textarea"></textarea>
  <input id="procedure-note" class="input" type="text" />
  <p id="procedure-error" hidden></p>
  <button id="btn-procedure-save" type="button">追加する</button>
  <button id="btn-procedure-cancel" type="button">キャンセル</button>
</div>
<script type="module">
import { initProceduresUI, enterProcedures } from "/js/procedures-ui.js";
initProceduresUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterProcedures("karte-proc-due-range");
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

  const today = todayStr();

  await page.click("#btn-procedure-plan-add");
  await page.waitForSelector("#procedure-plan-modal:not([hidden])");
  await page.fill("#procedure-plan-content", "幅指定点滴");
  await fillDueRange(
    page,
    "#procedure-plan-due-date",
    "#procedure-plan-due-date-to",
    addDays(today, 60),
    addDays(today, 90)
  );
  await page.click("#btn-procedure-plan-save");
  await page.waitForFunction(
    () => document.getElementById("procedure-plan-modal")?.hidden === true
  );
  let rows = await listDues(page, "#procedure-plan-list");
  console.log("[proc] after range", rows);
  if (!findDue(rows, "あと60日〜90日")) {
    throw new Error("proc range list expected あと60日〜90日, got " + JSON.stringify(rows));
  }

  await page.click("#btn-procedure-plan-add");
  await page.waitForSelector("#procedure-plan-modal:not([hidden])");
  await page.fill("#procedure-plan-content", "単一日付処置");
  await fillDueRange(
    page,
    "#procedure-plan-due-date",
    "#procedure-plan-due-date-to",
    addDays(today, 60),
    ""
  );
  await page.click("#btn-procedure-plan-save");
  await page.waitForFunction(
    () => document.getElementById("procedure-plan-modal")?.hidden === true
  );
  rows = await listDues(page, "#procedure-plan-list");
  console.log("[proc] after single", rows);
  if (!findDue(rows, "あと60日")) {
    throw new Error("proc single list expected あと60日, got " + JSON.stringify(rows));
  }

  await page.click("#btn-procedure-plan-add");
  await page.waitForSelector("#procedure-plan-modal:not([hidden])");
  await page.fill("#procedure-plan-content", "色分け処置");
  await page.check("#procedure-plan-done-check");
  await page.waitForFunction(
    () => document.getElementById("procedure-plan-done-date")?.disabled === false
  );
  await page.fill("#procedure-plan-done-date", addDays(today, -90));
  await page.dispatchEvent("#procedure-plan-done-date", "change");
  await page.fill("#procedure-plan-due-date", addDays(today, 10));
  await page.dispatchEvent("#procedure-plan-due-date", "change");
  await page.fill("#procedure-plan-due-date-to", addDays(today, 25));
  await page.dispatchEvent("#procedure-plan-due-date-to", "change");
  await page.click("#btn-procedure-plan-save");
  await page.waitForFunction(
    () => document.getElementById("procedure-plan-modal")?.hidden === true
  );
  rows = await listDues(page, "#procedure-plan-list");
  console.log("[proc] after color", rows);
  const colorRow = findDue(rows, "あと10日〜25日");
  if (!colorRow) {
    throw new Error("proc color list expected あと10日〜25日, got " + JSON.stringify(rows));
  }
  if (!colorRow.className.includes("exam-due-text--near")) {
    throw new Error("proc color should be near (end=25d), got " + colorRow.className);
  }

  if (errors.length) throw new Error("proc page errors: " + errors.join("; "));
  await browser.close();
  server.close();
  console.log("OK: procedure due range UI");
}

{
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  if (!html.includes(">目安の始め<") || !html.includes(">目安の終わり<")) {
    throw new Error("index.html missing 目安の始め / 目安の終わり");
  }
  if (
    html.includes("exam-plan-due-numpad") ||
    html.includes("exam-sheet-due-numpad") ||
    html.includes("procedure-plan-due-numpad")
  ) {
    throw new Error("due numpad still in index.html");
  }
}

await runLogicCase();
await runExamCase();
await runProcedureCase();
console.log("OK: due range (exam + procedure)");
