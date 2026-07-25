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

const freqField = `
      <div class="field">
        <span class="label">初期の投与頻度（任意）</span>
        <div class="med-linear-picker med-linear-picker--freq" id="med-add-freq-picker">
          <div class="med-linear-picker__col" data-col="mode">
            <div class="med-linear-picker__head">指定方法</div>
            <div class="med-linear-picker__list" id="med-add-freq-modes" role="listbox"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="med-add-freq-detail" hidden>
            <div class="med-linear-picker__head" id="med-add-freq-detail-head">内容</div>
            <div class="freq-linear-detail">
              <div id="med-add-freq-panel-preset" hidden>
                <div class="med-linear-picker__list" id="med-add-freq-presets"></div>
              </div>
              <div id="med-add-freq-panel-every-n" hidden>
                <div class="freq-dual-fields">
                  <button type="button" class="interval-value-display freq-field" id="med-add-freq-period">日数: 3</button>
                  <button type="button" class="interval-value-display freq-field" id="med-add-freq-times">回数: 1</button>
                </div>
                <div class="numpad" id="med-add-freq-every-n-numpad"></div>
              </div>
              <div id="med-add-freq-panel-weekly" hidden>
                <p class="interval-value-display" id="med-add-freq-weekly-display">週1回</p>
                <div class="numpad" id="med-add-freq-weekly-numpad"></div>
              </div>
              <div id="med-add-freq-panel-weekdays" hidden>
                <div class="med-linear-picker__list" id="med-add-freq-weekdays"></div>
              </div>
              <div id="med-add-freq-panel-other" hidden>
                <input id="med-add-freq-other-input" class="input" type="text" placeholder="頻度を自由に入力" />
              </div>
            </div>
          </div>
        </div>
      </div>`;

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>med freq linear harness</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside class="right-column" style="width:100%;max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <div id="right-tabs" class="right-tabs">
    <button type="button" class="right-tab is-active" data-tab="meds">薬剤情報</button>
  </div>
  <div class="right-panel" id="panel-meds" data-panel="meds">
    <div class="exam-toolbar">
      <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
    </div>
    <section class="exam-section">
      <h3 class="exam-section__title">薬剤一覧</h3>
      <p class="field__note" id="meds-empty"></p>
      <ul class="meds-list" id="meds-list"></ul>
    </section>
  </div>
</aside>

<div class="modal" id="med-detail-sheet" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <button class="modal__close" id="btn-close-med-detail-sheet" type="button">&times;</button>
    <p id="med-detail-sheet-name"></p>
    <p id="med-detail-sheet-status"></p>
    <div id="med-detail-sheet-body" class="med-sheet__body"></div>
    <button id="btn-med-detail-sheet-close" type="button">閉じる</button>
  </div>
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
            <div class="med-linear-picker__head">薬剤名</div>
            <div class="med-linear-picker__list" id="med-add-col-leaf-list"></div>
            <p id="med-add-items-empty" hidden></p>
            <div class="exam-item-add" id="med-add-item-add">
              <label id="med-add-new-item-label" for="med-add-new-item">新しい薬剤</label>
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
      ${freqField}
      <p id="med-add-error" class="error-text" hidden></p>
      <button id="btn-med-add-save" class="btn btn--small btn--primary" type="button">追加する</button>
      <button id="btn-med-add-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<div class="modal" id="med-event-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--med-event">
    <div class="modal__header">
      <h2 class="modal__title" id="med-event-modal-title">出来事を追加</h2>
      <button class="modal__close" id="btn-close-med-event" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <span class="label">種類</span>
        <div class="exam-item-buttons" id="med-event-type-buttons"></div>
      </div>
      <div class="field">
        <label class="label" for="med-event-date">日付</label>
        <input id="med-event-date" class="input input--date" type="date" />
      </div>
      <div class="field" id="med-event-change-options" hidden>
        <span class="label">頻度・量（任意）</span>
        <label class="exam-other-check">
          <input type="checkbox" id="med-event-freq-check" />
          <span>回数を変更</span>
        </label>
        <div id="med-event-freq-block" hidden>
          <div class="med-linear-picker med-linear-picker--freq" id="med-event-freq-picker">
            <div class="med-linear-picker__col">
              <div class="med-linear-picker__head">指定方法</div>
              <div class="med-linear-picker__list" id="med-event-freq-modes"></div>
            </div>
            <div class="med-linear-picker__col med-linear-picker__col--leaf" id="med-event-freq-detail" hidden>
              <div class="med-linear-picker__head" id="med-event-freq-detail-head">内容</div>
              <div class="freq-linear-detail">
                <div id="med-event-freq-panel-preset" hidden>
                  <div class="med-linear-picker__list" id="med-event-freq-presets"></div>
                </div>
                <div id="med-event-freq-panel-every-n" hidden>
                  <div class="freq-dual-fields">
                    <button type="button" class="interval-value-display freq-field" id="med-event-freq-period">日数: 3</button>
                    <button type="button" class="interval-value-display freq-field" id="med-event-freq-times">回数: 1</button>
                  </div>
                  <div class="numpad" id="med-event-freq-every-n-numpad"></div>
                </div>
                <div id="med-event-freq-panel-weekly" hidden>
                  <p class="interval-value-display" id="med-event-freq-weekly-display">週1回</p>
                  <div class="numpad" id="med-event-freq-weekly-numpad"></div>
                </div>
                <div id="med-event-freq-panel-weekdays" hidden>
                  <div class="med-linear-picker__list" id="med-event-freq-weekdays"></div>
                </div>
                <div id="med-event-freq-panel-other" hidden>
                  <input id="med-event-freq-other-input" class="input" type="text" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <label class="exam-other-check">
          <input type="checkbox" id="med-event-amount-check" />
          <span>1回の量を変更</span>
        </label>
        <div id="med-event-amount-block" hidden>
          <div id="med-event-amount-presets"></div>
          <input id="med-event-amount-other" type="checkbox" />
          <input id="med-event-amount-other-input" type="text" hidden />
        </div>
      </div>
      <textarea id="med-event-detail" class="input"></textarea>
      <p id="med-event-error" class="error-text" hidden></p>
      <button id="btn-med-event-save" class="btn btn--small btn--primary" type="button">保存する</button>
      <button id="btn-med-event-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<script type="module">
