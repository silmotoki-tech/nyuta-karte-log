// Firebase Appの初期化を1箇所にまとめるモジュール。
// db.js / auth.js の両方から同じ app インスタンスを参照させ、
// initializeApp() の重複呼び出し（エラーの原因になる）を防ぐ。

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
