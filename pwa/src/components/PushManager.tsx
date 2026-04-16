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

export function PushManager() {
  const { user } = useAuth();
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!user || subscribedRef.current) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!VAPID_PUBLIC_KEY) return;

    const setup = async () => {
      try {
        // Register service worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        // Check existing subscription
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          // Request permission
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;

          // Subscribe
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
          });
        }

        // Send subscription to backend
        const keys = subscription.toJSON().keys || {};
        await api.post('/notifications/push/subscribe', {
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        });

        subscribedRef.current = true;
      } catch (err) {
        console.error('Push subscription failed:', err);
      }
    };

    // Delay slightly to not block initial render
    const timer = setTimeout(setup, 2000);
    return () => clearTimeout(timer);
  }, [user]);

  return null;
}
