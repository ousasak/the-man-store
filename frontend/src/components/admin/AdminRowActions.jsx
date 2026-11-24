import React from "react";
import { Eye, Pencil, FileText, Printer, Trash2, Copy } from "lucide-react";
import { useTheme } from "../../state/theme.jsx";
import { useLanguage } from "../../lib/i18n.jsx";

/**
 * Standard sizes for row action buttons
 */
const SIZE_CONFIGS = {
  xs: {
    btn: "h-7 w-7 rounded-md",
    icon: "w-3.5 h-3.5",
  },
  sm: {
    btn: "h-8 w-8 rounded-lg",
    icon: "w-4 h-4",
  },
  md: {
    btn: "h-9 w-9 rounded-lg",
    icon: "w-4 h-4",
  },
  lg: {
    btn: "h-10 w-10 rounded-lg",
    icon: "w-4.5 h-4.5",
  },
};

/**
 * Single Admin Action Button with standard admin styling
 */
export function AdminActionButton({
  icon,
  title,
  ariaLabel,
  onClick,
  disabled = false,
  variant = "default", // 'default' | 'danger' | 'primary' | 'subtle'
  size = "md",
  className = "",
  style = {},
  type = "button",
  ...rest
}) {
  const sizeConfig = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;
  
  let mode = "light";
  try {
    const themeContext = useTheme();
    if (themeContext?.mode) mode = themeContext.mode;
  } catch {
    if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
      mode = "dark";
    }
  }

  // Base shared styles
  let variantClasses = "";
  let computedStyle = { ...style };

  if (variant === "danger") {
    const isDark = mode === "dark";
    computedStyle = {
      color: isDark ? "#fca5a5" : "#dc2626",
      border: `1px solid ${isDark ? "#fca5a5" : "#fecaca"}`,
      backgroundColor: isDark ? "rgba(248,113,113,0.12)" : "#fff",
      cursor: disabled ? "not-allowed" : "pointer",
      ...style,
    };
    variantClasses = "hover:bg-rose-50 dark:hover:bg-[rgba(248,113,113,0.22)] shadow-2xs";
  } else if (variant === "primary") {
    variantClasses =
      "text-white bg-[color:var(--admin-primary)] hover:opacity-95 border border-[color:var(--admin-primary)] shadow-2xs";
  } else if (variant === "subtle") {
    variantClasses =
      "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent";
  } else {
    // Default action style (View, Edit, Invoice, etc.)
    variantClasses =
      "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-[rgba(var(--admin-primary-rgb),0.12)] border admin-border admin-surface shadow-2xs";
  }

  return (
    <button
      type={type}
      onClick={(e) => {
        if (disabled) return;
        if (onClick) onClick(e);
      }}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel || title}
      style={computedStyle}
      className={`inline-flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${sizeConfig.btn} ${variantClasses} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  );
}

/**
 * Standard Delete Action Button
 */
export function AdminDeleteButton({
  onClick,
  title,
  ariaLabel,
  disabled = false,
  size = "md",
  className = "",
  style = {},
  icon,
  ...rest
}) {
  const { t } = useLanguage();
  const resolvedTitle = title || t("common.actions.delete") || "Delete";
  const sizeConfig = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;
  return (
    <AdminActionButton
      type="button"
      onClick={onClick}
      title={resolvedTitle}
      ariaLabel={ariaLabel || resolvedTitle}
      disabled={disabled}
      variant="danger"
      size={size}
      className={className}
      style={style}
      icon={icon || <Trash2 className={sizeConfig.icon} />}
      {...rest}
    />
  );
}

/**
 * AdminRowActions
 * 
 * Global standardized row actions component matching the Orders page design.
 * Provides consistent View, Edit, Invoice, Print, Delete, and custom action buttons.
 */
export default function AdminRowActions({
  // Action Handlers
  onView,
  onEdit,
  onInvoice,
  onPrint,
  onCopy,
  onDelete,

  // Permission Flags (default to true if handler exists, or explicit boolean)
  canView = true,
  canEdit = true,
  canInvoice = true,
  canPrint = true,
  canCopy = true,
  canDelete = true,

  // Tooltitles and Labels
  viewTitle,
  editTitle,
  invoiceTitle,
  printTitle,
  copyTitle,
  deleteTitle,

  // Custom Icons (optional overrides)
  viewIcon,
  editIcon,
  invoiceIcon,
  printIcon,
  copyIcon,
  deleteIcon,

  // Delete status
  deleteDisabled = false,
  deleteDisabledReason,

  // Extra Custom Action Items
  // Array of: { key, icon, title, onClick, disabled, variant, className, style, show }
  extraActions = [],

  // Layout & Sizing
  size = "md",
  align = "end", // 'end' | 'start' | 'center'
  gap = "gap-1.5",
  className = "",
  style = {},
  children,
  stopPropagation = false,
  ...props
}) {
  const sizeConfig = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;
  const { t } = useLanguage();

  const resolvedViewTitle = viewTitle || t("common.actions.view") || "View";
  const resolvedEditTitle = editTitle || t("common.actions.edit") || "Edit";
  const resolvedInvoiceTitle = invoiceTitle || t("invoice") || "Invoice";
  const resolvedPrintTitle = printTitle || t("common.actions.print") || "Print";
  const resolvedCopyTitle = copyTitle || t("common.actions.copy") || "Duplicate";
  const resolvedDeleteTitle = deleteTitle || t("common.actions.delete") || "Delete";

  const alignClass =
    align === "start"
      ? "justify-start"
      : align === "center"
      ? "justify-center"
      : "justify-end";

  const handleContainerClick = (e) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
  };

  return (
    <div
      onClick={handleContainerClick}
      style={style}
      className={`flex items-center ${alignClass} ${gap} ${className}`}
      {...props}
    >
      {/* 1. View Action */}
      {onView && canView ? (
        <AdminActionButton
          onClick={onView}
          title={resolvedViewTitle}
          size={size}
          icon={viewIcon || <Eye className={sizeConfig.icon} />}
        />
      ) : null}

      {/* 2. Edit Action */}
      {onEdit && canEdit ? (
        <AdminActionButton
          onClick={onEdit}
          title={resolvedEditTitle}
          size={size}
          icon={editIcon || <Pencil className={sizeConfig.icon} />}
        />
      ) : null}

      {/* 3. Invoice Action */}
      {onInvoice && canInvoice ? (
        <AdminActionButton
          onClick={onInvoice}
          title={resolvedInvoiceTitle}
          size={size}
          icon={invoiceIcon || <FileText className={sizeConfig.icon} />}
        />
      ) : null}

      {/* 4. Print Action */}
      {onPrint && canPrint ? (
        <AdminActionButton
          onClick={onPrint}
          title={resolvedPrintTitle}
          size={size}
          icon={printIcon || <Printer className={sizeConfig.icon} />}
        />
      ) : null}

      {/* 5. Copy / Duplicate Action */}
      {onCopy && canCopy ? (
        <AdminActionButton
          onClick={onCopy}
          title={resolvedCopyTitle}
          size={size}
          icon={copyIcon || <Copy className={sizeConfig.icon} />}
        />
      ) : null}

      {/* 6. Extra Custom Actions */}
      {Array.isArray(extraActions) &&
        extraActions.map((act, index) => {
          if (act.show === false) return null;
          return (
            <AdminActionButton
              key={act.key || index}
              onClick={act.onClick}
              title={act.title}
              ariaLabel={act.ariaLabel}
              disabled={act.disabled}
              variant={act.variant || "default"}
              size={size}
              icon={act.icon}
              className={act.className}
              style={act.style}
            />
          );
        })}

      {/* 7. Children for inline custom buttons */}
      {children}

      {/* 8. Delete Action */}
      {onDelete && canDelete ? (
        <AdminDeleteButton
          onClick={onDelete}
          title={deleteDisabled && deleteDisabledReason ? deleteDisabledReason : resolvedDeleteTitle}
          ariaLabel={resolvedDeleteTitle}
          disabled={deleteDisabled}
          size={size}
          icon={deleteIcon || <Trash2 className={sizeConfig.icon} />}
        />
      ) : null}
    </div>
  );
}

export { AdminCloseButton, CloseButton } from "./AdminCloseButton.jsx";
