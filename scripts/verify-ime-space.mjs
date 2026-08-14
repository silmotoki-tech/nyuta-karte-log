/**
 * IME Space 干渉の検証。
 * 防ぎたい不具合は「日本語変換中の Space が横取りされ、変換に使えない／別の操作が動く」こと。
 * Space ハンドラの有無ではなく、IME が動きうる場所で Space が奪われないことを見る。
 *
 * 1) Space を見る keydown は、IME ガード付きか IME が動かないコントロール上に限られること
 * 2) 画面全体のキーショートカット（js/app.js）が入力欄・IME 中は素通りすること
 * 3) 実 DOM で、変換中の Space / Enter が preventDefault されず操作も誤発火しないこと
 * 4) 実 IME を使った確認は環境を触るため VERIFY_REAL_IME=1 のときだけ試す
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outShot = path.join(root, "tools/ime-space-verify.png");

/** 変換（composition）が起きない入力型。ここでの Space 割り当ては IME と競合しない。 */
const NON_COMPOSING_INPUT_TYPES = new Set([
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
]);
const IME_GUARDS = ["isImeKey", "canHandleShortcut"];

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

async function launchBrowser({ headed = false } = {}) {
  const candidates = [
    headed ? SYSTEM_CHROME : null,
    findChromeHeadlessShell(),
    fs.existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : null,
  ].filter(Boolean);
  for (const executablePath of candidates) {
    try {
      return await chromium.launch({
        executablePath,
        headless: !headed,
        timeout: 30_000,
      });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  throw new Error("Could not launch browser");
}

// --- ソース走査ヘルパ -------------------------------------------------------

function skipString(src, i) {
  const quote = src[i];
  for (let j = i + 1; j < src.length; j += 1) {
    if (src[j] === "\\") {
      j += 1;
      continue;
    }
    if (src[j] === quote) return j;
  }
  return src.length - 1;
}

/** open の位置の "(" に対応する ")" の次の位置を返す。文字列とコメントは読み飛ばす。 */
function matchParen(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i);
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      if (nl < 0) return src.length;
      i = nl;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i);
      if (close < 0) return src.length;
      i = close + 1;
      continue;
    }
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

