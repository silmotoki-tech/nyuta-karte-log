/**
 * 検査タブ: 実施履歴の枠線なし＋予定一覧の余白をスクショ検証する。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
<style>
  body { margin: 0; background: #f3f4f6; }
  .wrap { width: 360px; padding: 16px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="right-panel" id="panel-exam">
    <div class="exam-section">
      <div class="exam-section__head">
        <h3 class="exam-section__title">検査予定一覧</h3>
      </div>
      <ul class="exam-list" id="exam-plan-list"></ul>
    </div>
    <div class="exam-section" style="margin-top:12px">
      <h3 class="exam-section__title">実施履歴</h3>
      <ul class="exam-list" id="exam-history-list"></ul>
    </div>
  </div>
</div>
<script type="module">
  import { enableRowGestures } from "/js/row-gestures.js";

  function addPlan(list, item, due, note) {
    const li = document.createElement("li");
    li.className = "exam-list-item";
    const info = document.createElement("div");
    info.className = "exam-list-item__info";
    const head = document.createElement("div");
    head.className = "exam-list-item__head";
    const title = document.createElement("div");
    title.className = "exam-list-item__title";
    title.textContent = item;
    const dueEl = document.createElement("div");
    dueEl.className = "exam-list-item__due exam-due-text--far";
    dueEl.textContent = due;
    head.append(title, dueEl);
    info.appendChild(head);
    if (note) {
      const n = document.createElement("div");
      n.className = "exam-list-item__note";
      n.textContent = note;
      info.appendChild(n);
    }
    li.appendChild(info);
    enableRowGestures(li, { actions: [{ action: "edit", title: "編集", onClick: () => {} }] });
    list.appendChild(li);
  }

  function addHistory(list, item, year, md, note) {
    const li = document.createElement("li");
    li.className = "exam-list-item exam-list-item--history";
    const info = document.createElement("div");
    info.className = "exam-list-item__info";
    const head = document.createElement("div");
    head.className = "exam-list-item__head";
    const title = document.createElement("div");
    title.className = "exam-list-item__title";
    title.textContent = item;
    const dateEl = document.createElement("div");
    dateEl.className = "exam-history-date";
    const y = document.createElement("span");
    y.className = "exam-history-date__year";
    y.textContent = year;
    const m = document.createElement("span");
    m.className = "exam-history-date__md";
    m.textContent = md;
    dateEl.append(y, m);
    head.append(title, dateEl);
    info.appendChild(head);
    if (note) {
      const n = document.createElement("div");
      n.className = "exam-list-item__note";
      n.textContent = note;
      info.appendChild(n);
    }
    li.appendChild(info);
    enableRowGestures(li, { actions: [{ action: "refresh", title: "予定に戻す", onClick: () => {} }] });
    list.appendChild(li);
  }

  const plans = document.getElementById("exam-plan-list");
  addPlan(plans, "UPC(外注)", "あと12日", "");
  addPlan(plans, "ACTH", "あと20日", "");
  addPlan(plans, "胸部スク", "あと5日", "咳が続くため再検");
  addPlan(plans, "血液検査", "あと30日", "術後フォロー");

  const hist = document.getElementById("exam-history-list");
  addHistory(hist, "ACTH", "2026", "7/22", "");
  addHistory(hist, "心臓エコー", "2026", "7/10", "");
  addHistory(hist, "便検査", "2026", "6/28", "再検査");
  addHistory(hist, "腹部エコー", "2026", "5/01", "");
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/" || u === "/harness.html") {
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
  const ext = path.extname(fp);
  const type =
    ext === ".css"
      ? "text/css"
      : ext === ".js"
        ? "text/javascript"
        : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({
  executablePath: SYSTEM_CHROME,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 400, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForSelector("#exam-plan-list .exam-list-item");
await page.waitForSelector("#exam-history-list .exam-list-item");

const metrics = await page.evaluate(() => {
  const plans = [...document.querySelectorAll("#exam-plan-list .exam-list-item")];
  const hist = [...document.querySelectorAll("#exam-history-list .exam-list-item")];
  const planPads = plans.map((el) => {
    const front = el.querySelector(".swipeable__front") || el;
    const cs = getComputedStyle(front);
    const hasNote = !!el.querySelector(".exam-list-item__note");
    return {
      hasNote,
      padTop: parseFloat(cs.paddingTop),
      padBottom: parseFloat(cs.paddingBottom),
      height: front.getBoundingClientRect().height,
      border: cs.border,
      boxShadow: cs.boxShadow,
    };
  });
  const histStyles = hist.map((el) => {
    const front = el.querySelector(".swipeable__front") || el;
    const cs = getComputedStyle(front);
    const liCs = getComputedStyle(el);
    return {
      frontBg: cs.backgroundColor,
      liBg: liCs.backgroundColor,
      border: `${liCs.borderTopWidth} ${liCs.borderRightWidth} ${liCs.borderBottomWidth} ${liCs.borderLeftWidth}`,
      radius: liCs.borderRadius,
      boxShadow: liCs.boxShadow,
    };
  });
  return { planPads, histStyles };
});

const noMemo = metrics.planPads.filter((p) => !p.hasNote);
const withMemo = metrics.planPads.filter((p) => p.hasNote);
const minPad = Math.min(...metrics.planPads.map((p) => p.padTop + p.padBottom));
const histBordersOk = metrics.histStyles.every((h) => {
  const [t, r, b, l] = h.border.split(" ");
  return t === "0px" && r === "0px" && l === "0px" && b === "1px";
});
const histNoCardOk = metrics.histStyles.every(
  (h) => h.boxShadow === "none" && h.radius === "0px"
);

const padOk = minPad >= 24; // 13+13
const noMemoHeightOk = noMemo.every((p) => p.height >= 44);

await page.locator(".wrap").screenshot({
  path: path.join(root, "tools/exam-list-spacing-verify.png"),
});
await page.locator(".exam-section").nth(0).screenshot({
  path: path.join(root, "tools/exam-plan-spacing-after.png"),
});
await page.locator(".exam-section").nth(1).screenshot({
  path: path.join(root, "tools/exam-history-noborder-after.png"),
});

console.log(
  JSON.stringify(
    {
      minPad,
      padOk,
      noMemoHeightOk,
      histBordersOk,
      histNoCardOk,
      noMemo,
      withMemo,
      histStyles: metrics.histStyles,
    },
    null,
    2
  )
);

await browser.close();
server.close();

if (!padOk || !noMemoHeightOk || !histBordersOk || !histNoCardOk) {
  console.error("VERIFY_FAILED");
  process.exit(1);
}
console.log("VERIFY_OK");
