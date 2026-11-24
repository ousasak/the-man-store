import React from 'react';

/**
 * Standardized PageHeader component
 * Displays title, subtitle/description, badge, and optional action buttons.
 */
export function PageHeader({
  title,
  subtitle,
  badge,
  children,
  breadcrumbs,
  className = '',
}) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 mb-6 ${className}`}>
      <div>
        {breadcrumbs && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5 font-medium">
            {breadcrumbs}
          </div>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h1>
          {badge && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        )}
      </div>

      {children && (
        <div className="flex items-center flex-wrap gap-2.5 sm:self-center">
          {children}
        </div>
      )}
    </div>
  );
}

export default PageHeader;
