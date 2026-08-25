/**
 * 予定タップ1枚目の実施履歴を、検査・処置の両方で編集・削除できること。
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./launch-browser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/proc-harness") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(procHarness);
      return;
    }
    let rel = urlPath === "/" ? "/tools/exam-end-revive-harness.html" : urlPath;
    const filePath = path.join(root, rel.replace(/^\//, ""));
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("not found: " + rel);
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const procHarness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head>
<body style="margin:0;background:var(--color-cream)">
<aside style="width:100%;max-width:420px;margin:0 auto;min-height:100vh;background:var(--color-cream)">
  <div class="right-panel" id="panel-proc" data-panel="proc">
    <section class="exam-section">
      <h3 class="exam-section__title">処置予定一覧</h3>
      <p class="field__note" id="procedure-plan-empty"></p>
      <ul class="exam-list" id="procedure-plan-list"></ul>
    </section>
    <section class="exam-section">
      <h3 class="exam-section__title">実施履歴</h3>
      <p class="field__note" id="procedures-empty"></p>
      <ul class="proc-list" id="procedures-list"></ul>
    </section>
  </div>
</aside>
<div class="modal" id="procedure-item-sheet" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="procedure-item-sheet-title">処置予定</h2>
      <button class="modal__close" id="btn-close-procedure-item-sheet" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <p class="exam-sheet__item" id="procedure-item-sheet-item"></p>
      <div id="procedure-sheet-phase-choose">
        <div class="field">
          <span class="label">メモ</span>
          <p class="exam-sheet__note" id="procedure-sheet-memo"></p>
        </div>
        <div class="field">
          <label class="label" for="procedure-sheet-done-date">実施日</label>
          <input id="procedure-sheet-done-date" class="input input--date" type="date" />
        </div>
        <div class="field">
          <span class="label">実施履歴</span>
          <ul class="exam-sheet__history-list" id="procedure-sheet-history-list" hidden></ul>
          <p class="field__note" id="procedure-sheet-history-empty">まだ実施履歴はありません。</p>
        </div>
      </div>
      <div class="field exam-due-field" id="procedure-sheet-due-field" hidden>
        <input id="procedure-sheet-due-date" type="date" />
        <input id="procedure-sheet-due-date-to" type="date" />
        <p id="procedure-sheet-window-note"></p>
      </div>
    </div>
    <div class="modal__footer">
      <p id="procedure-sheet-error" class="error-text" hidden></p>
      <div class="exam-sheet__actions" id="procedure-sheet-choose-actions">
        <button id="btn-procedure-sheet-complete" type="button">完了として保存</button>
        <button id="btn-procedure-sheet-end" type="button">終了として保存</button>
      </div>
      <div class="exam-sheet__actions" id="procedure-sheet-save-actions" hidden>
        <button id="btn-procedure-sheet-save" type="button">次回予定を保存</button>
      </div>
    </div>
  </div>
</div>
<div class="modal modal--stack" id="procedure-history-edit-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--sm">
    <div class="modal__header">
      <h2 class="modal__title" id="procedure-history-edit-title">実施履歴を編集</h2>
      <button class="modal__close" id="btn-close-procedure-history-edit" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <input id="procedure-history-edit-date" class="input input--date" type="date" />
      <input id="procedure-history-edit-note" class="input" type="text" />
    </div>
    <div class="modal__footer">
      <p id="procedure-history-edit-error" hidden></p>
      <button id="btn-procedure-history-edit-save" class="btn btn--small btn--primary" type="button">保存する</button>
      <button id="btn-procedure-history-edit-delete" class="btn btn--small btn--danger-outline" type="button">削除する</button>
      <button id="btn-procedure-history-edit-cancel" type="button">キャンセル</button>
    </div>
  </div>
</div>
<script type="module">
import * as db from "/js/db.js";
import { initProceduresUI, enterProcedures } from "/js/procedures-ui.js";
initProceduresUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterProcedures("karte-proc-hist-edit");
window.__seedProc = async () => {
  await db.saveProcedurePlan("karte-proc-hist-edit", {
    content: "皮下点滴",
    dueDate: "2026-09-01",
    note: "予定メモ",
  });
  await db.addProcedure("karte-proc-hist-edit", {
    date: "2026-07-01",
    content: "皮下点滴",
    note: "1回目",
  });
  await db.addProcedure("karte-proc-hist-edit", {
    date: "2026-08-10",
    content: "皮下点滴",
    note: "2回目",
  });
};
window.__ready = true;
</script>
</body></html>`;

const examMock = fs.readFileSync(path.join(__dirname, "mock-db-exam-end.js"), "utf-8");
const procMock = fs.readFileSync(path.join(__dirname, "mock-db-procedures.js"), "utf-8");

const server = await startServer();
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
const browser = await launchBrowser();
const errors = [];

async function rowTexts(page, selector) {
  return page.locator(selector).evaluateAll((els) =>
    els.map((el) => el.textContent.replace(/\s+/g, " ").trim())
  );
}

async function verifyExam() {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", (e) => errors.push("exam:" + String(e)));
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: examMock })
  );
  await page.goto(`${base}/tools/exam-end-revive-harness.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__examReady === true, null, { timeout: 10000 });
  await page.evaluate(async () => {
    await window.__seedExam();
    const db = await import("/js/db.js");
    await db.addExamHistory("77771", { item: "血液検査", date: "2026-07-20", note: "前回" });
  });
  await page.waitForTimeout(200);

  const planTitles = await page.locator("#exam-plan-list .exam-list-item__title").allTextContents();
  if (!planTitles.includes("血液検査")) throw new Error("exam plan missing before edit");

  await page.locator("#exam-plan-list .exam-list-item").first().click();
  await page.waitForSelector("#exam-item-sheet:not([hidden])");
  const before = await rowTexts(page, "#exam-sheet-history-list .exam-sheet__history-item");
  if (before.length < 2) throw new Error("exam history rows missing: " + JSON.stringify(before));
  if (!before[0].includes("2026/7/20") && !before.some((t) => t.includes("2026/7/20"))) {
    throw new Error("exam newest history not listed: " + JSON.stringify(before));
  }

  await page.locator("#exam-sheet-history-list .exam-sheet__history-item").first().click();
  await page.waitForSelector("#exam-history-edit-modal:not([hidden])");
  await page.fill("#exam-history-edit-date", "2026-07-22");
  await page.fill("#exam-history-edit-note", "日付を訂正");
  await page.click("#btn-exam-history-edit-save");
  await page.waitForSelector("#exam-history-edit-modal[hidden]", { state: "attached" });
  await page.waitForTimeout(200);

  const afterSave = await rowTexts(page, "#exam-sheet-history-list .exam-sheet__history-item");
  if (!afterSave.some((t) => t.includes("2026/7/22") && t.includes("日付を訂正"))) {
    throw new Error("exam edit not reflected: " + JSON.stringify(afterSave));
  }
  if (afterSave.some((t) => t.includes("2026/7/20") && t.includes("前回"))) {
    throw new Error("exam old row still present after edit: " + JSON.stringify(afterSave));
  }

  const edited = page.locator("#exam-sheet-history-list .exam-sheet__history-item").filter({
    hasText: "日付を訂正",
  });
  page.once("dialog", (d) => d.accept());
  await edited.first().click();
  await page.waitForSelector("#exam-history-edit-modal:not([hidden])");
  await page.click("#btn-exam-history-edit-delete");
  await page.waitForTimeout(250);

  const afterDel = await rowTexts(page, "#exam-sheet-history-list .exam-sheet__history-item");
  if (afterDel.some((t) => t.includes("日付を訂正"))) {
    throw new Error("exam deleted row still listed: " + JSON.stringify(afterDel));
  }
  if (afterDel.length !== before.length - 1) {
    throw new Error("exam history count after delete: " + JSON.stringify(afterDel));
  }

  const plansAfter = await page.locator("#exam-plan-list .exam-list-item__title").allTextContents();
  if (!plansAfter.includes("血液検査")) throw new Error("exam plan list changed after history edit");

  await page.screenshot({ path: path.join(root, "tools/exam-history-edit-verify.png") });
  await page.close();
  console.log("OK exam history edit/delete", afterSave, "→", afterDel);
}

async function verifyProc() {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", (e) => errors.push("proc:" + String(e)));
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: procMock })
  );
  await page.goto(`${base}/proc-harness`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 10000 });
  await page.evaluate(async () => {
    await window.__seedProc();
  });
  await page.waitForTimeout(200);

  const planTitles = await page.locator("#procedure-plan-list .exam-list-item__title").allTextContents();
  if (!planTitles.some((t) => t.includes("皮下点滴"))) throw new Error("proc plan missing: " + JSON.stringify(planTitles));

  await page.locator("#procedure-plan-list .exam-list-item").first().click();
  await page.waitForSelector("#procedure-item-sheet:not([hidden])");
  const before = await rowTexts(page, "#procedure-sheet-history-list .exam-sheet__history-item");
  if (before.length < 2) throw new Error("proc history rows missing: " + JSON.stringify(before));

  await page.locator("#procedure-sheet-history-list .exam-sheet__history-item").first().click();
  await page.waitForSelector("#procedure-history-edit-modal:not([hidden])");
  await page.fill("#procedure-history-edit-date", "2026-08-12");
  await page.fill("#procedure-history-edit-note", "メモ訂正");
  await page.click("#btn-procedure-history-edit-save");
  await page.waitForTimeout(250);

  const afterSave = await rowTexts(page, "#procedure-sheet-history-list .exam-sheet__history-item");
  if (!afterSave.some((t) => t.includes("2026/8/12") && t.includes("メモ訂正"))) {
    throw new Error("proc edit not reflected: " + JSON.stringify(afterSave));
  }

  const edited = page.locator("#procedure-sheet-history-list .exam-sheet__history-item").filter({
    hasText: "メモ訂正",
  });
  page.once("dialog", (d) => d.accept());
  await edited.first().click();
  await page.waitForSelector("#procedure-history-edit-modal:not([hidden])");
  await page.click("#btn-procedure-history-edit-delete");
  await page.waitForTimeout(250);

  const afterDel = await rowTexts(page, "#procedure-sheet-history-list .exam-sheet__history-item");
  if (afterDel.some((t) => t.includes("メモ訂正"))) {
    throw new Error("proc deleted row still listed: " + JSON.stringify(afterDel));
  }
  if (afterDel.length !== before.length - 1) {
    throw new Error("proc history count after delete: " + JSON.stringify(afterDel));
  }

  const plansAfter = await page.locator("#procedure-plan-list .exam-list-item__title").allTextContents();
  if (!plansAfter.some((t) => t.includes("皮下点滴"))) {
    throw new Error("proc plan list changed after history edit");
  }

  await page.screenshot({ path: path.join(root, "tools/proc-history-edit-verify.png") });
  await page.close();
  console.log("OK proc history edit/delete", afterSave, "→", afterDel);
}

try {
  await verifyExam();
  await verifyProc();
  if (errors.length) {
    console.log("ERRORS", errors);
    throw new Error("page errors");
  }
  console.log("OK: exam/proc sheet history edit + delete");
} finally {
  await browser.close();
  server.close();
}
