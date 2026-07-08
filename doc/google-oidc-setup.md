## 目的
- `kajibun` の Google ログインを実装するための事前設定手順をまとめる
- `kajibun-api` から Google OpenID Connect を使える状態にする

## 前提
- Google アカウントを持っている
- Cloudflare 側で本番 URL が決まっている
- Cloudflare 側で開発 URL が決まっている
- ローカル開発用 URL は `http://localhost:8787` とする

## この手順で作るもの
- Google Cloud Project
- OAuth consent screen
- Web application 用 OAuth client
- 本番/開発/ローカルの Authorized redirect URIs
- 許可ユーザの確定

## 1. Google Cloud Project を作成する
1. Google Cloud Console を開く
2. `kajibun` 用 Project を新規作成する
3. Project 名を固定する

### 推奨名
- `kajibun`

## 2. OAuth consent screen を設定する
1. Google Auth Platform または API とサービスの認証設定画面を開く
2. アプリ名を設定する
3. サポート連絡先メールを設定する
4. `Audience` で user type を `External` にする
5. 公開ステータスを `Testing` のままにする
6. `Test users` に利用者2人の Google アカウントを追加する

### 推奨アプリ名
- `kajibun`

### メモ
- 利用者が2人だけでも consent screen の設定は必要
- `Publish app` は押さない
- `Testing` でも OIDC ログイン用途ではテストユーザ制限だけに頼らず、アプリ側で許可メールアドレスを検証する

## 3. OAuth Client を作成する
Google 公式では、Clients 画面で `Create Client` を押し、`Web application` を選び、Authorized redirect URIs を登録します。  
Source: https://developers.google.com/identity/protocols/oauth2/web-server

### 作業
1. `Clients` 画面へ移動する
2. `Create Client` を選ぶ
3. Application type で `Web application` を選ぶ
4. Client 名を設定する
5. Authorized redirect URIs を登録する
6. 作成後に Client ID と Client Secret を控える

### 推奨 Client 名
- 本番: `kajibun-production`
- 開発: `kajibun-development`

### OAuth Client を分ける理由
- 本番と開発で Client Secret を分けられる
- 開発設定の変更で本番ログインを壊しにくい
- 漏洩時に片方だけローテーションできる

## 4. Redirect URI を登録する
Google 公式では、`redirect_uri` は OAuth Client に登録した Authorized redirect URI と完全一致している必要があり、一致しないと `redirect_uri_mismatch` になります。`localhost` を除き HTTPS が必要です。  
Source: https://developers.google.com/identity/protocols/oauth2/web-server

### 本番 OAuth Client
承認済みの JavaScript 生成元:

```txt
https://kajibun.hamric.workers.dev
```

承認済みのリダイレクト URI:

```txt
https://kajibun.hamric.workers.dev/api/auth/callback
```

### 開発 OAuth Client
承認済みの JavaScript 生成元:

```txt
https://kajibun-dev.hamric.workers.dev
http://localhost:8787
```

承認済みのリダイレクト URI:

```txt
https://kajibun-dev.hamric.workers.dev/api/auth/callback
http://localhost:8787/api/auth/callback
```

### 注意
- パス、スキーム、末尾のスラッシュ違いでも不一致になる
- 本番は HTTPS 必須
- ローカルの `localhost` は HTTP 利用可

## 5. 許可ユーザを確定する
### 前提
- 利用者は2人だけ

### 作業
1. 利用者2人の Google アカウントメールを確定する
2. アプリ側の allowlist に使う値として整理する
3. ただし内部識別子はメールアドレスではなく Google `sub` を使う設計にする

Google 公式では、`email` を一意識別子として使わず、`sub` を使うべきと案内しています。  
Source: https://developers.google.com/identity/openid-connect/openid-connect

### 管理しておく値
- 許可メールアドレス 1
- 許可メールアドレス 2

## 6. 実装時に検証する OIDC 項目を確認する
### 最低限検証するもの
- `state`
- `nonce`
- `aud`
- `exp`
- `iss`

### ID Token で使う主な claim
- `sub`
- `email`
- `email_verified`

