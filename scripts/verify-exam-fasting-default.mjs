/**
 * 血液検査マスタの絶食既定値が、予定登録画面の初期選択に反映されることを検証する。
 * TBA(pre・post)=必要 / TBA(post)=不要 を含む。
 */
import { chromium } from "playwright";
import { MASTER_DELETE_MOCK } from "./mock-master-delete.js";
import assert from "node:assert/strict";
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

const mockDb =
  fs.readFileSync(path.join(__dirname, "mock-db-exam-categories.js"), "utf-8") +
  MASTER_DELETE_MOCK;

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>exam fasting default harness</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="width:100%;max-width:480px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <div id="right-tabs" class="right-tabs">
    <button type="button" class="right-tab is-active" data-tab="exam">検査予定</button>
  </div>
  <p id="right-empty" class="field__note" hidden></p>
  <div class="right-panel" id="panel-exam" data-panel="exam">
    <section class="exam-section">
      <div class="exam-section__head"><h3 class="exam-section__title">検査予定一覧</h3></div>
      <div class="exam-register-actions">
        <button id="btn-exam-new" class="btn btn--small btn--primary" type="button">予定を登録</button>
      </div>
      <p class="field__note" id="exam-plan-empty">登録された検査予定はありません。</p>
      <ul class="exam-list" id="exam-plan-list"></ul>
    </section>
    <section class="exam-section">
      <h3 class="exam-section__title">実施履歴</h3>
      <p class="field__note" id="exam-history-empty">まだ実施履歴がありません。</p>
      <ul class="exam-list" id="exam-history-list"></ul>
    </section>
  </div>
</aside>

<div class="modal" id="exam-item-sheet" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="exam-item-sheet-title">検査予定</h2>
      <button class="modal__close" id="btn-close-exam-item-sheet" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <p class="exam-sheet__item" id="exam-item-sheet-item"></p>
      <p class="exam-sheet__fasting" id="exam-item-sheet-fasting" hidden></p>
      <input id="exam-sheet-due-date" class="input" type="date" />
      <div id="exam-sheet-due-units"></div>
      <p id="exam-sheet-due-display"></p>
      <div id="exam-sheet-due-numpad"></div>
      <p id="exam-sheet-window-note"></p>
      <div class="field" id="exam-sheet-fasting-field" hidden>
        <span class="label">絶食</span>
        <div class="exam-fasting-buttons" id="exam-sheet-fasting-buttons">
          <button type="button" class="exam-fasting-btn" data-fasting="required">必要</button>
          <button type="button" class="exam-fasting-btn" data-fasting="none">不要</button>
        </div>
      </div>
      <input id="exam-sheet-note" class="input" type="text" />
      <p id="exam-sheet-error" class="error-text" hidden></p>
      <button id="btn-exam-sheet-save" type="button">保存する</button>
      <button id="btn-exam-sheet-complete" type="button">完了</button>
      <button id="btn-exam-sheet-end" type="button">終了</button>
    </div>
  </div>
</div>

<div class="modal" id="exam-plan-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="exam-plan-modal-title">予定を登録</h2>
      <button class="modal__close" id="btn-close-exam-plan" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <span class="label">検査項目</span>
        <div class="med-linear-picker" id="exam-plan-linear-picker" aria-label="検査項目の階層選択">
          <div class="med-linear-picker__col" id="exam-plan-col-category">
            <div class="med-linear-picker__head">大項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-category-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col" id="exam-plan-col-group" hidden>
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-group-list" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="exam-plan-col-leaf" hidden>
            <div class="med-linear-picker__head">
              <span class="med-linear-picker__head-label" id="exam-plan-col-leaf-head-label">検査項目</span>
              <button type="button" class="exam-item-add__toggle" id="btn-exam-plan-add-toggle" hidden>＋</button>
            </div>
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list" role="listbox"></div>
            <p class="field__note med-linear-picker__empty" id="exam-plan-items-empty" hidden></p>
            <div class="exam-item-add" id="exam-plan-item-add-default" hidden>
              <label class="label label--sub" for="exam-plan-new-item" id="exam-plan-new-item-label">新しい項目を追加</label>
              <div class="exam-item-add__row">
                <input id="exam-plan-new-item" class="input" type="text" />
                <button id="btn-exam-plan-add-item" class="btn btn--small btn--outline" type="button">追加</button>
              </div>
            </div>
          </div>
        </div>
        <p class="field__note exam-plan-selection-summary" id="exam-plan-selection-summary" hidden></p>
        <p id="exam-plan-item-error" class="error-text" role="alert" hidden></p>
      </div>
      <div class="field" id="exam-plan-fasting-field" hidden>
        <span class="label">絶食</span>
        <div class="exam-fasting-buttons" id="exam-plan-fasting-buttons" role="group" aria-label="絶食の要不要">
          <button type="button" class="exam-fasting-btn" data-fasting="required">必要</button>
          <button type="button" class="exam-fasting-btn" data-fasting="none">不要</button>
        </div>
      </div>
      <div class="field">
        <label class="label" for="exam-plan-due-date">予定日</label>
        <input id="exam-plan-due-date" class="input input--date" type="date" />
        <div id="exam-plan-due-units"></div>
        <p id="exam-plan-due-display"></p>
        <div id="exam-plan-due-numpad"></div>
        <p id="exam-plan-window-note"></p>
      </div>
      <input id="exam-plan-note" class="input" type="text" />
      <p id="exam-plan-error" class="error-text" hidden></p>
      <button id="btn-exam-plan-save" class="btn btn--small btn--primary" type="button">保存する</button>
      <button id="btn-exam-plan-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<div class="modal" id="exam-complete-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button id="btn-close-exam-complete" type="button"></button>
    <input id="exam-complete-date" type="date" />
    <input id="exam-complete-note" type="text" />
    <p id="exam-complete-error" hidden></p>
    <button id="btn-exam-complete-save" type="button"></button>
    <button id="btn-exam-complete-cancel" type="button"></button>
  </div>
