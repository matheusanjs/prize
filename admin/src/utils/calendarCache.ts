const TTL = 5 * 60 * 1000; // 5 minutes

interface CalendarCacheEntry {
  reservations: unknown[];
  timestamp: number;
  version: 1;
}

const STORAGE_KEY = 'reservation_calendar_cache_all';

export function saveCalendarCache(reservations: unknown[]) {
  try {
    const entry: CalendarCacheEntry = {
      reservations,
      timestamp: Date.now(),
      version: 1,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — fail silently
  }
}

export function loadCalendarCache(): unknown[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const entry: CalendarCacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > TTL) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return entry.reservations;
  } catch {
    return null;
  }
}
