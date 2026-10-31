/**
 * 記録の「重要でない」印。
 * - 新規で付けると左と中央がグレー。見出しの文字は増えない
 * - 既存を編集して付け外しできる
 * - グレーでもカテゴリの縦線は残る
 * - ⭐ がある回はグレーにしない
 * - 全文検索には出る
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./launch-browser.js";
import { MOCK_AUTH_LOGGED_IN } from "./mock-auth-email.js";
import { HEADLINE_EMOJI_STAR } from "../js/headline-emoji.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const STAR = HEADLINE_EMOJI_STAR;
const DIM = "rgb(92, 101, 112)";
const BLACK = "rgb(17, 17, 17)";
const BODY = "rgb(43, 43, 43)";
const OPE = "rgb(217, 83, 79)";
const NONE = "rgb(220, 223, 227)";

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const mockDb = fs.readFileSync(path.join(__dirname, "mock-db-status-mode.js"), "utf8");
const mockPasscode = `
export const PASSCODE_STORAGE_KEY = "nyutaKartePasscodeVerified";
export const PASSCODE_DATE_KEY = "nyutaKartePasscodeVerifiedDate";
export function todayDateStrLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate());
}
export function isPasscodeVerified() { return true; }
export function setPasscodeVerified() {}
export function clearPasscodeVerified() {}
`;
const mockApiKey = `
export function hasApiKey() { return true; }
export function getApiKey() { return "sk-ant-test-key-for-verify"; }
export function setApiKey() {}
export function clearApiKey() {}
`;
const mockFirebase = `export const app = {};`;

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/index.html";
  const fp = path.join(root, u.replace(/^\//, ""));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(fp), "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1180, height: 900 },
  deviceScaleFactor: 1,
  serviceWorkers: "block",
});

function installRoutes(page) {
  page.on("pageerror", (err) => console.warn("pageerror", String(err)));
  return Promise.all([
    page.route("**/js/db.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockDb })
    ),
    page.route("**/js/passcode-auth.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockPasscode })
    ),
    page.route("**/js/api-key.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockApiKey })
    ),
    page.route("**/js/firebase-app.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockFirebase })
    ),
    page.route("**/js/auth.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: MOCK_AUTH_LOGGED_IN })
    ),
  ]);
}

async function openKarte(page) {
  await installRoutes(page);
  await page.addInitScript(() => {
    globalThis.__seedEntries = [
      {
        id: "plain",
        recordDate: "2026-10-20",
        headline: "既存の通常記録",
        body: "変化なし",
        category: "none",
        author: "院長",
      },
      {
        id: "ope",
        recordDate: "2026-09-01",
        headline: "オペの経過",
        body: "抜糸のみ",
        category: "ope",
        author: "院長",
      },
    ];
  });
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 10000 });
  for (const d of ["0", "0", "0", "0", "1"]) {
    await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
  }
  await page.click('#karte-numpad [data-karte-action="confirm"]');
  await page.waitForSelector("#gate-animal:not([hidden])", { timeout: 10000 });
  await page.fill("#animal-name-input", "イチロウ");
  await page.click("#btn-animal-next");
  await page.waitForSelector("#center-main:not([hidden])", { timeout: 10000 });
  await page.waitForFunction(
    () => document.getElementById("timeline")?.innerText.includes("既存の通常記録"),
    null,
    { timeout: 5000 }
  );
}

async function colors(page, headline) {
  return page.evaluate((headline) => {
    const find = (sel) =>
      [...document.querySelectorAll(sel)].find((el) => el.innerText.includes(headline));
    const hl = find("#headline-list .hl-item");
    const tl = find("#timeline .tl-item");
    const paint = (el) => (el ? getComputedStyle(el).color : "");
    const bg = (el) => (el ? getComputedStyle(el).backgroundColor : "");
    return {
      hlDate: paint(hl?.querySelector(".hl-item__date")),
      hlText: paint(hl?.querySelector(".hl-item__text")),
      hlRule: bg(hl?.querySelector(".hl-item__rule")),
      tlHead: paint(tl?.querySelector(".tl-item__headline")),
      tlBody: paint(tl?.querySelector(".tl-item__body")),
      tlBar: bg(tl?.querySelector(".tl-item__bar")),
      hlDim: Boolean(hl?.classList.contains("is-dimmed")),
      tlDim: Boolean(tl?.classList.contains("is-dimmed")),
      headline: hl?.querySelector(".hl-item__text")?.textContent || "",
    };
  }, headline);
}

async function saveNew(page, { headline, body, dimmed, star }) {
  await page.click("#btn-start-compose");
  await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });
  const near = await page.evaluate(() => {
    const emoji = document.getElementById("input-headline-emoji").getBoundingClientRect();
    const btn = document.getElementById("input-dimmed").getBoundingClientRect();
    return {
      visible: btn.width > 0 && btn.height > 0,
      gap: btn.left - emoji.right,
      dy: Math.abs(btn.top - emoji.top),
    };
  });
  assert.equal(near.visible, true, "重要でないボタンが見えない");
  assert.ok(near.gap < 24 && near.dy < 8, `絵文字の隣にない gap=${near.gap} dy=${near.dy}`);
  await page.locator("#input-author-row").getByRole("button", { name: "院長", exact: true }).click();
  await page.fill("#input-headline", headline);
  if (star) {
    await page.locator('#input-headline-emoji [aria-label="重要"]').click();
  }
  const pressed = await page.locator("#input-dimmed").getAttribute("aria-pressed");
  if (dimmed && pressed !== "true") await page.click("#input-dimmed");
  if (!dimmed && pressed === "true") await page.click("#input-dimmed");
  await page.fill("#input-body-text", body);
  await page.click("#btn-input-save");
  await page.waitForSelector("#center-main:not([hidden])", { timeout: 5000 });
  await page.waitForFunction(
    (text) => document.getElementById("timeline")?.innerText.includes(text),
    headline,
    { timeout: 5000 }
  );
}

