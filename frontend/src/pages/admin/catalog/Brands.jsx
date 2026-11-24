import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/state/auth";
import { useAdminPermissions } from "@/hooks/useAdminPermissions.js";
import { getFirstAccessibleAdminPath } from "@/lib/adminPermissions.js";
import { useTheme } from "@/state/theme.jsx";
import adminToast, { adminMessages } from "@/lib/adminMessages.jsx";
import AdminModal, { AdminConfirmDialog } from "@/components/admin/AdminModal.jsx";
import AdminRowActions from "@/components/admin/AdminRowActions.jsx";
import { AdminContentSkeleton, AdminDashboardLoader } from "@/components/admin/AdminLoading";
import AdminEmptyState from "@/components/admin/AdminEmptyState.jsx";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton.jsx";
import { Button } from "@/components/ui/button";
import { adminCacheKey, hydrateAdminListCache, writeAdminCache } from "@/lib/adminPageCache.js";
import { useLanguage } from "@/lib/i18n";
import AdminFilterDrawer, { AdminFilterToolbarButton } from "@/components/admin/AdminFilterDrawer.jsx";
import { resolveImageUrl } from "@/lib/images";

const BRANDS_CACHE_KEY = adminCacheKey("brands", "v1");

const emptyForm = {
  name: "",
  slug: "",
  sort_order: 0,
  is_active: true,
  logo_source: "local",
  logo: null,
  logo_url: "",
};

function slugifyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function brandLogoSrc(url) {
  if (!url) return null;
  if (/^(blob:|data:)/i.test(url)) return url;
  return resolveImageUrl(url);
}

