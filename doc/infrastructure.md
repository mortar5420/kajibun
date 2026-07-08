## 目的
- kajibun の本番運用に使うインフラ構成を定義する
- 低コストで運用しつつ、PWA と Web Push 通知に対応する
- 特定ベンダ依存は局所化し、将来の移行コストを抑える

## 採用方針
- フロントエンド、API、定期実行は当面 Cloudflare Workers 上で動かす
- 永続化は当面 Cloudflare D1 を使う
- 認証は Cloudflare Access ではなく、アプリ内の Google OpenID Connect で実装する
- 通知は PWA の Web Push を使う
- デプロイと環境設定は GitHub Actions、Wrangler、Terraform を組み合わせて管理する
- アプリ本体は `kajibun-api` に集約し、Cloudflare 固有実装は adapter 層に閉じ込める

## 設計原則
- アプリケーション層は Cloudflare 固有 API に直接依存しない
- DB、スケジューラ、シークレット、HTTP 実行基盤は interface 越しに扱う
- Cloudflare 固有設定は `infra/` と runtime adapter に閉じ込める
- 将来 AWS Lambda などへ移行しても、置き換え対象が局所的になる構成にする

## 構成概要
### 使用サービス
- Cloudflare Workers
  - フロントエンド配信
  - `kajibun-api` の実行基盤
  - Google OIDC コールバック処理
  - Web Push 送信 API
  - 定期通知ジョブ実行
- Cloudflare D1
  - 永続化 adapter の実体
- GitHub Actions
  - CI/CD
- Terraform
  - Cloudflare 側のインフラ設定管理
- Google Identity
  - ログイン用 IdP

### 想定アーキテクチャ
1. ユーザが `kajibun` の URL にアクセスする
2. フロントエンドは Cloudflare Workers から配信される
3. API リクエストは `kajibun-api` が受ける
4. 未ログイン時は Google OIDC ログインへ誘導する
5. ログイン後はアプリ独自のセッションクッキーで認証状態を維持する
6. 家事、担当、履歴、通知購読情報は repository 経由で永続化する
7. 家事完了時は API が `TaskCompleted` Domain Event を発行する
8. Event handler が通知ジョブを作り、相手ユーザ向け Web Push を送る
9. 締切通知は scheduler adapter が締切対象を検出し、`TaskDueToday` Domain Event 経由で通知ジョブを作る

## 採用理由
### Cloudflare Workers
- 小規模アプリでは十分な無料枠と低コスト運用が見込める
- フロントエンド配信と API を同一基盤に載せられる
- Cron Trigger で締切通知ジョブを実装できる
- 常駐サーバの運用が不要

### Cloudflare D1
- 小規模な永続化要件に対して十分
- SQL で扱えるため設計しやすい
- Workers と同一基盤で扱えるため構成が単純

### アプリ内 Google OIDC
- Cloudflare Access より Cloudflare 固有依存が小さい
- 将来他基盤へ移行しやすい
- ユーザ概念をアプリで素直に管理できる
- PWA、Service Worker、Push Subscription と整合を取りやすい

## 移行容易性の方針
### 置き換え対象
- runtime
  - Cloudflare Workers
  - 将来候補: AWS Lambda, Lambda Function URL, API Gateway, ECS など
- database
  - Cloudflare D1
  - 将来候補: SQLite, Turso, Neon, PostgreSQL
- scheduler
  - Cloudflare Cron Trigger
  - 将来候補: EventBridge Scheduler, GitHub Actions, 外部 cron

### 置き換え時に触る場所
- `apps/kajibun-api/src/adapters/runtime/*`
- `apps/kajibun-api/src/adapters/persistence/*`
- `apps/kajibun-api/src/adapters/scheduler/*`
- `infra/*`

### 置き換え時に極力触らない場所
- ドメインモデル
- ユースケース
- API 入出力の基本契約
- 認証の業務ルール
- 通知の業務ルール

## 非採用方針
### Cloudflare Access を採用しない理由
- Cloudflare 依存が強くなる
- 認証が Cloudflare の前段に閉じるため、アプリ内のユーザ設計との整合が弱くなる
- PWA と Service Worker 周辺の制御をアプリ内で完結させにくい

### VPN 前提を外す理由
- Cloudflare Workers / D1 の利点を活かしにくい
- scale-to-zero に近い構成と相性が悪い
- 2人利用であれば、公開 URL を Google OIDC と許可ユーザ制御で守る方が運用が簡単

## 責務分担
### フロントエンド
- React + Vite + TypeScript
- PWA 対応
- 家事一覧、担当変更、完了操作、通知許可 UI

### API
- セッション確認
- 家事 CRUD
- 担当変更
- 完了記録
- 通知購読登録
- Domain Event 発行
- Domain Event handler による通知送信キュー投入
- runtime 非依存のアプリケーション本体として実装する

