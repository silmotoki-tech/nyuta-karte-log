/**
 * 検査・薬剤マスタ検索候補が「名前（大分類 > 中項目）」形式であることを検証する。
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findExamItemCandidates,
  formatMasterItemDisplayLabel,
} from "../js/exam-item-match.js";
import { findMedicationItemCandidates } from "../js/med-item-match.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "tools", "master-search-path-label");
fs.mkdirSync(outDir, { recursive: true });
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

assert.equal(
  formatMasterItemDisplayLabel("アモキシシリン", {
    categoryLabel: "内服薬",
    parentLabel: "抗生剤",
  }),
  "アモキシシリン（内服薬 > 抗生剤）"
);
assert.equal(
  formatMasterItemDisplayLabel("CBC", { categoryLabel: "血液" }),
  "CBC（血液）"
);

const examMaster = [
  { id: "seed-blood-hormone", label: "ホルモン", kind: "group", category: "blood", parentId: "" },
  {
    id: "seed-blood-acth-normal",
    label: "ACTH通常",
    kind: "leaf",
    category: "blood",
    parentId: "seed-blood-hormone",
  },
  {
    id: "seed-blood-acth-matsuki",
    label: "ACTH松木式",
    kind: "leaf",
    category: "blood",
    parentId: "seed-blood-hormone",
  },
];

const examCandidates = findExamItemCandidates("ACTH刺激試験", examMaster);
const examLabels = examCandidates.map((c) => c.displayLabel);
console.log("exam", examLabels);
assert.ok(
  examLabels.some((t) => t === "ACTH通常（血液 > ホルモン）"),
  "exam display missing category: " + examLabels.join(", ")
);
assert.ok(
  examLabels.some((t) => t === "ACTH松木式（血液 > ホルモン）"),
  "exam matsuki missing category"
);

const medMaster = [
  { id: "seed-med-oral-antibiotic", label: "抗生剤", kind: "group", category: "oral", parentId: "" },
  {
    id: "leaf-amox",
    label: "アモキシシリン",
    kind: "leaf",
    category: "oral",
    parentId: "seed-med-oral-antibiotic",
  },
  {
    id: "leaf-cefa",
    label: "セファレキシン",
    kind: "leaf",
    category: "oral",
    parentId: "seed-med-oral-antibiotic",
  },
];

const medCandidates = findMedicationItemCandidates("アモキシ", medMaster);
const medLabels = medCandidates.map((c) => c.displayLabel);
console.log("med", medLabels);
assert.ok(
  medLabels.includes("アモキシシリン（内服薬 > 抗生剤）"),
  "med display missing: " + medLabels.join(", ")
);

const nearbyExam = examCandidates
  .filter((c) => c.label !== "ACTH刺激試験")
  .map((c) => ({ id: c.label, label: c.displayLabel }));
const nearbyMed = medCandidates.map((c) => ({
  id: c.label,
  label: c.displayLabel,
}));

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>マスタ検索パス表示</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    body { margin: 0; background: #eef0f2; padding: 24px; }
    .wrap { display: grid; gap: 20px; max-width: 560px; margin: 0 auto; }
    .preview-card {
      background: #fff; border: 1px solid var(--color-border);
      border-radius: 12px; padding: 16px 18px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="preview-card ai-suggest-card" id="exam-card">
      <span class="ai-suggest-card__kind">検査予定</span>
      <p class="ai-suggest-card__summary">ACTH刺激試験の予定を登録しますか？</p>
      <div class="field">
        <span class="label">検査項目</span>
        <p class="field__note">AI検出「ACTH刺激試験」に近いマスタ項目があります。</p>
        <div class="exam-item-buttons ai-suggest-exam-candidates" id="exam-row"></div>
      </div>
    </div>
    <div class="preview-card ai-suggest-card" id="med-card">
      <span class="ai-suggest-card__kind">薬剤情報</span>
      <p class="ai-suggest-card__summary">アモキシシリンについて、薬剤情報タブで記録しますか？</p>
      <div class="field">
        <span class="label">薬剤名</span>
        <p class="field__note">AI検出「アモキシ」に近いマスタ項目があります。</p>
        <div class="exam-item-buttons ai-suggest-exam-candidates" id="med-row"></div>
      </div>
    </div>
  </div>
  <script type="module">
    const examNearby = ${JSON.stringify(nearbyExam)};
    const medNearby = ${JSON.stringify(nearbyMed)};
    function fill(rowId, options) {
      const row = document.getElementById(rowId);
      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "exam-item-btn";
        btn.textContent = opt.label;
        row.appendChild(btn);
      });
    }
    fill("exam-row", examNearby);
    fill("med-row", medNearby);
    window.__examTexts = [...document.querySelectorAll("#exam-row .exam-item-btn")].map((b) => b.textContent);
    window.__medTexts = [...document.querySelectorAll("#med-row .exam-item-btn")].map((b) => b.textContent);
    window.__ready = true;
  </script>
</body>
</html>`;

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
const page = await browser.newPage({ viewport: { width: 720, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ready === true);

const texts = await page.evaluate(() => ({
  exam: window.__examTexts,
  med: window.__medTexts,
}));
console.log(texts);
assert.ok(texts.exam.some((t) => t.includes("血液 > ホルモン")));
assert.ok(texts.med.some((t) => t.includes("内服薬 > 抗生剤")));
assert.ok(texts.med.some((t) => t.startsWith("アモキシシリン（")));

await page.screenshot({
  path: path.join(outDir, "01-exam-and-med-search.png"),
  fullPage: false,
});
await page.locator("#exam-card").screenshot({
  path: path.join(outDir, "02-exam-search.png"),
});
await page.locator("#med-card").screenshot({
  path: path.join(outDir, "03-med-search.png"),
});

await browser.close();
server.close();
console.log("OK: master search shows major > mid");
console.log("shots:", outDir);
