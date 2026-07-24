// にゅうたカルテ記録アプリ用 Service Worker
// アプリの見た目（HTML/CSS/JS/アイコン）だけをキャッシュし、
// Firebaseとの通信（データ本体）はキャッシュせず常にネットワークを利用する。
//
// HTML/JS/CSS はネットワーク優先。
// 新バージョンの有効化はクライアントからの SKIP_WAITING メッセージで行う
// （記入中の強制リロードを避けるため、install 時の自動 skipWaiting はしない）。
//
// ※ CACHE_VERSION を上げるときは js/app-version.js の APP_VERSION / CACHE_LABEL も合わせて更新する。

const CACHE_VERSION = "v85";
const CACHE_NAME = `nyuta-karte-log-${CACHE_VERSION}`;

const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/firebase-config.js",
  "./js/firebase-app.js",
  "./js/auth.js",
  "./js/db.js",
  "./js/exam-plan-ui.js",
  "./js/meds-ui.js",
  "./js/freq-picker.js",
  "./js/history-ui.js",
  "./js/procedures-ui.js",
  "./js/special-notes-ui.js",
  "./js/api-key.js",
  "./js/anthropic.js",
  "./js/exam-item-match.js",
  "./js/ai-suggest-ui.js",
  "./js/feature-flags.js",
  "./js/settings-ui.js",
  "./js/free-qa-ui.js",
  "./js/app-version.js",
  "./js/sw-update.js",
  "./js/passcode-auth.js",
  "./js/icon-actions.js",
  "./js/row-gestures.js",
  "./js/ime-keys.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
  "./icons/favicon.png",
];

self.addEventListener("install", (event) => {
  // 個別ファイルの取得失敗で install 全体が落ちないようにする
  // （install 失敗だと waiting に進まず、更新案内も出ない）
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL_FILES.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[sw] cache.add failed:", url, err);
          })
        )
      )
    )
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isAppShellRequest(request, url) {
  if (request.mode === "navigate") return true;
  const path = url.pathname;
  return (
    path.endsWith(".html") ||
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith("/") ||
    path.endsWith("/nyuta-karte-log")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (isAppShellRequest(request, url)) {
    // GitHub Pages は HTML/JS/CSS に max-age=600 を付けるため、
    // デフォルトの fetch だと Chrome / PWA が古いシェルを HTTP キャッシュから
    // 返してテンキー欠落などが残ることがある。アプリシェルは常に再取得する。
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || Response.error())
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
