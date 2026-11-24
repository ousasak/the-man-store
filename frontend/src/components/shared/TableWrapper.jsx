import React from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n.jsx';

/**
 * Standardized responsive table container with horizontal scroll, loading skeleton, and empty state
 */
export function TableWrapper({
  children,
  isLoading = false,
  isEmpty = false,
  emptyMessage,
  emptyIcon,
  className = '',
}) {
  const { t } = useLanguage();
  const resolvedEmpty = emptyMessage || t('common.messages.noData') || 'No data found';
  return (
    <div className={`w-full overflow-hidden rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm ${className}`}>
      <div className="w-full overflow-x-auto relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-[1px] flex items-center justify-center z-20">
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-gray-700">
              <Loader2 className="w-5 h-5 text-[#C59B27] animate-spin" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('common.messages.loading') || 'Loading...'}
              </span>
            </div>
          </div>
        )}

        {children}

        {isEmpty && !isLoading && (
          <div className="py-16 px-4 text-center flex flex-col items-center justify-center">
            {emptyIcon ? (
              emptyIcon
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800/60 flex items-center justify-center text-gray-400 mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
            )}
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {resolvedEmpty}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default TableWrapper;
