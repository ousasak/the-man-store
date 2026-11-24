import React from "react";
import { X } from "lucide-react";
import { useLanguage } from "../../lib/i18n.jsx";

/**
 * Standard sizes cloned from pos-ecommerce (merchant-khposcommerce)
 */
const sizeStyles = {
  xs: {
    button: "w-6 h-6 min-w-[24px] min-h-[24px]",
    icon: 13,
  },
  sm: {
    button: "w-7 h-7 min-w-[28px] min-h-[28px]",
    icon: 14,
  },
  md: {
    button: "w-8 h-8 min-w-[32px] min-h-[32px]",
    icon: 15,
  },
  lg: {
    button: "w-9.5 h-9.5 min-w-[38px] min-h-[38px]",
    icon: 17,
  },
};

/**
 * Standard shape styles cloned from pos-ecommerce
 */
const shapeStyles = {
  circle: "rounded-full",
  rounded: "rounded-xl",
  full: "rounded-full",
  default: "rounded-full",
  lg: "rounded-2xl",
  md: "rounded-lg",
  sm: "rounded-md",
};

/**
 * Clean, high-end enterprise color schemes cloned from pos-ecommerce
 * (crisp resting state + rich hover highlight with Apple/macOS rose style as default)
 */
const colorStyles = {
  // 1. Apple/macOS Style Subtle Rose Accent (Default Dismiss Button in pos-ecommerce)
  rose: {
    base: "bg-slate-100/90 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 border-slate-200/90 dark:border-slate-700/90",
    hover:
      "hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800/80 hover:shadow-xs hover:shadow-rose-500/10",
    active:
      "active:bg-rose-100 dark:active:bg-rose-900/60 active:border-rose-300 active:scale-95",
    ring: "focus-visible:ring-rose-500/30",
  },
  default: {
    base: "bg-slate-100/90 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 border-slate-200/90 dark:border-slate-700/90",
    hover:
      "hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800/80 hover:shadow-xs hover:shadow-rose-500/10",
    active:
      "active:bg-rose-100 dark:active:bg-rose-900/60 active:border-rose-300 active:scale-95",
    ring: "focus-visible:ring-rose-500/30",
  },
  // 2. Corporate Primary Indigo / Brand Gold Accent
  primary: {
    base: "bg-slate-100/90 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 border-slate-200/90 dark:border-slate-700/90",
    hover:
      "hover:bg-[rgba(var(--admin-primary-rgb,197,155,39),0.1)] hover:text-[color:var(--admin-primary,#C59B27)] hover:border-[color:var(--admin-primary,#C59B27)] hover:shadow-xs",
    active:
      "active:bg-[rgba(var(--admin-primary-rgb,197,155,39),0.2)] active:scale-95",
    ring: "focus-visible:ring-[color:var(--admin-primary,#C59B27)]/30",
  },
  // 3. Warm Amber Accent
  amber: {
    base: "bg-slate-100/90 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 border-slate-200/90 dark:border-slate-700/90",
    hover:
      "hover:bg-amber-50 dark:hover:bg-amber-950/50 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-200 dark:hover:border-amber-800/80 hover:shadow-xs hover:shadow-amber-500/10",
    active:
      "active:bg-amber-100 dark:active:bg-amber-900/60 active:border-amber-300 active:scale-95",
    ring: "focus-visible:ring-amber-500/30",
  },
  // 4. Emerald Accent
  emerald: {
    base: "bg-slate-100/90 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 border-slate-200/90 dark:border-slate-700/90",
    hover:
      "hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-200 dark:hover:border-emerald-800/80 hover:shadow-xs hover:shadow-emerald-500/10",
    active:
      "active:bg-emerald-100 dark:active:bg-emerald-900/60 active:border-emerald-300 active:scale-95",
    ring: "focus-visible:ring-emerald-500/30",
  },
  // 5. Neutral Slate
  slate: {
    base: "bg-slate-100/90 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 border-slate-200/90 dark:border-slate-700/90",
    hover:
      "hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-xs",
    active:
      "active:bg-slate-300 dark:active:bg-slate-600 active:scale-95",
    ring: "focus-visible:ring-slate-400/30",
  },
};

