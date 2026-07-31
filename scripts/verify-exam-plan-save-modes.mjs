/**
 * 検査「予定を登録」: 次回予定のみ／実施のみ／両方 の3パターンで保存できること
 */
import assert from "node:assert/strict";
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
const KARTE = "karte-save-modes";

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

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-exam-categories.js"),
  "utf-8"
);

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head>
<body style="margin:0;background:var(--color-cream)">
<aside style="max-width:440px;margin:0 auto;min-height:100vh;background:var(--color-cream);padding:12px;display:block">
  <div id="panel-exam" style="display:block;min-height:200px">
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
    <div id="exam-sheet-fasting-buttons">
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
<div class="modal" id="exam-plan-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--exam-plan">
    <div class="modal__header">
      <h2 class="modal__title" id="exam-plan-modal-title">検査を登録</h2>
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
          <div class="med-linear-picker__col is-placeholder" id="exam-plan-col-group">
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-group-list"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf is-placeholder" id="exam-plan-col-leaf">
            <div class="med-linear-picker__head">
              <span class="med-linear-picker__head-label" id="exam-plan-col-leaf-head-label">検査項目</span>
              <button type="button" id="btn-exam-plan-add-toggle" hidden>＋</button>
            </div>
            <div class="med-linear-picker__search" id="exam-plan-search" hidden>
              <input id="exam-plan-search-input" class="input" type="search" />
            </div>
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list"></div>
            <p id="exam-plan-items-empty" hidden></p>
            <div id="exam-plan-item-add-default" hidden>
              <label id="exam-plan-new-item-label"></label>
              <input id="exam-plan-new-item" /><button id="btn-exam-plan-add-item" type="button">追加</button>
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
        <section class="exam-plan-section">
          <h3 id="exam-plan-section-plan-title">次回予定の登録（任意）</h3>
          <input id="exam-plan-due-date" class="input" type="date" />
          <button id="btn-exam-plan-due-calendar" type="button" hidden></button>
          <div id="exam-plan-due-units"></div>
          <p id="exam-plan-due-display"></p>
          <div id="exam-plan-due-numpad"></div>
          <p id="exam-plan-window-note"></p>
          <input id="exam-plan-note" class="input" type="text" />
        </section>
        <section class="exam-plan-section" id="exam-plan-done-field">
          <h3 id="exam-plan-section-done-title">本日実施した内容の記録（任意）</h3>
          <label><input type="checkbox" id="exam-plan-done-check" /> 実施履歴に登録する</label>
          <div id="exam-plan-done-block">
            <input id="exam-plan-done-date" class="input" type="date" disabled />
            <input id="exam-plan-done-note" class="input" type="text" disabled />
          </div>
        </section>
      </div>
      <p id="exam-plan-error" class="error-text" role="alert" hidden></p>
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
try {
  const { initExamPlanUI, enterExamPlan } = await import("/js/exam-plan-ui.js");
  const { __getStore, __resetExamPlan } = await import("/js/db.js");
  window.__toasts = [];
  window.__getExamStore = __getStore;
  window.__resetExamPlan = __resetExamPlan;
  initExamPlanUI({
    showToast: (m) => { window.__toasts.push(m); console.log("toast", m); },
    showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
    setBusy: (btn, busy, a, b) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? a : b; },
  });
  enterExamPlan("${KARTE}");
  window.__ready = true;
} catch (err) {
  window.__bootError = String(err && err.stack ? err.stack : err);
  window.__ready = true;
}
</script>
</body></html>`;

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
  viewport: { width: 480, height: 1100 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.warn("pageerror", e.message));
await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
const bootErr = await page.evaluate(() => window.__bootError || "");
if (bootErr) throw new Error(`boot failed: ${bootErr}`);

async function clickLabel(listSel, text) {
  await page
    .locator(`${listSel} .med-linear-picker__item`)
    .filter({
      has: page.locator(".med-linear-picker__item-label", {
        hasText: new RegExp(
          `^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
        ),
      }),
    })
    .click();
}

