import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Upload,
  X,
  Plus,
  Trash2,
  Package,
  DollarSign,
  Layers,
  Sparkles,
  RefreshCw,
  Save,
  HelpCircle,
  AlertCircle,
  Image as ImageIcon,
  Info,
  Barcode as BarcodeIcon,
  Tag,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

import api from "@/lib/api";
import { useAuth } from "@/state/auth";
import { useAdminPermissions } from "@/hooks/useAdminPermissions.js";
import { useTheme } from "@/state/theme.jsx";
import { useLanguage } from "@/lib/i18n.jsx";
import { resolveImageUrl } from "@/lib/images";
import { closeSwal, errorAlert, loadingAlert, toastSuccess } from "@/lib/swal";
import { AdminContentSkeleton, AdminDashboardLoader } from "@/components/admin/AdminLoading";
import AdminModal from "@/components/admin/AdminModal.jsx";
import AdminSearchSelect from "@/components/admin/AdminSearchSelect.jsx";
import { QUICK_CREATE_OPTION } from "@/components/admin/FieldWithQuickCreate.jsx";
import CategoryCreateForm from "@/components/admin/CategoryCreateForm.jsx";
import BrandCreateForm from "@/components/admin/BrandCreateForm.jsx";
import SupplierCreateForm from "@/components/admin/SupplierCreateForm.jsx";

// shadcn UI Components
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

import {
  buildVariantMatrixRowsFromGrid,
  parseVariantMatrix,
  variantMatrixPayloadFromUiRows,
  variantMatrixTotalQty,
} from "@/lib/variantMatrix.js";
import {
  DEFAULT_VARIANT_BARCODE_FORMAT,
  VARIANT_BARCODE_FORMAT_OPTIONS,
  generateVariantBarcode,
  normalizeVariantBarcodeFormat,
  sanitizeVariantBarcodeInput,
  variantBarcodeMaxLength,
  variantBarcodePlaceholder,
} from "@/lib/variantBarcode.js";

const CREATE_FORM_GALLERY_SLOTS = 4;

const POPULAR_COLORS = [
  "Black", "White", "Navy", "Gray", "Beige", "Red", "Blue", "Olive", "Khaki", "Brown", "Pink", "Green"
];

const NAMED_COLOR_HEX = {
  black: "#171717",
  white: "#ffffff",
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#ea580c",
  purple: "#9333ea",
  pink: "#ec4899",
  gray: "#6b7280",
  grey: "#6b7280",
  brown: "#78350f",
  navy: "#1e3a8a",
  beige: "#d6c8b4",
  gold: "#ca8a04",
  silver: "#94a3b8",
  khaki: "#854d0e",
  cream: "#faf5eb",
  maroon: "#7f1d1d",
  teal: "#0d9488",
  mint: "#99f6e4",
  olive: "#65a30d",
  charcoal: "#374151",
};

function colorSwatchFill(name) {
  if (!name || typeof name !== "string") return "#94a3b8";
  const key = name.toLowerCase().trim();
  if (NAMED_COLOR_HEX[key]) return NAMED_COLOR_HEX[key];
  const first = key.split(/\s+/)[0];
  return NAMED_COLOR_HEX[first] || "#94a3b8";
}

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

export const DEFAULT_BRAND_GOLD = "#C59B27";

