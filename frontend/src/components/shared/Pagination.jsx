import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n.jsx';

/**
 * Standardized Pagination Component
 * Supports page changes, page size selector (10, 25, 50, 100), total count display
 */
export function Pagination({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 10,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  className = '',
}) {
  const { t, language } = useLanguage();
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 text-xs sm:text-sm text-gray-500 dark:text-gray-400 ${className}`}>
      {/* Items Count & Page Size */}
      <div className="flex items-center gap-3">
        <span>
          {language === 'km' ? (
            <>
              បង្ហាញ <strong className="text-gray-900 dark:text-white font-semibold">{startItem}</strong> ដល់ <strong className="text-gray-900 dark:text-white font-semibold">{endItem}</strong> នៃសរុប <strong className="text-gray-900 dark:text-white font-semibold">{totalItems}</strong>
            </>
          ) : (
            <>
              Showing <strong className="text-gray-900 dark:text-white font-semibold">{startItem}</strong> to <strong className="text-gray-900 dark:text-white font-semibold">{endItem}</strong> of <strong className="text-gray-900 dark:text-white font-semibold">{totalItems}</strong>
            </>
          )}
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 ml-2">
            <span className="hidden md:inline text-xs text-gray-400">
              {t('common.table.perPage') || 'Per page'}:
            </span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 px-2 py-0.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
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

      {/* Navigation Buttons */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          title={t('common.actions.first') || 'First page'}
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          title={t('common.actions.previous') || 'Previous'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="px-3 py-1 font-medium text-xs text-gray-700 dark:text-gray-200">
          {language === 'km' ? `ទំព័រ ${currentPage} នៃ ${totalPages || 1}` : `Page ${currentPage} of ${totalPages || 1}`}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          title={t('common.actions.next') || 'Next'}
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          title={t('common.actions.last') || 'Last page'}
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
