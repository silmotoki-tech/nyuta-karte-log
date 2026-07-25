/**
 * 薬剤名に赤い下線（スペルチェック波線／装飾）が出ないことを検証する。
 * Chromium（狭い右カラム）と WebKit + iPad ビューポートの両方で確認する。
 */
import { chromium, webkit, devices } from "playwright";
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
      <ul class="meds-list" id="meds-list" spellcheck="false" lang="ja"></ul>
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
  header.spellcheck = false;
  const signs = document.createElement("span");
  signs.className = "med-card__signs";
  const nameEl = document.createElement("span");
  nameEl.className = "med-card__name";
  nameEl.spellcheck = false;
  nameEl.dataset.name = Array.from(name).join("\u200B");
  nameEl.setAttribute("aria-label", name);
  nameEl.textContent = "";
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
  if (r.status !== 0) {
    throw new Error(`pixel analysis failed for ${pngPath}`);
  }
}

async function runScenario({ label, browserType, contextOptions, outName }) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(500);

  const styles = await page.evaluate(() =>
    [...document.querySelectorAll(".med-card__name")].map((el) => {
      const cs = getComputedStyle(el);
      const before = getComputedStyle(el, "::before");
      return {
        dataName: el.dataset.name || "",
        textContent: el.textContent || "",
        textDecorationLine: cs.textDecorationLine,
        webkitTextDecorationLine: cs.webkitTextDecorationLine || "",
        beforeContent: before.content,
        spellcheck: el.spellcheck,
      };
    })
  );
  console.log(`[${label}] STYLES`, styles);

  for (const s of styles) {
    if (s.textContent.trim() !== "") {
      throw new Error(`[${label}] name should use empty textContent (got "${s.textContent}")`);
    }
    if (!s.dataName) throw new Error(`[${label}] missing data-name`);
    if (!s.dataName.includes("\u200B") && s.dataName.length > 1) {
      throw new Error(`[${label}] data-name should contain ZWSP separators`);
    }
    if (s.textDecorationLine && s.textDecorationLine !== "none") {
      throw new Error(`[${label}] text-decoration-line=${s.textDecorationLine}`);
    }
  }

  // 期限アラート時も名前色が赤にならないこと
  const nameColors = await page.evaluate(() =>
    [...document.querySelectorAll(".med-card.is-overdue .med-card__name")].map((el) =>
      getComputedStyle(el).color
    )
  );
  for (const c of nameColors) {
    // rgb of --color-text (near black), not danger red
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) continue;
    const [, r, g, b] = m.map(Number);
    if (r > 150 && g < 100 && b < 100) {
      throw new Error(`[${label}] overdue name still red: ${c}`);
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

  // 名前直下の拡大スクショ（目視確認用）
  const first = boxes[0];
  if (first) {
    const zoomPath = path.join(
      root,
      "tools",
      outName.replace(/\.png$/, "-zoom.png")
    );
    await page.screenshot({
      path: zoomPath,
      clip: {
        x: Math.max(0, first.x - 4),
        y: Math.max(0, first.y - 4),
        width: Math.min(280, first.w + 40),
        height: first.h + 12,
      },
    });
    console.log(`[${label}] zoom saved`, zoomPath);
  }

  await browser.close();
  console.log(`[${label}] OK`, outPath);
}

try {
  await runScenario({
    label: "chromium-narrow",
    browserType: chromium,
    contextOptions: { viewport: { width: 400, height: 800 } },
    outName: "med-name-no-underline-verify.png",
  });

  const ipad = devices["iPad (gen 7)"] || devices["iPad Mini"] || null;
  await runScenario({
    label: "webkit-ipad",
    browserType: webkit,
    contextOptions: ipad
      ? { ...ipad }
      : {
          viewport: { width: 810, height: 1080 },
          userAgent:
            "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          isMobile: true,
          hasTouch: true,
        },
    outName: "med-name-no-underline-ipad.png",
  });

  // 820px 境界付近（レスポンシブ保険）でも同様
  await runScenario({
    label: "webkit-820",
    browserType: webkit,
    contextOptions: {
      viewport: { width: 820, height: 1180 },
      isMobile: true,
      hasTouch: true,
    },
    outName: "med-name-no-underline-820.png",
  });
} finally {
  server.close();
}

console.log("OK: chromium + webkit/iPad underlines cleared");
