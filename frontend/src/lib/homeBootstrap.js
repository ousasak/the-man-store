import api from "./api";
import { resolveBackendOrigin } from "./backendOrigin";
import { wakeBackend } from "./wakeBackend";

const CACHE_KEY = "fs_home_bootstrap_v1";
const CACHE_TTL_MS = 15 * 60 * 1000;
const RAILWAY_ORIGIN = "https://fitandsleek-official-v2-production.up.railway.app";

export function readCachedBootstrap({ ignoreExpiry = false } = {}) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || typeof parsed.fetchedAt !== "number") return null;
    if (!ignoreExpiry && Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCachedBootstrap(data) {
  if (typeof window === "undefined" || !data) return;
  try {
    window.sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), data })
    );
  } catch {
    /* ignore quota */
  }
}

function isGatewayTimeout(error) {
  const status = error?.response?.status ?? error?.status;
  return status === 504 || status === 502 || status === 503;
}

/** Edge-hosted SPA (Vercel / Netlify / custom domain) — prefer direct Railway for heavy bootstrap. */
function isSplitHostStorefront() {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return (
    host === "fitandsleek.online" ||
    host === "www.fitandsleek.online" ||
    host.endsWith(".netlify.app") ||
    host.endsWith(".vercel.app")
  );
}

async function fetchBootstrapFromUrl(origin) {
  const base = String(origin || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api/homepage/bootstrap`, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    headers: { Accept: "application/json" },
    signal: typeof AbortSignal !== "undefined" ? AbortSignal.timeout(90000) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`Bootstrap HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Bypass Netlify ~26s proxy limit — hit Railway directly. */
async function fetchBootstrapDirect() {
  if (typeof window === "undefined") {
    throw new Error("No window for direct bootstrap");
  }

  try {
    return await fetchBootstrapFromUrl(RAILWAY_ORIGIN);
  } catch (railwayError) {
    const mapped = resolveBackendOrigin()?.replace(/\/$/, "");
    if (mapped && mapped !== RAILWAY_ORIGIN && mapped !== window.location.origin) {
      return fetchBootstrapFromUrl(mapped);
    }
    throw railwayError;
  }
}

export async function fetchHomeBootstrap({ preferCache = true, allowStale = false } = {}) {
  const cached = readCachedBootstrap({ ignoreExpiry: allowStale });
  if (preferCache && cached && !allowStale) {
    return cached;
  }
  if (preferCache && allowStale && cached) {
    return cached;
  }

  // Production split hosts: never wait on a short edge proxy timeout for this endpoint.
  if (isSplitHostStorefront()) {
    try {
      await wakeBackend();
      const data = await fetchBootstrapDirect();
      writeCachedBootstrap(data);
      return data;
    } catch {
      // Fall through to same-origin proxy as last resort.
    }
  }

  try {
    const { data } = await api.get("/homepage/bootstrap", { timeout: 20000 });
    writeCachedBootstrap(data);
    return data;
  } catch (error) {
    if (!isGatewayTimeout(error) && error?.code !== "ECONNABORTED") {
      throw error;
    }
    const data = await fetchBootstrapDirect();
    writeCachedBootstrap(data);
    return data;
  }
}

/** Return cached bootstrap immediately; refresh in background when stale or missing. */
export function hydrateHomeBootstrap({ onUpdate } = {}) {
  const stale = readCachedBootstrap({ ignoreExpiry: true });
  const freshEnough = readCachedBootstrap();

  if (freshEnough) {
    return freshEnough;
  }

  fetchHomeBootstrap({ preferCache: false })
    .then((data) => {
      if (typeof onUpdate === "function") onUpdate(data);
    })
    .catch(() => {});

  return stale;
}

export function clearHomeBootstrapCache() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
