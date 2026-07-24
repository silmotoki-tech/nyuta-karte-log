// 設定画面（Anthropic APIキーのQR読取・状態表示・削除・バージョン表示）と
// 中央カラムの設定メニュー（ログアウト等。項目追加しやすいメニュー形式）。

import { hasApiKey, setApiKey, clearApiKey } from "./api-key.js";
import { APP_VERSION, CACHE_LABEL } from "./app-version.js";

let deps = {
  showToast: () => {},
  showError: () => {},
  onApiKeyChange: () => {},
  onLogout: () => {},
};

let html5Qrcode = null;
let scanning = false;
let menuOpen = false;

const settingsModal = document.getElementById("settings-modal");
const btnCloseSettings = document.getElementById("btn-close-settings");
const apiKeyStatusEl = document.getElementById("settings-api-key-status");
const lockApiKeyStatusEl = document.getElementById("lock-api-key-status");
const btnLockApiKeySettings = document.getElementById("btn-lock-api-key-settings");
const btnScanQr = document.getElementById("btn-settings-scan-qr");
const btnDeleteKey = document.getElementById("btn-settings-delete-key");
const btnStopScan = document.getElementById("btn-settings-stop-scan");
const qrReaderEl = document.getElementById("settings-qr-reader");
const qrSection = document.getElementById("settings-qr-section");
const settingsError = document.getElementById("settings-error");
const settingsVersionEl = document.getElementById("settings-app-version");

const appMenu = document.getElementById("app-menu");
const btnAppMenu = document.getElementById("btn-app-menu");
const appMenuPanel = document.getElementById("app-menu-panel");

/** 設定メニューのアクション定義（今後の項目追加はここに足す） */
const APP_MENU_ACTIONS = {
  logout: () => {
    handleLogout();
  },
};

export function initSettingsUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  btnCloseSettings?.addEventListener("click", closeSettings);
  settingsModal
    ?.querySelector("[data-close-modal]")
    ?.addEventListener("click", closeSettings);
  btnScanQr?.addEventListener("click", startQrScan);
  btnStopScan?.addEventListener("click", stopQrScan);
  btnDeleteKey?.addEventListener("click", handleDeleteKey);
  btnLockApiKeySettings?.addEventListener("click", () => openSettings());

  btnAppMenu?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleAppMenu();
  });
  appMenuPanel?.querySelectorAll("[data-app-menu-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-app-menu-action");
      closeAppMenu();
      const handler = APP_MENU_ACTIONS[action];
      if (typeof handler === "function") handler();
    });
  });
  document.addEventListener("click", (event) => {
    if (!menuOpen) return;
    if (appMenu && !appMenu.contains(event.target)) closeAppMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuOpen) closeAppMenu();
  });

  refreshApiKeyStatus();
  refreshVersionLabel();
}

export function openSettings() {
  closeAppMenu();
  deps.showError(settingsError, "");
  refreshApiKeyStatus();
  refreshVersionLabel();
  if (settingsModal) settingsModal.hidden = false;
}

function refreshVersionLabel() {
  if (!settingsVersionEl) return;
  settingsVersionEl.textContent = `バージョン ${APP_VERSION}（${CACHE_LABEL}）`;
}

export async function closeSettings() {
  await stopQrScan();
  if (settingsModal) settingsModal.hidden = true;
  refreshApiKeyStatus();
}

function paintApiKeyStatus(el, ready) {
  if (!el) return;
  el.textContent = ready ? "設定済み" : "未設定";
  el.classList.toggle("is-ready", ready);
  el.classList.toggle("is-empty", !ready);
}

export function refreshApiKeyStatus() {
  const ready = hasApiKey();
  paintApiKeyStatus(apiKeyStatusEl, ready);
  paintApiKeyStatus(lockApiKeyStatusEl, ready);
  if (btnDeleteKey) btnDeleteKey.disabled = !ready;
}

function toggleAppMenu() {
  if (menuOpen) closeAppMenu();
  else openAppMenu();
}

function openAppMenu() {
  if (!appMenuPanel || !btnAppMenu) return;
  menuOpen = true;
  appMenuPanel.hidden = false;
  btnAppMenu.setAttribute("aria-expanded", "true");
}

function closeAppMenu() {
  if (!appMenuPanel || !btnAppMenu) return;
  menuOpen = false;
  appMenuPanel.hidden = true;
  btnAppMenu.setAttribute("aria-expanded", "false");
}

