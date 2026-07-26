/**
 * リニア選択の長い列が、下の入力欄（予定日・テンキー等）に重ならないことを検証する。
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
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>exam linear overflow</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="max-width:460px;margin:0 auto;padding:12px;background:var(--color-cream);min-height:100vh">
  <button id="btn-exam-new" class="btn btn--small btn--primary" type="button">予定を登録</button>
  <ul id="exam-plan-list" class="exam-list"></ul>
  <p id="exam-plan-empty"></p>
  <ul id="exam-history-list" class="exam-list"></ul>
  <p id="exam-history-empty"></p>
</aside>
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
          <div class="med-linear-picker__col" id="exam-plan-col-group">
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-group-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="exam-plan-col-leaf">
            <div class="med-linear-picker__head">検査項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list" role="listbox"></div>
            <p id="exam-plan-items-empty" hidden></p>
            <div class="exam-item-add" id="exam-plan-item-add-default">
              <label id="exam-plan-new-item-label" for="exam-plan-new-item">新しい項目を追加</label>
              <div class="exam-item-add__row">
                <input id="exam-plan-new-item" class="input" type="text" />
                <button id="btn-exam-plan-add-item" type="button">追加</button>
              </div>
            </div>
          </div>
        </div>
        <p id="exam-plan-selection-summary" class="field__note exam-plan-selection-summary" hidden></p>
        <p id="exam-plan-item-error" hidden></p>
      </div>
      <div class="field" id="exam-plan-fasting-field" hidden>
        <div id="exam-plan-fasting-buttons" class="exam-fasting-buttons">
          <button type="button" class="exam-fasting-btn" data-fasting="required">必要</button>
          <button type="button" class="exam-fasting-btn" data-fasting="none">不要</button>
        </div>
      </div>
      <div class="field exam-due-field" id="exam-due-probe">
        <span class="label">予定日</span>
        <input id="exam-plan-due-date" class="input input--date" type="date" />
        <span class="label label--sub">今日からの相対指定</span>
        <div class="interval-unit-buttons" id="exam-plan-due-units"></div>
        <p class="interval-value-display" id="exam-plan-due-display">0日後</p>
        <div class="numpad" id="exam-plan-due-numpad"></div>
        <p id="exam-plan-window-note" class="field__note"></p>
      </div>
      <div class="field exam-plan-done-field" id="exam-plan-done-field">
        <span class="label">当日のやった内容（任意）</span>
        <label class="exam-other-check"><input type="checkbox" id="exam-plan-done-check" /><span>実施履歴に登録</span></label>
        <div id="exam-plan-done-block" hidden>
          <input id="exam-plan-done-date" type="date" />
          <input id="exam-plan-done-note" type="text" />
        </div>
      </div>
      <input id="exam-plan-note" class="input" type="text" />
      <p id="exam-plan-error" hidden></p>
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
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterExamPlan("karte-overflow");
window.__ready = true;
</script>
</body>
</html>`;

const medHarness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>med linear overflow</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="max-width:460px;margin:0 auto;padding:12px;background:var(--color-cream);min-height:100vh">
  <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
  <ul id="meds-list" class="meds-list"></ul>
  <p id="meds-empty"></p>
</aside>
<div class="modal" id="med-detail-sheet" hidden>
  <button id="btn-close-med-detail" type="button"></button>
  <p id="med-detail-title"></p>
  <div id="med-detail-body"></div>
</div>
<div class="modal" id="med-add-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--med-add">
    <div class="modal__header">
      <h2 class="modal__title" id="med-add-modal-title">薬剤を追加</h2>
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
          <div class="med-linear-picker__col" id="med-add-col-group">
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="med-add-col-group-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="med-add-col-leaf">
            <div class="med-linear-picker__head">薬剤名</div>
            <div class="med-linear-picker__list" id="med-add-col-leaf-list" role="listbox"></div>
            <p id="med-add-items-empty" hidden></p>
            <div class="exam-item-add" id="med-add-item-add">
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
      <div class="field" id="med-below-probe">
        <span class="label">重要度</span>
        <div class="med-category-buttons" id="med-add-category-buttons"></div>
      </div>
      <div class="field">
        <span class="label">初期の投与頻度（任意）</span>
        <div class="med-linear-picker med-linear-picker--freq" id="med-add-freq-picker">
          <div class="med-linear-picker__col">
            <div class="med-linear-picker__head">指定方法</div>
            <div class="med-linear-picker__list" id="med-add-freq-modes" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf">
            <div class="med-linear-picker__head" id="med-add-freq-detail-head">内容</div>
            <div class="freq-linear-detail">
              <div class="med-linear-picker__list" id="med-add-freq-presets"></div>
              <div class="med-linear-picker__list" id="med-add-freq-every-n-presets"></div>
              <div id="med-add-freq-panel-every-n" hidden>
                <button type="button" id="med-add-freq-period"></button>
                <button type="button" id="med-add-freq-times"></button>
                <div id="med-add-freq-every-n-numpad" class="numpad"></div>
              </div>
              <div class="med-linear-picker__list" id="med-add-freq-weekly-presets"></div>
              <div class="med-linear-picker__list" id="med-add-freq-weekdays"></div>
              <div id="med-add-freq-panel-weekly" hidden>
                <p id="med-add-freq-weekly-display"></p>
                <div id="med-add-freq-weekly-numpad" class="numpad"></div>
              </div>
              <div id="med-add-freq-panel-custom" hidden>
                <input id="med-add-freq-custom" type="text" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <p id="med-add-error" hidden></p>
      <button id="btn-med-add-save" type="button">追加する</button>
      <button id="btn-med-add-cancel" type="button">キャンセル</button>
    </div>
  </div>
</div>
<div class="modal" id="med-event-modal" hidden>
  <button id="btn-close-med-event" type="button"></button>
  <div id="med-event-type-buttons"></div>
  <div id="med-event-freq-picker" class="med-linear-picker med-linear-picker--freq"></div>
  <div id="med-event-amount-presets"></div>
  <input id="med-event-note" type="text" />
  <p id="med-event-error" hidden></p>
  <button id="btn-med-event-save" type="button"></button>
  <button id="btn-med-event-cancel" type="button"></button>
</div>
<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
initMedsUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterMeds("karte-med-overflow");
window.__ready = true;
</script>
</body>
</html>`;

function makeServer(harnessHtml) {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/" || urlPath === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(harnessHtml);
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
}

async function fillLongList(page, listSel, count = 40) {
  await page.evaluate(
    ({ listSel, count }) => {
      const list = document.querySelector(listSel);
      if (!list) throw new Error("list missing: " + listSel);
      list.innerHTML = "";
      for (let i = 1; i <= count; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "med-linear-picker__item";
        btn.setAttribute("role", "option");
        btn.innerHTML = `<span class="med-linear-picker__item-label">長い項目${i}</span><span class="med-linear-picker__check">✓</span>`;
        list.appendChild(btn);
      }
    },
    { listSel, count }
  );
}

async function assertNoOverlap(page, pickerSel, belowSel, listSel, label) {
  const geo = await page.evaluate(
    ({ pickerSel, belowSel, listSel }) => {
      const picker = document.querySelector(pickerSel);
      const below = document.querySelector(belowSel);
      const list = document.querySelector(listSel);
      if (!picker || !below || !list) {
        return { ok: false, reason: "missing nodes" };
      }
      const pr = picker.getBoundingClientRect();
      const br = below.getBoundingClientRect();
      const styles = getComputedStyle(picker);
      const listStyles = getComputedStyle(list);
      return {
        ok: true,
        pickerBottom: pr.bottom,
        belowTop: br.top,
        gap: br.top - pr.bottom,
        pickerHeight: pr.height,
        maxHeight: styles.maxHeight,
        overflow: styles.overflow,
        listOverflowY: listStyles.overflowY,
        listScrollHeight: list.scrollHeight,
        listClientHeight: list.clientHeight,
        listScrollable: list.scrollHeight > list.clientHeight + 2,
        itemCount: list.querySelectorAll(".med-linear-picker__item").length,
      };
    },
    { pickerSel, belowSel, listSel }
  );
  console.log(label, geo);
  if (!geo.ok) throw new Error(`${label}: ${geo.reason}`);
  if (geo.gap < -1) {
    throw new Error(
      `${label}: picker overlaps below (gap=${geo.gap.toFixed(1)})`
    );
  }
  if (!geo.listScrollable) {
    throw new Error(`${label}: leaf list should scroll when long`);
  }
  if (!String(geo.overflow).includes("hidden")) {
    throw new Error(`${label}: picker overflow should be hidden`);
  }
  return geo;
}

const browser = await launchBrowser();
const errors = [];

// ---- exam ----
{
  const server = makeServer(examHarness);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const page = await browser.newPage({
    viewport: { width: 460, height: 900 },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (e) => errors.push("exam:" + e));
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: examMock })
  );
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.click("#btn-exam-new");
  await page.waitForSelector("#exam-plan-modal:not([hidden])");
  await page.locator("#exam-plan-col-category-list [role='option']", {
    hasText: "病理",
  }).click();
  await page.waitForTimeout(80);
  await fillLongList(page, "#exam-plan-col-leaf-list", 45);
  await page.waitForTimeout(40);
  await assertNoOverlap(
    page,
    "#exam-plan-linear-picker",
    "#exam-due-probe",
    "#exam-plan-col-leaf-list",
    "exam"
  );
  await page.locator("#exam-due-probe").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(root, "tools/linear-overflow-exam-01.png"),
    fullPage: false,
  });
  // ピッカーと予定日が同時に見える位置で撮る
  await page.evaluate(() => {
    document.querySelector("#exam-plan-linear-picker")?.scrollIntoView({
      block: "start",
    });
  });
  await page.screenshot({
    path: path.join(root, "tools/linear-overflow-exam-02-picker-and-due.png"),
  });
  await page.close();
  server.close();
}

// ---- med ----
{
  const server = makeServer(medHarness);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const page = await browser.newPage({
    viewport: { width: 460, height: 900 },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (e) => errors.push("med:" + e));
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: medMock })
  );
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.click("#btn-med-add");
  await page.waitForSelector("#med-add-modal:not([hidden])");
  await page.waitForTimeout(120);
  // 大項目があればクリック、なければリストを直接埋める
  const cat = page.locator("#med-add-col-category-list [role='option']").first();
  if (await cat.count()) {
    await cat.click();
    await page.waitForTimeout(80);
    const group = page.locator("#med-add-col-group-list [role='option']").first();
    if (await group.count()) {
      await group.click();
      await page.waitForTimeout(80);
    }
  }
  await fillLongList(page, "#med-add-col-leaf-list", 45);
  await page.waitForTimeout(40);
  await assertNoOverlap(
    page,
    "#med-add-linear-picker",
    "#med-below-probe",
    "#med-add-col-leaf-list",
    "med"
  );
  await page.evaluate(() => {
    document.querySelector("#med-add-linear-picker")?.scrollIntoView({
      block: "start",
    });
  });
  await page.screenshot({
    path: path.join(root, "tools/linear-overflow-med-01.png"),
  });
  await page.close();
  server.close();
}

await browser.close();
if (errors.length) throw new Error(errors.join("; "));
console.log("OK: linear picker overflow contained in columns");
