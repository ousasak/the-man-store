import React from "react";
import {
  FolderOpen,
  Tag,
  ShoppingBag,
  Users,
  ShieldCheck,
  Boxes,
  Truck,
  CreditCard,
  Percent,
  FileText,
  Bell,
  MessageSquare,
  Building2,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n.jsx";

// 3D Isometric Cube Box icon (matching the exact design from the Product empty state)
export const ProductIsometricCubeIcon = ({ className = "h-10 w-10 text-slate-400 dark:text-slate-500" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
    />
  </svg>
);

// Standard preset icons matching admin modules
const TYPE_ICONS = {
  products: ProductIsometricCubeIcon,
  categories: FolderOpen,
  brands: Tag,
  orders: ShoppingBag,
  customers: Users,
  admins: ShieldCheck,
  users: Users,
  inventory: Boxes,
  stock: Boxes,
  lots: Boxes,
  suppliers: Building2,
  purchaseOrders: FileText,
  shipments: Truck,
  payments: CreditCard,
  discounts: Percent,
  notifications: Bell,
  messages: MessageSquare,
  default: ProductIsometricCubeIcon,
};

/**
 * Helper to safely render any icon whether it is:
 * - A standard Lucide forwardRef component object
 * - A regular functional component
 * - An already-instantiated JSX element (e.g. <svg ... />)
 */
function renderIcon(Icon, className = "h-10 w-10 text-slate-400 dark:text-slate-500") {
  if (!Icon) return null;
  if (React.isValidElement(Icon)) return Icon;
  try {
    return React.createElement(Icon, { className });
  } catch {
    return null;
  }
}

/**
 * Global Admin Empty State Component
 *
 * Matching the exact visual design of the product empty state:
 * - Clean spacious layout (p-12 text-center)
 * - Soft rounded-full circle (w-20 h-20 bg-slate-100 dark:bg-slate-800)
 * - 40px icon (h-10 w-10 text-slate-400 dark:text-slate-500)
 * - Title (<p className="text-lg text-slate-500 dark:text-slate-200">)
 * - Description (<p className="mt-1 text-sm text-slate-400 dark:text-slate-400">)
 */
export function AdminEmptyState({
  type = "default",
  isSearch = false,
  hasFilters = false,
  searchQuery = "",
  icon: CustomIcon,
  title,
  description,
  compact = false,
  className = "",
  children,
}) {
  const { t, language } = useLanguage();
  const isKhmer = language === "km";

  // Determine Icon to display (default to module's preset icon or ProductIsometricCubeIcon)
  const IconComponent = CustomIcon || TYPE_ICONS[type] || TYPE_ICONS.default;

  // Fallback localized title
  let resolvedTitle = title;
  if (!resolvedTitle) {
    switch (type) {
      case "products":
        resolvedTitle = t("products.noProductsYet", "No products yet");
        break;
      case "categories":
        resolvedTitle = t("categories.empty.noCategoriesYet", "No categories yet");
        break;
      case "brands":
        resolvedTitle = t("brands.empty.noBrandsYet", "No brands found");
        break;
      case "orders":
        resolvedTitle = t("orders.noOrdersYet", "No orders yet");
        break;
      case "customers":
        resolvedTitle = isKhmer ? "មិនទាន់មានអតិថិជនទេ" : "No customers found";
        break;
      case "admins":
        resolvedTitle = isKhmer ? "មិនទាន់មានអ្នកគ្រប់គ្រងទេ" : "No administrators found";
        break;
      case "inventory":
      case "stock":
        resolvedTitle = isKhmer ? "មិនទាន់មានទិន្នន័យស្តុកទេ" : t("inventory.noInventoryFound", "No inventory found");
        break;
      case "lots":
        resolvedTitle = isKhmer ? "មិនទាន់មានបាច់ស្តុកទេ" : t("inventory.noLotsMatchFilters", "No inventory lots found");
        break;
      case "suppliers":
        resolvedTitle = isKhmer ? "មិនទាន់មានអ្នកផ្គត់ផ្គង់ទេ" : t("inventory.noSuppliersFound", "No suppliers yet.");
        break;
      case "purchaseOrders":
        resolvedTitle = isKhmer ? "មិនទាន់មានការបញ្ជាទិញចូល (PO) ទេ" : "No purchase orders yet";
        break;
      case "payments":
        resolvedTitle = isKhmer ? "មិនទាន់មានការទូទាត់ទេ" : t("sales.noPaymentsFound", "No payments found");
        break;
      case "discounts":
        resolvedTitle = isKhmer ? "មិនទាន់មានការបញ្ចុះតម្លៃទេ" : t("discounts.noDiscountsFound", "No discounts found");
        break;
      default:
        resolvedTitle = isKhmer ? "មិនទាន់មានទិន្នន័យទេ" : t("common.messages.noData", "No data available");
        break;
    }
  }

  // Fallback localized description
  let resolvedDesc = description;
  if (resolvedDesc === undefined) {
    switch (type) {
      case "products":
        resolvedDesc = t("products.createFirstProduct", "Create your first product above");
        break;
      case "categories":
        resolvedDesc = t("categories.empty.createFirstCategory", "Create your first category above");
        break;
      case "brands":
        resolvedDesc = t("brands.empty.createFirstBrand", "Create your first brand above");
        break;
      case "orders":
        resolvedDesc = t("orders.ordersWillAppearHere", "Orders will appear here as customers place them");
        break;
      case "customers":
        resolvedDesc = isKhmer
          ? "អតិថិជននឹងបង្ហាញនៅទីនេះនៅពេលពួកគេចុះឈ្មោះ"
          : "Customers will appear here once they register.";
        break;
      case "admins":
        resolvedDesc = isKhmer
          ? "អ្នកអាចបន្ថែមអ្នកគ្រប់គ្រងថ្មីខាងលើ"
          : "You can add new admin members above.";
        break;
      case "inventory":
      case "stock":
        resolvedDesc = isKhmer
          ? "ទិន្នន័យស្តុកទំនិញនឹងបង្ហាញនៅទីនេះ"
          : "Inventory data will appear here.";
        break;
      case "lots":
        resolvedDesc = isKhmer
          ? "បាច់ស្តុកទំនិញនឹងបង្ហាញនៅទីនេះ"
          : "Inventory lots will appear here.";
        break;
      case "suppliers":
        resolvedDesc = isKhmer
          ? "បង្កើតអ្នកផ្គត់ផ្គង់ដំបូងរបស់អ្នកខាងលើ"
          : "Add your first supplier above.";
        break;
      case "purchaseOrders":
        resolvedDesc = isKhmer
          ? "បង្កើតការបញ្ជាទិញចូលដំបូងរបស់អ្នកខាងលើ"
          : "Create your first purchase order above.";
        break;
      case "payments":
        resolvedDesc = isKhmer
          ? "កំណត់ត្រាការទូទាត់នឹងបង្ហាញនៅទីនេះ"
          : "Payment records will appear here.";
        break;
      case "discounts":
        resolvedDesc = isKhmer
          ? "បង្កើតការបញ្ចុះតម្លៃដំបូងរបស់អ្នកខាងលើ"
          : "Create your first discount above.";
        break;
      default:
        resolvedDesc = "";
        break;
    }
  }

  return (
    <div className={`text-center ${compact ? "p-6" : "p-12"} ${className}`.trim()}>
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        {renderIcon(IconComponent, "h-10 w-10 text-slate-400 dark:text-slate-500")}
      </div>
      <p className="text-lg text-slate-500 dark:text-slate-200">{resolvedTitle}</p>
      {resolvedDesc ? (
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-400">{resolvedDesc}</p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export default AdminEmptyState;