### メモ
- callback 実装時にこの検証を省略しない
- フロントではなく Worker 側で検証する
- 実装済みの callback path は `/api/auth/callback`
- 移行互換用に `/auth/callback` と `/auth/google/callback` も受け付けるが、Google 側には `/api/auth/callback` を登録する

## 7. ローカルと本番の値を固定する
### 決めるべき値
- 本番 URL
- ローカル URL
- ログイン開始 URL
- callback URL

### 例
- 本番 URL: `https://kajibun.hamric.workers.dev`
- 開発 URL: `https://kajibun-dev.hamric.workers.dev`
- ローカル URL: `http://localhost:8787`
- ログイン開始 URL: `/api/auth/login`
- callback URL: `/api/auth/callback`

## 8. シークレットの保存先を決める
### 保存対象
- `GOOGLE_OIDC_CLIENT_ID`
- `GOOGLE_OIDC_CLIENT_SECRET`
- `SESSION_SECRET`
- `ALLOWED_GOOGLE_EMAILS`

### 推奨保存先
- ローカル開発: ローカル専用環境変数
- 本番: Cloudflare Workers secrets
- CI/CD: GitHub Secrets

### 本番 Worker secrets

入力ファイルから一括投入する場合:

```bash
cd apps/kajibun-api
cp .secrets.example.env .secrets.production.env
$EDITOR .secrets.production.env
node scripts/put-secrets.mjs --file .secrets.production.env
```

個別に投入する場合:

```bash
npx wrangler@latest secret put GOOGLE_OIDC_CLIENT_ID
npx wrangler@latest secret put GOOGLE_OIDC_CLIENT_SECRET
npx wrangler@latest secret put SESSION_SECRET
npx wrangler@latest secret put ALLOWED_GOOGLE_EMAILS
```

### 開発 Worker secrets

入力ファイルから一括投入する場合:

```bash
cd apps/kajibun-api
cp .secrets.example.env .secrets.development.env
$EDITOR .secrets.development.env
node scripts/put-secrets.mjs --file .secrets.development.env --env dev
```

個別に投入する場合:

```bash
npx wrangler@latest secret put GOOGLE_OIDC_CLIENT_ID --env dev
npx wrangler@latest secret put GOOGLE_OIDC_CLIENT_SECRET --env dev
npx wrangler@latest secret put SESSION_SECRET --env dev
npx wrangler@latest secret put ALLOWED_GOOGLE_EMAILS --env dev
```

### 一括投入スクリプトの確認

実際に投入せず、読み取り対象だけ確認する場合:

```bash
node scripts/put-secrets.mjs --file .secrets.production.env --dry-run
node scripts/put-secrets.mjs --file .secrets.development.env --env dev --dry-run
```

`.secrets*.env` は git 管理対象外にする。

### `ALLOWED_GOOGLE_EMAILS` の形式

```txt
user1@example.com,user2@example.com
```

### `SESSION_SECRET` の生成例

```bash
openssl rand -base64 32
```

## 9. 完了チェック
- Google Cloud Project を作成済み
- OAuth consent screen を設定済み
- Web application 用 OAuth Client を作成済み
- 本番 redirect URI を登録済み
- ローカル redirect URI を登録済み
- Client ID / Client Secret を控えている
- 許可ユーザ 2 人の Google アカウントを確定している

## 実装前に確定しておく値
```txt
Google Cloud Project:
Production OAuth Client Name: kajibun-production
Production OAuth Client ID:
Production Redirect URI: https://kajibun.hamric.workers.dev/api/auth/callback
Development OAuth Client Name: kajibun-development
Development OAuth Client ID:
Development Redirect URI: https://kajibun-dev.hamric.workers.dev/api/auth/callback
Local Redirect URI: http://localhost:8787/api/auth/callback
Allowed User Email 1:
Allowed User Email 2:
```

## 参考
- OpenID Connect: https://developers.google.com/identity/openid-connect/openid-connect
- OAuth 2.0 for Web Server Applications: https://developers.google.com/identity/protocols/oauth2/web-server
