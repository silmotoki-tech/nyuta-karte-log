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
      return await chromium.launch({ executablePath, headless: true, timeout: 30_000 });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  try {
    return await chromium.launch({ channel: "chrome", headless: true, timeout: 30_000 });
  } catch (err) {
    console.warn("launch failed (channel chrome):", err.message);
  }
  throw new Error("Could not launch Chromium");
}

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-med-hierarchy.js"),
  "utf-8"
);

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>med master harness</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside class="right-column" style="width:100%;max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <div id="right-tabs" class="right-tabs">
    <button type="button" class="right-tab is-active" data-tab="meds">薬剤情報</button>
  </div>
  <p id="right-empty" hidden></p>
  <div class="right-panel" id="panel-meds" data-panel="meds">
    <div class="exam-toolbar">
      <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    </div>
    <section class="exam-section">
      <h3 class="exam-section__title">薬剤一覧</h3>
      <p class="field__note" id="meds-empty">登録された薬剤はありません。</p>
      <ul class="meds-list" id="meds-list"></ul>
    </section>
  </div>
</aside>

<div class="modal" id="med-add-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="med-add-modal-title">薬剤を追加</h2>
      <button class="modal__close" id="btn-close-med-add" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <span class="label">薬剤名</span>
        <div class="med-linear-picker" id="med-add-linear-picker">
          <div class="med-linear-picker__col" id="med-add-col-category">
            <div class="med-linear-picker__head">大項目</div>
            <div class="med-linear-picker__list" id="med-add-col-category-list"></div>
          </div>
          <div class="med-linear-picker__col" id="med-add-col-group" hidden>
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="med-add-col-group-list"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="med-add-col-leaf" hidden>
            <div class="med-linear-picker__head">
              <span class="med-linear-picker__head-label" id="med-add-col-leaf-head-label">薬剤名</span>
              <button type="button" class="exam-item-add__toggle" id="btn-med-add-toggle" hidden>＋</button>
            </div>
            <div class="med-linear-picker__list" id="med-add-col-leaf-list"></div>
            <p class="field__note" id="med-add-items-empty" hidden></p>
            <div class="exam-item-add" id="med-add-item-add" hidden>
              <label class="label label--sub" for="med-add-new-item" id="med-add-new-item-label">新しい薬剤を追加</label>
              <div class="exam-item-add__row">
                <input id="med-add-new-item" class="input" type="text" />
                <button id="btn-med-add-new-item" class="btn btn--small btn--outline" type="button">追加</button>
              </div>
              <p id="med-add-item-error" class="error-text" hidden></p>
            </div>
          </div>
        </div>
      </div>
      <div class="field">
        <span class="label">重要度</span>
        <div class="med-category-buttons" id="med-add-category-buttons"></div>
      </div>
      <div class="field">
        <span class="label">初期の投与頻度（任意）</span>
        <div id="med-add-freq-modes"></div>
        <div id="med-add-freq-panel-preset"><div id="med-add-freq-presets"></div></div>
        <div id="med-add-freq-panel-every-n" hidden>
          <button type="button" id="med-add-freq-period"></button>
          <button type="button" id="med-add-freq-times"></button>
          <div id="med-add-freq-every-n-numpad"></div>
        </div>
        <div id="med-add-freq-panel-weekly" hidden>
          <p id="med-add-freq-weekly-display"></p>
          <div id="med-add-freq-weekly-numpad"></div>
        </div>
        <div id="med-add-freq-panel-weekdays" hidden><div id="med-add-freq-weekdays"></div></div>
        <div id="med-add-freq-panel-other" hidden>
          <input id="med-add-freq-other-input" class="input" type="text" />
        </div>
      </div>
      <p id="med-add-error" class="error-text" hidden></p>
      <button id="btn-med-add-save" class="btn btn--small btn--primary" type="button">追加する</button>
      <button id="btn-med-add-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<div class="modal" id="med-event-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button id="btn-close-med-event" type="button"></button>
    <div id="med-event-type-buttons"></div>
    <input id="med-event-date" type="date" />
    <input id="med-event-freq-check" type="checkbox" />
    <div id="med-event-freq-block" hidden>
      <div id="med-event-freq-modes"></div>
      <div id="med-event-freq-panel-preset"><div id="med-event-freq-presets"></div></div>
      <div id="med-event-freq-panel-every-n" hidden>
        <button type="button" id="med-event-freq-period"></button>
        <button type="button" id="med-event-freq-times"></button>
        <div id="med-event-freq-every-n-numpad"></div>
      </div>
      <div id="med-event-freq-panel-weekly" hidden>
        <p id="med-event-freq-weekly-display"></p>
        <div id="med-event-freq-weekly-numpad"></div>
      </div>
      <div id="med-event-freq-panel-weekdays" hidden><div id="med-event-freq-weekdays"></div></div>
      <div id="med-event-freq-panel-other" hidden>
        <input id="med-event-freq-other-input" type="text" />
      </div>
    </div>
    <input id="med-event-amount-check" type="checkbox" />
    <div id="med-event-amount-block" hidden>
      <div id="med-event-amount-presets"></div>
      <input id="med-event-amount-other" type="checkbox" />
      <input id="med-event-amount-other-input" type="text" hidden />
    </div>
    <textarea id="med-event-detail"></textarea>
    <p id="med-event-error" hidden></p>
    <button id="btn-med-event-save" type="button"></button>
    <button id="btn-med-event-cancel" type="button"></button>
  </div>
