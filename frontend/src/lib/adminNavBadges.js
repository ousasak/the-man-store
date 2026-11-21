import api from "./api.js";
import { ADMIN_CACHE_TTL_MS, readAdminCache, writeAdminCache } from "./adminPageCache.js";

const BADGES_CACHE_KEY = "admin:nav-badges:v1";

/** Throttle badge polls so HMR/remounts do not spam the console when the API is down. */
let lastAttemptAt = 0;
const MIN_ATTEMPT_MS = 30_000;

export function readCachedAdminNavBadges() {
  return readAdminCache(BADGES_CACHE_KEY, ADMIN_CACHE_TTL_MS);
}

/**
 * @returns {Promise<{ orders: number, messages: number } | null>}
 */
export async function fetchAdminNavBadges({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastAttemptAt < MIN_ATTEMPT_MS) {
    return readCachedAdminNavBadges();
  }
  lastAttemptAt = now;

  try {
    const { data } = await api.get("/admin/nav-badges");
    const badges = {
      orders: Number(data?.orders) || 0,
      messages: Number(data?.messages) || 0,
    };
    writeAdminCache(BADGES_CACHE_KEY, badges);
    return badges;
  } catch {
    return readCachedAdminNavBadges();
  }
}
