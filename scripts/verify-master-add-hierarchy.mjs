/**
 * 検査／薬剤マスタの「その場追加」が、開いている階層（category+parentId）に
 * 正しく紐づくことを検証する。
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
<title>exam add hierarchy</title>
<link rel="stylesheet" href="/css/style.css" />
</head><body>
<aside style="max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <button id="btn-exam-new" class="btn btn--small btn--primary" type="button">予定を登録</button>
  <ul class="exam-list" id="exam-plan-list"></ul>
  <p id="exam-plan-empty"></p>
  <ul class="exam-list" id="exam-history-list"></ul>
  <p id="exam-history-empty"></p>
</aside>
<div class="modal" id="exam-item-sheet" hidden>
  <button id="btn-close-exam-item-sheet" type="button"></button>
  <p id="exam-item-sheet-title"></p><p id="exam-item-sheet-item"></p>
  <p id="exam-item-sheet-fasting" hidden></p>
  <div id="exam-sheet-fasting-field" hidden><div id="exam-sheet-fasting-buttons"></div></div>
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
            <div class="med-linear-picker__list" id="exam-plan-col-category-list"></div>
          </div>
          <div class="med-linear-picker__col" id="exam-plan-col-group">
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-group-list"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="exam-plan-col-leaf">
            <div class="med-linear-picker__head">検査項目</div>
            <div class="med-linear-picker__list" id="exam-plan-col-leaf-list"></div>
            <p id="exam-plan-items-empty" hidden></p>
            <div class="exam-item-add" id="exam-plan-item-add-default">
              <label id="exam-plan-new-item-label" for="exam-plan-new-item">新しい項目を追加</label>
              <div class="exam-item-add__row">
                <input id="exam-plan-new-item" class="input" type="text" />
                <button id="btn-exam-plan-add-item" class="btn btn--small btn--outline" type="button">追加</button>
              </div>
            </div>
          </div>
        </div>
        <p id="exam-plan-selection-summary" hidden></p>
        <p id="exam-plan-item-error" class="error-text" hidden></p>
      </div>
      <div class="field" id="exam-plan-fasting-field" hidden>
        <div id="exam-plan-fasting-buttons"></div>
      </div>
      <input id="exam-plan-due-date" type="date" />
      <div id="exam-plan-due-units"></div><p id="exam-plan-due-display"></p>
      <div id="exam-plan-due-numpad"></div><p id="exam-plan-window-note"></p>
      <input id="exam-plan-note" type="text" />
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
import { subscribeExamItems } from "/js/db.js";
let latest = [];
subscribeExamItems((items) => { latest = items; });
initExamPlanUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
});
enterExamPlan("karte-add-hier");
window.__examItems = () => latest.map((x) => ({ ...x }));
window.__ready = true;
</script>
</body></html>`;

const medHarness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>med add hierarchy</title>
<link rel="stylesheet" href="/css/style.css" />
</head><body>
<aside style="max-width:420px;margin:0 auto;background:var(--color-cream);min-height:100vh">
  <button id="btn-med-add" class="btn btn--small btn--primary" type="button">薬剤を追加</button>
  <ul class="meds-list" id="meds-list"></ul>
  <p id="meds-empty"></p>
</aside>
<div class="modal" id="med-detail-sheet" hidden>
  <button id="btn-close-med-detail-sheet" type="button"></button>
  <p id="med-detail-sheet-name"></p><p id="med-detail-sheet-status"></p>
  <div id="med-detail-sheet-body"></div>
  <button id="btn-med-detail-sheet-close" type="button"></button>
</div>
<div class="modal" id="med-add-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title">薬剤を追加</h2>
      <button class="modal__close" id="btn-close-med-add" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <div class="med-linear-picker" id="med-add-linear-picker">
          <div class="med-linear-picker__col" id="med-add-col-category">
            <div class="med-linear-picker__head">大項目</div>
            <div class="med-linear-picker__list" id="med-add-col-category-list"></div>
          </div>
          <div class="med-linear-picker__col" id="med-add-col-group">
            <div class="med-linear-picker__head">中項目</div>
            <div class="med-linear-picker__list" id="med-add-col-group-list"></div>
          </div>
          <div class="med-linear-picker__col med-linear-picker__col--leaf" id="med-add-col-leaf">
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
      <div class="med-category-buttons" id="med-add-category-buttons"></div>
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
        <input id="med-add-freq-other-input" type="text" />
      </div>
      <p id="med-add-error" hidden></p>
      <button id="btn-med-add-save" type="button">追加する</button>
      <button id="btn-med-add-cancel" type="button">キャンセル</button>
    </div>
  </div>
</div>
<div class="modal" id="med-event-modal" hidden>
  <button id="btn-close-med-event" type="button"></button>
  <h2 id="med-event-modal-title"></h2>
  <div id="med-event-type-buttons"></div>
  <input id="med-event-date" type="date" />
  <div id="med-event-change-options" hidden>
    <input type="checkbox" id="med-event-freq-check" />
    <div id="med-event-freq-block" hidden>
      <div id="med-event-freq-modes"></div>
      <div id="med-event-freq-detail" hidden>
        <div id="med-event-freq-detail-head"></div>
        <div id="med-event-freq-panel-preset"><div id="med-event-freq-presets"></div></div>
        <div id="med-event-freq-panel-every-n" hidden>
          <div id="med-event-freq-every-n-presets"></div>
          <div id="med-event-freq-every-n-other" hidden>
            <button type="button" id="med-event-freq-period"></button>
            <button type="button" id="med-event-freq-times"></button>
            <div id="med-event-freq-every-n-numpad"></div>
          </div>
        </div>
        <div id="med-event-freq-panel-weekly" hidden>
          <div id="med-event-freq-weekly-presets"></div>
        </div>
        <div id="med-event-freq-panel-weekdays" hidden><div id="med-event-freq-weekdays"></div></div>
        <div id="med-event-freq-panel-other" hidden>
          <input id="med-event-freq-other-input" type="text" />
        </div>
      </div>
    </div>
    <input type="checkbox" id="med-event-amount-check" />
    <div id="med-event-amount-block" hidden>
      <div id="med-event-amount-presets"></div>
      <input type="checkbox" id="med-event-amount-other" />
      <input id="med-event-amount-other-input" type="text" hidden />
    </div>
  </div>
  <textarea id="med-event-detail"></textarea>
  <p id="med-event-error" hidden></p>
  <button id="btn-med-event-save" type="button"></button>
  <button id="btn-med-event-cancel" type="button"></button>
</div>
<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";
import { subscribeMedicationItems } from "/js/db.js";
let latest = [];
subscribeMedicationItems((items) => { latest = items; });
initMedsUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
  getSelectedAuthor: () => "院長",
});
enterMeds("karte-med-add-hier");
window.__medItems = () => latest.map((x) => ({ ...x }));
window.__ready = true;
</script>
</body></html>`;

async function clickItem(page, listSel, label) {
  const items = page.locator(`${listSel} .med-linear-picker__item`);
  const count = await items.count();
  for (let i = 0; i < count; i += 1) {
    const text = await items
      .nth(i)
      .locator(".med-linear-picker__item-label")
      .innerText();
    if (text.trim() === label) {
      await items.nth(i).click({ force: true });
      return;
    }
  }
  throw new Error(`item not found in ${listSel}: ${label}`);
}

async function addLeaf(page, inputSel, btnSel, label) {
  await page.fill(inputSel, label);
  await page.locator(btnSel).evaluate((el) => el.click());
  await page.waitForTimeout(120);
}

async function leafLabels(page, listSel) {
  return page.locator(`${listSel} .med-linear-picker__item-label`).allTextContents();
}

function assertItem(items, label, { category, parentId }) {
  const matches = items.filter((i) => (i.label || "") === label && i.kind !== "group");
  const hit = matches.find(
    (i) =>
      i.category === category &&
      String(i.parentId || "") === String(parentId || "")
  );
  if (!hit) {
    throw new Error(
      `item "${label}" not at ${category}/${parentId || "(root)"}; found=${JSON.stringify(matches)}`
    );
  }
  return hit;
}

const server = http.createServer((req, res) => {
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

// ---------- 検査 ----------
{
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: examMock })
  );
  await page.goto(`${base}/exam.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.click("#btn-exam-new");
  await page.waitForSelector("#exam-plan-modal:not([hidden])");

  // 血液 → 肝臓 に追加
  await clickItem(page, "#exam-plan-col-category-list", "血液");
  await clickItem(page, "#exam-plan-col-group-list", "肝臓");
  await addLeaf(page, "#exam-plan-new-item", "#btn-exam-plan-add-item", "検証ALT肝");
  let leaves = await leafLabels(page, "#exam-plan-col-leaf-list");
  if (!leaves.includes("検証ALT肝")) throw new Error("liver UI missing 検証ALT肝");
  await page.screenshot({
    path: path.join(root, "tools/master-add-exam-liver.png"),
  });

  // 腎臓へ切替 → 肝臓追加分は出ない。同名でも腎臓に新規追加できる（旧バグは肝臓側へジャンプ）
  await clickItem(page, "#exam-plan-col-group-list", "腎臓");
  await page.waitForTimeout(80);
  leaves = await leafLabels(page, "#exam-plan-col-leaf-list");
  if (leaves.includes("検証ALT肝")) throw new Error("liver item leaked into kidney");
  await addLeaf(page, "#exam-plan-new-item", "#btn-exam-plan-add-item", "検証ALT肝");
  leaves = await leafLabels(page, "#exam-plan-col-leaf-list");
  if (!leaves.includes("検証ALT肝")) throw new Error("kidney same-name add failed");
  await page.screenshot({
    path: path.join(root, "tools/master-add-exam-kidney.png"),
  });

  // 画像 → 心エコー
  await clickItem(page, "#exam-plan-col-category-list", "画像");
  await clickItem(page, "#exam-plan-col-group-list", "心エコー");
  await addLeaf(
    page,
    "#exam-plan-new-item",
    "#btn-exam-plan-add-item",
    "検証心エコー追加"
  );
  leaves = await leafLabels(page, "#exam-plan-col-leaf-list");
  if (!leaves.includes("検証心エコー追加")) throw new Error("echo add missing in UI");
  await clickItem(page, "#exam-plan-col-group-list", "レントゲン");
  await page.waitForTimeout(80);
  leaves = await leafLabels(page, "#exam-plan-col-leaf-list");
  if (leaves.includes("検証心エコー追加")) {
    throw new Error("echo item leaked into xray");
  }
  await page.screenshot({
    path: path.join(root, "tools/master-add-exam-echo.png"),
  });

  // 病理（中項目なし）直下
  await clickItem(page, "#exam-plan-col-category-list", "病理");
  await page.waitForTimeout(80);
  await addLeaf(
    page,
    "#exam-plan-new-item",
    "#btn-exam-plan-add-item",
    "検証病理項目"
  );
  leaves = await leafLabels(page, "#exam-plan-col-leaf-list");
  if (!leaves.includes("検証病理項目")) throw new Error("pathology add missing");
  await page.screenshot({
    path: path.join(root, "tools/master-add-exam-pathology.png"),
  });

  const examItems = await page.evaluate(() => window.__examItems());
  const liverId = examItems.find(
    (i) => i.label === "肝臓" && i.kind === "group"
  )?.id;
  const kidneyId = examItems.find(
    (i) => i.label === "腎臓" && i.kind === "group"
  )?.id;
  const heartEchoId = examItems.find(
    (i) => i.label === "心エコー" && i.kind === "group"
  )?.id;
  assertItem(examItems, "検証ALT肝", {
    category: "blood",
    parentId: liverId,
  });
  // 同名が腎臓にも別レコードで存在
  const kidneyDup = examItems.filter(
    (i) => i.label === "検証ALT肝" && i.parentId === kidneyId
  );
  if (kidneyDup.length !== 1) {
    throw new Error(`expected 1 kidney dup, got ${kidneyDup.length}`);
  }
  assertItem(examItems, "検証心エコー追加", {
    category: "imaging",
    parentId: heartEchoId,
  });
  assertItem(examItems, "検証病理項目", { category: "pathology", parentId: "" });
  console.log("exam hierarchy add OK", {
    liverId,
    kidneyId,
    heartEchoId,
  });
  if (errors.length) throw new Error("exam page errors: " + errors.join("; "));
  await page.close();
}

// ---------- 薬剤 ----------
{
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/js/db.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: medMock })
  );
  await page.goto(`${base}/med.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.click("#btn-med-add");
  await page.waitForSelector("#med-add-modal:not([hidden])");

  // 内服 → 抗生剤
  await clickItem(page, "#med-add-col-category-list", "内服薬");
  await clickItem(page, "#med-add-col-group-list", "抗生剤");
  await addLeaf(
    page,
    "#med-add-new-item",
    "#btn-med-add-new-item",
    "検証セファレキシン"
  );
  let leaves = await leafLabels(page, "#med-add-col-leaf-list");
  if (!leaves.includes("検証セファレキシン")) {
    throw new Error("oral/antibiotics add missing");
  }
  await page.screenshot({
    path: path.join(root, "tools/master-add-med-oral.png"),
  });

  // 同名を「その他」へも追加できること
  await clickItem(page, "#med-add-col-group-list", "その他");
  await page.waitForTimeout(80);
  leaves = await leafLabels(page, "#med-add-col-leaf-list");
  if (leaves.includes("検証セファレキシン")) {
    throw new Error("antibiotics item leaked into その他");
  }
  await addLeaf(
    page,
    "#med-add-new-item",
    "#btn-med-add-new-item",
    "検証セファレキシン"
  );
  leaves = await leafLabels(page, "#med-add-col-leaf-list");
  if (!leaves.includes("検証セファレキシン")) {
    throw new Error("oral/other same-name add failed");
  }

  // 外用 → 皮膚
  await clickItem(page, "#med-add-col-category-list", "外用薬");
  await clickItem(page, "#med-add-col-group-list", "皮膚");
  await addLeaf(page, "#med-add-new-item", "#btn-med-add-new-item", "検証皮膚薬");
  leaves = await leafLabels(page, "#med-add-col-leaf-list");
  if (!leaves.includes("検証皮膚薬")) throw new Error("topical/skin add missing");
  await page.screenshot({
    path: path.join(root, "tools/master-add-med-topical.png"),
  });

  // 点眼（中項目なし）直下
  await clickItem(page, "#med-add-col-category-list", "点眼薬");
  await page.waitForTimeout(80);
  await addLeaf(page, "#med-add-new-item", "#btn-med-add-new-item", "検証点眼薬");
  leaves = await leafLabels(page, "#med-add-col-leaf-list");
  if (!leaves.includes("検証点眼薬")) throw new Error("eye add missing");
  await page.screenshot({
    path: path.join(root, "tools/master-add-med-eye.png"),
  });

  const medItems = await page.evaluate(() => window.__medItems());
  const abId = medItems.find(
    (i) => i.label === "抗生剤" && i.kind === "group" && i.category === "oral"
  )?.id;
  const otherId = medItems.find(
    (i) => i.label === "その他" && i.kind === "group" && i.category === "oral"
  )?.id;
  const skinId = medItems.find(
    (i) => i.label === "皮膚" && i.kind === "group" && i.category === "topical"
  )?.id;
  assertItem(medItems, "検証セファレキシン", {
    category: "oral",
    parentId: abId,
  });
  const otherDup = medItems.filter(
    (i) => i.label === "検証セファレキシン" && i.parentId === otherId
  );
  if (otherDup.length !== 1) {
    throw new Error(`expected 1 oral/other dup, got ${otherDup.length}`);
  }
  assertItem(medItems, "検証皮膚薬", { category: "topical", parentId: skinId });
  assertItem(medItems, "検証点眼薬", { category: "eye", parentId: "" });
  console.log("med hierarchy add OK", { abId, otherId, skinId });
  if (errors.length) throw new Error("med page errors: " + errors.join("; "));
  await page.close();
}

console.log("OK: master add respects open hierarchy for exam + med");
await browser.close();
server.close();
