/**
 * 検査「予定を登録」モーダルのコンパクト2セクションレイアウトを検証する。
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

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-exam-categories.js"),
  "utf-8"
);

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf-8");
const harness = indexHtml.replace(
  /<script type="module" src="\.\/js\/app\.js"><\/script>/,
  `<script type="module">
import { initExamPlanUI, enterExamPlan, openExamPlanCreateModal } from "/js/exam-plan-ui.js";
initExamPlanUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterExamPlan("karte-plan-layout");
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

// iPad 縦向き相当
const page = await browser.newPage({
  viewport: { width: 820, height: 1180 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.warn("pageerror", e.message));
await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await page.waitForTimeout(150);

// 病理を選んで葉列を埋める（実画面に近い高さ）
await page.locator("#exam-plan-col-category-list [role='option']", { hasText: "病理" }).click();
await page.waitForTimeout(100);

const layout = await page.evaluate(() => {
  const modal = document.querySelector("#exam-plan-modal .modal__panel");
  const body = document.querySelector("#exam-plan-modal .modal__body");
  const footer = document.querySelector("#exam-plan-modal .modal__footer");
  const calBtn = document.getElementById("btn-exam-plan-due-calendar");
  const display = document.getElementById("exam-plan-due-display");
  const doneCheck = document.getElementById("exam-plan-done-check");
  const doneDate = document.getElementById("exam-plan-done-date");
  const saveBtn = document.getElementById("btn-exam-plan-save");
  const dual = document.getElementById("exam-plan-dual");
  const planTitle = document.getElementById("exam-plan-section-plan-title");
  const doneTitle = document.getElementById("exam-plan-section-done-title");
  const numpad = document.getElementById("exam-plan-due-numpad");

  const modalRect = modal.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const doneRect = doneCheck.getBoundingClientRect();
  const saveRect = saveBtn.getBoundingClientRect();
  const displayRect = display.getBoundingClientRect();
  const dualRect = dual.getBoundingClientRect();

  const bodyStyle = getComputedStyle(body);
  const displayStyle = getComputedStyle(display);
  const numpadStyle = getComputedStyle(numpad);

  return {
    hasCalendarBtn: Boolean(calBtn),
    planTitle: planTitle?.textContent?.trim(),
    doneTitle: doneTitle?.textContent?.trim(),
    modalH: modalRect.height,
    viewportH: window.innerHeight,
    footerVisible: footerRect.bottom <= window.innerHeight + 1 && footerRect.top >= 0,
    saveVisible: saveRect.bottom <= window.innerHeight + 1 && saveRect.top >= 0,
    doneCheckVisible: doneRect.bottom <= window.innerHeight + 1 && doneRect.top >= 0,
    doneDateDisabled: doneDate?.disabled === true,
    displayW: displayRect.width,
    dualW: dualRect.width,
    displayIsCompact: display.classList.contains("interval-value-display--compact"),
    numpadCols: numpadStyle.gridTemplateColumns.split(" ").length,
    bodyOverflowY: bodyStyle.overflowY,
    modalFitsViewport: modalRect.bottom <= window.innerHeight + 2,
  };
});

console.log("layout", layout);

if (layout.hasCalendarBtn) throw new Error("calendar button should be removed");
if (layout.planTitle !== "次回予定の登録（任意）") throw new Error("plan section title missing");
if (layout.doneTitle !== "本日実施した内容の記録（任意）") {
  throw new Error("done section title missing");
}
if (!layout.displayIsCompact) throw new Error("due display should be compact");
if (layout.numpadCols !== 3) {
  throw new Error("numpad should stay 3-column (3x4), got " + layout.numpadCols);
}
if (layout.displayW > layout.dualW * 0.55) {
  throw new Error(
    `display box still too wide (${layout.displayW} vs dual ${layout.dualW})`
  );
}
if (!layout.footerVisible || !layout.saveVisible) {
  throw new Error("save/cancel footer must stay visible without scroll");
}
if (!layout.doneCheckVisible) {
  throw new Error("done checkbox must be visible without scroll");
}
if (!layout.doneDateDisabled) {
  throw new Error("done date should start disabled");
}
if (!layout.modalFitsViewport) {
  throw new Error("modal panel overflows viewport");
}

await page.screenshot({
  path: path.join(root, "tools/exam-plan-layout-after.png"),
});

// 実施履歴チェックON → 実施日が有効化
await page.check("#exam-plan-done-check");
await page.waitForTimeout(80);
const afterCheck = await page.evaluate(() => {
  const doneDate = document.getElementById("exam-plan-done-date");
  const block = document.getElementById("exam-plan-done-block");
  return {
    disabled: doneDate?.disabled === true,
    muted: block?.classList.contains("is-disabled"),
  };
});
console.log("after check", afterCheck);
if (afterCheck.disabled || afterCheck.muted) {
  throw new Error("done fields should enable when checked");
}

await page.screenshot({
  path: path.join(root, "tools/exam-plan-layout-after-done-on.png"),
});

// 狭い幅でもセクションが縦積みで見えること
await page.setViewportSize({ width: 460, height: 900 });
await page.waitForTimeout(100);
const narrow = await page.evaluate(() => {
  const plan = document.querySelector(".exam-plan-section--plan");
  const done = document.querySelector(".exam-plan-section--done");
  const footer = document.querySelector("#exam-plan-modal .modal__footer");
  const body = document.querySelector("#exam-plan-modal .modal__body");
  const check = document.getElementById("exam-plan-done-check");
  const pr = plan.getBoundingClientRect();
  const dr = done.getBoundingClientRect();
  const fr = footer.getBoundingClientRect();
  const br = body.getBoundingClientRect();
  const cr = check.getBoundingClientRect();
  return {
    doneFirst: dr.bottom <= pr.top + 2,
    footerVisible: fr.bottom <= window.innerHeight + 1,
    doneCheckInBodyView: cr.top >= br.top - 1 && cr.bottom <= br.bottom + 1,
  };
});
console.log("narrow", narrow);
if (!narrow.doneFirst) throw new Error("done section should appear above plan on narrow");
if (!narrow.footerVisible) throw new Error("footer must remain visible on narrow");
if (!narrow.doneCheckInBodyView) {
  throw new Error("done checkbox must be visible in modal body without scroll");
}

await page.screenshot({
  path: path.join(root, "tools/exam-plan-layout-after-narrow.png"),
});

await browser.close();
server.close();
console.log("OK: exam plan layout");