</div>

<script type="module">
import { initMedsUI, enterMeds, leaveMeds } from "/js/meds-ui.js";
initMedsUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
  getSelectedAuthor: () => "院長",
});
window.__enter = (k) => enterMeds(k);
window.__leave = () => leaveMeds();
window.__ready = true;
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/med-master-harness.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const filePath = path.join(root, urlPath.replace(/^\//, ""));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/med-master-harness.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);

await page.evaluate(() => window.__enter("karte-a"));
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.waitForTimeout(250);

// 点眼で新規追加（中項目なし）→ カルテ横断でマスタ共有を確認
await page.locator("#med-add-col-category-list .med-linear-picker__item", {
  hasText: "点眼薬",
}).click();
await page.waitForTimeout(100);
await page.click("#btn-med-add-toggle");
await page.waitForSelector("#med-add-item-add:not([hidden])");
await page.fill("#med-add-new-item", "点眼テスト薬");
await page.click("#btn-med-add-new-item");
await page.waitForTimeout(200);
let buttons = await page
  .locator(
    "#med-add-col-leaf-list .med-linear-picker__item:not(.med-linear-picker__group-pick) .med-linear-picker__item-label"
  )
  .allTextContents();
console.log("KARTE A after add:", buttons);
if (!buttons.includes("点眼テスト薬")) throw new Error("master button missing");
const selected = await page
  .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
  .textContent();
if (selected !== "点眼テスト薬") throw new Error("not selected");
const defaultImportance = await page
  .locator("#med-add-category-buttons .med-cat-btn.is-selected")
  .textContent();
if (!defaultImportance?.startsWith("A")) {
  throw new Error("new med importance default should be A");
}

await page.click("#btn-med-add-save");
await page.waitForTimeout(200);
const listA = await page.evaluate(() =>
  [...document.querySelectorAll("#meds-list .med-card__name")].map(
    (el) => el.getAttribute("aria-label") || (el.dataset.name || "").replace(/\u200B/g, "")
  )
);
console.log("KARTE A list:", listA);
if (!listA.includes("点眼テスト薬")) throw new Error("drug not on karte A list");
const savedCat = await page.evaluate(() => {
  const nameEl = [...document.querySelectorAll("#meds-list .med-card__name")].find(
    (el) =>
      (el.getAttribute("aria-label") || el.dataset.name || "").includes("点眼テスト薬")
  );
  return nameEl?.closest(".med-card")?.querySelector(".med-cat")?.textContent?.trim() || "";
});
if (savedCat !== "A") throw new Error("saved importance should be A");

await page.evaluate(() => {
  window.__leave();
  window.__enter("karte-b");
});
await page.waitForTimeout(150);
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.locator("#med-add-col-category-list .med-linear-picker__item", {
  hasText: "点眼薬",
}).click();
await page.waitForTimeout(100);
buttons = await page
  .locator(
    "#med-add-col-leaf-list .med-linear-picker__item:not(.med-linear-picker__group-pick) .med-linear-picker__item-label"
  )
  .allTextContents();
console.log("KARTE B buttons:", buttons);
if (!buttons.includes("点眼テスト薬")) throw new Error("master not shared to karte B");

if (await page.locator("#btn-open-med-items").count()) throw new Error("管理ボタン残存");
if (await page.locator("#med-items-modal").count()) throw new Error("管理モーダル残存");
if (await page.locator("#med-add-other").count()) throw new Error("その他チェック残存");

await page.screenshot({ path: path.join(root, "tools/med-master-verify.png") });

// 内服: 中項目は開くだけ・「「◯◯」で登録」で確定、中項目の手入力追加、小項目追加
await page.click("#btn-close-med-add").catch(() => {});
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.locator("#med-add-col-category-list .med-linear-picker__item", {
  hasText: "内服薬",
}).click();
await page.waitForTimeout(120);
await page
  .locator("#med-add-col-group-list .med-linear-picker__item")
  .filter({
    has: page.locator(".med-linear-picker__item-label", { hasText: /^抗生剤$/ }),
  })
  .click();
await page.waitForTimeout(80);
const midOpenName = await page.evaluate(() => {
  const el = document.querySelector(
    "#med-add-col-group-list .med-linear-picker__item.is-open .med-linear-picker__item-label"
  );
  return el?.textContent?.trim() || "";
});
if (midOpenName !== "抗生剤") throw new Error("mid not opened");
if (
  await page.evaluate(() =>
    Boolean(
      document.querySelector("#med-add-col-group-list .med-linear-picker__item.is-selected")
    )
  )
) {
  throw new Error("opening a mid must not select it");
}
// 「「抗生剤」で登録」を押した時だけ中項目自体が選ばれる
const groupPick = page.locator("#med-add-col-leaf-list .med-linear-picker__group-pick");
const groupPickLabel = (
  await groupPick.locator(".med-linear-picker__item-label").textContent()
).trim();
if (groupPickLabel !== "「抗生剤」で登録") {
  throw new Error(`group pick label wrong: ${groupPickLabel}`);
}
await groupPick.click();
await page.waitForTimeout(80);
const midSelectedName = await page.evaluate(() => {
  const sel = document.querySelector(
    "#med-add-col-group-list .med-linear-picker__item.is-selected .med-linear-picker__item-label"
  );
  return sel?.textContent?.trim() || "";
});
if (midSelectedName !== "抗生剤") throw new Error("mid not selected by group pick");
// 中項目名で追加保存できること
await page.click("#btn-med-add-save");
await page.waitForTimeout(200);
const listWithMid = await page.evaluate(() =>
  [...document.querySelectorAll("#meds-list .med-card__name")].map(
    (el) => el.getAttribute("aria-label") || (el.dataset.name || "").replace(/\u200B/g, "")
  )
);
console.log("list with mid name:", listWithMid);
if (!listWithMid.includes("抗生剤")) throw new Error("mid name not saved as medication");

await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.locator("#med-add-col-category-list .med-linear-picker__item", {
  hasText: "内服薬",
}).click();
await page.waitForTimeout(100);
await page.click("#btn-med-add-toggle");
await page.waitForSelector("#med-add-item-add:not([hidden])");
await page.fill("#med-add-new-item", "検証用中項目");
await page.click("#btn-med-add-new-item");
await page.waitForTimeout(200);
const customMids = await page
  .locator("#med-add-col-group-list .med-linear-picker__item-label")
  .allTextContents();
if (!customMids.includes("検証用中項目")) throw new Error("custom mid not added");
await page.click("#btn-med-add-toggle");
await page.fill("#med-add-new-item", "検証用薬剤");
await page.click("#btn-med-add-new-item");
await page.waitForTimeout(200);
const customLeaves = await page
  .locator(
    "#med-add-col-leaf-list .med-linear-picker__item:not(.med-linear-picker__group-pick) .med-linear-picker__item-label"
  )
  .allTextContents();
if (!customLeaves.includes("検証用薬剤")) throw new Error("custom leaf not added");
await page.screenshot({ path: path.join(root, "tools/med-mid-select-verify.png") });

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: add on karte A → selectable on karte B; mid select/add works");
await browser.close();
server.close();
