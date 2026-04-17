export interface PushPayload {
  /** Visible title. Empty/undefined => silent push. */
  title?: string;
  /** Visible body. Empty/undefined => silent push. */
  body?: string;
  icon?: string;
  badge?: string;
  /** Collapse / dedupe key (APNs collapseId, Web push Topic). */
  tag?: string;
  /** APNs thread-id used to group notifications in the tray. */
  threadId?: string;
  /** Arbitrary data delivered alongside the notification (deep link, ids, etc.). */
  data?: Record<string, any>;
  actions?: { action: string; title: string; icon?: string }[];
  urgency?: 'very-low' | 'low' | 'normal' | 'high';

  /** Deep-link URL. Stored under data.url as well so the client can route on tap. */
  url?: string;

  /** APNs category identifier — pairs with UNNotificationCategory on the device. */
  category?: string;

  /** true => sends as APNs background push with content-available=1 and no alert payload. */
  silent?: boolean;

  /**
   * When true, APNs uses mutable-content=1 so the app's Notification Service
   * Extension can modify the payload (attach images, localize, decrypt, etc.).
   */
  mutableContent?: boolean;

  /**
   * When set, overrides the default badge count (unread notifications).
   * Pass 0 to explicitly clear the badge.
   */
  badgeCount?: number;

  /** APNs sound file name (or 'default'). Pass null to suppress sound. */
  sound?: string | null;
}
