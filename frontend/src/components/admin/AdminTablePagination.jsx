import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPaginationPages } from "../../lib/adminListQuery.js";

/**
 * Compact numbered pagination — Previous · 1 2 3 4 5 … 10 · Next
 */
export default function AdminTablePagination({ page, lastPage, onPageChange, className = "" }) {
  const items = useMemo(() => buildPaginationPages(page, lastPage), [page, lastPage]);

  if (lastPage <= 1) return null;

  return (
    <nav
      aria-label="Table pagination"
      className={`flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row md:px-6 md:py-4 bg-card/50 ${className}`.trim()}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="h-9 gap-1 font-medium"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
        Previous
      </Button>

      <div className="flex flex-wrap items-center justify-center gap-1">
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-sm font-semibold text-muted-foreground"
              aria-hidden
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={item === page ? "default" : "ghost"}
              onClick={() => onPageChange(item)}
              className={`h-9 min-w-9 px-2.5 text-sm tabular-nums font-semibold ${
                item === page ? "shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={`Page ${item}`}
              aria-current={item === page ? "page" : undefined}
            >
              {item}
            </Button>
          ),
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= lastPage}
        onClick={() => onPageChange(page + 1)}
        className="h-9 gap-1 font-medium"
        aria-label="Next page"
      >
        Next
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
      </Button>
    </nav>
  );
}
