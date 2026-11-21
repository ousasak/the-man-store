import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import ProductCard from "../components/shop/ProductCard.jsx";
import ProductGridSkeleton from "../components/shop/ProductGridSkeleton.jsx";
import { useLanguage } from "../lib/i18n.jsx";
import { resolveImageUrl } from "../lib/images";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function CollectionDetail() {
  const { slug } = useParams();
  const qs = useQuery();
  const nav = useNavigate();
  const { t, language } = useLanguage();

  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ data: [], meta: null });
  const [page, setPage] = useState(Number(qs.get("page") || 1));

  useEffect(() => setPage(Number(qs.get("page") || 1)), [qs]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { data: col } = await api.get(`/collections/${slug}`);
        if (!active) return;
        setCollection(col);

        const params = { page, per_page: 12 };
        if (col?.parent_category) {
          params.parent_category = col.parent_category;
        }

        const productsRes = await api.get("/products", { params });
        if (!active) return;
        setData(productsRes.data || { data: [] });
      } catch {
        if (!active) return;
        setCollection(null);
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
    nav(`/collections/${slug}?${n.toString()}`);
  };

  const title = collection?.name || slug;
  const subtitle =
    language === "km" && collection?.subtitle
      ? collection.subtitle
      : collection?.subtitle || "";

  const heroImage = collection?.image_url ? resolveImageUrl(collection.image_url) : "";

  return (
    <div className="pb-14">
      <section className="relative min-h-[220px] md:min-h-[300px] overflow-hidden bg-zinc-800">
        {heroImage ? (
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            aria-hidden
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/45 to-black/60" />
        <div className="relative container-safe flex min-h-[220px] md:min-h-[300px] flex-col items-center justify-center px-4 py-12 text-center text-white">
          <h1
            className="text-4xl md:text-5xl font-semibold tracking-tight"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-3 text-base md:text-lg text-white/90 font-medium">
              {subtitle}
            </p>
          ) : null}
        </div>
      </section>

      <div className="container-safe py-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h2
            className="text-xl md:text-2xl font-semibold tracking-tight text-zinc-900"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {title}
          </h2>
          <Link
            to="/search"
            className="text-sm font-semibold text-[#6e4a3a] hover:underline whitespace-nowrap"
          >
            All Categories →
          </Link>
        </div>

        {loading ? (
          <ProductGridSkeleton />
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-zinc-500 text-sm">
            More {title} products are coming soon.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}

        {!loading && lastPage > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => changePage(page - 1)}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 text-sm disabled:opacity-40"
            >
              {t("previous") || "Prev"}
            </button>
            <span className="text-sm text-zinc-600">
              {page} / {lastPage}
            </span>
            <button
              type="button"
              disabled={page >= lastPage}
              onClick={() => changePage(page + 1)}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 text-sm disabled:opacity-40"
            >
              {t("next") || "Next"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
