/**
 * 右カラムの「❌ 禁忌・副作用歴」カード。
 * - 未記載は「なし」で目立たない。記載があると赤系になり、縦に伸びて読める
 * - 別タブでも保存内容が見える
 * - 状態モードには出さない。列幅は変えない
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOCK_AUTH_LOGGED_IN } from "./mock-auth-email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const mockDb = fs.readFileSync(path.join(__dirname, "mock-db-status-mode.js"), "utf8");
const mockPasscode = `
export const PASSCODE_STORAGE_KEY = "nyutaKartePasscodeVerified";
export const PASSCODE_DATE_KEY = "nyutaKartePasscodeVerifiedDate";
export function todayDateStrLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate());
}
export function isPasscodeVerified() { return true; }
export function setPasscodeVerified() {}
export function clearPasscodeVerified() {}
`;
const mockApiKey = `
export function hasApiKey() { return true; }
export function getApiKey() { return "sk-ant-test-key-for-verify"; }
export function setApiKey() {}
export function clearApiKey() {}
`;
const mockFirebase = `export const app = {};`;

function findChromeHeadlessShell() {
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

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/index.html";
  const fp = path.join(root, u.replace(/^\//, ""));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(fp), "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1180, height: 900 },
  deviceScaleFactor: 2,
  serviceWorkers: "block",
});

function installRoutes(page) {
  page.on("pageerror", (err) => {
    console.warn("pageerror", String(err));
  });
  return Promise.all([
    page.route("**/js/db.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockDb })
    ),
    page.route("**/js/passcode-auth.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockPasscode })
    ),
    page.route("**/js/api-key.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockApiKey })
    ),
    page.route("**/js/firebase-app.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockFirebase })
    ),
    page.route("**/js/auth.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: MOCK_AUTH_LOGGED_IN })
    ),
  ]);
}

async function openKarte(page) {
  await installRoutes(page);
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 10000 });
  for (const d of ["0", "0", "0", "0", "1"]) {
    await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
  }
  await page.click('#karte-numpad [data-karte-action="confirm"]');
  await page.waitForSelector("#gate-animal:not([hidden])", { timeout: 10000 });
  await page.fill("#animal-name-input", "イチロウ");
  await page.click("#btn-animal-next");
  await page.waitForSelector("#center-main:not([hidden])", { timeout: 10000 });
  await page.waitForSelector("#panel-qa:not([hidden])", { timeout: 5000 });
  await page.waitForSelector("#contra-card-text", { timeout: 5000 });
}

const LONG_TEXT = [
  "NSAIDs 嘔吐（2024/5）",
  "ペニシリン系 発疹",
  "とても長い禁忌の説明です。右カラムの幅で折り返し、カードが縦に伸びて最後まで読めることを確認する文章です。",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
].join("\n");

const outDir = path.join(root, "tools/contraindication");
fs.mkdirSync(outDir, { recursive: true });

const page = await context.newPage();
await openKarte(page);
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

const order = await page.evaluate(() =>
  [...document.getElementById("panel-qa").children].map((el) => el.id)
);
assert.deepEqual(
  order,
  ["right-block-history", "right-block-contra", "right-section-search", "right-ai-fold"],
  "右カラムの並び"
);

const empty = await page.evaluate(() => {
  const card = document.getElementById("contra-card");
  const text = document.getElementById("contra-card-text");
  const meta = document.getElementById("contra-card-meta");
  const doc = document.documentElement;
  const panel = document.getElementById("panel-qa");
  const cols = [...document.querySelectorAll("#app-shell .layout > .col")].map((el) =>
    Math.round(el.getBoundingClientRect().width)
  );
  return {
    text: text.textContent,
    emptyClass: text.classList.contains("is-empty"),
    filled: card.classList.contains("is-filled"),
    metaHidden: meta.hidden,
    inStatus: Boolean(document.getElementById("screen-status")?.querySelector("#right-block-contra")),
    docOverflow: doc.scrollWidth - doc.clientWidth,
    panelOverflow: panel.scrollWidth - panel.clientWidth,
    cols,
    title: document.getElementById("contra-card-title")?.textContent || "",
  };
});
assert.equal(empty.text, "なし", "未記載が「なし」になっていない");
assert.equal(empty.emptyClass, true, "未記載の文字が薄くない");
assert.equal(empty.filled, false, "未記載なのに赤系になっている");
assert.equal(empty.metaHidden, true, "未保存なのに最終更新が出ている");
assert.equal(empty.inStatus, false, "状態モードの中に禁忌カードがある");
assert.equal(empty.title, "❌ 禁忌・副作用歴", "見出しが違う");
assert.deepEqual(empty.cols, [241, 494, 445], `列幅が変わっている: ${empty.cols}`);
assert.ok(empty.docOverflow <= 1, "未記載で横スクロールが出ている");
assert.ok(empty.panelOverflow <= 1, "未記載で右カラムが横にはみ出している");
await shot("01-empty");

await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });
assert.equal(await page.locator("#right-block-contra").isVisible(), false, "状態モードで禁忌カードが見えている");
assert.equal(
  await page.locator("#screen-status").innerText().then((t) => t.includes("禁忌・副作用歴")),
  false,
  "状態モードに禁忌カードの見出しがある"
);
await page.click("#btn-view-history");
await page.waitForSelector("#panel-qa:not([hidden])", { timeout: 5000 });

