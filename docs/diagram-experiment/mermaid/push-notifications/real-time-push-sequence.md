# 家事完了時のリアルタイムPush通知 シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant userA as ユーザーA
  participant pwaA as ユーザーAのReact PWA
  participant worker as Cloudflare Worker kajibun API
  participant d1 as Cloudflare D1
  participant pushService as 外部Push Service
  participant swB as ユーザーBのpush-sw.js
  participant userB as ユーザーB

  Note over swB,userB: 前提: ユーザーBは通知を有効化済みで、Push SubscriptionがD1に保存済み

  userA->>pwaA: 自分の担当家事で「終わった」を押す
  pwaA->>worker: PATCH /api/tasks/:taskId/complete Cookie付き
  worker->>d1: セッションCookieからユーザーAを認証
  d1-->>worker: ユーザーA
  worker->>d1: 対象家事を取得
  d1-->>worker: 家事

  Note over worker: ユーザーA以外の許可ユーザーを次担当者として決定する
  worker->>d1: tasksを更新 次回期限・次担当者を保存
  d1-->>worker: 更新完了
  worker->>d1: task_eventsへTaskCompletedを保存
  d1-->>worker: eventId付きTaskCompleted

  Note over worker: ユーザーB = TaskCompleted.payload.toAssigneeUserId。つまり家事完了後の次担当者
  worker->>d1: notification_jobsを作成 type=task_completed dedupe_key=task_completed:eventId:recipientUserId
  d1-->>worker: pendingジョブ
  worker->>d1: ユーザーBの有効なpush_subscriptionsを取得
  d1-->>worker: endpoint / p256dh / auth

  alt 有効なSubscriptionがある
    Note over worker: 同じ家事完了APIリクエスト内でVAPID JWT生成とpayload暗号化を行う
    worker->>pushService: Subscription endpointへPOST 暗号化payload Authorization=vapid Content-Encoding=aes128gcm
    pushService-->>worker: 送信結果
    worker->>d1: notification_jobsをsent pending failedのいずれかへ更新
    d1-->>worker: 更新完了
    Note over worker,d1: 再試行可能な失敗はpendingで残り、後続のCron実行で再送される
    Note over worker,d1: 404または410では必要に応じてSubscriptionをrevokedにする
    pushService-->>swB: 送信成功時にPush messageを配送
    swB->>swB: pushイベントでpayloadを読み取る
    swB->>userB: showNotification() 「家事名」が完了しました
  else 有効なSubscriptionがない
    worker->>d1: notification_jobsをfailedへ更新 last_error=no_active_push_subscription
    d1-->>worker: 更新完了
  end

  worker-->>pwaA: 更新後の家事を返す

  opt ユーザーBが通知をクリック
    userB->>swB: 通知をクリック
    swB->>swB: 既存のkajibun画面をfocus。なければ / をopenWindow
  end
```

## 補足

- 家事完了通知は、通知ジョブを保存するだけではなく、家事完了APIの処理内で外部Push Serviceへの送信まで即時試行します。
- 次担当者に有効なPush Subscriptionがない場合でも通知ジョブは作成され、`failed`として記録されます。
- 外部Push Service内部の配送経路や再送処理は、このリポジトリから確認できないため詳細化していません。
