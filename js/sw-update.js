// Service Worker の登録・更新チェック・ユーザー確認付き適用。
//
// このアプリは HTML/JS をネットワーク優先で取るため、画面の JS だけ先に新しくなり、
// SW 本体の更新検知が遅れる／失敗するとバナーが出ないことがある。
// そのため (1) SW waiting 検知 (2) 制御中 SW と配信中バージョンの突合 の両方で案内する。

import { CACHE_LABEL } from "./app-version.js";

const CONTROLLING_LABEL_KEY = "nyuta-sw-controlling-label";

let registration = null;
let updateBanner = null;
let promptedWaiting = null;
let dismissUntil = 0;
let updateTimer = null;
let deps = {
  onPrompt: null,
};

/**
 * 起動時に SW を登録し、更新チェックを行う。
 * 新しいバージョンがある場合は onUpdateAvailable を呼ぶ。
 */
export function initServiceWorkerUpdates({ onUpdateAvailable } = {}) {
  if (!("serviceWorker" in navigator)) return;

  deps.onPrompt = onUpdateAvailable || null;

  const register = () => {
    navigator.serviceWorker
      .register("./service-worker.js", { updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        wireRegistration(reg);
        void checkForUpdates(reg);
      })
      .catch(() => {
        // オフライン非対応でもアプリ自体は動作するため握りつぶす
      });
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);

  // フォアグラウンド復帰時もチェック（PWA運用向け）
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && registration) {
      void checkForUpdates(registration);
    }
  });
  window.addEventListener("pageshow", () => {
    if (registration) void checkForUpdates(registration);
  });
  window.addEventListener("focus", () => {
    if (registration) void checkForUpdates(registration);
  });

  // 開いたままの端末でも取りこぼさないよう、表示中は定期チェック
  updateTimer = window.setInterval(() => {
    if (document.visibilityState === "visible" && registration) {
      void checkForUpdates(registration);
    }
  }, 45_000);

  // 新しい SW が制御を握ったら再読み込み（ユーザーが「更新」を選んだ後）
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

export async function checkForUpdatesNow() {
  if (!("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }
  const reg =
    registration ||
    (await navigator.serviceWorker.getRegistration("./service-worker.js"));
  if (!reg) {
    return { ok: false, reason: "no-registration" };
  }
  registration = reg;
  // 手動確認では「あとで」抑制を解除する
  dismissUntil = 0;
  promptedWaiting = null;
  return checkForUpdates(reg, { forcePrompt: true });
}

async function checkForUpdates(reg, { forcePrompt = false } = {}) {
  if (!reg) return { ok: false, reason: "no-registration" };

  try {
    await reg.update();
  } catch {
    /* ignore */
  }

  // update() 直後〜install 完了までの待ちを短く拾う
  for (let i = 0; i < 8; i += 1) {
    if (reg.waiting && navigator.serviceWorker.controller) break;
    await sleep(250);
  }

  const waitingReady = Boolean(reg.waiting && navigator.serviceWorker.controller);
  if (waitingReady) {
    promptUpdate(reg, { forcePrompt, mode: "waiting" });
    return { ok: true, mode: "waiting" };
  }

  // SW ファイルの更新検知が遅れても、配信中バージョンと制御中バージョンが
  // 食い違っていれば案内する（ネットワーク優先シェルとのギャップ対策）
  const mismatch = await detectVersionMismatch();
  if (mismatch) {
    promptUpdate(reg, { forcePrompt, mode: "reload", remoteLabel: mismatch.remote });
    return { ok: true, mode: "reload", remote: mismatch.remote };
  }

  return { ok: true, mode: "current" };
}

function wireRegistration(reg) {
  if (reg.waiting && navigator.serviceWorker.controller) {
    promptUpdate(reg, { mode: "waiting" });
  }

  reg.addEventListener("updatefound", () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (
        installing.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        // installed → waiting 反映を待ってから案内
        void (async () => {
          for (let i = 0; i < 10; i += 1) {
            if (reg.waiting) break;
            await sleep(100);
          }
          promptUpdate(reg, { mode: "waiting" });
        })();
      }
    });
  });
}

