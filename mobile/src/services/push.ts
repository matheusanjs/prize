/**
 * Native iOS/Android push notifications via expo-notifications (APNs/FCM).
 *
 * Responsibilities
 * ──────────────────
 *  • Request runtime permission (iOS 10+ / Android 13+)
 *  • Fetch and refresh the device push token (APNs on iOS, FCM on Android)
 *  • Register the token with our backend (+ platform metadata)
 *  • Register notification categories (interactive actions)
 *  • Handle notifications in three app states:
 *        FOREGROUND  – `addNotificationReceivedListener`
 *        BACKGROUND  – iOS system handles display; response arrives via
 *                      `addNotificationResponseReceivedListener`
 *        TERMINATED  – `getLastNotificationResponseAsync()` on cold start
 *  • Silent / content-available pushes  – iOS delivers without alert; our
 *    received-listener still fires so we can pre-fetch data.
 *  • Deep-links — read `data.url`/`data.route` and route via expo-router
 *  • Badge count — sync from server payload or locally on read
 *  • Analytics — beacon DELIVERED / OPENED / DISMISSED / ACTION
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Localization from 'expo-localization';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';
import { PUSH_CATEGORIES } from './pushCategories';

/**
 * How notifications behave when the app is in the FOREGROUND.
 * On iOS ≥14 we prefer showing as banner + list with sound, but without a badge
 * so we don't double-count (server already sets the badge via `badgeCount`).
 */
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const isSilent = !n.request.content.title && !n.request.content.body;
    if (isSilent) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

export type PushRouter = (url: string) => void;

let cachedToken: string | null = null;
let receivedSub: Notifications.Subscription | null = null;
let responseSub: Notifications.Subscription | null = null;

/** Ensure the iOS/Android permission prompt has been shown and accepted. */
export async function ensurePushPermission(): Promise<boolean> {
  if (!Device.isDevice) return false; // simulators cannot receive real pushes

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowAnnouncements: true,
        allowCriticalAlerts: false,
        provideAppNotificationSettings: true,
      },
    });
    status = req.status;
  }
  return status === 'granted';
}

/** Register interactive categories (Accept/Reject etc). Called once on boot. */
export async function registerCategories() {
  for (const c of PUSH_CATEGORIES) {
    await Notifications.setNotificationCategoryAsync(c.identifier, c.actions, c.options);
  }
}

/** Device metadata sent along with the token. */
function collectMeta() {
  return {
    platform: Platform.OS,
    deviceName: Device.deviceName || undefined,
    osVersion: Device.osVersion || undefined,
    appVersion: Application.nativeApplicationVersion || undefined,
    bundleId: Application.applicationId || undefined,
    locale: Localization.getLocales()?.[0]?.languageTag || undefined,
    timezone: Localization.getCalendars()?.[0]?.timeZone || undefined,
    enabled: true,
  };
}

/** Get APNs/FCM token via Expo and register it on the backend. */
export async function registerForPush(): Promise<string | null> {
  const granted = await ensurePushPermission();
  if (!granted) {
    // Still upsert the row as disabled so the server knows the user opted out
    try {
      if (cachedToken) {
        await api.post('/notifications/push/device-token', {
          token: cachedToken,
          ...collectMeta(),
          enabled: false,
        });
      }
    } catch { /* non-critical */ }
    return null;
  }

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId;

    // On a dev-client / standalone build, getDevicePushTokenAsync returns the
    // RAW APNs token (hex). For the Expo Go sandbox we fall back to the Expo
    // push token, which routes through Expo's APNs gateway.
    let token: string;
    try {
      const devTok = await Notifications.getDevicePushTokenAsync();
      token = typeof devTok.data === 'string' ? devTok.data : JSON.stringify(devTok.data);
    } catch {
      const expoTok = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      token = expoTok.data;
    }

    cachedToken = token;
    await api.post('/notifications/push/device-token', { token, ...collectMeta() });
    return token;
  } catch (err) {
    // Silent — user will see the in-app inbox; retry on next app launch
    return null;
  }
}

/** Set the foreground/background listeners. Returns a cleanup function. */
export function attachNotificationHandlers(router: PushRouter) {
  // Clean up any previous subscriptions (hot reload / re-login)
  receivedSub?.remove();
  responseSub?.remove();

  // FOREGROUND delivery (and silent pushes)
  receivedSub = Notifications.addNotificationReceivedListener(async (notification) => {
    const data = (notification.request.content.data || {}) as any;
    try {
      await api.post('/notifications/push/events/delivered', {
        token: cachedToken ?? undefined,
        notificationId: data?.notificationId,
        messageId: notification.request.identifier,
        data,
      });
    } catch { /* best-effort */ }
  });

  // USER TAPPED a notification (or an action button) — any app state
  responseSub = Notifications.addNotificationResponseReceivedListener(async (response) => {
    const data = (response.notification.request.content.data || {}) as any;
    const isAction =
      response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
      response.actionIdentifier !== Notifications.DISMISS_ACTION_IDENTIFIER;
    const isDismiss = response.actionIdentifier === Notifications.DISMISS_ACTION_IDENTIFIER;
    const endpoint = isDismiss
      ? '/notifications/push/events/dismissed'
      : isAction
      ? '/notifications/push/events/action'
      : '/notifications/push/events/opened';
    try {
      await api.post(endpoint, {
        token: cachedToken ?? undefined,
        notificationId: data?.notificationId,
        messageId: response.notification.request.identifier,
        actionId: isAction ? response.actionIdentifier : undefined,
        data: { ...data, userText: (response as any)?.userText },
      });
    } catch { /* best-effort */ }

    if (!isDismiss) {
      const url = data?.url || data?.route;
      if (typeof url === 'string' && url.length > 0) {
        try { router(url); } catch { /* navigation may fail on cold start */ }
      }
    }
  });

  return () => {
    receivedSub?.remove();
    responseSub?.remove();
    receivedSub = null;
    responseSub = null;
  };
}

/** Handle the notification that launched the app from a TERMINATED state. */
export async function consumeLaunchNotification(router: PushRouter) {
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (!last) return;
    const data = (last.notification.request.content.data || {}) as any;
    const url = data?.url || data?.route;
    if (typeof url === 'string' && url.length > 0) {
      router(url);
    }
  } catch { /* ignore */ }
}

/** Set / clear the app icon badge. */
export async function setBadgeCount(count: number) {
  try { await Notifications.setBadgeCountAsync(Math.max(0, count | 0)); } catch { /* ignore */ }
}

/** Unregister from pushes on logout. */
export async function unregisterFromPush() {
  try {
    if (cachedToken) {
      await api.delete('/notifications/push/device-token', { data: { token: cachedToken } });
    }
  } catch { /* ignore */ }
  cachedToken = null;
  receivedSub?.remove();
  responseSub?.remove();
  receivedSub = null;
  responseSub = null;
  await setBadgeCount(0);
}
