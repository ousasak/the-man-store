import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resolveImageUrl } from "../../lib/images";
import MegaMenuEmptyState from "./MegaMenuEmptyState.jsx";

function BrandTile({ name, image }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const canRenderLogo = Boolean(image) && !logoFailed;

  return (
    <div className="flex h-14 w-28 shrink-0 items-center justify-center">
      {canRenderLogo ? (
        <img
          src={resolveImageUrl(image)}
          alt={name}
          onError={() => setLogoFailed(true)}
          className="h-10 w-auto max-w-[6.5rem] object-contain"
          loading="lazy"
        />
      ) : (
        <span className="px-2 text-center text-sm font-black tracking-tight text-zinc-900 line-clamp-2">
          {name}
        </span>
      )}
    </div>
  );
}

/**
 * Homepage-style brand logo row for the mega menu "Brands" panel.
 */
export default function MegaMenuBrandStrip({ items = [], onItemClick, emptyMessage = "Not available yet" }) {
  const scrollerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const isScrollable = maxScroll > 4;
    setCanScrollLeft(isScrollable && el.scrollLeft > 4);
    setCanScrollRight(isScrollable && el.scrollLeft < maxScroll - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return undefined;

    const onScroll = () => updateArrows();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateArrows);
    const id = setTimeout(updateArrows, 50);

    return () => {
      clearTimeout(id);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateArrows);
    };
  }, [items]);

  const scrollBy = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(240, Math.floor(el.clientWidth * 0.6));
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
    requestAnimationFrame(updateArrows);
  };

  if (!items.length) {
    return <MegaMenuEmptyState message={emptyMessage} />;
  }

  return (
    <div className="fs-brand-row mt-1">
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
        {items.map((item, i) => (
          <div key={`${item.to}-${item.label}-${i}`} className="shrink-0">
            <Link
              to={item.to || "/search"}
              className="block"
              onClick={() => onItemClick?.(item)}
            >
              <BrandTile name={item.label} image={item.image} />
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
  );
}
