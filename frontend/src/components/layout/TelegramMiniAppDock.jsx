import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Heart, QrCode, ShoppingBag, WalletCards } from "lucide-react";
import { useCart } from "../../state/cart.jsx";
import { useWishlist } from "../../state/wishlist.jsx";
import { useAuth } from "../../state/auth.jsx";
import { continueTelegramMiniAppCheckout } from "../../lib/telegramMiniApp.js";

function DockBadge({ value }) {
  if (!value) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-zinc-900 text-white text-[10px] leading-4 text-center">
      {value}
    </span>
  );
}

export default function TelegramMiniAppDock({ onOpenCart }) {
  const { count } = useCart();
  const wishlist = useWishlist();
  const location = useLocation();
  const nav = useNavigate();
  const { user, loginWithTelegramWebApp } = useAuth();

  const goCheckout = async (path) => {
    await continueTelegramMiniAppCheckout({
      user,
      loginWithTelegramWebApp,
      navigate: nav,
      path,
    });
  };

  const items = [
    {
      key: "cart",
      label: "Cart",
      icon: ShoppingBag,
      badge: count,
      onClick: onOpenCart,
    },
    {
      key: "wishlist",
      label: "Wishlist",
      to: "/search?tab=wishlist",
      icon: Heart,
      badge: wishlist.count,
    },
    {
      key: "checkout",
      label: "Checkout",
      icon: WalletCards,
      onClick: () => goCheckout("/checkout"),
    },
    {
      key: "khqr",
      label: "KHQR",
      icon: QrCode,
      onClick: () => goCheckout("/checkout?pay=khqr"),
    },
  ];

  const isActive = (item) => {
    if (item.key === "cart") return location.pathname === "/cart";
    if (item.key === "wishlist") return location.pathname === "/search" && location.search.includes("tab=wishlist");
    if (item.key === "checkout") return location.pathname === "/checkout" && !location.search.includes("pay=khqr");
    if (item.key === "khqr") return location.pathname === "/checkout" && location.search.includes("pay=khqr");
    return false;
  };

  return (
    <nav className="fs-tg-mini-dock" aria-label="Telegram shop actions">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);
        const className = `fs-tg-mini-dock__item ${active ? "is-active" : ""}`;
        const body = (
          <>
            <span className="relative fs-tg-mini-dock__icon">
              <Icon className="h-5 w-5" strokeWidth={2} />
              <DockBadge value={item.badge} />
            </span>
            <span>{item.label}</span>
          </>
        );

        if (item.onClick) {
          return (
            <button key={item.key} type="button" className={className} onClick={item.onClick} aria-label={item.label}>
              {body}
            </button>
          );
        }

        return (
          <Link key={item.key} to={item.to} className={className} aria-label={item.label}>
            {body}
          </Link>
        );
      })}
    </nav>
  );
}
