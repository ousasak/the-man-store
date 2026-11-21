import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  fetchHomeBootstrap,
  readCachedBootstrap,
} from "../lib/homeBootstrap.js";
import { wakeBackend } from "../lib/wakeBackend.js";
import { writeCachedSettings } from "./homepageSettings.jsx";
import { resolveImageUrl } from "../lib/images.js";

const StorefrontBootstrapContext = createContext(null);

function mapBootstrapSections(sectionsPayload) {
  const mapped = {};
  Object.entries(sectionsPayload || {}).forEach(([key, items]) => {
    mapped[key] = {
      loading: false,
      items: Array.isArray(items) ? items : [],
    };
  });
  return mapped;
}

function flattenSectionProducts(sections, keys) {
  const out = [];
  const seen = new Set();
  for (const key of keys) {
    const items = sections?.[key]?.items || sections?.[key] || [];
    for (const item of items) {
      const id = item?.id;
      if (id != null && seen.has(id)) continue;
      if (id != null) seen.add(id);
      out.push(item);
    }
  }
  return out;
}

function buildHeaderMenuFromBootstrap(bootstrap) {
  if (!bootstrap) {
    return { newProduct: [], trending: [], discounts: [], brands: [] };
  }

  const sections = bootstrap.sections || {};
  const recommended = Array.isArray(bootstrap.recommended) ? bootstrap.recommended : [];
  const newIn = Array.isArray(sections.newIn) ? sections.newIn : [];
  const discounts = Array.isArray(sections.discounts) ? sections.discounts : [];
  const pool = [...newIn, ...recommended, ...flattenSectionProducts(sections, Object.keys(sections))];

  const toMenuItem = (p) => ({
    label: p?.name || "",
    to: p?.slug ? `/p/${p.slug}` : "/search",
    image: p?.image_url ? resolveImageUrl(p.image_url) : null,
  });

  const newProductItems = (newIn.length ? newIn : pool).slice(0, 6).map(toMenuItem);
  const trendingItems = (recommended.length ? recommended : pool.slice(6)).slice(0, 6).map(toMenuItem);
  const discountItems = discounts.slice(0, 6).map(toMenuItem);
  const brandItems = (Array.isArray(bootstrap.brands) ? bootstrap.brands : []).map((b) => ({
    label: b.name,
    to: b.slug ? `/brands/${b.slug}` : `/search?q=${encodeURIComponent(b.name)}`,
    image: b.logo_url || null,
  }));

  return {
    newProduct: newProductItems,
    trending: trendingItems.length ? trendingItems : newProductItems,
    discounts: discountItems,
    brands: brandItems,
  };
}

export function StorefrontBootstrapProvider({ children }) {
  const [bootstrap, setBootstrap] = useState(() => readCachedBootstrap({ ignoreExpiry: true }));
  const [sections, setSections] = useState(() =>
    mapBootstrapSections(readCachedBootstrap({ ignoreExpiry: true })?.sections)
  );
  const [ready, setReady] = useState(() => Boolean(readCachedBootstrap({ ignoreExpiry: true })));
  const [refreshing, setRefreshing] = useState(false);

  const applyBootstrap = useCallback((data) => {
    if (!data) return;
    setBootstrap(data);
    setSections(mapBootstrapSections(data.sections));
    setReady(true);
    if (data.settings) {
      writeCachedSettings(data.settings);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchHomeBootstrap({ preferCache: false });
      applyBootstrap(data);
    } catch {
      /* keep stale cache */
    } finally {
      setRefreshing(false);
    }
  }, [applyBootstrap]);

  useEffect(() => {
    const stale = readCachedBootstrap({ ignoreExpiry: true });
    if (stale) {
      applyBootstrap(stale);
    }

    let cancelled = false;
    (async () => {
      const hasFresh = Boolean(readCachedBootstrap());
      const needsSpinner = !stale;
      if (needsSpinner) setRefreshing(true);
      try {
        // Prefer session cache; only hit the network when TTL expired or empty.
        // On Netlify hosts, fetchHomeBootstrap uses Railway directly (avoids 504).
        if (!hasFresh) {
          await wakeBackend();
        }
        if (cancelled) return;
        const data = await fetchHomeBootstrap({ preferCache: true });
        if (!cancelled) applyBootstrap(data);

        // Background refresh when we served a fresh cache — keep homepage warm.
        if (hasFresh && !cancelled) {
          fetchHomeBootstrap({ preferCache: false })
            .then((fresh) => {
              if (!cancelled) applyBootstrap(fresh);
            })
            .catch(() => {});
        }
      } catch {
        /* keep stale cache */
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyBootstrap]);

  const headerMenu = useMemo(() => buildHeaderMenuFromBootstrap(bootstrap), [bootstrap]);

  const value = useMemo(
    () => ({
      bootstrap,
      ready,
      refreshing,
      sections,
      settings: bootstrap?.settings ?? null,
      brands: bootstrap?.brands ?? [],
      heroBanners: bootstrap?.hero_banners ?? [],
      promoBanners: bootstrap?.promo_banners ?? [],
      collections: bootstrap?.collections ?? [],
      categories: bootstrap?.categories ?? [],
      recommended: bootstrap?.recommended ?? [],
      headerMenu,
      refresh,
    }),
    [bootstrap, ready, refreshing, sections, headerMenu, refresh]
  );

  return (
    <StorefrontBootstrapContext.Provider value={value}>
      {children}
    </StorefrontBootstrapContext.Provider>
  );
}

export function useStorefrontBootstrap() {
  const ctx = useContext(StorefrontBootstrapContext);
  if (!ctx) {
    throw new Error("useStorefrontBootstrap must be used within StorefrontBootstrapProvider");
  }
  return ctx;
}

export { mapBootstrapSections };
