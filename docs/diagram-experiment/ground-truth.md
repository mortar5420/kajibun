# kajibun Push通知機能 Ground Truth

## 目的と扱い

この文書は、kajibunのPush通知機能について、リポジトリの実装から確認できた事実を固定したものです。

Mermaid、draw.io、HTML/SVG、Archifyで作成した図の内容を比較するときの参照元として使用します。図の表現方法や見栄えではなく、コンポーネント、処理順序、データの流れが実装と一致しているかを確認するための資料です。

調査時点の実装に基づきます。コードから確認できない外部Push Service内部の挙動などは、実装確認済み事項と区別して記載します。

### 作図時の粒度

この資料を基に作成する図は、コード上のクラスや責務ではなく、**実行環境・デプロイ単位**を基本のコンポーネント粒度とします。LTで作図方式の違いを比較しやすくし、Push通知の全体像を伝えることが目的です。

- `Tasks API`、`Task Service`、`Event Dispatcher`、`Notification Service`、`Web Push Adapter`は、すべてこのリポジトリに実装された同一Cloudflare Worker内のコードです。図では分割せず、**Cloudflare Worker（kajibun API）**という1コンポーネントに統合します。
- `Scheduled Handler`も同じWorkerの同じデプロイに含まれるため、別コンポーネントにはせず、Cron TriggerからCloudflare Workerへの起動として表現します。
- `React UI`と`Push通知設定UI`は同じPWAのコードなので、**React PWA**に統合します。
- `PushManager`や`Notifications API`はアプリ独自のコンポーネントではなくブラウザAPIです。必要な場合はReact PWAが利用するブラウザ機能として注記し、独立したアプリケーションサービスのようには表現しません。
- `push-sw.js`はReact PWAと同じフロントエンド成果物に含まれますが、バックグラウンドでPushを受信する別の実行コンテキストであるため、通知経路を示す図では分けて構いません。
- Cloudflare D1、Cloudflare Cron Trigger、外部Push ServiceはWorkerとは異なる実体・管理サービスなので、独立したコンポーネントとして表現します。

以下の節に登場するサービス名や関数名は実装根拠を明確にするための内部責務名であり、図の独立コンポーネントを意味しません。

## 要約

kajibunのPush通知は、React PWA、Cloudflare Worker、Cloudflare D1、Cloudflare Cron Trigger、ブラウザのPush APIとNotifications API、専用Service Worker、外部Push Serviceから構成されます。

通知種別は次の3種類です。

- `task_completed`: 家事完了時のリアルタイム通知
- `task_due_today`: 期限当日・期限超過の定期通知
- `test_push`: ユーザー自身へのテスト通知

家事完了通知の宛先は、家事完了後の次担当者だけです。`TaskCompleted`イベントの`toAssigneeUserId`を受信者として通知ジョブを作成します。

家事完了通知は、通知ジョブを保存するだけの完全な非同期処理ではありません。家事完了APIのリクエスト処理内で通知ジョブを作成し、そのまま外部Push Serviceへの送信を試行します。再試行可能な失敗は`pending`として保存され、後続のCron実行で再送されます。

## 1. システム構成

| コンポーネント | 実行場所 | 役割 | 主な通信・データ |
| --- | --- | --- | --- |
| React PWA | ユーザーのブラウザ/PWA | 家事完了操作、通知許可、Service Worker登録、Subscription作成・同期 | Worker APIへのHTTPSリクエスト、VAPID公開鍵、`endpoint`、`p256dh`、`auth` |
| `push-sw.js` | ブラウザのService Worker | Pushイベント受信、通知表示、通知クリック時の画面復帰 | `{ title, body, url }` |
| Cloudflare Worker（kajibun API） | Cloudflare Worker | Hono API、家事完了、イベント保存、通知ジョブ作成、VAPID認証・暗号化、Push送信、定期通知、再試行 | Cookie、Task、TaskCompleted event、NotificationJob、Subscription、Push endpoint |
| Cloudflare D1 | Cloudflare | ユーザー、家事、イベント、Subscription、通知ジョブを永続化 | SQL |
| Cloudflare Cron Trigger | Cloudflare | Workerの定期処理を起動 | `0 3,9 * * *` |
| 外部Push Service | リポジトリ外 | 暗号化されたPush messageを対象ブラウザへ配送 | Subscription固有のendpoint |

### 1.1 フロントエンド

Push通知設定UIは、ブラウザに次のAPIが存在するか確認します。

- Service Worker
- PushManager
- Notifications API

通知許可が拒否済みの場合はブロック状態とします。通知を有効化すると、VAPID公開鍵を取得し、通知許可を要求し、`/push-sw.js`を登録します。その後、既存Subscriptionを取得するか、次の設定で新規作成します。

