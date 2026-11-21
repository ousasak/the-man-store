import { isBundledSiteLogo } from "./siteLogo.js";

/** Storefront header defaults — shown instantly before /homepage-settings API responds. */
export const DEFAULT_HEADER_SETTINGS = {
  logo_text: "THE MAN STORE",
  logo_url: "/logo.png",
  background_color: "#0B0F17",
  background_image: "",
  text_color: "#ffffff",
  search_placeholder: "Search products...",
  search_enabled: true,
  cart_enabled: true,
  wishlist_enabled: true,
  language_enabled: true,
  free_delivery_icon: "🚚",
  free_delivery_text: "Free delivery on orders above $40",
  nav_visibility: {
    newIn: true,
    discounts: true,
    women: true,
    men: true,
    sale: true,
  },
  custom_nav: [],
  left_menu: [],
  nav_labels: {},
};

export function mergeHeaderSettings(apiHeader) {
  const merged = {
    ...DEFAULT_HEADER_SETTINGS,
    ...(apiHeader && typeof apiHeader === "object" ? apiHeader : {}),
    nav_visibility: {
      ...DEFAULT_HEADER_SETTINGS.nav_visibility,
      ...(apiHeader?.nav_visibility || {}),
    },
    nav_labels: {
      ...DEFAULT_HEADER_SETTINGS.nav_labels,
      ...(apiHeader?.nav_labels || {}),
    },
  };

  if (isBundledSiteLogo(merged.logo_url)) {
    merged.logo_url = DEFAULT_HEADER_SETTINGS.logo_url;
  }

  // Migrate legacy green colors to modern Obsidian/Charcoal brand background
  const bg = (merged.background_color || "").toLowerCase();
  if (
    !bg ||
    bg === "#6e8b7e" ||
    bg === "#64756b" ||
    bg === "#37a169" ||
    merged.logo_text === "FIT&SLEEK" ||
    merged.logo_text === "FitandSleek"
  ) {
    if (!bg || bg === "#6e8b7e" || bg === "#64756b" || bg === "#37a169") {
      merged.background_color = DEFAULT_HEADER_SETTINGS.background_color;
    }
    if (merged.logo_text === "FIT&SLEEK" || merged.logo_text === "FitandSleek") {
      merged.logo_text = DEFAULT_HEADER_SETTINGS.logo_text;
    }
  }

  return merged;
}
