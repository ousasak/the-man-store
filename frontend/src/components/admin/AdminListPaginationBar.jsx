import React from "react";
import AdminTablePagination from "./AdminTablePagination.jsx";

/**
 * Numbered list footer — Previous · 1 2 3 … · Next
 */
export default function AdminListPaginationBar({
  page,
  lastPage,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onPrevious,
  onNext,
  className = "",
}) {
  if (lastPage <= 1 && (!total || total <= (pageSize || 15))) return null;

  const changePage = (target) => {
    if (typeof onPageChange === "function") {
      onPageChange(target);
      return;
    }
    if (target < page) onPrevious?.();
    else if (target > page) onNext?.();
  };

  return (
    <AdminTablePagination
      page={page}
      lastPage={lastPage}
      total={total}
      pageSize={pageSize}
      onPageChange={changePage}
      onPageSizeChange={onPageSizeChange}
      className={className}
    />
  );
}
