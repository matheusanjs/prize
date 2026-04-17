'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Stale-while-revalidate persistence primitive.
 *
 * `useCachedState` is a drop-in replacement for `useState<T>(initial)` that
 * hydrates synchronously from localStorage on first render and writes back
 * on every state change. When a cached value exists it is returned on the
 * first render (no flash of empty UI); the caller is expected to kick off
 * the server fetch on mount and overwrite the state with fresh data.
 *
 * Use it for any piece of page-level data (lists, maps, objects) that's
 * small enough to round-trip through JSON and that the user expects to see
 * instantly when they return to the page.
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *   const [shares, setShares] = useCachedState<Share[]>('pc:boats:shares', []);
 *   const hasCache = shares.length > 0;
 *
 *   useEffect(() => {
 *     // Don't block the UI with a spinner if we already have cached data.
 *     if (!hasCache) setLoading(true);
 *     getShares().then(r => setShares(r.data)).finally(() => setLoading(false));
 *   }, []);
 */
export function useCachedState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  // Guard against running the writer on the very first render (where value
  // is identical to what we just read). Saves one synchronous write.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) { firstRenderRef.current = false; return; }
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch { /* quota or private mode — ignore */ }
  }, [key, state]);

  return [state, setState];
}

/** Read a cached value once, outside a React component. Returns `fallback` on miss. */
export function readCached<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

/** Write a value to the cache. Silently ignores storage errors. */
export function writeCached<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/** Returns true when the key already holds a non-empty cached value. */
export function hasCached(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return false;
    // Treat empty array / empty object / null / undefined as "no cache"
    const parsed = JSON.parse(raw);
    if (parsed == null) return false;
    if (Array.isArray(parsed)) return parsed.length > 0;
    if (typeof parsed === 'object') return Object.keys(parsed).length > 0;
    return true;
  } catch { return false; }
}

/**
 * Convenience wrapper that bundles a fetcher with the cache.
 *
 *   const { data, loading, refreshing, reload } = useCachedResource(
 *     'pc:maintenance:list',
 *     async () => (await getMaintenances()).data,
 *     [] as Item[],
 *   );
 */
export function useCachedResource<T>(key: string, fetcher: () => Promise<T>, initial: T) {
  const [data, setData] = useCachedState<T>(key, initial);
  const hadCacheAtMount = useRef(hasCached(key));
  const [loading, setLoading] = useState<boolean>(!hadCacheAtMount.current);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const reload = useCallback(async () => {
    if (hadCacheAtMount.current) setRefreshing(true); else setLoading(true);
    try {
      const next = await fetcher();
      setData(next);
    } catch { /* preserve previous/cached data on error */ }
    setLoading(false);
    setRefreshing(false);
    hadCacheAtMount.current = true; // subsequent reloads are refreshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, setData, loading, refreshing, reload };
}
