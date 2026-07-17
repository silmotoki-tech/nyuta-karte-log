// Firebase Anonymous Authentication。
// アプリ起動時に自動でサインインし、DBへの読み書きはこのログイン完了を待ってから行う。
// （Realtime Database側のルールを "auth != null" 等に設定することで、
//  未ログイン状態からの読み書きを拒否できるようになる）

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { app } from "./firebase-app.js";

const auth = getAuth(app);

/**
 * 匿名ログインが完了すると解決される Promise。
 * db.js の各関数はこれを await してから Realtime Database にアクセスする。
 * ログイン自体に失敗した場合（Firebaseコンソールで匿名ログインが
 * 有効になっていない場合など）は reject され、呼び出し元がエラーとして
 * 検知できるようにする（ここで reject しないと、画面がずっと
 * 「確認中...」のまま固まって見えてしまうため）。
 */
export const authReady = new Promise((resolve, reject) => {
  let settled = false;

  const unsubscribe = onAuthStateChanged(
    auth,
    (user) => {
      if (user && !settled) {
        settled = true;
        unsubscribe();
        resolve(user);
      }
    },
    (error) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      console.error("ログイン状態の監視に失敗しました", error);
      reject(error);
    }
  );

  signInAnonymously(auth).catch((error) => {
    if (settled) return;
    settled = true;
    unsubscribe();
    console.error("匿名ログインに失敗しました", error);
    reject(error);
  });
});

// authReady は各画面の操作(ボタン押下など)から後で await/catch されるが、
// ログイン失敗はページ読み込み直後に起こり得るため、ここで一度 catch しておき
// ブラウザの "Uncaught (in promise)" 警告が出ないようにする。
// （db.js 側の await はこの catch とは別に、それぞれ独立してエラーを検知できる）
authReady.catch(() => {});

export function getCurrentUser() {
  return auth.currentUser;
}
