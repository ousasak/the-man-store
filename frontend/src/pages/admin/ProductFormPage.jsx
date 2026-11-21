import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  X,
  Plus,
  Trash2,
  Eye,
  Package,
  DollarSign,
  Layers,
  SlidersHorizontal,
  LayoutGrid,
  Tag,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Save,
  HelpCircle,
  AlertCircle,
  Image as ImageIcon,
  Info,
} from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../state/auth";
import { useAdminPermissions } from "../../hooks/useAdminPermissions.js";
import { useTheme } from "../../state/theme.jsx";
import { resolveImageUrl } from "../../lib/images";
import { closeSwal, errorAlert, loadingAlert, toastSuccess } from "../../lib/swal";
import { AdminContentSkeleton, AdminDashboardLoader } from "@/components/admin/AdminLoading";
import AdminModal from "../../components/admin/AdminModal.jsx";
import AdminSearchSelect from "../../components/admin/AdminSearchSelect.jsx";
import FieldWithQuickCreate, { QUICK_CREATE_OPTION } from "../../components/admin/FieldWithQuickCreate.jsx";
import CategoryCreateForm from "../../components/admin/CategoryCreateForm.jsx";
import BrandCreateForm from "../../components/admin/BrandCreateForm.jsx";
import {
  buildVariantMatrixRowsFromGrid,
  parseVariantMatrix,
  variantMatrixPayloadFromUiRows,
  variantMatrixTotalQty,
} from "../../lib/variantMatrix.js";
import {
  DEFAULT_VARIANT_BARCODE_FORMAT,
  VARIANT_BARCODE_FORMAT_OPTIONS,
} from "../../lib/variantBarcode.js";

const CREATE_FORM_GALLERY_SLOTS = 4;
const MAX_GALLERY_THUMBNAILS = 5;

const GENDER_OPTIONS = [
  { value: "unisex", label: "Unisex / All" },
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "kids", label: "Kids" },
];

const POPULAR_COLORS = [
  "Black", "White", "Navy", "Gray", "Beige", "Red", "Blue", "Olive", "Khaki", "Brown", "Pink", "Green"
];

const SIZE_PRESETS = {
  clothes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
  shoes: ["38", "39", "40", "41", "42", "43", "44", "45"],
  bags: ["Small", "Medium", "Large", "15L", "20L", "25L", "30L"],
  hats: ["S/M", "L/XL", "One Size", "Adjustable"],
  accessories: ["One Size"],
  default: ["XS", "S", "M", "L", "XL", "XXL"],
};

function newMatrixRowId() {
  return `matrix-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function newColorRowId() {
  return `color-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyVariantMatrixRow() {
  return {
    id: newMatrixRowId(),
    color: "",
    size: "",
    qty: "",
    sku_barcode: "",
    barcode_format: DEFAULT_VARIANT_BARCODE_FORMAT,
  };
}

function normalizeSizes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String).map((s) => s.trim()).filter(Boolean);
    } catch {
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseGallery(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String).map((s) => s.trim()).filter(Boolean);
    } catch {
      return raw.split("\n").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function colorVariantRowsFromApi(raw) {
  const emptyRow = () => [{ id: newColorRowId(), name: "", image_url: "" }];
  if (raw == null || raw === "") return emptyRow();
  if (typeof raw === "string") {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return emptyRow();
    return parts.map((name) => ({ id: newColorRowId(), name, image_url: "" }));
  }
  if (!Array.isArray(raw) || raw.length === 0) return emptyRow();
  const rows = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const n = item.trim();
      if (n) rows.push({ id: newColorRowId(), name: n, image_url: "" });
    } else if (item && typeof item === "object") {
      const name = String(item.name ?? item.label ?? "").trim();
      const image_url = String(item.image_url ?? item.imageUrl ?? "").trim();
      if (name || image_url) rows.push({ id: newColorRowId(), name, image_url });
    }
  }
  return rows.length ? rows : emptyRow();
}

function uniqueColorNamesFromSwatchRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const n = (r.name || "").trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

