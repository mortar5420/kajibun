# Push通知機能 システム構成図（メールフォールバック追加）

```mermaid
flowchart LR
  user["ユーザー<br/>ブラウザ / PWA"]

  subgraph browser["ユーザー端末"]
    pwa["React PWA<br/>家事完了操作<br/>通知設定UI<br/>Service Worker登録<br/>Subscription作成・同期"]
    sw["push-sw.js<br/>pushイベント受信<br/>showNotification()<br/>通知クリック時のfocus / openWindow"]
  end

  subgraph cloudflare["Cloudflare"]
    worker["Cloudflare Worker<br/>kajibun API<br/>Hono API<br/>家事処理<br/>イベント保存<br/>通知ジョブ作成<br/>VAPID認証・暗号化<br/>Web Push送信<br/>Push失敗時のメール通知<br/>定期処理"]
    d1[("Cloudflare D1<br/>users<br/>tasks<br/>task_events<br/>push_subscriptions<br/>notification_jobs")]
    cron["Cloudflare Cron Trigger<br/>0 3,9 * * *"]
  end

  push["外部Push Service<br/>Subscription endpoint<br/>ブラウザベンダーのPush配送基盤"]
  email["外部メール送信サービス<br/>Push失敗時のフォールバック配送"]
  mailbox["ユーザーBのメールボックス<br/>家事完了通知メール"]
  os["ブラウザ / OS<br/>通知表示"]

  user -->|"操作"| pwa
  pwa -->|"HTTPS<br/>GET /api/push/vapid-public-key"| worker
  pwa -->|"ブラウザ機能を利用<br/>Notifications API<br/>Push API / PushManager"| pwa
  pwa -->|"Service Worker登録<br/>/push-sw.js"| sw
  pwa -->|"HTTPS<br/>POST /api/push-subscriptions<br/>endpoint / p256dh / auth"| worker
  pwa -->|"HTTPS<br/>PATCH /api/tasks/:taskId/complete"| worker
  pwa -->|"HTTPS<br/>POST /api/push/test"| worker

  worker <-->|"SQL<br/>家事・イベント・購読・通知ジョブ"| d1
  cron -->|"scheduled handler起動<br/>期限通知作成<br/>pending通知再送"| worker
  worker -->|"暗号化payloadをPOST<br/>Authorization: vapid<br/>Content-Encoding: aes128gcm<br/>TTL: 60"| push
  worker -->|"Push送信失敗時<br/>users.email宛てにメール送信"| email
  email -->|"家事完了通知メールを配送"| mailbox
  push -->|"Push message配送"| sw
  sw -->|"showNotification()"| os
  os -->|"通知クリック"| sw
  sw -->|"既存画面をfocus<br/>または / をopenWindow"| pwa
```

## 補足

- `Tasks API`、`Task Service`、`Event Dispatcher`、`Notification Service`、`Web Push Adapter`、`Scheduled Handler`、メール通知処理は、同じCloudflare Worker内の処理として表現しています。
- 外部Push Serviceの具体的な事業者名は実装から固定できないため、特定サービス名では表現していません。
- メール送信も特定事業者名を固定せず、外部メール送信サービスとして表現しています。
- `push_subscriptions`にはSubscriptionの`endpoint`、`p256dh`、`auth`が保存されます。
- `notification_jobs`には通知種別、受信者、payload、送信状態、重複防止キー、試行回数が保存されます。
- Push通知が送れない場合は、D1の`users.email`を使ってユーザーBへメール通知します。