async function ensureHtml5Qrcode() {
  if (typeof window.Html5Qrcode === "function") {
    return window.Html5Qrcode;
  }
  await loadScript(
    "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"
  );
  if (typeof window.Html5Qrcode !== "function") {
    throw new Error("QRコード読み取りライブラリの読み込みに失敗しました。");
  }
  return window.Html5Qrcode;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "1";
      resolve();
    });
    script.addEventListener("error", () =>
      reject(new Error("スクリプトの読み込みに失敗しました。"))
    );
    document.head.appendChild(script);
  });
}

async function startQrScan() {
  deps.showError(settingsError, "");
  if (scanning) return;

  try {
    const Html5Qrcode = await ensureHtml5Qrcode();
    if (qrSection) qrSection.hidden = false;
    if (btnScanQr) btnScanQr.hidden = true;
    if (btnStopScan) btnStopScan.hidden = false;

    html5Qrcode = new Html5Qrcode("settings-qr-reader");
    scanning = true;

    await html5Qrcode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (decodedText) => {
        const key = extractApiKey(decodedText);
        if (!key) {
          deps.showError(
            settingsError,
            "QRコードからAPIキーを読み取れませんでした。キー文字列のQRをかざしてください。"
          );
          return;
        }
        try {
          setApiKey(key);
          refreshApiKeyStatus();
          deps.onApiKeyChange();
          deps.showToast("APIキーを設定しました。");
          deps.showError(settingsError, "");
          await stopQrScan();
        } catch (err) {
          console.error(err);
          deps.showError(settingsError, "APIキーの保存に失敗しました。");
        }
      },
      () => {
        // フレームごとの未検出は無視
      }
    );
  } catch (err) {
    console.error(err);
    scanning = false;
    html5Qrcode = null;
    if (qrSection) qrSection.hidden = true;
    if (btnScanQr) btnScanQr.hidden = false;
    if (btnStopScan) btnStopScan.hidden = true;
    deps.showError(
      settingsError,
      "カメラを起動できませんでした。ブラウザのカメラ許可を確認してください。"
    );
  }
}

async function stopQrScan() {
  if (!html5Qrcode) {
    scanning = false;
    if (qrSection) qrSection.hidden = true;
    if (btnScanQr) btnScanQr.hidden = false;
    if (btnStopScan) btnStopScan.hidden = true;
    if (qrReaderEl) qrReaderEl.innerHTML = "";
    return;
  }
  try {
    const state = html5Qrcode.getState?.();
    // 2 = SCANNING（html5-qrcode の Html5QrcodeScannerState）
    if (state === 2 || scanning) {
      await html5Qrcode.stop();
    }
    await html5Qrcode.clear();
  } catch (err) {
    console.warn("QRスキャナ停止時の警告", err);
  } finally {
    html5Qrcode = null;
    scanning = false;
    if (qrSection) qrSection.hidden = true;
    if (btnScanQr) btnScanQr.hidden = false;
    if (btnStopScan) btnStopScan.hidden = true;
    if (qrReaderEl) qrReaderEl.innerHTML = "";
  }
}

/**
 * QRの中身からAPIキー文字列を取り出す。
 * プレーンテキスト、または sk-ant- を含む文字列に対応。
 */
function extractApiKey(raw) {
  const text = (raw || "").trim();
  if (!text) return "";
  if (/^sk-ant-/.test(text)) return text;
  const match = text.match(/sk-ant-[A-Za-z0-9_-]+/);
  if (match) return match[0];
  // プレーンなキー想定（Anthropic以外の形式にも一応対応）
  if (text.length >= 20 && !/\s/.test(text)) return text;
  return "";
}

function handleDeleteKey() {
  if (!hasApiKey()) return;
  const ok = window.confirm(
    "このiPadに保存されているAPIキーを削除しますか？\nAI機能を使うには再度QRコードで設定が必要です。"
  );
  if (!ok) return;
  try {
    clearApiKey();
    refreshApiKeyStatus();
    deps.onApiKeyChange();
    deps.showToast("APIキーを削除しました。");
  } catch (err) {
    console.error(err);
    deps.showToast("削除に失敗しました。", { isError: true });
  }
}

async function handleLogout() {
  const ok = window.confirm(
    "ログアウトしますか？\n次回起動時にパスコードの再入力が必要になります。"
  );
  if (!ok) return;
  await closeSettings();
  deps.onLogout();
}
