/**
 * 検査「実施記録を追加」: 予定を経由せず、過去日付の実施履歴だけを追加できること。
 * - 項目選択後に「予定として登録」／「実施記録を追加」を切り替えられる
 * - 「実施記録を追加」では絶食・次回予定欄が出ず、実施日（過去日付）＋メモのみ
 * - 保存しても予定は作られず、モーダルは開いたままで連続入力できる
 * - 同じ項目で複数回追加すると、実施履歴に項目ごとグループ・日付降順で積み上がる
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./launch-browser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const KARTE = "karte-history-direct-add";

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
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
      <div class="view-toggle exam-plan-mode-toggle" id="exam-plan-mode-toggle" role="group" aria-label="登録方法">
        <button type="button" class="view-toggle__btn is-active" id="btn-exam-mode-plan" data-mode="plan" aria-pressed="true">予定として登録</button>
        <button type="button" class="view-toggle__btn" id="btn-exam-mode-history" data-mode="history" aria-pressed="false">実施記録を追加</button>
      </div>
      <div class="field" id="exam-plan-fasting-field" hidden>
        <div id="exam-plan-fasting-buttons">
          <button type="button" class="exam-fasting-btn" data-fasting="required">必要</button>
          <button type="button" class="exam-fasting-btn" data-fasting="none">不要</button>
        </div>
      </div>
      <div class="exam-plan-dual" id="exam-plan-dual">
        <section class="exam-plan-section" id="exam-plan-section-plan">
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
          <label id="exam-plan-done-check-row"><input type="checkbox" id="exam-plan-done-check" /> 実施履歴に登録する</label>
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
        hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      }),
    })
    .click();
}

async function planState() {
  return page.evaluate((k) => {
    const store = window.__getExamStore();
    return store.examPlan[k] || { plans: {}, history: {} };
  }, KARTE);
}
async function historyItems() {
  const st = await planState();
  return Object.values(st.history || {}).map((h) => ({
    item: h.item,
    date: h.date,
    note: h.note,
  }));
}
async function planItems() {
  const st = await planState();
  return Object.values(st.plans || {}).map((p) => p.item);
}
async function resetPlan() {
  await page.evaluate((k) => window.__resetExamPlan(k), KARTE);
}

fs.mkdirSync(path.join(root, "tools"), { recursive: true });
await resetPlan();

const ITEM = "腎臓 ＞ Cre";

// --- モーダルを開いて Cre を選ぶ -----------------------------------------
await page.evaluate(() => document.getElementById("btn-exam-new")?.click());
await page.waitForFunction(
  () => document.getElementById("exam-plan-modal")?.hidden === false
);
await page.waitForTimeout(80);
await clickLabel("#exam-plan-col-category-list", "血液");
await page.waitForTimeout(60);
await clickLabel("#exam-plan-col-group-list", "腎臓");
await page.waitForTimeout(60);
await clickLabel("#exam-plan-col-leaf-list", "Cre");
await page.waitForTimeout(60);

// 選択直後は「予定として登録」で、血液項目なので絶食欄が出る
const afterPick = await page.evaluate(() => ({
  fastingHidden: document.getElementById("exam-plan-fasting-field")?.hidden,
  planActive: document
    .getElementById("btn-exam-mode-plan")
    ?.classList.contains("is-active"),
}));
assert.equal(afterPick.fastingHidden, false, "血液項目なのに絶食欄が出ていない");
assert.equal(afterPick.planActive, true, "初期状態が「予定として登録」になっていない");

// --- 「実施記録を追加」へ切り替える ---------------------------------------
await page.click("#btn-exam-mode-history");
const modeState = await page.evaluate(() => ({
  planHidden: document.getElementById("exam-plan-section-plan")?.hidden,
  fastingHidden: document.getElementById("exam-plan-fasting-field")?.hidden,
  checkRowHidden: document.getElementById("exam-plan-done-check-row")?.hidden,
  doneTitle: document.getElementById("exam-plan-section-done-title")?.textContent,
  doneDateDisabled: document.getElementById("exam-plan-done-date")?.disabled,
  historyActive: document
    .getElementById("btn-exam-mode-history")
    ?.classList.contains("is-active"),
  saveLabel: document.getElementById("btn-exam-plan-save")?.textContent,
}));
console.log("MODE_STATE", modeState);
assert.equal(modeState.planHidden, true, "実施記録モードで次回予定欄が隠れていない");
assert.equal(modeState.fastingHidden, true, "実施記録モードで絶食欄が隠れていない");
assert.equal(modeState.checkRowHidden, true, "実施記録モードでチェック行が隠れていない");
assert.equal(modeState.doneTitle, "実施記録を追加", "見出しが切り替わっていない");
assert.equal(modeState.doneDateDisabled, false, "実施日欄が無効化されたままになっている");
assert.equal(modeState.historyActive, true, "トグルの選択状態が切り替わっていない");
assert.equal(modeState.saveLabel, "実施記録を追加", "保存ボタンの文言が切り替わっていない");

// --- 1件目: 過去日付＋メモで保存 ------------------------------------------
await page.fill("#exam-plan-done-date", "2023-11-02");
await page.fill("#exam-plan-done-note", "Cre 1.2 (旧カルテより)");
await page.click("#btn-exam-plan-save");
await page.waitForFunction(
  () => (window.__toasts || []).some((t) => String(t).includes("実施記録を追加しました")),
  null,
  { timeout: 5000 }
);
await page.waitForTimeout(80);

// 予定を経由していないこと、モーダルは開いたままであること
assert.deepEqual(await planItems(), [], "実施記録のみのはずが予定が作られている");
assert.equal(
  await page.evaluate(() => document.getElementById("exam-plan-modal")?.hidden),
  false,
  "連続入力のため、保存してもモーダルは閉じないはず"
);
// 項目選択・実施日は保持され、メモだけ空になる（次の日付を入れやすくする）
const afterFirstSave = await page.evaluate(() => ({
  doneDate: document.getElementById("exam-plan-done-date")?.value,
  doneNote: document.getElementById("exam-plan-done-note")?.value,
}));
assert.equal(afterFirstSave.doneDate, "2023-11-02", "保存後に実施日欄がリセットされている");
assert.equal(afterFirstSave.doneNote, "", "保存後にメモが空になっていない");

await page.screenshot({
  path: path.join(root, "tools/exam-history-direct-add-01-after-first-save.png"),
});

// --- 2件目: 同じ項目のまま、別の日付・別のメモで続けて保存 -----------------
await page.fill("#exam-plan-done-date", "2024-02-14");
await page.fill("#exam-plan-done-note", "Cre 1.4 (旧カルテより)");
await page.click("#btn-exam-plan-save");
await page.waitForFunction(
  () => (window.__toasts || []).filter((t) => String(t).includes("実施記録を追加しました")).length >= 2,
  null,
  { timeout: 5000 }
);
await page.waitForTimeout(80);

// --- 3件目: さらに1件、より新しい日付で追加 -------------------------------
await page.fill("#exam-plan-done-date", "2024-06-20");
await page.fill("#exam-plan-done-note", "Cre 1.1");
await page.click("#btn-exam-plan-save");
await page.waitForFunction(
  () => (window.__toasts || []).filter((t) => String(t).includes("実施記録を追加しました")).length >= 3,
  null,
  { timeout: 5000 }
);
await page.waitForTimeout(80);

const history = await historyItems();
console.log("HISTORY", history);
assert.equal(history.length, 3, "3件とも実施履歴に積み上がっていない");
assert.ok(history.every((h) => h.item === ITEM), "全件が同じ項目で記録されていない");
assert.deepEqual(await planItems(), [], "実施記録の繰り返し追加で予定が作られている");

// --- 履歴表示（右カラム）でも、項目でグループ化・日付降順になっていること --
await page.click("#btn-exam-plan-cancel");
await page.waitForFunction(
  () => document.getElementById("exam-plan-modal")?.hidden === true
);

const rendered = await page.evaluate(() => {
  const groupTitle = document.querySelector(
    "#exam-history-list .exam-history-group-title__label"
  )?.textContent;
  const groupHint = document.querySelector(
    "#exam-history-list .exam-history-group-title__hint"
  )?.textContent;
  const dates = [
    ...document.querySelectorAll("#exam-history-list .exam-list-item--history"),
  ].map((li) => {
    const year = li.querySelector(".exam-history-date__year")?.textContent || "";
    const md = li.querySelector(".exam-history-date__md")?.textContent || "";
    return `${year}${md}`;
  });
  return { groupTitle, groupHint, dates };
});
console.log("RENDERED_HISTORY", rendered);
assert.equal(rendered.groupTitle, ITEM, "実施履歴が項目名でグループ化されていない");
assert.equal(rendered.groupHint, "3件 · 新しい順", "件数表示が正しくない");
assert.deepEqual(
  rendered.dates,
  ["20246/20", "20242/14", "202311/2"],
  "実施履歴が日付の降順になっていない"
);

await page.screenshot({
  path: path.join(root, "tools/exam-history-direct-add-02-history-list.png"),
});

// --- 「予定として登録」に戻すと元の見た目に戻ること ------------------------
await page.evaluate(() => document.getElementById("btn-exam-new")?.click());
await page.waitForFunction(
  () => document.getElementById("exam-plan-modal")?.hidden === false
);
const reopened = await page.evaluate(() => ({
  planActive: document.getElementById("btn-exam-mode-plan")?.classList.contains("is-active"),
  planHidden: document.getElementById("exam-plan-section-plan")?.hidden,
  checkRowHidden: document.getElementById("exam-plan-done-check-row")?.hidden,
  doneTitle: document.getElementById("exam-plan-section-done-title")?.textContent,
  saveLabel: document.getElementById("btn-exam-plan-save")?.textContent,
}));
console.log("REOPENED", reopened);
assert.equal(reopened.planActive, true, "モーダルを開き直すと「予定として登録」に戻っていない");
assert.equal(reopened.planHidden, false, "次回予定欄が復元されていない");
assert.equal(reopened.checkRowHidden, false, "チェック行が復元されていない");
assert.equal(reopened.doneTitle, "本日実施した内容の記録（任意）", "見出しが元に戻っていない");
assert.equal(reopened.saveLabel, "保存する", "保存ボタンの文言が元に戻っていない");

await browser.close();
server.close();
console.log("OK: 検査タブの「実施記録を追加」（過去データの直接追加）");
