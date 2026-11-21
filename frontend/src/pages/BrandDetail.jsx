import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import ProductCard from "../components/shop/ProductCard.jsx";
import ProductGridSkeleton from "../components/shop/ProductGridSkeleton.jsx";
import { useLanguage } from "../lib/i18n.jsx";
import { resolveImageUrl } from "../lib/images";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function BrandDetail() {
  const { slug } = useParams();
  const qs = useQuery();
  const nav = useNavigate();
  const { t } = useLanguage();

  const [brand, setBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ data: [], meta: null });
  const [page, setPage] = useState(Number(qs.get("page") || 1));

  useEffect(() => setPage(Number(qs.get("page") || 1)), [qs]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [brandRes, productsRes] = await Promise.all([
          api.get(`/brands/${slug}`),
          api.get("/products", { params: { brand_slug: slug, page } }),
        ]);
        if (!active) return;
        setBrand(brandRes.data);
        setData(productsRes.data || { data: [] });
      } catch {
        if (!active) return;
        setBrand(null);
        setData({ data: [] });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug, page]);

  const products = useMemo(() => data?.data || [], [data]);
  const meta = data?.meta || null;
  const lastPage = data?.last_page || meta?.last_page || 1;

  const changePage = (nextPage) => {
    const n = new URLSearchParams(qs);
    n.set("page", String(nextPage));
    nav(`/brands/${slug}?${n.toString()}`);
  };

  return (
    <div className="container-safe py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            {t("brand")}: {brand?.name || slug}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {t("productsByBrand")}
          </p>
        </div>
        {brand?.logo_url && (
          <img
            src={resolveImageUrl(brand.logo_url)}
            alt={brand.name}
            className="h-12 w-auto object-contain"
            loading="lazy"
          />
        )}
      </div>

      <div className="mt-6">
        {loading ? (
          <ProductGridSkeleton />
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500">
            {t("noProductsFound")}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>

      {!loading && lastPage > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => changePage(page - 1)}
            className="fs-pill disabled:opacity-40"
          >
            {t("prev")}
          </button>
          <span className="text-sm text-zinc-600">
            {page} / {lastPage}
          </span>
          <button
            type="button"
            disabled={page >= lastPage}
            onClick={() => changePage(page + 1)}
            className="fs-pill disabled:opacity-40"
          >
            {t("next")}
          </button>
        </div>
      )}
    </div>
  );
}
