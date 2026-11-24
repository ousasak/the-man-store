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
import AdminSearchSelect from "@/components/admin/AdminSearchSelect.jsx";
import { adminCacheKey, hydrateAdminListCache, writeAdminCache } from "@/lib/adminPageCache.js";
import { useLanguage } from "@/lib/i18n";
import AdminFilterDrawer, { AdminFilterToolbarButton } from "@/components/admin/AdminFilterDrawer.jsx";

const CATEGORIES_CACHE_KEY = adminCacheKey("categories", "v1");

export default function AdminCategories() {
  const { t } = useLanguage();
  const { refresh: refreshAuth } = useAuth();
  const { user, can, permissionsReady } = useAdminPermissions();
  const canViewCategories = can("categories", "view");
  const canCreateCategories = can("categories", "create");
  const canEditCategories = can("categories", "edit");
  const canDeleteCategories = can("categories", "delete");
  const { primaryColor, mode } = useTheme();
  const accentColor = primaryColor;
  const accentIsWhite = (accentColor || "").toUpperCase() === "#FFFFFF";
  const headerIconColor = accentIsWhite ? "#0b0b0f" : "#FFFFFF";
  const deleteButtonStyle = {
    backgroundColor: mode === "dark" ? "rgba(127, 29, 29, 0.22)" : "#fef2f2",
    color: mode === "dark" ? "#fecdd3" : "#991b1b",
    border: `1px solid ${mode === "dark" ? "rgba(248, 113, 113, 0.45)" : "#fecdd3"}`,
    padding: "8px 12px",
    borderRadius: "10px",
    fontWeight: 600,
    fontSize: "0.875rem",
    transition: "all 150ms ease",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  };

  const genderOptions = useMemo(
    () => [
      { value: "", label: t("categories.gender.allGenders", "All Genders") },
      { value: "MEN", label: t("categories.gender.men", "Men") },
      { value: "WOMEN", label: t("categories.gender.women", "Women") },
      { value: "BOY", label: t("categories.gender.boy", "Boy") },
      { value: "GIRL", label: t("categories.gender.girl", "Girl") },
    ],
    [t],
  );

  const typeOptions = useMemo(
    () => [
      { value: "", label: t("categories.type.selectType", "Select type") },
      { value: "clothes", label: t("categories.type.clothes", "Clothes") },
      { value: "shoes", label: t("categories.type.shoes", "Shoes") },
      { value: "belt", label: t("categories.type.belt", "Belt") },
      { value: "hat", label: t("categories.type.hat", "Hat") },
      { value: "bag", label: t("categories.type.bag", "Bag") },
      { value: "accessory", label: t("categories.type.accessory", "Accessory") },
      { value: "other", label: t("categories.type.other", "Other") },
    ],
    [t],
  );

  const getGenderLabel = (g) => {
    if (!g) return t("categories.gender.all", "All");
    const upper = String(g).toUpperCase();
    if (upper === "MEN") return t("categories.gender.men", "Men");
    if (upper === "WOMEN") return t("categories.gender.women", "Women");
    if (upper === "BOY") return t("categories.gender.boy", "Boy");
    if (upper === "GIRL") return t("categories.gender.girl", "Girl");
    return g;
  };

  const getTypeLabel = (type) => {
    if (!type) return "-";
    const key = String(type).toLowerCase();
    const map = {
      clothes: t("categories.type.clothes", "Clothes"),
      shoes: t("categories.type.shoes", "Shoes"),
      belt: t("categories.type.belt", "Belt"),
      hat: t("categories.type.hat", "Hat"),
      bag: t("categories.type.bag", "Bag"),
      accessory: t("categories.type.accessory", "Accessory"),
      other: t("categories.type.other", "Other"),
    };
    return map[key] || type;
  };

  const categoryFilterSections = useMemo(
    () => [
      {
        id: "gender",
        title: t("categories.table.gender", "Gender"),
        options: [
          { value: "MEN", label: t("categories.gender.men", "Men") },
          { value: "WOMEN", label: t("categories.gender.women", "Women") },
          { value: "BOY", label: t("categories.gender.boy", "Boy") },
          { value: "GIRL", label: t("categories.gender.girl", "Girl") },
        ],
      },
      {
        id: "type",
        title: t("categories.table.type", "Type"),
        options: [
          { value: "clothes", label: t("categories.type.clothes", "Clothes") },
          { value: "shoes", label: t("categories.type.shoes", "Shoes") },
          { value: "belt", label: t("categories.type.belt", "Belt") },
          { value: "hat", label: t("categories.type.hat", "Hat") },
          { value: "bag", label: t("categories.type.bag", "Bag") },
          { value: "accessory", label: t("categories.type.accessory", "Accessory") },
          { value: "other", label: t("categories.type.other", "Other") },
        ],
      },
      {
        id: "status",
        title: t("categories.table.status", "Status"),
        options: [
          { value: "active", label: t("categories.status.active", "Active") },
          { value: "inactive", label: t("categories.status.inactive", "Inactive") },
        ],
      },
    ],
    [t],
  );

  const categoryCache = hydrateAdminListCache(CATEGORIES_CACHE_KEY);
  const [rows, setRows] = useState(categoryCache.initialRows || []);
  const [loading, setLoading] = useState(categoryCache.initialLoading);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({ gender: [], type: [], status: [] });
  const [draftFilters, setDraftFilters] = useState({ gender: [], type: [], status: [] });
  const [selectedIds, setSelectedIds] = useState([]);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", gender: "", type: "", is_active: true });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const activeFilterCount = useMemo(() => {
    return (
      (appliedFilters.gender?.length || 0) +
      (appliedFilters.type?.length || 0) +
      (appliedFilters.status?.length || 0)
    );
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
    setDraftFilters({ gender: [], type: [], status: [] });
    setAppliedFilters({ gender: [], type: [], status: [] });
    setFilterOpen(false);
  };

  const safeRows = Array.isArray(rows) ? rows : [];

  const closeCreateForm = () => {
    if (isCreating) return;
    setShowCreateForm(false);
    setCreateError("");
    setForm({ name: "", gender: "", type: "", is_active: true });
  };

  const closeEditForm = () => {
    setEditing(null);
  };

  const load = async () => {
    if (!canViewCategories) {
      setLoading(false);
      return;
    }
    setErr("");
    try {
      const res = await api.get("/admin/categories");
      const list = res.data?.data || res.data || [];
      const safeList = Array.isArray(list) ? list : [];
      setRows(safeList);
      writeAdminCache(CATEGORIES_CACHE_KEY, safeList);
    } catch (e) {
      if (e?.response?.status === 403) {
        refreshAuth?.();
        setErr(t("categories.messages.noPermissionCreate", "You don't have permission to access categories."));
        return;
      }
      setErr(e?.response?.data?.message || e.message || "Failed to load categories.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (permissionsReady && canViewCategories) {
      load();
    }
  }, [permissionsReady, canViewCategories]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => safeRows.some((r) => r.id === id)));
  }, [rows]);

  const extractErr = (e2) =>
    e2?.response?.data?.message ||
    (Array.isArray(e2?.response?.data?.errors?.name) ? e2.response.data.errors.name[0] : null) ||
    (Array.isArray(e2?.response?.data?.errors?.slug) ? e2.response.data.errors.slug[0] : null) ||
    e2?.message ||
    t("categories.messages.createFailed", "Request failed.");

  const getValidationMessage = (e2) => {
    const errors = e2?.response?.data?.errors;
    if (!errors || typeof errors !== "object") {
      return extractErr(e2);
    }
    const firstKey = Object.keys(errors)[0];
    const firstVal = errors[firstKey];
    if (Array.isArray(firstVal) && firstVal.length > 0) {
      return String(firstVal[0]);
    }
    if (typeof firstVal === "string") {
      return firstVal;
    }
    return extractErr(e2);
  };

  const create = async (e) => {
    e.preventDefault();
    if (!canCreateCategories) {
      setErr(t("categories.messages.noPermissionCreate", "You don't have permission to create categories."));
      return;
    }
    setErr("");
    setCreateError("");
    setIsCreating(true);
    adminToast.loading({
      khTitle: adminMessages.creating(t("categories.category", "Category"), "km"),
      enTitle: adminMessages.creating(t("categories.category", "Category"), "en"),
      khText: adminMessages.pleaseWait("km"),
      enText: adminMessages.pleaseWait("en"),
    });
    try {
      const response = await api.post("/admin/categories", {
        name: form.name,
        gender: form.gender || null,
        type: form.type || null,
        is_active: !!form.is_active,
      });
      if (![200, 201].includes(response?.status)) {
        throw new Error("Create failed.");
      }
      adminToast.close();
      setForm({ name: "", gender: "", type: "", is_active: true });
      setShowCreateForm(false);
      adminToast.created(t("categories.category", "Category"));
      await load();
    } catch (e2) {
      adminToast.close();
      const detail = e2?.response?.status === 422 ? getValidationMessage(e2) : extractErr(e2);
      setErr(detail);
      const slugHint = String(detail).toLowerCase().includes("slug")
        ? adminMessages.slugRequired(detail)
        : detail;
      setCreateError(slugHint);
      await adminToast.createFailed(t("categories.category", "Category"), slugHint);
    } finally {
      adminToast.close();
      setIsCreating(false);
    }
  };

  const startEdit = (c) => {
    if (!canEditCategories) return;
    setEditing({ ...c });
  };

  const saveEdit = async () => {
    if (!canEditCategories) {
      setErr(t("categories.messages.noPermissionEdit", "You don't have permission to edit categories."));
      return;
    }
    if (!editing?.id) return;
    setErr("");
    adminToast.loading({
      khTitle: adminMessages.updating(t("categories.category", "Category"), "km"),
      enTitle: adminMessages.updating(t("categories.category", "Category"), "en"),
      khText: adminMessages.pleaseWait("km"),
      enText: adminMessages.pleaseWait("en"),
    });
    try {
      await api.patch(`/admin/categories/${editing.id}`, {
        name: editing.name,
        gender: editing.gender || null,
        type: editing.type || null,
        is_active: !!editing.is_active,
      });
      adminToast.close();
      closeEditForm();
      adminToast.updated(t("categories.category", "Category"));
      await load();
    } catch (e2) {
      adminToast.close();
      const detail = extractErr(e2);
      setErr(detail);
      await adminToast.updateFailed(t("categories.category", "Category"), detail);
    }
  };

  const del = (id) => {
    if (!canDeleteCategories) return;
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!canDeleteCategories) return;
    setDeleteBusy(true);
    setErr("");
    try {
      if (pendingBulkDelete) {
        await Promise.all(selectedIds.map((id) => api.delete(`/admin/categories/${id}`)));
        adminToast.bulkDeleted(t("categories.categoriesTitle", "Categories"), selectedIds.length);
        setSelectedIds([]);
      } else if (pendingDeleteId != null) {
        await api.delete(`/admin/categories/${pendingDeleteId}`);
        adminToast.deleted(t("categories.category", "Category"));
        if (editing?.id === pendingDeleteId) closeEditForm();
      }
      await load();
    } catch (e2) {
      const detail = extractErr(e2);
      setErr(detail);
      await adminToast.deleteFailed(t("categories.category", "Category"), detail);
    } finally {
      setDeleteBusy(false);
      setPendingDeleteId(null);
      setPendingBulkDelete(false);
    }
  };

  const filteredRows = useMemo(() => {
    return safeRows.filter((c) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const matchesSearch =
          String(c?.name || "").toLowerCase().includes(q) ||
          String(c?.slug || "").toLowerCase().includes(q) ||
          String(c?.gender || "").toLowerCase().includes(q) ||
          String(c?.type || "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      if (appliedFilters.gender?.length > 0) {
        const g = String(c?.gender || "").toUpperCase();
        if (!appliedFilters.gender.includes(g)) return false;
      }

      if (appliedFilters.type?.length > 0) {
        const tVal = String(c?.type || "").toLowerCase();
        if (!appliedFilters.type.includes(tVal)) return false;
      }

      if (appliedFilters.status?.length > 0) {
        const sVal = c?.is_active ? "active" : "inactive";
        if (!appliedFilters.status.includes(sVal)) return false;
      }

      return true;
    });
  }, [safeRows, search, appliedFilters]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const allSelected =
    filteredRows.length > 0 && filteredRows.every((c) => selectedIds.includes(c.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      const filteredIds = new Set(filteredRows.map((c) => c.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.has(id)));
      return;
    }
    const next = new Set(selectedIds);
    filteredRows.forEach((c) => next.add(c.id));
    setSelectedIds(Array.from(next));
  };

  const deleteSelected = () => {
    if (!canDeleteCategories || selectedIds.length === 0) return;
    setPendingBulkDelete(true);
  };

  if (!permissionsReady) return <AdminContentSkeleton lines={3} imageHeight={200} className="mt-4" />;
  if (loading && safeRows.length === 0) return <AdminContentSkeleton lines={3} imageHeight={200} className="mt-4" />;
  if (!canViewCategories) {
    return <Navigate to={getFirstAccessibleAdminPath(user)} replace />;
  }

  return (
    <div className="min-h-full admin-soft text-slate-800 dark:text-slate-100">
      <div className="w-full min-w-0">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold text-slate-900 dark:text-white mb-2">
              {t("categories.categoriesTitle", "Categories")}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg">
              {t("categories.categoriesSubtitle", "Manage your product categories with full CRUD operations")}
            </p>
          </div>
          {canCreateCategories ? (
            <Button
              onClick={() => setShowCreateForm(true)}
              className="gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t("categories.addCategory", "Add New Category")}
            </Button>
          ) : null}
        </div>

        {/* Error Alert */}
        {err && (
          <div className="mb-6 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center gap-3 animate-shake">
            <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-700 dark:text-red-100 font-medium">{err}</span>
            <button onClick={() => setErr("")} className="ml-auto text-red-400 dark:text-red-300 hover:text-red-600 dark:hover:text-red-200 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

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
              ? t("categories.dialogs.deleteSelectedTitle", "Delete selected categories?")
              : t("categories.dialogs.deleteTitle", "Delete this category?")
          }
          message={
            pendingBulkDelete
              ? t("categories.dialogs.deleteSelectedMessage", `Permanently remove ${selectedIds.length} categories? This cannot be undone.`, { count: selectedIds.length })
              : t("categories.dialogs.deleteMessage", "This action cannot be undone. Ensure no products rely on this category.")
          }
          confirmLabel={t("common.actions.delete", "Delete")}
          cancelLabel={t("common.actions.cancel", "Cancel")}
          destructive
          busy={deleteBusy}
        />

        <AdminModal
          open={showCreateForm}
          onClose={closeCreateForm}
          title={t("categories.addCategory", "Add New Category")}
          titleId="category-create-title"
          maxWidthClass="max-w-3xl"
          closeOnBackdrop={!isCreating}
        >
          <form onSubmit={create} className="grid md:grid-cols-12 gap-4 items-end">
            <label className="md:col-span-6">
              <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                {t("categories.form.name", "Category Name")}
              </span>
              <input
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                required
                className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-200 placeholder-slate-400"
                placeholder={t("categories.form.namePlaceholder", "e.g., Summer Collection")}
              />
            </label>

            <label className="md:col-span-3">
              <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                {t("categories.form.genderOptional", "Gender (Optional)")}
              </span>
              <AdminSearchSelect
                value={form.gender}
                onChange={(gender) => setForm((s) => ({ ...s, gender }))}
                options={genderOptions}
                inputClassName="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-200"
                ariaLabel={t("categories.form.gender", "Gender")}
                placeholder={t("categories.form.searchGender", "Search gender…")}
              />
            </label>

            <label className="md:col-span-3">
              <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                {t("categories.form.type", "Category Type")}
              </span>
              <AdminSearchSelect
                value={form.type}
                onChange={(type) => setForm((s) => ({ ...s, type }))}
                options={typeOptions}
                inputClassName="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-200"
                ariaLabel={t("categories.form.typeAria", "Category type")}
                placeholder={t("categories.form.searchType", "Search type…")}
              />
            </label>

            <label className="md:col-span-6 flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t("categories.form.activeStatus", "Active Status")}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm((s) => ({ ...s, is_active: !s.is_active }))}
                  className="relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-slate-300 dark:focus:ring-slate-600 dark:focus:ring-offset-slate-800"
                  style={{ backgroundColor: form.is_active ? accentColor : (mode === 'dark' ? '#334155' : '#e2e8f0') }}
                >
                  <span className="w-6 h-6 bg-white rounded-full transform transition-transform duration-300" style={{ transform: form.is_active ? 'translateX(24px)' : 'translateX(4px)' }} />
                </button>
                <span className="text-sm font-medium text-black dark:text-white min-w-[30px] text-right">
                  {form.is_active ? t("categories.form.yes", "Yes") : t("categories.form.no", "No")}
                </span>
              </div>
            </label>

            <div className="md:col-span-12 flex justify-end">
              <Button
                type="submit"
                disabled={isCreating || !canCreateCategories}
                className="min-w-36 gap-2"
              >
                {isCreating ? (
                  <AdminDashboardLoader size={22} />
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                )}
                {isCreating ? t("categories.form.creating", "Creating...") : t("categories.form.addCategory", "Add Category")}
              </Button>
            </div>
            {createError ? (
              <div className="md:col-span-12 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-100">
                {createError}
              </div>
            ) : null}
          </form>
        </AdminModal>

        {/* Categories Table Card */}
        <div className="admin-surface rounded-2xl border admin-border">
          {/* Table Header / Toolbar */}
          <div className="relative z-10 admin-surface border-b admin-border px-4 md:px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border admin-border rounded-lg flex items-center justify-center admin-surface shrink-0">
                <svg className="w-6 h-6 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-slate-800 dark:text-white font-semibold">
                  {activeFilterCount === 0 && !search.trim()
                    ? t("categories.table.allCategories", "All Categories")
                    : t("categories.table.filteredCategories", "Filtered categories")}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  {filteredRows.length} {t("categories.table.totalCategories", "total categories")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:gap-3 justify-end w-full md:w-auto">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("categories.searchPlaceholder", "Search categories...")}
                className="h-10 w-full md:w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-[var(--admin-primary)] focus:bg-transparent transition-colors"
              />

              <AdminFilterToolbarButton
                activeCount={activeFilterCount}
                onClick={openFilterDrawer}
              />

              {canDeleteCategories && selectedIds.length > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={deleteSelected}
                  className="h-10 px-3.5 gap-2 rounded-lg text-sm font-semibold"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  {t("categories.deleteSelectedCount", "Delete Selected ({count})", { count: selectedIds.length })}
                </Button>
              ) : null}

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
            sections={categoryFilterSections}
            selected={draftFilters}
            onToggle={toggleDraft}
            onApply={handleApplyFilters}
            onClearAll={handleClearAllFilters}
          />

          {/* Table Content */}
          {loading ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex justify-center py-6">
                <AdminDashboardLoader />
              </div>
            </div>
          ) : filteredRows.length === 0 ? (
            <AdminEmptyState
              type="categories"
              isSearch={Boolean(search?.trim() || activeFilterCount > 0)}
              searchQuery={search}
              onClearFilters={() => {
                setSearch("");
                handleClearAllFilters();
              }}
              actionLabel={canCreateCategories ? t("categories.actions.createCategory", "Create Category") : undefined}
              onAction={canCreateCategories ? () => setShowCreateModal(true) : undefined}
            />
          ) : (
            <div className="overflow-x-auto rounded-b-2xl">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/70 text-left text-xs font-semibold text-slate-600 dark:text-slate-200 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700/70">
                    {canDeleteCategories ? (
                      <th className="px-4 md:px-6 py-3 md:py-4 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-0"
                          aria-label={t("categories.selectAll", "Select all")}
                        />
                      </th>
                    ) : null}
                    <th className="px-4 md:px-6 py-3 md:py-4">{t("categories.table.name", "Category Name")}</th>
                    <th className="px-4 md:px-6 py-3 md:py-4">{t("categories.table.gender", "Gender")}</th>
                    <th className="px-4 md:px-6 py-3 md:py-4">{t("categories.table.type", "Type")}</th>
                    <th className="px-4 md:px-6 py-3 md:py-4">{t("categories.table.status", "Status")}</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-right">{t("categories.table.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredRows.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors duration-150"
                    >
                      {canDeleteCategories ? (
                        <td className="px-4 md:px-6 py-4 w-10">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(c.id)}
                            onChange={() => toggleSelect(c.id)}
                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-0"
                          />
                        </td>
                      ) : null}

                      <td className="px-4 md:px-6 py-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold text-sm shrink-0">
                            {String(c?.name || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {c?.name || "Unnamed"}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              /{c?.slug || ""}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 md:px-6 py-4">
                        {c.gender ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {getGenderLabel(c.gender)}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-sm">-</span>
                        )}
                      </td>

                      <td className="px-4 md:px-6 py-4">
                        {c.type ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {getTypeLabel(c.type)}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-sm">-</span>
                        )}
                      </td>

                      <td className="px-4 md:px-6 py-4">
                        <span
                          className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            c.is_active
                              ? "border-[rgba(var(--admin-primary-rgb),0.35)] bg-[rgba(var(--admin-primary-rgb),0.08)] text-[color:var(--admin-primary)] dark:border-[rgba(var(--admin-primary-rgb),0.45)] dark:bg-[rgba(var(--admin-primary-rgb),0.14)] dark:text-[color:var(--admin-primary)]"
                              : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {c.is_active ? t("categories.status.active", "Active") : t("categories.status.inactive", "Inactive")}
                        </span>
                      </td>

                      <td className="px-4 md:px-6 py-4 text-right">
                        <AdminRowActions
                          onEdit={() => startEdit(c)}
                          canEdit={canEditCategories}
                          onDelete={() => del(c.id)}
                          canDelete={canDeleteCategories}
                          editTitle={t("categories.actions.editCategory", "Edit category")}
                          deleteTitle={t("categories.actions.deleteCategory", "Delete category")}
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

      <AdminModal
        open={!!editing}
        onClose={closeEditForm}
        title={t("categories.editCategory", "Edit Category")}
        titleId="category-edit-title"
        maxWidthClass="max-w-md"
      >
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">
                {t("categories.form.name", "Category Name")}
              </label>
              <input
                value={editing.name}
                onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                className="w-full h-12 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-300"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">
                {t("categories.form.gender", "Gender")}
              </label>
              <AdminSearchSelect
                value={editing.gender || ""}
                onChange={(gender) => setEditing((s) => ({ ...s, gender }))}
                options={genderOptions}
                inputClassName="w-full h-12 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-300"
                ariaLabel={t("categories.form.gender", "Gender")}
                placeholder={t("categories.form.searchGender", "Search gender…")}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">
                {t("categories.form.type", "Category Type")}
              </label>
              <AdminSearchSelect
                value={editing.type || ""}
                onChange={(type) => setEditing((s) => ({ ...s, type }))}
                options={typeOptions}
                inputClassName="w-full h-12 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-300"
                ariaLabel={t("categories.form.typeAria", "Category type")}
                placeholder={t("categories.form.searchType", "Search type…")}
              />
            </div>

            <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setEditing((s) => ({ ...s, is_active: !s.is_active }))}
                className="relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-slate-300 dark:focus:ring-slate-600 dark:focus:ring-offset-slate-900"
                style={{ backgroundColor: editing.is_active ? accentColor : (mode === 'dark' ? '#334155' : '#e2e8f0') }}
              >
                <span className="w-5 h-5 bg-white rounded-full transform transition-transform duration-300" style={{ transform: editing.is_active ? 'translateX(20px)' : 'translateX(4px)' }} />
              </button>
              <span className="text-sm font-medium text-black dark:text-white">
                {t("categories.form.activeStatus", "Active Status")}
              </span>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={closeEditForm}
                className="flex-1"
              >
                {t("common.actions.cancel", "Cancel")}
              </Button>
              {canEditCategories ? (
                <Button
                  type="button"
                  onClick={saveEdit}
                  className="flex-1"
                >
                  {t("common.actions.save", "Save Changes")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </AdminModal>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
