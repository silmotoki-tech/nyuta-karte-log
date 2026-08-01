/**
 * 薬剤・検査リニアピッカーの大分類末尾「検索」を検証する。
 */
import { chromium } from "playwright";
import { MASTER_DELETE_MOCK } from "./mock-master-delete.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const shotDir = path.join(root, "tools/master-picker-search");
fs.mkdirSync(shotDir, { recursive: true });

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const medMock = fs.readFileSync(path.join(__dirname, "mock-db-med-hierarchy.js"), "utf-8");
const examMock = fs.readFileSync(path.join(__dirname, "mock-db-exam-categories.js"), "utf-8");

const medHarness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>med picker search</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
  <p id="meds-empty"></p>
  <ul id="meds-list"></ul>
</aside>
<div class="modal" id="med-add-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--med-add">
    <div class="modal__header">
      <h2 class="modal__title">薬剤を追加</h2>
      <button class="modal__close" id="btn-close-med-add" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <span class="label">薬剤名</span>
        <div class="med-linear-picker" id="med-add-linear-picker" data-cols="3">
          <div class="med-linear-picker__col" id="med-add-col-category">
            <div class="med-linear-picker__head">大項目</div>
            <div class="med-linear-picker__list" id="med-add-col-category-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col is-placeholder" id="med-add-col-group">
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="med-add-col-group-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf is-placeholder" id="med-add-col-leaf">
            <div class="med-linear-picker__head">
              <span class="med-linear-picker__head-label" id="med-add-col-leaf-head-label">薬剤名</span>
              <button type="button" class="exam-item-add__toggle" id="btn-med-add-toggle" hidden>＋</button>
            </div>
            <div class="med-linear-picker__search" id="med-add-search" hidden>
              <input id="med-add-search-input" class="input med-linear-picker__search-input" type="search" />
            </div>
            <div class="med-linear-picker__list" id="med-add-col-leaf-list" role="listbox"></div>
            <p class="field__note med-linear-picker__empty" id="med-add-items-empty" hidden></p>
            <div class="exam-item-add" id="med-add-item-add" hidden>
              <label id="med-add-new-item-label" for="med-add-new-item">新しい薬剤</label>
              <input id="med-add-new-item" class="input" type="text" />
              <button id="btn-med-add-new-item" type="button">追加</button>
              <p id="med-add-item-error" hidden></p>
            </div>
          </div>
        </div>
      </div>
      <div id="med-add-category-buttons"></div>
      <div id="med-add-freq-modes"></div>
      <div id="med-add-freq-presets"></div>
      <div id="med-add-freq-every-n-presets"></div>
      <div id="med-add-freq-weekly-presets"></div>
      <div id="med-add-freq-weekdays"></div>
      <input id="med-add-freq-other-input" type="text" hidden />
      <div id="med-add-dose-modes"></div>
      <div id="med-add-dose-detail" hidden>
        <div id="med-add-dose-panel-integer"><div id="med-add-dose-integer"></div></div>
        <div id="med-add-dose-panel-fraction" hidden><div id="med-add-dose-fraction"></div></div>
        <div id="med-add-dose-panel-other" hidden><input id="med-add-dose-other-input" type="text" /></div>
      </div>
      <input id="med-add-date" type="date" />
      <input id="med-add-expiry" type="date" />
      <textarea id="med-add-note"></textarea>
      <p id="med-add-error" hidden></p>
      <button id="btn-med-add-save" type="button">追加する</button>
      <button id="btn-med-add-cancel" type="button">キャンセル</button>
    </div>
  </div>
</div>
<div id="med-detail-sheet" hidden>
  <button id="btn-close-med-detail-sheet" type="button"></button>
  <p id="med-detail-sheet-name"></p>
  <p id="med-detail-sheet-status"></p>
  <div id="med-detail-sheet-body"></div>
  <button id="btn-med-detail-sheet-close" type="button"></button>
</div>
<div id="med-event-modal" hidden>
  <button id="btn-close-med-event" type="button"></button>
  <div id="med-event-type-buttons"></div>
  <input id="med-event-date" type="date" />
  <input id="med-event-freq-check" type="checkbox" />
  <div id="med-event-freq-block" hidden>
    <div id="med-event-freq-modes"></div>
    <div id="med-event-freq-presets"></div>
    <div id="med-event-freq-every-n-presets"></div>
    <div id="med-event-freq-weekly-presets"></div>
    <div id="med-event-freq-weekdays"></div>
    <input id="med-event-freq-other-input" type="text" />
  </div>
  <input id="med-event-amount-check" type="checkbox" />
  <div id="med-event-amount-block" hidden>
    <div id="med-event-amount-presets"></div>
    <input id="med-event-amount-other" type="checkbox" />
    <input id="med-event-amount-other-input" type="text" />
  </div>
  <textarea id="med-event-detail"></textarea>
  <p id="med-event-error" hidden></p>
  <button id="btn-med-event-save" type="button"></button>
  <button id="btn-med-event-cancel" type="button"></button>
