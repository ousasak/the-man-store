import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { resolveImageUrl } from "../../lib/images";
import { useCatalogAvailability } from "../../state/catalogAvailability.jsx";
import { useLanguage } from "../../lib/i18n.jsx";

function collectionHref(c) {
  if (c?.link) return c.link;
  if (c?.slug) return `/collections/${c.slug}`;
  return "/search";
}

function Tile({ title, subtitle, to, image, featured = false }) {
  const resolved = image ? resolveImageUrl(image) : "";
  const [imageFailed, setImageFailed] = useState(!resolved);

  useEffect(() => {
    setImageFailed(!resolved);
  }, [resolved]);

  const showImage = Boolean(resolved) && !imageFailed;

  return (
    <Link
      to={to}
      className={`group relative block overflow-hidden rounded-2xl bg-zinc-200 ${
        featured ? "h-full min-h-[280px] md:min-h-[420px]" : "min-h-[160px] md:min-h-[200px]"
      }`}
    >
      {showImage ? (
        <img
          src={resolved}
          alt={title}
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
      ) : (
        <div
          className="absolute inset-0 bg-gradient-to-br from-zinc-300 via-zinc-200 to-zinc-100"
          aria-hidden
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 md:p-5 text-white">
        <h3
          className={`font-semibold tracking-tight drop-shadow ${
            featured ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"
          }`}
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-1 text-sm md:text-base text-white/90 font-medium">{subtitle}</p>
        ) : null}
      </div>
    </Link>
  );
}

/** Explore block below Discounts — up to 3 tiles (1 large + 2 stacked). */
export default function ExploreCollectionTiles({ initialCollections, skipFetch = false }) {
  const { infrastructureDegraded } = useCatalogAvailability();
  const { t, language } = useLanguage();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(() => !(skipFetch && Array.isArray(initialCollections)));
  const [fetchFailed, setFetchFailed] = useState(false);

  const mapCollections = (items) =>
    (items || [])
      .filter((c) => c.placement === "explore")
      .slice(0, 3)
      .map((c) => ({
        id: c.id,
        name: c.name,
        subtitle: c.subtitle || "",
        slug: c.slug,
        link: collectionHref(c),
        image: c.image_url,
      }));

  useEffect(() => {
    if (skipFetch && Array.isArray(initialCollections)) {
      setCollections(mapCollections(initialCollections));
      setLoading(false);
      return;
    }

    const fetchCollections = async () => {
      setFetchFailed(false);
      try {
        const { data } = await api.get("/collections");
        setCollections(mapCollections(data?.data || []));
      } catch (error) {
        console.warn("Failed to fetch explore collections:", error);
        setCollections([]);
        setFetchFailed(true);
      } finally {
        setLoading(false);
      }
    };

    fetchCollections();
  }, [skipFetch, initialCollections]);

  if (loading) {
    return (
      <section className="container-safe mt-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 md:grid-rows-2 md:min-h-[420px]">
          <div className="md:row-span-2 h-[280px] md:h-auto bg-zinc-100 animate-pulse rounded-2xl" />
          <div className="h-[160px] bg-zinc-100 animate-pulse rounded-2xl" />
          <div className="h-[160px] bg-zinc-100 animate-pulse rounded-2xl" />
        </div>
      </section>
    );
  }

  if (infrastructureDegraded || fetchFailed || collections.length === 0) {
    return null;
  }

  const [first, ...rest] = collections;

  const sectionTitle = language === "km" ? (t("exploreInspire") || "Explore & Inspire") : "Explore & Inspire";
  const sectionSub =
    language === "km"
      ? t("exploreInspireHint") || "ស្វែងរក និងបំផុសគំនិត"
      : t("exploreInspireHint") || "Discover The Man Store looks";

  return (
    <section className="container-safe mt-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2
            className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {sectionTitle}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{sectionSub}</p>
        </div>
        <Link
          to="/search"
          className="shrink-0 text-sm font-semibold text-zinc-800 hover:underline"
        >
          View All →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 md:grid-rows-2 md:min-h-[420px]">
        {first ? (
          <div className="md:row-span-2">
            <Tile
              featured
              title={first.name}
              subtitle={first.subtitle}
              to={first.link}
              image={first.image}
            />
          </div>
        ) : null}

        {rest.map((tile) => (
          <Tile
            key={tile.id}
            title={tile.name}
            subtitle={tile.subtitle}
            to={tile.link}
            image={tile.image}
          />
        ))}
      </div>
    </section>
  );
}
