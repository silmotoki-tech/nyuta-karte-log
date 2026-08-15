/**
 * 検査登録モーダルから補足説明文が消えていることを検証する。
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
const outDir = path.join(root, "tools", "exam-plan-hints-removed");
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

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(
  !indexHtml.includes("日付欄をタップするか"),
  "plan due hint still in HTML"
);
assert.ok(
  !indexHtml.includes("本日実施した検査を、実施履歴にも残せます"),
  "done section lead still in HTML"
);
assert.ok(
  !indexHtml.includes("exam-due-compact__hint") &&
    !indexHtml.includes("exam-plan-section__lead"),
  "hint/lead class still in HTML"
);

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-exam-categories.js"),
  "utf8"
);
const harness = indexHtml
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
  .replace(
    "</body>",
    `<script type="module">
import { initExamPlanUI, enterExamPlan, openExamPlanCreateModal } from "/js/exam-plan-ui.js";
initExamPlanUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterExamPlan("karte-hints");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
openExamPlanCreateModal();
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
await page.waitForSelector("#exam-plan-modal:not([hidden])");

const check = await page.evaluate(() => {
  const body = document.querySelector("#exam-plan-modal .modal__body");
  const text = body?.innerText || "";
  const plan = document.querySelector(".exam-plan-section--plan");
  const done = document.querySelector(".exam-plan-section--done");
  return {
    text,
    hasTapHint: text.includes("日付欄をタップするか"),
    hasRemainHint: text.includes("予定日を選ぶと、残り日数が表示されます"),
    hasDoneLead: text.includes("本日実施した検査を、実施履歴にも残せます"),
    hasPlanTitle: text.includes("次回予定の登録"),
    hasDoneTitle: text.includes("本日実施した内容の記録"),
    windowNoteHidden: document.getElementById("exam-plan-window-note")?.hidden === true,
    planText: plan?.innerText || "",
    doneText: done?.innerText || "",
  };
});
console.log(check);
assert.equal(check.hasTapHint, false);
assert.equal(check.hasRemainHint, false);
assert.equal(check.hasDoneLead, false);
assert.equal(check.hasPlanTitle, true);
assert.equal(check.hasDoneTitle, true);
assert.equal(check.windowNoteHidden, true);

await page.locator(".exam-plan-section--plan").scrollIntoViewIfNeeded();
await page.screenshot({
  path: path.join(outDir, "01-plan-section.png"),
  fullPage: false,
});
await page.locator(".exam-plan-section--done").scrollIntoViewIfNeeded();
await page.screenshot({
  path: path.join(outDir, "02-done-section.png"),
  fullPage: false,
});
await page.screenshot({
  path: path.join(outDir, "03-exam-plan-modal.png"),
  fullPage: false,
});

await browser.close();
server.close();
console.log("OK: exam plan hints removed");
console.log("shots:", outDir);