await page.click("#contra-card-view");
await page.waitForSelector("#contra-card-edit:not([hidden])", { timeout: 3000 });
assert.equal(await page.locator("#contra-card-save").isVisible(), true, "保存ボタンが無い");
assert.equal(await page.locator("#contra-card-cancel").isVisible(), true, "取り消しボタンが無い");
assert.ok((await page.locator("#contra-card-authors .author-btn").count()) >= 10, "記入者選択が無い");
await page.fill("#contra-card-input", "取り消し確認");
await page.click("#contra-card-cancel");
await page.waitForSelector("#contra-card-view:not([hidden])", { timeout: 3000 });
assert.equal(await page.locator("#contra-card-text").innerText(), "なし", "取り消し後に下書きが残っている");

await page.click("#contra-card-view");
await page.fill("#contra-card-input", LONG_TEXT);
await page.click("#contra-card-save");
const blocked = await page.locator("#contra-card-error").innerText();
assert.ok(blocked.includes("記入者"), `記入者なしで保存が止まっていない: ${blocked}`);
assert.equal(
  await page.locator("#contra-card-edit").evaluate((el) => el.hidden),
  false,
  "記入者なしなのに編集が閉じた"
);

await page.click('#contra-card-authors .author-btn[data-author="大辻"]');
await page.click("#contra-card-save");
await page.waitForSelector("#contra-card-view:not([hidden])", { timeout: 5000 });

const today = await page.evaluate(() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
});
const filled = await page.evaluate(() => {
  const card = document.getElementById("contra-card");
  const text = document.getElementById("contra-card-text");
  const title = card.querySelector(".contra-card__view .contra-card__title");
  const doc = document.documentElement;
  const panel = document.getElementById("panel-qa");
  const cols = [...document.querySelectorAll("#app-shell .layout > .col")].map((el) =>
    Math.round(el.getBoundingClientRect().width)
  );
  const titleStyle = getComputedStyle(title);
  const textStyle = getComputedStyle(text);
  return {
    text: text.innerText,
    filled: card.classList.contains("is-filled"),
    meta: document.getElementById("contra-card-meta").textContent,
    textH: text.getBoundingClientRect().height,
    cardH: card.getBoundingClientRect().height,
    textScroll: text.scrollHeight,
    textClient: text.clientHeight,
    whiteSpace: textStyle.whiteSpace,
    titleColor: titleStyle.color,
    docOverflow: doc.scrollWidth - doc.clientWidth,
    panelOverflow: panel.scrollWidth - panel.clientWidth,
    cols,
  };
});
assert.ok(filled.text.includes("NSAIDs 嘔吐（2024/5）"), "1行目が無い");
assert.ok(filled.text.includes("ペニシリン系 発疹"), "2行目が無い");
assert.ok(filled.text.includes("とても長い禁忌"), "長い文章が無い");
assert.equal(filled.filled, true, "記載があるのに赤系になっていない");
assert.equal(filled.meta, `最終更新 ${today} 大辻`, `最終更新の表示が違う: ${filled.meta}`);
assert.ok(filled.textH > 70, `カードが縦に伸びていない (textH=${filled.textH})`);
assert.ok(filled.cardH > filled.textH, "カードが本文より低い");
assert.ok(filled.textScroll <= filled.textClient + 2, "本文がカード内で切れている");
assert.equal(filled.whiteSpace, "pre-wrap", "改行が潰れている");
assert.notEqual(filled.titleColor, "rgb(107, 72, 52)", "見出しが赤系になっていない");
assert.deepEqual(filled.cols, [241, 494, 445], `保存後の列幅: ${filled.cols}`);
assert.ok(filled.docOverflow <= 1, `長い文章で横スクロール (doc=${filled.docOverflow})`);
assert.ok(filled.panelOverflow <= 1, `長い文章で右カラムが横にはみ出す (panel=${filled.panelOverflow})`);
await shot("02-filled");

const page2 = await context.newPage();
await openKarte(page2);
await page2.waitForFunction(
  () => document.getElementById("contra-card-text")?.innerText.includes("ペニシリン系"),
  null,
  { timeout: 5000 }
);
const other = await page2.locator("#contra-card-text").innerText();
assert.ok(other.includes("NSAIDs 嘔吐（2024/5）"), "別タブに保存内容が出ていない");
assert.equal(
  await page2.locator("#contra-card-meta").innerText(),
  `最終更新 ${today} 大辻`,
  "別タブの最終更新が違う"
);
await page2.screenshot({ path: path.join(outDir, "03-other-tab.png") });

await page2.click("#contra-card-view");
await page2.fill("#contra-card-input", "   ");
await page2.click('#contra-card-authors .author-btn[data-author="大辻"]');
await page2.click("#contra-card-save");
await page.waitForFunction(
  () => document.getElementById("contra-card-text")?.textContent === "なし",
  null,
  { timeout: 5000 }
);
const cleared = await page.evaluate(() => ({
  text: document.getElementById("contra-card-text").textContent,
  filled: document.getElementById("contra-card").classList.contains("is-filled"),
  meta: document.getElementById("contra-card-meta").textContent,
}));
assert.equal(cleared.text, "なし", "空保存後も本文が残っている");
assert.equal(cleared.filled, false, "空保存後も赤系のまま");
assert.ok(cleared.meta.startsWith(`最終更新 ${today}`), `空保存後の最終更新が無い: ${cleared.meta}`);
await shot("04-cleared");

await browser.close();
await new Promise((r) => server.close(r));
console.log("OK: 禁忌・副作用歴カードを確認");