export default function AdminBrands() {
  const { t, language } = useLanguage();
  const { refresh: refreshAuth } = useAuth();
  const { user, can, permissionsReady } = useAdminPermissions();
  const canViewBrands = can("brands", "view");
  const canCreateBrands = can("brands", "create");
  const canEditBrands = can("brands", "edit");
  const canDeleteBrands = can("brands", "delete");

  const { primaryColor } = useTheme();
  const accentColor = primaryColor;

  const brandFilterSections = useMemo(
    () => [
      {
        id: "status",
        title: t("brands.filter.status", t("common.table.status", "Status")),
        options: [
          { value: "active", label: t("common.status.active", "Active") },
          { value: "inactive", label: t("common.status.hidden", "Hidden") },
        ],
      },
      {
        id: "logo",
        title: t("brands.filter.logo", "Logo"),
        options: [
          { value: "with_logo", label: t("brands.filter.withLogo", "With Logo") },
          { value: "no_logo", label: t("brands.filter.noLogo", "No Logo") },
        ],
      },
    ],
    [t],
  );

  const brandCache = hydrateAdminListCache(BRANDS_CACHE_KEY);
  const [rows, setRows] = useState(brandCache.initialRows || []);
  const [loading, setLoading] = useState(brandCache.initialLoading);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({ status: [], logo: [] });
  const [draftFilters, setDraftFilters] = useState({ status: [], logo: [] });
  const [selectedIds, setSelectedIds] = useState([]);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // View mode: 'table' or 'grid' (stored in localStorage)
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem("admin_brands_view_mode") || "table";
  });

  const handleSetViewMode = (modeVal) => {
    setViewMode(modeVal);
    localStorage.setItem("admin_brands_view_mode", modeVal);
  };

  const [dragId, setDragId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [editError, setEditError] = useState("");

  const activeFilterCount = useMemo(() => {
    return (appliedFilters.status?.length || 0) + (appliedFilters.logo?.length || 0);
  }, [appliedFilters]);

  const openFilterDrawer = () => {
    setDraftFilters(appliedFilters);
    setFilterOpen(true);
  };

  const toggleDraft = (sectionId, value) => {
    setDraftFilters((prev) => {
      const cur = prev[sectionId] || [];
      const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
      return { ...prev, [sectionId]: next };
    });
  };

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters);
    setFilterOpen(false);
  };

  const handleClearAllFilters = () => {
    setDraftFilters({ status: [], logo: [] });
    setAppliedFilters({ status: [], logo: [] });
    setFilterOpen(false);
  };

  const safeRows = Array.isArray(rows) ? rows : [];

  const filteredRows = useMemo(() => {
    let result = [...safeRows];

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (b) =>
          b.name?.toLowerCase().includes(q) ||
          b.slug?.toLowerCase().includes(q)
      );
    }

    if (appliedFilters.status?.length) {
      result = result.filter((b) => {
        const status = b.is_active ? "active" : "inactive";
        return appliedFilters.status.includes(status);
      });
    }

    if (appliedFilters.logo?.length) {
      result = result.filter((b) => {
        const hasLogo = Boolean(b.logo_url || b.logo_path);
        if (appliedFilters.logo.includes("with_logo") && !hasLogo) return false;
        if (appliedFilters.logo.includes("no_logo") && hasLogo) return false;
        return true;
      });
    }

    return result.sort((a, b) => {
      const aOrder = Number(a.sort_order ?? 0);
      const bOrder = Number(b.sort_order ?? 0);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return Number(b.id) - Number(a.id);
    });
  }, [safeRows, search, appliedFilters]);

  const closeCreateForm = () => {
    if (isCreating) return;
    setShowCreateForm(false);
    setCreateError("");
    setForm(emptyForm);
  };

  const closeEditForm = () => {
    setEditError("");
    setEditing(null);
  };

  const getValidationMessage = (error) => {
    const responseMessage = error?.response?.data?.message;
    const errors = error?.response?.data?.errors;
    if (errors && typeof errors === "object") {
      const first = Object.values(errors).flat().find(Boolean);
      return first || responseMessage || t("brands.messages.validationFailed", "Please check the form for errors.");
    }
    return responseMessage || error?.message || t("brands.messages.validationFailed", "Please check the form for errors.");
  };

  const load = async () => {
    if (!canViewBrands) {
      setRows([]);
      setLoading(false);
      return;
    }
    const cached = hydrateAdminListCache(BRANDS_CACHE_KEY);
    if (cached.initialRows.length) {
      setRows(cached.initialRows);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setErr("");
    try {
      const { data } = await api.get("/admin/brands");
      const next = data?.data || [];
      setRows(next);
      writeAdminCache(BRANDS_CACHE_KEY, next);
    } catch (e) {
      setErr(e?.response?.data?.message || t("brands.messages.loadFailed", "Failed to load brands. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!permissionsReady) return;
    load();
  }, [permissionsReady, canViewBrands]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => rows.some((b) => b.id === id)));
  }, [rows]);

  const onPickFile = (file) => {
    setForm((p) => ({ ...p, logo: file, logo_source: "local" }));
  };

  const onPickFileEdit = (file) => {
    setEditing((p) => ({ ...p, logo: file, logo_source: "local" }));
  };

  // Quick 1-click Toggle Status directly on row/card
  const toggleActiveStatus = async (b) => {
    if (!canEditBrands) return;
    const nextActive = !b.is_active;
    const statusText = nextActive
      ? t("common.status.active", "Active")
      : t("common.status.hidden", "Hidden");

    try {
      setRows((prev) =>
        prev.map((item) => (item.id === b.id ? { ...item, is_active: nextActive } : item))
      );
      await api.patch(`/admin/brands/${b.id}`, { is_active: nextActive });
      adminToast.statusUpdated(b.name, statusText);
      writeAdminCache(
        BRANDS_CACHE_KEY,
        rows.map((item) => (item.id === b.id ? { ...item, is_active: nextActive } : item))
      );
    } catch (e2) {
      setErr(e2?.response?.data?.message || adminMessages.updateFailed(t("brands.brand", "Brand")));
      await load();
    }
  };

  // Quick Move Sort Order (Up / Down)
  const moveSortOrder = async (b, direction) => {
    if (!canEditBrands) return;
    const sorted = [...filteredRows];
    const currentIndex = sorted.findIndex((item) => item.id === b.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const targetBrand = sorted[targetIndex];
    const currentOrder = Number(b.sort_order ?? 0);
    const targetOrder = Number(targetBrand.sort_order ?? 0);

    const newCurrentOrder = targetOrder;
    const newTargetOrder =
      currentOrder === targetOrder
        ? direction === "up"
          ? targetOrder + 1
          : targetOrder - 1
        : currentOrder;

    try {
      setRows((prev) =>
        prev.map((item) => {
          if (item.id === b.id) return { ...item, sort_order: newCurrentOrder };
          if (item.id === targetBrand.id) return { ...item, sort_order: newTargetOrder };
          return item;
        })
      );
      await Promise.all([
        api.patch(`/admin/brands/${b.id}`, { sort_order: newCurrentOrder }),
        api.patch(`/admin/brands/${targetBrand.id}`, { sort_order: newTargetOrder }),
      ]);
      adminToast.orderUpdated(t("brands.brandsTitle", "Brands"));
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.message || adminMessages.updateFailed(t("brands.brand", "Brand")));
      await load();
    }
  };

  // Drag and drop reordering
  const handleDrop = async (targetId) => {
    if (!canEditBrands || !dragId || dragId === targetId) return;
    const fromIndex = safeRows.findIndex((b) => b.id === dragId);
    const toIndex = safeRows.findIndex((b) => b.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = [...safeRows];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setRows(next);
    setDragId(null);

    try {
      const updates = [];
      next.forEach((b, idx) => {
        const nextOrder = idx + 1;
        if (Number(b.sort_order ?? 0) !== nextOrder) {
          updates.push(api.patch(`/admin/brands/${b.id}`, { sort_order: nextOrder }));
        }
      });
      if (updates.length > 0) {
        await Promise.all(updates);
      }
      adminToast.orderUpdated(t("brands.brandsTitle", "Brands"));
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.message || adminMessages.updateFailed(t("brands.brand", "Brand")));
      await load();
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!canCreateBrands) {
      await adminToast.errorAlert({
        khTitle: "គ្មានសិទ្ធិ",
        enTitle: "Not allowed",
        detail: adminMessages.unauthorized(t("common.actions.create", "create"), t("brands.brand", "Brand")),
      });
      return;
    }
    if (isCreating) return;
    setErr("");
    setCreateError("");
    setIsCreating(true);

    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("slug", (form.slug || slugifyName(form.name)).trim());
      fd.append("sort_order", String(form.sort_order ?? 0));
      fd.append("is_active", form.is_active ? "1" : "0");
      if (form.logo_source === "url") {
        if (form.logo_url?.trim()) {
          fd.append("logo_url", form.logo_url.trim());
        }
      } else if (form.logo) {
        fd.append("logo", form.logo);
      }

      const response = await api.post("/admin/brands", fd);

      if (![200, 201].includes(response?.status)) {
        throw new Error("Create failed.");
      }

      setForm(emptyForm);
      setShowCreateForm(false);
      adminToast.created(t("brands.brand", "Brand"));
      await load();
      refreshAuth?.();
    } catch (e2) {
      const detail = getValidationMessage(e2);
      setErr(detail);
      const slugHint = String(detail).toLowerCase().includes("slug")
        ? adminMessages.slugRequired(detail)
        : detail;
      setCreateError(slugHint);
      await adminToast.createFailed(t("brands.brand", "Brand"), slugHint);
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (b) => {
    if (!canEditBrands) return;
    setErr("");
    setEditError("");
    setEditing({
      id: b.id,
      name: b.name || "",
      slug: b.slug || "",
      sort_order: b.sort_order ?? 0,
      is_active: !!b.is_active,
      logo_url: b.logo_url || null,
      logo_source: b.logo_url && /^https?:\/\//i.test(b.logo_url) ? "url" : "local",
      logo: null,
    });
  };

  const saveEdit = async () => {
    if (!canEditBrands) {
      setErr(adminMessages.unauthorized(t("common.actions.edit", "edit"), t("brands.brand", "Brand")));
      return;
    }
    if (!editing) return;
    setErr("");
    setEditError("");
    adminToast.loading({
      khTitle: adminMessages.updating(t("brands.brand", "Brand"), "km"),
      enTitle: adminMessages.updating(t("brands.brand", "Brand"), "en"),
      khText: adminMessages.pleaseWait("km"),
      enText: adminMessages.pleaseWait("en"),
    });

    try {
      const fd = new FormData();
      fd.append("name", editing.name);
      fd.append("slug", (editing.slug || slugifyName(editing.name)).trim());
      fd.append("sort_order", String(editing.sort_order ?? 0));
      fd.append("is_active", editing.is_active ? "1" : "0");
      if (editing.logo_source === "url") {
        if (editing.logo_url?.trim()) {
          fd.append("logo_url", editing.logo_url.trim());
        }
      } else if (editing.logo) {
        fd.append("logo", editing.logo);
      }
      fd.append("_method", "PATCH");

      await api.post(`/admin/brands/${editing.id}`, fd);

      adminToast.close();
      closeEditForm();
      adminToast.updated(t("brands.brand", "Brand"));
      await load();
      refreshAuth?.();
    } catch (e2) {
      adminToast.close();
      const detail = getValidationMessage(e2);
      setErr(detail);
      setEditError(detail);
      await adminToast.updateFailed(t("brands.brand", "Brand"), detail);
    }
  };

  const del = (id) => {
    if (!canDeleteBrands) return;
    setPendingDeleteId(id);
  };

  const deleteSelected = () => {
    if (!canDeleteBrands || selectedIds.length === 0) return;
    setPendingBulkDelete(true);
  };

  const confirmDelete = async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    setErr("");

    try {
      if (pendingBulkDelete) {
        await Promise.all(selectedIds.map((id) => api.delete(`/admin/brands/${id}`)));
        adminToast.bulkDeleted(t("brands.brandsTitle", "Brands"), selectedIds.length);
        setSelectedIds([]);
      } else if (pendingDeleteId != null) {
        await api.delete(`/admin/brands/${pendingDeleteId}`);
        adminToast.deleted(t("brands.brand", "Brand"));
        setSelectedIds((prev) => prev.filter((id) => id !== pendingDeleteId));
      }
      await load();
      refreshAuth?.();
    } catch (e2) {
      const detail = e2?.response?.data?.message || "";
      setErr(detail || adminMessages.deleteFailed(t("brands.brand", "Brand")));
      await adminToast.deleteFailed(t("brands.brand", "Brand"), detail);
    } finally {
      setDeleteBusy(false);
      setPendingDeleteId(null);
      setPendingBulkDelete(false);
    }
  };

  const targetBrandToDelete = useMemo(() => {
    if (pendingDeleteId == null) return null;
    return rows.find((b) => b.id === pendingDeleteId) || null;
  }, [pendingDeleteId, rows]);

  const previewCreate = useMemo(() => {
    if (form.logo_source === "url" && form.logo_url) return form.logo_url;
    if (!form.logo) return null;
    return URL.createObjectURL(form.logo);
  }, [form.logo, form.logo_source, form.logo_url]);

  const previewEdit = useMemo(() => {
    if (editing?.logo_source === "url" && editing?.logo_url) return editing.logo_url;
    if (!editing?.logo) return null;
    return URL.createObjectURL(editing.logo);
  }, [editing?.logo, editing?.logo_source, editing?.logo_url]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const allSelected =
    filteredRows.length > 0 && filteredRows.every((b) => selectedIds.includes(b.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      const filteredIds = new Set(filteredRows.map((b) => b.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.has(id)));
      return;
    }
    const next = new Set(selectedIds);
    filteredRows.forEach((b) => next.add(b.id));
    setSelectedIds(Array.from(next));
  };

  if (!permissionsReady) return <AdminContentSkeleton lines={3} imageHeight={200} className="mt-4" />;
  if (loading && rows.length === 0) return <AdminContentSkeleton lines={3} imageHeight={200} className="mt-4" />;

  if (!canViewBrands) {
    return <Navigate to={getFirstAccessibleAdminPath(user)} replace />;
  }

  return (
    <div className="min-h-full admin-soft text-slate-800 dark:text-slate-100">
      {/* Full width container matching Categories */}
      <div className="w-full min-w-0 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white mb-1.5">
              {t("brands.brandsTitle", "Brands")}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-base">
              {t("brands.brandsSubtitle", "Manage and organize your product brands, logos, and presentation order")}
            </p>
          </div>
          {canCreateBrands ? (
            <Button
              onClick={() => setShowCreateForm(true)}
              className="gap-2 shrink-0 h-11 px-5 rounded-xl shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t("brands.addNewBrand", "Add New Brand")}
            </Button>
          ) : null}
        </div>

        {/* Error Alert */}
        {err && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center gap-3 animate-shake">
            <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-700 dark:text-red-100 font-medium">{err}</span>
            <button
              onClick={() => setErr("")}
              className="ml-auto text-red-400 dark:text-red-300 hover:text-red-600 dark:hover:text-red-200 transition-colors"
              aria-label={t("common.actions.dismiss", "Dismiss")}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AdminConfirmDialog
          open={pendingDeleteId != null || pendingBulkDelete}
          onClose={() => {
            if (deleteBusy) return;
            setPendingDeleteId(null);
            setPendingBulkDelete(false);
          }}
          onConfirm={confirmDelete}
          title={
            pendingBulkDelete
              ? t("brands.dialogs.deleteSelectedBrandsTitle", "Delete selected brands?")
              : t("brands.dialogs.deleteBrandTitle", "Delete this brand?")
          }
          message={
            pendingBulkDelete
              ? t(
                  "brands.dialogs.deleteSelectedBrandsMessage",
                  `Are you sure you want to delete ${selectedIds.length} selected brands? This cannot be undone.`,
                  { count: selectedIds.length }
                )
              : targetBrandToDelete
                ? t(
                    "brands.dialogs.deleteBrandMessage",
                    `Are you sure you want to delete "${targetBrandToDelete.name}"? This action cannot be undone. Products linked to this brand will remain unbranded.`,
                    { name: targetBrandToDelete.name }
                  )
                : t(
                    "brands.dialogs.deleteBrandGenericMessage",
                    "Are you sure you want to delete this brand? This action cannot be undone. Products linked to this brand will remain unbranded."
                  )
          }
          confirmLabel={deleteBusy ? t("brands.dialogs.deleting", "Deleting...") : t("common.actions.delete", "Delete")}
          cancelLabel={t("common.actions.cancel", "Cancel")}
          destructive
          busy={deleteBusy}
        />

        {/* Create Brand Modal */}
        <AdminModal
          open={showCreateForm}
          onClose={closeCreateForm}
          title={t("brands.addNewBrand", "Add New Brand")}
          titleId="brand-create-title"
          maxWidthClass="max-w-3xl"
          closeOnBackdrop={!isCreating}
        >
          <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                {t("brands.form.name", "Brand Name")}
              </label>
              <input
                className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-200 placeholder-slate-400"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder={t("brands.form.namePlaceholder", "e.g., Nike, Zara, Apple")}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                {t("brands.form.slugOptional", "Slug (Optional)")}
              </label>
              <input
                className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-200 placeholder-slate-400"
                value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                placeholder={t("brands.form.slugPlaceholder", "e.g., nike")}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                {t("brands.form.sortOrder", "Sort Order")}
              </label>
              <input
                type="number"
                min={0}
                className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-200"
                value={form.sort_order}
                onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t("brands.form.activeStatus", "Active Status")}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
                  className="relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-slate-300 dark:focus:ring-slate-600 dark:focus:ring-offset-slate-800"
                  style={{ backgroundColor: form.is_active ? accentColor : "#94a3b8" }}
                  aria-label={t("brands.form.activeStatus", "Active Status")}
                >
                  <span
                    className="w-6 h-6 bg-white rounded-full transform transition-transform duration-300 shadow-sm"
                    style={{ transform: form.is_active ? "translateX(24px)" : "translateX(4px)" }}
                  />
                </button>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 min-w-[40px] text-right">
                  {form.is_active ? t("common.status.active", "Active") : t("common.status.hidden", "Hidden")}
                </span>
              </div>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  {t("brands.form.logoOptional", "Logo (Optional)")}
                </label>
                <div className="flex items-center gap-4 mb-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="create-logo-source"
                      checked={form.logo_source === "local"}
                      onChange={() => setForm((p) => ({ ...p, logo_source: "local", logo_url: "" }))}
                    />
                    {t("brands.form.uploadLocalFile", "Upload local file")}
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="create-logo-source"
                      checked={form.logo_source === "url"}
                      onChange={() => setForm((p) => ({ ...p, logo_source: "url", logo: null }))}
                    />
                    {t("brands.form.useImageUrl", "Use image URL")}
                  </label>
                </div>

                {form.logo_source === "url" ? (
                  <input
                    type="url"
                    value={form.logo_url}
                    onChange={(e) => setForm((p) => ({ ...p, logo_url: e.target.value }))}
                    placeholder={t("brands.form.imageUrlPlaceholder", "https://example.com/brand-logo.png")}
                    className="w-full h-11 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500"
                  />
                ) : (
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-slate-300 dark:file:border-slate-600 file:bg-white dark:file:bg-slate-900 file:text-slate-800 dark:file:text-slate-100"
                  />
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {t("brands.form.brandLogoHint", "Optional — upload an image file or paste a public URL.")}
                </p>
              </div>

              <div className="h-24 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden p-2">
                {previewCreate ? (
                  <img src={previewCreate} alt={t("brands.form.logo", "Brand Logo")} className="h-16 w-auto object-contain" />
                ) : (
                  <span className="text-slate-400 text-sm">{t("brands.form.noLogo", "No logo")}</span>
                )}
              </div>
            </div>

            {createError ? (
              <div className="md:col-span-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-100">
                {createError}
              </div>
            ) : null}

            <div className="md:col-span-2 flex justify-end gap-3 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateForm}
                disabled={isCreating}
              >
                {t("common.actions.cancel", "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isCreating || !canCreateBrands}
                className="min-w-36 gap-2"
              >
                {isCreating ? (
                  <AdminDashboardLoader size={20} />
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                )}
                {isCreating ? t("brands.form.creating", "Creating...") : t("brands.addNewBrand", "Add New Brand")}
              </Button>
            </div>
          </form>
        </AdminModal>

        {/* Brands Container Card */}
        <div className="admin-surface rounded-2xl border admin-border overflow-hidden">
          {/* Table Header / Toolbar */}
          <div className="relative z-10 admin-surface border-b admin-border px-4 md:px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border admin-border rounded-lg flex items-center justify-center admin-surface shrink-0">
                <svg className="w-6 h-6 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4h10M7 8h10M7 12h10M7 16h10M7 20h10" />
                </svg>
              </div>
              <div>
                <h3 className="text-slate-800 dark:text-white font-semibold">
                  {activeFilterCount === 0 && !search.trim()
                    ? t("brands.allBrands", "All Brands")
                    : t("brands.filteredBrands", "Filtered brands")}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  {filteredRows.length} {t("brands.totalBrands", "total brands")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:gap-3 justify-end w-full md:w-auto">
              {/* Search input */}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("brands.searchPlaceholder", "Search brands...")}
                className="h-10 w-full sm:w-56 md:w-60 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-[var(--admin-primary)] focus:bg-transparent transition-colors"
              />

              {/* View Switcher: Table vs Cards */}
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 bg-slate-50 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => handleSetViewMode("table")}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === "table"
                      ? "bg-white dark:bg-slate-800 text-[color:var(--admin-primary)] shadow-sm font-semibold"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                  title={t("brands.view.table", "Table View")}
                  aria-label={t("brands.view.table", "Table View")}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetViewMode("grid")}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === "grid"
                      ? "bg-white dark:bg-slate-800 text-[color:var(--admin-primary)] shadow-sm font-semibold"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                  title={t("brands.view.grid", "Grid Cards View")}
                  aria-label={t("brands.view.grid", "Grid Cards View")}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
              </div>

              {/* Filter drawer button */}
              <AdminFilterToolbarButton
                activeCount={activeFilterCount}
                onClick={openFilterDrawer}
              />

              {/* Bulk delete button */}
              {canDeleteBrands && selectedIds.length > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={deleteSelected}
                  className="h-10 px-3.5 gap-2 rounded-lg text-sm font-semibold"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  {t("brands.deleteSelectedCount", `Delete Selected (${selectedIds.length})`, { count: selectedIds.length })}
                </Button>
              ) : null}

              {/* Refresh button */}
              <AdminRefreshButton
                onClick={load}
                loading={loading}
                size="md"
              />
            </div>
          </div>

          <AdminFilterDrawer
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            sections={brandFilterSections}
            selected={draftFilters}
            onToggle={toggleDraft}
            onApply={handleApplyFilters}
            onClearAll={handleClearAllFilters}
          />

          {/* Table / Grid Content */}
          {loading ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex justify-center py-6">
                <AdminDashboardLoader />
              </div>
            </div>
          ) : filteredRows.length === 0 ? (
            <AdminEmptyState
              type="brands"
              isSearch={Boolean(search?.trim() || activeFilterCount > 0)}
              searchQuery={search}
              onClearFilters={() => {
                setSearch("");
                handleClearAllFilters();
              }}
              actionLabel={canCreateBrands ? t("brands.actions.createBrand", "Create Brand") : undefined}
              onAction={canCreateBrands ? () => setShowCreateModal(true) : undefined}
            />
          ) : viewMode === "grid" ? (
            /* Clean & Modern Brand Cards View */
            <div className="p-4 md:p-6 bg-slate-50/50 dark:bg-slate-900/30">
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-5">
                {filteredRows.map((b) => (
                  <div
                    key={b.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(b.id)}
                    className={`group relative rounded-2xl border transition-all duration-200 flex flex-col justify-between p-4 bg-white dark:bg-slate-900 hover:shadow-lg ${
                      selectedIds.includes(b.id)
                        ? "border-[color:var(--admin-primary)] ring-2 ring-[rgba(var(--admin-primary-rgb),0.25)] shadow-xs"
                        : "border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    {/* Top Row: Checkbox, Drag handle, Order badge & Status */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {canDeleteBrands ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(b.id)}
                            onChange={() => toggleSelect(b.id)}
                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-0 cursor-pointer"
                            aria-label={t("brands.table.checkbox", "Select")}
                          />
                        ) : null}

                        {canEditBrands ? (
                          <div
                            draggable
                            onDragStart={() => setDragId(b.id)}
                            onDragEnd={() => setDragId(null)}
                            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded transition-colors"
                            title={t("brands.dragToReorder", "Drag to reorder")}
                          >
                            <svg className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                          </div>
                        ) : null}

                        <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 font-mono text-xs">
                          <span className="font-semibold text-slate-500 dark:text-slate-400">#{b.sort_order ?? 0}</span>
                          {canEditBrands ? (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                              <button
                                type="button"
                                onClick={() => moveSortOrder(b, "up")}
                                className="hover:text-slate-800 dark:hover:text-slate-100 p-0.5"
                                title={t("brands.actions.moveUp", "Move up")}
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSortOrder(b, "down")}
                                className="hover:text-slate-800 dark:hover:text-slate-100 p-0.5"
                                title={t("brands.actions.moveDown", "Move down")}
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {/* Status Toggle Pill */}
                      <button
                        type="button"
                        onClick={() => toggleActiveStatus(b)}
                        disabled={!canEditBrands}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                          b.is_active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60"
                            : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700"
                        }`}
                        title={t("brands.actions.toggleStatusHint", "Click to toggle Active / Hidden")}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${b.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {b.is_active ? t("common.status.active", "Active") : t("common.status.hidden", "Hidden")}
                      </button>
                    </div>

                    {/* Brand Logo Presentation Box */}
                    <div className="h-32 w-full rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex items-center justify-center p-4 my-2 transition-all duration-200 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60">
                      {b.logo_url ? (
                        <img
                          src={brandLogoSrc(b.logo_url)}
                          alt={b.name}
                          className="max-h-20 max-w-full object-contain filter drop-shadow-xs transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center shadow-xs border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 font-bold text-xl tracking-wider select-none">
                          {String(b.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Bottom: Brand Name & Action Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 mt-1">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate" title={b.name}>
                          {b.name}
                        </p>
                        <p className="text-xs font-mono text-slate-400 dark:text-slate-500 truncate">
                          /{b.slug}
                        </p>
                      </div>

                      {/* Clean Actions: Edit & Delete */}
                      <div className="flex items-center gap-1 shrink-0">
                        {canEditBrands ? (
                          <button
                            type="button"
                            onClick={() => startEdit(b)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                            title={t("brands.actions.editBrand", "Edit brand")}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        ) : null}

                        {canDeleteBrands ? (
                          <button
                            type="button"
                            onClick={() => del(b.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/40 transition-colors"
                            title={t("brands.actions.deleteBrand", "Delete brand")}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Table View */
            <div className="overflow-x-auto rounded-b-2xl">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/70 text-left text-xs font-semibold text-slate-600 dark:text-slate-200 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700/70">
                    {canDeleteBrands ? (
                      <th className="px-4 md:px-6 py-3 md:py-4 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-0 cursor-pointer"
                          aria-label={t("brands.selectAll", "Select all")}
                        />
                      </th>
                    ) : null}
                    <th className="px-4 md:px-6 py-3 md:py-4">{t("brands.table.brand", "Brand")}</th>
                    <th className="px-4 md:px-6 py-3 md:py-4">{t("brands.table.slug", "Slug")}</th>
                    <th className="px-4 md:px-6 py-3 md:py-4">{t("brands.table.sortOrder", "Sort Order")}</th>
                    <th className="px-4 md:px-6 py-3 md:py-4">{t("brands.table.status", "Status")}</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-right">{t("brands.table.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredRows.map((b) => (
                    <tr
                      key={b.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors duration-150"
                    >
                      {canDeleteBrands ? (
                        <td className="px-4 md:px-6 py-4 w-10">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(b.id)}
                            onChange={() => toggleSelect(b.id)}
                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-0 cursor-pointer"
                            aria-label={t("brands.table.checkbox", "Select")}
                          />
                        </td>
                      ) : null}

                      <td className="px-4 md:px-6 py-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
                            {b.logo_url ? (
                              <img
                                src={brandLogoSrc(b.logo_url)}
                                alt={b.name}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <span className="text-slate-700 dark:text-slate-200 font-bold text-sm">
                                {String(b.name || "?").charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {b.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              /{b.slug}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 md:px-6 py-4">
                        <span className="text-sm font-mono text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
                          /{b.slug}
                        </span>
                      </td>

                      <td className="px-4 md:px-6 py-4">
                        <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                          <span className="font-mono">{b.sort_order ?? 0}</span>
                          {canEditBrands ? (
                            <div className="flex flex-col ml-1">
                              <button
                                type="button"
                                onClick={() => moveSortOrder(b, "up")}
                                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                title={t("brands.actions.moveUp", "Move up")}
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSortOrder(b, "down")}
                                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                title={t("brands.actions.moveDown", "Move down")}
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-4 md:px-6 py-4">
                        <button
                          type="button"
                          onClick={() => toggleActiveStatus(b)}
                          disabled={!canEditBrands}
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                            b.is_active
                              ? "border-[rgba(var(--admin-primary-rgb),0.35)] bg-[rgba(var(--admin-primary-rgb),0.08)] text-[color:var(--admin-primary)] dark:border-[rgba(var(--admin-primary-rgb),0.45)] dark:bg-[rgba(var(--admin-primary-rgb),0.14)] dark:text-[color:var(--admin-primary)]"
                              : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                          title={t("brands.actions.toggleStatusHint", "Click to toggle Active / Hidden")}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              b.is_active ? "bg-[color:var(--admin-primary)]" : "bg-slate-400"
                            }`}
                          />
                          {b.is_active ? t("common.status.active", "Active") : t("common.status.hidden", "Hidden")}
                        </button>
                      </td>

                      <td className="px-4 md:px-6 py-4 text-right">
                        <AdminRowActions
                          onEdit={() => startEdit(b)}
                          canEdit={canEditBrands}
                          onDelete={() => del(b.id)}
                          canDelete={canDeleteBrands}
                          editTitle={t("brands.actions.editBrand", "Edit brand")}
                          deleteTitle={t("brands.actions.deleteBrand", "Delete brand")}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Brand Modal */}
      <AdminModal
        open={!!editing}
        onClose={closeEditForm}
        title={t("brands.editBrand", "Edit Brand")}
        titleId="brand-edit-title"
        maxWidthClass="max-w-2xl"
      >
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  {t("brands.form.name", "Brand Name")}
                </label>
                <input
                  className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-200"
                  value={editing.name}
                  onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                  placeholder={t("brands.form.namePlaceholder", "e.g., Nike, Zara, Apple")}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  {t("brands.form.slug", "Slug")}
                </label>
                <input
                  className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-200"
                  value={editing.slug}
                  onChange={(e) => setEditing((p) => ({ ...p, slug: e.target.value }))}
                  placeholder={t("brands.form.slugPlaceholder", "e.g., nike")}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  {t("brands.form.sortOrder", "Sort Order")}
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-200"
                  value={editing.sort_order}
                  onChange={(e) => setEditing((p) => ({ ...p, sort_order: Number(e.target.value) }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t("brands.form.activeStatus", "Active Status")}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing((p) => ({ ...p, is_active: !p.is_active }))}
                    className="relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-slate-300 dark:focus:ring-slate-600 dark:focus:ring-offset-slate-800"
                    style={{ backgroundColor: editing.is_active ? accentColor : "#94a3b8" }}
                    aria-label={t("brands.form.activeStatus", "Active Status")}
                  >
                    <span
                      className="w-6 h-6 bg-white rounded-full transform transition-transform duration-300 shadow-sm"
                      style={{ transform: editing.is_active ? "translateX(24px)" : "translateX(4px)" }}
                    />
                  </button>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200 min-w-[40px] text-right">
                    {editing.is_active ? t("common.status.active", "Active") : t("common.status.hidden", "Hidden")}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  {t("brands.form.logoOptional", "Logo (Optional)")}
                </label>
                <div className="flex items-center gap-4 mb-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="edit-logo-source"
                      checked={editing.logo_source === "local"}
                      onChange={() => setEditing((p) => ({ ...p, logo_source: "local", logo_url: p.logo_url || "" }))}
                    />
                    {t("brands.form.uploadLocalFile", "Upload local file")}
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="edit-logo-source"
                      checked={editing.logo_source === "url"}
                      onChange={() => setEditing((p) => ({ ...p, logo_source: "url", logo: null }))}
                    />
                    {t("brands.form.useImageUrl", "Use image URL")}
                  </label>
                </div>
                {editing.logo_source === "url" ? (
                  <input
                    type="url"
                    value={editing.logo_url || ""}
                    onChange={(e) => setEditing((p) => ({ ...p, logo_url: e.target.value }))}
                    placeholder={t("brands.form.imageUrlPlaceholder", "https://example.com/brand-logo.png")}
                    className="w-full h-11 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500"
                  />
                ) : (
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => onPickFileEdit(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-slate-300 dark:file:border-slate-600 file:bg-white dark:file:bg-slate-900 file:text-slate-800 dark:file:text-slate-100"
                  />
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {t("brands.form.brandLogoHint", "Optional — upload an image file or paste a public URL.")}
                </p>
              </div>
              <div className="h-24 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden p-2">
                {previewEdit ? (
                  <img src={previewEdit} alt={t("brands.form.logo", "Brand Logo")} className="h-16 w-auto object-contain" />
                ) : editing.logo_url ? (
                  <img src={brandLogoSrc(editing.logo_url)} alt={editing.name} className="h-16 w-auto object-contain" />
                ) : (
                  <span className="text-slate-400 text-sm">{t("brands.form.noLogo", "No logo")}</span>
                )}
              </div>
            </div>

            {editError ? (
              <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-100">
                {editError}
              </div>
            ) : null}

            <div className="flex justify-end gap-3 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={closeEditForm}
              >
                {t("common.actions.cancel", "Cancel")}
              </Button>
              {canEditBrands ? (
                <Button
                  type="button"
                  onClick={saveEdit}
                  className="min-w-32"
                >
                  {t("brands.form.saveChanges", "Save Changes")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </AdminModal>
    </div>
  );
}