import { initMedsUI, enterMeds, focusMedicationByName } from "/js/meds-ui.js";
initMedsUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
  getSelectedAuthor: () => "院長",
});
window.__enter = (k) => enterMeds(k);
window.__focusMed = (name) => focusMedicationByName(name);
window.__ready = true;
</script>
</body>
</html>`;

async function clickLinear(page, listSel, label) {
  await page.locator(`${listSel} .med-linear-picker__item`, { hasText: label }).click();
}

async function openAddWithEyeDrug(page, drugName) {
  await page.click("#btn-med-add");
  await page.waitForSelector("#med-add-modal:not([hidden])");
  await clickLinear(page, "#med-add-col-category-list", "点眼薬");
  await page.waitForTimeout(80);
  await page.fill("#med-add-new-item", drugName);
  await page.click("#btn-med-add-new-item");
  await page.waitForTimeout(100);
}

async function openDrugDetail(page, drugName) {
  const ok = await page.evaluate((name) => window.__focusMed(name), drugName);
  if (!ok) throw new Error("focusMedicationByName failed: " + drugName);
  await page.waitForSelector("#med-detail-sheet:not([hidden])");
}

async function freqLabelForDrug(page, drugName) {
  return page.evaluate(async (name) => {
    const { fetchMedicationsOnce } = await import("/js/db.js");
    const drugs = await fetchMedicationsOnce("karte-freq");
    const drug = drugs.find((d) => d.name === name);
    if (!drug) return "";
    const events = Object.values(drug.events || {});
    events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const ev = events[0];
    if (!ev) return "";
    if (ev.frequency?.label) return ev.frequency.label;
    return ev.frequencyChange || "";
  }, drugName);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/med-freq-linear-harness.html") {
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/med-freq-linear-harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(() => window.__enter("karte-freq"));

// --- 初期: 指定方法のみ ---
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
const modes = await page
  .locator("#med-add-freq-modes .med-linear-picker__item-label")
  .allTextContents();
console.log("freq modes:", modes);
if (
  JSON.stringify(modes) !==
  JSON.stringify(["よくある", "日に○回", "週○回", "曜日指定", "その他"])
) {
  throw new Error("freq mode labels mismatch");
}
if (!(await page.locator("#med-add-freq-detail").isHidden())) {
  throw new Error("detail col should be hidden initially");
}
await page.screenshot({
  path: path.join(root, "tools/med-freq-linear-01-modes.png"),
});
await page.click("#btn-med-add-cancel");

// --- よくある ---
await openAddWithEyeDrug(page, "頻度よくある");
await clickLinear(page, "#med-add-freq-modes", "よくある");
await page.waitForTimeout(80);
if (await page.locator("#med-add-freq-detail").isHidden()) {
  throw new Error("detail should show for preset");
}
const presets = await page
  .locator("#med-add-freq-presets .med-linear-picker__item-label")
  .allTextContents();
console.log("presets:", presets);
if (!presets.includes("1日2回")) throw new Error("preset missing");
await page.screenshot({
  path: path.join(root, "tools/med-freq-linear-02-preset.png"),
});
await clickLinear(page, "#med-add-freq-presets", "1日2回");
await page.click("#btn-med-add-save");
await page.waitForSelector("#med-add-modal[hidden]", { state: "attached" });
await page.waitForTimeout(150);
let got = await freqLabelForDrug(page, "頻度よくある");
console.log("saved preset:", got);
if (got !== "1日2回") throw new Error(`preset save failed: ${got}`);

// --- 日に○回（○日に○回） ---
await openAddWithEyeDrug(page, "頻度日に");
await clickLinear(page, "#med-add-freq-modes", "日に○回");
await page.waitForTimeout(80);
if (await page.locator("#med-add-freq-panel-every-n").isHidden()) {
  throw new Error("every_n panel missing");
}
await page.screenshot({
  path: path.join(root, "tools/med-freq-linear-03-every-n.png"),
});
// デフォルト 3日に1回を確定して保存
await page.locator("#med-add-freq-every-n-numpad .numpad__btn--confirm").click();
await page.click("#med-add-freq-times");
await page.locator("#med-add-freq-every-n-numpad .numpad__btn--confirm").click();
await page.click("#btn-med-add-save");
await page.waitForTimeout(150);
got = await freqLabelForDrug(page, "頻度日に");
console.log("saved every_n:", got);
if (got !== "3日に1回") throw new Error(`every_n save failed: ${got}`);

// --- 週○回 ---
await openAddWithEyeDrug(page, "頻度週");
await clickLinear(page, "#med-add-freq-modes", "週○回");
await page.waitForTimeout(80);
await page.screenshot({
  path: path.join(root, "tools/med-freq-linear-04-weekly.png"),
});
await page.locator("#med-add-freq-weekly-numpad .numpad__btn", { hasText: "削除" }).click();
await page.locator("#med-add-freq-weekly-numpad .numpad__btn", { hasText: "2" }).click();
await page.locator("#med-add-freq-weekly-numpad .numpad__btn--confirm").click();
await page.click("#btn-med-add-save");
await page.waitForTimeout(150);
got = await freqLabelForDrug(page, "頻度週");
console.log("saved weekly:", got);
if (got !== "週2回") throw new Error(`weekly save failed: ${got}`);

// --- 曜日指定 ---
await openAddWithEyeDrug(page, "頻度曜日");
await clickLinear(page, "#med-add-freq-modes", "曜日指定");
await page.waitForTimeout(80);
await clickLinear(page, "#med-add-freq-weekdays", "月曜日");
await clickLinear(page, "#med-add-freq-weekdays", "水曜日");
await page.screenshot({
  path: path.join(root, "tools/med-freq-linear-05-weekdays.png"),
});
await page.click("#btn-med-add-save");
await page.waitForTimeout(150);
got = await freqLabelForDrug(page, "頻度曜日");
console.log("saved weekdays:", got);
if (got !== "月曜日・水曜日") throw new Error(`weekdays save failed: ${got}`);

// --- その他 ---
await openAddWithEyeDrug(page, "頻度その他");
await clickLinear(page, "#med-add-freq-modes", "その他");
await page.waitForTimeout(80);
await page.fill("#med-add-freq-other-input", "食後のみ");
await page.screenshot({
  path: path.join(root, "tools/med-freq-linear-06-other.png"),
});
await page.click("#btn-med-add-save");
await page.waitForTimeout(150);
got = await freqLabelForDrug(page, "頻度その他");
console.log("saved other:", got);
if (got !== "食後のみ") throw new Error(`other save failed: ${got}`);

// --- 増量時の頻度（イベントモーダル）もリニアであること ---
await openDrugDetail(page, "頻度よくある");
await page.locator("#med-detail-sheet-body .med-event-quick__btn", { hasText: "増量" }).click();
await page.waitForSelector("#med-event-modal:not([hidden])");
await page.waitForTimeout(80);
// 増量は回数変更＋頻度リニアが自動表示される
if (await page.locator("#med-event-freq-block").isHidden()) {
  throw new Error("freq block should open for increase");
}
const eventModes = await page
  .locator("#med-event-freq-modes .med-linear-picker__item-label")
  .allTextContents();
console.log("event freq modes:", eventModes);
if (
  JSON.stringify(eventModes) !==
  JSON.stringify(["よくある", "日に○回", "週○回", "曜日指定", "その他"])
) {
  throw new Error("event freq modes mismatch");
}
await clickLinear(page, "#med-event-freq-modes", "よくある");
await page.waitForTimeout(80);
const eventPresets = await page
  .locator("#med-event-freq-presets .med-linear-picker__item-label")
  .allTextContents();
if (!eventPresets.includes("1日2回→1回")) {
  throw new Error("transition presets missing in event modal");
}
await page.screenshot({
  path: path.join(root, "tools/med-freq-linear-07-event-increase.png"),
});
await clickLinear(page, "#med-event-freq-presets", "1日2回→3回");
await page.click("#btn-med-event-save");
await page.waitForTimeout(200);
const hist = await page.locator("#med-detail-sheet-body").innerText();
console.log("event hist snippet:", hist.includes("1日2回→3回"));
if (!hist.includes("1日2回→3回")) {
  throw new Error("event frequency not saved");
}

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: freq linear picker all modes + event increase");
await browser.close();
server.close();
