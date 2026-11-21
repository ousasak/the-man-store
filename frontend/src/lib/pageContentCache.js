const PREFIX = "fs_page_cache_v1:";

function storageKey(key) {
  return `${PREFIX}${key}`;
}

export function readPageCache(key, { maxAgeMs } = {}) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.fetchedAt !== "number") return null;
    if (maxAgeMs != null && Date.now() - parsed.fetchedAt > maxAgeMs) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function writePageCache(key, data) {
  if (typeof window === "undefined" || data == null) return;
  try {
    window.sessionStorage.setItem(
      storageKey(key),
      JSON.stringify({ fetchedAt: Date.now(), data })
    );
  } catch {
    /* ignore quota */
  }
}

export async function fetchWithPageCache(key, fetcher, { maxAgeMs = 10 * 60 * 1000 } = {}) {
  const cached = readPageCache(key, { maxAgeMs });
  if (cached != null) {
    fetcher()
      .then((fresh) => {
        if (fresh != null) writePageCache(key, fresh);
      })
      .catch(() => {});
    return cached;
  }

  const fresh = await fetcher();
  if (fresh != null) writePageCache(key, fresh);
  return fresh;
}
