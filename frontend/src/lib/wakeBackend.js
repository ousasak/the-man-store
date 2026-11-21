import { resolveApiBaseUrl } from "./backendOrigin";

const WARM_UNTIL_KEY = "fs_backend_warm_until";
/** Railway/Neon stay warm longer than Render Free — avoid re-pinging every couple minutes. */
const WARM_TTL_MS = 15 * 60 * 1000;
/** Short probe only; do not block storefront navigation for tens of seconds. */
const WAKE_ATTEMPTS = 3;
const WAKE_DELAYS_MS = [0, 800, 2000];
const PING_TIMEOUT_MS = 8000;

let wakePromise = null;

function healthUrl() {
  return `${resolveApiBaseUrl().replace(/\/$/, "")}/health`;
}

function isWarmInSession() {
  if (typeof window === "undefined") return false;
  try {
    const until = Number(window.sessionStorage.getItem(WARM_UNTIL_KEY) || 0);
    return until > Date.now();
  } catch {
    return false;
  }
}

function markWarmInSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(WARM_UNTIL_KEY, String(Date.now() + WARM_TTL_MS));
  } catch {
    /* ignore */
  }
}

async function pingHealthOnce() {
  const url = healthUrl();
  const res = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    headers: { Accept: "application/json" },
    signal: typeof AbortSignal !== "undefined" ? AbortSignal.timeout(PING_TIMEOUT_MS) : undefined,
  });
  if (!res.ok) return false;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return false;
  return true;
}

/**
 * Best-effort health ping before catalogue calls.
 * Returns quickly when the API is already warm; never waits for a full cold-start budget.
 */
export function wakeBackend({ force = false } = {}) {
  if (typeof window === "undefined") return Promise.resolve();
  if (!force && isWarmInSession()) return Promise.resolve();

  if (!wakePromise) {
    wakePromise = (async () => {
      for (let attempt = 0; attempt < WAKE_ATTEMPTS; attempt += 1) {
        const delay = WAKE_DELAYS_MS[attempt] ?? 2000;
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
        try {
          if (await pingHealthOnce()) {
            markWarmInSession();
            return;
          }
        } catch {
          /* cold start / network */
        }
      }
    })().finally(() => {
      wakePromise = null;
    });
  }
  return wakePromise;
}
