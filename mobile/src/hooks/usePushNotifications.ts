import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import {
  registerCategories,
  registerForPush,
  attachNotificationHandlers,
  consumeLaunchNotification,
  setBadgeCount,
  unregisterFromPush,
} from '../services/push';

/**
 * Wire native push notifications into the app lifecycle.
 *
 * – When authenticated, requests permission, registers the APNs/FCM token
 *   on the backend, installs foreground/response listeners, and consumes
 *   the launch notification if the app was started by tapping one.
 * – When unauthenticated, revokes the token on the server and clears the
 *   badge so the next user on this device starts clean.
 */
export function usePushNotifications(isAuthenticated: boolean) {
  const router = useRouter();
  const cleanupRef = useRef<(() => void) | null>(null);
  const bootedRef = useRef(false);

  // Register categories exactly once for the process lifetime
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    registerCategories().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!isAuthenticated) return;

      // Route handler used by both foreground/background taps and cold-start
      const route = (url: string) => {
        // Accept plain paths ("/reservations"), deep-link URLs ("prizeclube://x")
        // or fully-qualified HTTPS universal links.
        try {
          if (url.startsWith('prizeclube://')) {
            router.push(url.replace('prizeclube://', '/') as any);
          } else if (url.startsWith('http')) {
            const u = new URL(url);
            router.push((u.pathname + u.search) as any);
          } else {
            router.push(url as any);
          }
        } catch {
          /* noop */
        }
      };

      // 1) Install listeners first so nothing gets missed
      const cleanup = attachNotificationHandlers(route);
      cleanupRef.current = cleanup;

      // 2) Register device token with the backend (idempotent upsert)
      await registerForPush().catch(() => null);

      // 3) If the app was cold-started by a notification, route now
      if (!cancelled) await consumeLaunchNotification(route);
    }

    void boot();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [isAuthenticated, router]);

  // Clear badge whenever auth flips off
  useEffect(() => {
    if (!isAuthenticated) {
      void unregisterFromPush();
      void setBadgeCount(0);
    }
  }, [isAuthenticated]);
}
