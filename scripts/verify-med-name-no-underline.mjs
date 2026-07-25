/**
 * 薬剤一覧の薬剤名に赤い下線（スペルチェック等）が出ないことを検証する。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const require = createRequire(import.meta.url);

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
      return await chromium.launch({
        executablePath,
        headless: true,
        timeout: 30_000,
      });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  throw new Error("Could not launch browser");
}

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<link rel="stylesheet" href="/css/style.css" />
</head>
<body style="margin:0;background:#f5f6f7">
<aside class="col col--right" style="width:340px;height:100vh;background:#fff;display:flex;flex-direction:column">
  <div class="right-tabs"><button class="right-tab is-active">薬剤</button></div>
  <div class="right-panel" id="panel-meds" style="display:flex">
    <section class="exam-section">
      <h3 class="exam-section__title">薬剤一覧</h3>
      <ul class="meds-list" id="meds-list" spellcheck="false"></ul>
    </section>
  </div>
</aside>
<script type="module">
import { enableRowGestures } from "/js/row-gestures.js";
function card(name, { overdue = false, alert = false } = {}) {
  const li = document.createElement("li");
  li.className = "med-card";
  li.spellcheck = false;
  if (overdue) li.classList.add("is-overdue");
  if (alert) li.classList.add("is-alert");
  const header = document.createElement("div");
  header.className = "med-card__header";
  const signs = document.createElement("span");
  signs.className = "med-card__signs";
  const nameEl = document.createElement("span");
  nameEl.className = "med-card__name";
  nameEl.spellcheck = false;
  nameEl.textContent = name;
  const status = document.createElement("span");
  status.className = "med-status med-status--active";
  status.textContent = "使用中";
  const cat = document.createElement("span");
  cat.className = "med-cat med-cat--B";
  cat.textContent = "B";
  const chev = document.createElement("span");
  chev.className = "med-card__chevron";
  chev.textContent = "▸";
  header.append(signs, nameEl, status, cat, chev);
  if (overdue || alert) {
    const inline = document.createElement("span");
    inline.className = overdue
      ? "med-inline-status med-inline-status--overdue"
      : "med-inline-status med-inline-status--near";
    inline.textContent = overdue ? "期限超過" : "あと3日";
    nameEl.after(inline);
  }
  li.appendChild(header);
  enableRowGestures(li, {
    actions: [
      { action: "edit", title: "編集", onClick: () => {} },
      { action: "delete", title: "削除", onClick: () => {} },
    ],
  });
  return li;
}
const list = document.getElementById("meds-list");
list.appendChild(card("アモキシシリン", { overdue: true }));
list.appendChild(card("アラバ", { alert: true }));
list.appendChild(card("プレドニゾロン"));
window.__ready = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const fp = path.join(root, u.replace(/^\//, ""));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  const type = fp.endsWith(".css")
    ? "text/css"
    : fp.endsWith(".js")
      ? "text/javascript"
      : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(400);

const outPath = path.join(root, "tools/med-name-no-underline-verify.png");
await page.screenshot({ path: outPath });

const styles = await page.evaluate(() =>
  [...document.querySelectorAll(".med-card__name")].map((el) => {
    const cs = getComputedStyle(el);
    return {
      text: el.textContent,
      textDecorationLine: cs.textDecorationLine,
      spellcheck: el.spellcheck,
    };
  })
);
console.log("STYLES", styles);
if (styles.some((s) => s.textDecorationLine && s.textDecorationLine !== "none")) {
  throw new Error("med-card__name still has text-decoration-line");
}

// アラバ（オレンジ文字）行で、文字色以外の「赤い下線ピクセル」が名前直下に無いか確認
const boxes = await page.evaluate(() =>
  [...document.querySelectorAll(".med-card__name")].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      text: el.textContent,
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      bottom: r.bottom,
    };
  })
);

await browser.close();
server.close();

const { createCanvas, loadImage } = await import("canvas").catch(() => ({
  createCanvas: null,
  loadImage: null,
}));

// Pillow path (always available from earlier env)
const { spawnSync } = await import("node:child_process");
const py = `
from PIL import Image
im = Image.open(${JSON.stringify(outPath)}).convert("RGB")
boxes = ${JSON.stringify(boxes)}
problems = []
for b in boxes:
    # 名前の直下 2px 帯を走査（文字本体は含めない）
    y0 = int(b["bottom"])
    y1 = min(im.height, y0 + 3)
    x0 = max(0, int(b["x"]))
    x1 = min(im.width, int(b["x"] + min(b["w"], 120)))
    reds = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            r,g,bb = im.getpixel((x,y))
            # 赤い下線: Rが高く、G/Bが低い。オレンジ本文色は帯外なので混入しにくい
            if r > 170 and g < 90 and bb < 90 and (r - g) > 80:
                reds += 1
    print(b["text"], "underline_red_pixels", reds, "band", x0,y0,x1,y1)
    if reds > 8:
        problems.append(b["text"] + ":" + str(reds))
if problems:
    raise SystemExit("RED_UNDERLINE " + ",".join(problems))
print("OK: no red underline band under med names")
`;
const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
if (r.status !== 0) process.exit(r.status || 1);
console.log("OK: screenshot saved", outPath);
