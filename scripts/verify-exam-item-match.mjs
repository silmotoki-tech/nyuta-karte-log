/**
 * 階層マスタ（ホルモン内訳の ACTH 等）が AI 候補に出ることを検証し、スクショを撮る。
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findExamItemCandidates,
  listExamMatchTargets,
} from "../js/exam-item-match.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "tools/ai-exam-match-acth-verify.png");

/** 現行マスタ相当（血液階層 + 他タブ） */
const master = [
  { id: "seed-blood-cbc", label: "CBC", kind: "leaf", category: "blood", parentId: "" },
  { id: "seed-blood-liver", label: "肝臓", kind: "group", category: "blood", parentId: "" },
  { id: "seed-blood-liver-alt", label: "ALT", kind: "leaf", category: "blood", parentId: "seed-blood-liver" },
  { id: "seed-blood-liver-ast", label: "AST", kind: "leaf", category: "blood", parentId: "seed-blood-liver" },
  { id: "seed-blood-kidney", label: "腎臓", kind: "group", category: "blood", parentId: "" },
  { id: "seed-blood-kidney-bun", label: "BUN", kind: "leaf", category: "blood", parentId: "seed-blood-kidney" },
  { id: "seed-blood-kidney-cre", label: "Cre", kind: "leaf", category: "blood", parentId: "seed-blood-kidney" },
  { id: "seed-blood-lipid", label: "脂質", kind: "group", category: "blood", parentId: "" },
  { id: "seed-blood-lipid-tcho", label: "T-Cho", kind: "leaf", category: "blood", parentId: "seed-blood-lipid" },
  { id: "seed-blood-lipid-tg", label: "TG", kind: "leaf", category: "blood", parentId: "seed-blood-lipid" },
  { id: "seed-blood-hormone", label: "ホルモン", kind: "group", category: "blood", parentId: "" },
  {
    id: "seed-blood-hormone-acth",
    label: "ACTH通常",
    kind: "leaf",
    category: "blood",
    parentId: "seed-blood-hormone",
  },
  {
    id: "seed-blood-hormone-acth-matsuki",
    label: "ACTH松木式",
    kind: "leaf",
    category: "blood",
    parentId: "seed-blood-hormone",
  },
  { id: "seed-blood-hormone-t4", label: "T4", kind: "leaf", category: "blood", parentId: "seed-blood-hormone" },
  { id: "seed-blood-hormone-ft4", label: "fT4", kind: "leaf", category: "blood", parentId: "seed-blood-hormone" },
  { id: "seed-imaging-chest", label: "胸部スク", kind: "leaf", category: "imaging", parentId: "" },
  { id: "seed-other-fecal", label: "便検査", kind: "leaf", category: "other", parentId: "" },
];

const targets = listExamMatchTargets(master);
assert.ok(targets.some((t) => t.label === "ACTH通常" && t.nested), "ACTH通常(内訳)が対象外");
assert.ok(targets.some((t) => t.label === "ALT" && t.nested), "ALT(内訳)が対象外");
assert.ok(targets.some((t) => t.label === "CBC" && !t.nested), "CBC(独立)が対象外");
assert.ok(!targets.some((t) => t.label === "ホルモン"), "大項目ホルモンが対象に混入");

const query = "ACTH刺激試験";
const candidates = findExamItemCandidates(query, master);
const labels = candidates.map((c) => c.label);
assert.ok(labels.includes("ACTH通常"), `候補にACTH通常がない: ${labels.join(", ")}`);
assert.ok(labels.includes("ACTH松木式"), `候補にACTH松木式がない: ${labels.join(", ")}`);
assert.ok(candidates.find((c) => c.label === "ACTH通常")?.nested, "ACTH通常が nested 扱いになっていない");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const nearbyJson = JSON.stringify(
  candidates
    .filter((c) => c.label !== query)
    .map((c) => ({ id: c.label, label: c.displayLabel || c.label }))
);

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI検査名照合プレビュー</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    body { margin: 0; background: var(--color-surface-subtle, #eef0f2); padding: 24px; }
    .preview-card {
      max-width: 520px; margin: 40px auto; background: #fff;
      border: 1px solid var(--color-border); border-radius: 12px; padding: 16px 18px;
    }
  </style>
</head>
<body>
  <div class="preview-card ai-suggest-card">
    <span class="ai-suggest-card__kind">検査予定</span>
    <p class="ai-suggest-card__summary">ACTH刺激試験の予定を登録しますか？</p>
    <div class="ai-suggest-card__form ai-suggest-inline" id="form"></div>
  </div>
  <script type="module">
    import { findExamItemCandidates } from "/js/exam-item-match.js";
    const master = ${JSON.stringify(master)};
    const detected = ${JSON.stringify(query)};
    const nearby = ${nearbyJson};

    const wrap = document.createElement("div");
    wrap.className = "field";
    const lab = document.createElement("span");
    lab.className = "label";
    lab.textContent = "検査項目";
    const note = document.createElement("p");
    note.className = "field__note";
    note.textContent = \`AI検出「\${detected}」に近いマスタ項目があります。登録に使う名称を選んでください。\`;
    const row = document.createElement("div");
    row.className = "exam-item-buttons ai-suggest-exam-candidates";
    const options = [
      ...nearby,
      { id: "__detected__", label: \`検出どおり「\${detected}」で登録\` },
    ];
    options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "exam-item-btn" + (i === options.length - 1 ? " is-selected" : "");
      btn.textContent = opt.label;
      row.appendChild(btn);
    });
    wrap.append(lab, note, row);
    document.getElementById("form").appendChild(wrap);

    // 自己検証
    const cands = findExamItemCandidates(detected, master).map((c) => c.label);
    window.__ok = cands.includes("ACTH通常") && cands.includes("ACTH松木式");
    window.__labels = cands;
    window.__buttonTexts = [...row.querySelectorAll(".exam-item-btn")].map((b) => b.textContent);
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
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 640 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

const ok = await page.evaluate(() => window.__ok);
const buttonTexts = await page.evaluate(() => window.__buttonTexts);
assert.equal(ok, true, "browser-side match failed");
assert.ok(
  buttonTexts.some((t) => t.includes("ACTH通常")),
  `ボタンに ACTH通常 がない: ${buttonTexts.join(" / ")}`
);
assert.ok(
  buttonTexts.some((t) => t.includes("ホルモン")),
  `内訳の親名表示がない: ${buttonTexts.join(" / ")}`
);

await page.screenshot({ path: outPath });
console.log("query:", query);
console.log(
  "candidates:",
  candidates.map((c) => `${c.displayLabel}(${c.score})`).join(", ")
);
console.log("buttons:", buttonTexts.join(" | "));
console.log("OK screenshot:", outPath);

await browser.close();
server.close();