async function editEntry(page, headline, { dimmed, nextHeadline }) {
  const row = page.locator("#timeline .tl-item", { hasText: headline });
  await row.locator('[aria-label="編集"]').dispatchEvent("click");
  await page.waitForSelector("#entry-edit-modal:not([hidden])", { timeout: 5000 });
  await page.locator("#entry-edit-author-row").getByRole("button", { name: "院長", exact: true }).click();
  const pressed = await page.locator("#entry-edit-dimmed").getAttribute("aria-pressed");
  if (dimmed === true && pressed !== "true") await page.click("#entry-edit-dimmed");
  if (dimmed === false && pressed === "true") await page.click("#entry-edit-dimmed");
  if (nextHeadline != null) await page.fill("#entry-edit-headline", nextHeadline);
  await page.click("#btn-entry-edit-save");
  await page.waitForFunction(
    () => document.getElementById("entry-edit-modal")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  const shown = nextHeadline || headline;
  await page.waitForFunction(
    (text) => document.getElementById("timeline")?.innerText.includes(text),
    shown,
    { timeout: 5000 }
  );
}

const page = await context.newPage();
try {
  await openKarte(page);

  const before = await colors(page, "既存の通常記録");
  assert.equal(before.hlDim, false, "印のない既存記録がグレー");
  assert.equal(before.hlText, BLACK, `既存の見出し色: ${before.hlText}`);
  assert.equal(before.tlBody, BODY, `既存の本文色: ${before.tlBody}`);

  await saveNew(page, {
    headline: "爪切りだけ",
    body: "読み飛ばしてよい本文",
    dimmed: true,
  });
  const nail = await colors(page, "爪切りだけ");
  assert.equal(nail.headline, "爪切りだけ", `見出しに印の文字が入った: ${nail.headline}`);
  assert.equal(nail.hlDim, true, "左がグレーになっていない");
  assert.equal(nail.tlDim, true, "中央がグレーになっていない");
  assert.equal(nail.hlDate, DIM, `左の日付: ${nail.hlDate}`);
  assert.equal(nail.hlText, DIM, `左の見出し: ${nail.hlText}`);
  assert.equal(nail.tlHead, DIM, `中央の見出し: ${nail.tlHead}`);
  assert.equal(nail.tlBody, DIM, `中央の本文: ${nail.tlBody}`);
  assert.equal(nail.hlRule, NONE, `通常の縦線: ${nail.hlRule}`);
  assert.equal(nail.tlBar, NONE, `通常の中央バー: ${nail.tlBar}`);

  await page.fill("#chart-search-input", "読み飛ばしてよい");
  await page.waitForTimeout(200);
  const hit = await page.locator("#chart-search-results").innerText();
  assert.ok(hit.includes("記録"), `グレーの回が検索に出ない: ${hit}`);
  assert.ok(hit.includes("爪切りだけ"), `検索の見出しが違う: ${hit}`);

  await editEntry(page, "既存の通常記録", { dimmed: true });
  const marked = await colors(page, "既存の通常記録");
  assert.equal(marked.hlDim, true, "編集で付けた印が左に出ない");
  assert.equal(marked.tlBody, DIM, "編集で付けた印が中央本文に出ない");

  await editEntry(page, "既存の通常記録", { dimmed: false });
  const cleared = await colors(page, "既存の通常記録");
  assert.equal(cleared.hlDim, false, "印を外しても左がグレー");
  assert.equal(cleared.tlHead, BLACK, `印を外した中央見出し: ${cleared.tlHead}`);
  assert.equal(cleared.tlBody, BODY, `印を外した中央本文: ${cleared.tlBody}`);

  await editEntry(page, "オペの経過", { dimmed: true });
  const ope = await colors(page, "オペの経過");
  assert.equal(ope.hlText, DIM, "オペの見出しがグレーでない");
  assert.equal(ope.tlBody, DIM, "オペの本文がグレーでない");
  assert.equal(ope.hlRule, OPE, `オペの縦線が消えた: ${ope.hlRule}`);
  assert.equal(ope.tlBar, OPE, `オペの中央バーが消えた: ${ope.tlBar}`);

  await saveNew(page, {
    headline: "大事な回",
    body: "星付きなのでグレーにしない",
    dimmed: true,
    star: true,
  });
  const starred = await colors(page, "大事な回");
  assert.equal(starred.headline, `${STAR} 大事な回`, `星の見出し: ${starred.headline}`);
  assert.equal(starred.hlDim, false, "星付きなのに左がグレー");
  assert.equal(starred.tlDim, false, "星付きなのに中央がグレー");
  assert.equal(starred.hlText, BLACK, `星付きの見出し色: ${starred.hlText}`);
  assert.equal(starred.tlBody, BODY, `星付きの本文色: ${starred.tlBody}`);

  const cols = await page.evaluate(() =>
    [...document.querySelectorAll("#app-shell .layout > .col")].map((el) =>
      Math.round(el.getBoundingClientRect().width)
    )
  );
  assert.deepEqual(cols, [241, 494, 445], `列幅: ${cols}`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert.ok(overflow <= 1, `横スクロール: ${overflow}`);

  console.log("OK: 重要でない印とグレー表示を確認");
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
