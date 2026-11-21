import React, { useMemo, useState, useRef, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../state/auth.jsx";
import { useCart } from "../../state/cart.jsx";
import { useWishlist } from "../../state/wishlist.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { useHomepageSettings } from "../../state/homepageSettings.jsx";
import { resolveImageUrl } from "../../lib/images.js";
import { Camera, X, Bell, Search, User, Heart, ShoppingBag, Moon, Sun, Settings2, LayoutDashboard, ClipboardList } from "lucide-react";
import { useTheme } from "../../state/theme.jsx";
import Logo from "../Logo.jsx";
import LoginDialog from "../dialogs/LoginDialog.jsx";
import RegisterDialog from "../dialogs/RegisterDialog.jsx";
import SmartSearchModal from "../search/SmartSearchModal.jsx";
import { storefrontSearchUrl as navSearch } from "../../lib/storefrontNavLinks.js";
import { mergeTopNavDropdowns } from "../../lib/defaultTopNavDropdowns.js";
import { mergeHeaderSettings } from "../../lib/defaultHeaderSettings.js";
import { resolveHeaderChromeStyle } from "../../lib/storefrontChrome.js";
import { isAdminUser } from "../../app/redirectAfterAuth.js";

function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}

/** Match nav item only when path + query params align (avoids every /search?… link active at once). */
function isNavItemActive(location, to) {
  const toStr = String(to || "");
  const qIndex = toStr.indexOf("?");
  const toPath = qIndex >= 0 ? toStr.slice(0, qIndex) : toStr;
  const toSearch = qIndex >= 0 ? toStr.slice(qIndex + 1) : "";
  const { pathname, search } = location;

  if (!toSearch) {
    if (toPath === "/discounts") {
      return pathname === "/discounts" || pathname.startsWith("/discounts/");
    }
    return pathname === toPath && !search;
  }

  if (pathname !== toPath) return false;

  const toParams = new URLSearchParams(toSearch);
  const locParams = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [key, value] of toParams.entries()) {
    if (locParams.get(key) !== value) return false;
  }
  return true;
}

