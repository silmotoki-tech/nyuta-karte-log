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

function findChromeHeadlessShell() {
  if (process.env.PLAYWRIGHT_ARM_SHELL && fs.existsSync(process.env.PLAYWRIGHT_ARM_SHELL)) {
    return process.env.PLAYWRIGHT_ARM_SHELL;
  }
  const cacheRoot = path.join(os.tmpdir(), "cursor-sandbox-cache");
  if (!fs.existsSync(cacheRoot)) return null;
  for (const dir of fs.readdirSync(cacheRoot)) {
    const candidate = path.join(
      cacheRoot,
      dir,
      "playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"
    );
    if (fs.existsSync(candidate)) return candidate;
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
  throw new Error("Could not launch browser");
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function ymdOffset(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const mockDb = fs.readFileSync(path.join(__dirname, "mock-db-exam-categories.js"), "utf-8");

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>exam plan list layout</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<aside style="width:320px;margin:0 auto;background:var(--color-cream);min-height:100vh;padding:8px">
  <div id="right-tabs" class="right-tabs">
    <button type="button" class="right-tab is-active" data-tab="exam">検査</button>
  </div>
  <p id="right-empty" hidden></p>
  <div class="right-panel" id="panel-exam" data-panel="exam">
    <div class="exam-toolbar">
      <button id="btn-exam-new" class="btn btn--small btn--primary" type="button">予定を登録</button>
    </div>
    <section class="exam-section">
      <div class="exam-section__head"><h3 class="exam-section__title">検査予定一覧</h3></div>
      <p class="field__note" id="exam-plan-empty"></p>
      <ul class="exam-list" id="exam-plan-list"></ul>
    </section>
    <section class="exam-section">
      <h3 class="exam-section__title">実施履歴</h3>
      <p class="field__note" id="exam-history-empty"></p>
      <ul class="exam-list" id="exam-history-list"></ul>
    </section>
  </div>
</aside>

<div class="modal" id="exam-item-sheet" hidden>
  <button id="btn-close-exam-item-sheet" type="button"></button>
  <p id="exam-item-sheet-title"></p>
  <p id="exam-item-sheet-item"></p>
  <p id="exam-item-sheet-fasting" hidden></p>
  <div id="exam-sheet-fasting-field" hidden>
    <div id="exam-sheet-fasting-buttons" class="exam-fasting-buttons">
      <button type="button" class="exam-fasting-btn" data-fasting="required">必要</button>
      <button type="button" class="exam-fasting-btn" data-fasting="none">不要</button>
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
  <button id="btn-close-exam-plan" type="button"></button>
  <h2 id="exam-plan-modal-title"></h2>
  <div id="exam-plan-item-categories"></div>
  <div id="exam-plan-blood-nav" hidden>
    <button id="btn-exam-plan-blood-back" type="button"></button>
    <span id="exam-plan-blood-nav-label"></span>
  </div>
  <div id="exam-plan-item-buttons"></div>
  <p id="exam-plan-items-empty" hidden></p>
  <p id="exam-plan-selection-summary" hidden></p>
  <div id="exam-plan-item-add-default">
    <label id="exam-plan-new-item-label"></label>
    <input id="exam-plan-new-item" />
    <button id="btn-exam-plan-add-item" type="button"></button>
  </div>
  <p id="exam-plan-item-error" hidden></p>
  <div id="exam-plan-fasting-field" hidden>
    <div id="exam-plan-fasting-buttons" class="exam-fasting-buttons">
      <button type="button" class="exam-fasting-btn" data-fasting="required">必要</button>
      <button type="button" class="exam-fasting-btn" data-fasting="none">不要</button>
    </div>
  </div>
  <input id="exam-plan-due-date" type="date" />
  <div id="exam-plan-due-units"></div>
  <p id="exam-plan-due-display"></p>
  <div id="exam-plan-due-numpad"></div>
  <p id="exam-plan-window-note"></p>
  <input id="exam-plan-note" type="text" />
  <p id="exam-plan-error" hidden></p>
  <button id="btn-exam-plan-save" type="button"></button>
  <button id="btn-exam-plan-cancel" type="button"></button>
</div>
<div class="modal" id="exam-complete-modal" hidden>
  <button id="btn-close-exam-complete" type="button"></button>
  <input id="exam-complete-date" type="date" />
  <input id="exam-complete-note" type="text" />
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
import { saveExamScheduledPlan } from "/js/db.js";

initExamPlanUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, busyLabel, idleLabel) => { if (!btn) return; btn.disabled = busy; btn.textContent = busy ? busyLabel : idleLabel; },
});

const karte = "karte-list-layout";
const todayBaseline = ${JSON.stringify(ymdOffset(0))};
await saveExamScheduledPlan(karte, {
  item: "血液検査",
  dueDate: ${JSON.stringify(ymdOffset(30))},
  note: "術後フォローの定期検査",
  fasting: "required",
  baselineDate: todayBaseline,
});
await saveExamScheduledPlan(karte, {
  item: "胸部スク",
  dueDate: ${JSON.stringify(ymdOffset(5))},
  note: "咳が続くため再検",
  fasting: "",
  baselineDate: todayBaseline,
});
await saveExamScheduledPlan(karte, {
  item: "腹部エコー",
  dueDate: ${JSON.stringify(ymdOffset(-3))},
  note: "超過サンプル",
  fasting: "",
  baselineDate: todayBaseline,
});
enterExamPlan(karte);
window.__ready = true;
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/exam-plan-list-layout-harness.html") {
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
const page = await browser.newPage({ viewport: { width: 360, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/exam-plan-list-layout-harness.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForSelector("#exam-plan-list .exam-list-item");

const listText = await page.locator("#exam-plan-list").innerText();
console.log("LIST\n" + listText);

if (/20\d{2}\/\d{1,2}\/\d{1,2}/.test(listText)) {
  throw new Error("date should not appear in plan list");
}
if (!listText.includes("あと30日")) throw new Error("あと30日 missing");
if (!listText.includes("3日超過")) throw new Error("3日超過 missing");
if (!listText.includes("術後フォローの定期検査")) throw new Error("note missing");

const blood = page.locator("#exam-plan-list .exam-list-item").filter({ hasText: "血液検査" });
const head = blood.locator(".exam-list-item__head");
const titleBox = await head.locator(".exam-list-item__title").boundingBox();
const dueBox = await head.locator(".exam-list-item__due").boundingBox();
const noteBox = await blood.locator(".exam-list-item__note").boundingBox();
if (!titleBox || !dueBox || !noteBox) throw new Error("layout boxes missing");
if (dueBox.x <= titleBox.x) throw new Error("due should be to the right of title");
if (noteBox.y <= titleBox.y) throw new Error("note should be below title row");

const dueClass = await blood.locator(".exam-list-item__due").getAttribute("class");
if (!dueClass.includes("exam-due-text--")) throw new Error("due color class missing");

await page.screenshot({ path: path.join(root, "tools/exam-plan-list-layout.png") });

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: exam plan list layout");
await browser.close();
server.close();
