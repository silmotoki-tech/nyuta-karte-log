// Firebase Authentication（メール/パスワード）。
// 未ログイン時はログイン画面でユーザーが認証する。
// ログイン成功後は browserLocalPersistence により、ブラウザを閉じてもセッションが復元される。
// db.js は authReady（ログイン済みユーザー確定）を待ってから Realtime Database にアクセスする。
//
// 展開中の共存（重要）:
// - このクライアントは匿名ログインを呼ばない。
// - 旧バージョンが作った匿名セッションは端末に残り続けるため、未ログインとして扱い、
//   検出しだいサインアウトする。残したままだとログイン画面を出さずに素通りしてしまう。
// - 匿名の無効化と UID 限定ルールのデプロイは、全端末のメールログイン完了後に行う。
//   手順は docs/AUTH-ROLLOUT.md を参照。

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { app } from "./firebase-app.js";

const auth = getAuth(app);

let authReadyResolve;
let authReadySettled = false;

/**
 * ログイン済みユーザーが確定すると解決される Promise。
 * 未ログインの間は解決しない（ログイン成功を待つ）。
 */
export const authReady = new Promise((resolve) => {
  authReadyResolve = resolve;
});

/**
 * メール/パスワードでログインしたユーザーだけを「ログイン済み」とみなす。
 * 匿名ユーザーは旧バージョンの名残であり、認証の関門を通す対象ではない。
 */
export function isSignedInUser(user) {
  return !!user && !user.isAnonymous;
}

function settleAuthReady(user) {
  if (!isSignedInUser(user) || authReadySettled) return;
  authReadySettled = true;
  authReadyResolve(user);
}

/**
 * 旧バージョンが残した匿名セッションを破棄する。
 * 残しておくと onAuthStateChanged が user を返し続け、ログイン画面の判定を誤らせる。
 */
async function discardAnonymousSession(user) {
  if (!user?.isAnonymous) return;
  try {
    await signOut(auth);
  } catch (err) {
    console.error("匿名セッションの破棄に失敗しました", err);
  }
}

const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(
  (err) => {
    console.error("認証の永続化設定に失敗しました", err);
  }
);

/**
 * 起動時の認証状態を1回だけ待つ（ログイン済みユーザー or null）。
 * 永続セッションがあれば自動復元される。匿名セッションは破棄して null を返す。
 */
export async function waitForInitialAuthState() {
  await persistenceReady;
  const user = await new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (current) => {
        unsubscribe();
        resolve(current);
      },
      (error) => {
        unsubscribe();
        console.error("ログイン状態の監視に失敗しました", error);
        reject(error);
      }
    );
  });
  if (user?.isAnonymous) {
    await discardAnonymousSession(user);
    return null;
  }
  if (user) settleAuthReady(user);
  return user;
}

// 初回以降のログイン（画面からのサインイン）でも authReady を解決する
onAuthStateChanged(auth, (user) => {
  settleAuthReady(user);
});

/**
 * メール/パスワードでサインインする。認証情報は呼び出し元から渡す（ハードコードしない）。
 */
export async function signInWithEmailPassword(email, password) {
  await persistenceReady;
  const cred = await signInWithEmailAndPassword(
    auth,
    String(email || "").trim(),
    String(password || "")
  );
  settleAuthReady(cred.user);
  return cred.user;
}

/**
 * Firebase からサインアウトする（次回起動時はログイン画面に戻る）。
 */
export async function signOutUser() {
  await persistenceReady;
  await signOut(auth);
}

export function getCurrentUser() {
  const user = auth.currentUser;
  return isSignedInUser(user) ? user : null;
}

/**
 * Firebase Auth のエラーをユーザー向けの短い日本語にする。
 */
export function authErrorMessage(error) {
  const code = error?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "メールアドレスの形式が正しくありません。";
    case "auth/user-disabled":
      return "このアカウントは無効になっています。";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "メールアドレスまたはパスワードが正しくありません。";
    case "auth/too-many-requests":
      return "試行回数が多すぎます。しばらくしてから再度お試しください。";
    case "auth/network-request-failed":
      return "通信に失敗しました。ネットワークを確認してください。";
    case "auth/operation-not-allowed":
      return "メール/パスワードのログインが有効になっていません。管理者に連絡してください。";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
      return "アプリの設定が正しくありません。管理者に連絡してください。";
    default:
      // 想定外の失敗でも原因を追えるよう、コードか本文を添える。
      return `ログインに失敗しました。${
        code || error?.message ? `（${code || error.message}）` : ""
      }`;
  }
}
