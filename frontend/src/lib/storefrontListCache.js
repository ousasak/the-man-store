import { readPageCache, writePageCache } from "./pageContentCache.js";

const LIST_PREFIX = "plp:";

export function readProductListCache(params) {
  return readPageCache(`${LIST_PREFIX}${stableKey(params)}`, { maxAgeMs: 10 * 60 * 1000 });
}

export function writeProductListCache(params, data) {
  writePageCache(`${LIST_PREFIX}${stableKey(params)}`, data);
}

export function readProductDetailCache(slug) {
  return readPageCache(`product:${slug}`, { maxAgeMs: 15 * 60 * 1000 });
}

export function writeProductDetailCache(slug, data) {
  writePageCache(`product:${slug}`, data);
}

function stableKey(params) {
  const entries = Object.entries(params || {})
    .filter(([, v]) => v != null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}
