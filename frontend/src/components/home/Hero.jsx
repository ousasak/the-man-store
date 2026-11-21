import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../lib/api";
import { resolveImageUrl } from "../../lib/images";
import { useCatalogAvailability } from "../../state/catalogAvailability.jsx";
import { filterStorefrontMedia } from "../../lib/catalogContent.js";

const SLIDE_MS = 20000;

function HeroPlaceholder() {
  return (
    <section className="fs-hero-shell" aria-label="Hero banner">
      <div
        className="fs-hero-banner relative overflow-hidden bg-gradient-to-br from-zinc-300 via-zinc-200 to-zinc-100"
        aria-hidden
      >
        <div className="fs-hero-banner__frame" />
      </div>
      <span className="sr-only">Hero banner area</span>
    </section>
  );
}

const textContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.25,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.35,
    },
  },
};

const badgeVariants = {
  hidden: {
    y: -16,
    opacity: 0,
    scale: 0.9,
  },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 18,
    },
  },
  exit: {
    opacity: 0,
  },
};

const titleVariants = {
  hidden: {
    y: 24,
    opacity: 0,
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
  },
};

const subtitleVariants = {
  hidden: {
    opacity: 0,
    y: 14,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
  exit: {
    opacity: 0,
  },
};

const buttonVariants = {
  hidden: {
    y: 10,
    opacity: 0,
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
  },
};

export default function Hero({ initialBanners, skipFetch = false }) {
  const { infrastructureDegraded } = useCatalogAvailability();
  const [i, setI] = useState(0);
  const [banners, setBanners] = useState(() =>
    skipFetch && Array.isArray(initialBanners) ? filterStorefrontMedia(initialBanners) : []
  );
  const [loading, setLoading] = useState(() => !(skipFetch && Array.isArray(initialBanners)));
  const [fetchFailed, setFetchFailed] = useState(false);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [floorIndex, setFloorIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  useEffect(() => {
    if (skipFetch && Array.isArray(initialBanners)) {
      setBanners(filterStorefrontMedia(initialBanners));
      setLoading(false);
      return;
    }

    const fetchBanners = async () => {
      setFetchFailed(false);
      try {
        const { data } = await api.get("/banners/hero");
        setBanners(filterStorefrontMedia(data?.data || []));
      } catch (error) {
        console.warn("Failed to fetch banners:", error);
        setBanners([]);
        setFetchFailed(true);
      } finally {
        setLoading(false);
      }
    };

    fetchBanners();
  }, [skipFetch, initialBanners]);

  const slides = useMemo(() => {
    return banners.map((b) => ({
      id: b.id,
      badge: b.title || "SALE",
      title: b.title || b.badge,
      subtitle: b.subtitle,
      desc: b.subtitle,
      cta: {
        label: b.title || "Shop Now",
        to: b.link_url || "/search",
      },
      show_badge: b.show_badge !== false,
      show_title: b.show_title !== false,
      show_subtitle: b.show_subtitle !== false,
      show_cta: b.show_cta !== false,
      image: b.image_url ? resolveImageUrl(b.image_url) : "",
      link_url: b.link_url,
      bg: b.bg || "from-rose-400 via-red-500 to-red-600",
    }));
  }, [banners]);

  useEffect(() => {
    setHeroImageFailed(false);
  }, [i, slides]);

  useEffect(() => {
    if (slides.length === 0) return;
    setI((x) => (x < slides.length ? x : 0));
    setFloorIndex((x) => (x < slides.length ? x : 0));
  }, [slides.length]);

  useEffect(() => {
    if (floorIndex === i) return undefined;
    const t = window.setTimeout(() => setFloorIndex(i), 700);
    return () => window.clearTimeout(t);
  }, [i, floorIndex]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => {
      setI((x) => (x + 1) % slides.length);
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, [slides.length]);

  if (loading) {
    return (
      <section className="fs-hero-shell">
        <div className="fs-hero-banner relative overflow-hidden bg-gradient-to-r from-zinc-100 via-zinc-50 to-white animate-pulse">
          <div className="fs-hero-banner__frame">
          <div className="absolute inset-0 flex items-end p-4 md:p-10">
            <div className="w-full max-w-xl">
              <div className="h-3 md:h-4 w-16 md:w-20 bg-zinc-200 rounded mb-3 md:mb-4"></div>
              <div className="h-6 md:h-10 w-40 md:w-48 bg-zinc-200 rounded mb-2"></div>
              <div className="h-3 md:h-4 w-full max-w-xs bg-zinc-200 rounded mb-4 md:mb-6"></div>
              <div className="h-8 md:h-10 w-24 md:w-28 bg-zinc-200 rounded-full"></div>
            </div>
          </div>
          </div>
        </div>
      </section>
    );
  }

  if (infrastructureDegraded || fetchFailed || slides.length === 0) {
    return <HeroPlaceholder />;
  }

  const active = slides[i];
  const floor = slides[floorIndex] || active;
  const incoming = i !== floorIndex;
  const showFloorImage = Boolean(floor?.image);
  const showIncomingImage = incoming && Boolean(active.image) && !heroImageFailed;
  const showAnyOverlayText =
    (active.show_badge && active.badge) ||
    (active.show_title && active.title) ||
    (active.show_subtitle && active.desc) ||
    active.show_cta;

  const handleTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      setI((x) => (x + 1) % slides.length);
    }
    if (isRightSwipe) {
      setI((x) => (x - 1 + slides.length) % slides.length);
    }

    setTouchStart(0);
    setTouchEnd(0);
  };

  const handleDotClick = (index) => {
    if (index !== i) {
      setI(index);
    }
  };

  return (
    <section className="fs-hero-shell">
      <div className="fs-hero-banner relative overflow-hidden bg-zinc-100">
        <div
          className="fs-hero-banner__frame overflow-hidden cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {showFloorImage ? (
            <img
              src={floor.image}
              alt=""
              aria-hidden
              className="fs-hero-banner__photo"
            />
          ) : (
            <div
              className="absolute inset-0 bg-gradient-to-br from-zinc-400 via-zinc-300 to-zinc-200"
              aria-hidden
            />
          )}

          {showIncomingImage ? (
            <img
              key={active.id ?? i}
              src={active.image}
              alt={active.title}
              onError={() => setHeroImageFailed(true)}
              className="fs-hero-banner__photo fs-hero-banner__photo--in"
            />
          ) : null}

          <div className="absolute inset-0 z-[2] bg-gradient-to-t from-black/45 via-black/10 to-transparent pointer-events-none" />

          {showAnyOverlayText ? (
            <div className="relative z-10 h-full flex items-end pointer-events-none">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`text-${active.id ?? i}`}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={textContainerVariants}
                  className="p-6 sm:p-8 md:p-10 lg:p-14 xl:p-16 max-w-2xl text-white w-full [text-shadow:0_1px_12px_rgba(0,0,0,0.35)]"
                >
                  {active.show_badge && active.badge ? (
                    <motion.span
                      variants={badgeVariants}
                      className="inline-flex items-center rounded-full bg-white/15 backdrop-blur-sm border border-white/25 px-2 py-0.5 md:px-3 md:py-1 text-[9px] md:text-[10px] lg:text-xs font-semibold uppercase tracking-[0.2em]"
                    >
                      {active.badge}
                    </motion.span>
                  ) : null}

                  {active.show_title && active.title ? (
                    <motion.h1
                      variants={titleVariants}
                      className="mt-2 md:mt-3 text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-black tracking-tight leading-tight"
                    >
                      {active.title}
                    </motion.h1>
                  ) : null}

                  {active.show_subtitle && active.desc ? (
                    <motion.p
                      variants={subtitleVariants}
                      className="mt-1.5 md:mt-2 text-xs sm:text-sm md:text-base text-white/90 line-clamp-2"
                    >
                      {active.desc}
                    </motion.p>
                  ) : null}

                  {active.show_cta ? (
                    <motion.div
                      variants={buttonVariants}
                      className="mt-3 md:mt-4 pointer-events-auto"
                    >
                      <Link
                        to={active.cta?.to || active.link_url || "/search"}
                        className="inline-flex items-center h-8 md:h-10 px-4 md:px-6 rounded-full bg-white text-zinc-900 text-xs md:text-sm font-semibold shadow-lg hover:shadow-xl hover:bg-zinc-100 transition-all duration-300"
                      >
                        {active.cta?.label || "Shop now"}
                      </Link>
                    </motion.div>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          ) : null}

          {slides.length > 1 && (
            <div className="absolute bottom-3 md:bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 md:gap-2">
              {slides.map((_, idx) => (
                <motion.button
                  key={idx}
                  onClick={() => handleDotClick(idx)}
                  whileHover={{ scale: 1.3 }}
                  whileTap={{ scale: 0.85 }}
                  className="relative group"
                  aria-label={`Go to slide ${idx + 1}`}
                >
                  <span
                    className={`block rounded-full transition-all duration-500 ${idx === i
                        ? "w-8 md:w-10 h-1.5 md:h-2 bg-white shadow-lg"
                        : "w-1.5 md:w-2 h-1.5 md:h-2 bg-white/40 group-hover:bg-white/70"
                      }`}
                  />

                  {idx === i && (
                    <motion.span
                      className="absolute inset-0 bg-white/50 rounded-full"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: SLIDE_MS / 1000, ease: "linear" }}
                      style={{ transformOrigin: "left" }}
                    />
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
