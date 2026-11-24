import React from "react";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/lib/i18n.jsx";
import { AdminDashboardLoader } from "./AdminLoading.jsx";

/**
 * Global Admin Refresh Button
 * Provides unified styling, accessible labels, loading spinner, and dark mode support
 * across all admin pages.
 */
export default function AdminRefreshButton({
  onClick,
  loading = false,
  disabled = false,
  label,
  title,
  size = "md", // "sm" | "md" | "lg"
  iconOnly = false,
  className = "",
  ...props
}) {
  const { t } = useLanguage();
  const resolvedLabel = label ?? t("common.actions.refresh", "Refresh");
  const resolvedTitle = title ?? resolvedLabel;

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
        <RefreshCw className={`${iconSize} shrink-0 text-slate-500 dark:text-slate-400`} aria-hidden />
      )}
      {!iconOnly && <span>{resolvedLabel}</span>}
    </button>
  );
}

export { AdminRefreshButton };
