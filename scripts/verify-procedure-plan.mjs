/**
 * 処置タブ: 予定登録→完了→実施履歴、メモ表示、旧データ互換を検証する。
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

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-procedures.js"),
  "utf-8"
);

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/css/style.css" />
</head><body style="margin:0;background:var(--color-cream)">
<aside class="right-column" style="width:100%;max-width:420px;margin:0 auto;min-height:100vh;background:var(--color-cream)">
  <div class="right-panel" id="panel-proc" data-panel="proc">
    <div class="exam-toolbar">
      <button id="btn-procedure-plan-add" class="btn btn--small btn--primary" type="button">予定を登録</button>
      <button id="btn-procedure-add" class="btn btn--small btn--outline" type="button">実施を記録</button>
    </div>
    <section class="exam-section">
      <h3 class="exam-section__title">処置予定一覧</h3>
      <p class="field__note" id="procedure-plan-empty">登録された処置予定はありません。</p>
      <ul class="exam-list" id="procedure-plan-list"></ul>
    </section>
    <section class="exam-section">
      <h3 class="exam-section__title">実施履歴</h3>
      <p class="field__note" id="procedures-empty">まだ実施履歴がありません。</p>
      <ul class="proc-list" id="procedures-list"></ul>
    </section>
  </div>
</aside>

<div class="modal" id="procedure-plan-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel modal__panel--procedure-plan">
    <div class="modal__header">
      <h2 class="modal__title" id="procedure-plan-modal-title">処置予定を登録</h2>
      <button class="modal__close" id="btn-close-procedure-plan-modal" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <label class="label" for="procedure-plan-content">処置内容</label>
        <textarea id="procedure-plan-content" class="textarea" rows="3"></textarea>
      </div>
      <div class="field exam-due-field proc-due-field">
        <span class="label">予定日</span>
        <div class="exam-due-compact">
          <div class="exam-due-compact__date-row">
            <label class="label label--sub" for="procedure-plan-due-date">カレンダー</label>
            <input id="procedure-plan-due-date" class="input input--date exam-due-compact__date" type="date" />
          </div>
          <div class="exam-due-compact__relative">
            <div class="exam-due-compact__units" role="group" aria-label="相対日数の単位">
              <p class="interval-value-display interval-value-display--compact" id="procedure-plan-due-display">0日後</p>
              <div class="interval-unit-buttons interval-unit-buttons--stack" id="procedure-plan-due-units" role="group" aria-label="日・週・月"></div>
            </div>
            <div class="numpad numpad--compact" id="procedure-plan-due-numpad"></div>
          </div>
          <p class="field__note" id="procedure-plan-window-note"></p>
        </div>
      </div>
      <div class="field">
        <label class="label" for="procedure-plan-note">メモ（任意）</label>
        <input id="procedure-plan-note" class="input" type="text" />
      </div>
      <p id="procedure-plan-error" class="error-text" hidden></p>
    </div>
    <div class="modal__footer">
      <button id="btn-procedure-plan-save" class="btn btn--small btn--primary" type="button">保存する</button>
      <button id="btn-procedure-plan-complete" class="btn btn--small btn--outline" type="button" hidden>完了として記録</button>
      <button id="btn-procedure-plan-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<div class="modal" id="procedure-modal" hidden>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel">
    <div class="modal__header">
      <h2 class="modal__title" id="procedure-modal-title">実施を記録</h2>
      <button class="modal__close" id="btn-close-procedure-modal" type="button">&times;</button>
    </div>
    <div class="modal__body">
      <div class="field">
        <label class="label" for="procedure-date">実施日</label>
        <input id="procedure-date" class="input input--date" type="date" />
      </div>
      <div class="field">
        <label class="label" for="procedure-content">処置内容</label>
        <textarea id="procedure-content" class="textarea" rows="3"></textarea>
      </div>
      <div class="field">
        <label class="label" for="procedure-note">メモ（任意）</label>
        <input id="procedure-note" class="input" type="text" />
      </div>
      <p id="procedure-error" class="error-text" hidden></p>
    </div>
    <div class="modal__footer">
      <button id="btn-procedure-save" class="btn btn--small btn--primary" type="button">追加する</button>
      <button id="btn-procedure-cancel" class="btn btn--small btn--outline" type="button">キャンセル</button>
    </div>
  </div>
</div>

<script type="module">
import { initProceduresUI, enterProcedures } from "/js/procedures-ui.js";
initProceduresUI({
  showToast: (m) => console.log("toast", m),
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterProcedures("karte-proc");
window.__ready = true;
</script>
</body></html>`;

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
const page = await browser.newPage({
  viewport: { width: 460, height: 900 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.warn("pageerror", e.message));
page.on("dialog", async (d) => d.accept());

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(150);

const legacyVisible = await page.locator("#procedures-list .proc-card__content", {
  hasText: "旧形式の皮下点滴",
}).count();
if (!legacyVisible) throw new Error("legacy history missing");

await page.screenshot({
  path: path.join(root, "tools/proc-plan-01-initial.png"),
});

await page.click("#btn-procedure-plan-add");
await page.waitForSelector("#procedure-plan-modal:not([hidden])");

const numpadCols = await page.evaluate(() => {
  const el = document.getElementById("procedure-plan-due-numpad");
  return getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length;
});
if (numpadCols !== 3) {
  throw new Error("procedure numpad should be 3-column (3x4), got " + numpadCols);
}

await page.fill("#procedure-plan-content", "抜糸");
await page.fill("#procedure-plan-note", "傷口きれい");

await page.locator("#procedure-plan-due-units .interval-unit-btn", { hasText: "日" }).click();
await page.locator("#procedure-plan-due-numpad .numpad__btn", { hasText: "7" }).click();
await page.locator("#procedure-plan-due-numpad .numpad__btn--confirm").click();
await page.waitForTimeout(80);
const dueVal = await page.inputValue("#procedure-plan-due-date");
if (!dueVal) throw new Error("due date not set from numpad");

await page.screenshot({
  path: path.join(root, "tools/proc-plan-02-modal.png"),
});

await page.click("#btn-procedure-plan-save");
await page.waitForTimeout(150);

const planTitle = await page.locator("#procedure-plan-list .exam-list-item__title").first().textContent();
const planDue = await page.locator("#procedure-plan-list .exam-list-item__due").first().textContent();
const planNote = await page.locator("#procedure-plan-list .exam-list-item__note").first().textContent();
console.log("plan", { planTitle, planDue, planNote, dueVal });
if (planTitle?.trim() !== "抜糸") throw new Error("plan content missing");
if (!planDue?.includes("あと")) throw new Error("countdown missing");
if (planNote?.trim() !== "傷口きれい") throw new Error("plan note missing");

const dueClass = await page
  .locator("#procedure-plan-list .exam-list-item__due")
  .first()
  .getAttribute("class");
if (!/exam-due-text--(far|near|close|overdue)/.test(dueClass || "")) {
  throw new Error(`due color class missing: ${dueClass}`);
}

await page.screenshot({
  path: path.join(root, "tools/proc-plan-03-listed.png"),
});

await page.locator("#procedure-plan-list .exam-list-item").first().click();
await page.waitForSelector("#procedure-plan-modal:not([hidden])");
await page.click("#btn-procedure-plan-complete");
await page.waitForTimeout(250);

const planCount = await page.locator("#procedure-plan-list .exam-list-item").count();
if (planCount !== 0) throw new Error("plan should be gone after complete");

const histContents = await page
  .locator("#procedures-list .proc-card__content")
  .allTextContents();
if (!histContents.some((t) => t.includes("抜糸"))) {
  throw new Error("completed plan not in history");
}
const histNotes = await page.locator("#procedures-list .proc-card__note").allTextContents();
if (!histNotes.some((t) => t.includes("傷口きれい"))) {
  throw new Error("history note missing");
}

await page.screenshot({
  path: path.join(root, "tools/proc-plan-04-after-complete.png"),
});

await page.click("#btn-procedure-add");
await page.waitForSelector("#procedure-modal:not([hidden])");
await page.fill("#procedure-content", "皮下点滴 100ml");
await page.fill("#procedure-note", "元気あり");
await page.click("#btn-procedure-save");
await page.waitForTimeout(150);
const afterAdd = await page.locator("#procedures-list .proc-card__content").allTextContents();
if (!afterAdd.some((t) => t.includes("皮下点滴 100ml"))) {
  throw new Error("manual history add failed");
}

await page.screenshot({
  path: path.join(root, "tools/proc-plan-05-history-memo.png"),
});

const revived = await page.evaluate(() => {
  const card = [...document.querySelectorAll("#procedures-list .proc-card")].find(
    (el) => el.querySelector(".proc-card__content")?.textContent?.includes("抜糸")
  );
  if (!card) return { ok: false, reason: "card missing" };
  card.classList.add("is-actions-open-edit");
  const refreshBtn = [...card.querySelectorAll(".swipeable__action-btn")].find(
    (b) =>
      (b.getAttribute("aria-label") || b.title || "").includes("予定に戻す")
  );
  if (!refreshBtn) {
    return {
      ok: false,
      reason: "refresh btn missing",
      buttons: [...card.querySelectorAll(".swipeable__action-btn")].map((b) => ({
        label: b.getAttribute("aria-label") || b.title,
        action: b.dataset.action,
      })),
    };
  }
  refreshBtn.click();
  return { ok: true };
});
console.log("revive click", revived);
if (!revived.ok) throw new Error(`revive failed: ${JSON.stringify(revived)}`);
await page.waitForTimeout(300);

const planAfterRevive = await page
  .locator("#procedure-plan-list .exam-list-item__title")
  .allTextContents();
if (!planAfterRevive.some((t) => t.includes("抜糸"))) {
  throw new Error("revive did not restore plan");
}
const histStill = await page.locator("#procedures-list .proc-card__content").allTextContents();
if (!histStill.some((t) => t.includes("抜糸"))) {
  throw new Error("history should remain after revive");
}

await page.screenshot({
  path: path.join(root, "tools/proc-plan-06-revived.png"),
});

// 相対入力バッファ: 確定なしで保存してもカレンダーへ反映される
await page.evaluate(() => {
  const modal = document.getElementById("procedure-plan-modal");
  if (modal) modal.hidden = true;
});
await page.click("#btn-procedure-plan-add");
await page.waitForSelector("#procedure-plan-modal:not([hidden])");
await page.fill("#procedure-plan-content", "バッファ確認");
await page.fill("#procedure-plan-due-date", "");
await page.locator("#procedure-plan-due-units .interval-unit-btn", { hasText: "日" }).click();
await page.locator("#procedure-plan-due-numpad .numpad__btn", { hasText: /^7$/ }).click();
// 確定を押さずに保存（7日後がカレンダーへ flush されること）
await page.click("#btn-procedure-plan-save");
await page.waitForFunction(() => document.getElementById("procedure-plan-modal")?.hidden === true);
const bufferedDue = await page.evaluate(() => {
  const item = [...document.querySelectorAll("#procedure-plan-list .exam-list-item")].find((li) =>
    (li.querySelector(".exam-list-item__title")?.textContent || "").includes("バッファ確認")
  );
  return {
    found: Boolean(item),
    due: item?.querySelector(".exam-list-item__due")?.textContent?.trim() || "",
  };
});
console.log("buffer flush", bufferedDue);
if (!bufferedDue.found) throw new Error("buffer-flush save failed to list plan");
if (!bufferedDue.due.includes("あと7日") && !bufferedDue.due.includes("7日")) {
  throw new Error("relative buffer not flushed on save: " + JSON.stringify(bufferedDue));
}

await browser.close();
server.close();
console.log("OK: procedure plan + memo");
