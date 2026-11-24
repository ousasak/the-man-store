import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pushAdminModalChrome, popAdminModalChrome } from "../../lib/adminDarkChrome.js";
import { useLanguage } from "../../lib/i18n.jsx";
import { AdminCloseButton, CloseButton } from "./AdminCloseButton.jsx";

export { AdminCloseButton, CloseButton };

/**
 * Shared admin dialog shell: blurred page overlay + dimmed sidebar (data-admin-modal).
 */
export default function AdminModal({
  open,
  onClose,
  title,
  /** Optional icon node shown beside the title (e.g. lucide icon in a rounded box). */
  titleIcon = null,
  titleId: titleIdProp,
  children,
  maxWidthClass = "max-w-3xl",
  maxHeightClass = "max-h-[90vh]",
  zIndexClass = "z-50",
  initialFocusSelector = "button, select, input, textarea, [href]",
  closeOnBackdrop = true,
  /** "sheet" = top-aligned, near full viewport height. */
  variant = "default",
}) {
  const autoId = useId();
  const { t } = useLanguage();
  const titleId = titleIdProp || `admin-modal-title-${autoId}`;
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    pushAdminModalChrome();
    const t = window.setTimeout(() => {
      ref.current?.querySelector(initialFocusSelector)?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      popAdminModalChrome();
    };
  }, [open, initialFocusSelector]);

  if (!open) return null;

  const isSheet = variant === "sheet";

  return (
    <div
      ref={ref}
      className={`fixed inset-0 ${zIndexClass} flex justify-center ${
        isSheet ? "items-start px-3 pb-3 pt-3 sm:px-4 sm:pt-4" : "items-center p-4"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        className={`relative flex w-full flex-col rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 ${
          isSheet
            ? `${maxWidthClass} h-[calc(100dvh-1.5rem)] max-h-[calc(100dvh-1.5rem)]`
            : `${maxWidthClass} ${maxHeightClass} overflow-y-auto`
        }`}
      >
        <div
          className={
            isSheet
              ? "flex min-h-0 flex-1 flex-col overflow-hidden p-5 sm:p-6"
              : "overflow-y-auto p-6"
          }
        >
          {title ? (
            <div className={`flex shrink-0 items-center justify-between gap-3 ${isSheet ? "mb-4" : "mb-6"}`}>
              <div className="flex min-w-0 items-center gap-3">
                {titleIcon ? (
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[color:var(--admin-primary)] dark:border-slate-700 dark:bg-slate-800"
                    aria-hidden
                  >
                    {titleIcon}
                  </div>
                ) : null}
                <h2
                  id={titleId}
                  className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white"
                >
                  {title}
                </h2>
              </div>
              <AdminCloseButton onClose={onClose} size="md" variant="default" />
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}

export function AdminConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
}) {
  const { t } = useLanguage();
  const resolvedConfirm = confirmLabel || t("common.actions.confirm", "Confirm");
  const resolvedCancel = cancelLabel || t("common.actions.cancel", "Cancel");

  return (
    <AdminModal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      maxWidthClass="max-w-md"
      initialFocusSelector="button"
      closeOnBackdrop={!busy}
    >
      {message ? (
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{message}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          disabled={busy}
          variant="outline"
          onClick={onClose}
        >
          {resolvedCancel}
        </Button>
        <Button
          type="button"
          disabled={busy}
          variant={destructive ? "destructive" : "default"}
          onClick={onConfirm}
        >
          {resolvedConfirm}
        </Button>
      </div>
    </AdminModal>
  );
}
