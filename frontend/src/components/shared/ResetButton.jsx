import React from 'react';
import { RotateCcw } from 'lucide-react';
import { useLanguage } from '@/lib/i18n.jsx';

/**
 * Standardized Filter Reset Button
 * Height: h-10, rounded-xl
 */
export function ResetButton({
  onClick,
  children,
  disabled = false,
  className = '',
  ...props
}) {
  const { t } = useLanguage();
  const label = children || t('common.actions.reset') || 'Reset';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-10 px-3.5 inline-flex items-center justify-center gap-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800/80 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all shadow-sm ${className}`}
      {...props}
    >
      <RotateCcw className="w-3.5 h-3.5 text-gray-500 group-hover:rotate-[-45deg] transition-transform" />
      <span>{label}</span>
    </button>
  );
}

export default ResetButton;
