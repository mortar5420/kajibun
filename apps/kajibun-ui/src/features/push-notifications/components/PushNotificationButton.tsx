import { useEffect, useState } from 'react';
import { getVapidPublicKey, sendTestPush, subscribePush } from '../api';
import { base64UrlToUint8Array } from '../model/base64';

type PushState = 'checking' | 'unsupported' | 'blocked' | 'ready' | 'subscribed' | 'sent' | 'error';

export function PushNotificationButton() {
  const [state, setState] = useState<PushState>('checking');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);
  const [localNotificationSent, setLocalNotificationSent] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }

    navigator.serviceWorker
      .getRegistration('/push-sw.js')
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? 'subscribed' : 'ready'))
      .catch(() => setState('ready'));
  }, []);

  if (state === 'unsupported') {
    return null;
  }

  const disabled = isSubmitting || isLocalSubmitting || state === 'checking' || state === 'blocked';
  const canSendLocalNotification = state === 'subscribed' || state === 'sent';
  const label =
    state === 'checking'
      ? '通知を確認中'
      : state === 'blocked'
        ? '通知がブロック中'
        : state === 'subscribed' || state === 'sent'
          ? isSubmitting
            ? 'テスト送信中'
            : state === 'sent'
              ? 'テスト送信済み'
              : 'テスト通知を送信'
          : isSubmitting
            ? '通知を設定中'
            : '通知を有効化';
  const localLabel = isLocalSubmitting
    ? '端末通知送信中'
    : localNotificationSent
      ? '端末通知送信済み'
      : '端末通知テスト';

  async function handleClick() {
    setIsSubmitting(true);
    try {
      if (state === 'subscribed' || state === 'sent') {
        await syncPushSubscription();
        await sendTestPush();
        setState('sent');
        return;
      }

      const synced = await syncPushSubscription();
      if (!synced) {
        return;
      }

      setState('subscribed');
    } catch (error) {
      console.error(error);
      setState('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLocalNotificationClick() {
    setIsLocalSubmitting(true);
    setLocalNotificationSent(false);
    try {
      const synced = await syncPushSubscription();
      if (!synced) {
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('kajibun 端末通知テスト', {
        body: '端末側で通知表示できるかのテストです。',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: {
          url: '/',
        },
      });
      setLocalNotificationSent(true);
      setState((current) => (current === 'ready' ? 'subscribed' : current));
    } catch (error) {
      console.error(error);
      setState('error');
    } finally {
      setIsLocalSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-60"
      >
        {state === 'error' ? '通知設定を再試行' : label}
      </button>
      {canSendLocalNotification ? (
        <button
          type="button"
          onClick={handleLocalNotificationClick}
          disabled={disabled}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-60"
        >
          {localLabel}
        </button>
      ) : null}
    </div>
  );

  async function syncPushSubscription(): Promise<boolean> {
    const publicKey = await getVapidPublicKey();
    if (!publicKey) {
      throw new Error('VAPID public key is not configured');
    }

    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission === 'denied') {
      setState('blocked');
      return false;
    }
    if (permission !== 'granted') {
      setState('ready');
      return false;
    }

    const registration = await navigator.serviceWorker.register('/push-sw.js');
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
      }));

    await subscribePush(subscription.toJSON());
    return true;
  }
}
