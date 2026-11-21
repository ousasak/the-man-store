import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import {
  goTelegramMiniAppBack,
  isTelegramMiniAppHomePath,
} from "../../lib/telegramMiniApp.js";

export default function TelegramMiniAppBackController({ cartOpen = false, onCloseCart }) {
  const location = useLocation();
  const navigate = useNavigate();
  const atHome = isTelegramMiniAppHomePath(location.pathname);
  const showNativeBack = cartOpen || !atHome;

  useEffect(() => {
    let onClick;
    let cancelled = false;
    let intervalId;
    let timeoutId;

    const apply = () => {
      const button = window.Telegram?.WebApp?.BackButton;
      if (!button || cancelled) return false;

      if (onClick) {
        try {
          button.offClick?.(onClick);
        } catch {
          /* ignore */
        }
      }

      onClick = () => goTelegramMiniAppBack(navigate, { cartOpen, onCloseCart });
      button.onClick(onClick);
      if (showNativeBack) button.show();
      else button.hide();
      return true;
    };

    if (!apply()) {
      intervalId = window.setInterval(() => {
        if (apply()) window.clearInterval(intervalId);
      }, 250);
      timeoutId = window.setTimeout(() => window.clearInterval(intervalId), 4000);
    }

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      if (timeoutId) window.clearTimeout(timeoutId);
      const button = window.Telegram?.WebApp?.BackButton;
      if (onClick) {
        try {
          button?.offClick?.(onClick);
        } catch {
          /* ignore */
        }
      }
    };
  }, [showNativeBack, cartOpen, navigate, onCloseCart, location.pathname, location.search]);

  if (atHome) return null;

  return (
    <div className="fs-tg-mini-back">
      <button
        type="button"
        className="fs-tg-mini-back__btn"
        onClick={() => goTelegramMiniAppBack(navigate, { cartOpen, onCloseCart })}
        aria-label="Back"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
        <span>Back</span>
      </button>
    </div>
  );
}
