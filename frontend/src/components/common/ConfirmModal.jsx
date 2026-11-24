import React from 'react';
import { AlertCircle, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n.jsx';
import { CloseButton } from './CloseButton.jsx';

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText,
  variant = 'gold', // 'gold' | 'danger'
  isLoading = false,
}) {
  const { t } = useLanguage();
  if (!isOpen) return null;

  const resolvedTitle = title || t('common.actions.confirm') || 'Confirm';
  const resolvedDesc = description || t('common.messages.confirmDelete') || 'Are you sure you want to proceed?';
  const resolvedConfirm = confirmText || (variant === 'danger' ? (t('common.actions.delete') || 'Delete') : (t('common.actions.confirm') || 'Confirm'));
  const resolvedCancel = cancelText || t('common.actions.cancel') || 'Cancel';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md p-6 bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-150">
        <CloseButton
          onClose={onClose}
          size="sm"
          variant="default"
          className="absolute top-4 right-4"
        />

        <div className="flex items-center gap-3.5 mb-4">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              variant === 'danger'
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600'
                : 'bg-[#C59B27]/15 text-[#C59B27]'
            }`}
          >
            {variant === 'danger' ? <Trash2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {resolvedTitle}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {t('common.messages.cannotBeUndone') || 'This action cannot be undone'}
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
          {resolvedDesc}
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="h-10 px-4 text-sm font-semibold rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
          >
            {resolvedCancel}
          </button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            variant={variant === 'danger' ? 'destructive' : 'default'}
          >
            {isLoading ? (t('common.messages.processing') || 'Processing...') : resolvedConfirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  itemName = '',
  isLoading = false,
}) {
  const { t } = useLanguage();
  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t('common.actions.delete') || 'Delete'}
      description={itemName ? `${t('common.messages.confirmDelete')} (${itemName})` : (t('common.messages.confirmDelete') || 'Are you sure you want to delete this item?')}
      confirmText={t('common.actions.delete') || 'Delete'}
      cancelText={t('common.actions.cancel') || 'Cancel'}
      variant="danger"
      isLoading={isLoading}
    />
  );
}

export default ConfirmModal;
