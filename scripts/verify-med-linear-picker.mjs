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

const pickerField = `
      <div class="field">
        <span class="label">薬剤名</span>
        <div class="med-linear-picker" id="med-add-linear-picker" data-cols="3" aria-label="薬剤の階層選択">
          <div class="med-linear-picker__col" id="med-add-col-category" data-col="category">
            <div class="med-linear-picker__head">大項目</div>
            <div class="med-linear-picker__list" id="med-add-col-category-list" role="listbox" aria-label="大項目"></div>
          </div>
          <div class="med-linear-picker__col is-placeholder" id="med-add-col-group" data-col="group">
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="med-add-col-group-list" role="listbox" aria-label="中項目"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf is-placeholder" id="med-add-col-leaf" data-col="leaf">
            <div class="med-linear-picker__head">
              <span class="med-linear-picker__head-label">薬剤名</span>
              <button type="button" class="exam-item-add__toggle" id="btn-med-add-toggle" hidden aria-expanded="false">＋</button>
            </div>
            <div class="med-linear-picker__list" id="med-add-col-leaf-list" role="listbox" aria-label="薬剤名"></div>
            <p class="field__note med-linear-picker__empty" id="med-add-items-empty" hidden></p>
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
      </div>`;

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>med linear picker harness</title>
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
  <div class="modal__panel modal__panel--med-add">
    <div class="modal__header">
      <h2 class="modal__title" id="med-add-modal-title">薬剤を追加</h2>
      <button class="modal__close" id="btn-close-med-add" type="button">&times;</button>
    </div>
    <div class="modal__body">
      ${pickerField}
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

function itemLabels(page, listSel) {
  return page.locator(`${listSel} .med-linear-picker__item-label`).allTextContents();
}

