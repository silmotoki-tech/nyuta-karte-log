/**
 * 通常テキスト入力と数字ゲート（パスコード／カルテ番号）の切り分け検証。
 * - ゲート欄のみ readonly + inputmode=none（フォーカス保持しない）
 * - 本文・見出し・動物名などは編集可能で focus できる
 * - パスコード／カルテ番号テンキーは従来どおり動作
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

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css";
  if (ext === ".js") return "text/javascript";
  if (ext === ".json") return "application/json";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
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
  res.writeHead(200, {
    "Content-Type": contentType(fp),
    "Cache-Control": "no-store",
  });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  executablePath: SYSTEM_CHROME,
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1180, height: 900 },
  serviceWorkers: "block",
});
const page = await context.newPage();
const fails = [];

function assert(cond, msg) {
  if (!cond) fails.push(msg);
  console.log(cond ? `  OK  ${msg}` : `  NG  ${msg}`);
}

await page.goto(base + "/index.html", { waitUntil: "networkidle" });
await page.waitForSelector("#passcode-numpad .numpad__btn");

// --- パスコード: テンキー動作・フォーカスしない ------------------------------
console.log("\n[passcode gate]");
{
  const attrs = await page.evaluate(() => {
    const el = document.getElementById("passcode-input");
    return {
      readOnly: el.readOnly,
      inputmode: el.getAttribute("inputmode"),
      tabIndex: el.tabIndex,
    };
  });
  assert(attrs.readOnly === true, "passcode is readonly");
  assert(attrs.inputmode === "none", "passcode inputmode=none");
  assert(attrs.tabIndex === -1, "passcode tabindex=-1");

  await page.click('#passcode-numpad [data-pass-digit="1"]');
  await page.click('#passcode-numpad [data-pass-digit="2"]');
  await page.click('#passcode-numpad [data-pass-digit="3"]');
  await page.click('#passcode-numpad [data-pass-digit="4"]');
  const val = await page.inputValue("#passcode-input");
  assert(val === "1234", `passcode digits via numpad (got "${val}")`);

  // 誤コードでクリアされること
  await page.click('#passcode-numpad [data-pass-action="confirm"]');
  const afterWrong = await page.inputValue("#passcode-input");
  assert(afterWrong === "", "wrong passcode clears field");

  // 正しいパスコード
  for (const d of ["2", "2", "1", "1"]) {
    await page.click(`#passcode-numpad [data-pass-digit="${d}"]`);
  }
  await page.click('#passcode-numpad [data-pass-action="confirm"]');
  await page.waitForSelector("#gate-karte:not([hidden])");
  assert(true, "passcode unlock → karte gate");
}

// --- カルテ番号: テンキー・通常入力との属性差 --------------------------------
console.log("\n[karte gate]");
{
  const info = await page.evaluate(() => {
    const gate = document.getElementById("karte-number-input");
    const animal = document.getElementById("animal-name-input");
    const headline = document.getElementById("headline-input");
    const body = document.getElementById("body-input");
    const pick = (el) =>
      el
        ? {
            id: el.id,
            readOnly: el.readOnly,
            inputmode: el.getAttribute("inputmode"),
            tabIndex: el.tabIndex,
          }
        : null;
    return {
      gate: pick(gate),
      animal: pick(animal),
      headline: pick(headline),
      body: pick(body),
      activeAfterTapGate: (() => {
        gate.focus();
        return document.activeElement === gate;
      })(),
    };
  });
  assert(info.gate.readOnly === true, "karte gate readonly");
  assert(info.gate.inputmode === "none", "karte gate inputmode=none");
  assert(info.activeAfterTapGate === false, "karte gate does not keep focus");
  assert(info.animal.readOnly === false, "animal-name is NOT readonly");
  assert(info.animal.inputmode !== "none", "animal-name inputmode is not none");
  assert(info.headline.readOnly === false, "headline is NOT readonly");
  assert(
    info.headline.inputmode !== "none",
    "headline inputmode is not none"
  );
  assert(info.body.readOnly === false, "body is NOT readonly");
  assert(info.body.inputmode !== "none", "body inputmode is not none");

  for (const d of ["1", "2", "3", "4", "5"]) {
    await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
  }
  const kn = await page.inputValue("#karte-number-input");
  assert(kn === "12345", `karte digits via numpad (got "${kn}")`);
}

// --- 動物名ゲートへ進み、通常テキスト欄が focus 可能か -----------------------
console.log("\n[normal text fields]");
{
  // Firebase なしでも handleKarteNext が失敗する可能性があるため、
  // 状態を直接 main / compose 相当に切り替えてフォーカス検証する
  await page.evaluate(() => {
    const lock = document.getElementById("screen-lock");
    const shell = document.getElementById("app-shell");
    const gateKarte = document.getElementById("gate-karte");
    const gateAnimal = document.getElementById("gate-animal");
    const centerMain = document.getElementById("center-main");
    if (lock) lock.hidden = true;
    if (shell) shell.hidden = false;
    if (gateKarte) gateKarte.hidden = true;
    // 動物名欄の focus 検証のため一時表示
    if (gateAnimal) gateAnimal.hidden = false;
    if (centerMain) centerMain.hidden = false;
    document.documentElement.classList.add("is-unlocked");
    const composer = document.getElementById("entry-composer");
    const start = document.getElementById("btn-start-compose");
    if (composer) composer.hidden = false;
    if (start) start.hidden = true;
  });

  // 読取専用ゲートが active のまま残っていないこと
  await page.evaluate(() => {
    document.getElementById("passcode-input")?.blur();
    document.getElementById("karte-number-input")?.blur();
  });

  for (const id of ["animal-name-input", "headline-input", "body-input"]) {
    const focused = await page.evaluate((fieldId) => {
      const el = document.getElementById(fieldId);
      if (!el) return { ok: false, reason: "missing" };
      el.focus();
      const active = document.activeElement === el;
      return {
        ok: active && !el.readOnly && el.getAttribute("inputmode") !== "none",
        active,
        readOnly: el.readOnly,
        inputmode: el.getAttribute("inputmode"),
      };
    }, id);
    assert(
      focused.ok,
      `${id} can receive focus (active=${focused.active}, readonly=${focused.readOnly}, inputmode=${focused.inputmode})`
    );
  }

  // ゲート欄だけが inputmode=none / readonly であること（ページ全体スキャン）
  const offenders = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("input, textarea")];
    const gateIds = new Set(["passcode-input", "karte-number-input"]);
    return nodes
      .filter((el) => {
        if (gateIds.has(el.id)) return false;
        const mode = el.getAttribute("inputmode");
        // 数字ゲート以外で none / readonly が付いていないこと
        // （type=hidden 等は除外）
        if (el.type === "hidden" || el.type === "checkbox" || el.type === "radio") {
          return false;
        }
        if (el.type === "button" || el.type === "submit") return false;
        return el.readOnly === true || mode === "none";
      })
      .map((el) => `${el.tagName.toLowerCase()}#${el.id || "(no-id)"}[readonly=${el.readOnly},inputmode=${el.getAttribute("inputmode")}]`);
  });
  assert(
    offenders.length === 0,
    `no non-gate text fields have readonly/inputmode=none (offenders=${JSON.stringify(offenders)})`
  );
}

await browser.close();
server.close();

if (fails.length) {
  console.error("\nFAILED:\n" + fails.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
console.log("\nAll checks passed.");
