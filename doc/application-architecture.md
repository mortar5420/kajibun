## 目的
- kajibun の UI 層と API 層のあるべきアーキテクチャを定義する
- ドメイン駆動性、変更容易性、移植性を確保しつつ、過度な抽象化を避ける
- 現状コードからどこを整理すべきかを明確にする

## 現状整理
### UI 層
現状の UI は単一ページ中心で、表示、状態取得、ローカル永続化、モックデータ参照が近い場所に混在している。

参照:
- [apps/kajibun-ui/src/App.tsx](/Users/kechofsa/github.com/prv/kajibun/apps/kajibun-ui/src/App.tsx:1)
- [apps/kajibun-ui/src/components/TaskList.tsx](/Users/kechofsa/github.com/prv/kajibun/apps/kajibun-ui/src/components/TaskList.tsx:1)

現状の特徴:
- `App.tsx` で `localStorage` 初期化と画面構築を同時に行っている
- `TaskList.tsx` で表示ロジックと `localStorage` 読み出しが混在している
- 型定義はあるが、ドメインモデルと画面表示用モデルが未分離
- モックデータ前提で、ユースケース単位の境界がまだない

### API 層
- `apps/kajibun-api` は存在するが、まだ実装はない
- 認証、ユースケース、永続化、通知、スケジューラの境界は未定義

## 基本方針
- 全体は `Modular Monolith` とする
- 層の分離は `Clean Architecture` と `Ports and Adapters` をベースにする
- ただし、全てを厳密なクラス階層にせず、TypeScript の module 境界で制御する
- ドメインの中心は `Task` とし、小規模な `DDD` を採用する
- UI と API の両方で、フレームワーク依存コードを外側へ寄せる

## 採用するアーキテクチャパターン
### 1. Modular Monolith
単一リポジトリ、単一プロダクトとして保ちつつ、機能ごとにモジュールを分ける。

このプロジェクトでは、まず以下を主要モジュールとする。

- `identity`
- `tasks`
- `notifications`
- `shared`

この形にする理由:
- 今は小規模で、マイクロサービス化の利点がない
- ただし機能境界は切っておきたい
- 将来一部を別サービスに出す場合でも、モジュール境界が再利用しやすい

### 2. Clean Architecture
依存の向きを内側へ向ける。

依存関係:
- UI / HTTP / DB / Scheduler / Push Provider
- Application
- Domain

内側の層ほど、外側の技術詳細を知らないようにする。

### 3. Ports and Adapters
外部依存を interface 越しに扱う。

代表例:
- DB repository
- Google OIDC provider
- Push sender
- Scheduler

この形にすると、Cloudflare D1 から別 DB に移るときも adapter の差し替えで済みやすい。

### 4. Repository Pattern
永続化の詳細をアプリケーション層とドメイン層から隠す。

例:
- `TaskRepository`
- `UserRepository`
- `PushSubscriptionRepository`

### 5. Application Service / Use Case
ユースケース単位の処理をまとめる。

例:
- `ListTasksUseCase`
- `ReassignTaskUseCase`
- `CompleteTaskUseCase`
- `SubscribePushUseCase`

Controller や React Component に業務ロジックを持ち込まないために必要。

### 6. DTO / Mapper
画面や API の入出力と、ドメイン内部モデルを分ける。

例:
- API Response DTO
- View Model
- Repository Record

小規模でもこの変換点は持った方がよい。DB スキーマ変更や UI 表示変更の影響範囲を狭められる。

## DDD の適用方針
### 境界づけられたコンテキスト
現時点では 1 つのプロダクトだが、内部では次の関心に分ける。

- `tasks`
  家事、担当、状態、締切、完了
- `identity`
  ユーザ、ログイン、セッション
- `notifications`
  Push 購読、通知送信、締切通知

### 集約
まずは `Task` を主要 Aggregate Root とする。

`Task` が持つ責務:
- 現在担当者
- 状態
- 締切日
- 完了判定
- 再割当のルール

### Entity
候補:
- `Task`
- `User`
- `PushSubscription`
- `NotificationJob`

### Value Object
候補:
- `TaskId`
- `UserId`
- `DueDate`
- `TaskStatus`
- `NotificationType`

ただし、全てを class 化しない。まずは TypeScript の branded type や union type で十分。

### Domain Service
必要になった場合のみ導入する。

例:
- 締切通知対象判定
- 完了通知の通知先決定

単一 Entity に閉じるルールなら Entity メソッドへ置く。

