/**
 * 薬剤名に赤い下線が出ないことを検証する（canvas 描画版）。
 * Chromium と WebKit(iPad) の両方で確認する。
 */
import { webkit, devices } from "playwright";
import { launchBrowser } from "./launch-browser.js";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head>
<body style="margin:0;background:#f5f6f7">
<aside class="col col--right" style="width:340px;height:100vh;background:#fff;display:flex;flex-direction:column">
  <div class="right-tabs"><button class="right-tab is-active">薬剤</button></div>
  <div class="right-panel" id="panel-meds" style="display:flex">
    <section class="exam-section">
      <h3 class="exam-section__title">薬剤一覧</h3>
      <ul class="meds-list" id="meds-list" spellcheck="false" lang="ja" translate="no"></ul>
    </section>
  </div>
</aside>
<script type="module">
import { initMedsUI, enterMeds } from "/js/meds-ui.js";

const mockDrugs = [
  { id: "d1", name: "アモキシシリン", category: "B", expiryEstimate: "2020-01-01", events: { e1: { date: "2026-07-01", type: "add" } } },
  { id: "d2", name: "アラバ", category: "B", expiryEstimate: "", events: { e1: { date: "2026-07-20", type: "add" } } },
  { id: "d3", name: "パラディア", category: "A", expiryEstimate: "", events: { e1: { date: "2026-07-10", type: "add" } } },
  { id: "d4", name: "AmoxicillinXYZQ", category: "C", expiryEstimate: "", events: {} },
];

await import("/js/db.js").catch(() => {});
// meds-ui は subscribe 経由なので db を差し替え済みのルートを使う
</script>
<script type="module">
import { enableRowGestures } from "/js/row-gestures.js";

// fillMedNameEl 相当を meds-ui から直接使えなければ簡易再現
function fillMedNameEl(nameEl, displayName) {
  nameEl.replaceChildren();
  nameEl.spellcheck = false;
  nameEl.contentEditable = "false";
  nameEl.dataset.name = displayName;
  nameEl.setAttribute("aria-label", displayName);
  const canvas = document.createElement("canvas");
  canvas.className = "med-card__name-canvas";
  canvas.setAttribute("aria-hidden", "true");
  nameEl.appendChild(canvas);
  const paint = () => {
    const cs = getComputedStyle(nameEl);
    const maxW = Math.max(0, Math.floor(nameEl.clientWidth));
    if (!maxW) return;
    const dpr = window.devicePixelRatio || 1;
    const font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    const fontPx = parseFloat(cs.fontSize) || 14;
    const h = Math.ceil(fontPx * 1.35);
    const probe = canvas.getContext("2d");
    probe.font = font;
    let text = displayName;
    let width = probe.measureText(text).width;
    if (width > maxW) {
      const ell = "…";
      while (text.length > 0 && probe.measureText(text + ell).width > maxW) text = text.slice(0, -1);
      text += ell;
      width = probe.measureText(text).width;
    }
    const w = Math.max(1, Math.ceil(Math.min(width, maxW)));
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = font;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, h / 2);
  };
  new ResizeObserver(() => paint()).observe(nameEl);
  requestAnimationFrame(paint);
}

function card(name, { overdue = false, alert = false } = {}) {
  const li = document.createElement("li");
  li.className = "med-card";
  li.spellcheck = false;
  li.contentEditable = "false";
  if (overdue) li.classList.add("is-overdue");
  if (alert) li.classList.add("is-alert");
  const header = document.createElement("div");
  header.className = "med-card__header";
  header.spellcheck = false;
  const signs = document.createElement("span");
  signs.className = "med-card__signs";
  const recent = document.createElement("span");
  recent.className = "med-sign med-sign--recent";
  recent.textContent = "●";
  signs.appendChild(recent);
  const nameEl = document.createElement("span");
  nameEl.className = "med-card__name";
  fillMedNameEl(nameEl, name);
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
list.appendChild(card("パラディア"));
list.appendChild(card("AmoxicillinXYZQ"));
window.__ready = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
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
const base = `http://127.0.0.1:${port}/`;

function analyzeRedBand(pngPath, boxes) {
  const py = `
from PIL import Image
im = Image.open(${JSON.stringify(pngPath)}).convert("RGB")
boxes = ${JSON.stringify(boxes)}
problems = []
for b in boxes:
    y0 = int(b["bottom"])
    y1 = min(im.height, y0 + 3)
    x0 = max(0, int(b["x"]))
    x1 = min(im.width, int(b["x"] + min(b["w"], 140)))
    reds = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            r,g,bb = im.getpixel((x,y))
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
  if (r.status !== 0) throw new Error(`pixel analysis failed for ${pngPath}`);
}

async function runScenario({ label, launch, contextOptions, outName }) {
  const browser = await launch();
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(600);

  const info = await page.evaluate(() =>
    [...document.querySelectorAll(".med-card__name")].map((el) => ({
      dataName: el.dataset.name || "",
      textContent: el.textContent || "",
      hasCanvas: !!el.querySelector("canvas.med-card__name-canvas"),
      canvasW: el.querySelector("canvas")?.width || 0,
    }))
  );
  console.log(`[${label}] INFO`, info);
  for (const s of info) {
    if (!s.hasCanvas) throw new Error(`[${label}] missing canvas for ${s.dataName}`);
    if (s.canvasW < 2) throw new Error(`[${label}] canvas not painted for ${s.dataName}`);
    if (s.textContent.trim() !== "") {
      throw new Error(`[${label}] unexpected text node: ${s.textContent}`);
    }
  }

  const outPath = path.join(root, "tools", outName);
  await page.screenshot({ path: outPath, fullPage: true });
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll(".med-card__name")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        text: el.dataset.name || "",
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        bottom: r.bottom,
      };
    })
  );
  analyzeRedBand(outPath, boxes);

  const first = boxes.find((b) => b.text === "アラバ") || boxes[0];
  if (first) {
    const zoomPath = path.join(root, "tools", outName.replace(/\.png$/, "-zoom.png"));
    await page.screenshot({
      path: zoomPath,
      clip: {
        x: Math.max(0, first.x - 8),
        y: Math.max(0, first.y - 6),
        width: Math.min(300, first.w + 50),
        height: first.h + 16,
      },
    });
    console.log(`[${label}] zoom`, zoomPath);
  }

  await browser.close();
  console.log(`[${label}] OK`, outPath);
}

try {
  await runScenario({
    label: "chromium-narrow",
    launch: () => launchBrowser(),
    contextOptions: { viewport: { width: 400, height: 800 } },
    outName: "med-name-no-underline-verify.png",
  });

  // 本命は iPad Safari のスペル波線なので WebKit も見たいが、未インストールの
  // 環境がある。その場合は落とさずに、飛ばしたことがわかるログを残す。
  const ipad = devices["iPad (gen 7)"] || null;
  try {
    await runScenario({
      label: "webkit-ipad",
      launch: () => webkit.launch({ headless: true }),
      contextOptions: ipad
        ? { ...ipad }
        : {
            viewport: { width: 810, height: 1080 },
            isMobile: true,
            hasTouch: true,
          },
      outName: "med-name-no-underline-ipad.png",
    });
  } catch (err) {
    if (!/Executable doesn't exist/.test(String(err?.message))) throw err;
    console.log(
      "SKIP: WebKit が入っていないため webkit-ipad は未実行（npx playwright install webkit で有効化）"
    );
  }
} finally {
  server.close();
}

console.log("OK: canvas med names have no red underline");
