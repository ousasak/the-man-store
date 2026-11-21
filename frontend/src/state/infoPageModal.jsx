import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import ContentPageModal from "../components/info/ContentPageModal.jsx";
import InfoPageBody from "../components/info/InfoPageBody.jsx";

export const INFO_MODAL_KEYS = Object.freeze([
  "support",
  "faq",
  "contact",
  "privacy",
  "terms",
  "cookies",
]);

const PATH_TO_KEY = Object.freeze({
  "/support": "support",
  "/faq": "faq",
  "/contact": "contact",
  "/privacy": "privacy",
  "/terms": "terms",
  "/cookies": "cookies",
});

/**
 * Map a footer/nav href to an info-modal key, or null if it should navigate normally.
 */
export function resolveInfoModalKey(href) {
  if (!href || typeof href !== "string") return null;
  const raw = href.trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) {
    return null;
  }
  try {
    const pathOnly = raw.startsWith("http")
      ? new URL(raw).pathname
      : raw.split("?")[0].split("#")[0];
    const normalized = (pathOnly.replace(/\/+$/, "") || "/").toLowerCase();
    return PATH_TO_KEY[normalized] || null;
  } catch {
    return null;
  }
}

const InfoPageModalContext = createContext(null);

export function InfoPageModalProvider({ children }) {
  const [pageKey, setPageKey] = useState(null);

  const openInfoPage = useCallback((key) => {
    if (!key || !INFO_MODAL_KEYS.includes(key)) return;
    setPageKey(key);
  }, []);

  const openInfoPageFromHref = useCallback(
    (href) => {
      const key = resolveInfoModalKey(href);
      if (!key) return false;
      setPageKey(key);
      return true;
    },
    []
  );

  const closeInfoPage = useCallback(() => setPageKey(null), []);

  const value = useMemo(
    () => ({
      pageKey,
      open: Boolean(pageKey),
      openInfoPage,
      openInfoPageFromHref,
      closeInfoPage,
    }),
    [pageKey, openInfoPage, openInfoPageFromHref, closeInfoPage]
  );

  return (
    <InfoPageModalContext.Provider value={value}>
      {children}
      <ContentPageModal open={Boolean(pageKey)} onClose={closeInfoPage}>
        {pageKey ? <InfoPageBody pageKey={pageKey} onOpenPage={openInfoPage} /> : null}
      </ContentPageModal>
    </InfoPageModalContext.Provider>
  );
}

export function useInfoPageModal() {
  const ctx = useContext(InfoPageModalContext);
  if (!ctx) {
    throw new Error("useInfoPageModal must be used within InfoPageModalProvider");
  }
  return ctx;
}