### Domain Event
通知処理との接続点として採用する。

例:
- `TaskReassigned`
- `TaskCompleted`
- `TaskDueToday`

用途:
- 家事完了時に `TaskCompleted` を発行し、もう片方への通知ジョブを作る
- 担当変更時に `TaskReassigned` を発行し、履歴を残す
- 締切日判定時に `TaskDueToday` を発行し、担当者への通知ジョブを作る
- 将来、スコア集計や履歴タイムラインを追加するときの拡張点にする

ただし、MVP では重いイベントバスや非同期メッセージング基盤は導入しない。
まずは Application Service が同一プロセス内の event dispatcher に event を渡し、handler が `task_events` や `notification_jobs` へ記録する。

重要な区別:
- Domain Event は「業務上起きた出来事」
- `task_events` は「履歴表示や監査のための永続化レコード」
- `notification_jobs` は「通知送信の重複防止と再送確認のための永続化レコード」

Domain Event をそのまま永続化スキーマにしない。必要な形に変換して `task_events` や `notification_jobs` へ保存する。

## 避けること
- 小規模アプリに対して過剰な DI コンテナを入れる
- 何でも interface 化する
- UI でも API でも CRUD 単位でだけフォルダを切る
- DB スキーマをそのままドメインモデルとして扱う
- React Component にユースケースを直接書く
- Cloudflare 固有型をドメイン層へ持ち込む

## あるべき全体像
### 初期実装の推奨構成
最初は package を細かく分けすぎず、`apps` 配下で完結させる。

```txt
apps/
  kajibun-ui/
  kajibun-api/
infra/
  terraform/
doc/
```

### 初期構成の方針
- `kajibun-api` の中に API、DB migration、runtime adapter、通知処理を持つ
- `kajibun-ui` の中に page / feature / shared を持つ
- `packages/` は最初は作らない
- 永続化実装は `packages/db` のような独立 package にしない
- DB は infrastructure の一部として扱う

### 将来の抽出候補
以下は、重複や再利用要求が明確になった時点でのみ `packages/` へ切り出す。

- `packages/domain`
  複数実行基盤で共有したいドメイン型やルール
- `packages/application`
  複数 adapter から同じ use case を呼ぶ必要がある場合
- `packages/persistence`
  migration や共通 SQL 補助が肥大化した場合
- `packages/shared`
  UI と API で共有する型やユーティリティが増え、重複管理の方がつらくなった場合

つまり、`packages/domain` や `packages/application` は今すぐの必須構成ではなく、将来の抽出先である。

## API 層の推奨モジュール構成
### 方針
- MVP では深い階層を避け、機能単位の浅いディレクトリにする
- `domain / application / infrastructure / presentation` を物理ディレクトリで厳密に分けすぎない
- 依存方向は module 境界と import ルールで守る
- Domain Event は採用し、通知処理は event handler 経由でつなぐ
- Cloudflare、D1、Google OIDC、Web Push の実装は app / db / auth / notifications の外側に閉じ込める

### この判断の理由
- 要件上、利用者は2人で、MVP の中心は家事一覧、担当変更、完了、通知である
- 変更要求は通常 `tasks/service.ts` や `notifications/*` に収まる
- 最初から `entities / value-objects / use-cases / dto / ports / mappers / presentation` まで分けると、ファイル数と探索コストが先に増える
- 一方で Domain Event を置くことで、通知、履歴、将来のスコア集計を直接結合させすぎずに拡張できる

要するに、MVP では `浅い機能分割 + event handler` を基本形にし、複雑になった箇所だけ後から層を切り出す。

### MVP の推奨構成
```txt
apps/kajibun-api/
  src/
    app/
      handler.ts
      router.ts
      env.ts
      container.ts
    auth/
      routes.ts
      service.ts
      google-oidc.ts
      session.ts
      types.ts
    tasks/
      routes.ts
      service.ts
      repository.ts
      events.ts
      event-handlers.ts
      types.ts
    notifications/
      routes.ts
      service.ts
      subscriptions.ts
      jobs.ts
      push-sender.ts
      scheduler.ts
      event-handlers.ts
      types.ts
    db/
      client.ts
      transaction.ts
      migrations/
    adapters/
      runtime/
        cloudflare.ts
      persistence/
        d1.ts
      scheduler/
        cloudflare-cron.ts
    shared/
      errors.ts
      result.ts
      ids.ts
      events.ts
```

