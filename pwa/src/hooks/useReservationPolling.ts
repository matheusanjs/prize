import { useEffect, useRef, useCallback } from 'react';

interface UseReservationPollingOptions {
  enabled: boolean;
  intervalMs?: number;
  onPoll: () => Promise<void>;
}

/**
 * Polls the provided callback at the specified interval.
 * Skips polling if the tab is not visible (Page Visibility API).
 */
export function useReservationPolling({
  enabled,
  intervalMs = 30_000, // 30 seconds
  onPoll,
}: UseReservationPollingOptions) {
  const savedCallback = useRef(onPoll);
  savedCallback.current = onPoll;

  useEffect(() => {
    if (!enabled) return;

    const poll = () => {
      if (document.visibilityState === 'visible') {
        savedCallback.current();
      }
    };

    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
}
