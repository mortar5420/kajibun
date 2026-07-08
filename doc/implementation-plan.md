## 目的
- kajibun の MVP を段階的に実装するための計画を定義する
- すでに完了した Cloudflare / D1 / Google OIDC の初期実装を前提に、次の実装順を明確にする
- まずは「2人だけがログインできる」「家事一覧と担当変更が実データで動く」を優先する

## 現在の到達点
### 完了済み
- `workers.dev` 前提の Cloudflare Workers 本番/開発環境を作成済み
  - Production: `https://kajibun.hamric.workers.dev`
  - Development: `https://kajibun-dev.hamric.workers.dev`
- D1 database を作成済み
  - Production: `kajibun-prod`
  - Development: `kajibun-dev`
- `apps/kajibun-api` の最小 Worker を作成済み
- `wrangler.toml` を作成済み
- Google OIDC の最小認証 API を実装済み
  - `GET /api/auth/login`
  - `GET /api/auth/callback`
  - `POST /api/auth/logout`
  - `GET /api/me`
- `state`, `nonce`, `id_token` 署名、`aud`, `iss`, `exp`, `email_verified` の検証を実装済み
- `ALLOWED_GOOGLE_EMAILS` による許可メール制限を実装済み
- 署名付き HttpOnly Cookie のセッションを実装済み
- `users` migration を作成し、本番/開発 D1 に適用済み
- Cloudflare secrets を入力ファイルから投入するスクリプトを作成済み
- Google OIDC の動作確認済み
- `tasks` / `task_events` migration を作成し、本番/開発 D1 に適用済み
- 初期家事 seed を作成し、本番/開発 D1 に適用済み
- 家事 API の最小実装を作成し、本番/開発 Workers に deploy 済み
  - `GET /api/tasks`
  - `PATCH /api/tasks/:id/assignee`
  - `PATCH /api/tasks/:id/complete`
- 担当変更・完了・再オープンを `task_events` に記録する最小 Domain Event 処理を実装済み
- 未ログイン時の家事 API 401 応答を疎通確認済み
- UI のログイン状態取得と家事一覧/担当変更/完了操作を API に接続済み
- UI の家事管理画面で追加・編集・削除を実装済み
- タスク削除は `deleted_at` による soft delete とし、通常一覧から除外する
- 完了済みタスクを未着手に戻すと担当者を解除する
- かじに `interval_days` を追加し、完了時に JST の完了日 + 日数を次回締切日に自動設定する

### 未完了
- 認証済み状態での家事 API 疎通確認
- `/api/users` など担当者候補取得 API
- 家事 API のテスト
- Domain Event handler の通知向け整理
- UI の担当者候補選択
- PWA / Web Push / 締切通知
- CI/CD と migration 運用

## 実装方針
- 当面は `apps/kajibun-api` と `apps/kajibun-ui` の2アプリ構成で進める
- deploy は Workers + Static Assets で単一 Worker にまとめ、UI は `/`、API は `/api/*` で提供する
- `packages/` は MVP 中は作らない
- 独自ドメインは使わず、`workers.dev` を本番 URL とする
- Google OAuth Client は本番/開発で分ける
- Google Auth Platform は `Testing` のまま進める
- 利用者制限は Google 側の test users に加えて、API 側の `ALLOWED_GOOGLE_EMAILS` でも必ず行う
- DB migration は当面 `apps/kajibun-api/src/db/migrations` に置く
- Domain Event は採用するが、MVP では同一プロセス内の handler 呼び出しに留める
- スコア機能、いいね、履歴一覧の強化は MVP 後に回す

## MVP ゴール
- Google ログインした許可ユーザ2人だけが使える
- 家事一覧が本番データで表示される
- 現在の担当者が分かる
- 担当者を変更できる
- 家事を完了できる
- 家事を追加・編集・削除できる
- かじごとに次回締切までの日数を設定できる
- 完了時に次回締切日が自動更新される
- 担当変更と完了の履歴が保存される
- iPhone のホーム画面から使える
- 完了通知と締切通知が送れる

## 推奨実装順
### Phase 0: 基盤セットアップ
#### 状態
完了。

#### 完了済み
- Cloudflare Workers 本番/開発環境
- D1 本番/開発 database
- `workers.dev` 本番/開発 URL
- Wrangler 認証
- Google OAuth Client
- Cloudflare secrets 投入手順