function promptUpdate(reg, { forcePrompt = false, mode = "waiting", remoteLabel = "" } = {}) {
  if (!forcePrompt && Date.now() < dismissUntil) return;

  if (mode === "waiting") {
    if (reg?.waiting && promptedWaiting === reg.waiting && !forcePrompt) return;
    if (reg?.waiting) promptedWaiting = reg.waiting;
  }

  if (typeof deps.onPrompt === "function") {
    deps.onPrompt(reg, { mode, remoteLabel });
    return;
  }
  showDefaultUpdateBanner(reg, { mode });
}

function showDefaultUpdateBanner(reg, { mode = "waiting" } = {}) {
  document.querySelectorAll(".sw-update-banner").forEach((el) => el.remove());

  updateBanner = document.createElement("div");
  updateBanner.className = "sw-update-banner";
  updateBanner.setAttribute("role", "status");
  updateBanner.innerHTML = `
    <p class="sw-update-banner__text">新しいバージョンがあります。更新しますか？</p>
    <div class="sw-update-banner__actions">
      <button type="button" class="btn btn--small btn--primary" data-sw-update>更新する</button>
      <button type="button" class="btn btn--small btn--outline" data-sw-dismiss>あとで</button>
    </div>
  `;
  updateBanner
    .querySelector("[data-sw-update]")
    .addEventListener("click", () => applyWaitingUpdate(reg, { mode }));
  updateBanner
    .querySelector("[data-sw-dismiss]")
    .addEventListener("click", () => dismissUpdatePrompt(30));
  document.body.appendChild(updateBanner);
}

/**
 * waiting 中の Service Worker を有効化し、controllerchange → reload へ進める。
 * waiting が無い場合は再読み込みのみ行う。
 */
export function applyWaitingUpdate(reg, { mode } = {}) {
  const target = reg || registration;
  if (target?.waiting) {
    target.waiting.postMessage({ type: "SKIP_WAITING" });
    // controllerchange が来ない端末向けの保険
    window.setTimeout(() => window.location.reload(), 1200);
    return;
  }
  window.location.reload();
}

/** 「あとで」押下時に再表示をしばらく抑える */
export function dismissUpdatePrompt(minutes = 30) {
  dismissUntil = Date.now() + minutes * 60 * 1000;
  document.querySelectorAll(".sw-update-banner").forEach((el) => el.remove());
  updateBanner = null;
}

async function detectVersionMismatch() {
  const remote = await fetchRemoteCacheLabel();
  if (!remote) return null;

  const controlling = await getControllingCacheLabel();
  if (controlling) {
    rememberControllingLabel(controlling);
    if (controlling !== remote) return { remote, controlling };
  } else {
    // 旧 SW は GET_VERSION 非対応。最後に把握した制御中ラベルと比較する
    const stored = readControllingLabel();
    if (stored && stored !== remote) {
      return { remote, controlling: stored };
    }
  }

  // ページが古いバンドルのまま（稀：HTTPキャッシュ残り）で配信が新しい場合
  if (CACHE_LABEL && remote !== CACHE_LABEL) {
    return { remote, controlling: CACHE_LABEL };
  }
  return null;
}

function rememberControllingLabel(label) {
  if (!label) return;
  try {
    localStorage.setItem(CONTROLLING_LABEL_KEY, label);
  } catch {
    /* ignore */
  }
}

function readControllingLabel() {
  try {
    return localStorage.getItem(CONTROLLING_LABEL_KEY);
  } catch {
    return null;
  }
}

async function fetchRemoteCacheLabel() {
  try {
    const res = await fetch(`./js/app-version.js?swcheck=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const text = await res.text();
    const m = text.match(/CACHE_LABEL\s*=\s*["']([^"']+)["']/);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

function getControllingCacheLabel() {
  return new Promise((resolve) => {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) {
      resolve(null);
      return;
    }
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      resolve(event.data?.cacheLabel || event.data?.version || null);
    };
    try {
      controller.postMessage({ type: "GET_VERSION" }, [channel.port2]);
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// テスト／デバッグ用にタイマーを止められるようにする
export function _stopUpdateTimerForTests() {
  if (updateTimer) window.clearInterval(updateTimer);
  updateTimer = null;
}
