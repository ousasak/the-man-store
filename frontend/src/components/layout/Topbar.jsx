import React from "react";
import { useHomepageSettings } from "../../state/homepageSettings.jsx";
import { useLanguage } from "../../lib/i18n.jsx";

export default function Topbar() {
  const { settings } = useHomepageSettings();
  const { t } = useLanguage();
  const headerSettings = settings?.header || {};
  const icon = headerSettings.free_delivery_icon || "🚚";
  const defaultMsg = "Free delivery on order above $40 spent";
  const rawMsg = headerSettings.free_delivery_text;
  const message = (!rawMsg || rawMsg === defaultMsg)
    ? (t("freeDelivery") || defaultMsg)
    : rawMsg;

  return (
    <div className="border-b border-zinc-200 bg-white">
      <div className="container-safe h-9 flex items-center justify-center text-xs text-zinc-700">
        <span className="animate-pulse mr-2">{icon}</span>
        {message}
      </div>
    </div>
  );
}
