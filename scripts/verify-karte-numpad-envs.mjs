/**
 * カルテ番号テンキーの環境別検証。
 * - Chrome ブラウザ相当
 * - display-mode: standalone 相当
 * - 古い HTML（#karte-numpad 無し）+ 現行 JS で自動生成されること
 * - コンソールエラー（Firebase 以外）
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
  let body = fs.readFileSync(fp);
  // 古い HTML シナリオ: query ?staleHtml=1
  if (u.endsWith("index.html") && String(req.url).includes("staleHtml=1")) {
    let html = body.toString("utf8");
    html = html.replace(
      /<div class="numpad numpad--gate" id="karte-numpad"[\s\S]*?<\/div>\s*/,
      ""
    );
    html = html.replace(
      /inputmode="none"\s*\n\s*readonly/,
      'inputmode="numeric"'
    );
    body = Buffer.from(html, "utf8");
  }
  res.writeHead(200, {
    "Content-Type": contentType(fp),
    "Cache-Control": "no-store",
  });
  res.end(body);
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  executablePath: SYSTEM_CHROME,
  headless: true,
});

async function runCase(label, { url, standalone = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1180, height: 900 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  if (standalone) {
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "display-mode", value: "standalone" }],
    });
    await page.addInitScript(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (q) => {
        if (String(q).includes("display-mode: standalone")) {
          return {
            matches: true,
            media: q,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            onchange: null,
            dispatchEvent() {
              return false;
            },
          };
        }
        return orig(q);
      };
      Object.defineProperty(navigator, "standalone", {
        configurable: true,
        get: () => true,
      });
    });
  }

  await page.goto(url, { waitUntil: "networkidle" });
  await page.fill("#passcode-input", "2211");
  await page.click("#btn-passcode-next");
  await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 10000 });
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    const pad = document.getElementById("karte-numpad");
    const input = document.getElementById("karte-number-input");
    const r = pad?.getBoundingClientRect();
    return {
      standalone: matchMedia("(display-mode: standalone)").matches,
      padExists: !!pad,
      btnCount: pad?.querySelectorAll(".numpad__btn").length || 0,
      padH: r?.height || 0,
      inputReadonly: !!input?.readOnly,
      inputmode: input?.getAttribute("inputmode"),
    };
  });

  // 入力動作
  await page.click('#karte-numpad [data-karte-digit="1"]');
  await page.click('#karte-numpad [data-karte-digit="2"]');
  await page.click('#karte-numpad [data-karte-digit="3"]');
  await page.click('#karte-numpad [data-karte-digit="4"]');
  await page.click('#karte-numpad [data-karte-digit="5"]');
  const value = await page.inputValue("#karte-number-input");

  const shot = path.join(root, "tools", `karte-numpad-verify-${label}.png`);
  await page.locator("#gate-karte .gate-card").screenshot({ path: shot });

  const filteredPage = pageErrors.filter(
    (e) => !/Firebase|network-request|Failed to fetch/i.test(e)
  );
  const filteredConsole = consoleErrors.filter(
    (e) => !/Firebase|gstatic|googleapis|network-request|Failed to fetch/i.test(e)
  );

  const ok =
    info.padExists &&
    info.btnCount === 12 &&
    info.padH > 100 &&
    info.inputReadonly &&
    info.inputmode === "none" &&
    value === "12345" &&
    filteredPage.length === 0;

  console.log(
    JSON.stringify(
      {
        label,
        ok,
        info,
        value,
        pageErrors: filteredPage,
        consoleErrors: filteredConsole.slice(0, 10),
        shot,
      },
      null,
      2
    )
  );

  await context.close();
  return ok;
}

const results = [];
results.push(
  await runCase("chrome-browser", { url: `${base}/index.html` })
);
results.push(
  await runCase("chrome-standalone", {
    url: `${base}/index.html`,
    standalone: true,
  })
);
results.push(
  await runCase("stale-html-new-js", {
    url: `${base}/index.html?staleHtml=1`,
  })
);

// SW の app shell fetch が cache: 'no-store' を使うこと
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const swOk = /fetch\(\s*request\s*,\s*\{\s*cache:\s*"no-store"\s*\}\s*\)/.test(
  sw
);
console.log(JSON.stringify({ label: "sw-no-store", ok: swOk }, null, 2));
results.push(swOk);

await browser.close();
server.close();

if (!results.every(Boolean)) {
  console.error("VERIFY_FAILED");
  process.exit(1);
}
console.log("VERIFY_OK");