### バッチ / 定期実行
- 当日締切家事の抽出
- 完了済み家事の除外
- 対象担当者への通知送信
- 重複通知防止のための送信済み記録更新
- scheduler adapter から起動する

## 認証・認可
### 認証方式
- Google OpenID Connect を使う
- 認証はアプリ内で実装する
- ログイン後は署名付きセッションクッキーを発行する

### 許可ユーザ制御
- 利用者は2人のみ
- Google アカウントのメールアドレスで許可対象を制御する
- 内部的には Google の `sub` を識別子として保持する
- メールアドレスは表示名や許可確認用途で使う

### セッション
- Cookie は `HttpOnly`, `Secure`, `SameSite=Lax` を前提とする
- セッション期限は短めに設定し、必要に応じて更新する

## データ永続化
### 永続化する主なデータ
- users
- tasks
- task_events
- push_subscriptions
- notification_jobs

### テーブルの役割
- users
  - 利用者情報
  - Google `sub`
  - メールアドレス
  - 表示名
- tasks
  - 家事本体
  - 現在の担当者
  - 状態
  - 締切日
- task_events
  - 完了、担当変更などの履歴
- push_subscriptions
  - 端末ごとの Web Push 購読情報
- notification_jobs
  - 送信予定通知
  - 送信済み通知
  - 重複防止用状態

## 通知
### 通知方式
- PWA の Web Push を採用する
- iOS ではホーム画面に追加した Web アプリとして利用する

### 通知契機
- 家事完了時
  - 完了した本人ではなく、もう片方に通知する
- 締切日
  - 当該家事の担当者に通知する

### 通知実装
- ログイン済みユーザに対して Push Subscription を登録する
- 送信先はユーザと端末単位で管理する
- 完了通知は `TaskCompleted` handler が `notification_jobs` として作成する
- 締切通知は scheduler adapter が `TaskDueToday` を発行し、handler が `notification_jobs` として作成する
- Web Push 送信処理は `notification_jobs` を読み取り、送信済み状態を更新する

### 重複防止
- 同一イベントに対する通知キーを持つ
- 送信済み状態を保存する
- 完了済み家事には締切通知を送らない

## CI/CD
### 基本方針
- GitHub をソース管理の基準にする
- CI は GitHub Actions で実行する
- CD は Wrangler で Cloudflare へデプロイする
- ただし deploy 手順は `runtime adapter` の差し替えで変更可能な構成にする

### 想定パイプライン
#### Pull Request
- lint
- typecheck
- test
- build

#### main マージ後
- Workers アプリをデプロイする
- 必要に応じて DB migration を適用する

### 秘匿情報
- Cloudflare API Token
- Cloudflare Account ID
- Google OIDC Client ID
- Google OIDC Client Secret
- セッション署名用シークレット
- Web Push VAPID 鍵

## IaC
### Terraform で管理するもの
- Cloudflare zone に関する設定
- DNS
- カスタムドメイン
- Workers 関連の周辺設定
- 環境差分があるインフラ設定

### Wrangler で管理するもの
- Cloudflare runtime のアプリ設定
- D1 binding
- Cron Trigger
- 環境ごとの Worker 設定

### SQL migration で管理するもの
- DB のスキーマ
- 初期データ
- 変更履歴

### 管理方針
- Terraform だけで全てを完結させようとしない
- `Terraform + Wrangler + SQL migration` の3層で管理する
- アプリコードに近い設定はできるだけリポジトリ内で管理する
- Cloudflare 固有設定は `infra/` と adapter 設定へ寄せる

## ディレクトリ構成案
- `apps/kajibun-ui`
  - React + Vite のフロントエンド
- `apps/kajibun-api`
  - API / 認証 / 通知処理の本体
  - runtime 非依存のアプリケーション層
  - Cloudflare 向け adapter を含む
  - DB migration
  - Domain Event と event handler
- `infra/terraform`
  - Cloudflare の Terraform 定義
- `doc`
  - 要件
  - インフラ構成

## 環境
### development
- ローカル開発環境
- モックまたはローカル DB adapter で開発する

### production
- 当面は Cloudflare Workers 本番環境
- 当面は Cloudflare D1 本番 DB
- カスタムドメイン配信

## 今後の検討事項
- Cloudflare Pages を使わず Workers 単体で統一する最終判断
- D1 を継続採用するか、将来 Turso / Neon へ移す余地の整理
- セッション実装方式
  - 自前署名 Cookie
  - セッションテーブル併用
- Push 通知失敗時の再送ポリシー
- staging 環境を作るかどうか
- adapter 境界をどの粒度で切るか

## 注意
- 採用したインフラ方針は「公開 URL を Google OIDC で保護する」方式である
- 認証、通知、データ永続化はこの前提で実装する