- `userVisibleOnly: true`
- `applicationServerKey`: APIから取得したVAPID公開鍵

作成・取得したSubscriptionは`toJSON()`でAPIへ送信します。

根拠:

- `apps/kajibun-ui/src/features/push-notifications/components/PushNotificationButton.tsx`
  - `PushNotificationButton`
  - `syncPushSubscription`
- `apps/kajibun-ui/src/features/push-notifications/api.ts`
  - `getVapidPublicKey`
  - `subscribePush`
  - `sendTestPush`

家事完了操作は、現在のユーザーが担当している家事に表示される「終わった」ボタンから開始されます。React Queryのmutationを経由し、`PATCH /api/tasks/:taskId/complete`を呼び出します。

根拠:

- `apps/kajibun-ui/src/components/TaskList.tsx`
  - `completeMutation`
- `apps/kajibun-ui/src/features/tasks/api.ts`
  - `completeTask`
- `apps/kajibun-ui/src/shared/api/request.ts`
  - APIの既定ベースURLは`/api`
  - Cookieを含めてリクエスト

### 1.2 Worker API

Push通知に直接関係するAPIは次のとおりです。

| API | 認証 | 用途 |
| --- | --- | --- |
| `GET /api/push/vapid-public-key` | 不要 | VAPID公開鍵の取得 |
| `POST /api/push-subscriptions` | 必要 | Subscriptionの登録・同期 |
| `POST /api/push/test` | 必要 | ログインユーザー自身へのテストPush |
| `GET /api/notifications/latest` | 必要 | ログインユーザー宛ての最新送信済みpayload取得 |
| `PATCH /api/tasks/:taskId/complete` | 必要 | 家事完了とリアルタイム通知の起点 |

`/api`接頭辞なしの同等ルートも登録されていますが、フロントエンドは既定で`/api`付きルートを使用します。

根拠:

- `apps/kajibun-api/src/app/router.ts`
- `apps/kajibun-api/src/notifications/routes.ts`
  - `registerNotificationRoutes`
- `apps/kajibun-api/src/tasks/routes.ts`
  - `PATCH /:taskId/complete`
- `apps/kajibun-api/src/app/context.ts`
  - `requireCurrentUser`

### 1.3 D1のデータ

Push通知に直接関係するテーブルは次のとおりです。

#### `push_subscriptions`

- `id`
- `user_id`
- `endpoint`
- `p256dh`
- `auth`
- `user_agent`
- `created_at`
- `updated_at`
- `revoked_at`

#### `notification_jobs`

- `id`
- `type`
- `recipient_user_id`
- `task_id`
- `dedupe_key`
- `payload_json`
- `status`: `pending` / `sent` / `failed`
- `attempts`
- `last_error`
- `created_at`
- `updated_at`
- `sent_at`

また、家事完了時には`task_events`へ`TaskCompleted`イベントを保存します。

根拠:

- `apps/kajibun-api/src/db/migrations/0006_create_push_notifications.sql`
- `apps/kajibun-api/src/db/migrations/0002_create_tasks.sql`
- `apps/kajibun-api/src/notifications/repository.ts`
  - `createSqlNotificationRepository`
- `apps/kajibun-api/src/tasks/repository.ts`
  - `recordEvent`

### 1.4 Web Push送信

Web Push送信は外部ライブラリではなく、WorkerのWeb Crypto APIを使った実装です。

処理内容:

- VAPID公開鍵、秘密鍵、subjectを設定から取得
- Subscription endpointのoriginをaudienceとするVAPID JWTを生成
- Subscriptionの`p256dh`と`auth`を使ってpayloadを暗号化
- `Content-Encoding: aes128gcm`としてSubscription endpointへPOST
- `Authorization: vapid ...`を付与
- TTLは60秒

外部Push Serviceの具体的な事業者名はコードに固定されていません。送信先はブラウザが作成したSubscriptionの`endpoint`で決まります。図では、FCMなど特定サービス名を断定せず「外部Push Service」または「ブラウザベンダーのPush Service」と表現します。

根拠:

- `apps/kajibun-api/src/adapters/push/web-push.ts`
  - `createWebPushSender`
  - `encryptWebPushPayload`
  - `createVapidJwt`
