import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import {
  STOREFRONT_GENDER_OPTIONS,
  buildSectionOptionsFromHomepage,
  sortSizes,
} from "../lib/storefrontProductFilters.js";
import { useHomepageSettings } from "../state/homepageSettings.jsx";
import { useStorefrontBootstrap } from "../state/storefrontBootstrap.jsx";
import { readPageCache, writePageCache } from "../lib/pageContentCache.js";

const FILTER_OPTIONS_CACHE_KEY = "product-filter-options";

export function useStorefrontFilterSections() {
  const { settings: homepageSettings } = useHomepageSettings();
  const { categories: bootstrapCategories, brands: bootstrapBrands } = useStorefrontBootstrap();
  const [categories, setCategories] = useState(() => bootstrapCategories || []);
  const [brands, setBrands] = useState(() => bootstrapBrands || []);
  const [attributeOptions, setAttributeOptions] = useState(() =>
    readPageCache(FILTER_OPTIONS_CACHE_KEY) || {
      colors: [],
      sizes: [],
      price_min: null,
      price_max: null,
    }
  );

  useEffect(() => {
    if (bootstrapCategories?.length) setCategories(bootstrapCategories);
    if (bootstrapBrands?.length) setBrands(bootstrapBrands);
  }, [bootstrapCategories, bootstrapBrands]);

  useEffect(() => {
    if (bootstrapCategories?.length && bootstrapBrands?.length) return;

    let cancelled = false;
    (async () => {
      try {
        const tasks = [];
        if (!bootstrapCategories?.length) tasks.push(api.get("/categories"));
        if (!bootstrapBrands?.length) tasks.push(api.get("/brands"));
        if (!tasks.length) return;

        const results = await Promise.all(tasks);
        if (cancelled) return;

        let index = 0;
        if (!bootstrapCategories?.length) {
          const catRes = results[index++];
          const catList = Array.isArray(catRes.data) ? catRes.data : catRes.data?.data || [];
          setCategories(Array.isArray(catList) ? catList : []);
        }
        if (!bootstrapBrands?.length) {
          const brandRes = results[index];
          const brandList = brandRes.data?.data || brandRes.data || [];
          setBrands(Array.isArray(brandList) ? brandList : []);
        }
      } catch {
        if (!cancelled) {
          if (!bootstrapCategories?.length) setCategories([]);
          if (!bootstrapBrands?.length) setBrands([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrapCategories, bootstrapBrands]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.get("/products/filter-options");
        if (cancelled) return;
        const next = {
          colors: data?.colors || [],
          sizes: sortSizes(data?.sizes || []),
          price_min: data?.price_min ?? null,
          price_max: data?.price_max ?? null,
        };
        setAttributeOptions(next);
        writePageCache(FILTER_OPTIONS_CACHE_KEY, next);
      } catch {
        /* keep cached / empty defaults */
      }
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const priceBounds = useMemo(() => {
    const min = attributeOptions.price_min;
    const max = attributeOptions.price_max;
    if (min == null || max == null || max <= min) return null;
    return { min: Math.floor(min), max: Math.ceil(max) };
  }, [attributeOptions.price_min, attributeOptions.price_max]);

  const filterSections = useMemo(() => {
    const sectionOpts = buildSectionOptionsFromHomepage(homepageSettings);
    const categoryOpts = categories.map((c) => ({
      value: String(c.id),
      label: c.name || "—",
    }));
    const brandOpts = brands.map((b) => ({
      value: String(b.id),
      label: b.name || "—",
    }));
    const colorOpts = (attributeOptions.colors || []).map((color) => ({
      value: color,
      label: color,
    }));
    const sizeOpts = (attributeOptions.sizes || []).map((size) => ({
      value: size,
      label: size,
    }));

    const sections = [
      { id: "gender", title: "Gender", options: STOREFRONT_GENDER_OPTIONS },
      ...(sectionOpts.length
        ? [{ id: "section", title: "Section / type", options: sectionOpts }]
        : []),
      ...(categoryOpts.length ? [{ id: "category", title: "Categories", options: categoryOpts }] : []),
      ...(brandOpts.length ? [{ id: "brand", title: "Brand", options: brandOpts }] : []),
      ...(colorOpts.length ? [{ id: "color", title: "Color", options: colorOpts }] : []),
      ...(sizeOpts.length ? [{ id: "size", title: "Size", options: sizeOpts }] : []),
    ];

    return sections;
  }, [homepageSettings, categories, brands, attributeOptions]);

  return { categories, brands, filterSections, priceBounds };
}
