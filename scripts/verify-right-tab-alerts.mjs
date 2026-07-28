/**
 * 右カラムタブの期限・特記注意色を検証する。
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maxDueAlertLevel } from "../js/right-tab-alerts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const shotDir = path.join(root, "tools/right-tab-alerts");
fs.mkdirSync(shotDir, { recursive: true });

assert.equal(maxDueAlertLevel(["far", "near"]), "near");
assert.equal(maxDueAlertLevel(["near", "close"]), "close");
assert.equal(maxDueAlertLevel(["close", "overdue", "near"]), "overdue");
assert.equal(maxDueAlertLevel(["far"]), null);
assert.equal(maxDueAlertLevel([]), null);
console.log("OK: maxDueAlertLevel ranking");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>right tab alerts</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    body { margin: 0; background: #ddd; }
    .frame {
      width: 420px;
      margin: 24px auto;
      background: var(--color-white);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,.12);
      overflow: hidden;
    }
    .legend {
      padding: 10px 12px 14px;
      font: 600 12px/1.5 system-ui, sans-serif;
      color: #444;
      border-top: 1px solid var(--color-border);
    }
  </style>
</head>
<body>
  <div class="frame">
    <div class="right-tabs" id="right-tabs" role="tablist">
      <button class="right-tab" type="button" data-tab="history">既往歴</button>
      <button class="right-tab is-active" type="button" data-tab="exam">検査</button>
      <button class="right-tab" type="button" data-tab="meds">薬剤</button>
      <button class="right-tab" type="button" data-tab="proc">処置</button>
      <button class="right-tab" type="button" data-tab="notes">特記</button>
      <button class="right-tab" type="button" data-tab="qa">検索</button>
    </div>
    <div class="legend" id="legend"></div>
  </div>
<script type="module">
import { getDueCountdown } from "/js/exam-plan-ui.js";
import {
  maxDueAlertLevel,
  setRightTabDueAlert,
  setRightTabNoteHighAlert,
} from "/js/right-tab-alerts.js";

function ymdOffset(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return \`\${y}-\${m}-\${day}\`;
}

// 検査: 黄（near）とオレンジ（close）→ 最悪はオレンジ
const examNear = getDueCountdown(ymdOffset(20), null);
const examClose = getDueCountdown(ymdOffset(3), null);
const examLevel = maxDueAlertLevel([examNear?.level, examClose?.level]);
setRightTabDueAlert("exam", examLevel);

// 薬剤: 検査と同じロジックで期限切れ間近（黄）
const medNear = getDueCountdown(ymdOffset(20), null);
setRightTabDueAlert("meds", maxDueAlertLevel([medNear?.level]));

// 処置: 超過（赤）
const procOver = getDueCountdown(ymdOffset(-2), null);
setRightTabDueAlert("proc", maxDueAlertLevel([procOver?.level]));

// 特記: 高あり → 赤
setRightTabNoteHighAlert(true);

function cls(tab) {
  const btn = document.querySelector(\`#right-tabs .right-tab[data-tab="\${tab}"]\`);
  return [...(btn?.classList || [])].filter((c) => c.startsWith("right-tab--")).join(" ");
}

const colors = {};
for (const tab of ["history", "exam", "meds", "proc", "notes", "qa"]) {
  const btn = document.querySelector(\`#right-tabs .right-tab[data-tab="\${tab}"]\`);
  colors[tab] = getComputedStyle(btn).color;
}

window.__result = {
  examLevel,
  medLevel: medNear?.level || null,
  procLevel: procOver?.level || null,
  classes: {
    history: cls("history"),
    exam: cls("exam"),
    meds: cls("meds"),
    proc: cls("proc"),
    notes: cls("notes"),
    qa: cls("qa"),
  },
  colors,
};

document.getElementById("legend").textContent =
  \`検査=\${examLevel} / 薬剤=\${medNear?.level} / 処置=\${procOver?.level} / 特記=high\`;
window.__ready = true;
</script>
</body>
</html>`;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/" || urlPath === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(harness);
        return;
      }
      const filePath = path.join(root, urlPath.replace(/^\//, ""));
      if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(fs.readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function launchBrowser() {
  for (const executablePath of [
    undefined,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    try {
      return await chromium.launch(
        executablePath ? { executablePath, headless: true } : { headless: true }
      );
    } catch (err) {
      console.warn("launch failed", executablePath || "playwright", err.message);
    }
  }
  throw new Error("Unable to launch browser");
}

const { server, port } = await startServer();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 520, height: 320 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  const result = await page.evaluate(() => window.__result);
  console.log(result);

  assert.equal(result.examLevel, "close", "exam should take worst of near+close");
  assert.equal(result.classes.exam, "right-tab--due-close");
  assert.equal(result.classes.meds, "right-tab--due-near");
  assert.equal(result.classes.proc, "right-tab--due-overdue");
  assert.equal(result.classes.notes, "right-tab--note-high");
  assert.equal(result.classes.history, "");
  assert.equal(result.classes.qa, "");

  // 色がデフォルト灰と異なること（検査オレンジ・特記赤など）
  const muted = await page.evaluate(() => {
    const el = document.createElement("button");
    el.className = "right-tab";
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  });
  assert.notEqual(result.colors.exam, muted);
  assert.notEqual(result.colors.notes, muted);
  assert.equal(result.colors.history, muted);
  assert.equal(result.colors.qa, muted);

  await page.screenshot({
    path: path.join(shotDir, "01-all-alerts.png"),
    fullPage: true,
  });

  // 個別強調スクショ（検査タブ付近）
  await page.locator("#right-tabs").screenshot({
    path: path.join(shotDir, "02-tabs-closeup.png"),
  });

  if (errors.length) throw new Error(errors.join("\n"));
  console.log("OK: right tab alerts", shotDir);
} finally {
  await browser.close();
  server.close();
}