各ディレクトリの意図:
- `tasks/service.ts`: 家事一覧、担当変更、完了、締切判定のユースケースを置く
- `tasks/events.ts`: `TaskCompleted`, `TaskReassigned`, `TaskDueToday` などの Domain Event を定義する
- `tasks/event-handlers.ts`: 履歴記録など、task 側で完結する event handler を置く
- `notifications/event-handlers.ts`: Domain Event から通知ジョブを作る handler を置く
- `notifications/jobs.ts`: `notification_jobs` の作成、重複防止、状態更新を扱う
- `notifications/push-sender.ts`: Web Push 送信の port と実装境界を扱う
- `db/migrations`: 当面の migration 管理場所とする

### vendor / runtime adapter の置き場所
Cloudflare や D1 のような基盤固有コードは、機能モジュールの外側に寄せる。

```txt
apps/kajibun-api/
  src/
    adapters/
      runtime/
        cloudflare.ts
      persistence/
        d1.ts
      scheduler/
        cloudflare-cron.ts
```

各 repository は SQL を使ってよいが、D1 固有の binding や Cloudflare 固有型は `adapters/persistence/d1.ts` に閉じ込める。

この形にすると、他 DB へ移行する場合は例えば次を追加すればよい。

- `adapters/persistence/postgres.ts`
- `db/client.ts` の接続実装差し替え
- 必要に応じて repository の SQL 方言差を調整
- DI 設定または factory 設定の切り替え

## API 層の責務
### Domain
- 業務ルールを持つ
- 外部 API を知らない
- D1 も Cloudflare も知らない

例:
- `Task.reassignTo(userId)`
- `Task.complete(at, actorId)`
- `Task.canNotifyDueToday(now)`

### Application
- ユースケースを調停する
- transaction 境界を持つ
- port を通じて外部依存を呼ぶ
- Domain Event を発行し、同一プロセス内の handler へ渡す

例:
- `ReassignTaskUseCase`
  - task を取得
  - 再割当ルールを適用
  - 保存
  - `TaskReassigned` を発行
- `CompleteTaskUseCase`
  - task を取得
  - 完了ルールを適用
  - 保存
  - `TaskCompleted` を発行

### Event Handler
- Domain Event を受け取り、副作用を実行する
- MVP では同一 process 内で同期的に呼ぶ
- handler の失敗時に transaction 全体を失敗させるか、通知ジョブだけ後で確認可能にするかは use case ごとに決める

例:
- `TaskCompleted`
  - `task_events` に完了履歴を保存する
  - `notification_jobs` に完了通知ジョブを作る
- `TaskReassigned`
  - `task_events` に担当変更履歴を保存する
- `TaskDueToday`
  - `notification_jobs` に締切通知ジョブを作る

### Infrastructure
- SQL repository 実装
- Google OIDC
- Web Push
- scheduler 実装

ここでいう infrastructure は `外部依存の接続実装` であり、業務ルールの置き場ではない。

ここだけが基盤差し替え対象になる。

### Presentation
- HTTP request/response
- 認証 cookie の読み書き
- DTO 変換
- バリデーション

Controller は薄く保つ。

## UI 層の推奨モジュール構成
### 方針
- React Component を domain の代替にしない
- `ページ`, `機能`, `共通UI`, `API client` を分離する
- server state は React Query、local state は component または feature hook に置く

### 推奨構成
```txt
apps/kajibun-ui/
  src/
    app/
      providers/
        query-client-provider.tsx
        theme-provider.tsx
      router/
      bootstrap/
        seed-dev-data.ts
    pages/
      task-list-page/
        TaskListPage.tsx
      settings-page/
        SettingsPage.tsx
    features/
      auth/
        api/
          get-current-user.ts
          login.ts
          logout.ts
        hooks/
          useCurrentUser.ts
        model/
          current-user.ts
      tasks/
        api/
          list-tasks.ts
          reassign-task.ts
          complete-task.ts
        hooks/
          useTasks.ts
          useReassignTask.ts
          useCompleteTask.ts
        model/
          task.ts
          task-status.ts
          task-view-model.ts
        ui/
          TaskList.tsx
          TaskCard.tsx
          ReassignTaskMenu.tsx
          TaskStatusBadge.tsx
      notifications/
        api/
          subscribe-push.ts
        hooks/
          usePushPermission.ts
          usePushSubscription.ts
        model/
          push-permission.ts
        ui/
          PushPermissionCard.tsx
    shared/
      api/
        http-client.ts
        query-keys.ts
      ui/
        layout/
        feedback/
      lib/
        date.ts
        env.ts
      types/
        brand.ts
```