async function clickItem(page, listSel, label) {
  await page
    .locator(`${listSel} .med-linear-picker__item`)
    .filter({
      has: page.locator(".med-linear-picker__item-label", {
        hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      }),
    })
    .click();
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/med-linear-picker-harness.html") {
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
const page = await browser.newPage({ viewport: { width: 900, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/med-linear-picker-harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(() => window.__enter("karte-a"));
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.waitForTimeout(200);

async function medColWidths() {
  return page.evaluate(() => {
    const root = document.getElementById("med-add-linear-picker");
    return [...root.querySelectorAll(".med-linear-picker__col")]
      .filter((el) => !el.hidden)
      .map((el) => Math.round(el.getBoundingClientRect().width));
  });
}

function assertBalanced(widths, label) {
  if (widths.length < 2) return;
  const max = Math.max(...widths);
  const min = Math.min(...widths);
  if (max - min > 24) {
    throw new Error(`${label}: column widths uneven ${JSON.stringify(widths)}`);
  }
}

// 初期: 3列枠を確保（中・葉はプレースホルダー）
const cats = await itemLabels(page, "#med-add-col-category-list");
console.log("categories:", cats);
if (
  JSON.stringify(cats) !==
  JSON.stringify(["注射薬", "内服薬", "外用薬", "点眼薬"])
) {
  throw new Error("category list mismatch");
}
const defaultImportance = await page
  .locator("#med-add-category-buttons .med-cat-btn.is-selected")
  .textContent();
console.log("default importance:", defaultImportance);
if (!defaultImportance?.startsWith("A")) {
  throw new Error("new med importance default should be A");
}
if (!(await page.locator("#med-add-col-group").evaluate((el) => el.classList.contains("is-placeholder")))) {
  throw new Error("mid col should be placeholder initially");
}
if (!(await page.locator("#med-add-col-leaf").evaluate((el) => el.classList.contains("is-placeholder")))) {
  throw new Error("leaf col should be placeholder initially");
}
let widths = await medColWidths();
console.log("med initial widths:", widths);
assertBalanced(widths, "med initial");
await page.screenshot({
  path: path.join(root, "tools/med-linear-layout-01-stage1.png"),
});
await page.screenshot({
  path: path.join(root, "tools/med-linear-picker-01-initial.png"),
});

// 注射薬 → 中項目なしで薬剤名列（2列均等）
await clickItem(page, "#med-add-col-category-list", "注射薬");
await page.waitForTimeout(100);
if (!(await page.locator("#med-add-col-group").isHidden())) {
  throw new Error("inject should hide mid column");
}
if (await page.locator("#med-add-col-leaf").isHidden()) {
  throw new Error("inject should show leaf column directly");
}
if ((await page.locator("#med-add-linear-picker").getAttribute("data-cols")) !== "2") {
  throw new Error("inject should use 2-col layout");
}
widths = await medColWidths();
console.log("inject widths:", widths);
assertBalanced(widths, "inject");
await page.screenshot({
  path: path.join(root, "tools/med-linear-picker-00-inject.png"),
});

// 内服薬 → 中項目（葉はプレースホルダーのまま3列）
await clickItem(page, "#med-add-col-category-list", "内服薬");
await page.waitForTimeout(100);
if (await page.locator("#med-add-col-group").isHidden()) {
  throw new Error("mid col should show after oral");
}
if (!(await page.locator("#med-add-col-leaf").evaluate((el) => el.classList.contains("is-placeholder")))) {
  throw new Error("leaf col should stay placeholder until mid selected");
}
const groups = await itemLabels(page, "#med-add-col-group-list");
console.log("oral groups count:", groups.length, "sample:", groups.slice(0, 5));
if (groups.length !== 19) throw new Error(`expected 19 oral mid groups, got ${groups.length}`);
if (!groups.includes("抗生剤") || !groups.includes("その他")) {
  throw new Error("oral mid groups missing expected labels");
}
const oralSelected = await page
  .locator("#med-add-col-category-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
  .textContent();
if (oralSelected !== "内服薬") throw new Error("oral not marked selected");
widths = await medColWidths();
console.log("oral stage2 widths:", widths);
assertBalanced(widths, "oral stage2");
await page.screenshot({
  path: path.join(root, "tools/med-linear-layout-02-stage2.png"),
});
await page.screenshot({
  path: path.join(root, "tools/med-linear-picker-02-oral-mid.png"),
});

// その他 → 旧フラットのうち同名シード以外
await clickItem(page, "#med-add-col-group-list", "その他");
await page.waitForTimeout(100);
if (await page.locator("#med-add-col-leaf").evaluate((el) => el.classList.contains("is-placeholder"))) {
  throw new Error("leaf col should activate after mid");
}
const leaves = await itemLabels(page, "#med-add-col-leaf-list");
console.log("oral/その他 leaves:", leaves);
for (const name of ["アラバ", "パラディア", "アモキシシリン"]) {
  if (leaves.includes(name)) throw new Error(`${name} should have moved out of その他`);
}
if (!(await page.locator("#btn-med-add-toggle").isVisible())) {
  throw new Error("add toggle should be visible in leaf col");
}
if (!(await page.locator("#med-add-item-add").isHidden())) {
  throw new Error("add field should stay collapsed until + is pressed");
}
widths = await medColWidths();
console.log("oral stage3 widths:", widths);
assertBalanced(widths, "oral stage3");
await page.screenshot({
  path: path.join(root, "tools/med-linear-layout-03-stage3.png"),
});
await page.screenshot({
  path: path.join(root, "tools/med-linear-picker-03-oral-leaf.png"),
});

await clickItem(page, "#med-add-col-group-list", "免疫抑制");
await page.waitForTimeout(100);
const immunoLeaves = await itemLabels(page, "#med-add-col-leaf-list");
if (!immunoLeaves.includes("アラバ") || immunoLeaves[0] !== "イムラン") {
  throw new Error("免疫抑制 leaf order mismatch");
}
await clickItem(page, "#med-add-col-leaf-list", "アラバ");
await page.waitForTimeout(80);
const leafSelected = await page
  .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
  .textContent();
if (leafSelected !== "アラバ") throw new Error("leaf not selected");
const checks = await page
  .locator("#med-add-linear-picker .med-linear-picker__item.is-selected .med-linear-picker__check")
  .count();
if (checks < 3) throw new Error("expected checkmarks on 3 selected columns");
await page.screenshot({
  path: path.join(root, "tools/med-linear-picker-04-oral-selected.png"),
});

await clickItem(page, "#med-add-col-group-list", "ビタミン・代謝");
await page.waitForTimeout(100);
const vitaminLeaves = await itemLabels(page, "#med-add-col-leaf-list");
if (
  vitaminLeaves.join(",") !==
  ["メコバラミン", "ユベラN", "葉酸", "センベルゴ"].join(",")
) {
  throw new Error("ビタミン・代謝 leaf order mismatch: " + vitaminLeaves.join(","));
}
await clickItem(page, "#med-add-col-leaf-list", "センベルゴ");
await page.waitForTimeout(80);
if (
  (await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent()) !== "センベルゴ"
) {
  throw new Error("ビタミン・代謝 leaf not selected");
}

await clickItem(page, "#med-add-col-group-list", "ホルモン");
await page.waitForTimeout(100);
const hormoneLeaves = await itemLabels(page, "#med-add-col-leaf-list");
if (
  hormoneLeaves.join(",") !==
  [
    "アドレスタン",
    "チラージン",
    "チロブロック",
    "トリロスタン",
    "フロリネフ",
    "サキオジール",
    "メラトニン",
    "チアマゾール",
  ].join(",")
) {
  throw new Error("ホルモン leaf order mismatch: " + hormoneLeaves.join(","));
}
await clickItem(page, "#med-add-col-leaf-list", "チアマゾール");
await page.waitForTimeout(80);
if (
  (await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent()) !== "チアマゾール"
) {
  throw new Error("ホルモン leaf not selected");
}

await clickItem(page, "#med-add-col-group-list", "漢方");
await page.waitForTimeout(100);
const kampoLeaves = await itemLabels(page, "#med-add-col-leaf-list");
if (
  kampoLeaves.join(",") !==
  [
    "源気",
    "三仙",
    "清肌",
    "通楽",
    "露華",
    "寧心",
    "潤華",
    "快元",
    "西伯利亜",
    "通淋",
    "静心",
    "滋潤",
    "熄風",
    "調息",
    "腎固",
    "爽牙",
    "四逆散",
    "八味地黄丸",
    "補全",
    "雲南白薬",
  ].join(",")
) {
  throw new Error("漢方 leaf order mismatch: " + kampoLeaves.join(","));
}
await clickItem(page, "#med-add-col-leaf-list", "雲南白薬");
await page.waitForTimeout(80);
if (
  (await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent()) !== "雲南白薬"
) {
  throw new Error("漢方 leaf not selected");
}

// 選び直し: 中項目を抗生剤に変更 → 葉がクリアされシード順で表示
await clickItem(page, "#med-add-col-group-list", "抗生剤");
await page.waitForTimeout(80);
const afterReselect = await itemLabels(page, "#med-add-col-leaf-list");
console.log("after reselect 抗生剤 leaves:", afterReselect);
if (!afterReselect.includes("アモキシシリン") || afterReselect[0] !== "アモキシシリン") {
  throw new Error("抗生剤 leaf order should start with アモキシシリン");
}
if (afterReselect[afterReselect.length - 1] !== "メトロニダゾール") {
  throw new Error("抗生剤 leaf order should end with メトロニダゾール");
}
const stillSelectedLeaf = await page
  .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected")
  .count();
if (stillSelectedLeaf !== 0) throw new Error("leaf selection should clear on mid change");
await clickItem(page, "#med-add-col-leaf-list", "アモキシシリン");
await page.waitForTimeout(60);
if (
  (await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent()) !== "アモキシシリン"
) {
  throw new Error("seeded アモキシシリン not selectable");
}

// 点眼薬 → 中項目なしで直接薬剤名
await clickItem(page, "#med-add-col-category-list", "点眼薬");
await page.waitForTimeout(100);
if (!(await page.locator("#med-add-col-group").isHidden())) {
  throw new Error("eye should hide mid column");
}
if (await page.locator("#med-add-col-leaf").isHidden()) {
  throw new Error("eye should show leaf column directly");
}
if (!(await page.locator("#btn-med-add-toggle").isVisible())) {
  throw new Error("eye should show add toggle");
}
if (!(await page.locator("#med-add-item-add").isHidden())) {
  throw new Error("eye add form should stay collapsed");
}
await page.screenshot({
  path: path.join(root, "tools/med-linear-picker-05-eye.png"),
});

await page.click("#btn-med-add-toggle");
await page.waitForSelector("#med-add-item-add:not([hidden])");
await page.fill("#med-add-new-item", "ヒアレイン");
await page.click("#btn-med-add-new-item");
await page.waitForTimeout(150);
const eyeLeaves = await itemLabels(page, "#med-add-col-leaf-list");
console.log("eye leaves after add:", eyeLeaves);
if (!eyeLeaves.includes("ヒアレイン")) throw new Error("eye add failed");
const eyeSelected = await page
  .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
  .textContent();
if (eyeSelected !== "ヒアレイン") throw new Error("new eye drug not selected");
await page.screenshot({
  path: path.join(root, "tools/med-linear-picker-06-eye-added.png"),
});

// 外用薬の中項目数確認
await clickItem(page, "#med-add-col-category-list", "外用薬");
await page.waitForTimeout(80);
const topical = await itemLabels(page, "#med-add-col-group-list");
console.log("topical groups:", topical);
if (JSON.stringify(topical) !== JSON.stringify(["皮膚", "消毒", "耳"])) {
  throw new Error("topical groups mismatch");
}
await clickItem(page, "#med-add-col-group-list", "皮膚");
await page.click("#btn-med-add-toggle");
await page.waitForSelector("#med-add-item-add:not([hidden])");
await page.fill("#med-add-new-item", "イソジンゲル");
await page.click("#btn-med-add-new-item");
await page.waitForTimeout(120);
const topicalLeaves = await itemLabels(page, "#med-add-col-leaf-list");
if (!topicalLeaves.includes("イソジンゲル")) throw new Error("topical add failed");
await page.screenshot({
  path: path.join(root, "tools/med-linear-picker-07-topical.png"),
});

// 新規登録時の重要度が A のまま保存されること
await page.click("#btn-med-add-save");
await page.waitForTimeout(200);
const savedCat = await page.evaluate(() => {
  const nameEl = [...document.querySelectorAll("#meds-list .med-card__name")].find(
    (el) =>
      (el.getAttribute("aria-label") || el.dataset.name || "").includes("イソジンゲル")
  );
  return nameEl?.closest(".med-card")?.querySelector(".med-cat")?.textContent?.trim() || "";
});
console.log("saved importance for イソジンゲル:", savedCat);
if (savedCat !== "A") throw new Error("saved importance should be A by default");

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: inject/oral/topical/eye labels + default importance A");
await browser.close();
server.close();
