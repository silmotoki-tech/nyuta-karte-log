// 検証スクリプト共通のブラウザ起動。
//
// Playwright が同梱ブラウザを既定の場所に持っていない環境があるため、
// サンドボックスのキャッシュ → システムの Chrome → Playwright 既定、の順に試す。
// これを使わずに chromium.launch() を直接呼ぶと、環境によっては
// 「Executable doesn't exist」で落ち、毎回コード変更と無関係な切り分けが要る。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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

export async function launchBrowser(options = {}) {
  const settings = { headless: true, timeout: 30_000, ...options };
  const candidates = [
    findChromeHeadlessShell(),
    fs.existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : null,
  ].filter(Boolean);

  for (const executablePath of candidates) {
    try {
      return await chromium.launch({ ...settings, executablePath });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  // 同梱ブラウザが入っている環境ならこれで起動する
  return chromium.launch(settings);
}
