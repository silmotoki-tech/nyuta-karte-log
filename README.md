# にゅうたカルテ記録

にゅうた動物病院向けの「カルテ記録蓄積アプリ」です。素のHTML/CSS/JavaScript（フレームワークなし）で作成し、GitHub Pagesでのホスティングと、ホーム画面への追加（PWA）に対応しています。データはFirebase Realtime Databaseに保存されます。

**iPad横向き専用**の3カラムレイアウトです（iPhone・縦向きは想定していません）。

```
┌──────┬─────────────────────┬─────────────────┐
│ 左(細) │ 中央(広め)              │ 右(広め)          │
│ 見出し  │ 記入・時系列（生データ）   │ 患者情報タブ（準備中） │
└──────┴─────────────────────┴─────────────────┘
```

## 機能（実装済み）

- **パスコード認証**: 起動時に4桁パスコード（`2211`）。セッション内は再入力不要。
- **左カラム（見出し・目次）**: 各記録の見出しを一覧表示。カテゴリ色分け（オペ/救急/麻酔・入院・紹介・通常）、★重要マーク、★のみ絞り込み。見出しタップで中央の該当記録へスクロールジャンプ。
- **中央カラム（記入・時系列）**: パスコード→カルテ番号→動物名確認→記入者選択→記入…を同じレイアウト内の状態遷移として実施。手動保存直後は AI が検査予定／薬剤／処置／既往歴を提案し、確定または無視までカルテ切替を止める（定型文入力・APIキー未設定時はスキップ）。
  - 記入者は13名を横一列・単一選択。
  - 見出し＋カテゴリ＋★＋記録日（既定は今日、カレンダーで過去日も選択可）＋本文を保存。
  - 時系列は**記録日の降順（新しい→古い）**で表示。左カラムの見出しも同じ順序。過去に遡って入力した記録は記録日の正しい位置に挿入し、記録日と入力日を併記（例: `7/10の記録　（7/17 9:32 入力・記入者：竹内）`）。
  - **定型文ボタン**（ワンタップで見出し・本文へ挿入）。定型文は「定型文の管理」から追加・編集・削除でき、Firebaseにマスタとして保持。
  - 記録は直接編集（上書き）可能。最終編集日時・編集者を記録する。誤入力の削除と★の切り替えも可能。
- **右カラム（タブ切替）**: 既往歴／検査予定／薬剤情報／処置ログ／自由質問。
  - **検査予定（実装済み）**: 検査項目マスタからボタン選択（その他はフリーテキスト）、カレンダー＋日／週／月テンキーの相対指定（双方向連動）、次回予定1件（完了/終了/編集）、定期検査スケジュール（日／週／月＋テンキー入力・内部は日数保存・目安幅±14日・完了時に自動再計算）、実施履歴、期限超過・期限接近のアラート。データは `examPlan/{カルテ番号}`（`schemaVersion` 付き）。
  - **薬剤情報（実装済み）**: 薬剤マスタから選択（手打ち可）、出来事履歴（継続/増量/減量/中止/再開・編集/削除可）、投与頻度（よくあるパターン／○日に○回／週○回／曜日指定／その他）、増減時の量プリセット、カテゴリA/B/C、副作用メモ、処方切れ目安アラート、直近30日の🔵サイン。使用状況は最新出来事から自動導出。データは `medications/{カルテ番号}/{drugId}`（`schemaVersion` 付き）。
  - **既往歴（実装済み）**: 疾患／手術歴／紹介・専門治療歴をテーマ別に一覧。進行中（🟢）と終了（⚪）でグループ表示（進行中が上）。ワンタップで状態切替、タップで詳細（タイトル・種別・初回記載日・最終更新日・追記型メモ）。手動追加に加え、将来のAI提案フローからも同じAPIで登録可能な設計。データは `history/{カルテ番号}/{entryId}`（`schemaVersion` 付き）。
  - **処置ログ（実装済み）**: 注射・点滴など単発の処置を日付＋内容で記録。手動追加／編集／削除。最終編集日時・編集者を記録。データは `procedures/{カルテ番号}/{entryId}`（`schemaVersion` 付き）。
  - **自由質問（実装済み）**: 中央カラムの時系列全文をコンテキストに Anthropic API（Claude Sonnet）へ質問。回答は Firebase に保存し、最新順で一覧。再検索で最新カルテ内容で回答を更新。APIキーは設定画面のQR読取で localStorage に保存（コードには埋め込まない）。データは `freeQA/{カルテ番号}/{questionId}`（`schemaVersion` 付き）。
