const TTL = 5 * 60 * 1000; // 5 minutes

interface CalendarCacheEntry {
  reservations: unknown[];
  timestamp: number;
  version: 1;
}

// Per-boat cache key to prevent cross-boat data leakage
function cacheKey(boatId: string): string {
  return `reservation_calendar_cache_${boatId}`;
}

export function saveCalendarCache(reservations: unknown[], boatId: string) {
  try {
    const entry: CalendarCacheEntry = {
      reservations,
      timestamp: Date.now(),
      version: 1,
    };
    localStorage.setItem(cacheKey(boatId), JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — fail silently
  }
}

export function loadCalendarCache(boatId?: string): unknown[] | null {
  if (!boatId) {
    // If no boatId specified, look for the most recent cached entry
    try {
      let best: CalendarCacheEntry | null = null;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('reservation_calendar_cache_')) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const entry: CalendarCacheEntry = JSON.parse(raw);
        if (Date.now() - entry.timestamp > TTL) {
          localStorage.removeItem(key);
          continue;
        }
        if (!best || entry.timestamp > best.timestamp) best = entry;
      }
      return best ? best.reservations : null;
    } catch {
      return null;
    }
  }

  try {
    const raw = localStorage.getItem(cacheKey(boatId));
    if (!raw) return null;
    const entry: CalendarCacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > TTL) {
      localStorage.removeItem(cacheKey(boatId));
      return null;
    }
    return entry.reservations;
  } catch {
    return null;
  }
}
