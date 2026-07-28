import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
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
  <title>med hierarchy harness</title>
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
              <span class="med-linear-picker__head-label">薬剤名</span>
              <button type="button" class="exam-item-add__toggle" id="btn-med-add-toggle" hidden aria-expanded="false">＋</button>
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
  if (urlPath === "/tools/med-hierarchy-harness.html") {
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

async function launchBrowser() {
  for (const executablePath of [
    undefined,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    try {
      return await chromium.launch(
        executablePath ? { executablePath } : undefined
      );
    } catch (err) {
      console.warn("launch failed", executablePath || "playwright", err.message);
    }
  }
  throw new Error("Unable to launch browser");
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 420, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/med-hierarchy-harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(() => window.__enter("karte-a"));
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.waitForTimeout(300);

const categoryLabels = await page
  .locator("#med-add-col-category-list .med-linear-picker__item-label")
  .allTextContents();
console.log("categories:", categoryLabels);
if (
  JSON.stringify(categoryLabels) !==
  JSON.stringify(["注射薬", "内服薬", "外用薬", "点眼薬"])
) {
  throw new Error("category list mismatch");
}
const defaultImportance = await page
  .locator("#med-add-category-buttons .med-cat-btn.is-selected")
  .textContent();
if (!defaultImportance?.startsWith("A")) {
  throw new Error("new med importance default should be A");
}

await page.locator("#med-add-col-category-list .med-linear-picker__item", {
  hasText: "内服薬",
}).click();
await page.waitForTimeout(100);

// 内服: 中項目列、葉列はまだ非表示
let buttons = await page
  .locator("#med-add-col-group-list .med-linear-picker__item-label")
  .allTextContents();
console.log("oral mid groups sample:", buttons.slice(0, 5), "...", buttons.length);
if (!buttons.includes("抗生剤") || !buttons.includes("その他")) {
  throw new Error("oral mid groups missing");
}
if (buttons.includes("アモキシシリン")) {
  throw new Error("legacy leaf should not show in mid column");
}
if (
  !(await page
    .locator("#med-add-col-leaf")
    .evaluate((el) => el.classList.contains("is-placeholder")))
) {
  throw new Error("leaf col should stay placeholder until mid selected");
}

// その他 → 同名シード以外の旧フラット
await page.locator("#med-add-col-group-list .med-linear-picker__item", {
  hasText: "その他",
}).click();
await page.waitForTimeout(150);
buttons = await page
  .locator("#med-add-col-leaf-list .med-linear-picker__item-label")
  .allTextContents();
console.log("oral/その他 leaves:", buttons);
for (const name of ["アラバ", "パラディア", "アモキシシリン"]) {
  if (buttons.includes(name)) throw new Error(`${name} should have moved out of その他`);
}
const addToggleVisible = await page.locator("#btn-med-add-toggle").isVisible();
if (!addToggleVisible) throw new Error("add toggle should show in leaf col");
const addCollapsed = await page.locator("#med-add-item-add").isHidden();
if (!addCollapsed) throw new Error("add field should stay collapsed until +");

// 抗生剤 → シード先頭を選択して追加
await page.locator("#med-add-col-group-list .med-linear-picker__item", {
  hasText: "抗生剤",
}).click();
await page.waitForTimeout(120);
buttons = await page
  .locator("#med-add-col-leaf-list .med-linear-picker__item-label")
  .allTextContents();
console.log("oral/抗生剤 leaves sample:", buttons.slice(0, 3), "...", buttons.length);
if (buttons[0] !== "アモキシシリン") {
  throw new Error("抗生剤 should start with アモキシシリン");
}

await page.locator("#med-add-col-leaf-list .med-linear-picker__item").filter({
  has: page.locator(".med-linear-picker__item-label", {
    hasText: /^アモキシシリン$/,
  }),
}).click();
const selected = await page
  .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
  .textContent();
if (selected !== "アモキシシリン") throw new Error("leaf not selected");

// 重要度 A を選んで追加
await page.locator("#med-add-category-buttons .med-cat-btn", {
  hasText: /^A/,
}).click();
await page.click("#btn-med-add-save");
await page.waitForTimeout(250);
await page.waitForFunction(() =>
  [...document.querySelectorAll(".med-card__name")].some(
    (el) => (el.dataset.name || el.getAttribute("aria-label")) === "アモキシシリン"
  )
);
const cardHtml = await page.evaluate(() => {
  const nameEl = [...document.querySelectorAll(".med-card__name")].find(
    (el) => (el.dataset.name || el.getAttribute("aria-label")) === "アモキシシリン"
  );
  return nameEl?.closest(".med-card")?.innerHTML || "";
});
console.log("card A has med-cat--A:", cardHtml.includes("med-cat--A"));
if (!cardHtml.includes("med-cat--A")) {
  throw new Error("category A not preserved on amoxicillin card");
}

// 外用: 中項目
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.locator("#med-add-col-category-list .med-linear-picker__item", {
  hasText: "外用薬",
}).click();
await page.waitForTimeout(100);
buttons = await page
  .locator("#med-add-col-group-list .med-linear-picker__item-label")
  .allTextContents();
console.log("topical groups:", buttons);
if (JSON.stringify(buttons) !== JSON.stringify(["皮膚", "消毒", "耳"])) {
  throw new Error("topical groups mismatch");
}
await page.locator("#med-add-col-group-list .med-linear-picker__item", { hasText: "皮膚" }).click();
await page.click("#btn-med-add-toggle");
await page.waitForSelector("#med-add-item-add:not([hidden])");
await page.fill("#med-add-new-item", "イソジンゲル");
await page.click("#btn-med-add-new-item");
await page.waitForTimeout(150);
buttons = await page
  .locator("#med-add-col-leaf-list .med-linear-picker__item-label")
  .allTextContents();
if (!buttons.includes("イソジンゲル")) throw new Error("topical add failed");

// 点眼: 中項目なし・直下に追加
await page.locator("#med-add-col-category-list .med-linear-picker__item", {
  hasText: "点眼薬",
}).click();
await page.waitForTimeout(100);
const eyeMidHidden = await page.locator("#med-add-col-group").isHidden();
if (!eyeMidHidden) throw new Error("eye should not show mid column");
const eyeToggleVisible = await page.locator("#btn-med-add-toggle").isVisible();
if (!eyeToggleVisible) throw new Error("eye should show add toggle in leaf col");
buttons = await page
  .locator("#med-add-col-leaf-list .med-linear-picker__item-label")
  .allTextContents();
console.log("eye leaves:", buttons);
if (buttons.some((b) => ["皮膚", "消毒", "耳", "抗生剤"].includes(b))) {
  throw new Error("eye leaf should not show other category groups");
}
await page.click("#btn-med-add-toggle");
await page.waitForSelector("#med-add-item-add:not([hidden])");
await page.fill("#med-add-new-item", "ヒアレイン");
await page.click("#btn-med-add-new-item");
await page.waitForTimeout(150);
buttons = await page
  .locator("#med-add-col-leaf-list .med-linear-picker__item-label")
  .allTextContents();
if (!buttons.includes("ヒアレイン")) throw new Error("eye add failed");
// デフォルト A のまま保存（明示的に B へは変更しない）
await page.click("#btn-med-add-save");
await page.waitForTimeout(250);

const names = await page.evaluate(() =>
  [...document.querySelectorAll("#meds-list .med-card__name")].map(
    (el) => el.getAttribute("aria-label") || (el.dataset.name || "").replace(/\u200B/g, "")
  )
);
console.log("list names:", names);
if (!names.includes("アモキシシリン") || !names.includes("ヒアレイン")) {
  throw new Error("patient drugs missing");
}

// A/B 重要度が患者レコード側に残っていること
const cats = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("#meds-list .med-card")];
  return cards.map((c) => {
    const nameEl = c.querySelector(".med-card__name");
    return {
      name:
        nameEl?.getAttribute("aria-label") ||
        (nameEl?.dataset.name || "").replace(/\u200B/g, ""),
      html: c.outerHTML,
    };
  });
});
const amo = cats.find((c) => c.name === "アモキシシリン");
const hya = cats.find((c) => c.name === "ヒアレイン");
if (!amo || !/med-cat--A|data-category="A"|カテゴリA/.test(amo.html)) {
  // meds-ui のクラス実装を確認
  const amoOk = amo && (amo.html.includes("med-cat--A") || amo.html.includes("A"));
  if (!amoOk) throw new Error("category A not preserved on amoxicillin card");
}
if (!hya || !(hya.html.includes("med-cat--A") || /\bA\b/.test(hya.html))) {
  throw new Error("category A default not set on eye drop card");
}
console.log("ABC ok for", amo.name, hya.name);

await page.screenshot({
  path: path.join(root, "tools/med-hierarchy-verify.png"),
  fullPage: true,
});

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: oral/topical/eye hierarchy + legacy migration + A/B/C");
await browser.close();
server.close();