export default function ProductFormPage() {
  const { id: routeId } = useParams();
  const isEdit = Boolean(routeId);
  const productId = routeId ? String(routeId) : null;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin, canManageProducts } = useAdminPermissions();
  const { primaryColor: themePrimaryColor, mode } = useTheme();
  const primaryColor =
    themePrimaryColor &&
    themePrimaryColor !== "#0B0F17" &&
    themePrimaryColor !== "#10b981" &&
    themePrimaryColor !== "#10A37F"
      ? themePrimaryColor
      : DEFAULT_BRAND_GOLD;
  const { language, t } = useLanguage();
  const isKm = language === "km";

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
  const [gallerySlotUrls, setGallerySlotUrls] = useState(
    Array.from({ length: CREATE_FORM_GALLERY_SLOTS }, () => "")
  );
  const [activePhotoSlot, setActivePhotoSlot] = useState(0); // 0 = Cover, 1..4 = Gallery slot 1..4
  const [dragOverCover, setDragOverCover] = useState(false);
  const [dragOverGalleryIdx, setDragOverGalleryIdx] = useState(null);

  // Variant & Color State
  const [colorVariants, setColorVariants] = useState([{ id: newColorRowId(), name: "", image_url: "" }]);
  const [variantMatrix, setVariantMatrix] = useState([emptyVariantMatrixRow()]);
  const [customSizeInput, setCustomSizeInput] = useState("");
  const [bulkStockQty, setBulkStockQty] = useState("");

  // Catalogs dropdown data
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // Quick Create Modals
  const [quickCreateCategoryOpen, setQuickCreateCategoryOpen] = useState(false);
  const [quickCreateBrandOpen, setQuickCreateBrandOpen] = useState(false);
  const [quickCreateSupplierOpen, setQuickCreateSupplierOpen] = useState(false);
  const [imageUrlPickerOpen, setImageUrlPickerOpen] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState("");

  // Form validation errors
  const [formErrors, setFormErrors] = useState({});

  // Refs
  const coverFileInputRef = useRef(null);
  const galleryFileInputRef = useRef(null);
  const colorFileInputRef = useRef(null);
  const colorUploadRowIdRef = useRef(null);
  const variantMatrixRef = useRef(variantMatrix);
  variantMatrixRef.current = variantMatrix;
  const isInitialLoadRef = useRef(true);

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
    isInitialLoadRef.current = true;
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
        gender: prod.gender || prod.audience || "unisex",
        description: prod.description || "",
        model_info: prod.model_info || "",
        image_url: prod.image_url || "",
        price: prod.price != null ? String(prod.price) : "",
        cost_price: prod.cost_price != null ? String(prod.cost_price) : "",
        is_active: prod.is_active !== false,
        has_variants: prod.has_variants !== false,
        sizes: parsedSizes,
        support_phone: prod.support_phone || "",
        payment_methods: Array.isArray(prod.payment_methods)
          ? prod.payment_methods.join(", ")
          : prod.payment_methods || prod.delivery_info || "",
      });

      setGallerySlotUrls(
        Array.from({ length: CREATE_FORM_GALLERY_SLOTS }, (_, i) => (gallery[i] || "").trim())
      );
      setColorVariants(parsedColors.length ? parsedColors : [{ id: newColorRowId(), name: "", image_url: "" }]);

      const loadedMatrixRows = parsedMatrix.length
        ? parsedMatrix.map((r) => ({
            id: newMatrixRowId(),
            color: r.color,
            size: r.size,
            qty: String(r.qty),
            sku_barcode: r.sku_barcode || "",
            barcode_format: r.barcode_format || DEFAULT_VARIANT_BARCODE_FORMAT,
          }))
        : [emptyVariantMatrixRow()];

      setVariantMatrix(loadedMatrixRows);
      variantMatrixRef.current = loadedMatrixRows;
    } catch (err) {
      console.error("Failed to load product detail", err);
      await errorAlert({
        khTitle: "បរាជ័យក្នុងការទាញយកទិន្នន័យ",
        enTitle: "Failed to load product",
        detail: isKm ? "មិនអាចទាញយកទិន្នន័យផលិតផលពីម៉ាស៊ីនមេបានទេ។" : "Could not retrieve product information from server.",
      });
      navigate("/admin/products");
    } finally {
      setLoading(false);
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 300);
    }
  };

  useEffect(() => {
    loadCatalogs();
    if (isEdit) {
      loadProduct();
    } else {
      isInitialLoadRef.current = false;
    }
  }, [productId]);

  // Gender options with translation
  const genderOptions = useMemo(() => [
    { value: "unisex", label: isKm ? "ទាំងអស់ (Unisex)" : t("genderUnisex", "Unisex / All") },
    { value: "men", label: isKm ? "បុរស" : t("genderMen", "Men") },
    { value: "women", label: isKm ? "ស្ត្រី" : t("genderWomen", "Women") },
    { value: "kids", label: isKm ? "កុមារ" : t("genderKids", "Kids") },
  ], [isKm, t]);

  // Derive size options based on selected category
  const selectedCategory = useMemo(() => {
    return categories.find((c) => String(c.id) === String(form.category_id));
  }, [categories, form.category_id]);

  const sizePresetOptions = useMemo(() => {
    const catName = (selectedCategory?.name || "").toLowerCase();
    if (catName.includes("shoe") || catName.includes("sneaker")) return SIZE_PRESETS.shoes;
    if (catName.includes("bag") || catName.includes("backpack")) return SIZE_PRESETS.bags;
    if (catName.includes("hat") || catName.includes("cap")) return SIZE_PRESETS.hats;
    if (catName.includes("acc") || catName.includes("belt")) return SIZE_PRESETS.accessories;
    return SIZE_PRESETS.clothes;
  }, [selectedCategory]);

  // Keep Matrix Rows synced when Colors or Sizes change (safely preserving existing quantities & barcodes)
  useEffect(() => {
    if (!form.has_variants || isInitialLoadRef.current) return;
    const colorNames = uniqueColorNamesFromSwatchRows(colorVariants);
    const sizes = normalizeSizes(form.sizes);

    if (colorNames.length > 0 && sizes.length > 0) {
      const res = buildVariantMatrixRowsFromGrid(
        colorNames,
        sizes,
        variantMatrixRef.current,
        newMatrixRowId
      );
      if (res?.rows && Array.isArray(res.rows)) {
        setVariantMatrix(res.rows);
        variantMatrixRef.current = res.rows;
      }
    }
  }, [colorVariants, form.sizes, form.has_variants]);

  // Media Upload helper
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
        detail: isKm ? "មិនអាចបង្ហោះរូបភាពបានទេ។ សូមពិនិត្យមើលទម្រង់ និងទំហំឯកសារ។" : "Could not upload image. Please check file format and size.",
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
        detail: isKm ? "មិនអាចបង្ហោះរូបភាពបន្ថែមបានទេ។" : "Could not upload gallery image.",
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

  // Auto Generate SKU
  const handleAutoGenerateSku = () => {
    const prefix = form.name
      ? form.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)
      : "PRD";
    const random = Math.floor(1000 + Math.random() * 9000);
    setForm((prev) => ({ ...prev, sku: `SKU-${prefix}-${random}` }));
  };

  // Auto Generate Barcode for single matrix row
  const handleGenerateRowBarcode = (idx) => {
    setVariantMatrix((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const fmt = r.barcode_format || DEFAULT_VARIANT_BARCODE_FORMAT;
        return {
          ...r,
          sku_barcode: generateVariantBarcode(fmt),
        };
      })
    );
  };

  // Auto Generate Barcodes for all matrix rows with unique scannable barcodes
  const handleGenerateAllBarcodes = () => {
    setVariantMatrix((prev) => {
      const used = new Set();
      return prev.map((r) => {
        const fmt = r.barcode_format || DEFAULT_VARIANT_BARCODE_FORMAT;
        let code = generateVariantBarcode(fmt);
        let safety = 0;
        while (used.has(code) && safety < 20) {
          code = generateVariantBarcode(fmt);
          safety += 1;
        }
        used.add(code);
        return { ...r, sku_barcode: code };
      });
    });
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

  // Financial and Stock Calculations
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
    if (!form.name.trim()) {
      errors.name = t("productNameRequiredErr", "Product name is required.");
    }
    if (!form.category_id) {
      errors.category_id = t("categoryRequiredErr", "Category is required.");
    }
    if (!form.brand_id) {
      errors.brand_id = t("brandRequiredErr", "Brand is required.");
    }
    if (!form.image_url) {
      errors.photos = t("coverPhotoRequiredErr", "Product cover photo is required.");
    }

    if (form.has_variants) {
      const colorNames = uniqueColorNamesFromSwatchRows(colorVariants);
      if (colorNames.length === 0) {
        errors.colors = t("colorRequiredErr", "At least one color option is required.");
      }
      if (form.sizes.length === 0) {
        errors.sizes = t("sizeRequiredErr", "At least one size is required.");
      }
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
      const matrixPayload = form.has_variants && colorNames.length && form.sizes.length
        ? variantMatrixPayloadFromUiRows(variantMatrix)
        : null;

      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        barcode_code: form.barcode_code?.trim() || null,
        category_id: form.category_id ? Number(form.category_id) : null,
        brand_id: form.brand_id ? Number(form.brand_id) : null,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        gender: form.gender || "unisex",
        audience: form.gender || "unisex",
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
        variant_matrix: matrixPayload,
        support_phone: form.support_phone || "",
        delivery_info: form.payment_methods || "",
        payment_methods: form.payment_methods ? [form.payment_methods.trim()] : [],
      };

      if (isEdit && productId) {
        await api.patch(`/admin/products/${productId}`, payload);
        closeSwal();
        await toastSuccess({
          khText: "បានកែប្រែទំនិញដោយជោគជ័យ!",
          enText: "Product updated successfully!",
        });
      } else {
        await api.post("/admin/products", payload);
        closeSwal();
        await toastSuccess({
          khText: "បានបង្កើតទំនិញថ្មីដោយជោគជ័យ!",
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
        <AdminContentSkeleton lines={8} imageHeight={280} />
      </div>
    );
  }

  return (
    <div className="w-full pb-16 text-foreground">
      <div className="w-full space-y-6">
        {/* ─── 1. TOP HEADER & ACTIONS ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1 pb-1">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {isEdit
                  ? form.name
                    ? isKm ? `កែប្រែ៖ ${form.name}` : `${t("adminEditProduct", "Edit Product")}: ${form.name}`
                    : t("adminEditProduct", "Edit Product")
                  : t("adminAddNewProduct", "Add New Product")}
              </h1>
              <Badge
                variant="outline"
                className="text-xs font-semibold"
                style={{
                  borderColor: form.is_active ? primaryColor : undefined,
                  color: form.is_active ? primaryColor : undefined,
                  backgroundColor: form.is_active ? `${primaryColor}15` : undefined,
                }}
              >
                {form.is_active
                  ? t("publishedStatus", "Published")
                  : t("draftStatus", "Draft")}
              </Badge>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              {isEdit
                ? t("adminEditProductSubtitle", "Update product catalog details, media gallery, pricing, and stock variant matrix.")
                : t("adminAddProductSubtitle", "Create a new product with complete photos, pricing, and Color × Size inventory.")}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin/products")}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{t("back", "Back")}</span>
            </Button>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="gap-2 text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {isSubmitting ? (
                <AdminDashboardLoader size={14} />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>
                {isSubmitting
                  ? t("savingChanges", "Saving...")
                  : isEdit
                  ? t("saveChangesBtn", "Save Changes")
                  : t("createProductBtn", "Create Product")}
              </span>
            </Button>
          </div>
        </div>

        {/* ─── 2. TWO-COLUMN RESPONSIVE LAYOUT (8 COLS MAIN + 4 COLS SIDEBAR) ────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {/* LEFT COLUMN: MAIN SPECIFICATIONS (8 COLS)                              */}
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          <div className="space-y-6 lg:col-span-8">
            {/* ─── CARD 1: BASIC INFORMATION ─────────────────────────────────────── */}
            <Card className="rounded-xl border border-border shadow-xs">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle className="text-base font-bold">
                  {t("basicInfoTitle", "Basic Information")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("basicInfoSubtitle", "Product title, storefront description, and model fit notes.")}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-5 space-y-4">
                {/* Product Name */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="product-name"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {t("productNameLabel", "Product Name")} <span className="text-destructive">*</span>
                    </Label>
                    {formErrors.name && (
                      <span className="text-xs font-medium text-destructive">
                        {formErrors.name}
                      </span>
                    )}
                  </div>
                  <Input
                    id="product-name"
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
                    placeholder={t("productNamePlaceholder", "e.g. Classic Slim-Fit Oxford Shirt")}
                    className={`h-10 text-sm ${
                      formErrors.name ? "border-destructive focus-visible:ring-destructive" : ""
                    }`}
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="product-description"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {t("descriptionLabel", "Description")}
                  </Label>
                  <Textarea
                    id="product-description"
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder={t("descriptionPlaceholder", "Enter detailed product description, fabric specifications, styling advice...")}
                    className="text-sm leading-relaxed resize-y"
                  />
                </div>

                {/* Model & Fit Info */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="product-model-info"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {t("modelInfoLabel", "Model Information & Fit Notes")}
                  </Label>
                  <Textarea
                    id="product-model-info"
                    rows={2}
                    value={form.model_info}
                    onChange={(e) => setForm((prev) => ({ ...prev, model_info: e.target.value }))}
                    placeholder={t("modelInfoPlaceholder", "e.g. Model is 185cm / 75kg wearing size Large.")}
                    className="text-sm leading-relaxed resize-y"
                  />
                </div>
              </CardContent>
            </Card>

            {/* ─── CARD 2: PRODUCT PHOTOS (COVER & GALLERY) ─────────────────────── */}
            <Card className="rounded-xl border border-border shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4">
                <div>
                  <CardTitle className="text-base font-bold">
                    {t("productPhotosTitle", "Product Photos")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("productPhotosSubtitle", "1 Main Cover Photo + up to 4 Gallery Images (Max 10MB each).")}
                  </CardDescription>
                </div>
                {formErrors.photos && (
                  <Badge variant="destructive" className="text-xs font-medium">
                    {t("coverPhotoRequiredErr", "Cover photo required *")}
                  </Badge>
                )}
              </CardHeader>

              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                  {/* Featured Cover Card (5 cols on sm+) */}
                  <div className="sm:col-span-5 flex flex-col">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("coverPhotoLabel", "Cover Photo")} <span className="text-destructive">*</span>
                      </Label>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-bold tracking-wider"
                        style={{
                          borderColor: primaryColor,
                          color: primaryColor,
                          backgroundColor: `${primaryColor}15`,
                        }}
                      >
                        {t("mainDisplayBadge", "Main Display")}
                      </Badge>
                    </div>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverCover(true);
                      }}
                      onDragLeave={() => setDragOverCover(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverCover(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleApplyCoverFile(file);
                      }}
                      className={`group relative flex min-h-[220px] flex-1 flex-col items-center justify-center rounded-xl border-2 transition overflow-hidden ${
                        form.image_url
                          ? "border-border bg-muted/20"
                          : dragOverCover
                          ? "border-primary bg-primary/10"
                          : "border-dashed border-border bg-muted/40 hover:border-primary/50"
                      }`}
                    >
                      {form.image_url ? (
                        <>
                          <img
                            src={resolveImageUrl(form.image_url)}
                            alt="Cover"
                            className="h-full w-full max-h-[220px] object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 backdrop-blur-[2px] transition duration-200 group-hover:opacity-100">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSlotUploadClick(0)}
                              className="h-8 text-xs font-semibold text-white shadow-sm"
                              style={{ backgroundColor: primaryColor }}
                            >
                              {t("replaceBtn", "Replace")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDirectUrlSlot(0)}
                              className="h-8 text-xs font-semibold"
                            >
                              {t("directUrlBtn", "Direct URL")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRemoveSlotPhoto(0)}
                              className="h-8 w-8 p-0"
                              title={t("products.form.removePhoto", "Remove photo")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-4 text-center">
                          <div
                            className="flex h-11 w-11 items-center justify-center rounded-xl mb-2 transition transform group-hover:scale-105"
                            style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                          >
                            <Upload className="h-5 w-5" />
                          </div>
                          <p className="text-xs font-bold text-foreground">
                            {t("uploadCoverPhotoText", "Upload Cover Photo")}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {t("dragDropOrBrowse", "Drag & drop or browse")}
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleSlotUploadClick(0)}
                              className="h-7 text-xs font-semibold"
                              style={{ borderColor: primaryColor, color: primaryColor }}
                            >
                              {t("browseBtn", "Browse")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleDirectUrlSlot(0)}
                              className="h-7 text-xs font-semibold"
                              style={{ borderColor: `${primaryColor}80`, color: primaryColor }}
                            >
                              {t("directUrlBtn", "Direct URL")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4 Gallery Slots (7 cols on sm+) */}
                  <div className="sm:col-span-7 flex flex-col">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("galleryPhotosLabel", "Gallery Photos (Optional)")}
                      </Label>
                      <span className="text-[11px] text-muted-foreground">
                        {t("galleryPhotosSubtitle", "Up to 4 additional angles")}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 flex-1">
                      {Array.from({ length: CREATE_FORM_GALLERY_SLOTS }, (_, idx) => {
                        const slotNum = idx + 1;
                        const url = gallerySlotUrls[idx];
                        const isDrag = dragOverGalleryIdx === idx;
                        return (
                          <div
                            key={slotNum}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDragOverGalleryIdx(idx);
                            }}
                            onDragLeave={() => setDragOverGalleryIdx(null)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOverGalleryIdx(null);
                              const file = e.dataTransfer.files?.[0];
                              if (file) handleApplyGallerySlotFile(file, idx);
                            }}
                            className={`group relative flex h-28 flex-col items-center justify-center rounded-xl border-2 transition overflow-hidden ${
                              url
                                ? "border-border bg-muted/20"
                                : isDrag
                                ? "border-primary bg-primary/10"
                                : "border-dashed border-border bg-muted/30 hover:border-border/80"
                            }`}
                          >
                            {url ? (
                              <>
                                <img
                                  src={resolveImageUrl(url)}
                                  alt={`Gallery ${slotNum}`}
                                  className="h-full w-full object-cover"
                                />
                                <span className="absolute bottom-1 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  {t("slotLabel", "Slot")} {slotNum}
                                </span>
                                <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/60 opacity-0 backdrop-blur-[2px] transition duration-200 group-hover:opacity-100">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleSlotUploadClick(slotNum)}
                                    className="h-7 px-2 text-[11px] font-semibold text-white"
                                    style={{ backgroundColor: primaryColor }}
                                  >
                                    {t("replaceBtn", "Replace")}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleRemoveSlotPhoto(slotNum)}
                                    className="h-7 w-7 p-0"
                                    title={t("products.actions.delete", "Delete")}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSlotUploadClick(slotNum)}
                                className="flex h-full w-full flex-col items-center justify-center p-2 text-center hover:bg-muted/50 transition group"
                              >
                                <Plus
                                  className="h-4 w-4 text-muted-foreground transition group-hover:scale-110"
                                  style={{ color: primaryColor }}
                                />
                                <span className="mt-1 text-[11px] font-medium text-muted-foreground">
                                  {t("slotLabel", "Slot")} {slotNum}
                                </span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {isUploading && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-2.5 text-xs font-semibold text-muted-foreground">
                    <AdminDashboardLoader size={15} />
                    <span>{t("uploadingPhotoMedia", "Uploading photo to media server...")}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ─── CARD 3: PRICING & FINANCIALS ─────────────────────────────────── */}
            <Card className="rounded-xl border border-border shadow-xs">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle className="text-base font-bold">
                  {t("pricingFinancialsTitle", "Pricing & Financials")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("pricingFinancialsSubtitle", "Retail storefront price, supplier cost, live gross margin, and stock barcodes.")}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-5 space-y-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  {/* Cost Price */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cost-price"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {t("costPriceLabel", "Cost Price ($)")}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">
                        $
                      </span>
                      <Input
                        id="cost-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.cost_price}
                        onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))}
                        placeholder="0.00"
                        className="pl-7 h-10 text-sm font-medium"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("costPriceHelp", "Supplier purchase cost per unit.")}
                    </p>
                  </div>

                  {/* Selling Price */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="selling-price"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {t("sellingPriceLabel", "Selling Price ($)")}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">
                        $
                      </span>
                      <Input
                        id="selling-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.price}
                        onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                        placeholder="0.00"
                        className="pl-7 h-10 text-sm font-semibold"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("sellingPriceHelp", "Customer storefront retail price.")}
                    </p>
                  </div>

                  {/* Live Profit Margin Card */}
                  <div className="rounded-xl border border-border bg-muted/30 p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {t("estimatedGrossMargin", "Estimated Gross Margin")}
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
                      <span className="text-xs font-semibold text-muted-foreground">
                        ({grossMargin.margin}%)
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {grossMargin.isPositive
                        ? t("liveGrossProfitPerUnit", "Live gross profit per unit")
                        : t("negativeProfitMargin", "Negative profit margin")}
                    </p>
                  </div>
                </div>

                {/* Lot Explanation Callout */}
                <div className="flex items-start gap-3 rounded-xl border border-blue-200/60 bg-blue-50/50 p-3.5 dark:border-blue-900/50 dark:bg-blue-950/20">
                  <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="text-xs leading-relaxed text-blue-900 dark:text-blue-200">
                    <span className="font-bold">{t("lotPricingTitle", "Lot-Based Inventory Pricing")}: </span>
                    {t("lotPricingDesc", "Selling prices and received costs are tracked per batch/lot in the Inventory system. Inspect receiving history and lot quantities under")}{" "}
                    <Link to="/admin/stock-inventory" className="font-semibold underline underline-offset-2">
                      {t("stockInventoryLink", "Stock Inventory")}
                    </Link>{" "}
                    {t("andWord", "and")}{" "}
                    <Link to="/admin/inventory-lots" className="font-semibold underline underline-offset-2">
                      {t("inventoryLotsLink", "Inventory Lots")}
                    </Link>.
                  </div>
                </div>

                <Separator />

                {/* SKU Code & Barcode Code */}
                <div>
                  <h3 className="text-sm font-bold text-foreground mb-3">
                    {t("productIdentifiersTitle", "Product Identification Codes")}
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="sku-input"
                          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {t("skuCodeLabel", "SKU Code")}
                        </Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleAutoGenerateSku}
                          className="h-6 px-1.5 text-[11px] font-semibold hover:bg-primary/10 gap-1"
                          style={{ color: primaryColor }}
                        >
                          <RefreshCw className="h-3 w-3" />
                          {t("autoGenerateBtn", "Auto-generate")}
                        </Button>
                      </div>
                      <Input
                        id="sku-input"
                        type="text"
                        value={form.sku}
                        onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
                        placeholder="e.g. SKU-SHIRT-001"
                        className="h-10 font-mono text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="barcode-input"
                          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {t("productBarcodeLabel", "Product Barcode / UPC (Optional)")}
                        </Label>
                      </div>
                      <Input
                        id="barcode-input"
                        type="text"
                        value={form.barcode_code}
                        onChange={(e) => setForm((prev) => ({ ...prev, barcode_code: e.target.value }))}
                        placeholder="e.g. 893521234567"
                        className="h-10 font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ─── CARD 4: VARIANTS & STOCK MATRIX ───────────────────────────────── */}
            <Card className="rounded-xl border border-border shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4">
                <div>
                  <CardTitle className="text-base font-bold">
                    {t("variantsMatrixTitle", "Variants & Stock Matrix")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("variantsMatrixSubtitle", "Multi-color and multi-size stock matrix (Color × Size).")}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {form.has_variants
                      ? t("variantsEnabledLabel", "Variants Enabled")
                      : t("singleProductLabel", "Single Product")}
                  </span>
                  <Switch
                    checked={form.has_variants}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, has_variants: checked }))}
                    style={form.has_variants ? { backgroundColor: primaryColor } : {}}
                  />
                </div>
              </CardHeader>

              <CardContent className="pt-5 space-y-6">
                {form.has_variants ? (
                  <>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      {/* Available Colors Box */}
                      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                              {t("availableColorsTitle", "Available Colors")} <span className="text-destructive">*</span>
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              {t("availableColorsSubtitle", "Color names & optional swatches")}
                            </p>
                          </div>
                          {formErrors.colors && (
                            <span className="text-xs font-medium text-destructive">{formErrors.colors}</span>
                          )}
                        </div>

                        {/* Quick Suggestions Chips */}
                        <div>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                            {t("quickColorSuggestions", "Quick Color Suggestions:")}
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
                                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
                                    alreadyAdded
                                      ? "opacity-60 cursor-default"
                                      : "border-border bg-muted/40 text-foreground hover:bg-muted"
                                  }`}
                                  style={
                                    alreadyAdded
                                      ? { borderColor: `${primaryColor}60`, backgroundColor: `${primaryColor}15`, color: primaryColor }
                                      : { borderColor: `${primaryColor}40` }
                                  }
                                >
                                  + {col}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Color Rows List */}
                        <div className="space-y-2">
                          {colorVariants.map((row, idx) => (
                            <div
                              key={row.id}
                              className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2"
                            >
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleTriggerColorUpload(row.id)}
                                disabled={isUploading}
                                className="relative h-9 w-9 shrink-0 p-0 overflow-hidden"
                                title={row.image_url ? "Change swatch image" : "Upload swatch image"}
                              >
                                {row.image_url ? (
                                  <img
                                    src={resolveImageUrl(row.image_url)}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <Upload className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>

                              <Input
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
                                placeholder={t("colorPlaceholder", "e.g. Navy Blue")}
                                className="h-9 flex-1 text-xs"
                              />

                              {row.image_url && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setColorVariants((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, image_url: "" } : item))
                                    );
                                  }}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                  title={t("products.form.clearSwatch", "Clear swatch image")}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}

                              {colorVariants.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setColorVariants((prev) => prev.filter((_, i) => i !== idx));
                                  }}
                                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                  title={t("products.form.removeColor", "Remove color")}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              setColorVariants((prev) => [
                                ...prev,
                                { id: newColorRowId(), name: "", image_url: "" },
                              ])
                            }
                            className="w-full gap-1.5 border-dashed"
                            style={{
                              borderColor: primaryColor,
                              color: primaryColor,
                              backgroundColor: `${primaryColor}0c`,
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t("addAnotherColorBtn", "Add Another Color")}
                          </Button>
                        </div>
                      </div>

                      {/* Available Sizes Box */}
                      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                              {t("availableSizesTitle", "Available Sizes")} <span className="text-destructive">*</span>
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              {t("availableSizesSubtitle", "Category presets or custom sizes")}
                            </p>
                          </div>
                          {formErrors.sizes && (
                            <span className="text-xs font-medium text-destructive">{formErrors.sizes}</span>
                          )}
                        </div>

                        {/* Preset Size Buttons */}
                        <div>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                            {t("categoryPresetsLabel", "Category Presets:")}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
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
                                  className={`flex h-8 min-w-[2.2rem] items-center justify-center rounded-lg border px-2.5 text-xs font-bold transition select-none ${
                                    isChecked
                                      ? "text-white shadow-xs"
                                      : "border-border bg-muted/30 text-foreground hover:bg-muted"
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
                        <div>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                            {t("addCustomSizeLabel", "Add Custom Size:")}
                          </span>
                          <div className="flex items-center gap-2">
                            <Input
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
                                    setFormErrors((prev) => {
                                      const next = { ...prev };
                                      delete next.sizes;
                                      return next;
                                    });
                                  }
                                }
                              }}
                              placeholder={t("customSizePlaceholder", "e.g. 34W x 32L or Free Size")}
                              className="h-9 text-xs"
                            />
                            <Button
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
                              className="px-3 text-white"
                              style={{ backgroundColor: primaryColor }}
                            >
                              {t("addBtn", "Add")}
                            </Button>
                          </div>
                        </div>

                        {/* Active Selected Sizes Tags */}
                        {form.sizes.length > 0 && (
                          <div className="pt-2 border-t border-border/60">
                            <span className="text-[11px] font-medium text-muted-foreground block mb-2">
                              {t("activeSizesLabel", "Active Sizes")} ({form.sizes.length}):
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {form.sizes.map((sz) => (
                                <Badge
                                  key={sz}
                                  variant="secondary"
                                  className="gap-1.5 py-1 px-2.5 text-xs font-semibold"
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
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    ×
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Color × Size Inventory Matrix Table */}
                    <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all duration-200">
                      {/* Header Toolbar */}
                      <div className="flex flex-col gap-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                            {t("matrixTableTitle", "Color × Size Inventory Matrix")}
                          </h4>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                              {t("totalVariationsLabel", "Total variations:")} <strong className="font-bold text-slate-900 dark:text-white ml-0.5">{totalVariationsCount}</strong>
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                totalOnHandUnits > 0
                                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60"
                                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60"
                              }`}
                            >
                              <Package className="w-3.5 h-3.5 shrink-0" />
                              {t("onHandStockLabel", "On-Hand Stock:")} <strong className="font-bold ml-0.5">{totalOnHandUnits}</strong> {t("unitsLabel", "units")}
                            </span>
                          </div>
                        </div>

                        {/* Bulk Action Controls */}
                        <div className="flex flex-wrap items-center gap-2.5">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleGenerateAllBarcodes}
                            className="h-8.5 px-3 gap-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[var(--admin-primary)] text-slate-700 dark:text-slate-200 transition-all shadow-2xs"
                            style={{
                              backgroundColor: `${primaryColor}0a`,
                              color: primaryColor,
                              borderColor: `${primaryColor}40`,
                            }}
                            title={t("products.variant.generateAllBarcodesTooltip", "Generate valid GTIN barcodes for all variant rows")}
                          >
                            <BarcodeIcon className="h-3.5 w-3.5" />
                            {t("generateAllBarcodesBtn", "Generate All Barcodes")}
                          </Button>

                          <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-0.5 shadow-2xs">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pl-2 pr-1 select-none whitespace-nowrap">
                              {t("qtyCol", "Qty")}:
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={bulkStockQty}
                              onChange={(e) => setBulkStockQty(e.target.value)}
                              placeholder="0"
                              className="h-7 w-12 text-center text-xs font-bold bg-slate-50 dark:bg-slate-800/70 rounded-md border-0 outline-none focus:ring-1 focus:ring-[var(--admin-primary)] text-slate-900 dark:text-white"
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleApplyBulkStock}
                              className="h-7 ml-1 px-2.5 text-xs font-semibold rounded-lg text-white shadow-none transition-all hover:opacity-90"
                              style={{ backgroundColor: primaryColor }}
                            >
                              {t("applyToAllBtn", "Apply to All")}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-slate-50/80 dark:bg-slate-800/50">
                            <TableRow className="border-b border-slate-200/80 dark:border-slate-800 hover:bg-transparent">
                              <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs py-3 px-4 min-w-[140px]">
                                {t("colorCol", "Color")}
                              </TableHead>
                              <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs py-3 px-3 w-[110px]">
                                {t("sizeCol", "Size")}
                              </TableHead>
                              <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs py-3 px-3 w-[120px] text-center">
                                {t("stockQtyCol", "Stock Qty")}
                              </TableHead>
                              <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs py-3 px-3 min-w-[200px]">
                                {t("variantBarcodeCol", "Variant Barcode")}
                              </TableHead>
                              <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs py-3 px-3 w-[130px]">
                                {t("formatCol", "Format")}
                              </TableHead>
                              <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs py-3 px-3 w-[70px] text-center">
                                {t("actionCol", "Action")}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {variantMatrix.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-slate-400 dark:text-slate-500 text-xs font-medium">
                                  {t("noVariantsGeneratedTitle", "No variations generated yet. Please choose Color and Size above.")}
                                </TableCell>
                              </TableRow>
                            ) : (
                              variantMatrix.map((row, idx) => {
                                const colorRow = colorVariants.find(
                                  (c) => (c.name || "").trim().toLowerCase() === (row.color || "").trim().toLowerCase()
                                );
                                const swatchImg = colorRow?.image_url;
                                const swatchFill = colorSwatchFill(row.color);

                                return (
                                  <TableRow
                                    key={row.id}
                                    className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                                  >
                                    {/* Color with visual swatch */}
                                    <TableCell className="py-3 px-4">
                                      <div className="flex items-center gap-2.5">
                                        {swatchImg ? (
                                          <img
                                            src={resolveImageUrl(swatchImg)}
                                            alt={row.color}
                                            className="w-5 h-5 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0 shadow-2xs"
                                          />
                                        ) : (
                                          <span
                                            className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shrink-0 shadow-2xs"
                                            style={{ backgroundColor: swatchFill || "#94a3b8" }}
                                          />
                                        )}
                                        <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                                          {row.color || "—"}
                                        </span>
                                      </div>
                                    </TableCell>

                                    {/* Size Badge */}
                                    <TableCell className="py-3 px-3">
                                      <span className="inline-flex items-center justify-center min-w-[32px] px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700/80">
                                        {row.size || "—"}
                                      </span>
                                    </TableCell>

                                    {/* Stock Qty Input */}
                                    <TableCell className="py-3 px-3">
                                      <div className="flex justify-center">
                                        <Input
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
                                          className="h-8 w-20 text-center font-bold text-xs rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-[var(--admin-primary)] transition-colors"
                                        />
                                      </div>
                                    </TableCell>

                                    {/* Variant Barcode with Prefix Icon */}
                                    <TableCell className="py-3 px-3">
                                      <div className="relative">
                                        <BarcodeIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        <Input
                                          type="text"
                                          value={row.sku_barcode}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setVariantMatrix((prev) =>
                                              prev.map((r, i) => (i === idx ? { ...r, sku_barcode: val } : r))
                                            );
                                          }}
                                          placeholder={variantBarcodePlaceholder(row.barcode_format)}
                                          maxLength={variantBarcodeMaxLength(row.barcode_format)}
                                          className="h-8 pl-8 font-mono text-xs tracking-wider rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-[var(--admin-primary)] transition-colors"
                                        />
                                      </div>
                                    </TableCell>

                                    {/* Format Select (Short & Clean) */}
                                    <TableCell className="py-3 px-3">
                                      <select
                                        value={row.barcode_format}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setVariantMatrix((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, barcode_format: val } : r))
                                          );
                                        }}
                                        className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:border-[var(--admin-primary)] transition-colors cursor-pointer"
                                      >
                                        {VARIANT_BARCODE_FORMAT_OPTIONS.map((fmt) => (
                                          <option key={fmt.value} value={fmt.value}>
                                            {fmt.shortLabel || fmt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </TableCell>

                                    {/* Action Button */}
                                    <TableCell className="py-3 px-3 text-center">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleGenerateRowBarcode(idx)}
                                        className="h-8 w-8 p-0 rounded-lg text-slate-500 hover:text-[color:var(--admin-primary)] hover:bg-[rgba(var(--admin-primary-rgb),0.08)] transition-all"
                                        title={t("products.variant.generateBarcodeTooltip", "Generate new barcode for this variant")}
                                      >
                                        <RefreshCw className="h-3.5 w-3.5 transition-transform duration-200 active:rotate-180" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                            {variantMatrix.length > 1 && (
                              <TableRow className="bg-slate-50/70 dark:bg-slate-800/40 font-bold border-t-2 border-slate-200/90 dark:border-slate-700/80 hover:bg-slate-50/70">
                                <TableCell colSpan={2} className="py-3 px-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                                  {t("totalLabel", "Total")}: <span className="text-slate-900 dark:text-white font-bold ml-1">{variantMatrix.length} {t("variationsCountLabel", "variations")}</span>
                                </TableCell>
                                <TableCell className="py-3 px-3 text-center text-xs font-bold text-slate-900 dark:text-white">
                                  {totalOnHandUnits}
                                </TableCell>
                                <TableCell colSpan={3} className="py-3 px-3 text-xs text-slate-400">
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
                    <Package className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-semibold text-foreground">
                      {t("singleProductNoVariantsTitle", "Single Product (No Variants)")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                      {t("singleProductNoVariantsDesc", "This item will be sold as a single unit without size or color options. Stock and pricing follow the base SKU and prices above.")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {/* RIGHT COLUMN: SETTINGS & METADATA (4 COLS)                            */}
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          <div className="space-y-6 lg:col-span-4">
            {/* ─── SIDEBAR CARD 1: STOREFRONT STATUS & VISIBILITY ───────────────── */}
            <Card className="rounded-xl border border-border shadow-xs">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle className="text-base font-bold">
                  {t("statusVisibilityTitle", "Status & Visibility")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("statusVisibilitySubtitle", "Publishing channel and customer target audience.")}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-5 space-y-5">
                {/* Active Switch with Visual Status Badge */}
                <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-foreground block">
                        {t("publishedOnStorefront", "Published on Storefront")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("publishedOnStorefrontDesc", "Visible in search, catalog & buyable.")}
                      </span>
                    </div>
                    <Switch
                      checked={form.is_active}
                      onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))}
                      style={form.is_active ? { backgroundColor: primaryColor } : {}}
                    />
                  </div>

                  <div className="pt-2 border-t border-border/60 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="gap-1.5 py-0.5 px-2 text-xs font-semibold"
                      style={{
                        borderColor: form.is_active ? primaryColor : undefined,
                        color: form.is_active ? primaryColor : undefined,
                        backgroundColor: form.is_active ? `${primaryColor}15` : undefined,
                      }}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          form.is_active ? "animate-pulse" : "bg-slate-400"
                        }`}
                        style={{ backgroundColor: form.is_active ? primaryColor : undefined }}
                      />
                      {form.is_active
                        ? t("activeOnStore", "Active on Store")
                        : t("draftHidden", "Draft (Hidden)")}
                    </Badge>
                  </div>
                </div>

                {/* Target Customer / Gender Pills */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("targetCustomerGender", "Target Customer / Gender")}
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {genderOptions.map((g) => {
                      const isSelected = form.gender === g.value;
                      return (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, gender: g.value }))}
                          className={`rounded-lg border py-2 text-xs font-semibold transition text-center ${
                            isSelected
                              ? "text-white shadow-xs"
                              : "border-border bg-muted/40 text-foreground hover:bg-muted"
                          }`}
                          style={isSelected ? { backgroundColor: primaryColor, borderColor: primaryColor } : {}}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ─── SIDEBAR CARD 2: ORGANIZATION (CATEGORY, BRAND, SUPPLIER) ─────── */}
            <Card className="rounded-xl border border-border shadow-xs">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle className="text-base font-bold">
                  {t("organizationTitle", "Organization")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("organizationSubtitle", "Categorize by collection, brand maker, and supplier source.")}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-5 space-y-4">
                {/* Category Select */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="product-form-category"
                      className={`text-xs font-semibold uppercase tracking-wider ${
                        formErrors.category_id ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {t("categoryLabel", "Category")} <span className="text-destructive">*</span>
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuickCreateCategoryOpen(true)}
                      className="h-6 px-1.5 text-[11px] font-semibold hover:bg-primary/10"
                      style={{ color: primaryColor }}
                    >
                      {t("newCategoryBtn", "+ New Category")}
                    </Button>
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
                    pinnedOptions={[{ value: QUICK_CREATE_OPTION, label: `+ ${t("createNewCategoryOption", "Create new category…")}` }]}
                    options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                    emptyLabel={t("selectCategoryPlaceholder", "Select category")}
                    placeholder={t("searchCategoryPlaceholder", "Search category…")}
                    inputClassName={`h-10 w-full rounded-md border text-xs ${
                      formErrors.category_id
                        ? "border-destructive text-destructive"
                        : "border-input"
                    }`}
                  />
                  {formErrors.category_id && (
                    <p className="text-xs text-destructive">{formErrors.category_id}</p>
                  )}
                </div>

                {/* Brand Select */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="product-form-brand"
                      className={`text-xs font-semibold uppercase tracking-wider ${
                        formErrors.brand_id ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {t("brandLabel", "Brand")} <span className="text-destructive">*</span>
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuickCreateBrandOpen(true)}
                      className="h-6 px-1.5 text-[11px] font-semibold hover:bg-primary/10"
                      style={{ color: primaryColor }}
                    >
                      {t("newBrandBtn", "+ New Brand")}
                    </Button>
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
                    pinnedOptions={[{ value: QUICK_CREATE_OPTION, label: `+ ${t("createNewBrandOption", "Create new brand…")}` }]}
                    options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
                    emptyLabel={t("selectBrandPlaceholder", "Select brand")}
                    placeholder={t("searchBrandPlaceholder", "Search brand…")}
                    inputClassName={`h-10 w-full rounded-md border text-xs ${
                      formErrors.brand_id
                        ? "border-destructive text-destructive"
                        : "border-input"
                    }`}
                  />
                  {formErrors.brand_id && (
                    <p className="text-xs text-destructive">{formErrors.brand_id}</p>
                  )}
                </div>

                {/* Supplier Select */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="product-form-supplier"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {t("supplierLabel", "Supplier (Optional)")}
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuickCreateSupplierOpen(true)}
                      className="h-6 px-1.5 text-[11px] font-semibold hover:bg-primary/10"
                      style={{ color: primaryColor }}
                    >
                      {t("newSupplierBtn", "+ New Supplier")}
                    </Button>
                  </div>
                  <AdminSearchSelect
                    inputId="product-form-supplier"
                    value={form.supplier_id}
                    onChange={(valOrOpt) => {
                      const val = typeof valOrOpt === "object" && valOrOpt !== null ? valOrOpt.value : valOrOpt;
                      if (val === QUICK_CREATE_OPTION) {
                        setQuickCreateSupplierOpen(true);
                        return;
                      }
                      setForm((prev) => ({ ...prev, supplier_id: val || "" }));
                    }}
                    pinnedOptions={[{ value: QUICK_CREATE_OPTION, label: `+ ${t("createNewSupplierOption", "Create new supplier…")}` }]}
                    options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
                    emptyLabel={t("selectSupplierPlaceholder", "Select supplier")}
                    placeholder={t("searchSupplierPlaceholder", "Search supplier…")}
                    inputClassName="h-10 w-full rounded-md border border-input text-xs"
                  />
                </div>
              </CardContent>
            </Card>

            {/* ─── SIDEBAR CARD 3: SUPPORT CONTACT & DELIVERY NOTES ─────────────── */}
            <Card className="rounded-xl border border-border shadow-xs">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle className="text-base font-bold">
                  {t("supportDeliveryNotesTitle", "Support & Delivery Notes")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("supportDeliveryNotesSubtitle", "Customer service contact and payment or delivery policies.")}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="support-phone"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {t("supportContactLabel", "Support Contact (Optional)")}
                  </Label>
                  <Input
                    id="support-phone"
                    type="text"
                    value={form.support_phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, support_phone: e.target.value }))}
                    placeholder={t("supportContactPlaceholder", "e.g. +855 12 345 678 or @telegram_handle")}
                    className="h-10 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="delivery-notes"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {t("paymentDeliveryNotesLabel", "Payment / Delivery Notes")}
                  </Label>
                  <Textarea
                    id="delivery-notes"
                    rows={2}
                    value={form.payment_methods}
                    onChange={(e) => setForm((prev) => ({ ...prev, payment_methods: e.target.value }))}
                    placeholder={t("paymentDeliveryNotesPlaceholder", "e.g. Free delivery on orders over $50.")}
                    className="text-xs resize-y"
                  />
                </div>
              </CardContent>
            </Card>

            {/* ─── SIDEBAR CARD 4: LIVE CALCULATION SUMMARY ─────────────────────── */}
            <Card className="rounded-xl border border-border shadow-xs">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle className="text-base font-bold">
                  {t("liveSummaryTitle", "Live Summary")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("liveSummarySubtitle", "Real-time calculation based on inputs.")}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("retailSellPriceLabel", "Retail Sell Price:")}</span>
                  <span className="font-bold text-foreground">
                    ${parseFloat(form.price || 0).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("grossMarginLabel", "Gross Margin:")}</span>
                  <span className={`font-bold ${grossMargin.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                    ${grossMargin.diff.toFixed(2)} ({grossMargin.margin}%)
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("totalVariantsLabel", "Total Variants:")}</span>
                  <span className="font-bold text-foreground">
                    {form.has_variants ? totalVariationsCount : 1}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("onHandStockLabel", "On-Hand Stock:")}</span>
                  <span className="font-bold text-foreground">
                    {totalOnHandUnits} {t("unitsLabel", "units")}
                  </span>
                </div>

                <Separator />

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="font-semibold text-foreground">
                    {t("estInventoryValueLabel", "Est. Inventory Value:")}
                  </span>
                  <span
                    className="text-sm font-extrabold"
                    style={{ color: primaryColor }}
                  >
                    ${estimatedInventoryValue}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ─── 3. BOTTOM ACTION BAR ──────────────────────────────────────────────── */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {t("reviewRequiredNotice", "Review all required fields (*) before saving changes.")} <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">⌘+S</kbd> / <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">Ctrl+S</kbd>
          </p>

          <div className="flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin/products")}
              disabled={isSubmitting}
            >
              {t("cancelBtn", "Cancel")}
            </Button>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="gap-2 text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {isSubmitting ? (
                <AdminDashboardLoader size={14} />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>
                {isSubmitting
                  ? t("savingChanges", "Saving...")
                  : isEdit
                  ? t("saveChangesBtn", "Save Changes")
                  : t("createProductBtn", "Create Product")}
              </span>
            </Button>
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
        title={t("directImageUrlTitle", "Direct Image URL")}
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t("directImageUrlDesc", "Paste a publicly accessible image URL for this photo slot.")}
          </p>
          <Input
            type="url"
            value={imageUrlDraft}
            onChange={(e) => setImageUrlDraft(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="h-10 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImageUrlPickerOpen(false)}
              className="text-xs"
            >
              {t("cancelBtn", "Cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
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
              className="text-xs font-bold text-white shadow-xs"
              style={{ backgroundColor: primaryColor }}
            >
              {t("applyUrlBtn", "Apply URL")}
            </Button>
          </div>
        </div>
      </AdminModal>

      {/* Quick Create Category Modal */}
      <AdminModal
        open={quickCreateCategoryOpen}
        onClose={() => setQuickCreateCategoryOpen(false)}
        title={t("createNewCategoryTitle", "Create New Category")}
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
        title={t("createNewBrandTitle", "Create New Brand")}
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

      {/* Quick Create Supplier Modal */}
      <AdminModal
        open={quickCreateSupplierOpen}
        onClose={() => setQuickCreateSupplierOpen(false)}
        title={t("createNewSupplierTitle", "Create New Supplier")}
        maxWidthClass="max-w-md"
      >
        <SupplierCreateForm
          onSuccess={(created) => {
            loadCatalogs();
            if (created?.id) {
              setForm((prev) => ({ ...prev, supplier_id: String(created.id) }));
            }
            setQuickCreateSupplierOpen(false);
          }}
          onCancel={() => setQuickCreateSupplierOpen(false)}
        />
      </AdminModal>
    </div>
  );
}
