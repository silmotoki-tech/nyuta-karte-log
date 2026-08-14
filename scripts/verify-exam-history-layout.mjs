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
      return await chromium.launch({ executablePath, headless: true, timeout: 30_000 });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  throw new Error("Could not launch browser");
}

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>exam history layout</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    html, body { margin: 0; background: #e5e5e5; }
    .wrap {
      width: 320px; margin: 24px auto; padding: 12px;
      background: var(--color-surface-subtle); border-radius: 10px;
    }
    .banner { font: 700 12px/1.3 sans-serif; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="banner">AFTER: 実施履歴（検査名＋右寄せ2段日付）</div>
    <section class="exam-section">
      <h3 class="exam-section__title">実施履歴</h3>
      <ul class="exam-list" id="exam-history-list"></ul>
    </section>
  </div>
  <script type="module">
    import { enableRowGestures } from "/js/row-gestures.js";

    function historyDateParts(dateStr) {
      if (!dateStr) return { year: "", md: "日付未設定" };
      const [y, m, d] = dateStr.split("-");
      if (!y || !m || !d) return { year: "", md: dateStr };
      return { year: y, md: \`\${Number(m)}/\${Number(d)}\` };
    }

    const rows = [
      { item: "ACTH", date: "2026-07-22" },
      { item: "UPC(外注)", date: "2026-06-10", note: "再検査" },
      { item: "腹部エコー", date: "2026-05-01" },
    ];
    const list = document.getElementById("exam-history-list");
    rows.forEach((h) => {
      const li = document.createElement("li");
      li.className = "exam-list-item exam-list-item--history";
      const info = document.createElement("div");
      info.className = "exam-list-item__info";
      const head = document.createElement("div");
      head.className = "exam-list-item__head";
      const title = document.createElement("div");
      title.className = "exam-list-item__title";
      title.textContent = h.item;
      const dateEl = document.createElement("div");
      dateEl.className = "exam-history-date";
      const parts = historyDateParts(h.date);
      const yearEl = document.createElement("span");
      yearEl.className = "exam-history-date__year";
      yearEl.textContent = parts.year;
      const mdEl = document.createElement("span");
      mdEl.className = "exam-history-date__md";
      mdEl.textContent = parts.md;
      dateEl.append(yearEl, mdEl);
      head.append(title, dateEl);
      info.appendChild(head);
      if (h.note) {
        const note = document.createElement("div");
        note.className = "exam-list-item__note";
        note.textContent = h.note;
        info.appendChild(note);
      }
      li.appendChild(info);
      enableRowGestures(li, {
        actions: [{ action: "refresh", title: "予定に戻す", onClick: () => {} }],
      });
      list.appendChild(li);
    });

    const text = list.innerText;
    if (text.includes("実施履歴") && text.split("実施履歴").length > 2) {
      // section title contains 実施履歴 once; row text must not
    }
    const bad = [...list.querySelectorAll(".exam-list-item")].some((el) =>
      /実施履歴|左スワイプ/.test(el.innerText)
    );
    document.title = JSON.stringify({
      bad,
      sample: list.querySelector(".exam-list-item")?.innerText.replace(/\\s+/g, " "),
      hasStackedDate: Boolean(list.querySelector(".exam-history-date__year")),
    });
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const filePath = path.join(root, url.replace(/^\//, ""));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type":
      ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "application/octet-stream",
  });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 400, height: 520 } });
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(100);
const metrics = JSON.parse(await page.title());
console.log(metrics);
if (metrics.bad) throw new Error("history rows still contain 実施履歴 or swipe hint");
if (!metrics.hasStackedDate) throw new Error("stacked date missing");

const out = path.join(root, "tools/exam-history-layout.png");
await page.locator(".wrap").screenshot({ path: out });
console.log("WROTE", out);
await browser.close();
server.close();
