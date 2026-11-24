const ADMIN_CHUNK_IMPORTS = [
  () => import("../pages/admin/sales/Orders.jsx"),
  () => import("../pages/admin/catalog/Products.jsx"),
  () => import("../pages/admin/reports/Reports.jsx"),
  () => import("../pages/admin/catalog/Categories.jsx"),
  () => import("../pages/admin/catalog/Brands.jsx"),
  () => import("../pages/admin/customers/Customers.jsx"),
  () => import("../pages/admin/settings/Settings.jsx"),
  () => import("../pages/admin/sales/Discounts.jsx"),
  () => import("../pages/admin/sales/Payments.jsx"),
  () => import("../pages/admin/customers/Messages.jsx"),
  () => import("../pages/admin/customers/Contacts.jsx"),
  () => import("../pages/admin/users/UserManagement.jsx"),
  () => import("../pages/admin/inventory/StockInventoryList.jsx"),
  () => import("../pages/admin/inventory/PurchaseOrders.jsx"),
  () => import("../pages/admin/sales/SaleHistory.jsx"),
  () => import("../pages/admin/settings/HomePageManager.jsx"),
  () => import("../pages/admin/settings/CompleteHomepageManager.jsx"),
];

let prefetched = false;

/** Warm lazy admin route chunks after the shell is visible (idle). */
export function prefetchAdminChunks() {
  if (prefetched || typeof window === "undefined") return;
  prefetched = true;

  const run = () => {
    ADMIN_CHUNK_IMPORTS.forEach((load) => {
      load().catch(() => {});
    });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 600);
  }
}
