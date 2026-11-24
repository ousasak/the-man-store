import React from "react";
import { Download } from "lucide-react";
import { useLanguage } from "@/lib/i18n.jsx";
import { AdminDashboardLoader } from "./AdminLoading.jsx";

/**
 * Global Admin Export Button
 * Unified styling matching AdminRefreshButton, AdminFilterToolbarButton, etc.
 * Supports CSV/file export with selected item counts, tooltips, loading spinners, and dark mode.
 */
export default function AdminExportButton({
  onClick,
  loading = false,
  disabled = false,
  label,
  selectedCount = 0,
  totalCount,
  title,
  size = "md", // "sm" | "md" | "lg"
  iconOnly = false,
  icon: CustomIcon,
  className = "",
  ...props
}) {
  const { t } = useLanguage();

  let resolvedLabel = label;
  if (!resolvedLabel) {
    if (selectedCount > 0) {
      resolvedLabel =
        t("inventory.exportCsvCount", { count: selectedCount }) ||
        t("common.actions.exportCsvCount", { count: selectedCount }) ||
        `Export CSV (${selectedCount})`;
    } else {
      resolvedLabel =
        t("inventory.exportCsvAll") ||
        t("common.actions.exportCsvAll") ||
        "Export CSV (all)";
    }
  }

  let resolvedTitle = title;
  if (!resolvedTitle) {
    if (selectedCount > 0) {
      resolvedTitle = t("inventory.exportSelectedHint", `Export ${selectedCount} selected item(s)`, { count: selectedCount });
    } else if (totalCount != null) {
      resolvedTitle = t("inventory.exportAllHint", `Export all ${totalCount} item(s) matching current filters`, { count: totalCount });
    } else {
      resolvedTitle = resolvedLabel;
    }
  }

  const sizeClasses =
    size === "sm"
      ? iconOnly
        ? "h-9 w-9 p-0"
        : "h-9 px-3 text-xs font-semibold gap-1.5"
      : size === "lg"
      ? iconOnly
        ? "h-11 w-11 p-0"
        : "h-11 px-4 text-base font-semibold gap-2.5"
      : iconOnly
      ? "h-10 w-10 p-0"
      : "h-10 px-3.5 text-sm font-semibold gap-2";

  const loaderSize = size === "sm" ? 14 : size === "lg" ? 20 : 16;
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";

  const IconComponent = CustomIcon || Download;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={resolvedTitle}
      aria-label={resolvedTitle}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 ${sizeClasses} ${className}`.trim()}
      {...props}
    >
      {loading ? (
        <AdminDashboardLoader size={loaderSize} />
      ) : (
        <IconComponent className={`${iconSize} shrink-0 text-slate-500 dark:text-slate-400`} aria-hidden />
      )}
      {!iconOnly && <span>{resolvedLabel}</span>}
    </button>
  );
}

export { AdminExportButton };