- **Firebase Anonymous Authentication**による自動ログイン（DB読み書きはログイン完了後に実行）。

## ディレクトリ構成

```
.
├── index.html              # 3カラムレイアウト本体（左:見出し / 中央:記入・時系列 / 右:プレースホルダ）
├── manifest.json           # PWA用マニフェスト
├── service-worker.js       # アプリの見た目をキャッシュするService Worker
├── css/
│   └── style.css           # iPad横向き3カラム・ブランドカラー・カテゴリ色分け
├── js/
│   ├── firebase-config.js  # Firebaseの接続設定（★要編集）
│   ├── firebase-app.js      # Firebase Appの初期化（db.js / auth.js で共有）
│   ├── auth.js               # 匿名ログイン（signInAnonymously）とログイン完了待ち
│   ├── db.js                 # Realtime Databaseへの読み書き（エントリ・定型文・右カラム各タブ）
│   ├── exam-plan-ui.js        # 右カラム「検査予定」タブのUIと操作
│   ├── meds-ui.js             # 右カラム「薬剤情報」タブのUIと操作
│   ├── freq-picker.js         # 投与頻度の指定UI（テンキー・曜日など）
│   ├── history-ui.js          # 右カラム「既往歴」タブのUIと操作
│   ├── procedures-ui.js       # 右カラム「処置ログ」タブのUIと操作
│   ├── api-key.js             # Anthropic APIキーの localStorage 管理
│   ├── anthropic.js           # Anthropic Messages API（ブラウザ直接呼び出し）
│   ├── settings-ui.js         # 設定画面（QRでAPIキー設定）
│   ├── free-qa-ui.js          # 右カラム「自由質問」タブのUIと操作
│   ├── ai-suggest-ui.js       # 保存直後のAI提案・確認フロー
│   └── app.js                 # 状態遷移・記入・時系列・見出し連動・定型文管理のロジック
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

カルテ番号入力画面に進む前に、4桁のパスコード（`js/app.js` 内の `PASSCODE` 定数、初期値 `2211`）の入力を求めます。正しく入力すると `localStorage` に認証フラグと認証日付が保存され、同じ日のうちはアプリを閉じても再入力不要です。日付が変わると自動で無効化され、再入力が必要になります（設定画面の「ログアウト」でも手動解除できます）。記入者は記録追加のたびに都度選択する運用です。

※ このパスコードはあくまで「関係者以外が誤って開かないようにする」程度の簡易的な入り口チェックであり、クライアント側のコードに書かれているため厳密な認証ではありません。本格的なアクセス制御が必要な場合は、Firebase Authenticationのメール/パスワード認証等の導入をご検討ください。

### 4. ローカルで確認する

素のHTML/JS/CSSなので、ローカルサーバーで配信するだけで動作します（`file://` で直接開くと、ESモジュールの読み込みでエラーになる場合があるため、簡易サーバー経由を推奨します）。

```bash
python3 -m http.server 8000
# http://localhost:8000 をブラウザで開く
```

### 5. GitHub Pagesへ公開する

このリポジトリを GitHub にpushし、リポジトリの Settings → Pages で公開ブランチ（例: `main`）とルートディレクトリを指定すれば、そのままGitHub Pagesで公開できます。

HTML/JS/CSS は Service Worker が**ネットワーク優先**で取得します。それでも古い画面のまま進まない場合は、ブラウザのサイトデータ（または Service Worker）を削除して再読み込みしてください。

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
        recordDate: "2026-07-10"            # 記録日（出来事があった日, YYYY-MM-DD）
        enteredAt: 1752210000000            # 入力時刻（サーバータイムスタンプ）
        enteredAtIso: "2026-07-17T00:32:00.000Z"  # 入力時刻ISO（表示・並び替えのフォールバック）
        headline: "初診・混合ワクチン"        # 見出し
        category: "none"                     # "none" | "ope" | "admission" | "referral"
        important: false                     # ★重要フラグ
        author: "竹内"                       # 初回記入者
        body: "本文フリーテキスト..."
        source: "manual"                     # "manual" | "template"（AI解析対象の判定用・次ステップで使用）
        lastEditedAt: 1752213600000          # 最終編集時刻（任意）
        lastEditedAtIso: "2026-07-17T01:00:00.000Z"
        lastEditedBy: "院長"                 # 最終編集者（任意）

templates/                                   # 定型文マスタ（全カルテ共通）
  {templateId}/
    label: "狂犬病ワクチン接種"               # ボタン名
    text: "..."                              # 挿入される本文
    order: 1                                 # 並び順

examItems/                                   # 検査項目マスタ（全カルテ共通）
  {itemId}/
    label: "血液検査"
    order: 1

