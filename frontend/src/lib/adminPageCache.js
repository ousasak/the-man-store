import { readPageCache, writePageCache } from "./pageContentCache";

/** Default stale-while-revalidate window for admin list/report pages. */
export const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;

export function adminCacheKey(...parts) {
  return `admin:${parts.filter(Boolean).join(":")}`;
}

export function readAdminCache(key, maxAgeMs = ADMIN_CACHE_TTL_MS) {
  return readPageCache(key, { maxAgeMs });
}

export function writeAdminCache(key, data) {
  writePageCache(key, data);
}

/**
 * Hydrate list state from session cache; returns { initialRows, initialLoading }.
 */
export function hydrateAdminListCache(key, maxAgeMs = ADMIN_CACHE_TTL_MS) {
  const cached = readAdminCache(key, maxAgeMs);
  const rows = Array.isArray(cached?.rows)
    ? cached.rows
    : Array.isArray(cached)
      ? cached
      : null;
  return {
    initialRows: rows ?? [],
    initialLoading: !rows?.length,
    cachedPayload: cached,
  };
}
