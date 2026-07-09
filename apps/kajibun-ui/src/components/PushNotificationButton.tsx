import { useEffect, useState } from 'react';
import { getVapidPublicKey, sendTestPush, subscribePush } from '../lib/api';

type PushState = 'checking' | 'unsupported' | 'blocked' | 'ready' | 'subscribed' | 'sent' | 'error';

export function PushNotificationButton() {
  const [state, setState] = useState<PushState>('checking');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const disabled = isSubmitting || state === 'checking' || state === 'blocked';
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

  async function handleClick() {
    setIsSubmitting(true);
    try {
      if (state === 'subscribed' || state === 'sent') {
        await sendTestPush();
        setState('sent');
        return;
      }

      const publicKey = await getVapidPublicKey();
      if (!publicKey) {
        throw new Error('VAPID public key is not configured');
      }

      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setState('blocked');
        return;
      }
      if (permission !== 'granted') {
        setState('ready');
        return;
      }

      const registration = await navigator.serviceWorker.register('/push-sw.js');
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicKey),
        }));

      await subscribePush(subscription.toJSON());
      setState('subscribed');
    } catch (error) {
      console.error(error);
      setState('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-60"
    >
      {state === 'error' ? '通知設定を再試行' : label}
    </button>
  );
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }

  return output;
}
