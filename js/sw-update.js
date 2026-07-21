// Service Worker の登録・更新チェック・ユーザー確認付き適用。

let registration = null;
let updateBanner = null;
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
        // 起動のたびに必ず更新チェック
        reg.update().catch(() => {});
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
      registration.update().catch(() => {});
    }
  });

  // 新しい SW が制御を握ったら再読み込み（ユーザーが「更新」を選んだ後）
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function wireRegistration(reg) {
  if (reg.waiting && navigator.serviceWorker.controller) {
    promptUpdate(reg);
  }

  reg.addEventListener("updatefound", () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (
        installing.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        promptUpdate(reg);
      }
    });
  });
}

function promptUpdate(reg) {
  if (typeof deps.onPrompt === "function") {
    deps.onPrompt(reg);
    return;
  }
  showDefaultUpdateBanner(reg);
}

function showDefaultUpdateBanner(reg) {
  if (updateBanner && document.body.contains(updateBanner)) return;

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
    .addEventListener("click", () => applyWaitingUpdate(reg));
  updateBanner
    .querySelector("[data-sw-dismiss]")
    .addEventListener("click", () => {
      updateBanner.remove();
      updateBanner = null;
    });
  document.body.appendChild(updateBanner);
}

/**
 * waiting 中の Service Worker を有効化し、controllerchange → reload へ進める。
 */
export function applyWaitingUpdate(reg) {
  const target = reg || registration;
  if (!target?.waiting) {
    window.location.reload();
    return;
  }
  target.waiting.postMessage({ type: "SKIP_WAITING" });
}
