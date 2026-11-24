import React from 'react';

/**
 * Standardized status badge chip with semantic colors
 * Variants: active/success, warning/pending, danger/failed, info, neutral
 */
const VARIANT_MAP = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60',
  pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60',
  danger: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60',
  error: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  info: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60',
  gold: 'bg-[#C59B27]/10 text-[#C59B27] border-[#C59B27]/30 dark:bg-[#C59B27]/20 dark:text-[#E2BD5A]',
};

export function StatusBadge({
  status,
  label,
  variant = 'neutral',
  dot = true,
  className = '',
}) {
  const chosenVariant = VARIANT_MAP[variant] || VARIANT_MAP[status] || VARIANT_MAP.inactive;
  const displayLabel = label || status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${chosenVariant} ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />}
      <span className="capitalize">{displayLabel}</span>
    </span>
  );
}

export default StatusBadge;