async function saveOrThrow() {
  await page.click("#btn-exam-plan-save");
  const closed = await page
    .waitForFunction(
      () => document.getElementById("exam-plan-modal")?.hidden === true,
      null,
      { timeout: 5000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!closed) {
    const err = await page.locator("#exam-plan-error").innerText().catch(() => "");
    throw new Error(`save did not close modal: ${err || "(no error text)"}`);
  }
}

async function pickXrayChest() {
  await page.evaluate(() => document.getElementById("btn-exam-new")?.click());
  await page.waitForFunction(
    () => document.getElementById("exam-plan-modal")?.hidden === false
  );
  await page.waitForTimeout(80);
  await clickLabel("#exam-plan-col-category-list", "画像");
  await page.waitForTimeout(60);
  await clickLabel("#exam-plan-col-group-list", "レントゲン");
  await page.waitForTimeout(60);
  await clickLabel("#exam-plan-col-leaf-list", "胸部");
  await page.waitForTimeout(60);
}

async function planState() {
  return page.evaluate((k) => {
    const store = window.__getExamStore();
    return store.examPlan[k] || { plans: {}, history: {} };
  }, KARTE);
}

async function planItems() {
  const st = await planState();
  return Object.values(st.plans || {}).map((p) => p.item);
}
async function historyItems() {
  const st = await planState();
  return Object.values(st.history || {}).map((h) => ({
    item: h.item,
    date: h.date,
  }));
}
async function resetPlan() {
  await page.evaluate((k) => window.__resetExamPlan(k), KARTE);
}

fs.mkdirSync(path.join(root, "tools"), { recursive: true });
await resetPlan();

// 1) 次回予定のみ
await pickXrayChest();
await page.fill("#exam-plan-due-date", "2026-08-15");
await page.fill("#exam-plan-note", "予定のみ");
await saveOrThrow();
await page.waitForTimeout(80);
const ITEM = "レントゲン ＞ 胸部";
assert.deepEqual(await planItems(), [ITEM]);
assert.equal((await historyItems()).length, 0);
assert.equal((await planState()).plans[Object.keys((await planState()).plans)[0]].dueDate, "2026-08-15");
await page.screenshot({
  path: path.join(root, "tools/exam-save-plan-only.png"),
});
console.log("1) plan-only OK");

// 2) 実施記録のみ
await resetPlan();
await page.evaluate(() => {
  window.__toasts = [];
});
await pickXrayChest();
// 予定日は空のまま
await page.check("#exam-plan-done-check");
await page.fill("#exam-plan-done-date", "2026-07-31");
await page.fill("#exam-plan-done-note", "実施のみ");
await saveOrThrow();
await page.waitForTimeout(80);
assert.equal(Object.keys((await planState()).plans).length, 0, "no plan on history-only");
assert.deepEqual(await historyItems(), [{ item: ITEM, date: "2026-07-31" }]);
const toasts2 = await page.evaluate(() => window.__toasts.slice());
assert.ok(toasts2.some((t) => String(t).includes("実施")));
await page.screenshot({
  path: path.join(root, "tools/exam-save-history-only.png"),
});
console.log("2) history-only OK");

// 3) 両方
await resetPlan();
await page.evaluate(() => {
  window.__toasts = [];
});
await pickXrayChest();
await page.fill("#exam-plan-due-date", "2026-09-01");
await page.check("#exam-plan-done-check");
await page.fill("#exam-plan-done-date", "2026-07-31");
await page.fill("#exam-plan-done-note", "両方");
await saveOrThrow();
await page.waitForTimeout(80);
const bothPlans = (await planState()).plans;
assert.equal(Object.keys(bothPlans).length, 1);
assert.equal(Object.values(bothPlans)[0].dueDate, "2026-09-01");
assert.deepEqual(await historyItems(), [{ item: ITEM, date: "2026-07-31" }]);
const toasts3 = await page.evaluate(() => window.__toasts.slice());
assert.ok(toasts3.some((t) => String(t).includes("予定") && String(t).includes("実施")));
await page.screenshot({
  path: path.join(root, "tools/exam-save-both.png"),
});
console.log("3) both OK");

await browser.close();
server.close();
console.log("OK: exam plan save modes (plan / history / both)");
