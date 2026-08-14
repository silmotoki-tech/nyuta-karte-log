/**
 * 検証スクリプト共通の認証スタブ。
 *
 * アプリの起動は「認証確定待ち → ログイン → パスコード → 本編」の順で、
 * Firebase セッションが無いとパスコード画面にも到達しない。検証したいのが
 * 認証そのものでない場合も、この関門を越える手当てが必ず要る。
 *
 * 同じ手当てを各スクリプトに書くと、起動フローを変えるたびに全部を直す
 * ことになるため、ここに寄せる。起動フローを変えたらこのファイルだけを直す。
 *
 * 使い分け:
 *   applyAuthStub()   … 本物の js/auth.js を読み、Firebase Auth SDK だけを
 *                        差し替える。起動時の認証状態を作り分けられる。
 *   HARNESS_AUTH_BOOT … app.js を読まないハーネス HTML 用のスニペット。
 *                       認証確定待ちの表示を自前で解除する。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export { MOCK_AUTH_EMAIL, MOCK_AUTH_LOGGED_IN } from "./mock-auth-email.js";

export const PASSCODE = "2211";
export const AUTH_DELAY_MS = 300;

/** 起動時の認証状態として渡すユーザー */
export const AUTH_USERS = {
  none: null,
  anonymous: { uid: "anon-uid", isAnonymous: true },
  signedIn: { uid: "real-uid", email: "clinic@example.com", isAnonymous: false },
};

export const AUTH_EMAIL = "clinic@example.com";
export const AUTH_PASSWORD = "correct-password";

/**
 * Firebase Auth SDK の差し替え。
 * globalThis.__authFixture.initialUser が起動時の認証状態になる。
 * globalThis.__authControl.emit(user) で実行中に認証状態を動かせる。
 */
function firebaseAuthMock(delayMs) {
  return `
const fixture = globalThis.__authFixture || {};
globalThis.__authCalls = { signOut: 0, signInWithEmailAndPassword: 0 };

const auth = { currentUser: null };
const listeners = [];

function emit(user) {
  auth.currentUser = user;
  for (const cb of [...listeners]) cb(user);
}

// 起動直後は「判定中」。少し遅らせて初期状態を通知する。
setTimeout(() => emit(fixture.initialUser ?? null), ${delayMs});

export function getAuth() { return auth; }
export const browserLocalPersistence = { type: "LOCAL" };
export async function setPersistence() {}

export function onAuthStateChanged(_auth, next) {
  listeners.push(next);
  return () => {
    const i = listeners.indexOf(next);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export async function signOut() {
  globalThis.__authCalls.signOut += 1;
  emit(null);
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  globalThis.__authCalls.signInWithEmailAndPassword += 1;
  // 想定外の失敗（コード無しの例外）を再現するための入り口
  if (password === "boom") throw new Error("unexpected boom");
  if (email !== ${JSON.stringify(AUTH_EMAIL)} || password !== ${JSON.stringify(AUTH_PASSWORD)}) {
    const err = new Error("bad credential");
    err.code = "auth/invalid-credential";
    throw err;
  }
  const user = { uid: "real-uid", email, isAnonymous: false };
  emit(user);
  return { user };
}

globalThis.__authControl = { emit, get currentUser() { return auth.currentUser; } };
`;
}

const FIREBASE_APP_MOCK = `export const app = {};`;

const API_KEY_MOCK = `
export function hasApiKey() { return false; }
export function getApiKey() { return ""; }
export function setApiKey() {}
export function clearApiKey() {}
`;

/** scripts/ 配下のモック DB をそのまま読む */
export function readMockDb(fileName) {
  return fs.readFileSync(path.join(__dirname, fileName), "utf8");
}

/**
 * 認証まわりを差し替えてアプリを起動できる状態にする。goto の前に呼ぶ。
 *
 * @param {import("playwright").Page} page
 * @param {object} [options]
 * @param {object|null} [options.user] 起動時の認証状態。既定はログイン済み
 * @param {boolean} [options.passcodeVerifiedToday] 当日パスコード済みにするか
 * @param {string|null} [options.dbMock] js/db.js に差し込む中身
 * @param {number} [options.authDelayMs] 認証状態が確定するまでの遅延
 * @param {boolean} [options.stubApiKey] js/api-key.js を差し替えるか
 */
export async function applyAuthStub(page, options = {}) {
  const {
    user = AUTH_USERS.signedIn,
    passcodeVerifiedToday = false,
    dbMock = null,
    authDelayMs = AUTH_DELAY_MS,
    stubApiKey = true,
  } = options;

  await page.addInitScript(
    ({ initialUser, passcodeToday }) => {
      globalThis.__authFixture = { initialUser };
      // Service Worker が動くと fetch がそちらに渡り、page.route の差し替えが
      // 素通りして本物の db.js が読まれる。登録自体をさせない。
      if (navigator.serviceWorker) {
        navigator.serviceWorker.register = async () => ({
          scope: "/",
          update: async () => {},
          unregister: async () => true,
          addEventListener() {},
          installing: null,
          waiting: null,
          active: null,
        });
      }
      if (passcodeToday) {
        // 本物の passcode-auth.js は「今日の日付」と一致するかで判定する
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(now.getDate()).padStart(2, "0")}`;
        localStorage.setItem("nyutaKartePasscodeVerified", "1");
        localStorage.setItem("nyutaKartePasscodeVerifiedDate", today);
      }
    },
    { initialUser: user, passcodeToday: passcodeVerifiedToday }
  );

  const routes = [
    ["**/firebasejs/**/firebase-auth.js", firebaseAuthMock(authDelayMs)],
    ["**/js/firebase-app.js", FIREBASE_APP_MOCK],
  ];
  if (stubApiKey) routes.push(["**/js/api-key.js", API_KEY_MOCK]);
  if (dbMock) routes.push(["**/js/db.js", dbMock]);

  for (const [pattern, body] of routes) {
    await page.route(pattern, (route) =>
      route.fulfill({ contentType: "application/javascript", body })
    );
  }
}

/** パスコード画面のテンキーで入力して次へ進む */
export async function enterPasscode(page, code = PASSCODE) {
  await page.waitForSelector("#passcode-numpad .numpad__btn", { state: "visible" });
  for (const d of code.split("")) {
    await page.click(`#passcode-numpad [data-pass-digit="${d}"]`);
  }
  await page.click("#btn-passcode-next");
  await page.waitForTimeout(200);
}

/** 各画面が実際に見えているか（hidden 属性ではなく描画結果で判定する） */
export async function visibleScreens(page) {
  return page.evaluate(() => {
    const shown = (id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
    };
    return {
      pending: shown("screen-auth-pending"),
      login: shown("screen-login"),
      lock: shown("screen-lock"),
      app: shown("app-shell"),
      pendingClass: document.documentElement.classList.contains("is-auth-pending"),
    };
  });
}

/**
 * app.js を読まないハーネス HTML に差し込むスニペット。
 * index.html 冒頭のインラインスクリプトが付ける is-auth-pending を解除し、
 * ログイン画面も畳んでおく（畳まないと画面が2枚ぶん縦に伸びる）。
 */
export const HARNESS_AUTH_BOOT = `
document.documentElement.classList.remove("is-auth-pending");
document.getElementById("screen-login")?.setAttribute("hidden", "");
`;
