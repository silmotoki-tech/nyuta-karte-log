/**
 * 「新しい項目を追加」が＋トグル化され、折りたたみ時にリスト領域が増え、
 * 追加後にフォームが閉じることを検証する（検査・薬剤）。
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

const examMock = fs.readFileSync(
  path.join(__dirname, "mock-db-exam-categories.js"),
  "utf-8"
);
const medMock = fs.readFileSync(
  path.join(__dirname, "mock-db-med-hierarchy.js"),
  "utf-8"
);

const examHarness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head><body>
<button id="btn-exam-new" type="button">予定を登録</button>
<ul id="exam-plan-list"></ul><p id="exam-plan-empty"></p>
<ul id="exam-history-list"></ul><p id="exam-history-empty"></p>
<div class="modal" id="exam-item-sheet" hidden>
  <button id="btn-close-exam-item-sheet" type="button"></button>
  <p id="exam-item-sheet-title"></p><p id="exam-item-sheet-item"></p>
  <p id="exam-item-sheet-fasting" hidden></p>
  <div id="exam-sheet-fasting-field" hidden><div id="exam-sheet-fasting-buttons">
    <button type="button" data-fasting="required">必要</button>
    <button type="button" data-fasting="none">不要</button>
  </div></div>
  <input id="exam-sheet-due-date" type="date" />
  <div id="exam-sheet-due-units"></div><p id="exam-sheet-due-display"></p>
  <div id="exam-sheet-due-numpad"></div><p id="exam-sheet-window-note"></p>
  <input id="exam-sheet-note" type="text" /><p id="exam-sheet-error" hidden></p>
  <button id="btn-exam-sheet-save" type="button"></button>
  <button id="btn-exam-sheet-complete" type="button"></button>
  <button id="btn-exam-sheet-end" type="button"></button>
</div>
<div class="modal" id="exam-plan-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--exam-plan">
    <div class="modal__header">
      <h2 class="modal__title">予定を登録</h2>
      <button class="modal__close" id="btn-close-exam-plan" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <div class="med-linear-picker" id="exam-plan-linear-picker" data-cols="3">
          <div class="med-linear-picker__col" id="exam-plan-col-category">
            <div class="med-linear-picker__head"><span class="med-linear-picker__head-label">大項目</span></div>
            <div class="med-linear-picker__list" id="exam-plan-col-category-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col" id="exam-plan-col-group">
            <div class="med-linear-picker__head"><span class="med-linear-picker__head-label">中項目</span></div>
            <div class="med-linear-picker__list" id="exam-plan-col-group-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="exam-plan-col-leaf">
            <div class="med-linear-picker__head">
              <span class="med-linear-picker__head-label">検査項目</span>
              <button type="button" class="exam-item-add__toggle" id="btn-exam-plan-add-toggle" hidden aria-expanded="false">＋</button>
            </div>
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list" role="listbox"></div>
            <p id="exam-plan-items-empty" hidden></p>
            <div class="exam-item-add" id="exam-plan-item-add-default" hidden>
              <label id="exam-plan-new-item-label" for="exam-plan-new-item">新しい項目を追加</label>
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
      <div id="exam-plan-fasting-field" hidden>
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
    </div>
    <div class="modal__footer">
      <button id="btn-exam-plan-save" type="button">保存する</button>
      <button id="btn-exam-plan-cancel" type="button">キャンセル</button>
    </div>
  </div>
</div>
<div class="modal" id="exam-complete-modal" hidden>
  <button id="btn-close-exam-complete" type="button"></button>
  <input id="exam-complete-date" type="date" /><input id="exam-complete-note" type="text" />
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
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterExamPlan("karte-add-toggle");
window.__ready = true;
</script>
</body></html>`;

const medHarness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head><body>
<button id="btn-med-add" type="button">薬剤を追加</button>
<ul id="meds-list"></ul><p id="meds-empty"></p>
<div class="modal" id="med-detail-sheet" hidden>
  <button id="btn-close-med-detail-sheet" type="button"></button>
  <p id="med-detail-sheet-name"></p><p id="med-detail-sheet-status"></p>
  <div id="med-detail-sheet-body"></div>
  <button id="btn-med-detail-sheet-close" type="button"></button>
</div>
<div class="modal" id="med-add-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--med-add">
    <div class="modal__header">
      <h2 class="modal__title">薬剤を追加</h2>
      <button class="modal__close" id="btn-close-med-add" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <div class="med-linear-picker" id="med-add-linear-picker" data-cols="3">
          <div class="med-linear-picker__col" id="med-add-col-category">
            <div class="med-linear-picker__head"><span class="med-linear-picker__head-label">大項目</span></div>
            <div class="med-linear-picker__list" id="med-add-col-category-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col" id="med-add-col-group">
            <div class="med-linear-picker__head"><span class="med-linear-picker__head-label">中項目</span></div>
            <div class="med-linear-picker__list" id="med-add-col-group-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="med-add-col-leaf">
            <div class="med-linear-picker__head">
              <span class="med-linear-picker__head-label">薬剤名</span>
              <button type="button" class="exam-item-add__toggle" id="btn-med-add-toggle" hidden aria-expanded="false">＋</button>
            </div>
            <div class="med-linear-picker__list" id="med-add-col-leaf-list" role="listbox"></div>
            <p id="med-add-items-empty" hidden></p>
            <div class="exam-item-add" id="med-add-item-add" hidden>
              <label id="med-add-new-item-label" for="med-add-new-item">新しい薬剤を追加</label>
              <div class="exam-item-add__row">
                <input id="med-add-new-item" class="input" type="text" />
                <button id="btn-med-add-new-item" type="button">追加</button>
              </div>
              <p id="med-add-item-error" hidden></p>
            </div>
          </div>
        </div>
      </div>
      <div class="med-category-buttons" id="med-add-category-buttons"></div>
      <div id="med-add-freq-modes"></div>
      <div id="med-add-freq-panel-preset"><div id="med-add-freq-presets"></div></div>
      <div id="med-add-freq-panel-every-n" hidden>
        <button type="button" id="med-add-freq-period"></button>
        <button type="button" id="med-add-freq-times"></button>
        <div id="med-add-freq-every-n-numpad"></div>
        <div id="med-add-freq-every-n-presets"></div>
      </div>
      <div id="med-add-freq-panel-weekly" hidden>
        <p id="med-add-freq-weekly-display"></p>
        <div id="med-add-freq-weekdays"></div>
        <div id="med-add-freq-weekly-numpad"></div>
        <div id="med-add-freq-weekly-presets"></div>
      </div>
      <div id="med-add-freq-panel-custom" hidden>
        <input id="med-add-freq-custom" type="text" />
      </div>
      <div id="med-add-freq-detail-head"></div>
      <input id="med-add-date" type="date" />
      <input id="med-add-note" type="text" />
      <p id="med-add-error" hidden></p>
    </div>
    <div class="modal__footer">
      <button id="btn-med-add-save" type="button">保存する</button>
      <button id="btn-med-add-cancel" type="button">キャンセル</button>
    </div>
  </div>
</div>
<div class="modal" id="med-event-modal" hidden>
  <button id="btn-close-med-event" type="button"></button>
  <div id="med-event-type-buttons"></div>
  <div id="med-event-change-options"></div>
  <input id="med-event-freq-check" type="checkbox" />
  <input id="med-event-amount-check" type="checkbox" />
  <div id="med-event-freq-block"></div>
  <div id="med-event-amount-block"></div>
  <div id="med-event-amount-presets"></div>
  <input id="med-event-amount-other" type="checkbox" />
  <input id="med-event-amount-other-input" type="text" />
  <input id="med-event-date" type="date" />
  <input id="med-event-detail" type="text" />
  <p id="med-event-error" hidden></p>
  <button id="btn-med-event-save" type="button"></button>
  <button id="btn-med-event-cancel" type="button"></button>
  <div id="med-event-freq-picker" class="med-linear-picker med-linear-picker--freq">
    <div class="med-linear-picker__col"><div class="med-linear-picker__list" id="med-event-freq-modes"></div></div>
    <div class="med-linear-picker__col">
      <div class="freq-linear-detail">
        <div id="med-event-freq-presets"></div>
        <div id="med-event-freq-every-n-presets"></div>
        <div id="med-event-freq-weekly-presets"></div>
        <div id="med-event-freq-weekdays"></div>
        <div id="med-event-freq-every-n-numpad"></div>
        <div id="med-event-freq-weekly-numpad"></div>
        <input id="med-event-freq-custom" type="text" />
        <button id="med-event-freq-period" type="button"></button>
        <button id="med-event-freq-times" type="button"></button>
        <p id="med-event-freq-weekly-display"></p>
        <div id="med-event-freq-panel-every-n" hidden></div>
        <div id="med-event-freq-panel-weekly" hidden></div>
        <div id="med-event-freq-panel-custom" hidden></div>
        <div id="med-event-freq-detail-head"></div>
      </div>
    </div>
  </div>
</div>
<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
initMedsUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterMeds("karte-med-toggle");
window.__ready = true;
</script>
</body></html>`;

function makeServer() {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/exam.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(examHarness);
      return;
    }
    if (urlPath === "/med.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(medHarness);
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
}

async function clickOption(page, listSel, text) {
  await page.locator(`${listSel} [role='option']`, { hasText: text }).first().click();
  await page.waitForTimeout(80);
}

const browser = await launchBrowser();
const server = makeServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

// ---- exam ----
{
  const page = await browser.newPage({
    viewport: { width: 460, height: 900 },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (e) => console.warn("exam pageerror", e.message));
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: examMock })
  );
  await page.goto(`${base}/exam.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.click("#btn-exam-new");
  await page.waitForSelector("#exam-plan-modal:not([hidden])");
  await clickOption(page, "#exam-plan-col-category-list", "病理");

  const collapsed = await page.evaluate(() => {
    const form = document.getElementById("exam-plan-item-add-default");
    const toggle = document.getElementById("btn-exam-plan-add-toggle");
    const list = document.getElementById("exam-plan-col-leaf-list");
    return {
      formHidden: form?.hidden === true,
      toggleVisible: toggle && !toggle.hidden,
      toggleText: toggle?.textContent?.trim(),
      listH: list?.getBoundingClientRect().height || 0,
      itemCount: list?.querySelectorAll(".med-linear-picker__item").length || 0,
    };
  });
  console.log("exam collapsed", collapsed);
  if (!collapsed.formHidden) throw new Error("exam form should be collapsed by default");
  if (!collapsed.toggleVisible) throw new Error("exam + toggle should be visible");
  if (collapsed.toggleText !== "＋") throw new Error("toggle should show ＋");

  await page.screenshot({
    path: path.join(root, "tools/inline-add-exam-01-collapsed.png"),
    fullPage: false,
  });

  await page.click("#btn-exam-plan-add-toggle");
  await page.waitForSelector("#exam-plan-item-add-default:not([hidden])");
  const opened = await page.evaluate(() => {
    const form = document.getElementById("exam-plan-item-add-default");
    const toggle = document.getElementById("btn-exam-plan-add-toggle");
    const list = document.getElementById("exam-plan-col-leaf-list");
    return {
      formHidden: form?.hidden === true,
      toggleText: toggle?.textContent?.trim(),
      listH: list?.getBoundingClientRect().height || 0,
    };
  });
  console.log("exam opened", opened);
  if (opened.formHidden) throw new Error("exam form should open after +");
  if (opened.toggleText !== "×") throw new Error("toggle should become ×");
  if (!(collapsed.listH > opened.listH)) {
    throw new Error(
      `collapsed list should be taller (collapsed=${collapsed.listH}, open=${opened.listH})`
    );
  }

  await page.screenshot({
    path: path.join(root, "tools/inline-add-exam-02-open.png"),
  });

  await page.fill("#exam-plan-new-item", "検証トグル追加病理");
  await page.click("#btn-exam-plan-add-item");
  await page.waitForTimeout(250);
  const afterAdd = await page.evaluate(() => {
    const form = document.getElementById("exam-plan-item-add-default");
    const labels = [
      ...document.querySelectorAll(
        "#exam-plan-col-leaf-list .med-linear-picker__item-label"
      ),
    ].map((el) => el.textContent.trim());
    const list = document.getElementById("exam-plan-col-leaf-list");
    return {
      formHidden: form?.hidden === true,
      hasItem: labels.includes("検証トグル追加病理"),
      listH: list?.getBoundingClientRect().height || 0,
    };
  });
  console.log("exam after add", afterAdd);
  if (!afterAdd.formHidden) throw new Error("exam form should collapse after add");
  if (!afterAdd.hasItem) throw new Error("added exam item missing");

  await page.screenshot({
    path: path.join(root, "tools/inline-add-exam-03-after-add.png"),
  });
  await page.close();
}

// ---- med ----
{
  const page = await browser.newPage({
    viewport: { width: 460, height: 900 },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (e) => console.warn("med pageerror", e.message));
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: medMock })
  );
  await page.goto(`${base}/med.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.click("#btn-med-add");
  await page.waitForSelector("#med-add-modal:not([hidden])");
  await page.waitForTimeout(120);
  await page.locator("#med-add-col-category-list [role='option']").first().click();
  await page.waitForTimeout(100);
  const groupOpt = page.locator("#med-add-col-group-list [role='option']").first();
  if ((await groupOpt.count()) > 0) {
    await groupOpt.click();
    await page.waitForTimeout(100);
  }

  const medCollapsed = await page.evaluate(() => {
    const form = document.getElementById("med-add-item-add");
    const toggle = document.getElementById("btn-med-add-toggle");
    const list = document.getElementById("med-add-col-leaf-list");
    return {
      formHidden: form?.hidden === true,
      toggleVisible: toggle && !toggle.hidden,
      toggleText: toggle?.textContent?.trim(),
      listH: list?.getBoundingClientRect().height || 0,
    };
  });
  console.log("med collapsed", medCollapsed);
  if (!medCollapsed.formHidden) throw new Error("med form should be collapsed");
  if (!medCollapsed.toggleVisible) throw new Error("med + toggle should show");

  await page.screenshot({
    path: path.join(root, "tools/inline-add-med-01-collapsed.png"),
  });

  await page.click("#btn-med-add-toggle");
  await page.waitForSelector("#med-add-item-add:not([hidden])");
  const medOpened = await page.evaluate(() => {
    const list = document.getElementById("med-add-col-leaf-list");
    const toggle = document.getElementById("btn-med-add-toggle");
    return {
      listH: list?.getBoundingClientRect().height || 0,
      toggleText: toggle?.textContent?.trim(),
    };
  });
  console.log("med opened", medOpened);
  if (medOpened.toggleText !== "×") throw new Error("med toggle should become ×");
  if (!(medCollapsed.listH > medOpened.listH)) {
    throw new Error(
      `med collapsed list should be taller (collapsed=${medCollapsed.listH}, open=${medOpened.listH})`
    );
  }

  await page.screenshot({
    path: path.join(root, "tools/inline-add-med-02-open.png"),
  });

  await page.fill("#med-add-new-item", "検証トグル追加薬");
  await page.click("#btn-med-add-new-item");
  await page.waitForTimeout(250);
  const medAfter = await page.evaluate(() => {
    const form = document.getElementById("med-add-item-add");
    const labels = [
      ...document.querySelectorAll(
        "#med-add-col-leaf-list .med-linear-picker__item-label"
      ),
    ].map((el) => el.textContent.trim());
    return {
      formHidden: form?.hidden === true,
      hasItem: labels.includes("検証トグル追加薬"),
    };
  });
  console.log("med after add", medAfter);
  if (!medAfter.formHidden) throw new Error("med form should collapse after add");
  if (!medAfter.hasItem) throw new Error("added med missing");

  await page.screenshot({
    path: path.join(root, "tools/inline-add-med-03-after-add.png"),
  });
  await page.close();
}

await browser.close();
server.close();
console.log("OK: inline add toggle");