- `apps/kajibun-api/src/app/env.ts`
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`

### 1.5 Service Workerと通知表示

`push-sw.js`は`push`イベントを受信し、payloadをJSONとして読み取ります。`title`と`body`が存在すればその値を使用し、読み取れない場合は汎用メッセージへフォールバックします。

`showNotification()`へ渡す主な項目:

- `title`
- `body`
- `icon`: `/icons/icon-192.png`
- `badge`: `/icons/icon-192.png`
- `data.url`

通知クリック時は、既存のウィンドウクライアントがあればfocusし、なければpayloadのURLを新しく開きます。

根拠:

- `apps/kajibun-ui/public/push-sw.js`

## 2. 家事完了時のリアルタイムPush通知

### 2.1 登場Actor / Component

1. ユーザーA
2. ユーザーAのReact PWA
3. Cloudflare Worker（kajibun API）
4. Cloudflare D1
5. 外部Push Service
6. ユーザーBのService Worker
7. ユーザーB

シーケンス図では、Tasks API、Task Service、Event Dispatcher、Notification Service、Web Push Adapterを別々のライフラインにしません。これらの呼び分けはWorker内部のコード上の責務分割であり、ネットワーク越しに通信する独立サービスではないためです。必要であれば、Workerの自己呼び出しやNoteで内部処理として示します。

### 2.2 実際の処理順序

1. ユーザーAが、自分に割り当てられている家事の「終わった」ボタンを押します。
2. React PWAが`PATCH /api/tasks/{taskId}/complete`を呼び出します。
3. WorkerはセッションCookieからユーザーAを認証します。
4. Workerが対象の家事を取得します。
5. `ALLOWED_GOOGLE_EMAILS`に含まれるユーザーのうち、ユーザーA以外のユーザーを次の担当者として選びます。
6. 家事の繰り返し間隔から次回期限を計算し、D1の`tasks`を次回期限・次担当者で更新します。
7. WorkerがD1の`task_events`へ`TaskCompleted`イベントを保存します。
8. 保存されたイベントにはD1で採番された`eventId`が付与されます。
9. Workerは保存済みイベントを、そのまま同じリクエスト内の通知処理へ渡します。
10. Workerが、イベントの`toAssigneeUserId`を通知先として決定します。
11. 次担当者について`notification_jobs`を作成します。
12. ジョブが`pending`なら、同じAPIリクエスト内で直ちにWeb Push送信を試行します。
13. WorkerがVAPID JWTを生成し、通知payloadを暗号化します。
14. WorkerがSubscription endpointへHTTP POSTします。
15. Push endpointが成功を返した場合、ジョブを`sent`に更新します。
16. 外部Push ServiceがユーザーBのブラウザへPush messageを配送します。
17. ユーザーBの`push-sw.js`が`push`イベントを受信します。
18. Service Workerが`showNotification()`でユーザーBへ通知を表示します。
19. ユーザーBが通知をクリックすると、既存のkajibun画面をfocusするか、`/`を新しく開きます。
20. 通知処理の完了後、家事完了APIは更新後の家事をユーザーAのPWAへ返します。

手順16は標準的なWeb Pushの役割から分かる内容です。外部Push Service内部の具体的な配送処理は、このリポジトリからは確認できません。

根拠:

- `apps/kajibun-ui/src/components/TaskList.tsx`
  - 完了ボタンと`completeMutation`
- `apps/kajibun-ui/src/features/tasks/api.ts`
  - `completeTask`
- `apps/kajibun-api/src/tasks/routes.ts`
  - `PATCH /:taskId/complete`
- `apps/kajibun-api/src/tasks/service.ts`
  - `completeTaskUseCase`
  - `resolveNextAssignee`
- `apps/kajibun-api/src/tasks/event-handlers.ts`
  - `dispatchTaskEvents`
- `apps/kajibun-api/src/tasks/repository.ts`
  - `updateCompletion`
  - `recordEvent`
- `apps/kajibun-api/src/notifications/service.ts`
  - `handleTaskNotificationEvent`
  - `enqueueAndSendTaskCompletedNotifications`
  - `sendNotificationJob`
- `apps/kajibun-api/src/notifications/repository.ts`
  - `createJob`
  - `listActiveSubscriptionsByUserId`
- `apps/kajibun-api/src/adapters/push/web-push.ts`
- `apps/kajibun-ui/public/push-sw.js`

### 2.3 通知payload

家事完了通知のpayloadは次の形式です。

```json
{
  "title": "「家事名」が完了しました",
  "body": "家事が完了しました。 次回の期限はYYYY-MM-DDです。",
  "url": "/"
}
```

次回期限が存在しない場合、bodyの次回期限部分は付きません。

通知ジョブ:

- type: `task_completed`
- recipient: `TaskCompleted.payload.toAssigneeUserId`で示される次担当者
- task ID: 完了した家事のID
- dedupe key: `task_completed:{eventId}:{recipientUserId}`

### 2.4 「ユーザーB」の正確な意味

WorkerはユーザーA以外の許可ユーザーを次担当者に設定し、そのユーザーIDを`TaskCompleted.payload.toAssigneeUserId`へ記録します。続く同一Worker内の通知処理がこのIDを通知ジョブの受信者に使うため、ユーザーBは「家事完了後の次担当者」を意味します。

次担当者に有効なPush Subscriptionがない場合も通知ジョブは作成され、`no_active_push_subscription`で`failed`になります。次担当者以外の購読ユーザーへは送信しません。

## 3. Push Subscription登録

### 3.1 処理順序

1. ユーザーが通知設定ボタンを押します。
2. PWAが`GET /api/push/vapid-public-key`でVAPID公開鍵を取得します。
3. `Notification.requestPermission()`で通知許可を要求します。
4. PWAが`navigator.serviceWorker.register('/push-sw.js')`を呼びます。
5. `registration.pushManager.getSubscription()`で既存Subscriptionを確認します。
6. 存在しない場合は`pushManager.subscribe()`で新規作成します。
7. `subscription.toJSON()`を`POST /api/push-subscriptions`へ送信します。
8. WorkerはセッションCookieからログインユーザーを特定します。
9. APIは`endpoint`、`keys.p256dh`、`keys.auth`が空でない文字列であることを検証します。
10. そのユーザーに紐づく既存Subscriptionをすべて削除します。
11. 新しいSubscriptionをD1へ保存します。endpointが別ユーザーを含め既存の場合は、所有ユーザー、鍵、User-Agentを更新し、revoked状態を解除します。

### 3.2 複数端末について

送信処理は、1ユーザーに複数の有効Subscriptionが存在する場合、すべてへ送信できる実装です。

一方、通常の購読登録フローでは、登録のたびに対象ユーザーの既存Subscriptionをすべて削除してから1件を保存します。そのため現行UI/APIを通した通常利用では、最後に同期されたSubscriptionだけが残ります。

根拠:

- `apps/kajibun-ui/src/features/push-notifications/components/PushNotificationButton.tsx`
  - `syncPushSubscription`
- `apps/kajibun-api/src/notifications/routes.ts`
- `apps/kajibun-api/src/notifications/validation.ts`
  - `parsePushSubscriptionInput`
- `apps/kajibun-api/src/notifications/service.ts`
  - `subscribePushUseCase`
- `apps/kajibun-api/src/notifications/repository.ts`
  - `replaceSubscriptionsForUser`
  - `listActiveSubscriptionsByUserId`

## 4. 定期通知

### 4.1 起動

Cloudflare Workerのproduction環境とdev環境に、次のCron式が設定されています。

```text
0 3,9 * * *
```

Workerの定期処理は各実行で次の処理を順番に行います。

1. 期限当日・期限超過通知のジョブ作成と即時送信
2. 既存の`pending`通知ジョブを最大20件取得して再送

時刻スロットは`Asia/Tokyo`の時刻を`HH:00`形式で計算し、dedupe keyへ含めます。

根拠:

- `apps/kajibun-api/wrangler.toml`
- `apps/kajibun-api/src/index.ts`
  - `scheduled`
- `apps/kajibun-api/src/app/scheduled.ts`
  - `handleScheduled`
  - `getDueTodayNotificationSlot`

### 4.2 通知対象

D1から削除されていない家事を取得し、次の条件で対象を決めます。

- 期限なし: 通知しない
- 期限が未来: 通知しない
- 期限が今日: 当日期限通知
- 期限が過去: 期限超過通知

受信者:

- 家事に担当者がいる: その担当者
- 家事が未割り当て: `ALLOWED_GOOGLE_EMAILS`に含まれる全ユーザー

Subscriptionのない受信者についてもジョブ自体は作成され、その後`no_active_push_subscription`で`failed`になります。

### 4.3 payloadと重複防止

当日期限:

- title: `今日が期限の家事があります`
- body: `「家事名」の期限は今日です。`

期限超過:

- title: `期限を過ぎた家事があります`
- body: `「家事名」の期限（YYYY-MM-DD）を過ぎています。`

共通:

- url: `/`
- type: `task_due_today`
- dedupe key: `task_due_today:{today}:{notificationSlot}:{taskId}:{recipientUserId}`

根拠:

- `apps/kajibun-api/src/notifications/service.ts`
  - `sendDueTodayNotificationsUseCase`
- `apps/kajibun-api/src/tasks/repository.ts`
  - `list`
- `apps/kajibun-api/src/shared/date.ts`
  - `getTodayDateString`

## 5. 送信状態・再試行・無効Subscription

### 5.1 状態遷移

- ジョブ作成時: `pending`
- 1つ以上のSubscriptionへの送信成功: `sent`
- Subscriptionなし: `failed`
- 再試行可能エラーかつ試行回数が上限未満: `pending`
- 再試行不能エラー、または試行上限到達: `failed`

最大試行回数は3回です。`attempts`は各送信試行後に1増えます。

### 5.2 複数Subscription

受信者に複数の有効Subscriptionがある場合、すべてへ順番に送信します。1件以上成功すればジョブ全体を`sent`とします。

### 5.3 無効Subscription

Push endpointがHTTP 404または410を返した場合、そのSubscriptionの`revoked_at`を設定します。このエラー自体は再試行不能として扱います。

その他の非成功HTTP statusと、送信中に発生した例外は再試行可能として扱います。

根拠:

- `apps/kajibun-api/src/notifications/service.ts`
  - `MAX_SEND_ATTEMPTS`
  - `sendPendingNotificationsUseCase`
  - `sendNotificationJob`
- `apps/kajibun-api/src/notifications/repository.ts`
  - `listPendingJobs`
  - `markJobSent`
  - `markJobPending`
  - `markJobFailed`
  - `revokeSubscription`
- `apps/kajibun-api/src/adapters/push/web-push.ts`
  - HTTP 404/410の処理

## 6. 実装から確認できない事項

次の事項は、リポジトリだけからは断定できません。

- 各ブラウザが利用する外部Push Serviceの具体的な事業者名
- Push Service内部での配送経路、キュー、再送処理
- Push Serviceが成功応答した後、ユーザー端末へ実際に到達するまでの時間
- OSやブラウザによる通知表示の最終的な見た目
- 各端末でのバックグラウンド動作制限

図ではこれらを推測で詳細化せず、「外部Push Service」および「ブラウザ/OSの通知表示」として扱います。

## 7. 作図用チェックリスト

### 7.1 システム構成図に含めるべき要素

- ユーザーのブラウザ/PWA
- React PWA
  - 通知設定UI
  - 利用するブラウザ機能: Notifications API、Push API / PushManager
- `push-sw.js`
- Cloudflare Worker（kajibun API）
  - Hono API、家事処理、イベント処理、通知処理、Web Push送信、定期処理を1コンポーネントとして表現
- Cloudflare D1
  - `tasks`
  - `task_events`
  - `push_subscriptions`
  - `notification_jobs`
- Cloudflare Cron Trigger
- 外部Push Service

表現すべき主な通信:

- React PWAからWorker APIへのHTTPSリクエスト
- PWAによるVAPID公開鍵取得
- PushManagerによるSubscription作成
- PWAからWorker APIへのSubscription登録
- WorkerとD1の読み書き
- Cron TriggerからWorkerの定期処理の起動
- WorkerからSubscription endpointへの暗号化POST
- 外部Push ServiceからService WorkerへのPush配送
- Service Workerによる通知表示

VAPID設定（public key、private key、subject）やWorker内部の責務名は、必要に応じてコンポーネント内の注記として示します。独立コンポーネントとして追加する必要はありません。

### 7.2 家事完了通知シーケンス図に含めるべきActor / Component

- ユーザーA
- ユーザーAのPWA
- Cloudflare Worker（kajibun API）
- D1
- 外部Push Service
- ユーザーBのService Worker
- ユーザーB

表現すべき処理:

1. 完了ボタン操作
2. `PATCH /api/tasks/:taskId/complete`
3. ユーザーAの認証
4. 次回期限・次担当者の決定
5. `tasks`更新
6. `TaskCompleted`イベント保存
7. `TaskCompleted.toAssigneeUserId`から次担当者を通知先に決定
8. `notification_jobs`作成
9. 暗号化・VAPID認証
10. Subscription endpointへPOST
11. Push message配送
12. Service Workerの`push`イベント
13. `showNotification()`
14. ユーザーBへの通知表示

図に注記すべき実装上の注意:

- ユーザーBは家事完了後の次担当者
- Push送信は家事完了APIの処理内で即時試行される
- 再試行可能な失敗はD1に`pending`で残り、Cronが再送する
- 外部Push Serviceの具体的な事業者は実装から特定できない

## 8. 検証済みテスト

Ground Truth作成時に、次のテストを実行し、8件すべて成功しました。

```text
bun test src/notifications/service.test.ts src/adapters/push/web-push.test.ts

8 pass
0 fail
```

対象:

- `apps/kajibun-api/src/notifications/service.test.ts`
- `apps/kajibun-api/src/adapters/push/web-push.test.ts`
