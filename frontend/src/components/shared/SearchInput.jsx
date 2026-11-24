import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n.jsx';

/**
 * Standardized Search Input component
 * Height: h-10, rounded-xl, clearable, debounced
 */
export function SearchInput({
  value = '',
  onChange,
  placeholder,
  debounceMs = 300,
  className = '',
  autoFocus = false,
  ...props
}) {
  const { t } = useLanguage();
  const resolvedPlaceholder = placeholder || t('common.actions.search') || 'Search...';
  const [internalValue, setInternalValue] = useState(value);

  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  useEffect(() => {
    if (debounceMs <= 0) return;
    const timer = setTimeout(() => {
      if (internalValue !== value && onChange) {
        onChange(internalValue);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [internalValue, debounceMs]);

  const handleChange = (e) => {
    const val = e.target.value;
    setInternalValue(val);
    if (debounceMs <= 0 && onChange) {
      onChange(val);
    }
  };

  const handleClear = () => {
    setInternalValue('');
    if (onChange) onChange('');
  };

  return (
    <div className={`relative flex items-center min-w-[220px] max-w-md w-full ${className}`}>
      <Search className="absolute left-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={internalValue}
        onChange={handleChange}
        placeholder={resolvedPlaceholder}
        autoFocus={autoFocus}
        className="w-full h-10 pl-10 pr-9 text-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40 focus:border-[#C59B27] transition-all"
        {...props}
      />
      {internalValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          title={t('common.actions.clear') || 'Clear search'}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default SearchInput;
