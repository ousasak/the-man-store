import React from "react";
import { useLanguage } from "../../lib/i18n.jsx";
import CloseButton from "./CloseButton.jsx";

const variantStyles = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  primary: "bg-[rgba(var(--admin-primary-rgb,197,155,39),0.1)] text-[color:var(--admin-primary,#C59B27)] border-[color:var(--admin-primary,#C59B27)]/20",
  slate: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

/**
 * Standard ModalHeader Component cloned from pos-ecommerce (merchant-khposcommerce)
 *
 * @param {object} props
 * @param {React.ReactNode} props.title Main title of the modal
 * @param {React.ReactNode} [props.subtitle] Subtitle or explanatory text
 * @param {React.ReactNode} [props.icon] Leading icon component
 * @param {'emerald'|'blue'|'indigo'|'purple'|'violet'|'cyan'|'sky'|'amber'|'orange'|'rose'|'primary'|'slate'} [props.iconVariant='primary']
 * @param {React.ReactNode} [props.badge] Optional status badge
 * @param {() => void} [props.onClose] Close callback
 * @param {boolean} [props.showClose=true] Whether to show close button
 * @param {React.ReactNode} [props.actions] Optional top right actions before close button
 * @param {string} [props.className='']
 */
export function ModalHeader({
  title,
  subtitle,
  icon,
  iconVariant = "primary",
  badge,
  onClose,
  showClose = true,
  actions,
  className = "",
}) {
  const { t } = useLanguage();

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === "function") {
      return React.createElement(icon, { size: 20, className: "w-5 h-5" });
    }
    return icon;
  };

  return (
    <div
      className={`relative flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 shrink-0 ${className}`}
    >
      {/* Left side: Icon + Title & Subtitle */}
      <div className="flex items-center gap-3 min-w-0 flex-1 pr-12 sm:pr-14">
        {icon && (
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs ${
              variantStyles[iconVariant] || variantStyles.primary
            }`}
          >
            {renderIcon()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {title}
            </h3>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl line-clamp-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right corner: Actions & Close Button anchored tight to the corner */}
      <div className="absolute top-3.5 right-4 sm:top-4 sm:right-4 flex items-center gap-2 z-10">
        {actions}
        {showClose && onClose && (
          <CloseButton onClose={onClose} size="md" variant="default" />
        )}
      </div>
    </div>
  );
}

export default ModalHeader;
