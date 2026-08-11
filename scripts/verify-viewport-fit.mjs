/**
 * ロック／ゲート／主要モーダルが各ビューポートで画面内に収まることを検証する。
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
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = path.join(root, "tools", "viewport-fit-verify");
fs.mkdirSync(outDir, { recursive: true });

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

const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
assert.ok(css.includes("max-height: 100dvh"), "app/lock max-height がない");
assert.ok(css.includes("100svh"), "modal に svh がない");
assert.ok(css.includes("@media (max-height: 720px)"), "短い高さ用 media がない");
assert.ok(
  fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .includes('id="exam-sheet-due-numpad"') &&
    fs
      .readFileSync(path.join(root, "index.html"), "utf8")
      .includes("numpad numpad--compact"),
  "exam-item-sheet の compact numpad がない"
);

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const harness = indexHtml.replace(
  /<script type="module" src="\.\/js\/app\.js"><\/script>/,
  `<script type="module">
// app.js を読まないため、認証確定待ちの表示は自前で解除する
document.documentElement.classList.remove("is-auth-pending");
window.__showLock = () => {
  document.getElementById("screen-lock")?.removeAttribute("hidden");
  document.getElementById("app-shell")?.setAttribute("hidden", "");
  document.documentElement.classList.remove("is-unlocked");
};
window.__showGate = () => {
  document.getElementById("screen-lock")?.setAttribute("hidden", "");
  document.getElementById("app-shell")?.removeAttribute("hidden");
  document.documentElement.classList.add("is-unlocked");
  document.getElementById("gate-karte").hidden = false;
  document.getElementById("gate-animal").hidden = true;
  document.getElementById("center-main")?.setAttribute("hidden", "");
};
window.__showApp = () => {
  document.getElementById("screen-lock")?.setAttribute("hidden", "");
  document.getElementById("app-shell")?.removeAttribute("hidden");
  document.documentElement.classList.add("is-unlocked");
  document.getElementById("gate-karte").hidden = true;
  document.getElementById("gate-animal").hidden = true;
  document.getElementById("center-main")?.removeAttribute("hidden");
};
window.__open = (id) => {
  document.querySelectorAll(".modal").forEach((m) => { m.hidden = true; });
  const el = document.getElementById(id);
  if (el) el.hidden = false;
};
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

const viewports = [
  { name: "fullscreen-1366", width: 1366, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "normal-1024", width: 1024, height: 768 },
  { name: "short-900x600", width: 900, height: 600 },
  { name: "short-820x560", width: 820, height: 560 },
  { name: "narrow-640x720", width: 640, height: 720 },
];

const modalIds = [
  "exam-plan-modal",
  "med-add-modal",
  "med-event-modal",
  "procedure-plan-modal",
  "exam-item-sheet",
  "history-add-modal",
  "special-note-modal",
  "templates-modal",
  "settings-modal",
  "procedure-modal",
  "med-detail-sheet",
];

const failures = [];

for (const vp of viewports) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
  });
  await page.goto(`http://127.0.0.1:${port}/`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => window.__ready === true);
  console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`);

  // Lock
  await page.evaluate(() => window.__showLock());
  await page.waitForTimeout(40);
  const lock = await page.evaluate(() => {
    const vh = window.innerHeight;
    const lockEl = document.querySelector(".lock-screen");
    const inner = document.querySelector(".lock-screen__inner");
    const lr = lockEl.getBoundingClientRect();
    const ir = inner.getBoundingClientRect();
    return {
      docOverflow: document.documentElement.scrollHeight > vh + 2,
      bodyOverflow: document.body.scrollHeight > vh + 2,
      lockFits: lr.top >= -1 && lr.bottom <= vh + 1,
      lockScrollable: lockEl.scrollHeight > lockEl.clientHeight + 1,
      innerReachable:
        ir.bottom <= lr.bottom + lockEl.scrollHeight - lockEl.scrollTop + 1,
      canScrollToEnd: (() => {
        lockEl.scrollTop = lockEl.scrollHeight;
        const btn = document.getElementById("btn-passcode-next");
        const br = btn.getBoundingClientRect();
        return br.bottom <= vh + 1 && br.top >= 0;
      })(),
    };
  });
  console.log("lock", lock);
  if (lock.docOverflow || lock.bodyOverflow)
    failures.push(`${vp.name}/lock: document overflows`);
  if (!lock.lockFits) failures.push(`${vp.name}/lock: lock-screen out of view`);
  if (!lock.canScrollToEnd)
    failures.push(`${vp.name}/lock: confirm button not reachable`);
  await page.screenshot({
    path: path.join(outDir, `${vp.name}__lock.png`),
  });

  // Gate
  await page.evaluate(() => window.__showGate());
  await page.waitForTimeout(40);
  const gate = await page.evaluate(() => {
    const vh = window.innerHeight;
    const gateEl = document.querySelector(".center-gate");
    const card = document.querySelector(".gate-card");
    gateEl.scrollTop = gateEl.scrollHeight;
    const cr = card.getBoundingClientRect();
    const btn = document.getElementById("btn-karte-next");
    const br = btn.getBoundingClientRect();
    return {
      docOverflow: document.documentElement.scrollHeight > vh + 2,
      cardVisibleEnd: br.bottom <= vh + 1 && br.top >= 0,
      gateScrollable: gateEl.scrollHeight > gateEl.clientHeight + 1 || cr.height <= gateEl.clientHeight,
    };
  });
  console.log("gate", gate);
  if (gate.docOverflow) failures.push(`${vp.name}/gate: document overflows`);
  if (!gate.cardVisibleEnd)
    failures.push(`${vp.name}/gate: next button not reachable`);
  await page.screenshot({
    path: path.join(outDir, `${vp.name}__gate.png`),
  });

  // App shell + modals
  await page.evaluate(() => window.__showApp());
  await page.waitForTimeout(40);
  const shell = await page.evaluate(() => {
    const vh = window.innerHeight;
    const app = document.getElementById("app-shell");
    const layout = document.querySelector(".layout");
    const ar = app.getBoundingClientRect();
    const lr = layout.getBoundingClientRect();
    return {
      docOverflow: document.documentElement.scrollHeight > vh + 2,
      appFits: ar.bottom <= vh + 1 && ar.top >= -1,
      layoutFits: lr.bottom <= vh + 1 && lr.top >= -1,
    };
  });
  console.log("shell", shell);
  if (shell.docOverflow || !shell.appFits || !shell.layoutFits)
    failures.push(`${vp.name}/shell: overflows`);
  await page.screenshot({
    path: path.join(outDir, `${vp.name}__shell.png`),
  });

  for (const id of modalIds) {
    await page.evaluate((mid) => {
      window.__open(mid);
      if (mid === "med-event-modal") {
        document.getElementById("med-event-change-options").hidden = false;
        document.getElementById("med-event-freq-block").hidden = false;
        document.getElementById("med-event-amount-block").hidden = false;
      }
      if (mid === "exam-plan-modal") {
        const add = document.getElementById("exam-plan-item-add-default");
        if (add) add.hidden = false;
      }
      if (mid === "med-detail-sheet") {
        const body = document.getElementById("med-detail-sheet-body");
        if (body) {
          body.innerHTML = Array.from(
            { length: 14 },
            (_, i) =>
              `<div class="field"><p class="label">出来事 ${i + 1}</p><p class="field__note">長い内容</p></div>`
          ).join("");
        }
      }
    }, id);
    await page.waitForTimeout(30);
    const geo = await page.evaluate((mid) => {
      const vh = window.innerHeight;
      const modal = document.getElementById(mid);
      const panel = modal.querySelector(".modal__panel");
      const footer = modal.querySelector(".modal__footer");
      const body = modal.querySelector(".modal__body");
      const pr = panel.getBoundingClientRect();
      const fr = footer?.getBoundingClientRect();
      return {
        fits: pr.top >= -1 && pr.bottom <= vh + 1,
        footerIn: !fr || (fr.top >= -1 && fr.bottom <= vh + 1),
        bodyScrollable: body.scrollHeight > body.clientHeight + 1 || body.scrollHeight <= body.clientHeight + 1,
      };
    }, id);
    const ok = geo.fits && geo.footerIn;
    console.log(`  ${ok ? "OK" : "FAIL"} ${id}`);
    if (!ok) failures.push(`${vp.name}/${id}: panel/footer out of view`);
    if (["exam-plan-modal", "med-add-modal", "exam-item-sheet", "settings-modal"].includes(id)) {
      await page.screenshot({
        path: path.join(outDir, `${vp.name}__${id}.png`),
      });
    }
  }

  await page.close();
}

await browser.close();
server.close();

console.log("\n----");
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log(" -", f);
  process.exit(1);
}
console.log("OK: viewport fit verified");
console.log("shots:", outDir);
