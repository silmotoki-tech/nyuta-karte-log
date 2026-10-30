/**
 * 右カラムの種類別検査カード6枚。
 * - 空は見出し1行。本文があるカードだけ本文と最終更新
 * - 別タブでも保存内容が見える
 * - 状態モードには出さない。列幅は変えない。横スクロールしない
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOCK_AUTH_LOGGED_IN } from "./mock-auth-email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const KINDS = [
  ["blood", "🩸 血液"],
  ["abdomenEcho", "🎥 腹部エコー"],
  ["heartEcho", "🫀 心臓エコー"],
  ["urine", "🧪 尿検査"],
  ["xray", "🩻 レントゲン"],
  ["other", "📋 その他"],
];

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
  deviceScaleFactor: 2,
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
  await page.waitForSelector("#panel-qa:not([hidden])", { timeout: 5000 });
  await page.waitForSelector("#right-block-exam-cards .exam-note-wrap", { timeout: 5000 });
}

const LONG_TEXT = [
  "肝スク（絶食）11月中旬",
  "T4 3ヶ月後 1/下旬",
  "とても長い検査の予定です。右カラムの幅で折り返し、このカードだけが縦に伸びて最後まで読めることを確認する文章です。",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
].join("\n");

const outDir = path.join(root, "tools/exam-cards");
fs.mkdirSync(outDir, { recursive: true });

const page = await context.newPage();
await openKarte(page);
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

const empty = await page.evaluate(() => {
  const wraps = [...document.querySelectorAll("#right-block-exam-cards .exam-note-wrap")];
  const exam = document.getElementById("right-block-exam-cards");
  const search = document.getElementById("right-section-search");
  const panel = document.getElementById("panel-qa");
  const doc = document.documentElement;
  const cols = [...document.querySelectorAll("#app-shell .layout > .col")].map((el) =>
    Math.round(el.getBoundingClientRect().width)
  );
  panel.scrollTop = exam.offsetTop - panel.offsetTop;
  const panelBox = panel.getBoundingClientRect();
  const searchBox = search.getBoundingClientRect();
  const rows = wraps.map((wrap) => {
    const title = wrap.querySelector(".exam-note__view .exam-note__title");
    const mark = wrap.querySelector(".exam-note__mark");
    const titleBox = title.getBoundingClientRect();
    const markBox = mark.getBoundingClientRect();
    return {
      kind: wrap.dataset.kind,
      title: title.textContent,
      mark: mark.textContent,
      markHidden: mark.hidden,
      metaHidden: wrap.querySelector(".exam-note__meta").hidden,
      lineH: wrap.querySelector(".exam-note__line").getBoundingClientRect().height,
      sameLine: Math.abs(titleBox.top - markBox.top) < 6,
      cardH: wrap.getBoundingClientRect().height,
    };
  });
  return {
    order: [...document.getElementById("panel-qa").children].map((el) => el.id),
    rows,
    examH: exam.getBoundingClientRect().height,
    searchVisible: searchBox.top < panelBox.bottom - 8 && searchBox.top > panelBox.top,
    inStatus: Boolean(document.getElementById("screen-status")?.querySelector("#right-block-exam-cards")),
    docOverflow: doc.scrollWidth - doc.clientWidth,
    panelOverflow: panel.scrollWidth - panel.clientWidth,
    cols,
  };
});

assert.deepEqual(
  empty.order,
  ["right-block-history", "right-block-contra", "right-block-exam-cards", "right-section-search", "right-ai-fold"],
  "右カラムの並び"
);
assert.deepEqual(
  empty.rows.map((row) => row.kind),
  KINDS.map(([id]) => id),
  "検査カードの順"
);
empty.rows.forEach((row, i) => {
  assert.equal(row.title, KINDS[i][1], `${row.kind} の見出し`);
  assert.equal(row.mark, "　—", `${row.kind} の空表示`);
  assert.equal(row.markHidden, false, `${row.kind} のダッシュが隠れている`);
  assert.equal(row.metaHidden, true, `${row.kind} に最終更新が出ている`);
  assert.equal(row.sameLine, true, `${row.kind} が見出し1行でない`);
  assert.ok(row.lineH < 28, `${row.kind} の行が高い (${row.lineH})`);
  assert.ok(row.cardH < 40, `${row.kind} の空カードが高い (${row.cardH})`);
});
assert.ok(empty.examH < 260, `空の6枚が長い (${empty.examH})`);
assert.equal(empty.searchVisible, true, "空の6枚の直後に全文検索が見えない");
assert.equal(empty.inStatus, false, "状態モードの中に検査カードがある");
assert.deepEqual(empty.cols, [241, 494, 445], `列幅: ${empty.cols}`);
assert.ok(empty.docOverflow <= 1, "空のカードで横スクロール");
assert.ok(empty.panelOverflow <= 1, "空のカードで右カラムが横にはみ出す");
await shot("01-empty");

assert.equal(await page.locator("#btn-view-status").isVisible(), false, "状態ボタンが見えている");
assert.equal(await page.locator("#screen-status").isVisible(), false, "状態モードが開いている");
assert.equal(await page.locator("#right-block-exam-cards").isVisible(), true, "右カラムの検査カードが見えない");

const urine = page.locator('.exam-note-wrap[data-kind="urine"] .exam-note__view');
await urine.click();
await page.waitForSelector("#exam-card-input-urine:not([hidden])", { timeout: 3000 });
await page.fill("#exam-card-input-urine", "取り消し確認");
await page.locator('.exam-note-wrap[data-kind="urine"] .exam-note__actions .btn--ghost').click();
assert.equal(
  await page.locator('.exam-note-wrap[data-kind="urine"] .exam-note__title').first().innerText(),
  "🧪 尿検査",
  "取り消し後の見出し"
);
assert.equal(
  await page.locator('.exam-note-wrap[data-kind="urine"] .exam-note__meta').evaluate((el) => el.hidden),
  true,
  "取り消し後に最終更新が出た"
);

await page.locator('.exam-note-wrap[data-kind="blood"] .exam-note__view').click();
assert.equal(
  await page.locator("#exam-card-authors-blood").count(),
  0,
  "検査カードに記入者選択が残っている"
);
await page.fill("#exam-card-input-blood", LONG_TEXT);

const editingOverflow = await page.evaluate(() => {
  const doc = document.documentElement;
  const panel = document.getElementById("panel-qa");
  return {
    doc: doc.scrollWidth - doc.clientWidth,
    panel: panel.scrollWidth - panel.clientWidth,
  };
});
assert.ok(editingOverflow.doc <= 1, "編集中に横スクロール");
assert.ok(editingOverflow.panel <= 1, "編集中に右カラムが横にはみ出す");

await page.locator('.exam-note-wrap[data-kind="blood"] .exam-note__actions .btn--primary').click();
await page.waitForFunction(
  () => document.querySelector('.exam-note-wrap[data-kind="blood"] .exam-note__text')?.textContent.includes("肝スク"),
  null,
  { timeout: 5000 }
);

const today = await page.evaluate(() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
});
const filled = await page.evaluate(() => {
  const blood = document.querySelector('.exam-note-wrap[data-kind="blood"]');
  const text = blood.querySelector(".exam-note__text");
  const card = blood.querySelector(".exam-note");
  const emptyCard = document.querySelector('.exam-note-wrap[data-kind="urine"] .exam-note');
  const doc = document.documentElement;
  const panel = document.getElementById("panel-qa");
  const cols = [...document.querySelectorAll("#app-shell .layout > .col")].map((el) =>
    Math.round(el.getBoundingClientRect().width)
  );
  const others = [...document.querySelectorAll("#right-block-exam-cards .exam-note-wrap")]
    .filter((el) => el.dataset.kind !== "blood")
    .map((el) => ({
      kind: el.dataset.kind,
      metaHidden: el.querySelector(".exam-note__meta").hidden,
      textHidden: el.querySelector(".exam-note__text").hidden,
      cardH: el.getBoundingClientRect().height,
    }));
  return {
    text: text.innerText,
    meta: blood.querySelector(".exam-note__meta").textContent,
    textH: text.getBoundingClientRect().height,
    textScroll: text.scrollHeight,
    textClient: text.clientHeight,
    whiteSpace: getComputedStyle(text).whiteSpace,
    border: getComputedStyle(card).borderTopColor,
    emptyBorder: getComputedStyle(emptyCard).borderTopColor,
    bg: getComputedStyle(card).backgroundColor,
    emptyBg: getComputedStyle(emptyCard).backgroundColor,
    others,
    docOverflow: doc.scrollWidth - doc.clientWidth,
    panelOverflow: panel.scrollWidth - panel.clientWidth,
    cols,
  };
});
assert.ok(filled.text.includes("肝スク（絶食）11月中旬"), "1行目が無い");
assert.ok(filled.text.includes("T4 3ヶ月後 1/下旬"), "2行目が無い");
assert.ok(filled.text.includes("とても長い検査"), "長い文章が無い");
assert.equal(filled.meta, `最終更新 ${today}`, `最終更新: ${filled.meta}`);
assert.equal(filled.meta.includes("大辻"), false, "最終更新に記入者が出ている");
assert.ok(filled.textH > 60, `本文が縦に伸びていない (${filled.textH})`);
assert.ok(filled.textScroll <= filled.textClient + 2, "本文が切れている");
assert.equal(filled.whiteSpace, "pre-wrap", "改行が潰れている");
assert.equal(filled.border, filled.emptyBorder, "記載のあるカードだけ枠の色が変わっている");
assert.equal(filled.bg, filled.emptyBg, "記載のあるカードだけ背景が変わっている");
filled.others.forEach((row) => {
  assert.equal(row.metaHidden, true, `${row.kind} に最終更新が出ている`);
  assert.equal(row.textHidden, true, `${row.kind} に本文が出ている`);
  assert.ok(row.cardH < 40, `${row.kind} の空カードが高い (${row.cardH})`);
});
assert.deepEqual(filled.cols, [241, 494, 445], `保存後の列幅: ${filled.cols}`);
assert.ok(filled.docOverflow <= 1, "長い文章で横スクロール");
assert.ok(filled.panelOverflow <= 1, "長い文章で右カラムが横にはみ出す");
await shot("02-filled");

const page2 = await context.newPage();
await openKarte(page2);
await page2.waitForFunction(
  () => document.querySelector('.exam-note-wrap[data-kind="blood"] .exam-note__text')?.innerText.includes("肝スク"),
  null,
  { timeout: 5000 }
);
assert.equal(
  await page2.locator('.exam-note-wrap[data-kind="blood"] .exam-note__meta').innerText(),
  `最終更新 ${today}`,
  "別タブの最終更新が違う"
);
await page2.screenshot({ path: path.join(outDir, "03-other-tab.png") });

await page2.evaluate(() => {
  const key = "nyuta-mock-exam-cards";
  const store = JSON.parse(localStorage.getItem(key) || "{}");
  store["00001"].blood.updatedBy = "大辻";
  localStorage.setItem(key, JSON.stringify(store));
});
await page2.locator('.exam-note-wrap[data-kind="blood"] .exam-note__view').click();
await page2.fill("#exam-card-input-blood", "   ");
await page2.locator('.exam-note-wrap[data-kind="blood"] .exam-note__actions .btn--primary').click();
await page.waitForFunction(
  () => {
    const wrap = document.querySelector('.exam-note-wrap[data-kind="blood"]');
    return wrap?.querySelector(".exam-note__mark")?.hidden === false
      && wrap?.querySelector(".exam-note__meta")?.hidden === true;
  },
  null,
  { timeout: 5000 }
);
const keptAuthor = await page.evaluate(() => {
  const store = JSON.parse(localStorage.getItem("nyuta-mock-exam-cards") || "{}");
  return store["00001"]?.blood?.updatedBy || "";
});
assert.equal(keptAuthor, "大辻", "保存済みの記入者が消えている");
await shot("04-cleared");

await browser.close();
await new Promise((r) => server.close(r));
console.log("OK: 検査カードを確認");
