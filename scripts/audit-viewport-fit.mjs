/**
 * 複数ビューポートでアプリ全体・主要モーダルが画面内に収まるか監査する。
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
const outDir = path.join(root, "tools", "viewport-fit-audit");
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

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const harness = indexHtml.replace(
  /<script type="module" src="\.\/js\/app\.js"><\/script>/,
  `<script type="module">
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");

// 右カラムにダミー行を足して本体スクロールも確認
const examList = document.getElementById("exam-plan-list");
if (examList) {
  for (let i = 0; i < 20; i++) {
    const li = document.createElement("li");
    li.className = "exam-list-item";
    li.innerHTML = '<div class="exam-list-item__main"><div class="exam-list-item__name">検査項目 ' + (i+1) + '</div><div class="exam-list-item__due">2026-08-01</div></div>';
    examList.appendChild(li);
  }
}

window.__open = (id) => {
  document.querySelectorAll(".modal").forEach((m) => { m.hidden = true; });
  const el = document.getElementById(id);
  if (el) el.hidden = false;
};
window.__close = () => {
  document.querySelectorAll(".modal").forEach((m) => { m.hidden = true; });
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
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "fullscreen-1366", width: 1366, height: 900 },
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
  "entry-edit-modal",
  "procedure-modal",
  "med-detail-sheet",
  "ai-suggest-review-modal",
];

const failures = [];

for (const vp of viewports) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ready === true);

  console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`);

  const shell = await page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const app = document.getElementById("app");
    const layout = document.querySelector(".layout");
    const ar = app?.getBoundingClientRect();
    const lr = layout?.getBoundingClientRect();
    return {
      vh,
      vw,
      docScrollH: document.documentElement.scrollHeight,
      bodyScrollH: document.body.scrollHeight,
      appBottom: ar?.bottom ?? null,
      layoutBottom: lr?.bottom ?? null,
      overflows:
        document.documentElement.scrollHeight > vh + 2 ||
        document.body.scrollHeight > vh + 2 ||
        (lr && lr.bottom > vh + 2) ||
        (ar && ar.bottom > vh + 2),
    };
  });
  console.log("shell", shell);
  if (shell.overflows) failures.push(`${vp.name}: shell overflows`);
  await page.screenshot({ path: path.join(outDir, `${vp.name}__shell.png`) });

  for (const id of modalIds) {
    await page.evaluate((mid) => {
      window.__open(mid);
      // 詳細・レビューは内容を膨らませる
      if (mid === "med-detail-sheet") {
        const body = document.getElementById("med-detail-sheet-body");
        if (body) {
          body.innerHTML = Array.from({ length: 16 }, (_, i) =>
            `<div class="field"><p class="label">出来事 ${i + 1}</p><p class="field__note">量・頻度・メモなどの長い内容</p></div>`
          ).join("");
        }
      }
      if (mid === "ai-suggest-review-modal") {
        const list = document.getElementById("ai-suggest-review-list");
        if (list) {
          list.innerHTML = Array.from({ length: 20 }, (_, i) =>
            `<li class="ai-suggest-item"><div class="ai-suggest-item__title">提案 ${i + 1}</div><p>長い説明文が入ります。</p></li>`
          ).join("");
        }
      }
      // マスタ追加トグルを開いてさらに高くする
      if (mid === "exam-plan-modal") {
        const panel = document.getElementById("exam-plan-add-panel");
        if (panel) panel.hidden = false;
      }
      if (mid === "med-add-modal") {
        const panel = document.getElementById("med-add-new-panel");
        if (panel) panel.hidden = false;
      }
    }, id);

    await page.waitForTimeout(40);
    const geo = await page.evaluate((mid) => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const modal = document.getElementById(mid);
      const panel = modal?.querySelector(".modal__panel");
      const header = modal?.querySelector(".modal__header");
      const body = modal?.querySelector(".modal__body");
      const footer = modal?.querySelector(".modal__footer");
      if (!panel) return { ok: false, reason: "missing panel" };
      const pr = panel.getBoundingClientRect();
      const hr = header?.getBoundingClientRect();
      const fr = footer?.getBoundingClientRect();
      return {
        ok: true,
        panelTop: pr.top,
        panelBottom: pr.bottom,
        panelH: pr.height,
        fits:
          pr.top >= -1 &&
          pr.bottom <= vh + 1 &&
          pr.left >= -1 &&
          pr.right <= vw + 1,
        headerInView: !hr || (hr.top >= -1 && hr.bottom <= vh + 1),
        footerInView: !fr || (fr.top >= -1 && fr.bottom <= vh + 1),
        bodyScrollable: body ? body.scrollHeight > body.clientHeight + 1 : null,
        bodyClientH: body?.clientHeight ?? null,
        bodyScrollH: body?.scrollHeight ?? null,
        vh,
      };
    }, id);

    const mark =
      geo.ok && geo.fits && geo.headerInView && geo.footerInView ? "OK" : "FAIL";
    console.log(
      `  ${mark} ${id}`,
      geo.ok
        ? `panel ${Math.round(geo.panelTop)}-${Math.round(geo.panelBottom)}/${vp.height}` +
            (geo.bodyScrollable ? " scroll" : " no-scroll")
        : geo.reason
    );
    if (!geo.ok) failures.push(`${vp.name}/${id}: ${geo.reason}`);
    else {
      if (!geo.fits)
        failures.push(
          `${vp.name}/${id}: panel overflow bottom=${geo.panelBottom.toFixed(1)} vh=${vp.height}`
        );
      if (!geo.headerInView) failures.push(`${vp.name}/${id}: header out`);
      if (!geo.footerInView) failures.push(`${vp.name}/${id}: footer out`);
    }

    await page.screenshot({
      path: path.join(outDir, `${vp.name}__${id}.png`),
    });
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
console.log("OK: all viewports / modals fit");
