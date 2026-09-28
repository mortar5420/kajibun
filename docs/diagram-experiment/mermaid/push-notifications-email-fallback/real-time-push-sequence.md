# 家事完了時のリアルタイムPush通知 シーケンス図（メールフォールバック追加）

```mermaid
sequenceDiagram
  autonumber
  participant userA as ユーザーA
  participant pwaA as ユーザーAのReact PWA
  participant worker as Cloudflare Worker kajibun API
  participant d1 as Cloudflare D1
  participant pushService as 外部Push Service
  participant emailService as 外部メール送信サービス
  participant swB as ユーザーBのpush-sw.js
  participant userB as ユーザーB

  Note over swB,userB: 前提: ユーザーBは通知を有効化済みの場合、Push SubscriptionがD1に保存済み

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

  alt 有効なSubscriptionがありPush送信が成功
    Note over worker: 同じ家事完了APIリクエスト内でVAPID JWT生成とpayload暗号化を行う
    worker->>pushService: Subscription endpointへPOST 暗号化payload Authorization=vapid Content-Encoding=aes128gcm
    pushService-->>worker: 成功
    worker->>d1: notification_jobsをsentへ更新
    d1-->>worker: 更新完了
    pushService-->>swB: Push messageを配送
    swB->>swB: pushイベントでpayloadを読み取る
    swB->>userB: showNotification() 「家事名」が完了しました
  else 有効なSubscriptionがあるがPush送信が失敗
    Note over worker: 同じ家事完了APIリクエスト内でVAPID JWT生成とpayload暗号化を行う
    worker->>pushService: Subscription endpointへPOST 暗号化payload Authorization=vapid Content-Encoding=aes128gcm
    pushService-->>worker: 失敗
    worker->>d1: notification_jobsをpendingまたはfailedへ更新
    d1-->>worker: 更新完了
    worker->>d1: ユーザーBのemailを取得
    d1-->>worker: users.email
    worker->>emailService: 家事完了通知メールを送信
    emailService-->>userB: メールで通知
    Note over worker,d1: 再試行可能なPush失敗はpendingで残り、後続のCron実行で再送される
    Note over worker,d1: 404または410では必要に応じてSubscriptionをrevokedにする
  else 有効なSubscriptionがない
    worker->>d1: notification_jobsをfailedへ更新 last_error=no_active_push_subscription
    d1-->>worker: 更新完了
    worker->>d1: ユーザーBのemailを取得
    d1-->>worker: users.email
    worker->>emailService: 家事完了通知メールを送信
    emailService-->>userB: メールで通知
  end

  worker-->>pwaA: 更新後の家事を返す

  opt ユーザーBが通知をクリック
    userB->>swB: 通知をクリック
    swB->>swB: 既存のkajibun画面をfocus。なければ / をopenWindow
  end
```

## 補足

- 家事完了通知は、通知ジョブを保存するだけではなく、家事完了APIの処理内で外部Push Serviceへの送信まで即時試行します。
- Push送信に失敗した場合、または次担当者に有効なPush Subscriptionがない場合は、ユーザーBのメールアドレス宛てに家事完了通知メールを送ります。
- 次担当者に有効なPush Subscriptionがない場合でも通知ジョブは作成され、`failed`として記録されます。
- 外部Push Service内部の配送経路や再送処理は、このリポジトリから確認できないため詳細化していません。
- メール送信サービスの具体的な事業者名は固定せず、外部メール送信サービスとして表現しています。
