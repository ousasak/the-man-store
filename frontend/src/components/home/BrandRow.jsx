import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { resolveImageUrl } from "../../lib/images";

function BrandLogo({ name, logo_url }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const canRenderLogo = Boolean(logo_url) && !logoFailed;

  return (
    <div className="h-14 w-28 flex items-center justify-center transition-transform duration-300 hover:-translate-y-0.5">
      {canRenderLogo ? (
        <img
          src={resolveImageUrl(logo_url)}
          alt={name}
          onError={() => setLogoFailed(true)}
          className="h-10 w-auto object-contain transition-transform duration-300 hover:scale-105"
          loading="lazy"
        />
      ) : (
        <span className="text-sm font-black tracking-tight text-zinc-900">
          {name}
        </span>
      )}
    </div>
  );
}

export default function BrandRow({ initialItems, skipFetch = false }) {
  const [items, setItems] = useState(() => (skipFetch && Array.isArray(initialItems) ? initialItems : []));
  const scrollerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/brands");
      setItems(data?.data || []);
    } catch {
      // keep silent on homepage
      setItems([]);
    }
  };

  useEffect(() => {
    if (skipFetch && Array.isArray(initialItems)) {
      setItems(initialItems);
      return;
    }
    load();
  }, [skipFetch, initialItems]);

  const scrollBy = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(240, Math.floor(el.clientWidth * 0.6));
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
    requestAnimationFrame(() => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      const isScrollable = maxScroll > 4;
      setCanScrollLeft(isScrollable && el.scrollLeft > 4);
      setCanScrollRight(isScrollable && el.scrollLeft < maxScroll - 4);
    });
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const updateArrows = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      const isScrollable = maxScroll > 4;
      setCanScrollLeft(isScrollable && el.scrollLeft > 4);
      setCanScrollRight(isScrollable && el.scrollLeft < maxScroll - 4);
    };

    updateArrows();
    const id = setTimeout(updateArrows, 50);
    const onScroll = () => updateArrows();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateArrows);

    return () => {
      clearTimeout(id);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateArrows);
    };
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="container-safe mt-8">
      <div className="fs-brand-row mt-4">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          className="fs-carousel-nav-btn fs-carousel-nav-btn--simple fs-brand-row__arrow"
          aria-label="Scroll left"
          disabled={!canScrollLeft}
          aria-hidden={!canScrollLeft}
        >
          ‹
        </button>

        <div
          ref={scrollerRef}
          data-hide-scrollbar
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          className="fs-brand-row__track brand-scroll scrollbar-hide scroll-smooth"
        >
          {items.map((b) => (
            <div key={b.id} className="shrink-0">
              <Link
                to={b.slug ? `/brands/${b.slug}` : `/search?q=${encodeURIComponent(b.name)}`}
                className="block"
              >
                <BrandLogo name={b.name} logo_url={b.logo_url} />
              </Link>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => scrollBy(1)}
          className="fs-carousel-nav-btn fs-carousel-nav-btn--simple fs-brand-row__arrow"
          aria-label="Scroll right"
          disabled={!canScrollRight}
          aria-hidden={!canScrollRight}
        >
          ›
        </button>
      </div>
    </section>
  );
}
