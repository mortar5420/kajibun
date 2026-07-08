## 目的
- `kajibun` を Cloudflare Workers + D1 で動かすための事前設定手順をまとめる
- MVP では独自ドメインを買わず、無料の `workers.dev` URL で本番公開する
- `wrangler` がローカル環境にまだ入っていない状態から始められるようにする
- この手順は当面の実行基盤セットアップであり、アプリ設計自体は Cloudflare 固有に寄せない

## 前提
- Cloudflare アカウントを持っている
- GitHub リポジトリを作成済みである
- ローカルで `node` が使える
- 可能ならローカルで `bun` も使える
- 独自ドメインは使わない
- 本番 URL は `workers.dev` を使う

## この手順で作るもの
- Cloudflare Workers の利用設定
- `workers.dev` の本番 URL
- ローカル開発用 `wrangler` 認証
- D1 database
- Workers secrets の投入方針
- GitHub Actions 用 API Token

## 1. Cloudflare Workers を使える状態にする
### 作業
1. Cloudflare にログインする
2. Cloudflare dashboard で `Workers & Pages` を開く
3. 初回利用に必要な有効化を済ませる
4. Account ID を控える

### Account ID の確認場所
Cloudflare dashboard の右サイドバー、または `Workers & Pages` 周辺のアカウント情報から確認する。

### 使う情報
- `CLOUDFLARE_ACCOUNT_ID`

### 確認項目
- `Workers & Pages` を開ける
- Account ID を控えている

## 2. `workers.dev` サブドメインを確認する
Cloudflare Workers では、独自ドメインを使わなくても `workers.dev` の URL で Worker を公開できる。

URL の形:

```txt
https://<worker-name>.<account-subdomain>.workers.dev
```

例:

```txt
https://kajibun.<account-subdomain>.workers.dev
```

### dashboard で確認する場合
1. `Workers & Pages` を開く
2. `Create application` から Worker を作る、または既存 Worker を開く
3. Worker 詳細の `Settings` を開く
4. `Domains & Routes` を開く
5. `workers.dev` の URL を確認する

### まだ Worker がない場合
先に Worker を作らないと URL が表示されないことがある。
その場合は、後続の `wrangler deploy` 後に出力される URL を本番 URL として控える。

### 推奨 Worker 名

```txt
kajibun
```

Worker 名は `workers.dev` URL の一部になる。
英数字とハイフンのみ、63文字以下、先頭末尾ハイフン不可にする。

### 本番 URL の例

```txt
https://kajibun.<account-subdomain>.workers.dev
```

## 3. Wrangler をインストールせずに実行できるか確認する
`wrangler` は Cloudflare Workers / D1 を操作するための公式 CLI である。

グローバルインストールしなくても、まずは `npx` で実行できる。

```bash
npx wrangler@latest --version
```

### 確認項目
- `wrangler` の version が表示される

### 失敗した場合
- `node` が入っているか確認する
- ネットワークに接続されているか確認する
- npm registry へアクセスできる環境か確認する

## 4. Wrangler で Cloudflare にログインする
初回はブラウザログインが必要になる。

```bash
npx wrangler@latest login
```

ブラウザが開いたら、対象の Cloudflare アカウントで認可する。

ログイン確認:

```bash
npx wrangler@latest whoami
```

### 確認項目
- 想定している Cloudflare アカウント名が表示される
- 想定しているメールアドレスが表示される

## 5. Worker 名と `workers.dev` 公開方針を決める
MVP では独自ドメインを使わないため、`wrangler` 設定では `workers_dev = true` にする。

`wrangler.toml` のイメージ:

```toml
name = "kajibun"
main = "src/index.ts"
compatibility_date = "2026-07-07"
workers_dev = true
```

### 注意
- `routes` はまだ書かない
- `custom_domain` はまだ書かない
- 独自ドメインへ移行するまでは `workers.dev` を本番 URL とする

## 6. D1 データベースを作成する
Cloudflare D1 は `wrangler d1 create` で作成する。

### 推奨命名
- 本番: `kajibun-prod`
- 開発: `kajibun-dev`

### 本番用 D1 を作成する

```bash
npx wrangler@latest d1 create kajibun-prod
```

出力される `database_id` を控える。

### 開発用 D1 を作成する
必要なら開発用も作る。

```bash
npx wrangler@latest d1 create kajibun-dev
```

### 推奨 binding 名

```txt
DB
```

### `wrangler.toml` の D1 binding 例

```toml
[[d1_databases]]
binding = "DB"
database_name = "kajibun-prod"
database_id = "<D1_DATABASE_ID_PROD>"
```

### 管理しておく値
- `D1_DATABASE_ID_PROD`
- `D1_DATABASE_ID_DEV`

## 7. 本番 URL を固定する
Worker を deploy すると、`workers.dev` の URL が出力される。

```bash
cd apps/kajibun-api
npm run deploy:prod
```

想定 URL:

```txt
https://kajibun.<account-subdomain>.workers.dev
```

この URL を本番 URL として使う。

### 固定する値

```txt
Production URL:
Worker Name: kajibun
Workers.dev Subdomain:
```

### Google OAuth redirect URI
Google OIDC 側には、後で次の redirect URI を登録する。

```txt
https://kajibun.<account-subdomain>.workers.dev/api/auth/callback
```

### 開発環境へ deploy する場合

```bash
cd apps/kajibun-api
npm run deploy:dev
```

### deploy 前の dry-run

