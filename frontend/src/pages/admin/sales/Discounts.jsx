import { useTranslation } from "@/lib/i18n.jsx";
import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/state/auth";
import { useAdminPermissions } from "@/hooks/useAdminPermissions.js";
import { getFirstAccessibleAdminPath } from "@/lib/adminPermissions.js";
import { useTheme } from "@/state/theme.jsx";
import AdminModal, { AdminConfirmDialog } from "@/components/admin/AdminModal.jsx";
import AdminRowActions from "@/components/admin/AdminRowActions.jsx";
import { adminCacheKey, readAdminCache, writeAdminCache } from "@/lib/adminPageCache.js";
import { AdminContentSkeleton } from "@/components/admin/AdminLoading";
import { Button } from "@/components/ui/button";

const DISCOUNTS_CACHE_KEY = adminCacheKey("discounts", "v1");
import { resolveImageUrl } from "@/lib/images";
import {
  buildAllColumnsVisibility,
  loadTableColumnVisibility,
  TableColumnVisibilityMenu,
} from "@/components/admin/TableColumnVisibilityMenu.jsx";
import AdminListPaginationBar from "@/components/admin/AdminListPaginationBar.jsx";
import { sliceAdminListPage } from "@/lib/adminListQuery.js";
import AdminSearchSelect from "@/components/admin/AdminSearchSelect.jsx";
import AdminDatePicker from "@/components/admin/AdminDatePicker.jsx";
import AdminEmptyState from "@/components/admin/AdminEmptyState.jsx";
import { mapAdminSelectOptions } from "@/lib/adminSelectHelpers.js";

const DISCOUNTS_TABLE_COLUMNS = [
  { id: "product", label: "Product", labelKey: "discounts.table.product" },
  { id: "discount", label: "Discount", labelKey: "discounts.table.discount" },
  { id: "originalPrice", label: "Original Price", labelKey: "discounts.table.originalPrice" },
  { id: "salePrice", label: "Discounted Price", labelKey: "discounts.table.salePrice" },
  { id: "quantity", label: "Quantity", labelKey: "discounts.table.quantity" },
  { id: "startDate", label: "Start Date", labelKey: "discounts.table.startDate" },
  { id: "endDate", label: "End Date", labelKey: "discounts.table.endDate" },
  { id: "status", label: "Status", labelKey: "discounts.table.status" },
  { id: "actions", label: "Actions", labelKey: "discounts.table.actions" },
];

const DISCOUNTS_COLUMNS_STORAGE_KEY = "themanstore-discounts-columns";