function getInitials(label) {
  const text = String(label || "").trim();
  if (!text) return "";
  return text.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Badge({ value, accent = false }) {
  if (!value) return null;
  return (
    <span
      key={value}
      className={cn("fs-header-badge", accent && "fs-header-badge-accent")}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

function Icon({ name }) {
  const cls = "fs-header-icon";
  if (name === "search") return <Search className={cls} strokeWidth={2} />;
  if (name === "user") return <User className={cls} strokeWidth={2} />;
  if (name === "heart") return <Heart className={cls} strokeWidth={2} />;
  if (name === "bag") return <ShoppingBag className={cls} strokeWidth={2} />;
  return null;
}

/** Language + theme — hidden until the settings trigger is clicked. */
function HeaderPrefsMenu({
  t,
  language,
  toggleLanguage,
  languageEnabled,
  storefrontMode,
  toggleStorefrontMode,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className={cn("relative shrink-0", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fs-iconbtn-header group"
        aria-label={t("language")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("language")}
      >
        <Settings2 className="fs-header-icon" strokeWidth={2} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden z-50"
          role="menu"
        >
          {languageEnabled && (
            <button
              type="button"
              role="menuitem"
              onClick={() => toggleLanguage()}
              className="w-full px-3.5 py-2.5 flex items-center gap-3 text-left text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <img
                src={language === "km" ? "https://flagcdn.com/kh.svg" : "https://flagcdn.com/gb.svg"}
                alt=""
                className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-slate-200"
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {t("language")}
                </span>
                <span className="block text-sm font-semibold">
                  {language === "km" ? t("khmer") : t("english")}
                </span>
              </span>
              <span className="text-xs font-bold text-slate-500 tabular-nums">
                {language === "km" ? "KM" : "EN"}
              </span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => toggleStorefrontMode()}
            className={cn(
              "w-full px-3.5 py-2.5 flex items-center gap-3 text-left text-slate-700 hover:bg-slate-50 transition-colors",
              languageEnabled && "border-t border-slate-100",
            )}
          >
            <span className="w-5 h-5 flex items-center justify-center shrink-0 text-slate-500">
              {storefrontMode === "dark"
                ? <Sun className="w-4 h-4" strokeWidth={2} />
                : <Moon className="w-4 h-4" strokeWidth={2} />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Theme
              </span>
              <span className="block text-sm font-semibold">
                {storefrontMode === "dark" ? "Light mode" : "Dark mode"}
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ user, onLogout, t, className = "" }) {
  const [open, setOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const ref = useRef(null);
  const avatarSrc = user?.profile_image_url || user?.profile_image_path
    ? resolveImageUrl(user.profile_image_url || user.profile_image_path)
    : null;
  const initials = getInitials(user?.name || user?.email || "");
  const admin = isAdminUser(user);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    setAvatarBroken(false);
  }, [avatarSrc]);

  if (!user) return null;

  const menuLinks = admin
    ? [
      { to: "/admin", label: t("navDashboard"), Icon: LayoutDashboard },
      { to: "/admin/orders", label: t("navOrders"), Icon: ClipboardList },
      { to: "/admin/profile", label: t("adminProfile"), Icon: User },
    ]
    : [
      { to: "/profile", label: t("account"), Icon: User },
      { to: "/profile?tab=orders", label: t("orders"), Icon: ClipboardList },
    ];

  return (
    <div className={cn("relative shrink-0 overflow-visible", className)} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fs-avatar-ring"
        aria-label={admin ? t("navDashboard") : t("account")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="fs-avatar-ring__frame">
          <span className="fs-avatar-ring__inner">
            {avatarSrc && !avatarBroken ? (
              <img
                src={avatarSrc}
                alt={user?.name || "Profile"}
                className="w-full h-full object-cover"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              <span>{initials || "U"}</span>
            )}
          </span>
          <span className="fs-avatar-ring__status" aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
          <div className="px-4 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-zinc-900/10 text-zinc-900 flex items-center justify-center overflow-hidden">
              {avatarSrc && !avatarBroken ? (
                <img
                  src={avatarSrc}
                  alt={user?.name || "Profile"}
                  className="w-full h-full object-cover"
                  onError={() => setAvatarBroken(true)}
                />
              ) : (
                <span className="text-sm font-bold">{initials || "U"}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 truncate">{user?.name || t("account")}</p>
              <p className="text-sm text-slate-500 truncate">{user?.email}</p>
              {admin ? (
                <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700 mt-0.5">
                  {String(user?.role || "admin").replace(/_/g, " ")}
                </p>
              ) : null}
            </div>
          </div>
          <div className="py-2">
            {menuLinks.map(({ to, label, Icon: ItemIcon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className="w-full px-4 py-2.5 flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ItemIcon className="w-5 h-5 text-slate-400" strokeWidth={2} />
                <span className="text-sm">{label}</span>
              </Link>
            ))}
          </div>
          <div className="py-2 border-t border-slate-100">
            <button
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="text-sm font-medium">{t("logout")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function NavDropdownPanel({ items }) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return null;

  const hasSections = safeItems.some((item) => item?.type === "section");

  return (
    <div className="bg-white shadow-xl border-t border-zinc-100">
      {hasSections ? (
        <div className="container-safe mx-auto py-6 px-8">
          <div className="grid grid-cols-4 gap-10">
            {safeItems.filter((item) => item?.type === "section").map((section, idx) => (
              <div key={idx} className={section.className || ""}>
                {section.to ? (
                  <Link to={section.to} className="block group mb-3">
                    <h4 className="text-sm font-bold text-zinc-900 uppercase tracking-wider mb-1 group-hover:text-emerald-600 transition-colors">
                      {section.label}
                    </h4>
                    {section.description && (
                      <p className="text-xs text-zinc-500 leading-relaxed">{section.description}</p>
                    )}
                  </Link>
                ) : (
                  <div className="block mb-3">
                    <h4 className="text-sm font-bold text-zinc-900 uppercase tracking-wider mb-1">
                      {section.label}
                    </h4>
                    {section.description && (
                      <p className="text-xs text-zinc-500 leading-relaxed">{section.description}</p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {section.items?.map((item, itemIdx) => (
                    <Link key={itemIdx} to={item.to} className="fs-menu-item">
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="container-safe mx-auto py-6 px-8">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {safeItems.map((item, idx) => (
              <Link
                key={idx}
                to={item.to}
                className={cn(
                  "px-6 py-3 text-sm font-medium transition-all duration-200 rounded-lg",
                  item.highlight
                    ? "text-zinc-900 font-semibold bg-zinc-100 hover:bg-zinc-200"
                    : "text-zinc-700 hover:text-zinc-950 hover:bg-zinc-50"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Animated Nav Link — one underline at a time (hover wins, else single active route)
function AnimatedNavLink({ to, label, hasDropdown, onHover, index, hoveredIndex, isDropdownOpen }) {
  const location = useLocation();
  const isActive = isNavItemActive(location, to);
  const showUnderline =
    hoveredIndex === index ||
    (hoveredIndex === null && (isActive || isDropdownOpen));

  return (
    <NavLink
      to={to}
      className={cn("fs-nav-link", showUnderline && "fs-nav-link-active")}
      onMouseEnter={onHover}
    >
      <span className="relative z-10">{label}</span>
      <span className={cn("fs-nav-underline", showUnderline && "is-on")} />
    </NavLink>
  );
}

function NavBar({ navItems, variant = "bar", onActiveDropdownChange, resetToken = 0 }) {
  const { t } = useLanguage();
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const inline = variant === "inline";

  const visibleItemsCount = inline
    ? navItems.length
    : navItems.length > 8
      ? 5
      : navItems.length > 6
        ? 5
        : Math.min(6, navItems.length);
  const visibleItems = navItems.slice(0, visibleItemsCount);
  const moreItems = inline ? [] : navItems.slice(visibleItemsCount);
  const hasMore = moreItems.length > 0;
  const hoveredItem = hoveredIndex != null ? visibleItems[hoveredIndex] : null;
  const panelOpen = Boolean(hoveredItem?.items?.length);

  useEffect(() => {
    setHoveredIndex(null);
    setShowMore(false);
  }, [resetToken]);

  useEffect(() => {
    if (!onActiveDropdownChange) return undefined;
    onActiveDropdownChange(panelOpen ? hoveredItem : null);
    return () => onActiveDropdownChange(null);
  }, [panelOpen, hoveredItem, onActiveDropdownChange]);

  return (
    <div
      className={cn("relative", inline && "min-w-0 shrink")}
      onMouseLeave={
        inline
          ? undefined
          : () => {
              setHoveredIndex(null);
              setShowMore(false);
            }
      }
    >
      <nav
        className={cn(
          "fs-header-bar relative z-10 flex flex-wrap items-center",
          inline
            ? "!px-0 py-0 gap-x-4 xl:gap-x-5 2xl:gap-x-6 justify-start flex-nowrap"
            : "justify-center gap-x-4 gap-y-1 sm:gap-x-5 lg:gap-x-6 xl:gap-x-8 py-2"
        )}
      >
        {visibleItems.map((item, index) => {
          const itemKey = item.to || item.label || `nav-${index}`;
          const hasDropdown = Boolean(item.items?.length);
          return (
            <div
              key={itemKey}
              className="relative shrink-0"
              onMouseEnter={() => {
                if (hasDropdown) setHoveredIndex(index);
                else setHoveredIndex(null);
              }}
            >
              <AnimatedNavLink
                to={item.to}
                label={item.label}
                hasDropdown={hasDropdown}
                index={index}
                hoveredIndex={hoveredIndex}
                isDropdownOpen={hoveredIndex === index}
                onHover={() => setHoveredIndex(hasDropdown ? index : null)}
              />
            </div>
          );
        })}

        {hasMore && (
          <div className="relative">
            <button
              type="button"
              className="px-3 py-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
              onMouseEnter={() => setShowMore(true)}
              onMouseLeave={() => setShowMore(false)}
            >
              {t("more") || "More"}
            </button>
            {showMore && (
              <div className="absolute right-0 top-full mt-1 bg-white shadow-lg rounded-lg border border-zinc-200 overflow-hidden z-50">
                {moreItems.map((item, idx) => (
                  <Link
                    key={idx}
                    to={item.to}
                    className="block px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors"
                    onClick={() => setShowMore(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {!inline && panelOpen ? (
        <div className="absolute left-0 right-0 top-full z-50 pt-1">
          <NavDropdownPanel items={hoveredItem.items} />
        </div>
      ) : null}
    </div>
  );
}

export default function Header({ onOpenCart, onOpenNotifications, notificationsUnread = 0 }) {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const wishlist = useWishlist();
  const { t, language, toggleLanguage } = useLanguage();
  const { settings } = useHomepageSettings();
  const { storefrontMode, toggleStorefrontMode } = useTheme();
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [activeNavDropdown, setActiveNavDropdown] = useState(null);
  const [navHoverReset, setNavHoverReset] = useState(0);
  const onActiveDropdownChange = React.useCallback((item) => {
    setActiveNavDropdown(item);
  }, []);

  useEffect(() => {
    const openLogin = () => {
      if (user) return;
      setShowRegisterDialog(false);
      setShowLoginDialog(true);
    };
    const openRegister = () => {
      if (user) return;
      setShowLoginDialog(false);
      setShowRegisterDialog(true);
    };
    window.addEventListener("fs:open-login", openLogin);
    window.addEventListener("fs:open-register", openRegister);
    return () => {
      window.removeEventListener("fs:open-login", openLogin);
      window.removeEventListener("fs:open-register", openRegister);
    };
  }, [user]);


  // Get header settings with fallback defaults
  const footerSettings = settings?.footer || {};
  const headerSettings = mergeHeaderSettings(settings?.header);

  const chromeStyle = useMemo(
    () => resolveHeaderChromeStyle(headerSettings, footerSettings),
    [headerSettings, footerSettings],
  );

  const headerLabels = headerSettings.nav_labels || {};
  const localizedNavLabels = (headerLabels && (headerLabels.en || headerLabels.km))
    ? (headerLabels[language] || headerLabels.en || {})
    : (language === "km" ? {} : headerLabels);
  const label = (key, fallback) => localizedNavLabels[key] || fallback;
  const searchPlaceholder = language === "km"
    ? t('searchProducts')
    : (headerSettings.search_placeholder || "Search everything");
  const navVisibility = headerSettings.nav_visibility || {};
  const isVisible = (key) => navVisibility[key] !== false;
  const customNavItems = Array.isArray(headerSettings.custom_nav) ? headerSettings.custom_nav : [];

  const navDropdowns = useMemo(
    () => mergeTopNavDropdowns(headerSettings.nav_dropdowns),
    [headerSettings.nav_dropdowns]
  );

  const navItems = useMemo(
    () => [
      {
        key: 'newIn',
        label: label('newIn', 'NEW IN'),
        to: navSearch({ tab: 'new' }),
        items: navDropdowns.newIn,
      },
      {
        key: 'discounts',
        label: label('discounts', t('discounts')).replace(/^🎉\s*/, ''),
        to: "/discounts",
        items: navDropdowns.discounts,
      },
      {
        key: 'women',
        label: label('women', 'WOMEN'),
        to: "/search?parent_category=Women",
        items: navDropdowns.women,
      },
      {
        key: 'men',
        label: label('men', 'MEN'),
        to: "/search?parent_category=Men",
        items: navDropdowns.men,
      },
      {
        key: 'sale',
        label: label('sale', t('sale')),
        to: navSearch({ tab: 'sale' }),
        items: navDropdowns.sale,
      },
    ]
      .filter((item) => (item.key ? isVisible(item.key) : true))
      .concat(
        customNavItems
          .filter((item) => item && item.label && item.to)
          .map((item) => ({ label: item.label, to: item.to, items: item.items || [] }))
      ),
    [t, label, navDropdowns, headerSettings.nav_labels, headerSettings.nav_visibility, headerSettings.custom_nav]
  );

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (headerSettings.search_enabled) setShowSearchDialog(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [headerSettings.search_enabled]);

  return (
    <div className="fs-site-chrome sticky top-0 z-30 backdrop-blur-md shadow-sm" style={chromeStyle}>
      {/* Mobile: logo + search + theme only (desktop bar hidden below lg) */}
      <div className="fs-header-bar fs-header-bar--mobile lg:hidden">
        <Link to="/" className="shrink-0">
          <Logo
            className="fs-header-bar__logo-mobile"
            src={headerSettings.logo_url}
          />
        </Link>

        {headerSettings.search_enabled && (
          <button
            type="button"
            onClick={() => setShowSearchDialog(true)}
            className="flex-1 min-w-0"
          >
            <div className="relative">
              <div className="w-full h-9 sm:h-10 rounded-full border border-white/60 bg-white/95 pl-9 sm:pl-10 pr-9 sm:pr-10 text-xs text-zinc-800 shadow-sm flex items-center">
                <span className="truncate text-zinc-500">{searchPlaceholder}</span>
              </div>
              <span className="absolute left-2.5 sm:left-3.5 top-1/2 -translate-y-1/2 text-zinc-600">
                <Icon name="search" />
              </span>
              <span className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-zinc-600">
                <Camera className="w-3.5 h-3.5" />
              </span>
            </div>
          </button>
        )}

        <HeaderPrefsMenu
          t={t}
          language={language}
          toggleLanguage={toggleLanguage}
          languageEnabled={headerSettings.language_enabled}
          storefrontMode={storefrontMode}
          toggleStorefrontMode={toggleStorefrontMode}
        />
      </div>

      {/* Desktop header + category nav share one hover zone for dropdowns */}
      <div
        className="hidden lg:block relative"
        onMouseLeave={() => {
          setActiveNavDropdown(null);
          setNavHoverReset((n) => n + 1);
        }}
      >
        <div className="fs-header-bar fs-header-bar--desktop min-h-[5rem] py-1.5">
          <div className="fs-header-bar__side fs-header-bar__side--left">
            <NavBar
              navItems={navItems}
              variant="inline"
              onActiveDropdownChange={onActiveDropdownChange}
              resetToken={navHoverReset}
            />
          </div>

          <Link to="/" className="fs-header-bar__logo-wrap">
            <Logo className="fs-header-bar__logo" src={headerSettings.logo_url} />
          </Link>

          <div className="fs-header-bar__side fs-header-bar__side--right fs-header-actions">
            {headerSettings.search_enabled && (
              <button
                type="button"
                onClick={() => setShowSearchDialog(true)}
                className="fs-header-bar__search"
              >
                <div className="relative">
                  <div className="fs-header-search w-full h-9 rounded-full border pl-10 pr-10 text-xs outline-none flex items-center">
                    <span className="truncate font-medium">{searchPlaceholder}</span>
                  </div>
                  <span className="absolute left-3 top-1/2 -translate-y-1/2">
                    <Icon name="search" />
                  </span>
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-80">
                    <Camera className="fs-header-icon" strokeWidth={2} />
                  </span>
                </div>
              </button>
            )}

            <div className="fs-header-bar__tools flex items-center gap-0.5 shrink-0">
              <HeaderPrefsMenu
                t={t}
                language={language}
                toggleLanguage={toggleLanguage}
                languageEnabled={headerSettings.language_enabled}
                storefrontMode={storefrontMode}
                toggleStorefrontMode={toggleStorefrontMode}
              />

              <button
                onClick={onOpenNotifications}
                className="fs-iconbtn-header group shrink-0"
                aria-label={t('notifications')}
              >
                <Bell className="fs-header-icon" strokeWidth={2} />
                <Badge value={notificationsUnread} accent />
              </button>

              {headerSettings.wishlist_enabled && (
                <Link
                  className="fs-iconbtn-header group shrink-0"
                  to="/search?tab=wishlist"
                  aria-label={t('wishlist')}
                >
                  <Icon name="heart" />
                  <Badge value={wishlist.count} accent />
                </Link>
              )}

              {headerSettings.cart_enabled && (
                <button
                  className="fs-iconbtn-header group shrink-0"
                  onClick={onOpenCart}
                  aria-label={t('cart')}
                >
                  <Icon name="bag" />
                  <Badge value={count} />
                </button>
              )}
            </div>

            <ProfileMenu user={user} onLogout={logout} t={t} />

            {user ? null : (
              <div className="fs-header-bar__auth hidden lg:flex items-center gap-3 shrink-0 pl-1">
                <button
                  type="button"
                  onClick={() => setShowLoginDialog(true)}
                  className="fs-header-auth-link"
                >
                  {t('login')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRegisterDialog(true)}
                  className="fs-header-auth-link"
                >
                  {t('register')}
                </button>
              </div>
            )}
          </div>
        </div>

        {activeNavDropdown?.items?.length ? (
          <div className="absolute left-0 right-0 top-full z-50 pt-px">
            <NavDropdownPanel items={activeNavDropdown.items} />
          </div>
        ) : null}
      </div>

      <SmartSearchModal
        open={showSearchDialog}
        onClose={() => setShowSearchDialog(false)}
        placeholder={searchPlaceholder}
        accentColor={headerSettings.background_color || "#10a37f"}
      />

      {/* Login Dialog */}
      <LoginDialog
        isOpen={showLoginDialog}
        onClose={() => setShowLoginDialog(false)}
        onSwitchToRegister={() => {
          setShowLoginDialog(false);
          setShowRegisterDialog(true);
        }}
      />

      {/* Register Dialog */}
      <RegisterDialog
        isOpen={showRegisterDialog}
        onClose={() => setShowRegisterDialog(false)}
        onSwitchToLogin={() => {
          setShowRegisterDialog(false);
          setShowLoginDialog(true);
        }}
      />

    </div>
  );
}

