import React, { useEffect, useRef, useState } from "react";
import { getLanguage, useLanguage } from "./i18n.jsx";
import {
  errorAlert,
  loadingAlert,
  closeSwal,
  warningConfirm,
} from "./swal.js";

export const ADMIN_TOAST_EVENT = "admin:toast";

/**
 * Dispatches an application-wide Admin Toast notification.
 */
export function dispatchAdminToast({ type = "success", message, duration = 3000 }) {
  if (typeof window !== "undefined" && message) {
    window.dispatchEvent(
      new CustomEvent(ADMIN_TOAST_EVENT, { detail: { type, message, duration } })
    );
  }
}

/**
 * Standardized CRUD & notification messages generator.
 * Supports both Khmer (km/kh) and English (en).
 */
export const adminMessages = {
  created(entity = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    if (!entity) {
      return isKm ? "បានបង្កើតដោយជោគជ័យ!" : "Created successfully!";
    }
    return isKm
      ? `បានបង្កើត${entity}ដោយជោគជ័យ!`
      : `${entity} created successfully!`;
  },

  updated(entity = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    if (!entity) {
      return isKm ? "បានកែប្រែដោយជោគជ័យ!" : "Updated successfully!";
    }
    return isKm
      ? `បានកែប្រែ${entity}ដោយជោគជ័យ!`
      : `${entity} updated successfully!`;
  },

  deleted(entity = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    if (!entity) {
      return isKm ? "បានលុបដោយជោគជ័យ!" : "Deleted successfully!";
    }
    return isKm
      ? `បានលុប${entity}ដោយជោគជ័យ!`
      : `${entity} deleted successfully!`;
  },

  bulkDeleted(entity = "", count = 0, lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    if (!count) {
      return isKm
        ? `បានលុប${entity || "ទិន្នន័យ"}ដែលបានជ្រើសរើសដោយជោគជ័យ!`
        : `Selected ${entity || "items"} deleted successfully!`;
    }
    return isKm
      ? `បានលុប${entity || "ទិន្នន័យ"}ដែលបានជ្រើសរើសចំនួន ${count} ដោយជោគជ័យ!`
      : `${count} ${entity || "items"} deleted successfully!`;
  },

  statusUpdated(entity = "", status = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm
      ? `ស្ថានភាព${entity ? ` "${entity}"` : ""} ត្រូវបានប្ដូរទៅជា ${status}!`
      : `${entity ? `"${entity}"` : "Item"} status updated to ${status}!`;
  },

  orderUpdated(entity = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm
      ? `បានធ្វើបច្ចុប្បន្នភាពលំដាប់បង្ហាញ${entity || "ទិន្នន័យ"}!`
      : `${entity || "Item"} presentation order updated!`;
  },

  createFailed(entity = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm
      ? `មិនអាចបង្កើត${entity || "ទិន្នន័យ"}បានទេ។`
      : `Failed to create ${entity || "item"}.`;
  },

  updateFailed(entity = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm
      ? `មិនអាចកែប្រែ${entity || "ទិន្នន័យ"}បានទេ។`
      : `Failed to update ${entity || "item"}.`;
  },

  deleteFailed(entity = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm
      ? `មិនអាចលុប${entity || "ទិន្នន័យ"}បានទេ។`
      : `Failed to delete ${entity || "item"}.`;
  },

  loadFailed(entity = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm
      ? `មិនអាចទាញយកទិន្នន័យ${entity || ""}បានទេ។ សូមព្យាយាមម្ដងទៀត។`
      : `Failed to load ${entity || "data"}. Please try again.`;
  },

  unauthorized(action = "", entity = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm
      ? `អ្នកគ្មានសិទ្ធិ${action}${entity ? ` ${entity}` : ""}ទេ។`
      : `You do not have permission to ${action} ${entity || "this item"}.`;
  },

  validationFailed(lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm
      ? "សូមពិនិត្យព័ត៌មានដែលបានបញ្ចូល។"
      : "Please check the form for errors.";
  },

  slugRequired(detail = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm
      ? `សូមបំពេញស្លាកតំណ (Slug)${detail ? ` - ${detail}` : ""}`
      : `Please provide a valid slug${detail ? ` - ${detail}` : ""}`;
  },

  creating(entity = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm
      ? `កំពុងបង្កើត${entity || "ទិន្នន័យ"}...`
      : `Creating ${entity || "item"}...`;
  },

  updating(entity = "", lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm
      ? `កំពុងកែប្រែ${entity || "ទិន្នន័យ"}...`
      : `Updating ${entity || "item"}...`;
  },

  pleaseWait(lang = getLanguage()) {
    const isKm = String(lang).toLowerCase().startsWith("k");
    return isKm ? "សូមរង់ចាំបន្តិច..." : "Please wait...";
  },
};