const formatDiscountDate = (dateString, lang = "en") => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return String(dateString);
  return d.toLocaleDateString(lang === "km" || lang === "kh" ? "km-KH" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default function AdminDiscounts() {
  const { t, language } = useTranslation();
  const { refresh: refreshAuth } = useAuth();
  const { user, can, permissionsReady } = useAdminPermissions();
  const canViewDiscounts = can("discounts", "view");
  const canCreateDiscounts = can("discounts", "create");
  const canEditDiscounts = can("discounts", "edit");
  const canDeleteDiscounts = can("discounts", "delete");
  const { primaryColor, mode } = useTheme();
  const isDark = mode === "dark";
  const accentIsWhite = (primaryColor || "").toUpperCase() === "#FFFFFF";
  const deleteButtonStyle = {
    backgroundColor: isDark ? "rgba(127, 29, 29, 0.22)" : "#fef2f2",
    color: isDark ? "#fecdd3" : "#991b1b",
    border: `1px solid ${isDark ? "rgba(248, 113, 113, 0.45)" : "#fecdd3"}`,
    borderRadius: "0.5rem",
    width: "2.5rem",
    height: "2.5rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 150ms ease",
  };
  const discountsCache = readAdminCache(DISCOUNTS_CACHE_KEY);
  const [rows, setRows] = useState(() => discountsCache?.rows ?? []);
  const [loading, setLoading] = useState(() => !discountsCache?.rows?.length);
  const [products, setProducts] = useState(() => discountsCache?.products ?? []);
  const [form, setForm] = useState({
    product_id: "",
    discount_type: "percentage",
    discount_value: "",
    sale_price: "",
    quantity: "",
    start_date: "",
    end_date: "",
    is_active: true,
    description: "",
  });
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [animate, setAnimate] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [columnVisibility, setColumnVisibility] = useState(() =>
    loadTableColumnVisibility(DISCOUNTS_COLUMNS_STORAGE_KEY, DISCOUNTS_TABLE_COLUMNS),
  );
  const [productSellableStock, setProductSellableStock] = useState(null);

  const discountTypeOptions = useMemo(
    () => [
      { value: "percentage", label: t("discounts.types.percentage", "Percentage (%)") },
      { value: "fixed", label: t("discounts.types.fixed", "Fixed Amount ($)") },
    ],
    [t],
  );

  const tableColumns = useMemo(
    () => [
      { id: "product", label: t("discounts.table.product", "Product"), labelKey: "discounts.table.product" },
      { id: "discount", label: t("discounts.table.discount", "Discount"), labelKey: "discounts.table.discount" },
      { id: "originalPrice", label: t("discounts.table.originalPrice", "Original Price"), labelKey: "discounts.table.originalPrice" },
      { id: "salePrice", label: t("discounts.table.salePrice", "Discounted Price"), labelKey: "discounts.table.salePrice" },
      { id: "quantity", label: t("discounts.table.quantity", "Quantity"), labelKey: "discounts.table.quantity" },
      { id: "startDate", label: t("discounts.table.startDate", "Start Date"), labelKey: "discounts.table.startDate" },
      { id: "endDate", label: t("discounts.table.endDate", "End Date"), labelKey: "discounts.table.endDate" },
      { id: "status", label: t("discounts.table.status", "Status"), labelKey: "discounts.table.status" },
      { id: "actions", label: t("discounts.table.actions", "Actions"), labelKey: "discounts.table.actions" },
    ],
    [t],
  );

  const triggerAuthRefresh = async () => {
    try {
      await refreshAuth();
    } catch (e) {
      console.warn("Auth refresh failed");
    }
  };

  const extractErr = (e) => {
    const status = e?.response?.status;
    if (status === 401) {
      triggerAuthRefresh();
      return t("discounts.messages.unauthorizedError", "Unauthorized (401). Please login again.");
    }
    const fieldErrors = e?.response?.data?.errors;
    if (fieldErrors?.quantity?.[0]) return fieldErrors.quantity[0];
    return e?.response?.data?.message || t("discounts.messages.loadSaveError", "Failed to load/save data.");
  };

  useEffect(() => {
    if (!form.product_id) {
      setProductSellableStock(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/admin/products/${form.product_id}`);
        const product = data?.data ?? data;
        const stock = Number(product?.sellable_stock);
        if (!cancelled) {
          setProductSellableStock(Number.isFinite(stock) ? Math.max(0, stock) : null);
        }
      } catch {
        if (!cancelled) setProductSellableStock(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.product_id]);

  const load = async () => {
    if (!canViewDiscounts) {
      setRows([]);
      setProducts([]);
      setLoading(false);
      return;
    }
    const cached = readAdminCache(DISCOUNTS_CACHE_KEY);
    if (cached?.rows?.length) {
      setRows(cached.rows);
      setProducts(cached.products ?? []);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data: discountsData } = await api.get("/admin/discounts");
      const { data: productsData } = await api.get("/admin/products", { params: { per_page: 500 } });
      const nextRows = discountsData?.data || [];
      const nextProducts = productsData?.data || [];
      setRows(nextRows);
      setProducts(nextProducts);
      writeAdminCache(DISCOUNTS_CACHE_KEY, { rows: nextRows, products: nextProducts });
    } catch (e) {
      setErr(extractErr(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!permissionsReady) return;
    load();
  }, [permissionsReady, canViewDiscounts]);

  useEffect(() => {
    try {
      localStorage.setItem(DISCOUNTS_COLUMNS_STORAGE_KEY, JSON.stringify(columnVisibility));
    } catch {
      /* ignore quota */
    }
  }, [columnVisibility]);

  const isColVisible = (columnId) => columnVisibility[columnId] !== false;

  const toggleTableColumn = (columnId) => {
    setColumnVisibility((prev) => ({ ...prev, [columnId]: !isColVisible(columnId) }));
  };

  const setAllTableColumnsVisible = (visible) => {
    setColumnVisibility(buildAllColumnsVisibility(DISCOUNTS_TABLE_COLUMNS, visible, "product"));
  };

  const showSuccess = (msg) => {
    setSuccess(msg);
    setAnimate(true);
    setTimeout(() => setSuccess(""), 3000);
    setTimeout(() => setAnimate(false), 2800);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!form.product_id || !form.discount_value || !form.start_date || !form.end_date) {
      setErr(t("discounts.messages.requiredFields", "Please fill in all required fields"));
      return;
    }

    const qtyRaw = String(form.quantity ?? "").trim();
    let quantity = null;
    if (qtyRaw !== "") {
      quantity = Number.parseInt(qtyRaw, 10);
      if (!Number.isFinite(quantity) || quantity < 1) {
        setErr(t("discounts.messages.quantityMinError", "Quantity must be at least 1, or leave empty for unlimited"));
        return;
      }
      if (productSellableStock != null && quantity > productSellableStock) {
        setErr(
          t(
            "discounts.messages.quantityStockError",
            "Discount quantity cannot exceed available stock ({stock} units).",
            { stock: productSellableStock },
          ),
        );
        return;
      }
    }

    const payload = {
      ...form,
      quantity,
    };

    try {
      if (editing) {
        if (!canEditDiscounts) {
          setErr(t("discounts.messages.noPermissionEdit", "You do not have permission to edit discounts."));
          return;
        }
        await api.patch(`/admin/discounts/${editing}`, payload);
        showSuccess(t("discounts.messages.updatedSuccess", "Discount updated successfully"));
      } else {
        if (!canCreateDiscounts) {
          setErr(t("discounts.messages.noPermissionCreate", "You do not have permission to create discounts."));
          return;
        }
        await api.post("/admin/discounts", payload);
        showSuccess(t("discounts.messages.createdSuccess", "Discount created successfully"));
      }
      resetForm();
      setShowCreateForm(false);
      load();
    } catch (e) {
      setErr(extractErr(e));
    }
  };

  const resetForm = () => {
    setForm({
      product_id: "",
      discount_type: "percentage",
      discount_value: "",
      sale_price: "",
      quantity: "",
      start_date: "",
      end_date: "",
      is_active: true,
      description: "",
    });
    setEditing(null);
    setProductSellableStock(null);
  };

  const handleEdit = (discount) => {
    setForm({
      product_id: discount.product_id,
      discount_type: discount.discount_type,
      discount_value: discount.discount_value,
      sale_price: discount.sale_price,
      quantity: discount.quantity ?? "",
      start_date: discount.start_date?.split("T")[0],
      end_date: discount.end_date?.split("T")[0],
      is_active: discount.is_active,
      description: discount.description,
    });
    setEditing(discount.id);
    setShowCreateForm(true);
  };

  const closeCreateForm = () => {
    setShowCreateForm(false);
    resetForm();
  };

  const handleDelete = (id) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (!canDeleteDiscounts) {
      setErr(t("discounts.messages.noPermissionDelete", "You do not have permission to delete discounts."));
      setDeleteTarget(null);
      return;
    }
    setDeleteBusy(true);
    setErr("");
    try {
      await api.delete(`/admin/discounts/${deleteTarget}`);
      setDeleteTarget(null);
      showSuccess(t("discounts.messages.deletedSuccess", "Discount deleted successfully"));
      load();
    } catch (e) {
      setErr(extractErr(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const toggleActive = async (ids, isActive) => {
    if (!canEditDiscounts) {
      setErr(t("discounts.messages.noPermissionEdit", "You do not have permission to update discounts."));
      return;
    }
    try {
      await api.post("/admin/discounts/bulk-toggle", {
        ids,
        is_active: isActive,
      });
      showSuccess(t("discounts.messages.bulkUpdatedSuccess", "Discounts updated successfully"));
      load();
    } catch (e) {
      setErr(extractErr(e));
    }
  };

  const selectedProduct = () => {
    if (!form.product_id) return null;
    return products.find((p) => p.id === parseInt(form.product_id, 10)) || null;
  };

  const formatMoney = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n.toFixed(2) : "";
  };

  const calculateSalePrice = () => {
    if (!form.product_id || !form.discount_value) return "";
    const product = selectedProduct();
    if (!product) return "";

    if (form.discount_type === "percentage") {
      return (product.price * (1 - form.discount_value / 100)).toFixed(2);
    }
    return Math.max(0, product.price - form.discount_value).toFixed(2);
  };

  const selectedOriginalPrice = selectedProduct()?.price;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (discount) =>
        String(discount.product?.name || "").toLowerCase().includes(q) ||
        String(discount.discount_type || "").toLowerCase().includes(q) ||
        String(discount.description || "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const listPage = useMemo(() => sliceAdminListPage(filteredRows, page), [filteredRows, page]);
  const { rows: paginatedRows, lastPage, usePagination } = listPage;

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  if (!permissionsReady) return <AdminContentSkeleton lines={3} imageHeight={220} />;
  if (loading && rows.length === 0) return <AdminContentSkeleton lines={3} imageHeight={220} />;

  if (!canViewDiscounts) {
    return <Navigate to={getFirstAccessibleAdminPath(user)} replace />;
  }

  return (
    <div className="w-full min-w-0 min-h-full admin-soft text-slate-800 dark:text-slate-100">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-slate-100">
            {t("discounts.manageDiscounts", "Manage Discounts")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("discounts.pageSubtitle", "Create and manage product discounts, promotional prices, and campaign periods.")}
          </p>
        </div>
        {canCreateDiscounts ? (
          <Button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t("discounts.createDiscount", "Create Discount")}
          </Button>
        ) : null}
      </div>

      <AdminConfirmDialog
        open={deleteTarget != null}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={t("discounts.deleteDiscountPrompt", "Delete this discount?")}
        message={t("discounts.deleteDiscountMessage", "This action cannot be undone.")}
        confirmLabel={t("common.actions.delete", "Delete")}
        cancelLabel={t("common.actions.cancel", "Cancel")}
        destructive
        busy={deleteBusy}
      />

      <AdminModal
        open={showCreateForm}
        onClose={closeCreateForm}
        title={editing ? t("discounts.editDiscount", "Edit Discount") : t("discounts.createDiscount", "Create Discount")}
        titleId="discount-form-title"
      >
        {err && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-4">{err}</div>}
        {success && (
          <div className={`bg-slate-900 text-white p-4 rounded-xl mb-4 transition-opacity ${animate ? "opacity-100" : "opacity-0"}`}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                {t("discounts.form.productRequired", "Product *")}
              </label>
              <AdminSearchSelect
                value={form.product_id}
                onChange={(product_id) => setForm({ ...form, product_id, sale_price: "" })}
                options={mapAdminSelectOptions(products, {
                  valueKey: "id",
                  labelFn: (p) => `${p.name} - $${p.price}`,
                })}
                inputClassName="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500"
                emptyLabel={t("discounts.form.selectProduct", "Select Product")}
                placeholder={t("discounts.form.searchProduct", "Search product…")}
                ariaLabel={t("discounts.form.product", "Product")}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                {t("discounts.form.discountTypeRequired", "Discount Type *")}
              </label>
              <AdminSearchSelect
                value={form.discount_type}
                onChange={(discount_type) => setForm({ ...form, discount_type, sale_price: "" })}
                options={discountTypeOptions}
                inputClassName="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500"
                ariaLabel={t("discounts.form.discountType", "Discount Type")}
                placeholder={t("discounts.form.searchType", "Search type…")}
                allowEmpty={false}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                {t("discounts.form.discountValueUnit", "Discount Value {unit} *", {
                  unit: form.discount_type === "percentage" ? "(%)" : "($)",
                })}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value, sale_price: "" })}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500"
                placeholder={
                  form.discount_type === "percentage"
                    ? t("discounts.form.percentagePlaceholder", "e.g. 20")
                    : t("discounts.form.fixedPlaceholder", "e.g. 10.99")
                }
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                {t("discounts.form.originalPrice", "Original Price ($)")}
              </label>
              <div
                className="flex h-11 w-full items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
                aria-live="polite"
              >
                {selectedOriginalPrice != null && selectedOriginalPrice !== ""
                  ? `$${formatMoney(selectedOriginalPrice)}`
                  : t("discounts.form.selectProductFirst", "Select a product")}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                {t("discounts.form.discountedPrice", "Discounted Price ($)")}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.sale_price || calculateSalePrice()}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500"
                placeholder={t("discounts.form.autoCalculated", "Auto-calculated")}
              />
              {calculateSalePrice() && !form.sale_price && selectedOriginalPrice != null && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t(
                    "discounts.form.autoCalculatedHint",
                    "Auto: ${salePrice} (from ${originalPrice})",
                    {
                      salePrice: calculateSalePrice(),
                      originalPrice: formatMoney(selectedOriginalPrice),
                    },
                  )}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                {t("discounts.form.quantity", "Quantity")}
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max={productSellableStock != null ? productSellableStock : undefined}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500"
                placeholder={t("discounts.form.quantityPlaceholder", "e.g. 50")}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {productSellableStock != null
                  ? t(
                      "discounts.form.quantityHelpStock",
                      "Max units at this discounted price (available stock: {stock} units). Leave empty for unlimited.",
                      { stock: productSellableStock },
                    )
                  : t(
                      "discounts.form.quantityHelpUnlimited",
                      "Max units at this discounted price. Leave empty for unlimited.",
                    )}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                {t("discounts.form.startDateRequired", "Start Date *")}
              </label>
              <AdminDatePicker
                value={form.start_date}
                onChange={(val) => setForm({ ...form, start_date: val })}
                max={form.end_date || undefined}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                placeholder={t("discounts.form.startDateRequired", "Start Date *")}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                {t("discounts.form.endDateRequired", "End Date *")}
              </label>
              <AdminDatePicker
                value={form.end_date}
                onChange={(val) => setForm({ ...form, end_date: val })}
                min={form.start_date || undefined}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                placeholder={t("discounts.form.endDateRequired", "End Date *")}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
              {t("discounts.form.description", "Description")}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500"
              rows="3"
              placeholder={t("discounts.form.descriptionPlaceholder", "Discount details, special notes, etc.")}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("discounts.form.active", "Active")}
            </label>
          </div>

          <div className="flex gap-2">
            <Button type="submit">
              {editing
                ? t("discounts.form.submitUpdate", "Update Discount")
                : t("discounts.form.submitCreate", "Create Discount")}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
              >
                {t("common.actions.cancel", "Cancel")}
              </Button>
            )}
          </div>
        </form>
      </AdminModal>

      <div className="admin-surface rounded-2xl border admin-border">
        <div className="relative z-10 flex flex-col gap-3 border-b admin-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t("discounts.allDiscounts", "All Discounts")}
            </h3>
            {filteredRows.length > 0 ? (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {usePagination
                  ? t("discounts.onThisPage", "{count} on this page · {total} total", {
                      count: paginatedRows.length,
                      total: filteredRows.length,
                    })
                  : filteredRows.length === 1
                  ? t("discounts.totalDiscountsSingle", "{count} discount", { count: filteredRows.length })
                  : t("discounts.totalDiscountsMultiple", "{count} discounts", { count: filteredRows.length })}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("discounts.searchPlaceholder", "Search discounts...")}
              className="h-10 w-64 rounded-lg border admin-border admin-surface px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[color:var(--admin-primary)] focus:ring-2 focus:ring-[rgba(var(--admin-primary-rgb),0.2)] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <TableColumnVisibilityMenu
              columns={tableColumns}
              visibility={columnVisibility}
              onToggle={toggleTableColumn}
              onShowAll={() => setAllTableColumnsVisible(true)}
              onHideAll={() => setAllTableColumnsVisible(false)}
            />
          </div>
        </div>
        {filteredRows.length === 0 ? (
          <AdminEmptyState
            type="discounts"
            isSearch={Boolean(search.trim() || statusFilter !== "all" || typeFilter !== "all")}
            searchQuery={search}
            onClearFilters={() => {
              setSearch("");
              setStatusFilter("all");
              setTypeFilter("all");
            }}
            actionLabel={canCreateDiscounts ? t("discounts.actions.createDiscount", "Create Discount") : undefined}
            onAction={canCreateDiscounts ? () => setShowCreateForm(true) : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-b-2xl">
          <table className="w-full min-w-[900px]">
            <thead className="admin-bg-elevated text-slate-700 dark:text-slate-200">
              <tr>
                {isColVisible("product") ? (
                  <th className="px-4 py-2 text-left">{t("discounts.table.product", "Product")}</th>
                ) : null}
                {isColVisible("discount") ? (
                  <th className="px-4 py-2 text-left">{t("discounts.table.discount", "Discount")}</th>
                ) : null}
                {isColVisible("originalPrice") ? (
                  <th className="px-4 py-2 text-left">{t("discounts.table.originalPrice", "Original Price")}</th>
                ) : null}
                {isColVisible("salePrice") ? (
                  <th className="px-4 py-2 text-left">{t("discounts.table.salePrice", "Discounted Price")}</th>
                ) : null}
                {isColVisible("quantity") ? (
                  <th className="px-4 py-2 text-left">{t("discounts.table.quantity", "Quantity")}</th>
                ) : null}
                {isColVisible("startDate") ? (
                  <th className="px-4 py-2 text-left">{t("discounts.table.startDate", "Start Date")}</th>
                ) : null}
                {isColVisible("endDate") ? (
                  <th className="px-4 py-2 text-left">{t("discounts.table.endDate", "End Date")}</th>
                ) : null}
                {isColVisible("status") ? (
                  <th className="px-4 py-2 text-left">{t("discounts.table.status", "Status")}</th>
                ) : null}
                {isColVisible("actions") ? (
                  <th className="px-4 py-2 text-left">{t("discounts.table.actions", "Actions")}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((discount) => (
                <tr
                  key={discount.id}
                  className="border-t admin-border hover:bg-[rgba(var(--admin-primary-rgb),0.06)] dark:hover:bg-[rgba(var(--admin-primary-rgb),0.08)]"
                >
                  {isColVisible("product") ? (
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-semibold text-xs overflow-hidden shrink-0">
                          {discount.product?.image_url ? (
                            <img
                              src={resolveImageUrl(discount.product.image_url)}
                              alt={discount.product?.name || ""}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            discount.product?.name?.charAt(0)?.toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                            {discount.product?.name}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[200px]">
                            {discount.product?.brand?.name || ""}
                          </p>
                        </div>
                      </div>
                    </td>
                  ) : null}
                  {isColVisible("discount") ? (
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                      {discount.discount_type === "percentage"
                        ? `${discount.discount_value}%`
                        : `$${parseFloat(discount.discount_value).toFixed(2)}`}
                    </td>
                  ) : null}
                  {isColVisible("originalPrice") ? (
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                      {discount.product?.price != null ? `$${parseFloat(discount.product.price).toFixed(2)}` : "—"}
                    </td>
                  ) : null}
                  {isColVisible("salePrice") ? (
                    <td className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                      ${parseFloat(discount.sale_price).toFixed(2)}
                    </td>
                  ) : null}
                  {isColVisible("quantity") ? (
                    <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                      {discount.quantity != null && discount.quantity !== ""
                        ? discount.quantity
                        : t("discounts.status.unlimited", "Unlimited")}
                    </td>
                  ) : null}
                  {isColVisible("startDate") ? (
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                      {formatDiscountDate(discount.start_date, language)}
                    </td>
                  ) : null}
                  {isColVisible("endDate") ? (
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                      {formatDiscountDate(discount.end_date, language)}
                    </td>
                  ) : null}
                  {isColVisible("status") ? (
                    <td className="px-4 py-2">
                      {canEditDiscounts ? (
                        <button
                          onClick={() => toggleActive([discount.id], !discount.is_active)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                            discount.is_active
                              ? "bg-[rgba(var(--admin-primary-rgb),0.14)] text-[color:var(--admin-primary)] border-[rgba(var(--admin-primary-rgb),0.4)] dark:bg-[rgba(var(--admin-primary-rgb),0.22)] dark:text-[color:var(--admin-primary)] dark:border-[rgba(var(--admin-primary-rgb),0.45)]"
                              : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                          }`}
                        >
                          {discount.is_active
                            ? t("discounts.status.active", "Active")
                            : t("discounts.status.inactive", "Inactive")}
                        </button>
                      ) : (
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                            discount.is_active
                              ? "bg-[rgba(var(--admin-primary-rgb),0.14)] text-[color:var(--admin-primary)] border-[rgba(var(--admin-primary-rgb),0.4)]"
                              : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                          }`}
                        >
                          {discount.is_active
                            ? t("discounts.status.active", "Active")
                            : t("discounts.status.inactive", "Inactive")}
                        </span>
                      )}
                    </td>
                  ) : null}
                  {isColVisible("actions") ? (
                    <td className="px-4 py-2">
                      <AdminRowActions
                        align="start"
                        onEdit={() => handleEdit(discount)}
                        canEdit={canEditDiscounts}
                        onDelete={() => handleDelete(discount.id)}
                        canDelete={canDeleteDiscounts}
                        editTitle={t("discounts.messages.editDiscountTitle", "Edit discount")}
                        deleteTitle={t("discounts.messages.deleteDiscountTitle", "Delete discount")}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AdminListPaginationBar
          page={page}
          lastPage={lastPage}
          total={filteredRows.length}
          onPageChange={setPage}
        />
          </>
        )}
      </div>
    </div>
  );
}
