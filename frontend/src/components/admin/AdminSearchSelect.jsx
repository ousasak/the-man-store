import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus } from "lucide-react";
import { resolveImageUrl } from "../../lib/images.js";
import { useLanguage } from "../../lib/i18n.jsx";

const MENU_MAX_HEIGHT = 220;
const MENU_GAP = 6;
const DEFAULT_MENU_MIN_WIDTH = 180;

function menuMinWidthFromClassName(listClassName) {
  if (listClassName.includes("min-w-[18rem]")) return 288;
  if (listClassName.includes("min-w-[16rem]")) return 256;
  if (listClassName.includes("min-w-[9rem]")) return 144;
  return DEFAULT_MENU_MIN_WIDTH;
}

function filterOptions(options, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return options;
  return options.filter((opt) => {
    const hay = [opt.label, opt.value, opt.searchText]
      .filter((part) => part != null && String(part).trim() !== "")
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

function SwatchThumb({ imageUrl, label, className = "h-5 w-5" }) {
  const resolved = imageUrl ? resolveImageUrl(imageUrl) : "";
  if (resolved) {
    return (
      <img
        src={resolved}
        alt=""
        className={`${className} shrink-0 rounded-md border border-slate-200/80 object-cover dark:border-slate-600`}
      />
    );
  }
  return (
    <span
      className={`${className} shrink-0 rounded-md border border-dashed border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-700`}
      aria-hidden
      title={label ? `No swatch for ${label}` : "No swatch"}
    />
  );
}

export default function AdminSearchSelect({
  value = "",
  onChange,
  options = [],
  disabled = false,
  placeholder = "Search…",
  emptyLabel = "— Select —",
  ariaLabel,
  inputId,
  className = "",
  inputClassName = "",
  showOptionImage = false,
  pinnedOptions = [],
  listClassName = "",
  menuMinWidth,
  allowEmpty = true,
  allowCustomValue = false,
  inputStyle,
}) {
  const { t } = useLanguage();
  const listId = useId();
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const justFocusedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState(null);

  const allOptions = useMemo(() => {
    const pinned = Array.isArray(pinnedOptions) ? pinnedOptions : [];
    const rest = Array.isArray(options) ? options : [];
    const pinnedValues = new Set(pinned.map((o) => String(o.value)));
    return [...pinned, ...rest.filter((o) => !pinnedValues.has(String(o.value)))];
  }, [options, pinnedOptions]);

  const selected = useMemo(
    () => allOptions.find((o) => String(o.value) === String(value)),
    [allOptions, value],
  );

  const filtered = useMemo(() => {
    const list = filterOptions(allOptions, query);
    if (!value || !selected || list.some((o) => String(o.value) === String(value))) {
      return list;
    }
    return [selected, ...list];
  }, [allOptions, query, value, selected]);

  const { pinnedActions, regularItems } = useMemo(() => {
    const pinned = [];
    const regular = [];

    for (const item of filtered) {
      const isQuickAction =
        Boolean(item.special) ||
        String(item.label || "").trim().startsWith("+") ||
        String(item.value || "").startsWith("__quick_create") ||
        String(item.value || "").startsWith("create_new");
      if (isQuickAction) {
        pinned.push(item);
      } else {
        regular.push(item);
      }
    }

    return { pinnedActions: pinned, regularItems: regular };
  }, [filtered]);

  const updateMenuPosition = () => {
    const input = inputRef.current;
    if (!input) return;

    const rect = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldOpenUp = spaceBelow < 160 && spaceAbove > spaceBelow;

    const maxHeight = Math.max(
      120,
      Math.min(MENU_MAX_HEIGHT, (shouldOpenUp ? spaceAbove : spaceBelow) - MENU_GAP * 2),
    );

    const minWidth =
      typeof menuMinWidth === "number" && menuMinWidth > 0
        ? menuMinWidth
        : menuMinWidthFromClassName(listClassName);

    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: Math.max(rect.width, minWidth),
      zIndex: 9999,
      maxHeight,
      ...(shouldOpenUp
        ? { bottom: window.innerHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    updateMenuPosition();
  }, [open, filtered.length, listClassName, menuMinWidth]);

  useEffect(() => {
    if (!open) return undefined;

    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, filtered.length, listClassName, menuMinWidth]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (listRef.current?.contains(e.target)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // Close when another AdminSearchSelect opens
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.id !== listId) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("adminSelectOpen", handler);
    return () => document.removeEventListener("adminSelectOpen", handler);
  }, [listId]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const closeList = () => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const pick = (nextValue) => {
    onChange?.(nextValue == null ? "" : String(nextValue));
    closeList();
  };

  const openList = () => {
    if (disabled) return;
    // Broadcast to all other AdminSearchSelect instances to close themselves
    document.dispatchEvent(new CustomEvent("adminSelectOpen", { detail: { id: listId } }));
    setOpen(true);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleFocus = () => {
    if (disabled) return;
    justFocusedRef.current = true;
    if (!open) {
      openList();
    }
    window.setTimeout(() => {
      justFocusedRef.current = false;
    }, 200);
  };

  const handleClick = () => {
    if (disabled) return;
    if (justFocusedRef.current) {
      justFocusedRef.current = false;
      return;
    }
    if (open) {
      if (!query.trim()) {
        closeList();
      }
    } else {
      openList();
    }
  };

  const commitQueryOnBlur = () => {
    const q = String(query || "").trim();
    if (!q) {
      setQuery("");
      return;
    }
    const exact = allOptions.find(
      (o) =>
        String(o.label ?? "").toLowerCase() === q.toLowerCase() ||
        String(o.value ?? "").toLowerCase() === q.toLowerCase() ||
        String(o.searchText ?? "").toLowerCase() === q.toLowerCase(),
    );
    if (exact) pick(exact.value);
    else if (allowCustomValue) pick(q);
    else setQuery("");
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeList();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && filtered[activeIndex]) {
      e.preventDefault();
      pick(filtered[activeIndex].value);
      return;
    }
    if (e.key === "Enter" && allowCustomValue) {
      const q = String(query || "").trim();
      if (q) {
        e.preventDefault();
        pick(q);
      }
    }
  };

  const displayValue = open ? query : selected?.label || (allowCustomValue ? String(value || "") : "");
  const showSwatch = showOptionImage && !open && selected?.value;

  const defaultInputClasses =
    "h-10 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 text-xs text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:border-slate-600";

  const menu =
    open && menuStyle ? (
      <div
        ref={listRef}
        id={`${listId}-listbox`}
        role="listbox"
        style={menuStyle}
        onMouseDown={(e) => e.stopPropagation()}
        className={`overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40 dark:ring-white/10 ${listClassName}`}
      >
        {/* Pinned Quick Action(s) e.g. + Create new category… */}
        {pinnedActions.length > 0 && (
          <div className="mb-1 space-y-1">
            {pinnedActions.map((opt) => {
              const globalIdx = filtered.indexOf(opt);
              const isActive = globalIdx === activeIndex;
              const cleanLabel = String(opt.label || "").replace(/^\+\s*/, "");
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt.value)}
                  className={`group flex w-full items-center gap-2.5 rounded-xl border border-dashed px-3 py-2 text-[13px] font-semibold transition-all select-none outline-none ${
                    isActive
                      ? "border-[color:var(--admin-primary)] bg-[rgba(var(--admin-primary-rgb),0.14)] text-[color:var(--admin-primary)] shadow-2xs"
                      : "border-[color:var(--admin-primary)]/40 bg-[rgba(var(--admin-primary-rgb),0.05)] text-[color:var(--admin-primary)] hover:border-[color:var(--admin-primary)] hover:bg-[rgba(var(--admin-primary-rgb),0.12)]"
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--admin-primary-rgb),0.15)] text-[color:var(--admin-primary)] shadow-2xs">
                    <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{cleanLabel}</span>
                </button>
              );
            })}
            <div className="mx-2 my-1.5 border-t border-slate-100 dark:border-slate-800" aria-hidden />
          </div>
        )}

        {/* Regular Items: 100% Sidebar sublink format, completely clean with ZERO overlapping lines */}
        {regularItems.length === 0 && pinnedActions.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
            {t("common.messages.noResults", "No matches")}
          </div>
        ) : (
          <ul className="space-y-1">
            {regularItems.map((opt) => {
              const globalIdx = filtered.indexOf(opt);
              const isActive = globalIdx === activeIndex;
              const isSelected = String(value) === String(opt.value);

              return (
                <li key={`${opt.value}-${globalIdx}`} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(opt.value)}
                    className={`group relative flex min-h-[38px] w-full items-center rounded-xl px-3 py-1.5 text-left text-[13px] font-medium transition-all select-none outline-none ${
                      isSelected
                        ? "border-l-2 border-[color:var(--admin-primary)] bg-[rgba(var(--admin-primary-rgb),0.12)] font-semibold text-[color:var(--admin-primary)] shadow-2xs dark:bg-white/[0.08] dark:text-white"
                        : isActive
                          ? "bg-slate-100 text-slate-900 font-medium dark:bg-white/[0.06] dark:text-slate-100"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-[#8ea39f] dark:hover:bg-white/[0.05] dark:hover:text-white"
                    }`}
                    style={isSelected ? { borderLeftColor: "var(--admin-primary)" } : {}}
                  >
                    {/* Bullet dot matching sidebar sublink indicator */}
                    <span
                      className={`mr-2.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                        isSelected
                          ? "bg-[color:var(--admin-primary)] shadow-[0_0_6px_rgba(var(--admin-primary-rgb),0.6)]"
                          : "bg-current opacity-40 group-hover:opacity-75"
                      }`}
                      aria-hidden="true"
                    />

                    {showOptionImage ? (
                      <SwatchThumb imageUrl={opt.imageUrl} label={opt.label} className="mr-2 h-5 w-5 rounded-md" />
                    ) : null}

                    <span className="min-w-0 flex-1 truncate">
                      {opt.label}
                    </span>

                    {opt.suffix ? (
                      <span className="shrink-0 font-mono text-[11px] text-slate-400 dark:text-slate-500 mr-1">
                        {opt.suffix}
                      </span>
                    ) : null}

                    {isSelected ? (
                      <Check className="ml-auto h-4 w-4 shrink-0 text-[color:var(--admin-primary)] animate-in zoom-in-75 duration-150" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`.trim()}>
      <div className="relative flex items-center">
        {showSwatch ? (
          <span className="pointer-events-none absolute left-2 z-[1] flex items-center">
            <SwatchThumb imageUrl={selected?.imageUrl} label={selected?.label} />
          </span>
        ) : null}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${listId}-listbox`}
          aria-label={ariaLabel}
          disabled={disabled}
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value.trim() && allowEmpty) onChange?.("");
          }}
          onClick={handleClick}
          onFocus={handleFocus}
          onBlur={() => {
            window.setTimeout(() => {
              commitQueryOnBlur();
              setOpen(false);
            }, 120);
          }}
          onKeyDown={onKeyDown}
          placeholder={open ? (selected?.label || placeholder || emptyLabel) : (placeholder || emptyLabel)}
          className={`${inputClassName || defaultInputClasses} ${showSwatch ? "pl-9" : ""} pr-7 ${open ? "cursor-text" : "cursor-pointer"}`}
          style={inputStyle}
          autoComplete="off"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            if (open) {
              closeList();
            } else {
              openList();
            }
          }}
          className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          aria-label="Toggle options"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180 text-[color:var(--admin-primary)]" : ""}`} aria-hidden />
        </button>
      </div>
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
