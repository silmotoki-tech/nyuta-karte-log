// にゅうたカルテ記録アプリ用 Service Worker
// アプリの見た目（HTML/CSS/JS/アイコン）だけをキャッシュし、
// Firebaseとの通信（データ本体）はキャッシュせず常にネットワークを利用する。
//
// HTML/JS/CSS はネットワーク優先にする。
// （キャッシュ優先だとデプロイ後に古い app.js と新しい index.html が混在し、
//  パスコード画面が進まなくなる事故が起きうる）

const CACHE_VERSION = "v11";
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
  "./js/history-ui.js",
  "./js/api-key.js",
  "./js/anthropic.js",
  "./js/settings-ui.js",
  "./js/free-qa-ui.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
  "./icons/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_FILES))
      .then(() => self.skipWaiting())
  );
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
      .then(() =>
        self.clients.matchAll({ type: "window", includeUncontrolled: true })
      )
      .then((clients) => {
        // 新しいシェルを確実に読み込ませる
        clients.forEach((client) => {
          if (client.url && "navigate" in client) {
            client.navigate(client.url);
          }
        });
      })
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

  // 自分自身のオリジン（アプリ本体）以外は Service Worker で扱わず、
  // ブラウザに任せる（Firebase / CDN 等への通信をそのまま素通しする）。
  if (url.origin !== self.location.origin) {
    return;
  }

  // HTML / JS / CSS はネットワーク優先（オフライン時のみキャッシュ）
  if (isAppShellRequest(request, url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  // アイコン等はキャッシュ優先
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