/** ファイル内のキーボードイベント購読を、対象要素と本文の範囲つきで列挙する。 */
function findKeyHandlerSites(src) {
  const sites = [];
  const re = /\.addEventListener\(\s*(["'])(keydown|keyup|keypress)\1/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.indexOf("(", m.index);
    const end = matchParen(src, open);
    const target = src.slice(0, m.index).match(/([A-Za-z_$][\w$]*)\s*\??$/)?.[1] || null;
    sites.push({ target, event: m[2], start: open, end, line: lineOf(src, m.index) });
  }
  return sites;
}

function resolveElementId(src, varName) {
  if (!varName) return null;
  const re = new RegExp(
    `\\b${varName}\\s*=\\s*document\\.getElementById\\(\\s*["']([^"']+)["']`
  );
  return src.match(re)?.[1] || null;
}

function inputTypeOf(html, id) {
  const tag = html.match(new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i"))?.[0];
  if (!tag) return null;
  return tag.match(/\btype=["']([^"']+)["']/i)?.[1]?.toLowerCase() || "text";
}

// --- 1) Space ハンドラの棚卸し ---------------------------------------------

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const jsFiles = fs
  .readdirSync(path.join(root, "js"))
  .filter((f) => f.endsWith(".js"))
  .sort();

const spaceHandlers = [];
for (const rel of jsFiles) {
  const src = fs.readFileSync(path.join(root, "js", rel), "utf8");
  const sites = findKeyHandlerSites(src);
  const spaceRe = /key\s*===\s*(?:" "|' '|"Space"|'Space')/g;
  let m;
  while ((m = spaceRe.exec(src))) {
    const site = sites.find((s) => m.index >= s.start && m.index < s.end);
    const body = site ? src.slice(site.start, site.end) : null;
    const elementId = site ? resolveElementId(src, site.target) : null;
    const inputType = elementId ? inputTypeOf(indexHtml, elementId) : null;
    spaceHandlers.push({
      file: `js/${rel}`,
      line: lineOf(src, m.index),
      target: site?.target ?? null,
      elementId,
      inputType,
      guarded: Boolean(body && IME_GUARDS.some((g) => body.includes(g))),
      nonComposingControl: Boolean(inputType && NON_COMPOSING_INPUT_TYPES.has(inputType)),
      classified: Boolean(site),
    });
  }
}

console.log("SPACE_HANDLERS", JSON.stringify(spaceHandlers, null, 2));

for (const h of spaceHandlers) {
  if (!h.classified) {
    throw new Error(
      `Space handler at ${h.file}:${h.line} could not be tied to a keyboard listener; review it by hand`
    );
  }
  if (h.guarded || h.nonComposingControl) continue;
  throw new Error(
    `Space handler at ${h.file}:${h.line} (target=${h.target}, type=${h.inputType}) is neither IME-guarded nor on a non-composing control`
  );
}
console.log(
  `OK: ${spaceHandlers.length} Space handler(s) are all IME-safe`
);

// --- 2) 画面全体のショートカットが IME・入力欄で止まること -------------------

{
  const appSrc = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  const site = findKeyHandlerSites(appSrc).find(
    (s) => s.target === "document" && s.event === "keydown"
  );
  if (!site) throw new Error("document-level keydown handler not found in js/app.js");
  const body = appSrc.slice(site.start, site.end);
  if (!body.includes("isImeKey")) {
    throw new Error("js/app.js document keydown does not bail out on IME keys");
  }
  if (!/isEditableTextTarget|isEditableTarget|canHandleShortcut/.test(body)) {
    throw new Error("js/app.js document keydown does not bail out on text inputs");
  }
  console.log("OK: js/app.js global shortcut skips IME and text inputs");
}

// --- 3) 実 DOM での挙動 -----------------------------------------------------

const pageHtml = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8" />
<link rel="stylesheet" href="/css/style.css" />
<title>IME Space verify</title>
<style>
  body { margin: 24px; background: var(--color-cream); font-family: sans-serif; }
  .wrap { max-width: 640px; }
  .banner { font-weight: 700; margin-bottom: 8px; }
  textarea { width: 100%; min-height: 140px; }
  .side { margin-top: 16px; }
</style>
</head><body>
<div class="wrap">
  <div class="banner" id="banner">IME Space verify</div>
  <label class="label" for="body-input">本文</label>
  <textarea id="body-input" class="textarea" rows="6" placeholder="ここに日本語を入力"></textarea>
  <label class="label" for="due-date">予定日</label>
  <input id="due-date" class="input input--date" type="date" />
  <ul class="side" id="cards"></ul>
</div>
<script type="module">
import { enableRowGestures } from "/js/row-gestures.js";
import { canHandleShortcut, isImeKey, isEditableTarget } from "/js/ime-keys.js";

// 一覧行の開閉は Enter だけ。Space は IME に渡す。
const li = document.createElement("li");
li.className = "med-card";
const header = document.createElement("div");
header.className = "med-card__header";
header.setAttribute("role", "button");
header.tabIndex = 0;
header.textContent = "薬剤カード（Spaceでは開かない）";
header.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (!canHandleShortcut(e)) return;
  e.preventDefault();
  header.dataset.opened = "1";
  header.textContent = "opened-by-enter";
});
li.appendChild(header);
enableRowGestures(li, { actions: [{ action: "delete", title: "削除", onClick: () => {} }] });
document.getElementById("cards").appendChild(li);

// js/exam-plan-ui.js と同じ形。日付入力では Space もカレンダーを開く操作に使う。
const due = document.getElementById("due-date");
due.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    due.dataset.picker = "opened";
  }
});

// js/app.js の画面全体ショートカットと同じガード形。
// 本体が拾うのは数字だけで、Space はどこでも奪わない。
document.addEventListener("keydown", (e) => {
  if (isEditableTarget(e.target)) return;
  if (isImeKey(e)) return;
  if (!/^[0-9]$/.test(e.key)) return;
  e.preventDefault();
  document.body.dataset.globalShortcut = "fired";
});

window.__isImeKey = isImeKey;
window.__canHandleShortcut = canHandleShortcut;
</script>
</body></html>`;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url.split("?")[0];
      if (url === "/" || url === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(pageHtml);
        return;
      }
      const filePath = path.join(root, decodeURIComponent(url));
      if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(filePath);
      const type =
        ext === ".css"
          ? "text/css"
          : ext === ".js"
            ? "text/javascript"
            : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(fs.readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const server = await startServer();
const { port } = server.address();
const url = `http://127.0.0.1:${port}/`;