```bash
cd apps/kajibun-api
npm run deploy:dry-run
```

`deploy:dev` / `deploy:prod` は内部で一度 `wrangler deploy --dry-run` を実行してから公開する。
dry-run を省略したい場合だけ、次のように明示する。

```bash
npm run deploy -- --env dev --skip-preflight
```

### UI の deploy
UI は Pages を使わず、Workers Static Assets として API Worker と同時に deploy する。
`apps/kajibun-api` の deploy script が `apps/kajibun-ui` を build し、`dist` を Worker assets として upload する。

本番:

```bash
cd apps/kajibun-api
npm run deploy:prod
```

開発:

```bash
cd apps/kajibun-api
npm run deploy:dev
```

deploy せず build と Worker dry-run だけ確認:

```bash
cd apps/kajibun-api
npm run deploy:dry-run
```

想定 URL:

```txt
Production UI: https://kajibun.hamric.workers.dev/
Production API: https://kajibun.hamric.workers.dev/api/*
Development UI: https://kajibun-dev.hamric.workers.dev/
Development API: https://kajibun-dev.hamric.workers.dev/api/*
```

UI build 時の API URL は deploy script が環境ごとに設定する。

- Production UI -> `/api`
- Development UI -> `/api`

## 8. Secrets の管理方針を決める
Cloudflare Workers の本番 secret は `wrangler secret put <KEY>` で登録する。

### 本番で必要な secret
- `GOOGLE_OIDC_CLIENT_ID`
- `GOOGLE_OIDC_CLIENT_SECRET`
- `SESSION_SECRET`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

### 登録例

```bash
npx wrangler@latest secret put SESSION_SECRET
```

実行後、値の入力を求められる。

### 推奨方針
- ローカル開発: `.dev.vars` またはローカル専用環境変数
- 本番: Cloudflare Workers secrets
- CI/CD: GitHub Secrets で保持し、deploy 時に利用する

### `SESSION_SECRET` の要件
- ランダムで十分長い値を使う
- 環境ごとに別値を使う

例:

```bash
openssl rand -base64 32
```

## 9. GitHub Actions 用 API Token を作成する
### 用途
- GitHub Actions から `wrangler deploy` を実行するため

### 作業
1. Cloudflare dashboard で `My Profile` を開く
2. `API Tokens` を開く
3. `Create Token` を選ぶ
4. Workers デプロイに必要な権限を持つ token を作る
5. GitHub repository secrets に登録する

### GitHub に入れる値
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### 補足
最初は手元の `wrangler login` で deploy できれば十分。
GitHub Actions から deploy する段階で API Token を作ってもよい。

## 10. GitHub Secrets を登録する
### 必須
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `GOOGLE_OIDC_CLIENT_ID`
- `GOOGLE_OIDC_CLIENT_SECRET`
- `SESSION_SECRET`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

### 後で追加の可能性があるもの
- `D1_DATABASE_ID_PROD`
- `D1_DATABASE_ID_DEV`

## 11. 完了チェック
- Cloudflare アカウントにログインできる
- `Workers & Pages` を開ける
- Account ID を控えている
- `npx wrangler@latest --version` が動く
- `npx wrangler@latest login` 済み
- `npx wrangler@latest whoami` で対象アカウントを確認済み
- Worker 名を `kajibun` に決めた
- `workers.dev` の本番 URL を控えている
- D1 を作成済み
- D1 database ID を控えている
- Google OAuth redirect URI の候補を控えている
- Workers secrets の登録方針が決まっている
- GitHub Actions 用 API Token の作成タイミングが決まっている

## 実装前に確定しておく値
```txt
Cloudflare Account ID: 70a3b9a490683bb568451a7b9ffff8dc
Worker Name: kajibun
Workers.dev Subdomain: hamric
Production URL: https://kajibun.hamric.workers.dev
Development URL: https://kajibun-dev.hamric.workers.dev
Google OAuth Redirect URI: https://kajibun.hamric.workers.dev/api/auth/callback
D1 Binding Name: DB
D1 Production Database ID: e53a8ed9-5488-47e8-8fef-db6a9060a7ad
D1 Development Database ID: 77a6f173-75db-482e-ab93-f13242ef2baa
```

## 現在の作成済みリソース
- Production Worker: `kajibun`
- Production URL: `https://kajibun.hamric.workers.dev`
- Production API: `https://kajibun.hamric.workers.dev/api`
- Development Worker: `kajibun-dev`
- Development URL: `https://kajibun-dev.hamric.workers.dev`
- Development API: `https://kajibun-dev.hamric.workers.dev/api`
- Production D1: `kajibun-prod`
- Development D1: `kajibun-dev`

疎通確認:

```bash
curl https://kajibun.hamric.workers.dev/api/health
curl https://kajibun-dev.hamric.workers.dev/api/health
```

## 将来独自ドメインへ移行する場合
MVP 後に独自ドメインを使いたくなったら、次を追加で行う。

1. ドメインを取得する
2. Cloudflare に zone を追加する
3. ネームサーバを Cloudflare 指定値へ変更する
4. Worker に Custom Domain を追加する
5. Google OAuth redirect URI を新ドメインへ追加する
6. アプリの本番 URL 設定を新ドメインへ変更する

独自ドメインへ移行するまでは、この手順は不要。

## 参考
- Workers getting started: https://developers.cloudflare.com/workers/get-started/guide/
- workers.dev: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- D1 getting started: https://developers.cloudflare.com/d1/get-started/
- Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Custom Domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
