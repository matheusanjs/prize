/**
 * Resolve a media URL: if it's a path-only ("/uploads/..."), prefix with API origin.
 * Otherwise return as-is (absolute URL or data URL).
 */
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'https://api.marinaprizeclub.com/api/v1').replace(/\/api\/v1$/, '');

export function resolveMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
  return url;
}
