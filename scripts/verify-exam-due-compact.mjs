/**
 * 検査「次回予定の登録」: カレンダー2欄（目安の始め／目安の終わり）と枠内収まりを検証する。
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
const outDir = path.join(root, "tools", "exam-due-compact-verify");
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

assert.ok(
  !fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .includes('exam-due-compact__units-label">相対指定'),
  "相対指定 label still in exam-plan HTML"
);

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
enterExamPlan("karte-due-compact");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
openExamPlanCreateModal();
window.__ready = true;
</script>
</body>`
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
const page = await browser.newPage({
  viewport: { width: 1100, height: 900 },
});
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await page.waitForSelector("#exam-plan-due-date");
await page.waitForSelector("#exam-plan-due-date-to");

const geo = await page.evaluate(() => {
  const section = document.querySelector("#exam-plan-section-plan");
  const from = document.getElementById("exam-plan-due-date");
  const to = document.getElementById("exam-plan-due-date-to");
  const fromLabel = document.querySelector('label[for="exam-plan-due-date"]');
  const toLabel = document.querySelector('label[for="exam-plan-due-date-to"]');
  const sr = section.getBoundingClientRect();
  const fr = from.getBoundingClientRect();
  const tr = to.getBoundingClientRect();
  const text = section.innerText;
  const inSection = (r) =>
    r.left >= sr.left - 1 &&
    r.right <= sr.right + 1 &&
    r.top >= sr.top - 1 &&
    r.bottom <= sr.bottom + 1;
  return {
    hasSouai: text.includes("相対指定"),
    fromLabel: fromLabel?.textContent?.trim() || "",
    toLabel: toLabel?.textContent?.trim() || "",
    hasNumpad: Boolean(document.getElementById("exam-plan-due-numpad")),
    fromInSection: inSection(fr),
    toInSection: inSection(tr),
    sideBySide: Math.abs(fr.top - tr.top) <= 4 && tr.left > fr.right - 8,
    fromOverflowPx: Math.max(0, fr.right - sr.right),
    toOverflowPx: Math.max(0, tr.right - sr.right),
  };
});

console.log(geo);
assert.equal(geo.hasSouai, false, "相対指定 label still visible");
assert.equal(geo.fromLabel, "目安の始め");
assert.equal(geo.toLabel, "目安の終わり");
assert.equal(geo.hasNumpad, false, "due numpad should be removed");
assert.ok(geo.fromInSection, `from date overflows by ${geo.fromOverflowPx}px`);
assert.ok(geo.toInSection, `to date overflows by ${geo.toOverflowPx}px`);
assert.ok(geo.sideBySide, "two calendars should sit side by side");

await page.locator("#exam-plan-section-plan").screenshot({
  path: path.join(outDir, "01-plan-block.png"),
});
await page.screenshot({
  path: path.join(outDir, "02-exam-plan-modal.png"),
});

await page.fill("#exam-plan-due-date", "2026-10-01");
await page.fill("#exam-plan-due-date-to", "2026-11-01");
await page.locator("#exam-plan-section-plan").screenshot({
  path: path.join(outDir, "03-plan-block-with-value.png"),
});

await browser.close();
server.close();
console.log("OK: exam due compact layout");
console.log("shots:", outDir);
