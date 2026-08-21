/**
 * 検査・処置の実施記録追加画面に、選択中項目の直近実施日（前回：M/D）
 * または初回が表示されることを検証する。
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
const outDir = path.join(root, "tools");

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

async function clickLinear(page, listSel, label) {
  const items = page.locator(`${listSel} .med-linear-picker__item`);
  const count = await items.count();
  for (let i = 0; i < count; i += 1) {
    const text = await items
      .nth(i)
      .locator(".med-linear-picker__item-label")
      .innerText();
    if (text.trim() === label) {
      await items.nth(i).click();
      return;
    }
  }
  throw new Error(`item not found in ${listSel}: ${label}`);
}

async function lastDoneState(page, sel) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return { exists: false };
    return {
      exists: true,
      hidden: el.hidden || el.hasAttribute("hidden"),
      text: (el.textContent || "").trim(),
    };
  }, sel);
}

function assertLastDone(got, expect, label) {
  if (!got.exists) throw new Error(`${label}: #${expect.id || "last-done"} がない`);
  if (expect.hidden) {
    if (!got.hidden && got.text) {
      throw new Error(`${label}: 非表示のはずが「${got.text}」と出ている`);
    }
    return;
  }
  if (got.hidden) throw new Error(`${label}: 表示されるはずが隠れている`);
  if (got.text !== expect.text) {
    throw new Error(`${label}: expected "${expect.text}", got "${got.text}"`);
  }
}

async function runExamCase() {
  const mockDb =
    fs.readFileSync(path.join(__dirname, "mock-db-exam-categories.js"), "utf-8") +
    `\nensurePlan("karte-last-done").history["h-cre"] = { item: "Cre", date: "2026-07-22", note: "" };\n`;
  const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="max-width:480px;margin:0 auto;background:var(--color-cream);min-height:100vh;padding:12px">
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
        <div id="exam-plan-fasting-buttons"></div>
      </div>
      <p class="field__note exam-plan-last-done" id="exam-plan-last-done" hidden></p>
      <div class="exam-plan-dual" id="exam-plan-dual">
        <section class="exam-plan-section exam-plan-section--plan exam-due-field" id="exam-plan-section-plan">
          <input id="exam-plan-due-date" class="input input--date" type="date" />
          <div class="interval-unit-buttons interval-unit-buttons--stack" id="exam-plan-due-units"></div>
          <p class="interval-value-display" id="exam-plan-due-display">0日後</p>
          <div class="numpad" id="exam-plan-due-numpad"></div>
          <p class="field__note" id="exam-plan-window-note"></p>
          <input id="exam-plan-note" type="text" />
        </section>
        <section class="exam-plan-section exam-plan-section--done exam-plan-done-field" id="exam-plan-done-field">
          <label class="exam-other-check" id="exam-plan-done-check-row">
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
enterExamPlan("karte-last-done");
window.__ready = true;
</script>
</body>
</html>`;

  const server = startServer(harness);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 520, height: 920 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: mockDb })
  );
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);

  await page.click("#btn-exam-new");
  await page.waitForSelector("#exam-plan-modal:not([hidden])");
  const beforeSelect = await lastDoneState(page, "exam-plan-last-done");
  console.log("[exam] before select", beforeSelect);
  assertLastDone(beforeSelect, { hidden: true }, "exam: 未選択");

  await clickLinear(page, "#exam-plan-col-category-list", "血液");
  await page.waitForTimeout(80);
  await clickLinear(page, "#exam-plan-col-group-list", "腎臓");
  await page.waitForTimeout(80);
  await clickLinear(page, "#exam-plan-col-leaf-list", "Cre");
  await page.waitForTimeout(80);

  const creHint = await lastDoneState(page, "exam-plan-last-done");
  console.log("[exam] Cre", creHint);
  assertLastDone(creHint, { text: "前回：7/22" }, "exam: Cre（履歴あり）");
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, "last-done-exam-cre.png") });

  // 複数選択のまま肝臓へ行くと Cre の履歴が残るので、いったん外してから初回項目を選ぶ
  await clickLinear(page, "#exam-plan-col-leaf-list", "Cre");
  await page.waitForTimeout(60);
  const afterDeselect = await lastDoneState(page, "exam-plan-last-done");
  console.log("[exam] after deselect Cre", afterDeselect);
  assertLastDone(afterDeselect, { hidden: true }, "exam: Cre 解除後");

  await clickLinear(page, "#exam-plan-col-group-list", "肝臓");
  await page.waitForTimeout(80);
  await clickLinear(page, "#exam-plan-col-leaf-list", "ALT");
  await page.waitForTimeout(80);

  const altHint = await lastDoneState(page, "exam-plan-last-done");
  console.log("[exam] ALT", altHint);
  assertLastDone(altHint, { text: "初回" }, "exam: ALT（履歴なし）");
  await page.screenshot({ path: path.join(outDir, "last-done-exam-alt.png") });

  if (errors.length) throw new Error("exam page errors: " + errors.join("; "));
  await browser.close();
  server.close();
  console.log("OK: exam last-done hint (Cre=前回：7/22, ALT=初回)");
}

async function runProcedureCase() {
  const mockDb =
    fs.readFileSync(path.join(__dirname, "mock-db-procedures.js"), "utf-8") +
    `
store.history["h-subq"] = {
  schemaVersion: 2,
  date: "2026-07-22",
  content: "皮下点滴",
  note: "",
  lastEditedAt: "",
  source: "manual",
};
`;
  const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<link rel="stylesheet" href="/css/style.css" />
</head><body>
<aside class="right-column" style="max-width:460px;margin:0 auto;min-height:100vh;background:var(--color-cream)">
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
      <p class="field__note exam-plan-last-done" id="procedure-plan-last-done" hidden></p>
      <div class="exam-plan-dual" id="procedure-plan-dual">
        <section class="exam-plan-section exam-plan-section--plan exam-due-field" id="procedure-plan-due-field">
          <div class="exam-due-compact">
            <input id="procedure-plan-due-date" class="input input--date exam-due-compact__date" type="date" />
            <div class="exam-due-compact__relative">
              <div class="exam-due-compact__units">
                <p class="interval-value-display interval-value-display--compact" id="procedure-plan-due-display">0日後</p>
                <div class="interval-unit-buttons interval-unit-buttons--stack" id="procedure-plan-due-units"></div>
              </div>
              <div class="numpad numpad--compact" id="procedure-plan-due-numpad"></div>
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
enterProcedures("karte-proc-last-done");
window.__ready = true;
</script>
</body></html>`;

  const server = startServer(harness);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
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
  const emptyHint = await lastDoneState(page, "procedure-plan-last-done");
  console.log("[procedure] empty", emptyHint);
  assertLastDone(emptyHint, { hidden: true }, "procedure: 未入力");

  await page.fill("#procedure-plan-content", "皮下点滴");
  const withHist = await lastDoneState(page, "procedure-plan-last-done");
  console.log("[procedure] 皮下点滴", withHist);
  assertLastDone(withHist, { text: "前回：7/22" }, "procedure: 皮下点滴（履歴あり）");
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, "last-done-proc-known.png") });

  await page.fill("#procedure-plan-content", "初回だけの処置");
  const firstHint = await lastDoneState(page, "procedure-plan-last-done");
  console.log("[procedure] 初回", firstHint);
  assertLastDone(firstHint, { text: "初回" }, "procedure: 初回だけの処置（履歴なし）");
  await page.screenshot({ path: path.join(outDir, "last-done-proc-first.png") });

  if (errors.length) throw new Error("procedure page errors: " + errors.join("; "));
  await browser.close();
  server.close();
  console.log("OK: procedure last-done hint (皮下点滴=前回：7/22, 新規=初回)");
}

await runExamCase();
await runProcedureCase();
console.log("OK: last-done hint (exam + procedure)");
