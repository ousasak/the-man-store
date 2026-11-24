import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPaginationPages } from "../../lib/adminListQuery.js";
import { useLanguage } from "../../lib/i18n.jsx";
import { useTheme } from "@/state/theme.jsx";

/**
 * Modern Clean Admin Table Pagination:
 * - Left side: Record range & total summary (e.g. "បង្ហាញ 1 ដល់ 15 នៃ 80")
 * - Right side: Unified control group ([< មុន] [1] [2] ... [បន្ទាប់ >])
 */
export default function AdminTablePagination({
  page,
  lastPage,
  total = 0,
  pageSize,
  pageSizeOptions = [10, 15, 25, 50],
  onPageChange,
  onPageSizeChange,
  className = "",
}) {
  const { t, language } = useLanguage();
  const { primaryColor } = useTheme();
  const isKm = String(language || "").toLowerCase().startsWith("k");
  const items = useMemo(() => buildPaginationPages(page, lastPage), [page, lastPage]);

  if (lastPage <= 1 && (!total || total <= (pageSize || 15))) return null;

  const actualPageSize = pageSize || (total && lastPage ? Math.ceil(total / lastPage) : 15);
  const from = total > 0 ? (page - 1) * actualPageSize + 1 : (page - 1) * actualPageSize + 1;
  const to = total > 0 ? Math.min(page * actualPageSize, total) : page * actualPageSize;

  return (
    <nav
      aria-label={t("common.table.pagination") || "Table pagination"}
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 md:px-6 py-3 transition-colors ${className}`.trim()}
    >
      {/* Left side: Item count summary & per-page selector */}
      <div className="flex flex-wrap items-center gap-3 text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium">
        {total > 0 ? (
          <span>
            {isKm ? (
              <>
                បង្ហាញ <strong className="font-bold text-slate-900 dark:text-white">{from}</strong> ដល់{" "}
                <strong className="font-bold text-slate-900 dark:text-white">{to}</strong> នៃសរុប{" "}
                <strong className="font-bold text-slate-900 dark:text-white">{total}</strong>
              </>
            ) : (
              <>
                Showing <strong className="font-bold text-slate-900 dark:text-white">{from}</strong> to{" "}
                <strong className="font-bold text-slate-900 dark:text-white">{to}</strong> of{" "}
                <strong className="font-bold text-slate-900 dark:text-white">{total}</strong>
              </>
            )}
          </span>
        ) : (
          <span>
            {isKm ? (
              <>
                ទំព័រ <strong className="font-bold text-slate-900 dark:text-white">{page}</strong> នៃ{" "}
                <strong className="font-bold text-slate-900 dark:text-white">{lastPage}</strong>
              </>
            ) : (
              <>
                Page <strong className="font-bold text-slate-900 dark:text-white">{page}</strong> of{" "}
                <strong className="font-bold text-slate-900 dark:text-white">{lastPage}</strong>
              </>
            )}
          </span>
        )}

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-700 pl-3">
            <span className="text-xs text-slate-500">
              {isKm ? "ក្នុងមួយទំព័រ:" : "Per page:"}
            </span>
            <select
              value={actualPageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7.5 px-2 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none cursor-pointer focus:border-[var(--admin-primary)]"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right side: Grouped pagination controls (Balanced Medium) */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-9 px-3 gap-1 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 text-xs sm:text-[13px] font-semibold shadow-2xs transition-colors"
          aria-label={t("common.actions.previous") || "Previous page"}
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">{t("common.actions.previous", "មុន")}</span>
        </Button>

        <div className="flex items-center gap-1">
          {items.map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="inline-flex h-9 min-w-[28px] items-center justify-center text-xs font-bold text-slate-400 dark:text-slate-500"
                aria-hidden
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                className={`h-9 min-w-[36px] px-2.5 rounded-lg text-xs sm:text-[13px] font-bold transition-all duration-150 tabular-nums ${
                  item === page
                    ? "text-white shadow-xs"
                    : "border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
                style={
                  item === page
                    ? { backgroundColor: primaryColor || "var(--admin-primary, #C59B27)" }
                    : {}
                }
                aria-label={`${t("page", "Page")} ${item}`}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </button>
            )
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
          className="h-9 px-3 gap-1 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 text-xs sm:text-[13px] font-semibold shadow-2xs transition-colors"
          aria-label={t("common.actions.next") || "Next page"}
        >
          <span className="hidden sm:inline">{t("common.actions.next", "បន្ទាប់")}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
