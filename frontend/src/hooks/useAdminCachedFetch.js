import { useCallback, useEffect, useRef, useState } from "react";
import { ADMIN_CACHE_TTL_MS, readAdminCache, writeAdminCache } from "../lib/adminPageCache";

/**
 * Stale-while-revalidate fetch for admin pages: show cached data immediately, refresh in background.
 */
export function useAdminCachedFetch(cacheKey, fetcher, { enabled = true, maxAgeMs = ADMIN_CACHE_TTL_MS, deps = [] } = {}) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState(() => readAdminCache(cacheKey, maxAgeMs));
  const [loading, setLoading] = useState(() => readAdminCache(cacheKey, maxAgeMs) == null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return null;
    }
    try {
      const fresh = await fetcherRef.current();
      setData(fresh);
      writeAdminCache(cacheKey, fresh);
      setError(null);
      return fresh;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [cacheKey, enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }

    const cached = readAdminCache(cacheKey, maxAgeMs);
    if (cached != null) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    let cancelled = false;
    (async () => {
      try {
        const fresh = await fetcherRef.current();
        if (cancelled) return;
        setData(fresh);
        writeAdminCache(cacheKey, fresh);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, enabled, maxAgeMs, ...deps]);

  return {
    data,
    setData,
    loading: loading && data == null,
    error,
    refresh,
    hasData: data != null,
  };
}
