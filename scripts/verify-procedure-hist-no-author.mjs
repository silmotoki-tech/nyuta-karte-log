/**
 * 処置「実施を記録」（処置予定モーダル内の登録方法トグル）:
 * 記入者欄なしで、予定を作らず実施履歴にだけ登録できることを検証する。
 * 右カラムのタブ削除に伴い、旧・専用モーダル(#procedure-modal)への
 * 直接入口は無くなったため、状態モード等と同じ openProcedurePlanCreateModal
 * 経由でモーダルを開き、トグルで「実施を記録」に切り替えて検証する。
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "tools", "procedure-hist-no-author");
fs.mkdirSync(outDir, { recursive: true });
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

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-procedures.js"),
  "utf8"
);
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const harness = indexHtml
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
  .replace(
    "</body>",
    `<script type="module">
import {
  initProceduresUI,
  enterProcedures,
  openProcedurePlanCreateModal,
} from "/js/procedures-ui.js";
import { subscribeProcedureBundle } from "/js/db.js";
initProceduresUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterProcedures("karte-proc");
// 右カラムのタブ削除で #procedure-plan-list / #procedures-list は本番DOMから
// 無くなったため、保存結果はモックDBの購読で直接検証する。
subscribeProcedureBundle("karte-proc", (bundle) => { window.__procBundle = bundle; });
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
window.__openProcedurePlanCreateModal = openProcedurePlanCreateModal;
window.__ready = true;
</script>`
  );

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/" || urlPath === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  if (urlPath === "/js/db.js") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(mockDb);
    return;
  }
  const filePath = path.join(root, urlPath.replace(/^\//, ""));
  if (
    !filePath.startsWith(root) ||
    !fs.existsSync(filePath) ||
    fs.statSync(filePath).isDirectory()
  ) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ready === true);

await page.evaluate(() => window.__openProcedurePlanCreateModal());
await page.waitForSelector("#procedure-plan-modal:not([hidden])");
await page.click("#btn-procedure-mode-history");
await page.waitForSelector("#procedure-plan-history-date-field:not([hidden])");

const ui = await page.evaluate(() => {
  const modal = document.getElementById("procedure-plan-modal");
  return {
    hasAuthorRow: !!document.getElementById("procedure-author-row"),
    hasAuthorHint: !!document.getElementById("procedure-author-hint"),
    hasAuthorLabel: !!Array.from(modal.querySelectorAll(".label")).find((el) =>
      /記入者/.test(el.textContent || "")
    ),
    title: document.getElementById("procedure-plan-modal-title")?.textContent || "",
    dueFieldHidden: document.getElementById("procedure-plan-due-field")?.hidden,
  };
});
assert.equal(ui.hasAuthorRow, false);
assert.equal(ui.hasAuthorHint, false);
assert.equal(ui.hasAuthorLabel, false);
assert.equal(ui.title, "処置予定を登録");
assert.equal(ui.dueFieldHidden, true, "「実施を記録」モードで予定日欄が隠れていない");

await page.screenshot({
  path: path.join(outDir, "01-modal-no-author.png"),
  fullPage: false,
});

await page.fill("#procedure-plan-content", "皮下点滴 100ml");
await page.fill("#procedure-plan-note", "反応良好");
await page.click("#btn-procedure-plan-save");
await page.waitForFunction(() => {
  const modal = document.getElementById("procedure-plan-modal");
  return !!modal?.hidden;
});

// 保存結果: モックDBの購読データで直接検証する（予定を経由せず実施履歴にのみ追加）
await page.waitForFunction(() => {
  const bundle = window.__procBundle;
  return !!bundle?.history?.some((h) => h.content === "皮下点滴 100ml");
});

const saved = await page.evaluate(() => {
  const bundle = window.__procBundle;
  const entry = bundle.history.find((h) => h.content === "皮下点滴 100ml");
  return {
    entry,
    planCount: bundle.plans.length,
    hasConfirmedBy: entry ? "confirmedBy" in entry && Boolean(entry.confirmedBy) : null,
  };
});
assert.ok(saved.entry, "実施履歴が保存されていない");
assert.equal(saved.entry.note, "反応良好");
assert.equal(saved.planCount, 0, "「実施を記録」モードなのに予定が作られている");
assert.equal(saved.hasConfirmedBy, false, "記入者情報が保存されている");

await page.screenshot({
  path: path.join(outDir, "02-listed-after-save.png"),
  fullPage: false,
});

console.log(JSON.stringify({ ui, saved }, null, 2));
await browser.close();
server.close();
console.log("OK: procedure hist save without author");
console.log("shots:", outDir);
