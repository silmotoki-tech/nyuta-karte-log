/**
 * 検証用モック auth.js（メール/パスワード認証対応）。
 * 本番 app.js が import する名前を揃える。
 */
/** 未ログインから開始（ログイン画面の検証用） */
export const MOCK_AUTH_EMAIL = `
let currentUser = null;
let authReadyResolve;
let authReadySettled = false;
export const authReady = new Promise((resolve) => {
  authReadyResolve = resolve;
});
function settle(user) {
  if (!user || authReadySettled) return;
  authReadySettled = true;
  authReadyResolve(user);
}
export async function waitForInitialAuthState() {
  return currentUser;
}
export async function signInWithEmailPassword(email, password) {
  const e = String(email || "").trim();
  const p = String(password || "");
  if (e === "clinic@example.com" && p === "correct-password") {
    currentUser = { uid: "clinic-test-uid", email: e };
    settle(currentUser);
    return currentUser;
  }
  const err = new Error("invalid");
  err.code = "auth/invalid-credential";
  throw err;
}
export async function signOutUser() {
  currentUser = null;
}
export function getCurrentUser() {
  return currentUser;
}
export function authErrorMessage(error) {
  const code = error?.code || "";
  if (
    code === "auth/wrong-password" ||
    code === "auth/invalid-credential" ||
    code === "auth/invalid-login-credentials" ||
    code === "auth/user-not-found"
  ) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }
  return "ログインに失敗しました。入力内容を確認してください。";
}
`;

/** 既にログイン済みとして起動する（既存のフルアプリ検証用） */
export const MOCK_AUTH_LOGGED_IN = `
const currentUser = { uid: "test", email: "clinic@example.com" };
export const authReady = Promise.resolve(currentUser);
export async function waitForInitialAuthState() {
  return currentUser;
}
export async function signInWithEmailPassword() {
  return currentUser;
}
export async function signOutUser() {}
export function getCurrentUser() {
  return currentUser;
}
export function authErrorMessage() {
  return "ログインに失敗しました。";
}
`;
