'use client';

import { useEffect, useRef } from 'react';
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

export function PushManager() {
  const { user } = useAuth();
  const subscribedRef = useRef(false);

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

      // Request permission
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') {
        console.warn('Push notification permission denied');
        return;
      }

      // Register for push
      await PushNotifications.register();

      // Listen for token
      PushNotifications.addListener('registration', async (token) => {
        console.log('APNs device token:', token.value);
        try {
          await api.post('/notifications/push/device-token', {
            token: token.value,
            platform: 'ios',
          });
          subscribedRef.current = true;
        } catch (err) {
          console.error('Failed to register device token:', err);
        }
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration error:', error);
      });

      // Handle received notifications (foreground)
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push received in foreground:', notification);
      });

      // Handle notification tap
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification.data;
        if (data?.url) {
          window.location.href = data.url;
        }
      });
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
