import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendLabel,
  trendDirection = 'up',
  className = '',
}) {
  const isTrendUp = trendDirection === 'up';

  return (
    <div className={`p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm relative overflow-hidden transition-all hover:shadow-md ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {title}
          </p>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {value}
          </h3>
        </div>
        {Icon && (
          <div className="p-2.5 rounded-xl bg-[#C59B27]/10 text-[#C59B27] shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {(trend || subtitle) && (
        <div className="mt-3.5 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={`inline-flex items-center gap-0.5 font-bold px-1.5 py-0.5 rounded-md ${
                isTrendUp
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
              }`}
            >
              {isTrendUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {trend}
            </span>
          )}
          {trendLabel && (
            <span className="text-gray-400 dark:text-gray-500 font-medium">{trendLabel}</span>
          )}
          {subtitle && !trendLabel && (
            <span className="text-gray-400 dark:text-gray-500">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default StatsCard;
