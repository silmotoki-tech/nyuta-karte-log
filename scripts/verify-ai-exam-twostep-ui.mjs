/**
 * AI提案の検査2段階UI（キーワード一覧→詳細候補）をスクショ検証する。
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findExamItemCandidates } from "../js/exam-item-match.js";
import { FULL_EXAM_MASTER } from "./verify-exam-item-match-all.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const shot1 = path.join(root, "tools/ai-exam-twostep-stage1.png");
const shot2 = path.join(root, "tools/ai-exam-twostep-stage2.png");

const keywords = [
  { id: "e1", label: "ACTH刺激試験", status: "pending" },
  { id: "e2", label: "尿検査", status: "pending" },
  { id: "e3", label: "便検査", status: "done" },
];

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const acthCandidates = findExamItemCandidates("ACTH刺激試験", FULL_EXAM_MASTER)
  .filter((c) => c.label !== "ACTH刺激試験")
  .slice(0, 4)
  .map((c) => ({ id: c.label, label: c.displayLabel || c.label }));

const harness = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI検査2段階UI</title>
  <link rel="stylesheet" href="/css/style.css" />
  <style>
    body { margin: 0; background: #eef0f2; padding: 24px; }
    .modal-like {
      max-width: 520px; margin: 20px auto; background: #fff;
      border-radius: 12px; padding: 16px 18px; box-shadow: 0 8px 24px rgba(0,0,0,.08);
    }
  </style>
</head>
<body>
  <div class="modal-like">
    <h2 class="modal__title" style="margin:0 0 8px">AIからの提案</h2>
    <p class="field__note" id="progress">未対応の提案が 2 件あります。検査はキーワードを選んで候補を確認し、「登録」または「無視」を選んでください。</p>
    <ul class="ai-suggest-list" id="list"></ul>
  </div>
  <script type="module">
    const keywords = ${JSON.stringify(keywords)};
    const acthCandidates = ${JSON.stringify(acthCandidates)};
    let selected = null;
    const list = document.getElementById("list");

    function render() {
      list.innerHTML = "";
      const stage = document.createElement("li");
      stage.className = "ai-suggest-exam-stage";
      stage.innerHTML = '<h3 class="ai-suggest-exam-stage__title">検出された検査キーワード</h3><p class="field__note">キーワードを選ぶと、マスタとの照合候補を表示します。</p>';
      const row = document.createElement("div");
      row.className = "ai-suggest-keyword-row";
      keywords.forEach((k) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ai-suggest-keyword-btn";
        btn.textContent = k.label;
        if (k.status === "done") {
          btn.classList.add("is-done");
          btn.disabled = true;
          const mark = document.createElement("span");
          mark.className = "ai-suggest-keyword-btn__mark";
          mark.textContent = "済み";
          btn.appendChild(mark);
        } else {
          btn.classList.toggle("is-selected", selected === k.id);
          btn.addEventListener("click", () => {
            selected = selected === k.id ? null : k.id;
            render();
          });
        }
        row.appendChild(btn);
      });
      stage.appendChild(row);
      list.appendChild(stage);

      if (!selected) {
        const hint = document.createElement("li");
        hint.className = "ai-suggest-exam-hint";
        hint.textContent = "上のキーワードを選ぶと、マスタ候補が表示されます。";
        list.appendChild(hint);
        return;
      }

      const detail = document.createElement("li");
      detail.className = "ai-suggest-card ai-suggest-card--exam-detail";
      const kw = keywords.find((k) => k.id === selected);
      detail.innerHTML = \`
        <div class="ai-suggest-card__detail-head">
          <span class="ai-suggest-card__kind">検査予定</span>
          <p class="ai-suggest-card__summary">「\${kw.label}」の登録内容</p>
        </div>
      \`;
      const form = document.createElement("div");
      form.className = "ai-suggest-card__form";
      const field = document.createElement("div");
      field.className = "field";
      field.innerHTML = '<span class="label">検査項目</span><p class="field__note">AI検出に近いマスタ項目があります。登録に使う名称を選んでください。</p>';
      const candRow = document.createElement("div");
      candRow.className = "exam-item-buttons ai-suggest-exam-candidates";
      const opts = [
        ...acthCandidates,
        { id: "__detected__", label: \`検出どおり「\${kw.label}」で登録\` },
      ];
      opts.forEach((opt, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "exam-item-btn" + (i === opts.length - 1 ? " is-selected" : "");
        b.textContent = opt.label;
        candRow.appendChild(b);
      });
      field.appendChild(candRow);
      form.appendChild(field);
      const actions = document.createElement("div");
      actions.className = "ai-suggest-card__actions";
      actions.innerHTML = '<button type="button" class="btn btn--small btn--primary">この内容で登録する</button><button type="button" class="btn btn--small btn--outline">無視する</button><button type="button" class="btn btn--small btn--ghost">一覧に戻る</button>';
      detail.append(form, actions);
      list.appendChild(detail);
    }
    render();
    window.__select = (id) => { selected = id; render(); };
    window.__keywordTexts = () => [...document.querySelectorAll(".ai-suggest-keyword-btn")].map((b) => b.textContent);
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
const page = await browser.newPage({ viewport: { width: 720, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

const texts1 = await page.evaluate(() => window.__keywordTexts());
assert.ok(texts1.some((t) => t.includes("ACTH刺激試験")));
assert.ok(texts1.some((t) => t.includes("尿検査")));
assert.ok(texts1.some((t) => t.includes("便検査") && t.includes("済み")));
assert.equal(await page.locator(".ai-suggest-card--exam-detail").count(), 0);
await page.screenshot({ path: shot1 });

await page.evaluate(() => window.__select("e1"));
await page.waitForSelector(".ai-suggest-card--exam-detail");
const detailText = await page.locator(".ai-suggest-card--exam-detail").innerText();
assert.ok(detailText.includes("ACTH通常") || detailText.includes("ACTH松木式"));
assert.ok(detailText.includes("この内容で登録する"));
await page.screenshot({ path: shot2 });

console.log("OK stage1 keywords:", texts1.join(" | "));
console.log("OK stage2 detail contains candidates");
console.log("shots:", shot1, shot2);

await browser.close();
server.close();
