import React, { useState, useRef, useEffect } from 'react';
import { Columns3, Check, RotateCcw } from 'lucide-react';
import { useLanguage } from '@/lib/i18n.jsx';

/**
 * ColumnSettingsPopover allows users to toggle table column visibility
 * with localStorage persistence.
 */
export function ColumnSettingsPopover({
  columns = [],
  visibleColumns = [],
  onToggleColumn,
  onResetColumns,
  storageKey = '',
  className = '',
}) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`relative inline-block ${className}`} ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-10 px-3 inline-flex items-center gap-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm"
        title={t('common.table.columns') || 'Columns'}
      >
        <Columns3 className="w-4 h-4 text-gray-500" />
        <span className="hidden sm:inline">{t('common.table.columns') || 'Columns'}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 p-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('common.table.columns') || 'Columns'}
            </span>
            {onResetColumns && (
              <button
                type="button"
                onClick={onResetColumns}
                className="text-xs text-[#C59B27] hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('common.actions.reset') || 'Reset'}</span>
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1 py-1">
            {columns.map((col) => {
              const isVisible = visibleColumns.includes(col.id || col.key);
              const isDisabled = col.required || false;

              return (
                <label
                  key={col.id || col.key}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm cursor-pointer select-none transition-colors ${
                    isDisabled
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                  }`}
                >
                  <span className="text-gray-700 dark:text-gray-200 font-medium">
                    {col.label || col.title}
                  </span>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                      isVisible
                        ? 'bg-[#C59B27] border-[#C59B27] text-white'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {isVisible && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={isVisible}
                    disabled={isDisabled}
                    onChange={() => onToggleColumn && onToggleColumn(col.id || col.key)}
                    className="sr-only"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ColumnSettingsPopover;
