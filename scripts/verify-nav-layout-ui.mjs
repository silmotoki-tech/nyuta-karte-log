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

const mockApiKey = `
let key = "";
export function hasApiKey() { return Boolean(key); }
export function getApiKey() { return key; }
export function setApiKey(v) { key = String(v || "").trim(); if (!key) throw new Error("empty"); }
export function clearApiKey() { key = ""; }
`;

const mockAppVersion = `
export const APP_VERSION = "1.9.21";
export const CACHE_LABEL = "v64";
`;

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>nav layout harness</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<div id="screen-lock" class="lock-screen" aria-label="パスコード入力">
  <div class="lock-screen__inner">
    <h1 class="lock-screen__brand">にゅうたカルテ記録</h1>
    <div class="card lock-screen__card">
      <h2 class="card__title">パスコードを入力してください</h2>
      <input id="passcode-input" class="input input--large input--center" type="password" />
      <p id="passcode-error" class="error-text" hidden></p>
      <div class="lock-api-key-row">
        <button id="btn-lock-api-key-settings" class="btn btn--small btn--outline lock-api-key-row__btn" type="button">APIキー設定</button>
        <span id="lock-api-key-status" class="settings-status is-empty">未設定</span>
      </div>
      <button id="btn-passcode-next" class="btn btn--primary btn--block" type="button">確認する</button>
    </div>
  </div>
</div>

<div id="app-shell" class="app" hidden>
  <div class="layout" style="display:flex;min-height:100vh">
    <aside class="col col--left" id="col-left" style="width:240px;padding:10px;background:var(--color-cream)">
      <div class="col-left__inner" id="col-left-inner">
        <button id="btn-change-karte" class="left-patient" type="button" title="カルテを変更" aria-label="カルテを変更">
          <span class="left-patient__back" aria-hidden="true">⬅</span>
          <span class="left-patient__meta">
            <span class="left-patient__karte" id="left-patient-karte">00001</span>
            <span class="left-patient__name" id="left-patient-name">イチロウちゃん</span>
          </span>
        </button>
        <div class="left-head"><h2 class="col__title">見出し</h2></div>
        <ul class="headline-list" id="headline-list"></ul>
      </div>
    </aside>
    <section class="col col--center" id="col-center" style="flex:1">
      <div class="center-main" id="center-main">
        <div class="center-toolbar">
          <button id="btn-start-compose" class="btn btn--small btn--primary" type="button">新しく記録を追加</button>
          <button id="btn-open-templates" class="btn btn--small btn--outline" type="button">定型文の管理</button>
          <div class="center-toolbar__end">
            <div class="app-menu" id="app-menu">
              <button id="btn-app-menu" class="btn btn--small btn--outline app-menu__trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="app-menu-panel" title="設定">
                <span class="app-menu__icon" aria-hidden="true">⚙</span>
                <span class="visually-hidden">設定</span>
              </button>
              <div id="app-menu-panel" class="app-menu__panel" role="menu" hidden>
                <button type="button" class="app-menu__item" role="menuitem" data-app-menu-action="logout">ログアウト</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>

<div class="modal" id="settings-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--sm">
    <div class="modal__header">
      <h2 class="modal__title" id="settings-modal-title">設定</h2>
      <button class="modal__close" id="btn-close-settings" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <section class="settings-section">
        <h3 class="settings-section__title">Anthropic APIキー</h3>
        <div class="settings-status-row">
          <span class="label">状態</span>
          <span id="settings-api-key-status" class="settings-status is-empty">未設定</span>
        </div>
        <button id="btn-settings-scan-qr" type="button">QR</button>
        <button id="btn-settings-delete-key" type="button" disabled>削除</button>
        <div id="settings-qr-section" hidden>
          <div id="settings-qr-reader"></div>
          <button id="btn-settings-stop-scan" type="button" hidden>やめる</button>
        </div>
        <p id="settings-error" class="error-text" hidden></p>
      </section>
      <section class="settings-section settings-section--version">
        <p class="settings-version" id="settings-app-version">バージョン —</p>
      </section>
    </div>
  </div>
</div>
<p id="toast" hidden></p>

<script type="module">
import { initSettingsUI, openSettings, refreshApiKeyStatus } from "/js/settings-ui.js";
import { setApiKey, clearApiKey } from "/js/api-key.js";