/**
 * Standard Global CloseButton Component
 *
 * Cloned directly from pos-ecommerce (merchant-khposcommerce) CloseButton design specification:
 * - High-end macOS/Apple subtle rose resting state + rich hover highlight
 * - Smooth micro-interaction on active press (active:scale-95)
 * - Accessible aria-label & localized tooltip (defaulting to "Close (ESC)" or Khmer "បិទ (ESC)")
 * - Flexible sizes (xs, sm, md, lg) and shapes (circle, rounded)
 *
 * @param {object} props
 * @param {() => void} [props.onClose] Close callback
 * @param {() => void} [props.onClick] Click callback
 * @param {'rose' | 'default' | 'primary' | 'amber' | 'emerald' | 'slate'} [props.color='rose']
 * @param {'default' | 'subtle' | 'ghost' | 'filled' | 'outline' | 'button'} [props.variant='default']
 * @param {'xs' | 'sm' | 'md' | 'lg'} [props.size='md']
 * @param {'circle' | 'rounded' | 'full' | 'default' | 'lg' | 'md' | 'sm'} [props.shape='circle']
 * @param {string} [props.rounded] Alias for shape
 * @param {boolean} [props.showShortcutHint=false]
 * @param {string} [props.tooltip] Tooltip string
 * @param {string} [props.title] Tooltip alias
 * @param {string} [props.ariaLabel] Accessible label
 * @param {boolean} [props.showText=false] Show text beside icon
 * @param {string} [props.label] Text label
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className='']
 * @param {React.ReactNode} [props.children] Optional custom child content
 */
export function CloseButton({
  onClose,
  onClick,
  color = "rose",
  variant = "default",
  size = "md",
  shape = "circle",
  rounded,
  showShortcutHint = false,
  tooltip,
  title,
  ariaLabel,
  showText = false,
  label,
  disabled = false,
  className = "",
  style = {},
  type = "button",
  children,
  ...rest
}) {
  const { t } = useLanguage();
  const defaultCloseText = t("common.actions.close", "Close (ESC)");
  const closeTitle = tooltip || title || label || defaultCloseText;
  const resolvedAriaLabel = ariaLabel || closeTitle;

  const currentSize = sizeStyles[size] || sizeStyles.md;
  const currentShape = shapeStyles[rounded || shape] || shapeStyles.circle;
  const currentScheme = colorStyles[color] || colorStyles.rose;

  const handleClick = (e) => {
    if (disabled) return;
    if (onClose) onClose();
    if (onClick) onClick(e);
  };

  // Variant overrides cloned from pos-ecommerce (ghost / subtle / filled / outline / button)
  let variantClasses = `${currentScheme.base} ${currentScheme.hover} ${currentScheme.active}`;
  if (variant === "ghost") {
    variantClasses = `bg-transparent border border-transparent ${currentScheme.hover} ${currentScheme.active}`;
  } else if (variant === "subtle") {
    variantClasses = `bg-slate-100/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 ${currentScheme.hover} ${currentScheme.active}`;
  } else if (variant === "filled") {
    variantClasses = `bg-slate-200/90 dark:bg-slate-700/90 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 ${currentScheme.hover} ${currentScheme.active}`;
  } else if (variant === "outline") {
    variantClasses = `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 ${currentScheme.hover} ${currentScheme.active}`;
  } else if (variant === "button") {
    variantClasses = `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold px-3 py-1.5 gap-2 shadow-2xs`;
  }

  const isTextMode = showText || Boolean(children);

  return (
    <button
      type={type}
      onClick={handleClick}
      aria-label={resolvedAriaLabel}
      title={closeTitle}
      disabled={disabled}
      style={style}
      className={`group relative inline-flex items-center justify-center shrink-0 border transition-all duration-150 cursor-pointer select-none focus:outline-hidden focus-visible:ring-2 ${
        currentScheme.ring
      } focus-visible:ring-offset-1 shadow-2xs ${
        isTextMode ? "h-8 px-3 rounded-lg text-xs gap-1.5" : currentSize.button
      } ${isTextMode ? "rounded-lg" : currentShape} ${variantClasses} ${
        disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : ""
      } ${className}`}
      {...rest}
    >
      <X
        size={currentSize.icon}
        strokeWidth={2.25}
        className="transition-colors duration-150 shrink-0"
        aria-hidden="true"
      />
      {isTextMode ? (
        <span className="truncate">{children || label || defaultCloseText}</span>
      ) : null}
      {showShortcutHint && !isTextMode && (
        <span className="sr-only">ESC</span>
      )}
    </button>
  );
}

export const AdminCloseButton = CloseButton;

export default CloseButton;
