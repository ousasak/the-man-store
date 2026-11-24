import React from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n.jsx';

/**
 * BulkSelectionBanner: Floating banner displayed when one or more table rows are selected
 */
export function BulkSelectionBanner({
  selectedCount = 0,
  onClearSelection,
  children,
  className = '',
}) {
  const { t, language } = useLanguage();
  if (selectedCount === 0) return null;

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gray-900/95 dark:bg-gray-800/95 text-white shadow-2xl backdrop-blur-md border border-gray-700/50 animate-in fade-in slide-in-from-bottom-4 duration-200 ${className}`}
    >
      <div className="flex items-center gap-2 pr-3 border-r border-gray-700">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#C59B27] text-black font-bold text-xs">
          {selectedCount}
        </span>
        <span className="text-xs sm:text-sm font-medium">
          {language === 'km' ? `បានជ្រើសរើស (${selectedCount})` : `Selected (${selectedCount})`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {children}
      </div>

      {onClearSelection && (
        <button
          type="button"
          onClick={onClearSelection}
          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors ml-1"
          title={t('common.actions.clear') || 'Deselect all'}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default BulkSelectionBanner;
