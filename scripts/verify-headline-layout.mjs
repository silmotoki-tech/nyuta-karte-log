/**
 * 左カラム（見出し一覧）の2列レイアウトを本番 index.html + app.js 経路で検証する。
 * - 日付が縦一列に揃う
 * - 見出しが折り返し、2行目も1行目と同じ左端から始まる（省略記号で切らない）
 * - 日付と見出しの境目の縦線がカテゴリ／★で色分けされる
 * - 丸マーク・★マークが無くなっている
 */
import assert from "node:assert/strict";
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

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".png") return "image/png";
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
  return chromium.launch({ channel: "chrome", headless: true, timeout: 30_000 });
}

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-full-app-free-qa.js"),
  "utf8"
);
const mockPasscode = `
export const PASSCODE_STORAGE_KEY = "nyutaKartePasscodeVerified";
export const PASSCODE_DATE_KEY = "nyutaKartePasscodeVerifiedDate";
export function todayDateStrLocal() { return "2026-08-02"; }
export function isPasscodeVerified() { return true; }
export function setPasscodeVerified() {}
export function clearPasscodeVerified() {}
`;
const mockApiKey = `
export function hasApiKey() { return true; }
export function getApiKey() { return "sk-ant-test"; }
export function setApiKey() {}
export function clearApiKey() {}
`;
const mockFirebase = `export const app = {};`;
const mockAuth = `export const authReady = Promise.resolve({ uid: "test" });`;

const SEED_ENTRIES = [
  {
    id: "e1",
    recordDate: "2026-07-23",
    headline: "白血病の継続治療",
    body: "抗がん剤投与の3クール目。",
    category: "ope",
    important: true,
    createdAt: "2026-07-23T10:00:00.000Z",
  },
  {
    id: "e2",
    recordDate: "2026-07-23",
    headline: "お",
    body: "短い見出しの例。",
    category: "none",
    important: false,
    createdAt: "2026-07-23T09:00:00.000Z",
  },
  {
    id: "e3",
    recordDate: "2026-07-22",
    headline: "ACDH刺激試験と尿検査を実施した",
    body: "副腎皮質機能亢進症の疑い。",
    category: "admission",
    important: true,
    createdAt: "2026-07-22T14:00:00.000Z",
  },
  {
    id: "e4",
    recordDate: "2026-07-21",
    headline: "膀胱炎の続き",
    body: "抗生剤継続。",
    category: "referral",
    important: true,
    createdAt: "2026-07-21T11:00:00.000Z",
  },
  {
    id: "e5",
    recordDate: "2026-07-20",
    headline: "手動で★を付けた通常記録の見出しはこのくらい長くなることがある",
    body: "★のみのケース。",
    category: "none",
    important: true,
    createdAt: "2026-07-20T11:00:00.000Z",
  },
  {
    id: "e6",
    recordDate: "2025-12-31",
    headline: "年をまたぐ記録",
    body: "年グループ見出しの確認。",
    category: "none",
    important: false,
    createdAt: "2025-12-31T11:00:00.000Z",
  },
];

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
  serviceWorkers: "block",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.addInitScript((entries) => {
  globalThis.__seedEntries = entries;
}, SEED_ENTRIES);

for (const [pattern, body] of [
  ["**/js/db.js", mockDb],
  ["**/js/passcode-auth.js", mockPasscode],
  ["**/js/api-key.js", mockApiKey],
  ["**/js/firebase-app.js", mockFirebase],
  ["**/js/auth.js", mockAuth],
]) {
  await page.route(pattern, (route) =>
    route.fulfill({ contentType: "application/javascript", body })
  );
}

await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 10_000 });
for (const d of ["1", "2", "3", "4", "5"]) {
  await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
}
await page.click('#karte-numpad [data-karte-action="confirm"]');
await page.waitForSelector("#gate-animal:not([hidden])", { timeout: 10_000 });
await page.fill("#animal-name-input", "テスト");
await page.click("#btn-animal-next");
await page.waitForSelector("#center-main:not([hidden])", { timeout: 10_000 });
await page.waitForFunction(
  () => document.querySelectorAll("#headline-list .hl-item").length > 0,
  null,
  { timeout: 10_000 }
);