export default function ProductFormPage() {
  const { id: routeId } = useParams();
  const isEdit = Boolean(routeId);
  const productId = routeId ? String(routeId) : null;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin, canManageProducts } = useAdminPermissions();
  const { adminColor } = useTheme();
  const primaryColor = adminColor || "#10b981";

  // Core Form State
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [productDetail, setProductDetail] = useState(null);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode_code: "",
    category_id: "",
    brand_id: "",
    supplier_id: "",
    gender: "unisex",
    description: "",
    model_info: "",
    image_url: "",
    price: "",
    cost_price: "",
    is_active: true,
    has_variants: true,
    sizes: [],
    support_phone: "",
    payment_methods: "",
  });

  // Media Gallery (Slot 0 is cover, Slots 1-4 are gallery)
  const [gallerySlotUrls, setGallerySlotUrls] = useState(Array.from({ length: CREATE_FORM_GALLERY_SLOTS }, () => ""));
  const [activePhotoSlot, setActivePhotoSlot] = useState(0); // 0 = Cover, 1..4 = Gallery slot 1..4
  const [dragOverDropzone, setDragOverDropzone] = useState(false);

  // Variant & Color State
  const [colorVariants, setColorVariants] = useState([{ id: newColorRowId(), name: "", image_url: "" }]);
  const [variantMatrix, setVariantMatrix] = useState([emptyVariantMatrixRow()]);
  const [customSizeInput, setCustomSizeInput] = useState("");
  const [bulkStockQty, setBulkStockQty] = useState("");

  // Categories, Brands, Suppliers dropdown data
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // Quick Create Modals
  const [quickCreateCategoryOpen, setQuickCreateCategoryOpen] = useState(false);
  const [quickCreateBrandOpen, setQuickCreateBrandOpen] = useState(false);
  const [imageUrlPickerOpen, setImageUrlPickerOpen] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState("");

  // Form validation errors
  const [formErrors, setFormErrors] = useState({});

  // Refs for hidden file inputs
  const coverFileInputRef = useRef(null);
  const galleryFileInputRef = useRef(null);
  const colorFileInputRef = useRef(null);
  const colorUploadRowIdRef = useRef(null);

  // Load catalogs (categories, brands, suppliers)
  const loadCatalogs = async () => {
    try {
      const [catRes, brandRes, supRes] = await Promise.all([
        api.get("/admin/categories"),
        api.get("/admin/brands"),
        api.get("/admin/suppliers"),
      ]);
      setCategories(catRes.data?.data || catRes.data || []);
      setBrands(brandRes.data?.data || brandRes.data || []);
      setSuppliers(supRes.data?.data || supRes.data || []);
    } catch (err) {
      console.error("Failed to load catalogs", err);
    }
  };

  // Load product if editing
  const loadProduct = async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/products/${productId}`);
      const prod = data?.data || data;
      setProductDetail(prod);

      const parsedSizes = normalizeSizes(prod.sizes);
      const parsedColors = colorVariantRowsFromApi(prod.colors);
      const parsedMatrix = parseVariantMatrix(prod.variant_matrix);
      const gallery = parseGallery(prod.gallery);

      setForm({
        name: prod.name || "",
        sku: prod.sku || "",
        barcode_code: prod.barcode_code || "",
        category_id: prod.category_id != null ? String(prod.category_id) : "",
        brand_id: prod.brand_id != null ? String(prod.brand_id) : "",
        supplier_id: prod.supplier_id != null ? String(prod.supplier_id) : "",
        gender: prod.gender || "unisex",
        description: prod.description || "",
        model_info: prod.model_info || "",
        image_url: prod.image_url || "",
        price: prod.price != null ? String(prod.price) : "",
        cost_price: prod.cost_price != null ? String(prod.cost_price) : "",
        is_active: prod.is_active !== false,
        has_variants: prod.has_variants !== false,
        sizes: parsedSizes,
        support_phone: prod.support_phone || "",
        payment_methods: prod.payment_methods || "",
      });

      setGallerySlotUrls(
        Array.from({ length: CREATE_FORM_GALLERY_SLOTS }, (_, i) => (gallery[i] || "").trim())
      );
      setColorVariants(parsedColors.length ? parsedColors : [{ id: newColorRowId(), name: "", image_url: "" }]);
      setVariantMatrix(
        parsedMatrix.length
          ? parsedMatrix.map((r) => ({
              id: newMatrixRowId(),
              color: r.color,
              size: r.size,
              qty: String(r.qty),
              sku_barcode: r.sku_barcode || "",
              barcode_format: r.barcode_format || DEFAULT_VARIANT_BARCODE_FORMAT,
            }))
          : [emptyVariantMatrixRow()]
      );
    } catch (err) {
      console.error("Failed to load product detail", err);
      await errorAlert({
        khTitle: "បរាជ័យក្នុងការទាញយកទិន្នន័យ",
        enTitle: "Failed to load product",
        detail: "Could not retrieve product information from server.",
      });
      navigate("/admin/products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalogs();
    if (isEdit) {
      loadProduct();
    }
  }, [productId]);

  // Derive size options based on selected category type
  const selectedCategory = useMemo(() => {
    return categories.find((c) => String(c.id) === String(form.category_id));
  }, [categories, form.category_id]);

  const sizePresetOptions = useMemo(() => {
    const catName = (selectedCategory?.name || "").toLowerCase();
    if (catName.includes("shoe") || catName.includes("sneaker")) return SIZE_PRESETS.shoes;
    if (catName.includes("bag") || catName.includes("backpack")) return SIZE_PRESETS.bags;
    if (catName.includes("hat") || catName.includes("cap")) return SIZE_PRESETS.hats;
    if (catName.includes("acc")) return SIZE_PRESETS.accessories;
    return SIZE_PRESETS.clothes;
  }, [selectedCategory]);

  // Keep Matrix Rows synced when Colors or Sizes change
  useEffect(() => {
    if (!form.has_variants) return;
    const colorNames = uniqueColorNamesFromSwatchRows(colorVariants);
    const sizes = normalizeSizes(form.sizes);

    if (colorNames.length > 0 && sizes.length > 0) {
      const rows = buildVariantMatrixRowsFromGrid(
        colorNames,
        sizes,
        variantMatrix,
        DEFAULT_VARIANT_BARCODE_FORMAT,
        newMatrixRowId
      );
      setVariantMatrix(rows);
    }
  }, [colorVariants, form.sizes]);

  // Media Upload handler
  const uploadImageFile = async (file) => {
    const fd = new FormData();
    fd.append("image", file);
    const { data } = await api.post("/admin/products/gallery-upload", fd);
    const url = data?.image_url || data?.url || data?.path || data?.data?.url || data?.data;
    return typeof url === "string" ? url : "";
  };

  const handleApplyCoverFile = async (file) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const uploadedUrl = await uploadImageFile(file);
      if (uploadedUrl) {
        setForm((prev) => ({ ...prev, image_url: uploadedUrl }));
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next.photos;
          return next;
        });
      }
    } catch (err) {
      console.error("Cover upload failed", err);
      await errorAlert({
        khTitle: "ការបង្ហោះរូបភាពបរាជ័យ",
        enTitle: "Upload failed",
        detail: "Could not upload image. Please check file format and size.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleApplyGallerySlotFile = async (file, slotIndex) => {
    if (!file || slotIndex < 0 || slotIndex >= CREATE_FORM_GALLERY_SLOTS) return;
    setIsUploading(true);
    try {
      const uploadedUrl = await uploadImageFile(file);
      if (uploadedUrl) {
        setGallerySlotUrls((prev) => {
          const next = [...prev];
          next[slotIndex] = uploadedUrl;
          return next;
        });
      }
    } catch (err) {
      console.error("Gallery upload failed", err);
      await errorAlert({
        khTitle: "ការបង្ហោះរូបភាពបរាជ័យ",
        enTitle: "Upload failed",
        detail: "Could not upload gallery image.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Color Swatch Upload
  const handleTriggerColorUpload = (rowId) => {
    colorUploadRowIdRef.current = rowId;
    colorFileInputRef.current?.click();
  };

  const handleColorFileSelected = async (e) => {
    const file = e.target.files?.[0];
    const rowId = colorUploadRowIdRef.current;
    colorUploadRowIdRef.current = null;
    if (e.target) e.target.value = "";
    if (!file || !rowId) return;

    setIsUploading(true);
    try {
      const url = await uploadImageFile(file);
      if (url) {
        setColorVariants((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, image_url: url } : r))
        );
      }
    } catch (err) {
      console.error("Color swatch upload failed", err);
    } finally {
      setIsUploading(false);
    }
  };

  // Generate SKU Helper
  const handleAutoGenerateSku = () => {
    const prefix = form.name
      ? form.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)
      : "PRD";
    const random = Math.floor(1000 + Math.random() * 9000);
    setForm((prev) => ({ ...prev, sku: `SKU-${prefix}-${random}` }));
  };

  // Generate Barcode Helper
  const handleAutoGenerateBarcode = () => {
    const random12 = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    setForm((prev) => ({ ...prev, barcode_code: random12 }));
  };

  // Bulk Apply Stock to All Matrix Rows
  const handleApplyBulkStock = () => {
    if (bulkStockQty === "" || isNaN(Number(bulkStockQty))) return;
    const targetQty = String(Math.max(0, parseInt(bulkStockQty, 10) || 0));
    setVariantMatrix((prev) =>
      prev.map((r) => ({ ...r, qty: targetQty }))
    );
  };

  // Photo slot actions
  const handleSlotUploadClick = (slotIdx) => {
    setActivePhotoSlot(slotIdx);
    if (slotIdx === 0) {
      coverFileInputRef.current?.click();
    } else {
      galleryFileInputRef.current?.click();
    }
  };

  const handleRemoveSlotPhoto = (slotIdx) => {
    if (slotIdx === 0) {
      setForm((prev) => ({ ...prev, image_url: "" }));
    } else {
      setGallerySlotUrls((prev) => {
        const next = [...prev];
        next[slotIdx - 1] = "";
        return next;
      });
    }
  };

  const handleDirectUrlSlot = (slotIdx) => {
    setActivePhotoSlot(slotIdx);
    const currentUrl = slotIdx === 0 ? form.image_url : gallerySlotUrls[slotIdx - 1];
    setImageUrlDraft(currentUrl || "");
    setImageUrlPickerOpen(true);
  };

  // Real-time calculation helpers
  const totalVariationsCount = variantMatrix.length;
  const totalOnHandUnits = useMemo(() => {
    if (!form.has_variants) return 0;
    return variantMatrixTotalQty(variantMatrixPayloadFromUiRows(variantMatrix));
  }, [form.has_variants, variantMatrix]);

  const estimatedInventoryValue = useMemo(() => {
    const sell = parseFloat(form.price) || 0;
    return (totalOnHandUnits * sell).toFixed(2);
  }, [totalOnHandUnits, form.price]);

  const grossMargin = useMemo(() => {
    const cost = parseFloat(form.cost_price) || 0;
    const sell = parseFloat(form.price) || 0;
    const diff = sell - cost;
    const margin = sell > 0 ? ((diff / sell) * 100).toFixed(1) : "0.0";
    return { diff, margin, isPositive: diff >= 0 };
  }, [form.cost_price, form.price]);

  // Validation
  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = "Product name is required.";
    if (!form.category_id) errors.category_id = "Category is required.";
    if (!form.brand_id) errors.brand_id = "Brand is required.";
    if (!form.image_url) errors.photos = "Product cover photo is required.";

    if (form.has_variants) {
      const colorNames = uniqueColorNamesFromSwatchRows(colorVariants);
      if (colorNames.length === 0) errors.colors = "At least one color option is required.";
      if (form.sizes.length === 0) errors.sizes = "At least one size is required.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validateForm()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setIsSubmitting(true);
    loadingAlert({
      khTitle: isEdit ? "កំពុងកែប្រែទំនិញ" : "កំពុងបង្កើតទំនិញថ្មី",
      enTitle: isEdit ? "Updating product" : "Creating product",
      khText: "សូមរង់ចាំបន្តិច...",
      enText: "Please wait...",
    });

    try {
      const colorNames = uniqueColorNamesFromSwatchRows(colorVariants);
      const cleanGallery = gallerySlotUrls.map((u) => u.trim()).filter(Boolean);

      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        barcode_code: form.barcode_code.trim() || null,
        category_id: form.category_id ? Number(form.category_id) : null,
        brand_id: form.brand_id ? Number(form.brand_id) : null,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        gender: form.gender || "unisex",
        description: form.description || "",
        model_info: form.model_info || "",
        image_url: form.image_url || "",
        price: form.price ? parseFloat(form.price) : 0,
        cost_price: form.cost_price ? parseFloat(form.cost_price) : 0,
        is_active: Boolean(form.is_active),
        has_variants: Boolean(form.has_variants),
        gallery: cleanGallery,
        sizes: form.has_variants ? normalizeSizes(form.sizes) : [],
        colors:
          form.has_variants && colorNames.length
            ? colorVariants
                .filter((r) => r.name.trim())
                .map((r) => ({ name: r.name.trim(), image_url: r.image_url || null }))
            : null,
        variant_matrix:
          form.has_variants && colorNames.length && form.sizes.length
            ? variantMatrixPayloadFromUiRows(variantMatrix)
            : null,
        support_phone: form.support_phone || "",
        payment_methods: form.payment_methods || "",
      };

      if (isEdit && productId) {
        await api.patch(`/admin/products/${productId}`, payload);
        closeSwal();
        await toastSuccess({
          khText: "បានកែប្រែទំនិញដោយជោគជ័យ",
          enText: "Product updated successfully!",
        });
      } else {
        await api.post("/admin/products", payload);
        closeSwal();
        await toastSuccess({
          khText: "បានបង្កើតទំនិញថ្មីដោយជោគជ័យ",
          enText: "Product created successfully!",
        });
      }

      navigate("/admin/products");
    } catch (err) {
      closeSwal();
      console.error("Save product failed", err);
      const detail = err?.response?.data?.message || err?.message || "Operation failed.";
      await errorAlert({
        khTitle: isEdit ? "កែប្រែទំនិញបរាជ័យ" : "បង្កើតទំនិញបរាជ័យ",
        enTitle: isEdit ? "Update failed" : "Create failed",
        detail,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard shortcut listener (Cmd+S / Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [form, colorVariants, variantMatrix, gallerySlotUrls]);

  if (loading) {
    return (
      <div className="py-12">
        <AdminContentSkeleton lines={6} imageHeight={280} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12 text-slate-800 dark:text-slate-100">
      <div className="w-full space-y-6">
        {/* ─── 1. PAGE TITLE & TOP ACTIONS ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1 pb-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              {isEdit
                ? form.name ? `Edit: ${form.name}` : "Edit Product"
                : "Add New Product"}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {isEdit
                ? "Update product details, photos, pricing, and variants."
                : "Create a new product with photos, pricing, and stock variants."}
            </p>
          </div>

          {/* Header Right Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/admin/products")}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          </div>
        </div>

        {/* ─── 2. TWO-COLUMN RESPONSIVE LAYOUT (8 COLS MAIN + 4 COLS SIDEBAR) ────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {/* LEFT COLUMN: MAIN CONTENT (8 COLS)                                    */}
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          <div className="space-y-6 lg:col-span-8">
            {/* ─── CARD 1: BASIC INFORMATION ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Basic Information
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Product title, description, and model sizing specifications.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {/* Product Name */}
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((prev) => ({ ...prev, name: val }));
                      if (val.trim()) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.name;
                          return next;
                        });
                      }
                    }}
                    placeholder="e.g. Classic Slim-Fit Oxford Shirt"
                    className={`h-11 w-full rounded-xl border bg-slate-50/60 px-3.5 text-sm outline-none transition focus:bg-white focus:ring-2 dark:bg-slate-800/60 dark:focus:bg-slate-800 ${
                      formErrors.name
                        ? "border-red-500 focus:ring-red-200"
                        : "border-slate-200 focus:border-slate-400 focus:ring-slate-200 dark:border-slate-700"
                    }`}
                  />
                  {formErrors.name ? (
                    <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>
                  ) : null}
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter detailed product description, fabric specifications, styling advice..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm leading-relaxed outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800/60 dark:focus:bg-slate-800"
                  />
                </div>

                {/* Model & Fit Info */}
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Model Information & Fit Notes
                  </label>
                  <textarea
                    rows={2}
                    value={form.model_info}
                    onChange={(e) => setForm((prev) => ({ ...prev, model_info: e.target.value }))}
                    placeholder="e.g. Model is 185cm / 75kg wearing size Large."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm leading-relaxed outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800/60 dark:focus:bg-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* ─── CARD 2: PRODUCT PHOTOS (VISUAL ALL-IN-ONE GALLERY) ───────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Product Photos
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    1 Main Cover Photo + up to 4 Gallery Images (Max 10MB each).
                  </p>
                </div>
                {formErrors.photos ? (
                  <span className="text-xs font-semibold text-red-500">Cover photo required *</span>
                ) : null}
              </div>

              <div className="mt-5 space-y-4">
                {/* Visual Grid: Featured Cover (Left) + 4 Gallery Slots (Right) */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                  {/* Featured Cover Card (5 cols on sm+) */}
                  <div className="sm:col-span-5 flex flex-col">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Cover Photo <span className="text-red-500">*</span>
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                        Main Display
                      </span>
                    </div>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverDropzone(true);
                      }}
                      onDragLeave={() => setDragOverDropzone(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverDropzone(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleApplyCoverFile(file);
                      }}
                      className={`group relative flex min-h-[220px] flex-1 flex-col items-center justify-center rounded-2xl border-2 transition overflow-hidden ${
                        form.image_url
                          ? "border-slate-200 bg-slate-900/5 dark:border-slate-700 dark:bg-slate-800/40"
                          : "border-dashed border-slate-300 bg-slate-50/70 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/30"
                      }`}
                    >
                      {form.image_url ? (
                        <>
                          <img
                            src={resolveImageUrl(form.image_url)}
                            alt="Cover"
                            className="h-full w-full max-h-[220px] object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 backdrop-blur-[2px] transition duration-200 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => handleSlotUploadClick(0)}
                              className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow hover:bg-white"
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDirectUrlSlot(0)}
                              className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow hover:bg-white"
                            >
                              URL
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveSlotPhoto(0)}
                              className="rounded-lg bg-red-600 p-1.5 text-white shadow hover:bg-red-700"
                              title="Remove photo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-4 text-center">
                          <div
                            className="flex h-12 w-12 items-center justify-center rounded-2xl mb-2"
                            style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                          >
                            <Upload className="h-5 w-5" />
                          </div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Upload Cover Photo
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            Drag & drop or browse
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSlotUploadClick(0)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              Browse
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDirectUrlSlot(0)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              Direct URL
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4 Gallery Slots (7 cols on sm+) */}
                  <div className="sm:col-span-7 flex flex-col">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Gallery Photos (Optional)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Up to 4 additional angles
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 flex-1">
                      {Array.from({ length: CREATE_FORM_GALLERY_SLOTS }, (_, idx) => {
                        const slotNum = idx + 1;
                        const url = gallerySlotUrls[idx];
                        return (
                          <div
                            key={slotNum}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const file = e.dataTransfer.files?.[0];
                              if (file) handleApplyGallerySlotFile(file, idx);
                            }}
                            className={`group relative flex h-28 flex-col items-center justify-center rounded-xl border-2 transition overflow-hidden ${
                              url
                                ? "border-slate-200 bg-slate-900/5 dark:border-slate-700 dark:bg-slate-800/40"
                                : "border-dashed border-slate-200 bg-slate-50/60 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/20"
                            }`}
                          >
                            {url ? (
                              <>
                                <img
                                  src={resolveImageUrl(url)}
                                  alt={`Gallery ${slotNum}`}
                                  className="h-full w-full object-cover"
                                />
                                <span className="absolute bottom-1 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  Slot {slotNum}
                                </span>
                                <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 opacity-0 backdrop-blur-[2px] transition duration-200 group-hover:opacity-100">
                                  <button
                                    type="button"
                                    onClick={() => handleSlotUploadClick(slotNum)}
                                    className="rounded bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-800 shadow hover:bg-white"
                                  >
                                    Replace
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSlotPhoto(slotNum)}
                                    className="rounded bg-red-600 p-1 text-white shadow hover:bg-red-700"
                                    title="Remove"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSlotUploadClick(slotNum)}
                                className="flex h-full w-full flex-col items-center justify-center p-2 text-center"
                              >
                                <Plus className="h-4 w-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
                                <span className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                  Slot {slotNum}
                                </span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {isUploading ? (
                  <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    <AdminDashboardLoader size={16} />
                    <span>Uploading photo to media server...</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* ─── CARD 3: PRICING & IDENTIFIERS ─────────────────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Pricing & Financials
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Retail sell price, lot cost price, markup calculation, and barcodes.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
                {/* Cost Price */}
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Cost Price ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-semibold">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.cost_price}
                      onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))}
                      placeholder="0.00"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-8 pr-3.5 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800/60 dark:focus:bg-slate-800"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Supplier unit cost.
                  </p>
                </div>

                {/* Selling Price */}
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Selling Price ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-semibold">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price}
                      onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                      placeholder="0.00"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-8 pr-3.5 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800/60 dark:focus:bg-slate-800"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Retail storefront price.
                  </p>
                </div>

                {/* Profit Margin Preview Card */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Estimated Gross Margin
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span
                      className={`text-2xl font-extrabold tabular-nums ${
                        grossMargin.isPositive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      ${grossMargin.diff.toFixed(2)}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      ({grossMargin.margin}%)
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {grossMargin.isPositive ? "Live profit per unit sold" : "Selling below unit cost"}
                  </p>
                </div>
              </div>

              {/* Lot Explanation Card */}
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                <Info className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="text-xs leading-relaxed text-blue-900 dark:text-blue-200">
                  <p className="font-bold">Lot-Based Inventory Pricing</p>
                  <p className="mt-0.5">
                    Selling prices and received costs are tracked per batch/lot in the Inventory system.
                    You can inspect receiving history, average unit costs, and lot quantities under{" "}
                    <Link to="/admin/stock-inventory" className="font-semibold underline">
                      Stock Inventory
                    </Link>{" "}
                    and{" "}
                    <Link to="/admin/inventory-lots" className="font-semibold underline">
                      Inventory Lots
                    </Link>.
                  </p>
                </div>
              </div>

              {/* SKU & Barcode Identification */}
              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  SKU & Barcode Identifiers
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        SKU Code
                      </label>
                      <button
                        type="button"
                        onClick={handleAutoGenerateSku}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--admin-primary)] hover:underline"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Auto-generate
                      </button>
                    </div>
                    <input
                      type="text"
                      value={form.sku}
                      onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
                      placeholder="e.g. SKU-SHIRT-001"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 text-sm font-mono outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800/60 dark:focus:bg-slate-800"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Barcode Code (UPC / EAN / Code128)
                      </label>
                      <button
                        type="button"
                        onClick={handleAutoGenerateBarcode}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--admin-primary)] hover:underline"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Auto-generate
                      </button>
                    </div>
                    <input
                      type="text"
                      value={form.barcode_code}
                      onChange={(e) => setForm((prev) => ({ ...prev, barcode_code: e.target.value }))}
                      placeholder="e.g. 893521234567"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 text-sm font-mono outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800/60 dark:focus:bg-slate-800"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ─── CARD 4: VARIANTS & STOCK MATRIX ───────────────────────────────── */}
            <div className="space-y-6">
              {/* Top Switch: Has Variants */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Variants & Stock Matrix
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Enable multi-color and multi-size stock matrix (Color × Size).
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.has_variants}
                    onChange={(e) => setForm((prev) => ({ ...prev, has_variants: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[color:var(--admin-primary)]"></div>
                </label>
              </div>

              {form.has_variants ? (
                <>
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Color Swatches Card */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Available Colors <span className="text-red-500">*</span>
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Add color names and optional swatch images
                          </p>
                        </div>
                        {formErrors.colors ? (
                          <span className="text-xs font-semibold text-red-500">{formErrors.colors}</span>
                        ) : null}
                      </div>

                      {/* Quick Suggestion Chips */}
                      <div className="mt-3">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                          Quick Color Suggestions:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {POPULAR_COLORS.map((col) => {
                            const alreadyAdded = colorVariants.some(
                              (c) => c.name.trim().toLowerCase() === col.toLowerCase()
                            );
                            return (
                              <button
                                key={col}
                                type="button"
                                onClick={() => {
                                  if (alreadyAdded) return;
                                  setColorVariants((prev) => {
                                    if (prev.length === 1 && !prev[0].name.trim()) {
                                      return [{ ...prev[0], name: col }];
                                    }
                                    return [...prev, { id: newColorRowId(), name: col, image_url: "" }];
                                  });
                                  setFormErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.colors;
                                    return next;
                                  });
                                }}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                                  alreadyAdded
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 opacity-60 cursor-default"
                                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                + {col}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Colors Rows List */}
                      <div className="mt-4 space-y-2.5">
                        {colorVariants.map((row, idx) => (
                          <div
                            key={row.id}
                            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-slate-800/40"
                          >
                            <button
                              type="button"
                              onClick={() => handleTriggerColorUpload(row.id)}
                              disabled={isUploading}
                              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white overflow-hidden transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
                              title={row.image_url ? "Change swatch image" : "Upload swatch image"}
                            >
                              {row.image_url ? (
                                <img
                                  src={resolveImageUrl(row.image_url)}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Upload className="h-4 w-4 text-slate-400" />
                              )}
                            </button>

                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setColorVariants((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, name: val } : item))
                                );
                                if (val.trim()) {
                                  setFormErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.colors;
                                    return next;
                                  });
                                }
                              }}
                              placeholder="e.g. Navy Blue"
                              className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-800"
                            />

                            {row.image_url ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setColorVariants((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, image_url: "" } : item))
                                  );
                                }}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800"
                                title="Clear swatch image"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            ) : null}

                            {colorVariants.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setColorVariants((prev) => prev.filter((_, i) => i !== idx));
                                }}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-800"
                                title="Remove color"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() =>
                            setColorVariants((prev) => [
                              ...prev,
                              { id: newColorRowId(), name: "", image_url: "" },
                            ])
                          }
                          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300"
                        >
                          <Plus className="h-4 w-4" />
                          Add Color
                        </button>
                      </div>
                    </div>

                    {/* Size Presets & Custom Sizes Card */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Available Sizes <span className="text-red-500">*</span>
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Select size presets or type custom sizes
                          </p>
                        </div>
                        {formErrors.sizes ? (
                          <span className="text-xs font-semibold text-red-500">{formErrors.sizes}</span>
                        ) : null}
                      </div>

                      {/* Preset Size Buttons */}
                      <div className="mt-4">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                          Category Size Presets:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {sizePresetOptions.map((sz) => {
                            const isChecked = form.sizes.includes(sz);
                            return (
                              <button
                                key={sz}
                                type="button"
                                onClick={() => {
                                  setForm((prev) => {
                                    const updated = isChecked
                                      ? prev.sizes.filter((s) => s !== sz)
                                      : [...prev.sizes, sz];
                                    return { ...prev, sizes: updated };
                                  });
                                  setFormErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.sizes;
                                    return next;
                                  });
                                }}
                                className={`flex h-10 min-w-[2.5rem] items-center justify-center rounded-xl border px-3 text-xs font-bold transition select-none ${
                                  isChecked
                                    ? "text-white shadow-xs"
                                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                }`}
                                style={isChecked ? { backgroundColor: primaryColor, borderColor: primaryColor } : {}}
                              >
                                {sz}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Custom Size Input */}
                      <div className="mt-5">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                          Custom Size:
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={customSizeInput}
                            onChange={(e) => setCustomSizeInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const val = customSizeInput.trim();
                                if (val && !form.sizes.includes(val)) {
                                  setForm((prev) => ({ ...prev, sizes: [...prev.sizes, val] }));
                                  setCustomSizeInput("");
                                }
                              }
                            }}
                            placeholder="e.g. 34W x 32L or Free Size"
                            className="h-10 flex-1 rounded-xl border border-slate-200 bg-slate-50/60 px-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = customSizeInput.trim();
                              if (val && !form.sizes.includes(val)) {
                                setForm((prev) => ({ ...prev, sizes: [...prev.sizes, val] }));
                                setCustomSizeInput("");
                                setFormErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.sizes;
                                  return next;
                                });
                              }
                            }}
                            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-xs font-bold text-white shadow-xs"
                            style={{ backgroundColor: primaryColor }}
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      {/* Active Selected Sizes List */}
                      {form.sizes.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-[11px] font-semibold text-slate-400 block mb-2">
                            Active Sizes ({form.sizes.length}):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {form.sizes.map((sz) => (
                              <span
                                key={sz}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                <span>{sz}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setForm((prev) => ({
                                      ...prev,
                                      sizes: prev.sizes.filter((s) => s !== sz),
                                    }));
                                  }}
                                  className="text-slate-400 hover:text-red-500"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Variant Matrix Combination Table */}
                  <div className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Color × Size Inventory Matrix
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Total variations: {totalVariationsCount} · Total On-Hand:{" "}
                          <span className="font-bold text-slate-900 dark:text-white">
                            {totalOnHandUnits} units
                          </span>
                          </p>
                        </div>

                      {/* Quick Bulk Stock Setter */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500">Quick set all:</span>
                        <input
                          type="number"
                          min="0"
                          value={bulkStockQty}
                          onChange={(e) => setBulkStockQty(e.target.value)}
                          placeholder="Qty"
                          className="h-8 w-16 rounded-lg border border-slate-200 px-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-800"
                        />
                        <button
                          type="button"
                          onClick={handleApplyBulkStock}
                          className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          Apply to All
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200/80 bg-slate-50/75 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3 font-bold uppercase tracking-wider">Color</th>
                            <th className="px-4 py-3 font-bold uppercase tracking-wider">Size</th>
                            <th className="px-4 py-3 font-bold uppercase tracking-wider">Stock Qty</th>
                            <th className="px-4 py-3 font-bold uppercase tracking-wider">Variant Barcode</th>
                            <th className="px-4 py-3 font-bold uppercase tracking-wider">Barcode Format</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {variantMatrix.map((row, idx) => (
                            <tr
                              key={row.id}
                              className="hover:bg-slate-50/60 transition dark:hover:bg-slate-800/40"
                            >
                              <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                                {row.color || "—"}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-0.5 font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  {row.size || "—"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.qty}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setVariantMatrix((prev) =>
                                      prev.map((r, i) => (i === idx ? { ...r, qty: val } : r))
                                    );
                                  }}
                                  placeholder="0"
                                  className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                />
                              </td>
                              <td className="px-4 py-2.5">
                                <input
                                  type="text"
                                  value={row.sku_barcode}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setVariantMatrix((prev) =>
                                      prev.map((r, i) => (i === idx ? { ...r, sku_barcode: val } : r))
                                    );
                                  }}
                                  placeholder="SKU/Barcode code"
                                  className="h-9 w-44 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                                />
                              </td>
                              <td className="px-4 py-2.5">
                                <select
                                  value={row.barcode_format}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setVariantMatrix((prev) =>
                                      prev.map((r, i) => (i === idx ? { ...r, barcode_format: val } : r))
                                    );
                                  }}
                                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                                >
                                  {VARIANT_BARCODE_FORMAT_OPTIONS.map((fmt) => (
                                    <option key={fmt.value} value={fmt.value}>
                                      {fmt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-800/20">
                  <Package className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Single Product (No Variations)</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    This item will be sold as a single unit without size or color options. Stock and pricing follow the base SKU and price above.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {/* RIGHT COLUMN: SETTINGS & METADATA (4 COLS)                            */}
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          <div className="space-y-6 lg:col-span-4">
            {/* ─── SIDEBAR CARD 1: STOREFRONT STATUS & VISIBILITY ───────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Status & Visibility
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Publishing channel and customer audience.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-5">
                {/* Active Switch with Visual Status Badge */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-slate-900 dark:text-white block">
                        Published on Storefront
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Visible in search, catalog & buyable.
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[color:var(--admin-primary)]"></div>
                    </label>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        form.is_active
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          form.is_active ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                        }`}
                      />
                      {form.is_active ? "Active on Store" : "Draft (Hidden)"}
                    </span>
                  </div>
                </div>

                {/* Target Customer / Gender Pills */}
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Target Customer / Gender
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {GENDER_OPTIONS.map((g) => {
                      const isSelected = form.gender === g.value;
                      return (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, gender: g.value }))}
                          className={`rounded-xl border py-2 text-xs font-semibold transition text-center ${
                            isSelected
                              ? "text-white shadow-xs"
                              : "border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                          style={isSelected ? { backgroundColor: primaryColor, borderColor: primaryColor } : {}}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── SIDEBAR CARD 2: PRODUCT ORGANIZATION (CATEGORY & BRAND) ──────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Organization
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Categorize by collection and brand maker.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {/* Category Select */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="product-form-category"
                      className={`text-xs font-bold uppercase tracking-wider ${
                        formErrors.category_id ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      Category <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setQuickCreateCategoryOpen(true)}
                      className="text-[11px] font-semibold text-[color:var(--admin-primary)] hover:underline"
                    >
                      + New Category
                    </button>
                  </div>
                  <AdminSearchSelect
                    inputId="product-form-category"
                    value={form.category_id}
                    onChange={(valOrOpt) => {
                      const val = typeof valOrOpt === "object" && valOrOpt !== null ? valOrOpt.value : valOrOpt;
                      if (val === QUICK_CREATE_OPTION) {
                        setQuickCreateCategoryOpen(true);
                        return;
                      }
                      setForm((prev) => ({ ...prev, category_id: val || "" }));
                      if (val) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.category_id;
                          return next;
                        });
                      }
                    }}
                    pinnedOptions={[{ value: QUICK_CREATE_OPTION, label: "+ Create new category…" }]}
                    options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                    emptyLabel="Select category"
                    placeholder="Search category…"
                    inputClassName={`h-11 w-full rounded-xl border bg-slate-50/60 px-3.5 text-xs outline-none transition focus:bg-white focus:ring-2 dark:bg-slate-800/60 dark:focus:bg-slate-800 ${
                      formErrors.category_id
                        ? "border-red-500 focus:border-red-500 focus:ring-red-200 text-red-900 dark:text-red-200"
                        : "border-slate-200 focus:border-slate-400 focus:ring-slate-200 dark:border-slate-700"
                    }`}
                  />
                  {formErrors.category_id ? (
                    <p className="mt-1 text-xs text-red-500">{formErrors.category_id}</p>
                  ) : null}
                </div>

                {/* Brand Select */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="product-form-brand"
                      className={`text-xs font-bold uppercase tracking-wider ${
                        formErrors.brand_id ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      Brand <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setQuickCreateBrandOpen(true)}
                      className="text-[11px] font-semibold text-[color:var(--admin-primary)] hover:underline"
                    >
                      + New Brand
                    </button>
                  </div>
                  <AdminSearchSelect
                    inputId="product-form-brand"
                    value={form.brand_id}
                    onChange={(valOrOpt) => {
                      const val = typeof valOrOpt === "object" && valOrOpt !== null ? valOrOpt.value : valOrOpt;
                      if (val === QUICK_CREATE_OPTION) {
                        setQuickCreateBrandOpen(true);
                        return;
                      }
                      setForm((prev) => ({ ...prev, brand_id: val || "" }));
                      if (val) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.brand_id;
                          return next;
                        });
                      }
                    }}
                    pinnedOptions={[{ value: QUICK_CREATE_OPTION, label: "+ Create new brand…" }]}
                    options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
                    emptyLabel="Select brand"
                    placeholder="Search brand…"
                    inputClassName={`h-11 w-full rounded-xl border bg-slate-50/60 px-3.5 text-xs outline-none transition focus:bg-white focus:ring-2 dark:bg-slate-800/60 dark:focus:bg-slate-800 ${
                      formErrors.brand_id
                        ? "border-red-500 focus:border-red-500 focus:ring-red-200 text-red-900 dark:text-red-200"
                        : "border-slate-200 focus:border-slate-400 focus:ring-slate-200 dark:border-slate-700"
                    }`}
                  />
                  {formErrors.brand_id ? (
                    <p className="mt-1 text-xs text-red-500">{formErrors.brand_id}</p>
                  ) : null}
                </div>
              </div>
            </div>

            {/* ─── SIDEBAR CARD 3: CUSTOMER SUPPORT & NOTES ─────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Support & Order Notes
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Contact info and payment instructions.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Support Contact (Optional)
                  </label>
                  <input
                    type="text"
                    value={form.support_phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, support_phone: e.target.value }))}
                    placeholder="e.g. +855 12 345 678 or @telegram_handle"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 text-xs outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Payment / Delivery Notes
                  </label>
                  <textarea
                    rows={2}
                    value={form.payment_methods}
                    onChange={(e) => setForm((prev) => ({ ...prev, payment_methods: e.target.value }))}
                    placeholder="e.g. Free delivery on orders over $50."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-xs outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* ─── SIDEBAR CARD 4: REAL-TIME SUMMARY CARD ───────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Live Summary
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Real-time calculation based on inputs.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Retail Sell Price:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    ${parseFloat(form.price || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Gross Margin:</span>
                  <span className={`font-bold ${grossMargin.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                    ${grossMargin.diff.toFixed(2)} ({grossMargin.margin}%)
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Total Variants:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {form.has_variants ? totalVariationsCount : 1}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">On-Hand Stock:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {totalOnHandUnits} units
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Est. Inventory Value:
                  </span>
                  <span className="text-sm font-extrabold text-[color:var(--admin-primary)]">
                    ${estimatedInventoryValue}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── 3. BOTTOM ACTION BAR ──────────────────────────────────────────────── */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-6 pb-12 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Make sure to review all required fields (<span className="text-red-500">*</span>) before saving.
          </p>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/admin/products")}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              {isSubmitting ? (
                <AdminDashboardLoader size={16} />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>{isEdit ? "Save Changes" : "Create Product"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={coverFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (e.target) e.target.value = "";
          if (file) handleApplyCoverFile(file);
        }}
      />
      <input
        ref={galleryFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (e.target) e.target.value = "";
          if (file) handleApplyGallerySlotFile(file, activePhotoSlot - 1);
        }}
      />
      <input
        ref={colorFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleColorFileSelected}
      />

      {/* Direct Image URL Modal */}
      <AdminModal
        open={imageUrlPickerOpen}
        onClose={() => setImageUrlPickerOpen(false)}
        title="Direct Image URL"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Paste a publicly accessible image URL for this photo slot.
          </p>
          <input
            type="url"
            value={imageUrlDraft}
            onChange={(e) => setImageUrlDraft(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-800"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setImageUrlPickerOpen(false)}
              className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (activePhotoSlot === 0) {
                  setForm((prev) => ({ ...prev, image_url: imageUrlDraft.trim() }));
                } else {
                  setGallerySlotUrls((prev) => {
                    const next = [...prev];
                    next[activePhotoSlot - 1] = imageUrlDraft.trim();
                    return next;
                  });
                }
                setImageUrlPickerOpen(false);
              }}
              className="h-9 rounded-lg px-4 text-xs font-bold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              Apply URL
            </button>
          </div>
        </div>
      </AdminModal>

      {/* Quick Create Category Modal */}
      <AdminModal
        open={quickCreateCategoryOpen}
        onClose={() => setQuickCreateCategoryOpen(false)}
        title="Create New Category"
        maxWidthClass="max-w-md"
      >
        <CategoryCreateForm
          onSuccess={(created) => {
            loadCatalogs();
            if (created?.id) {
              setForm((prev) => ({ ...prev, category_id: String(created.id) }));
            }
            setQuickCreateCategoryOpen(false);
          }}
          onCancel={() => setQuickCreateCategoryOpen(false)}
        />
      </AdminModal>

      {/* Quick Create Brand Modal */}
      <AdminModal
        open={quickCreateBrandOpen}
        onClose={() => setQuickCreateBrandOpen(false)}
        title="Create New Brand"
        maxWidthClass="max-w-md"
      >
        <BrandCreateForm
          onSuccess={(created) => {
            loadCatalogs();
            if (created?.id) {
              setForm((prev) => ({ ...prev, brand_id: String(created.id) }));
            }
            setQuickCreateBrandOpen(false);
          }}
          onCancel={() => setQuickCreateBrandOpen(false)}
        />
      </AdminModal>
    </div>
  );
}
