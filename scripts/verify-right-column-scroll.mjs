/**
 * 右カラム: タブ固定＋コンテンツ縦スクロールを検証する。
 * 10件以上の項目で scrollHeight > clientHeight、スクロール後に末尾が見えること、
 * タブバーがビューポート上部に留まることを確認する。
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
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
<style>html,body{height:100%;margin:0;overflow:hidden}</style>
</head><body>
<div class="app" style="display:flex">
  <div class="layout">
    <aside class="col col--left"><div class="col-left__inner"><p class="col__title">見出し</p></div></aside>
    <section class="col col--center"><div style="padding:12px">中央</div></section>
    <aside class="col col--right" id="col-right">
      <div class="right-tabs" id="right-tabs" role="tablist">
        <button class="right-tab" type="button" data-tab="history">既往歴</button>
        <button class="right-tab is-active" type="button" data-tab="exam">検査</button>
        <button class="right-tab" type="button" data-tab="meds">薬剤</button>
        <button class="right-tab" type="button" data-tab="proc">処置</button>
        <button class="right-tab" type="button" data-tab="qa">検索</button>
      </div>

      <div class="right-panel" id="panel-history" data-panel="history" hidden>
        <div class="exam-toolbar"><button class="btn btn--small btn--primary" type="button">既往歴を追加</button></div>
        <section class="exam-section">
          <h3 class="exam-section__title">既往歴一覧</h3>
          <ul class="meds-list" id="history-list"></ul>
        </section>
      </div>

      <div class="right-panel" id="panel-exam" data-panel="exam">
        <div class="exam-toolbar"><button class="btn btn--small btn--primary" type="button">予定を登録</button></div>
        <section class="exam-section">
          <div class="exam-section__head"><h3 class="exam-section__title">検査予定一覧</h3></div>
          <ul class="exam-list" id="exam-plan-list"></ul>
        </section>
        <section class="exam-section">
          <h3 class="exam-section__title">実施履歴</h3>
          <ul class="exam-list" id="exam-history-list"></ul>
        </section>
      </div>

      <div class="right-panel" id="panel-meds" data-panel="meds" hidden>
        <div class="exam-toolbar"><button class="btn btn--small btn--primary" type="button">薬剤を追加</button></div>
        <section class="exam-section">
          <h3 class="exam-section__title">薬剤一覧</h3>
          <ul class="meds-list" id="meds-list"></ul>
        </section>
      </div>

      <div class="right-panel" id="panel-proc" data-panel="proc" hidden>
        <div class="exam-toolbar"><button class="btn btn--small btn--primary" type="button">処置を追加</button></div>
        <section class="exam-section">
          <h3 class="exam-section__title">処置ログ一覧</h3>
          <ul class="proc-list" id="proc-list"></ul>
        </section>
      </div>

      <div class="right-panel" id="panel-qa" data-panel="qa" hidden>
        <section class="exam-section">
          <h3 class="exam-section__title">新規質問</h3>
          <div class="qa-compose">
            <textarea class="textarea" rows="2" id="free-qa-input"></textarea>
            <button class="btn btn--small btn--primary" type="button">質問する</button>
          </div>
        </section>
        <section class="exam-section">
          <h3 class="exam-section__title">質問履歴</h3>
          <ul class="qa-list" id="qa-list"></ul>
        </section>
      </div>
    </aside>
  </div>
</div>
<script type="module">
  function fillList(el, n, makeItem) {
    el.innerHTML = "";
    for (let i = 1; i <= n; i++) el.appendChild(makeItem(i));
  }
  function examItem(i) {
    const li = document.createElement("li");
    li.className = "exam-list-item";
    li.innerHTML = '<div class="exam-list-item__info"><div class="exam-list-item__head"><span class="exam-list-item__title">検査項目 ' + i + '</span><span class="exam-list-item__due">あと' + i + '日</span></div></div>';
    return li;
  }
  function medItem(i) {
    const li = document.createElement("li");
    li.className = "med-card";
    li.style.padding = "12px 0";
    li.innerHTML = '<div class="med-card__header"><span class="med-card__name">薬剤 ' + i + '</span></div><div class="field__note">用法メモ ' + i + ' / 使用中</div>';
    return li;
  }
  function histItem(i) {
    const li = document.createElement("li");
    li.className = "med-card";
    li.style.padding = "14px 0";
    li.innerHTML = '<div class="med-card__header"><span class="med-card__name">既往歴項目 ' + i + '</span></div><div class="field__note">詳細メモ行 ' + i + '</div>';
    return li;
  }
  function procItem(i) {
    const li = document.createElement("li");
    li.className = "proc-card";
    li.style.padding = "14px 0";
    li.innerHTML = '<div class="proc-card__date">2026-07-' + String((i % 28) + 1).padStart(2, "0") + '</div><div class="proc-card__content">処置内容 ' + i + ' の詳細テキスト</div><div class="proc-card__meta">記入: 院長</div>';
    return li;
  }
  function qaItem(i) {
    const li = document.createElement("li");
    li.className = "qa-card";
    li.innerHTML = '<p class="qa-card__label">質問</p><p class="qa-card__question">この患者の質問文 ' + i + ' について教えてください</p><p class="qa-card__meta">2026/7/25 10:' + String(i).padStart(2,"0") + '</p><p class="qa-card__label">回答</p><p class="qa-card__answer">回答テキスト ' + i + '。カルテ上の記載をもとにした説明です。</p>';
    return li;
  }

  fillList(document.getElementById("exam-plan-list"), 12, examItem);
  fillList(document.getElementById("exam-history-list"), 8, (i) => examItem(100 + i));
  fillList(document.getElementById("meds-list"), 14, medItem);
  fillList(document.getElementById("history-list"), 14, histItem);
  fillList(document.getElementById("proc-list"), 14, procItem);
  fillList(document.getElementById("qa-list"), 12, qaItem);

  const tabs = document.getElementById("right-tabs");
  const panels = [...document.querySelectorAll(".right-panel")];
  tabs.querySelectorAll(".right-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.querySelectorAll(".right-tab").forEach((b) => b.classList.toggle("is-active", b === btn));
      panels.forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
    });
  });

  window.__scrollReady = true;
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
    ? "text/css; charset=utf-8"
    : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });

await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__scrollReady === true);

async function measure(panelId) {
  return page.evaluate((id) => {
    const panel = document.getElementById(id);
    const tabs = document.getElementById("right-tabs");
    const items = panel.querySelectorAll(
      ".exam-list-item, .med-card, .proc-card, .qa-card"
    );
    const last = items[items.length - 1];
    const tabsRect = tabs.getBoundingClientRect();
    return {
      panelId: id,
      itemCount: items.length,
      clientHeight: panel.clientHeight,
      scrollHeight: panel.scrollHeight,
      canScroll: panel.scrollHeight > panel.clientHeight + 2,
      tabsTop: tabsRect.top,
      tabsBottom: tabsRect.bottom,
      lastBottomBefore: last ? last.getBoundingClientRect().bottom : null,
      viewportH: window.innerHeight,
    };
  }, panelId);
}

async function scrollToEnd(panelId) {
  return page.evaluate((id) => {
    const panel = document.getElementById(id);
    const tabs = document.getElementById("right-tabs");
    panel.scrollTop = panel.scrollHeight;
    const items = panel.querySelectorAll(
      ".exam-list-item, .med-card, .proc-card, .qa-card"
    );
    const last = items[items.length - 1];
    const lastRect = last.getBoundingClientRect();
    const tabsRect = tabs.getBoundingClientRect();
    return {
      scrollTop: panel.scrollTop,
      lastBottom: lastRect.bottom,
      lastVisible: lastRect.bottom <= window.innerHeight + 1 && lastRect.top < window.innerHeight,
      tabsStillFixed: tabsRect.top >= 0 && tabsRect.top < 80,
      tabsBottom: tabsRect.bottom,
    };
  }, panelId);
}

const tabsToTest = [
  { tab: "exam", panel: "panel-exam" },
  { tab: "meds", panel: "panel-meds" },
  { tab: "history", panel: "panel-history" },
  { tab: "proc", panel: "panel-proc" },
  { tab: "qa", panel: "panel-qa" },
];

for (const { tab, panel } of tabsToTest) {
  await page.locator(`.right-tab[data-tab="${tab}"]`).click();
  await page.waitForTimeout(50);
  const before = await measure(panel);
  console.log("BEFORE", before);
  if (before.itemCount < 10) {
    throw new Error(`${panel}: expected >=10 items, got ${before.itemCount}`);
  }
  if (!before.canScroll) {
    throw new Error(
      `${panel}: cannot scroll (scrollHeight=${before.scrollHeight}, clientHeight=${before.clientHeight})`
    );
  }
  // 末尾はスクロール前には画面外
  if (before.lastBottomBefore <= before.viewportH) {
    throw new Error(`${panel}: last item already in view before scroll (list not tall enough?)`);
  }

  const after = await scrollToEnd(panel);
  console.log("AFTER", { panel, ...after });
  if (!after.lastVisible) {
    throw new Error(`${panel}: last item not visible after scroll`);
  }
  if (!after.tabsStillFixed) {
    throw new Error(`${panel}: tabs moved away from top after scroll`);
  }
}

await page.screenshot({
  path: path.join(root, "tools/right-column-scroll-verify.png"),
  fullPage: false,
});

console.log("OK: all right-column tabs scroll with tabs fixed");
await browser.close();
server.close();