</div>
<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
initMedsUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy) => { if (btn) btn.disabled = busy; },
  getSelectedAuthor: () => "院長",
});
window.__enter = (k) => enterMeds(k);
window.__ready = true;
</script>
</body>
</html>`;

const examHarness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>exam picker search</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <button id="btn-exam-new" class="btn btn--small btn--primary" type="button">予定を登録</button>
  <p id="exam-plan-empty"></p>
  <ul id="exam-plan-list"></ul>
  <p id="exam-history-empty"></p>
  <ul id="exam-history-list"></ul>
</aside>
<div class="modal" id="exam-item-sheet" hidden>
  <button id="btn-close-exam-item-sheet" type="button"></button>
  <p id="exam-item-sheet-title"></p>
  <p id="exam-item-sheet-item"></p>
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
          <div class="med-linear-picker__col is-placeholder" id="exam-plan-col-group">
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-group-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf is-placeholder" id="exam-plan-col-leaf">
            <div class="med-linear-picker__head">
              <span class="med-linear-picker__head-label" id="exam-plan-col-leaf-head-label">検査項目</span>
              <button type="button" class="exam-item-add__toggle" id="btn-exam-plan-add-toggle" hidden>＋</button>
            </div>
            <div class="med-linear-picker__search" id="exam-plan-search" hidden>
              <input id="exam-plan-search-input" class="input med-linear-picker__search-input" type="search" />
            </div>
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list" role="listbox"></div>
            <p class="field__note med-linear-picker__empty" id="exam-plan-items-empty" hidden></p>
            <div class="exam-item-add" id="exam-plan-item-add-default" hidden>
              <label id="exam-plan-new-item-label" for="exam-plan-new-item">新しい項目</label>
              <input id="exam-plan-new-item" class="input" type="text" />
              <button id="btn-exam-plan-add-item" type="button">追加</button>
            </div>
          </div>
        </div>
        <p class="field__note exam-plan-selection-summary" id="exam-plan-selection-summary" hidden></p>
        <p id="exam-plan-item-error" class="error-text" hidden></p>
      </div>
      <div class="field" id="exam-plan-fasting-field" hidden>
        <div id="exam-plan-fasting-buttons">
          <button type="button" data-fasting="required">必要</button>
          <button type="button" data-fasting="none">不要</button>
        </div>
      </div>
      <input id="exam-plan-due-date" type="date" />
      <button id="btn-exam-plan-due-calendar" type="button"></button>
      <div id="exam-plan-due-units"></div>
      <p id="exam-plan-due-display"></p>
      <div id="exam-plan-due-numpad"></div>
      <p id="exam-plan-window-note"></p>
      <input id="exam-plan-note" type="text" />
      <div id="exam-plan-done-block" hidden>
        <input id="exam-plan-done-check" type="checkbox" />
        <input id="exam-plan-done-date" type="date" />
      </div>
      <p id="exam-plan-error" hidden></p>
      <button id="btn-exam-plan-save" type="button">登録する</button>
      <button id="btn-exam-plan-cancel" type="button">キャンセル</button>
    </div>
  </div>
</div>
<script type="module">
import { initExamPlanUI, enterExamPlan } from "/js/exam-plan-ui.js";
initExamPlanUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy) => { if (btn) btn.disabled = busy; },
});
window.__enter = (k) => enterExamPlan(k);
window.__ready = true;
</script>
</body>
</html>`;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/med.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(medHarness);
        return;
      }
      if (url.pathname === "/exam.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(examHarness);
        return;
      }
      if (url.pathname === "/js/db.js") {
        const body = url.searchParams.get("kind") === "exam" ? examMock : medMock;
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(body);
        return;
      }
      let filePath = path.join(root, url.pathname.replace(/^\//, ""));
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(fs.readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function clickExactLabel(page, listSel, label) {
  await page
    .locator(`${listSel} .med-linear-picker__item`)
    .filter({
      has: page.locator(".med-linear-picker__item-label", {
        hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      }),
    })
    .first()
    .click();
}

async function labels(page, listSel) {
  return page.locator(`${listSel} .med-linear-picker__item-label`).allTextContents();
}

async function launchBrowser() {
  for (const executablePath of [
    undefined,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    try {
      return await chromium.launch(
        executablePath ? { executablePath, headless: true } : { headless: true }
      );
    } catch (err) {
      console.warn("launch failed", executablePath || "playwright", err.message);
    }
  }
  throw new Error("Unable to launch browser");
}

const { server, port } = await startServer();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

try {
  // ---- 薬剤検索 ----
  await page.route("**/js/db.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: medMock + MASTER_DELETE_MOCK,
    });
  });
  await page.goto(`http://127.0.0.1:${port}/med.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => window.__enter("12345"));
  await page.click("#btn-med-add");
  await page.waitForSelector("#med-add-modal:not([hidden])");

  const medCats = await labels(page, "#med-add-col-category-list");
  assert.ok(medCats.includes("検索"), `検索 missing in med cats: ${medCats.join(",")}`);
  assert.equal(medCats[medCats.length - 1], "検索");

  await clickExactLabel(page, "#med-add-col-category-list", "検索");
  await page.waitForSelector("#med-add-search:not([hidden])");
  assert.equal(await page.locator("#med-add-col-group").getAttribute("hidden"), "");
  assert.equal(await page.locator("#med-add-col-leaf-head-label").innerText(), "検索結果");

  await page.fill("#med-add-search-input", "アモキシ");
  await page.waitForTimeout(50);
  const medHits = await labels(page, "#med-add-col-leaf-list");
  console.log("med hits:", medHits);
  assert.ok(
    medHits.some((t) => t.includes("アモキシシリン") && t.includes("内服薬") && t.includes("抗生剤")),
    `expected path label, got: ${medHits.join(" / ")}`
  );

  await page.screenshot({
    path: path.join(shotDir, "01-med-search-amox.png"),
    fullPage: true,
  });

  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item")
    .filter({ hasText: "アモキシシリン（内服薬 > 抗生剤）" })
    .first()
    .click();
  assert.ok(
    await page
      .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected")
      .filter({ hasText: "アモキシシリン" })
      .count()
  );

  await page.fill("#med-add-search-input", "ヒア");
  await page.waitForTimeout(50);
  const eyeHits = await labels(page, "#med-add-col-leaf-list");
  console.log("med eye hits:", eyeHits.slice(0, 8));
  assert.ok(
    eyeHits.some((t) => /点眼薬/.test(t) && /ヒア/.test(t)),
    `expected eye hits, got: ${eyeHits.join(" / ")}`
  );
  await page.screenshot({
    path: path.join(shotDir, "02-med-search-hya.png"),
    fullPage: true,
  });

  // ---- 検査検索 ----
  await page.unroute("**/js/db.js");
  await page.route("**/js/db.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: examMock + MASTER_DELETE_MOCK,
    });
  });
  await page.goto(`http://127.0.0.1:${port}/exam.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => window.__enter("12345"));
  await page.click("#btn-exam-new");
  await page.waitForSelector("#exam-plan-modal:not([hidden])");

  const examCats = await labels(page, "#exam-plan-col-category-list");
  assert.ok(examCats.includes("検索"), `検索 missing in exam cats: ${examCats.join(",")}`);
  assert.equal(examCats[examCats.length - 1], "検索");

  await clickExactLabel(page, "#exam-plan-col-category-list", "検索");
  await page.waitForSelector("#exam-plan-search:not([hidden])");

  await page.fill("#exam-plan-search-input", "ACTH");
  await page.waitForTimeout(50);
  const examHits = await labels(page, "#exam-plan-col-leaf-list");
  console.log("exam hits:", examHits);
  assert.ok(
    examHits.some((t) => /ACTH/.test(t) && /血液/.test(t)),
    `expected ACTH with blood path, got: ${examHits.join(" / ")}`
  );
  await page.screenshot({
    path: path.join(shotDir, "03-exam-search-acth.png"),
    fullPage: true,
  });

  await page
    .locator("#exam-plan-col-leaf-list .med-linear-picker__item")
    .filter({ hasText: /ACTH/ })
    .first()
    .click();
  assert.ok(
    await page.locator("#exam-plan-col-leaf-list .med-linear-picker__item.is-selected").count()
  );
  const summary = await page.locator("#exam-plan-selection-summary").innerText();
  console.log("exam summary:", summary);
  assert.ok(summary.trim().length > 0, "selection summary empty");

  await page.screenshot({
    path: path.join(shotDir, "04-exam-search-selected.png"),
    fullPage: true,
  });

  console.log("OK: master picker search (med + exam)");
} finally {
  await browser.close();
  server.close();
}