const info = await page.evaluate(() => {
  const round = (n) => Math.round(n * 10) / 10;
  const items = [...document.querySelectorAll("#headline-list .hl-item")].map((li) => {
    const date = li.querySelector(".hl-item__date");
    const rule = li.querySelector(".hl-item__rule");
    const text = li.querySelector(".hl-item__text");
    const textCs = getComputedStyle(text);
    const lineHeight = parseFloat(textCs.lineHeight);
    const textRect = text.getBoundingClientRect();
    // 折り返し後の各行の左端（同じ左端から始まるかを見る）
    const lineLefts = [];
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const r of range.getClientRects()) lineLefts.push(round(r.left));
    return {
      category: li.dataset.category,
      important: li.classList.contains("is-important"),
      date: date.textContent,
      dateLeft: round(date.getBoundingClientRect().left),
      ruleLeft: round(rule.getBoundingClientRect().left),
      ruleColor: getComputedStyle(rule).backgroundColor,
      ruleHeight: round(rule.getBoundingClientRect().height),
      textLeft: round(textRect.left),
      textHeight: round(textRect.height),
      lines: Math.max(1, Math.round(textRect.height / lineHeight)),
      lineLefts: [...new Set(lineLefts)],
      clamp: textCs.webkitLineClamp,
      overflow: textCs.overflow,
    };
  });
  const layout = getComputedStyle(document.querySelector(".layout"));
  return {
    items,
    years: [...document.querySelectorAll("#headline-list .hl-year")].map(
      (el) => el.textContent
    ),
    leftWidth: round(document.getElementById("col-left").getBoundingClientRect().width),
    columns: layout.gridTemplateColumns,
    leftoverDots: document.querySelectorAll(".hl-item__dot, .hl-item__star").length,
    referralVar: getComputedStyle(document.documentElement)
      .getPropertyValue("--cat-referral")
      .trim(),
    timelineBars: [...document.querySelectorAll(".tl-item")].map((li) => ({
      category: li.dataset.category,
      barColor: getComputedStyle(li.querySelector(".tl-item__bar")).backgroundColor,
    })),
  };
});

console.log("years:", info.years.join(", "));
console.log("left width:", info.leftWidth, "| columns:", info.columns);
console.log("--cat-referral:", info.referralVar);
console.table(
  info.items.map((i) => ({
    date: i.date,
    cat: i.category,
    star: i.important,
    dateLeft: i.dateLeft,
    ruleLeft: i.ruleLeft,
    textLeft: i.textLeft,
    lines: i.lines,
    ruleH: i.ruleHeight,
    ruleColor: i.ruleColor,
  }))
);

assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("\n")}`);
assert.equal(info.leftoverDots, 0, "丸マーク／★マークが残っています");
assert.deepEqual(info.years, ["2026年", "2025年"]);

// 日付・縦線・見出しがそれぞれ縦一列に揃う
for (const key of ["dateLeft", "ruleLeft", "textLeft"]) {
  const values = [...new Set(info.items.map((i) => i[key]))];
  assert.equal(values.length, 1, `${key} が揃っていません: ${values.join(", ")}`);
}
assert.ok(
  info.items[0].dateLeft < info.items[0].ruleLeft &&
    info.items[0].ruleLeft < info.items[0].textLeft,
  "日付 → 縦線 → 見出し の並びになっていません"
);

// 折り返し: 省略せず複数行に流し、各行の左端が揃う
const wrapped = info.items.filter((i) => i.lines >= 2);
assert.ok(wrapped.length >= 2, `折り返した行がありません: ${JSON.stringify(info.items.map((i) => i.lines))}`);
wrapped.forEach((i) => {
  assert.equal(
    i.lineLefts.length,
    1,
    `折り返し行の左端がずれています (${i.date}): ${i.lineLefts.join(", ")}`
  );
  assert.ok(
    i.ruleHeight >= i.textHeight,
    `縦線が折り返し分まで伸びていません (${i.date}): rule ${i.ruleHeight} < text ${i.textHeight}`
  );
});
info.items.forEach((i) => {
  assert.ok(i.clamp === "none" || !i.clamp, `見出しが行数制限されています (${i.date}): ${i.clamp}`);
});

// 縦線の色分け
const RED = "rgb(217, 83, 79)";
const BLUE = "rgb(74, 144, 164)";
const PURPLE = "rgb(138, 95, 191)";
const YELLOW = "rgb(224, 169, 43)";
const GREY = "rgb(220, 223, 227)";
// 描画順は SEED_ENTRIES の記録日降順と一致する
const expectedRules = [
  [RED, "オペ＝赤"],
  [GREY, "通常＝薄いグレー"],
  [BLUE, "入院＝青"],
  [PURPLE, "紹介＝紫"],
  [YELLOW, "★のみ＝黄"],
  [GREY, "通常（前年）＝薄いグレー"],
];
expectedRules.forEach(([color, name], i) => {
  assert.equal(info.items[i].ruleColor, color, `${name} ではありません`);
});

// 中央カラムのカテゴリ色も紫に統一
const referralBar = info.timelineBars.find((b) => b.category === "referral");
assert.equal(referralBar?.barColor, PURPLE, "中央カラムの紹介バーが紫ではありません");
assert.equal(info.referralVar, "#8a5fbf");

// 左カラムは 210px から約10%拡大
assert.ok(
  Math.abs(info.leftWidth - 231) <= 1,
  `左カラム幅が想定と違います: ${info.leftWidth}`
);

fs.mkdirSync(path.join(root, "tools"), { recursive: true });
await page.locator("#col-left").screenshot({
  path: path.join(root, "tools/headline-layout-left.png"),
});
await page.screenshot({ path: path.join(root, "tools/headline-layout-full.png") });

console.log("OK: 左カラムの2列レイアウトと縦線の色分け");
await browser.close();
server.close();
