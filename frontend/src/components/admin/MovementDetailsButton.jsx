import React from "react";
import { ScrollText } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

export default function MovementDetailsButton({ onClick, compact = false, label = null }) {
  const { t } = useTranslation();
  const displayLabel = label || t("inventory.details", "Details");
  const detailsTitle = t("inventory.movementDetails", "Movement details");

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label={detailsTitle}
        title={displayLabel}
      >
        <ScrollText className="h-3.5 w-3.5" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      title={detailsTitle}
    >
      <ScrollText className="h-3.5 w-3.5" aria-hidden />
      {displayLabel}
    </button>
  );
}