{
  const browser = await launchBrowser({ headed: false });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".med-card__header");

  const sim = await page.evaluate(() => {
    const fire = (el, key, { composing = false } = {}) => {
      const ev = new KeyboardEvent("keydown", {
        key,
        code: key === " " ? "Space" : key,
        bubbles: true,
        cancelable: true,
      });
      if (composing) {
        Object.defineProperty(ev, "isComposing", { get: () => true });
        Object.defineProperty(ev, "keyCode", { get: () => 229 });
      }
      el.dispatchEvent(ev);
      return ev;
    };

    const body = document.getElementById("body-input");
    const header = document.querySelector(".med-card__header");
    const due = document.getElementById("due-date");

    body.focus();
    body.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    const composingSpace = fire(body, " ", { composing: true });
    const composingEnter = fire(body, "Enter", { composing: true });
    // ショートカットは数字なので、変換中に数字が来ても動かないことを見る
    fire(body, "1", { composing: true });
    const composingSpaceShortcut = document.body.dataset.globalShortcut || "";
    body.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));

    // 入力欄フォーカス中は、変換していなくてもショートカットを動かさない。
    const plainSpaceInField = fire(body, " ");
    fire(body, "1");
    const afterFieldShortcut = document.body.dataset.globalShortcut || "";
    body.blur();

    header.focus();
    const headerSpace = fire(header, " ");
    const headerEnterComposing = fire(header, "Enter", { composing: true });
    const openedBeforeEnter = header.dataset.opened === "1";
    const headerEnter = fire(header, "Enter");
    const openedAfterEnter = header.dataset.opened === "1";
    header.blur();

    due.focus();
    const dueSpace = fire(due, " ");
    const duePickerOpened = due.dataset.picker === "opened";

    return {
      composingSpacePrevented: composingSpace.defaultPrevented,
      composingEnterPrevented: composingEnter.defaultPrevented,
      globalShortcutDuringComposition: composingSpaceShortcut,
      plainSpaceInFieldPrevented: plainSpaceInField.defaultPrevented,
      globalShortcutFromField: afterFieldShortcut,
      headerSpacePrevented: headerSpace.defaultPrevented,
      openedBeforeEnter,
      headerEnterComposingPrevented: headerEnterComposing.defaultPrevented,
      openedAfterEnter,
      dueSpacePrevented: dueSpace.defaultPrevented,
      duePickerOpened,
      canHandleWhileComposing: window.__canHandleShortcut({
        isComposing: true,
        keyCode: 229,
        key: " ",
        target: document.body,
      }),
      canHandleInTextarea: window.__canHandleShortcut({
        isComposing: false,
        key: " ",
        target: document.getElementById("body-input"),
      }),
    };
  });
  console.log("SIM", sim);

  const fail = (msg) => {
    throw new Error(msg);
  };
  if (sim.composingSpacePrevented) fail("変換中の Space が preventDefault された");
  if (sim.composingEnterPrevented) fail("変換確定の Enter が preventDefault された");
  if (sim.globalShortcutDuringComposition) fail("変換中に画面全体のショートカットが動いた");
  if (sim.plainSpaceInFieldPrevented) fail("入力欄の Space が preventDefault された");
  if (sim.globalShortcutFromField) fail("入力欄フォーカス中にショートカットが動いた");
  if (sim.headerSpacePrevented) fail("行見出しの Space が preventDefault された");
  if (sim.openedBeforeEnter) fail("Space または変換中 Enter でカードが開いた");
  if (sim.headerEnterComposingPrevented) fail("変換確定の Enter が行見出しで奪われた");
  if (!sim.openedAfterEnter) fail("通常の Enter でカードが開かない（ガードが効きすぎ）");
  if (!sim.dueSpacePrevented || !sim.duePickerOpened) {
    fail("日付入力の Space でカレンダーが開かない");
  }
  if (sim.canHandleWhileComposing) fail("canHandleShortcut が変換中に true を返した");
  if (sim.canHandleInTextarea) fail("canHandleShortcut が入力欄で true を返した");

  await page.locator(".wrap").screenshot({ path: outShot });
  console.log("WROTE", outShot);
  await browser.close();
}

// --- 4) 実 IME での確認（環境の入力ソースを切り替えるため既定では実行しない） ---

let imeResult = { attempted: false, ok: false, value: "", note: "skipped (VERIFY_REAL_IME=1 で実行)" };
if (process.env.VERIFY_REAL_IME === "1") {
  try {
    const browser = await launchBrowser({ headed: true });
    const context = await browser.newContext();
    const page = await context.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.bringToFront();
    await page.focus("#body-input");
    await page.waitForTimeout(400);

    spawnSync(
      "osascript",
      ["-e", 'tell application "System Events" to key code 49 using {control down}'],
      { encoding: "utf8" }
    );
    await page.waitForTimeout(300);
    await page.focus("#body-input");

    for (const k of [{ keystroke: "kanji" }, { keyCode: 49 }, { keyCode: 36 }]) {
      const arg =
        k.keystroke != null
          ? `tell application "System Events" to keystroke "${k.keystroke}"`
          : `tell application "System Events" to key code ${k.keyCode}`;
      spawnSync("osascript", ["-e", arg], { encoding: "utf8" });
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(600);
    const value = await page.inputValue("#body-input");
    const hasKanji = /[\u4e00-\u9fff]/.test(value);
    imeResult = {
      attempted: true,
      ok: hasKanji,
      value,
      note: hasKanji
        ? "漢字が含まれ、変換が通った"
        : "漢字が検出できず（IME切替が効かなかった可能性）",
    };
    console.log("REAL_IME", imeResult);
    await page.locator(".wrap").screenshot({ path: path.join(root, "tools/ime-space-real.png") });
    await browser.close();
  } catch (err) {
    imeResult = { attempted: true, ok: false, value: "", note: String(err.message || err) };
    console.warn("REAL_IME failed", err.message);
  }
}

server.close();
console.log("NOTE:", imeResult.note);
console.log("DONE");
