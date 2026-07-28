/**
 * 内服薬シード（抗生剤・血液）が選択画面で指定順に表示・選択できること
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const ANTIBIOTIC_LABELS = [
  "アモキシシリン",
  "クラブラン酸/アモキシシリン",
  "セファレキシン",
  "セフポドキシム",
  "ファロペネム",
  "アジスロマイシン",
  "タイロシン",
  "クリンダマイシン",
  "ホスホマイシン",
  "ドキシサイクリン",
  "ミノサイクリン",
  "エンロフロキサシン",
  "オルビフロキサシン",
  "モキシフロキサシン",
  "ベラフロックス",
  "ST合剤",
  "クロラムフェニコール",
  "メトロニダゾール",
];


const ANTIINFLAM_LABELS = [
  "オンシオール",
  "プレビコックス",
  "ガリプラント",
  "トロコキシル",
  "パノクエル",
  "トラマドール",
  "プレガバリン",
];

const STEROID_ANTIHIST_LABELS = [
  "プレドニゾロン",
  "レダコート",
  "ゼンタコート",
  "コートリル",
  "レスタミン",
  "セチリジン",
  "ペリアクチン",
];


const GI_STOMACH_LABELS = [
  "マロピタント",
  "プリンペラン",
  "オンダンセトロン",
  "コントミン",
  "ファモチジン",
  "ランソプラゾール",
  "オメプラゾール",
  "ディクアノン",
];

const GI_INTESTINE_LABELS = [
  "モサプリド",
  "メサラジン",
  "サラゾピリン",
  "デルクリアー",
  "ディアバスター",
  "FortiFlora",
  "ブスコパン",
  "ミヤBM",
  "ゼンラーゼ",
  "マイトマックス",
  "ビオフェルミンR散剤",
  "バガス",
  "サイリウム",
  "グアーガム",
  "アドソルビン",
  "パンクレアチン",
  "ピコスルファート",
  "モビコール",
  "ワセリン軟膏",
];


const LIVER_KIDNEY_LABELS = [
  "テルミサルタン",
  "ラプロス",
  "レナジェル",
  "ネフガード",
  "セミントラ",
  "ウラリット",
  "ウルソ",
  "スパカール",
  "ピアーレシロップ",
  "リバガード",
  "SAMYLIN",
  "ウロカルン",
  "プロパリン",
  "ウエルデリ",
  "タムスロシン塩酸塩",
];


const CARDIO_LABELS = [
  "ピモベハート",
  "アピナック",
  "アムロジピン",
  "ジルチアゼム",
  "アイトロール",
  "シルデナフィル",
  "タダラフィル",
  "カルベジロール",
  "アテノロール",
  "ソタコール",
  "シロスタゾール",
  "ベラプロスト",
  "スピロノラクトン",
  "ヒドロクロロチアジド",
  "フロセミド",
  "トラセミド",
];


const RESPIRATORY_LABELS = [
  "テオロング",
  "テオフィリン",
  "ムコソルバン",
  "モンテルカスト",
  "ブトルファノール",
  "ダンプロン",
  "ブリカニール",
  "デキストロメトルファン",
  "マロピタント（鎮咳）",
  "アルベール液",
  "メプチン液",
  "セファゾリン液",
  "ボスミン液",
  "ビソルボン液",
  "ゲンタマイシン液",
  "デキサメサゾン液",
];


const NEURO_LABELS = [
  "ゾニサミド",
  "臭化カリウム",
  "ミダゾラム（鼻腔）",
  "フェノバール",
  "レベチラセタム",
  "ダイアップ坐剤",
  "エンタイス",
  "エルーラ",
  "レメロン",
  "フルオキセチン",
  "パロキセチン",
  "トラゾドン",
  "ダンドスピロン",
  "ラボナ",
  "クロミカルム",
  "ランドセン",
  "メンドン",
  "アルプラゾラム",
  "ガバペンチン",
  "アセプロマジン",
  "イソバイドシロップ",
];


const ANTIFUNGAL_LABELS = [
  "イトラコナゾール",
  "ケトコナゾール",
  "ドロンタール",
  "ドロンタールプラス",
  "プロコックス",
  "フェンベンダゾール",
  "チニダゾール",
  "ロニダゾール",
  "ドロンシット",
  "ファムシクロビル",
  "モルヌピラビル",
];

const BLOOD_LABELS = [
  "ドメナン",
  "クロピドグレル",
  "イグザレルト",
  "トラネキサム酸",
];

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
</html>`

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
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/med-linear-picker-harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(() => window.__enter("karte-seed"));
await page.click("#btn-med-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.waitForTimeout(150);

await clickItem(page, "#med-add-col-category-list", "内服薬");
await page.waitForTimeout(80);
await clickItem(page, "#med-add-col-group-list", "抗生剤");
await page.waitForTimeout(120);

const antibiotic = await itemLabels(page, "#med-add-col-leaf-list");
console.log("UI antibiotic:", antibiotic);
assert.deepEqual(antibiotic, ANTIBIOTIC_LABELS);

await clickItem(page, "#med-add-col-leaf-list", "メトロニダゾール");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "メトロニダゾール"
);

const shotDir = path.join(root, "tools/med-oral-leaf-seed");
fs.mkdirSync(shotDir, { recursive: true });
await page.screenshot({ path: path.join(shotDir, "01-antibiotic.png") });

await clickItem(page, "#med-add-col-group-list", "消炎・鎮痛");
await page.waitForTimeout(120);
const antiinflam = await itemLabels(page, "#med-add-col-leaf-list");
console.log("UI antiinflam:", antiinflam);
assert.deepEqual(antiinflam, ANTIINFLAM_LABELS);
await clickItem(page, "#med-add-col-leaf-list", "プレガバリン");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "プレガバリン"
);
await page.screenshot({ path: path.join(shotDir, "04-antiinflam.png") });

await clickItem(page, "#med-add-col-group-list", "ステロイド・抗ヒス");
await page.waitForTimeout(120);
const steroid = await itemLabels(page, "#med-add-col-leaf-list");
console.log("UI steroid-antihist:", steroid);
assert.deepEqual(steroid, STEROID_ANTIHIST_LABELS);
await clickItem(page, "#med-add-col-leaf-list", "ペリアクチン");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "ペリアクチン"
);
await page.screenshot({ path: path.join(shotDir, "05-steroid-antihist.png") });

await clickItem(page, "#med-add-col-group-list", "消化器（胃）");
await page.waitForTimeout(120);
const giStomach = await itemLabels(page, "#med-add-col-leaf-list");
console.log("UI gi stomach:", giStomach);
assert.deepEqual(giStomach, GI_STOMACH_LABELS);
await clickItem(page, "#med-add-col-leaf-list", "ディクアノン");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "ディクアノン"
);
await page.screenshot({ path: path.join(shotDir, "06-gi-stomach.png") });

await clickItem(page, "#med-add-col-group-list", "消化器（腸）");
await page.waitForTimeout(120);
const giIntestine = await itemLabels(page, "#med-add-col-leaf-list");
console.log("UI gi intestine:", giIntestine);
assert.deepEqual(giIntestine, GI_INTESTINE_LABELS);
await clickItem(page, "#med-add-col-leaf-list", "FortiFlora");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "FortiFlora"
);
await clickItem(page, "#med-add-col-leaf-list", "ワセリン軟膏");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "ワセリン軟膏"
);
await page.screenshot({ path: path.join(shotDir, "07-gi-intestine.png") });

await clickItem(page, "#med-add-col-group-list", "肝・腎・泌尿");
await page.waitForTimeout(120);
const liverKidney = await itemLabels(page, "#med-add-col-leaf-list");
console.log("UI liver-kidney:", liverKidney);
assert.deepEqual(liverKidney, LIVER_KIDNEY_LABELS);
await clickItem(page, "#med-add-col-leaf-list", "ピアーレシロップ");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "ピアーレシロップ"
);
await clickItem(page, "#med-add-col-leaf-list", "タムスロシン塩酸塩");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "タムスロシン塩酸塩"
);
await page.screenshot({ path: path.join(shotDir, "08-liver-kidney.png") });

await clickItem(page, "#med-add-col-group-list", "循環器");
await page.waitForTimeout(120);
const cardio = await itemLabels(page, "#med-add-col-leaf-list");
console.log("UI cardio:", cardio);
assert.deepEqual(cardio, CARDIO_LABELS);
await clickItem(page, "#med-add-col-leaf-list", "ピモベハート");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "ピモベハート"
);
await clickItem(page, "#med-add-col-leaf-list", "トラセミド");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "トラセミド"
);
await page.screenshot({ path: path.join(shotDir, "09-cardio.png") });

await clickItem(page, "#med-add-col-group-list", "呼吸器");
await page.waitForTimeout(120);
const respiratory = await itemLabels(page, "#med-add-col-leaf-list");
console.log("UI respiratory:", respiratory);
assert.deepEqual(respiratory, RESPIRATORY_LABELS);
assert.ok(respiratory.includes("マロピタント（鎮咳）"));
assert.ok(!respiratory.includes("マロピタント"));
await clickItem(page, "#med-add-col-leaf-list", "マロピタント（鎮咳）");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "マロピタント（鎮咳）"
);
await clickItem(page, "#med-add-col-leaf-list", "デキサメサゾン液");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "デキサメサゾン液"
);
await page.screenshot({ path: path.join(shotDir, "10-respiratory.png") });

await clickItem(page, "#med-add-col-group-list", "消化器（胃）");
await page.waitForTimeout(80);
const giAgain = await itemLabels(page, "#med-add-col-leaf-list");
assert.ok(giAgain.includes("マロピタント"));
assert.ok(!giAgain.includes("マロピタント（鎮咳）"));

await clickItem(page, "#med-add-col-group-list", "神経・行動");
await page.waitForTimeout(120);
const neuro = await itemLabels(page, "#med-add-col-leaf-list");
console.log("UI neuro:", neuro);
assert.deepEqual(neuro, NEURO_LABELS);
await clickItem(page, "#med-add-col-leaf-list", "ゾニサミド");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "ゾニサミド"
);
await clickItem(page, "#med-add-col-leaf-list", "イソバイドシロップ");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "イソバイドシロップ"
);
await page.screenshot({ path: path.join(shotDir, "11-neuro.png") });

await clickItem(page, "#med-add-col-group-list", "抗真菌・駆虫薬・抗ウイルス薬");
await page.waitForTimeout(120);
const antifungal = await itemLabels(page, "#med-add-col-leaf-list");
console.log("UI antifungal:", antifungal);
assert.deepEqual(antifungal, ANTIFUNGAL_LABELS);
assert.equal(antifungal.filter((x) => x === "ファムシクロビル").length, 1);
await clickItem(page, "#med-add-col-leaf-list", "ファムシクロビル");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "ファムシクロビル"
);
await clickItem(page, "#med-add-col-leaf-list", "モルヌピラビル");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "モルヌピラビル"
);
await page.screenshot({ path: path.join(shotDir, "12-antifungal.png") });

await clickItem(page, "#med-add-col-group-list", "抗生剤");
await page.waitForTimeout(100);
const abxAgain = await itemLabels(page, "#med-add-col-leaf-list");
assert.ok(!abxAgain.includes("ファムシクロビル"));
assert.deepEqual(abxAgain, ANTIBIOTIC_LABELS);

await clickItem(page, "#med-add-col-group-list", "血液");
await page.waitForTimeout(120);
const blood = await itemLabels(page, "#med-add-col-leaf-list");
console.log("UI blood:", blood);
assert.deepEqual(blood, BLOOD_LABELS);

await clickItem(page, "#med-add-col-leaf-list", "イグザレルト");
await page.waitForTimeout(80);
assert.equal(
  await page
    .locator("#med-add-col-leaf-list .med-linear-picker__item.is-selected .med-linear-picker__item-label")
    .textContent(),
  "イグザレルト"
);
await page.screenshot({ path: path.join(shotDir, "02-blood.png") });

await page.locator("#med-add-category-buttons .med-cat-btn", { hasText: /^A/ }).click();
await page.click("#btn-med-add-save");
await page.waitForTimeout(300);
await page.waitForFunction(() =>
  [...document.querySelectorAll(".med-card__name")].some(
    (el) => (el.dataset.name || el.getAttribute("aria-label") || "").includes("イグザレルト")
  )
);
await page.screenshot({ path: path.join(shotDir, "03-selected-saved.png") });

if (pageErrors.length) {
  console.log("ERRORS", pageErrors);
  throw new Error("page errors");
}

console.log("OK: oral leaf seed order + selectable in UI");
await browser.close();
server.close();