</div>
<div class="modal" id="exam-after-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button id="btn-close-exam-after" type="button"></button>
    <p id="exam-after-summary" hidden></p>
    <button id="btn-exam-after-next" type="button"></button>
    <button id="btn-exam-after-end" type="button"></button>
  </div>
</div>

<script type="module">
import { initExamPlanUI, enterExamPlan } from "/js/exam-plan-ui.js";
initExamPlanUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => {
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? busyLabel : idleLabel;
  },
});
window.__enter = (karte) => enterExamPlan(karte);
window.__examReady = true;
</script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/exam-fasting-default-harness.html") {
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
const base = `http://127.0.0.1:${port}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({
    contentType: "application/javascript",
    body: mockDb,
  })
);

await page.goto(`${base}/tools/exam-fasting-default-harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__examReady === true);
await page.evaluate(() => window.__enter("karte-fasting"));
await page.click("#btn-exam-new");
await page.waitForSelector("#exam-plan-modal:not([hidden])");

async function clickLinear(listSel, label) {
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

async function selectedFasting() {
  const field = page.locator("#exam-plan-fasting-field");
  const hidden = await field.isHidden();
  if (hidden) return { hidden: true, value: "" };
  const required = await page
    .locator('#exam-plan-fasting-buttons [data-fasting="required"]')
    .evaluate((el) => el.classList.contains("is-selected"));
  const none = await page
    .locator('#exam-plan-fasting-buttons [data-fasting="none"]')
    .evaluate((el) => el.classList.contains("is-selected"));
  if (required && !none) return { hidden: false, value: "required" };
  if (none && !required) return { hidden: false, value: "none" };
  return { hidden: false, value: "" };
}

async function openFreshPlanModal() {
  const modal = page.locator("#exam-plan-modal");
  const open = await modal.evaluate((el) => !el.hasAttribute("hidden"));
  if (open) {
    await page.click("#btn-close-exam-plan");
    await page.waitForFunction(
      () => document.getElementById("exam-plan-modal")?.hasAttribute("hidden"),
      null,
      { timeout: 3000 }
    );
  }
  await page.click("#btn-exam-new");
  await page.waitForFunction(
    () => !document.getElementById("exam-plan-modal")?.hasAttribute("hidden"),
    null,
    { timeout: 3000 }
  );
}

async function expectLeafFasting(midLabel, leafLabel, expected) {
  await openFreshPlanModal();
  await clickLinear("#exam-plan-col-category-list", "血液");
  await page.waitForTimeout(80);
  if (midLabel) {
    await clickLinear("#exam-plan-col-group-list", midLabel);
    await page.waitForTimeout(80);
  }
  await clickLinear("#exam-plan-col-leaf-list", leafLabel);
  await page.waitForTimeout(100);
  const got = await selectedFasting();
  assert.equal(
    got.hidden,
    false,
    `${leafLabel}: fasting field should be visible`
  );
  assert.equal(
    got.value,
    expected,
    `${leafLabel}: expected fasting=${expected}, got=${got.value || "(unset)"}`
  );
  console.log(`OK ${midLabel ? midLabel + " > " : ""}${leafLabel} → ${expected}`);
}

// トップレベル葉
await expectLeafFasting(null, "CBC", "none");
await expectLeafFasting(null, "血糖(アントセンス)", "required");
await expectLeafFasting(null, "CRP", "none");
await expectLeafFasting(null, "健診セット(FUJIFILM)", "required");

// 肝臓: TBA プロトコル差
await expectLeafFasting("肝臓", "TBA(pre・post)", "required");
await expectLeafFasting("肝臓", "TBA(post)", "none");
await expectLeafFasting("肝臓", "ALT", "required");

// 腎臓 / 脂質 / ホルモン
await expectLeafFasting("腎臓", "BUN", "required");
await expectLeafFasting("脂質", "TG", "required");
await expectLeafFasting("ホルモン", "T4", "none");

await page.screenshot({
  path: path.join(root, "tools/exam-fasting-default-verify.png"),
  fullPage: true,
});

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}

console.log("OK: blood fasting defaults applied on plan create selection");
await browser.close();
server.close();
