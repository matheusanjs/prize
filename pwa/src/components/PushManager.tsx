'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth';
import api from '@/services/api';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function isCapacitorNative(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
}

async function collectDeviceMeta() {
  const meta: Record<string, any> = {
    locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  };
  // Capacitor exposes device info on window.Capacitor.Plugins.Device when the
  // plugin is installed natively. We read it defensively so the web build keeps
  // working without the plugin.
  try {
    const Device = (window as any).Capacitor?.Plugins?.Device;
    if (Device?.getInfo) {
      const info = await Device.getInfo();
      meta.deviceName = info?.name || `${info?.manufacturer || ''} ${info?.model || ''}`.trim() || undefined;
      meta.osVersion = info?.osVersion;
    }
    const platform = (window as any).Capacitor?.getPlatform?.();
    if (platform) meta.bundleId = platform;
  } catch { /* plugin not available */ }
  // Fall back to UA-derived iOS version when the plugin isn't there.
  if (!meta.osVersion && typeof navigator !== 'undefined') {
    const m = navigator.userAgent.match(/OS (\d+)[_\.](\d+)(?:[_\.](\d+))?/);
    if (m) meta.osVersion = `${m[1]}.${m[2]}${m[3] ? '.' + m[3] : ''}`;
  }
  return meta;
}

export function PushManager() {
  const { user } = useAuth();
  const router = useRouter();
  const subscribedRef = useRef(false);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || subscribedRef.current) return;

    if (isCapacitorNative()) {
      // ─── Native iOS/Android push via Capacitor ───
      setupNativePush();
    } else {
      // ─── Web Push via Service Worker + VAPID ───
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (!VAPID_PUBLIC_KEY) return;
      const timer = setTimeout(setupWebPush, 2000);
      return () => clearTimeout(timer);
    }
  }, [user]);

  async function setupNativePush() {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Set up listeners first (before register) so token arrives even when the
      // banner triggers register() independently.
      // PushPermissionBanner handles requestPermissions() + register() for first-time users.

      // Listen for token — called every launch; upsert on the backend is idempotent.
      PushNotifications.addListener('registration', async (token) => {
        tokenRef.current = token.value;
        try {
          const meta = await collectDeviceMeta();
          await api.post('/notifications/push/device-token', {
            token: token.value,
            platform: 'ios',
            ...meta,
          });
          subscribedRef.current = true;
        } catch (err) {
          console.error('Failed to register device token:', err);
        }
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration error:', error);
      });

      // Foreground delivery → record DELIVERED analytics (system banner shown by iOS via AppDelegate).
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const data = notification.data || {};
        api.post('/notifications/push/events/delivered', {
          token: tokenRef.current || undefined,
          notificationId: data.notificationId,
          messageId: (notification as any).id,
          data: { foreground: true, type: data.type },
        }).catch(() => { /* analytics best-effort */ });
      });

      // Tap / action → post OPENED and route in-app (no full reload).
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification.data || {};
        api.post('/notifications/push/events/opened', {
          token: tokenRef.current || undefined,
          notificationId: data.notificationId,
          messageId: (action.notification as any).id,
          data: { actionId: action.actionId, type: data.type },
        }).catch(() => {});

        if (data?.url) {
          // Keep the PWA in its single JS context; router preserves cache.
          if (typeof data.url === 'string' && data.url.startsWith('/')) {
            router.push(data.url);
          } else {
            window.location.href = data.url;
          }
        }
      });

      // If permission already granted (returning user), register immediately.
      // First-time users: PushPermissionBanner calls register() after granting.
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'granted') {
        await PushNotifications.register();
      }
    } catch (err) {
      console.error('Native push setup failed:', err);
    }
  }

  async function setupWebPush() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
        });
      }

      const keys = subscription.toJSON().keys || {};
      await api.post('/notifications/push/subscribe', {
        subscription: {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
        },
      });

      subscribedRef.current = true;
    } catch (err) {
      console.error('Push subscription failed:', err);
    }
  }

  return null;
}
