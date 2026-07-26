/**
 * 全主要モーダルで「画面内に収まる」「本文スクロール」「フッター操作ボタンが常に見える」を検証する。
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

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
// Replace firebase/app modules with stubs so we can open modals without auth
const stubApp = `
<script type="module">
  // strip real app; open modals via buttons / direct unhide
  document.querySelectorAll(".modal").forEach((m) => { /* keep */ });
  window.__open = (id) => {
    document.querySelectorAll(".modal").forEach((m) => { m.hidden = true; });
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  };
  window.__ready = true;
</script>
`.trim();

const harness = indexHtml
  .replace(
    /<script type="module" src="\.\/js\/app\.js"><\/script>/,
    stubApp
  )
  // remove firebase-dependent module scripts if any in head - keep css
  ;

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
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const browser = await launchBrowser();
const page = await browser.newPage({
  viewport: { width: 820, height: 700 },
  deviceScaleFactor: 2,
});

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ready === true);

async function inflateBody(modalId) {
  await page.evaluate((id) => {
    const modal = document.getElementById(id);
    const body = modal?.querySelector(".modal__body");
    if (!body) return;
    let filler = body.querySelector("[data-overflow-filler]");
    if (!filler) {
      filler = document.createElement("div");
      filler.dataset.overflowFiller = "1";
      filler.style.cssText =
        "display:flex;flex-direction:column;gap:8px;padding:4px 0;";
      body.appendChild(filler);
    }
    filler.innerHTML = "";
    for (let i = 1; i <= 40; i++) {
      const p = document.createElement("p");
      p.className = "field__note";
      p.textContent = `ダミー行 ${i} — スクロール検証用の長い内容です。`;
      filler.appendChild(p);
    }
  }, modalId);
}

async function checkModal(modalId, shotName) {
  await page.evaluate((id) => window.__open(id), modalId);
  await page.waitForSelector(`#${modalId}:not([hidden])`);
  await inflateBody(modalId);
  await page.waitForTimeout(40);

  const geo = await page.evaluate((id) => {
    const modal = document.getElementById(id);
    const panel = modal?.querySelector(".modal__panel");
    const header = modal?.querySelector(".modal__header");
    const body = modal?.querySelector(".modal__body");
    const footer = modal?.querySelector(".modal__footer");
    if (!panel || !header || !body) {
      return { ok: false, reason: "missing structure" };
    }
    const vh = window.innerHeight;
    const pr = panel.getBoundingClientRect();
    const hr = header.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const fr = footer?.getBoundingClientRect() || null;
    const bodyScrollable = body.scrollHeight > body.clientHeight + 2;
    // scroll body to bottom; footer/header should stay put
    const headerTopBefore = hr.top;
    const footerBottomBefore = fr?.bottom ?? null;
    body.scrollTop = body.scrollHeight;
    const hr2 = header.getBoundingClientRect();
    const fr2 = footer?.getBoundingClientRect() || null;
    return {
      ok: true,
      panelTop: pr.top,
      panelBottom: pr.bottom,
      panelHeight: pr.height,
      vh,
      fitsViewport: pr.top >= -1 && pr.bottom <= vh + 1,
      headerFixed: Math.abs(hr2.top - headerTopBefore) < 1,
      footerFixed:
        !footer ||
        (footerBottomBefore != null &&
          Math.abs(fr2.bottom - footerBottomBefore) < 1),
      footerInView: !footer || (fr2.top >= 0 && fr2.bottom <= vh + 1),
      headerInView: hr2.top >= 0 && hr2.bottom <= vh + 1,
      bodyScrollable,
      hasFooter: Boolean(footer),
      bodyScrollTop: body.scrollTop,
    };
  }, modalId);

  console.log(modalId, geo);
  if (!geo.ok) throw new Error(`${modalId}: ${geo.reason}`);
  if (!geo.fitsViewport) {
    throw new Error(
      `${modalId}: panel exceeds viewport (bottom=${geo.panelBottom}, vh=${geo.vh})`
    );
  }
  if (!geo.bodyScrollable) {
    throw new Error(`${modalId}: body should scroll when content is long`);
  }
  if (!geo.headerInView || !geo.headerFixed) {
    throw new Error(`${modalId}: header not sticky/in view`);
  }
  if (geo.hasFooter && (!geo.footerInView || !geo.footerFixed)) {
    throw new Error(`${modalId}: footer not sticky/in view`);
  }

  await page.screenshot({
    path: path.join(root, "tools", shotName),
  });
}

const cases = [
  ["exam-plan-modal", "modal-sticky-exam-plan.png"],
  ["med-add-modal", "modal-sticky-med-add.png"],
  ["med-detail-sheet", "modal-sticky-med-detail.png"],
  ["history-add-modal", "modal-sticky-history.png"],
  ["procedure-modal", "modal-sticky-procedure.png"],
  ["special-note-modal", "modal-sticky-special-note.png"],
  ["templates-modal", "modal-sticky-templates.png"],
  ["exam-item-sheet", "modal-sticky-exam-sheet.png"],
];

for (const [id, shot] of cases) {
  await checkModal(id, shot);
}

await browser.close();
server.close();
console.log("OK: modal sticky chrome + scrollable body");
