# にゅうたカルテ記録

にゅうた動物病院向けの「カルテ記録蓄積アプリ」です。素のHTML/CSS/JavaScript（フレームワークなし）で作成し、GitHub Pagesでのホスティングと、ホーム画面への追加（PWA）に対応しています。データはFirebase Realtime Databaseに保存されます。

## 機能（今回実装した範囲）

0. アプリ起動時のパスコード認証（4桁、セッション内は再入力不要）
1. カルテ番号（5桁固定・数字のみ）の入力
2. カルテ番号に紐づく動物名（カナ）の登録・確認表示（番号の入力ミス防止）
3. 記入者をボタンで選択（獣医師 / 看護師）
4. フリーテキストの入力・保存
5. 保存済みの記録を日付の時系列（古い→新しい）で一覧表示
6. 各記録の編集・削除
7. Firebase Anonymous Authenticationによる自動ログイン（DB読み書きはログイン完了後に実行）

## ディレクトリ構成

```
.
├── index.html              # 画面本体（パスコード → カルテ番号入力 → 動物名確認 → 記入・一覧）
├── manifest.json           # PWA用マニフェスト
├── service-worker.js       # アプリの見た目をキャッシュするService Worker
├── css/
│   └── style.css           # にゅうたポータルのブランドカラーに合わせたデザイン
├── js/
│   ├── firebase-config.js  # Firebaseの接続設定（★要編集）
│   ├── firebase-app.js      # Firebase Appの初期化（db.js / auth.js で共有）
│   ├── auth.js               # 匿名ログイン（signInAnonymously）とログイン完了待ち
│   ├── db.js                 # Realtime Databaseへの読み書き処理（ログイン完了を待って実行）
│   └── app.js                 # 画面遷移・パスコード認証・入力・保存・一覧表示のロジック
├── icons/                    # PWA用アイコン（緑のクリップボード+肉球モチーフ）
└── scripts/
    └── generate_icons.py    # アイコンを再生成する場合に使うスクリプト（任意）
```

## セットアップ手順

### 1. Firebaseの設定を入力する

`js/firebase-config.js` を開き、Firebaseコンソール（プロジェクトの設定 > マイアプリ）に表示される `firebaseConfig` の値に書き換えてください。

```js
export const firebaseConfig = {
  apiKey: "実際の値",
  authDomain: "実際の値",
  databaseURL: "実際の値", // Realtime Databaseを使うため必須
  projectId: "実際の値",
  storageBucket: "実際の値",
  messagingSenderId: "実際の値",
  appId: "実際の値",
};
```

### 2. Anonymous Authenticationを有効にする

Firebaseコンソールの「Authentication」→「Sign-in method」で **「匿名」(Anonymous)** を有効にしてください。これを有効にしないと、アプリ起動時の自動ログイン（`signInAnonymously()`）が失敗し、DBの読み書きができません。

### 3. Realtime Databaseのルールを設定する

Anonymous Authenticationを有効にしたら、Firebaseコンソールの「Realtime Database」→「ルール」で、**ログイン済み（匿名ログイン含む）のユーザーのみ**読み書きできるように設定してください。

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

これにより、アプリ経由（＝匿名ログイン済み）のアクセスのみを許可し、無関係な第三者が直接データを読み書きすることを防げます。

さらに強固にする場合は、Firebase Authenticationのメール/パスワード認証などに切り替えて、`.read`/`.write` を特定ユーザーのみに絞ることも可能です。

### アプリ内パスコードについて

カルテ番号入力画面に進む前に、4桁のパスコード（`js/app.js` 内の `PASSCODE` 定数、初期値 `2211`）の入力を求めます。正しく入力すると `sessionStorage` にフラグが保存され、同じブラウザタブ/セッションを閉じるまでは再入力不要になります（タブを閉じる・ブラウザを再起動すると再度パスコードが必要になります）。

※ このパスコードはあくまで「関係者以外が誤って開かないようにする」程度の簡易的な入り口チェックであり、クライアント側のコードに書かれているため厳密な認証ではありません。本格的なアクセス制御が必要な場合は、Firebase Authenticationのメール/パスワード認証等の導入をご検討ください。

### 4. ローカルで確認する

素のHTML/JS/CSSなので、ローカルサーバーで配信するだけで動作します（`file://` で直接開くと、ESモジュールの読み込みでエラーになる場合があるため、簡易サーバー経由を推奨します）。

```bash
python3 -m http.server 8000
# http://localhost:8000 をブラウザで開く
```

### 5. GitHub Pagesへ公開する

このリポジトリを GitHub にpushし、リポジトリの Settings → Pages で公開ブランチ（例: `main`）とルートディレクトリを指定すれば、そのままGitHub Pagesで公開できます。

### 6. ホーム画面に追加する（PWA）

公開後、スマートフォンのブラウザでアプリを開き、「ホーム画面に追加」を選択するとアイコンからすぐに起動できるようになります。

## データ構造

Realtime Database内は以下の構造で保存されます。

```
karte/
  {カルテ番号}/
    animalName: "タロウ"
    entries/
      {entryId}/
        date: "2026-07-11T09:00:00.000Z"   # 表示用の記入日時（ISO文字列）
        createdAt: 1752210000000            # サーバータイムスタンプ（並び替え用）
        updatedAt: 1752210100000            # 編集した場合のみ付与
        author: "院長"
        text: "記入内容..."
```

## 今後の拡張候補（未実装）

- メール/パスワード等によるスタッフ個別ログイン
- カルテ番号一覧・検索機能
- 記録の日付を過去日付で登録できる機能
- CSV等でのデータ書き出し