/**
 * Global Admin Toast & Notification Dispatcher.
 * Matches Image 2's theme design (gold primary pill banner).
 */
export const adminToast = {
  success(message) {
    const text = typeof message === "string" ? message : message?.text || message?.enText || message?.khText || "";
    dispatchAdminToast({ type: "success", message: text });
    return Promise.resolve();
  },

  created(entity) {
    return this.success(adminMessages.created(entity));
  },

  updated(entity) {
    return this.success(adminMessages.updated(entity));
  },

  deleted(entity) {
    return this.success(adminMessages.deleted(entity));
  },

  bulkDeleted(entity, count) {
    return this.success(adminMessages.bulkDeleted(entity, count));
  },

  statusUpdated(entity, status) {
    return this.success(adminMessages.statusUpdated(entity, status));
  },

  orderUpdated(entity) {
    return this.success(adminMessages.orderUpdated(entity));
  },

  error(message, detail) {
    const text = detail ? `${message}\n\n${detail}` : message;
    dispatchAdminToast({ type: "error", message: text });
    return Promise.resolve();
  },

  warning(message) {
    dispatchAdminToast({ type: "warning", message });
    return Promise.resolve();
  },

  info(message) {
    dispatchAdminToast({ type: "info", message });
    return Promise.resolve();
  },

  errorAlert(titleOrObj, detail) {
    if (typeof titleOrObj === "string") {
      return errorAlert({ title: titleOrObj, detail });
    }
    return errorAlert(titleOrObj);
  },

  createFailed(entity, detail) {
    const title = adminMessages.createFailed(entity);
    return errorAlert({ title, detail });
  },

  updateFailed(entity, detail) {
    const title = adminMessages.updateFailed(entity);
    return errorAlert({ title, detail });
  },

  deleteFailed(entity, detail) {
    const title = adminMessages.deleteFailed(entity);
    return errorAlert({ title, detail });
  },

  loading(titleOrObj, text) {
    if (typeof titleOrObj === "string") {
      return loadingAlert({ title: titleOrObj, text });
    }
    return loadingAlert(titleOrObj);
  },

  close() {
    closeSwal();
  },

  confirm(options) {
    return warningConfirm(options);
  },
};

/**
 * Universal Global Admin Toast UI Component.
 * Placed in AdminLayout to provide identical design everywhere.
 */
export function GlobalAdminToast() {
  const [toast, setToast] = useState(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      const { type = "success", message, duration = 3000 } = e.detail || {};
      if (!message) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ type, message });
      setVisible(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setToast(null), 400);
      }, duration);
    };

    window.addEventListener(ADMIN_TOAST_EVENT, handler);
    return () => {
      window.removeEventListener(ADMIN_TOAST_EVENT, handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!toast && !visible) return null;

  const isSuccess = toast?.type === "success";
  const isError = toast?.type === "error";
  const isWarning = toast?.type === "warning";

  return (
    <div
      className={`fixed top-6 right-6 z-[9999] transition-all duration-500 ease-out transform ${
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`px-6 py-4 rounded-xl flex items-center gap-3 text-white shadow-xl ${
          isError
            ? "bg-red-600 border border-red-500"
            : isWarning
            ? "bg-amber-600 border border-amber-500"
            : "bg-[color:var(--admin-primary)] border border-white/10"
        }`}
      >
        {isError ? (
          <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : isWarning ? (
          <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ) : (
          <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        <span className="font-medium text-sm leading-snug">{toast?.message}</span>
      </div>
    </div>
  );
}

/**
 * React Hook for Admin Notifications.
 */
export function useAdminToast() {
  const { t, language } = useLanguage();

  return {
    t,
    language,
    toast: adminToast,
    messages: adminMessages,
    created: (entity) => adminToast.created(entity),
    updated: (entity) => adminToast.updated(entity),
    deleted: (entity) => adminToast.deleted(entity),
    bulkDeleted: (entity, count) => adminToast.bulkDeleted(entity, count),
    statusUpdated: (entity, status) => adminToast.statusUpdated(entity, status),
    orderUpdated: (entity) => adminToast.orderUpdated(entity),
    success: (msg) => adminToast.success(msg),
    error: (msg, detail) => adminToast.error(msg, detail),
    errorAlert: (opts, detail) => adminToast.errorAlert(opts, detail),
    createFailed: (entity, detail) => adminToast.createFailed(entity, detail),
    updateFailed: (entity, detail) => adminToast.updateFailed(entity, detail),
    deleteFailed: (entity, detail) => adminToast.deleteFailed(entity, detail),
    loading: (opts, text) => adminToast.loading(opts, text),
    close: () => adminToast.close(),
  };
}

export default adminToast;