## UI 層のパターン
### Container / Presentational Component
古典的だがまだ有効。

例:
- `TaskListPage`
  データ取得、フィルタ状態、mutation 呼び出し
- `TaskList` / `TaskCard`
  表示中心

React Query を使うなら、`Page` や `feature hook` が Container に近い役割を持つ。

### Custom Hook
UI 固有の状態や server state 接続を隠す。

例:
- `useTasks`
- `useReassignTask`
- `usePushPermission`

ただし、hook に業務ルールを詰め込みすぎない。業務判断は API 側の use case へ寄せる。

### View Model
表示専用の整形モデルを持つ。

例:
- `TaskViewModel`
  - `statusLabel`
  - `statusColor`
  - `isMine`

現状の `getStatusColor` や `getStatusLabel` は、将来的には view model mapper へ寄せる方がよい。

## UI 層で避けること
- `localStorage` を component から直接読む
- API 呼び出しと画面表示ロジックを同じ component に混ぜる
- `Task` 型をそのまま API DTO と画面表示に兼用する
- 画面都合の if/switch を複数 component に散らす

## 推奨する依存方向
### API 層
```txt
routes -> service -> domain types / domain events
event handlers -> repositories / notification jobs
adapters -> db / runtime / external providers
```

MVP ではディレクトリ名としての `presentation / application / domain / infrastructure` は必須にしない。
ただし、依存方向としては routes から service へ、service から domain event を発行し、外部副作用は handler と adapter に寄せる。

### UI 層
```txt
pages -> features -> shared
features/api -> shared/api
features/ui -> features/model
```

`shared` から `features` や `pages` を逆参照しない。

## 最小限の共通モデル方針
- API request/response は DTO として明示する
- ドメイン内部モデルと UI 表示用 model は分ける
- ただし DTO と完全同一で十分なものは無理に変換しない

変換が必要な場所:
- DB record -> domain model または API response
- Domain Event -> task_events / notification_jobs
- API DTO -> UI View Model

## DB 抽象化の考え方
### 何を抽象化するか
- `TaskRepository` のような repository port
- transaction interface
- query 実行のための最小 client interface

### 何を抽象化しすぎないか
- SQL 方言差まで完全に隠すこと
- 全 DB に共通の万能 ORM 抽象

### 想定する差し替え方法
今の想定は `設定で何でも自動切替` より、`adapter を差し替える` 方が現実的。

例:
- 当面: Cloudflare D1
- 将来: PostgreSQL, Turso, SQLite

差し替え時の作業:
1. 新しい persistence adapter を追加する
2. repository 実装をその adapter に接続する
3. runtime の composition root で利用実装を切り替える

つまり、D1 接続前提の業務実装にはしないが、`SQL repository 実装は持つ`。その下の client だけを D1, Postgres などに差し替えるイメージである。

## どこまで抽象化するか
### 抽象化するもの
- repository
- auth provider
- push sender
- scheduler
- HTTP client wrapper

### 抽象化しすぎないもの
- 単純な formatter
- 1 実装しかなく、差し替え予定もない UI 部品
- 1 箇所でしか使わない mapper

## 現状からの移行ステップ
### Step 1
- `TaskList.tsx` から `localStorage` 参照を外す
- `useCurrentUser` を `features/auth/hooks` へ移す
- `TaskList` を表示専用 component に寄せる

### Step 2
- `mockTasks` 依存を `features/tasks/api/list-tasks.ts` へ置き換えられる形にする
- `Task` の表示用変換を `task-view-model` へ寄せる

### Step 3
- `apps/kajibun-api` に `tasks`, `identity`, `notifications` モジュールを作る
- use case と repository port を先に作る

### Step 4
- D1, Google OIDC, Web Push, Scheduler を infrastructure adapter として接続する

## 結論
目指す形は `DDD を薄く適用した Modular Monolith` であり、実装スタイルとしては `Clean Architecture + Ports and Adapters + Use Case` が最も合う。

ただし、重要なのはパターン名そのものではなく、次の 4 点である。

- 業務ルールを UI と基盤から分離する
- 外部依存を adapter に閉じ込める
- 機能モジュール単位で責務を持たせる
- 小規模アプリに見合う範囲でのみ抽象化する

この方針なら、今の規模に対して過剰になりすぎず、将来 Cloudflare 以外へ移行する場合も局所的な修正で済ませやすい。
