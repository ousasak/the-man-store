const ADMIN_CHUNK_IMPORTS = [
  () => import("../pages/admin/Orders.jsx"),
  () => import("../pages/admin/Products.jsx"),
  () => import("../pages/admin/Reports.jsx"),
  () => import("../pages/admin/Categories.jsx"),
  () => import("../pages/admin/Brands.jsx"),
  () => import("../pages/admin/Customers.jsx"),
  () => import("../pages/admin/Settings.jsx"),
  () => import("../pages/admin/Discounts.jsx"),
  () => import("../pages/admin/Payments.jsx"),
  () => import("../pages/admin/Messages.jsx"),
  () => import("../pages/admin/Contacts.jsx"),
  () => import("../pages/admin/UserManagement.jsx"),
  () => import("../pages/admin/StockInventoryList.jsx"),
  () => import("../pages/admin/PurchaseOrders.jsx"),
  () => import("../pages/admin/SaleHistory.jsx"),
  () => import("../pages/admin/HomePageManager.jsx"),
  () => import("../pages/admin/CompleteHomepageManager.jsx"),
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