let loggedOut = false;
initSettingsUI({
  showToast: (m) => { const t = document.getElementById("toast"); t.hidden = !m; t.textContent = m || ""; },
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  onApiKeyChange: () => refreshApiKeyStatus(),
  onLogout: () => { loggedOut = true; document.getElementById("screen-lock").hidden = false; document.getElementById("app-shell").hidden = true; },
});

window.__setKey = (v) => { if (v) setApiKey(v); else clearApiKey(); refreshApiKeyStatus(); };
window.__showApp = () => {
  document.getElementById("screen-lock").hidden = true;
  document.getElementById("app-shell").hidden = false;
};
window.__loggedOut = () => loggedOut;
window.__openSettings = openSettings;
window.__ready = true;
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/tools/nav-layout-harness.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  if (urlPath === "/js/api-key.js") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(mockApiKey);
    return;
  }
  if (urlPath === "/js/app-version.js") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(mockAppVersion);
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
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/tools/nav-layout-harness.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);

// 1) パスコード画面: APIキー設定 + 未設定
const lockStatus = await page.locator("#lock-api-key-status").innerText();
if (lockStatus !== "未設定") throw new Error(`lock status should be 未設定, got ${lockStatus}`);
if (await page.locator("#btn-open-settings").count()) throw new Error("old settings button still present");
await page.screenshot({ path: path.join(root, "tools/nav-lock-api-key.png") });

await page.click("#btn-lock-api-key-settings");
await page.waitForSelector("#settings-modal:not([hidden])");
const settingsTitle = await page.locator("#settings-modal-title").innerText();
if (settingsTitle !== "設定") throw new Error("settings modal did not open");
if (await page.locator("#btn-settings-logout").count()) {
  throw new Error("logout should not be in settings modal anymore");
}
await page.screenshot({ path: path.join(root, "tools/nav-lock-settings-modal.png") });
await page.click("#btn-close-settings");
await page.waitForSelector("#settings-modal[hidden]", { state: "attached" });

await page.evaluate(() => window.__setKey("sk-ant-test-key-xxxxxxxx"));
const lockReady = await page.locator("#lock-api-key-status").innerText();
if (lockReady !== "設定済み") throw new Error("lock status should be 設定済み");

// 2) 中央ツールバーの歯車メニュー → ログアウト
await page.evaluate(() => window.__showApp());
await page.waitForSelector("#app-shell:not([hidden])");
const gear = page.locator("#btn-app-menu");
if (!(await gear.isVisible())) throw new Error("gear button missing");
await page.screenshot({ path: path.join(root, "tools/nav-center-gear.png") });

await gear.click();
await page.waitForSelector("#app-menu-panel:not([hidden])");
const menuText = await page.locator("#app-menu-panel").innerText();
if (!menuText.includes("ログアウト")) throw new Error("logout menu item missing");
await page.screenshot({ path: path.join(root, "tools/nav-app-menu.png") });

page.once("dialog", (d) => d.accept());
await page.locator('[data-app-menu-action="logout"]').click();
await page.waitForFunction(() => window.__loggedOut() === true);
if (!(await page.isVisible("#screen-lock"))) throw new Error("should return to lock screen");

// 3) 左カラム最上部: ⬅ + カルテ番号 / 動物名
await page.evaluate(() => window.__showApp());
const changeBtn = page.locator("#btn-change-karte");
const backText = await page.locator(".left-patient__back").innerText();
const karteText = await page.locator("#left-patient-karte").innerText();
const nameText = await page.locator("#left-patient-name").innerText();
if (!backText.includes("⬅")) throw new Error("back arrow missing");
if (karteText !== "00001") throw new Error(`karte number wrong: ${karteText}`);
if (nameText !== "イチロウちゃん") throw new Error(`name wrong: ${nameText}`);
if (/No\./.test(await changeBtn.innerText())) throw new Error("No. should not appear");
const backBox = await page.locator(".left-patient__back").boundingBox();
const karteBox = await page.locator("#left-patient-karte").boundingBox();
const nameBox = await page.locator("#left-patient-name").boundingBox();
if (!backBox || !karteBox || !nameBox) throw new Error("patient layout boxes missing");
if (backBox.x >= karteBox.x) throw new Error("arrow should be left of karte number");
if (karteBox.y >= nameBox.y) throw new Error("karte number should be above animal name");
await page.screenshot({
  path: path.join(root, "tools/nav-left-patient.png"),
  clip: { x: 0, y: 0, width: 260, height: 220 },
});
await page.screenshot({ path: path.join(root, "tools/nav-left-change-karte.png") });

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: lock API key / gear logout / left change-karte");
await browser.close();
server.close();
