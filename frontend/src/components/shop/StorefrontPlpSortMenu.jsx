import React, { useEffect, useId, useRef, useState } from "react";
import { ArrowUpDown, ChevronDown } from "lucide-react";
import { STOREFRONT_SORT_OPTIONS } from "../../lib/storefrontProductFilters.js";
import { useLanguage } from "../../lib/i18n";

export default function StorefrontPlpSortMenu({ value = "recommend", onChange, className = "" }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listId = useId();
  const selected =
    STOREFRONT_SORT_OPTIONS.find((o) => String(o.value) === String(value)) ||
    STOREFRONT_SORT_OPTIONS[0];

  const getSortLabel = (opt) => {
    if (!opt) return "";
    switch (opt.value) {
      case "recommend":
        return t("recommend", "Recommend");
      case "new":
        return t("newItems", "New items");
      case "price_high":
        return t("priceHighFirst", "Price (High First)");
      case "price_low":
        return t("priceLowFirst", "Price (Low First)");
      case "discount_high":
        return t("discountHighFirst", "Discount (High First)");
      case "discount_low":
        return t("discountLowFirst", "Discount (Low First)");
      default:
        return opt.label;
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`fs-plp-toolbar__sort ${className}`}>
      <button
        type="button"
        className="fs-plp-toolbar__sort-btn"
        aria-label={t("sortBy", "Sort by")}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="fs-plp-toolbar__sort-label">{t("sortBy", "Sort by")}</span>
        <span className="fs-plp-toolbar__sort-value truncate">{getSortLabel(selected)}</span>
        <ChevronDown className={`fs-plp-toolbar__sort-chevron ${open ? "is-open" : ""}`} aria-hidden />
      </button>
      {open ? (
        <ul id={listId} className="fs-plp-toolbar__sort-menu" role="listbox">
          {STOREFRONT_SORT_OPTIONS.map((opt) => {
            const active = String(opt.value) === String(value);
            return (
              <li key={opt.value} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={active ? "is-active" : ""}
                  onClick={() => {
                    onChange?.(opt.value);
                    setOpen(false);
                  }}
                >
                  {getSortLabel(opt)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
