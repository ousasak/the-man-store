import bundledLogoSvg from "@/assets/logo.svg?raw";

/** Inlined wide banner logo (vector) — matches /logo.png, sharp at any size. */
export const BUNDLED_SITE_LOGO_SVG = bundledLogoSvg;

/** Data URI for <img> tags (invoices, auth dialogs, etc.). */
export const BUNDLED_SITE_LOGO_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(bundledLogoSvg)}`;

/** Public path for the default storefront logo. */
export const SITE_LOGO_WEB_PATH = "/logo.png";

const SITE_LOGO_BASENAMES = new Set([
  "logo.png",
  "logo.svg",
  "logo-circle.png",
  "logo-circle.svg",
]);

function pathnameOf(url) {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    return new URL(url, base).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "";
  }
}

export function isBundledSiteLogo(src) {
  if (!src) return true;
  const trimmed = String(src).trim();
  if (!trimmed || trimmed === SITE_LOGO_WEB_PATH) return true;
  if (trimmed.startsWith("data:image/svg+xml")) return true;
  const base = pathnameOf(trimmed).split("/").pop()?.toLowerCase() || "";
  return SITE_LOGO_BASENAMES.has(base);
}

export function normalizeSiteLogoForWeb(src) {
  if (!src || isBundledSiteLogo(src)) return SITE_LOGO_WEB_PATH;
  return String(src).trim();
}

export function siteStaticLogoPath() {
  return BUNDLED_SITE_LOGO_SRC;
}

export function resolveBundledLogoUrl(src) {
  const trimmed = src ? String(src).trim() : "";
  if (trimmed && !isBundledSiteLogo(trimmed)) return trimmed;
  return BUNDLED_SITE_LOGO_SRC;
}

export function ensureDocumentBrandAssets() {
  /* no-op: index.html + public/ favicons on the storefront CDN */
}
