/**
 * 検査登録: 次回予定のカレンダー2欄が横並びで枠内に収まることを検証する。
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
const outDir = path.join(root, "tools", "exam-due-grid-align");
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
  path.join(__dirname, "mock-db-exam-categories.js"),
  "utf8"
);
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
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
enterExamPlan("karte-due-align");
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
await page.waitForSelector("#exam-plan-due-date");

const metrics = await page.evaluate(() => {
  const row = document.querySelector("#exam-plan-modal .exam-due-compact__date-row--range");
  const from = document.getElementById("exam-plan-due-date");
  const to = document.getElementById("exam-plan-due-date-to");
  const fromLabel = document.querySelector('label[for="exam-plan-due-date"]');
  const toLabel = document.querySelector('label[for="exam-plan-due-date-to"]');
  const fr = from.getBoundingClientRect();
  const tr = to.getBoundingClientRect();
  return {
    fromLabel: fromLabel?.textContent?.trim() || "",
    toLabel: toLabel?.textContent?.trim() || "",
    hasNumpad: Boolean(document.getElementById("exam-plan-due-numpad")),
    hasRow: Boolean(row),
    sideBySide: Math.abs(fr.top - tr.top) <= 4 && tr.left > fr.right - 8,
    heightDiff: Math.abs(fr.height - tr.height),
  };
});
console.log(JSON.stringify(metrics, null, 2));

assert.equal(metrics.fromLabel, "目安の始め");
assert.equal(metrics.toLabel, "目安の終わり");
assert.equal(metrics.hasNumpad, false);
assert.ok(metrics.hasRow);
assert.ok(metrics.sideBySide, "calendars should sit side by side");
assert.ok(metrics.heightDiff <= 2, `calendar heights differ: ${metrics.heightDiff}`);

await page.locator("#exam-plan-modal .exam-due-compact__date-row--range").scrollIntoViewIfNeeded();
await page.screenshot({
  path: path.join(outDir, "01-relative-grid.png"),
  fullPage: false,
});
const box = await page.locator("#exam-plan-modal .exam-due-compact__date-row--range").boundingBox();
await page.screenshot({
  path: path.join(outDir, "02-relative-crop.png"),
  clip: {
    x: Math.max(0, box.x - 8),
    y: Math.max(0, box.y - 8),
    width: box.width + 16,
    height: box.height + 16,
  },
});
await page.screenshot({
  path: path.join(outDir, "03-exam-plan-modal.png"),
  fullPage: false,
});

await browser.close();
server.close();
console.log("OK: exam due grid aligned");
console.log("shots:", outDir);