examPlan/
  {カルテ番号}/
    schemaVersion: 1
    nextPlan:                                # 次回予定（1件）。無いときは null
      item: "血液検査"
      dueDateFrom: "2026-10-03"              # 目安期間の開始
      dueDateTo: "2026-10-31"                # 目安期間の終了（±14日）
      note: "術後フォロー"
      recurringId: "..."                     # 紐づく定期スケジュール（任意）
    recurring/
      {id}/
        item: "血液検査"
        intervalDays: 90                     # 保存の正（日数に統一）
        intervalUnit: "month"                # day | week | month（表示用）
        intervalValue: 3                     # 単位に対する数値（表示用）
        intervalMonths: 3                    # 旧データ互換（月指定時のみ併記）
        lastDone: "2026-07-17"
        windowDays: 14
    history/
      {id}/
        item: "血液検査"
        date: "2026-07-17"
        note: "異常なし"

medications/
  {カルテ番号}/
    {drugId}/
      schemaVersion: 1
      name: "アモキシシリン"
      category: "A"                          # A | B | C
      sideEffectNote: "下痢あり"
      expiryEstimate: "2026-10-17"           # 処方切れ目安（任意）
      events/
        {eventId}/
          date: "2026-07-18"
          type: "decrease"                   # add|increase|decrease|stop|resume
          detail: "食欲低下のため"
          frequencyChange: "3日に1回"         # 表示用ラベル
          frequency:                         # 構造化（任意）
            kind: "every_n_days"             # preset|every_n_days|weekly_count|weekdays|other
            periodDays: 3
            times: 1
            label: "3日に1回"
          amountChange: ""
          changedBy: "院長"
          lastEditedAt: "2026-07-21T03:00:00.000Z"  # 編集時のみ
          lastEditedBy: "院長"

history/                                     # 患者の既往歴（時系列から独立したテーマ別一覧）
  {カルテ番号}/
    {entryId}/
      schemaVersion: 1
      title: "慢性腎臓病"
      type: "disease"                        # disease | surgery | referral
      status: "active"                       # active（進行中）| resolved（終了）
      firstNoted: "2025-03-10"
      lastUpdated: "2026-07-18"
      source: "manual"                       # manual | ai（将来のAI提案用）
      notes/
        {noteId}/
          date: "2026-07-18"
          text: "Cre 2.1。食事療法継続。"
          author: "院長"

freeQA/                                      # 自由質問（AI回答の保存）
  {カルテ番号}/
    {questionId}/
      schemaVersion: 1
      question: "腎臓の経過で注意すべき記載は？"
      answer: "カルテ上では…"
      askedAt: "2026-07-18T09:32:00.000Z"
      askedBy: "院長"

procedures/                                  # 処置ログ（注射・点滴など単発の出来事）
  {カルテ番号}/
    {entryId}/
      schemaVersion: 1
      date: "2026-07-21"
      content: "皮下点滴 100ml"
      confirmedBy: "竹内"
      lastEditedAt: "2026-07-21T03:30:00.000Z"  # 任意
      lastEditedBy: "院長"                       # 任意
      source: "manual"                           # manual | ai（将来のAI提案用）
```

※ 旧スキーマ（`date` / `text`）で保存された記録も読み込み時に自動で吸収して表示します。

### Anthropic APIキーの扱い

- ヘッダー右上の「設定」→「QRコードを読み取ってAPIキーを設定」で、カメラからキー文字列を読み取り、この端末の `localStorage` に保存します（値は画面に表示しません。設定済み／未設定のみ）。
- ブラウザから `https://api.anthropic.com/v1/messages` を直接呼び出します（ヘッダーに `anthropic-dangerous-direct-browser-access: true` を付与）。
- モデルは `claude-sonnet-4-6`。プロンプトでは「カルテに書かれている内容だけをもとに答える／わからないことは断定しない」を明示しています。

## 今回のスコープ外（次ステップで実装予定）

- **AI解析・自動振り分け**: 中央でフリーテキストを保存 → Anthropic APIで解析 → 右カラムへの提案を一括表示し、確認タップで反映する強制フロー。
- **処置ログのAI提案連携**: 手動追加に加え、中央テキストからの提案反映。
- **定型文の例外UI**: ワクチン接種・予防薬の定型文保存時に「次回予定日（→検査予定）」「処方切れ目安（→薬剤情報）」を設定するUI。

## 今後の拡張候補

- メール/パスワード等によるスタッフ個別ログイン
- カルテ番号一覧・検索機能
- CSV等でのデータ書き出し