#### 今後の追加作業
- GitHub Actions 用 API Token は CI/CD 着手時に作る
- 独自ドメインは MVP 後に必要なら検討する

### Phase 1: API 基盤と認証
#### 状態
最小実装は完了。各 API handler から認証済みユーザを参照できる状態。今後、ファイル分割とテストを足す。

#### 完了済み
- Worker entrypoint
- D1 binding
- Google OIDC login / callback
- logout
- `/me`
- `users` table
- secret 一括投入スクリプト
- 認証済みユーザ取得 helper
- 家事 API の未ログイン 401 応答

#### 次にやること
- `src/index.ts` に集中している認証処理を、必要に応じて `auth/` へ分割する
- セッション Cookie の期限、SameSite、Secure の方針を維持する
- 認証まわりの最低限のテスト方針を決める

#### 完了条件
- 未ログイン API は 401 になる
- 許可メール以外はログインできない
- ログイン済みユーザ情報を API 内で取得できる

### Phase 2: 家事データモデルと migration
#### 状態
完了。今後、通知・履歴・繰り返し家事に合わせて拡張する。

#### 目的
モックデータ依存をやめるため、家事管理に必要な最小テーブルを作る。

#### 完了済み
- `tasks` table を作る
- `task_events` table を作る
- 初期 seed を作る
- D1 本番/開発へ migration を適用する
- migration の再実行が安全な形にする

#### 今後の追加作業
- ローカル D1 で migration を実行する手順を固める
- seed の更新方針を決める

#### 最小テーブル
- `tasks`
  - `id`
  - `title`
  - `assignee_user_id`
  - `status`
  - `due_date`
  - `interval_days`
  - `created_at`
  - `updated_at`
- `task_events`
  - `id`
  - `task_id`
  - `event_type`
  - `actor_user_id`
  - `payload_json`
  - `created_at`

#### この時点では作らないもの
- スコア関連 table
- いいね table
- 詳細な履歴表示専用 table

#### 完了条件
- `tasks` と `task_events` が本番/開発 D1 に存在する
- 初期家事データを投入できる
- migration の再実行が安全にできる

### Phase 3: 家事 API
#### 状態
最小実装は完了。未ログイン時の 401 は確認済み。認証済み cookie 付きの画面操作確認とテスト追加が残っている。

#### 目的
最優先要件である「今誰が担当かが分かる」「担当を付け替えられる」「完了できる」を API で成立させる。

#### 完了済み
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `PATCH /api/tasks/:id/assignee`
- `PATCH /api/tasks/:id/complete`
- 認証済みユーザだけが操作できるようにする
- 担当者候補を許可ユーザ2人に制限する
- 削除は `deleted_at` による soft delete にする
- 未着手へ戻す時に担当者を解除する
- 完了時に `interval_days` を使って次回締切日を設定する

#### 次にやること
- 認証済み cookie 付きで `GET /api/tasks` / 担当変更 / 完了を確認する
- `GET /api/users` または `/api/me` に同居ユーザ情報を含めるかを決める
- 楽観ロックまたは `updated_at` による簡易競合対策を検討する
- 家事 API の最低限のテストを追加する

#### Domain Event
- 担当変更時に `TaskReassigned` を発行する
- 完了時に `TaskCompleted` を発行する
- 再オープン時に `TaskReopened` を発行する
- 追加時に `TaskCreated`、編集時に `TaskUpdated`、削除時に `TaskDeleted` を発行する
- MVP では同一リクエスト内で `task_events` に保存する

#### 完了条件
- 家事一覧を DB から返せる
- 担当変更が保存される
- 完了状態が保存される
- 担当変更と完了が `task_events` に記録される

### Phase 4: UI と API の接続
#### 状態
最小接続は完了。ログイン状態、家事一覧、担当変更、完了操作を API に接続済み。認証済みブラウザでの実操作確認と担当者候補 UI が残っている。

#### 目的
現在の UI の localStorage / mock 依存を外し、実データで家事一覧を操作できるようにする。

#### 完了済み
- API client を追加する
- `/api/me` を使ってログイン状態を取得する
- 未ログインならログイン導線を出す
- 家事一覧を `GET /api/tasks` に接続する
- 担当変更 UI を `PATCH /api/tasks/:id/assignee` に接続する
- 完了 UI を `PATCH /api/tasks/:id/complete` に接続する
- 自分の担当家事フィルタを実データで動かす
- 家事管理画面で `POST /api/tasks` / `PATCH /api/tasks/:id` / `DELETE /api/tasks/:id` に接続する
- 家事管理画面で日数を設定できるようにする

#### 次にやること
- 認証済みブラウザで一覧/担当変更/完了を確認する
- 認証済みブラウザで追加/編集/削除を確認する
- 認証済みブラウザで日数設定と完了時の締切日自動更新を確認する
- 担当者候補 API と選択 UI を追加する

#### 完了条件
- 本番 URL でログイン後に家事一覧が見える
- 担当変更が画面に即時反映され、リロード後も保持される
- 完了状態が画面に即時反映され、リロード後も保持される

### Phase 5: PWA 対応
#### 目的
iPhone のホーム画面から擬似アプリとして使えるようにする。

#### 作業
- manifest を追加する
- Service Worker を導入する
- アイコン、アプリ名、表示モードを整える
- ホーム画面追加後のログイン Cookie 挙動を確認する
- オフライン時の最低限の挙動を決める

#### 完了条件
- iPhone でホーム画面追加できる
- 追加後にアプリとして起動できる
- ログイン状態が実用上維持される

### Phase 6: Web Push 通知
#### 目的
家事完了通知を実装する。

#### 作業
- VAPID 鍵を用意する
- `push_subscriptions` table を作る
- `notification_jobs` table を作る
- Push Subscription 登録 API を実装する
- 通知許可 UI を実装する
- `TaskCompleted` handler で完了通知用の `notification_jobs` を生成する
- `notification_jobs` を処理して Web Push を送信する処理を実装する
- 送信済み管理を実装する

#### 完了条件
- ログインユーザが通知許可を有効化できる
- 家事完了時にもう片方へ通知が届く
- 完了通知の重複防止キーが `notification_jobs` に保存される

### Phase 7: 締切通知の定期実行
#### 目的
当日締切の家事について担当者へ自動通知する。

#### 作業
- Cloudflare Cron Trigger を設定する
- 当日締切かつ未完了の家事を抽出する
- 締切対象ごとに `TaskDueToday` を発行する
- `TaskDueToday` handler で締切通知用の `notification_jobs` を生成する
- 重複通知防止ロジックを実装する
- ログ確認手段を作る

#### 完了条件
- 締切日に担当者へ通知が届く
- 同一締切で不要な重複通知が起きない

### Phase 8: デプロイと運用
#### 目的
本番環境で安全に継続運用できる状態にする。

#### 作業
- GitHub Actions の CI を作成する
- 本番 deploy workflow を作成する
- DB migration 適用手順を整える
- GitHub Actions 用 Cloudflare API Token を作る
- GitHub Secrets を登録する
- D1 backup / export 手順を確認する
- 障害時の最低限の確認手順を文書化する

#### 完了条件
- PR で lint / typecheck / test が走る
- `main` へのマージで deploy できる
- migration の適用手順が確立している
- 障害時に最低限のログと DB 状態を確認できる

## 直近の優先タスク
1. ブラウザのログイン済み状態で UI から一覧/担当変更/完了を確認する
2. ブラウザのログイン済み状態で UI から追加/編集/削除を確認する
3. 担当者候補 API の形を決める
4. 担当者候補の選択 UI を追加する
5. API の最小テストを追加する
6. UI の loading/error/empty 表示を整える

## 後回しにするもの
- 独自ドメイン
- Terraform
- GitHub Actions deploy
- スコア機能
- いいね
- 履歴一覧画面
- 月次サマリー
- 本格的なイベントバス

## リスク
- iOS の Web Push はホーム画面追加が前提なので、初回導線が弱いと使われにくい
- D1 migration と seed の手順が曖昧だと、開発/本番のデータ差分が追いにくくなる
- API が `src/index.ts` に集中しているため、通知実装前に分割しないと見通しが悪くなりやすい
- 通知失敗時の再送方針を決めないと運用時に追いにくい

## 保留事項
- UI と API を同一 Worker で配信するか、当面別デプロイにするか
- セッションを完全自前 Cookie のままにするか、セッションテーブルを併用するか
- staging を `kajibun-dev` として扱い続けるか
- ローカル開発時に D1 local を使うか、remote dev D1 を使うか
