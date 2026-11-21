import { lazy } from "react";

function lazyWithReload(importer) {
  return lazy(() =>
    importer().catch((error) => {
      try {
        const key = "fs:chunk-reload";
        const last = Number(sessionStorage.getItem(key) || "0");
        if (Date.now() - last > 15000) {
          sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
          return new Promise(() => {});
        }
      } catch {
        /* ignore storage / window */
      }
      throw error;
    })
  );
}

/** Default admin landing — eager so dashboard paints without an extra chunk round-trip. */
export { default as AdminHome } from "./AdminHome.jsx";
export const Reports = lazyWithReload(() => import("./Reports.jsx"));
export const AdminProducts = lazyWithReload(() => import("./Products.jsx"));
export const AdminProductForm = lazyWithReload(() => import("./ProductFormPage.jsx"));
export const AdminCategories = lazyWithReload(() => import("./Categories.jsx"));
export const AdminBrands = lazyWithReload(() => import("./Brands.jsx"));
export const AdminSuppliers = lazyWithReload(() => import("./Suppliers.jsx"));
export const AdminStockInventoryList = lazyWithReload(() => import("./StockInventoryList.jsx"));
export const AdminInventoryLotsCatalog = lazyWithReload(() => import("./InventoryLotsCatalog.jsx"));
export const AdminBarcodeQR = lazyWithReload(() => import("./StockInventory.jsx"));
export const AdminPosScan = lazyWithReload(() => import("./Checkout.jsx"));
export const AdminOrders = lazyWithReload(() => import("./Orders.jsx"));
export const AdminInvoicePage = lazyWithReload(() => import("./Invoice.jsx"));
export const AdminCustomers = lazyWithReload(() => import("./Customers.jsx"));
export const AdminAdministrators = lazyWithReload(() => import("./Administrators.jsx"));
export const HomePageManager = lazyWithReload(() => import("./HomePageManager.jsx"));
export const CompleteHomepageManager = lazyWithReload(() => import("./CompleteHomepageManager.jsx"));
export const Contacts = lazyWithReload(() => import("./Contacts.jsx"));
export const Messages = lazyWithReload(() => import("./Messages.jsx"));
export const ChatbotSettings = lazyWithReload(() => import("./ChatbotSettings.jsx"));
export const Notifications = lazyWithReload(() => import("./Notifications.jsx"));
export const Profile = lazyWithReload(() => import("./Profile.jsx"));
export const Settings = lazyWithReload(() => import("./Settings.jsx"));
export const AdminDiscounts = lazyWithReload(() => import("./Discounts.jsx"));
export const UserManagement = lazyWithReload(() => import("./UserManagement.jsx"));
export const AdminManagement = lazyWithReload(() => import("./AdminManagement.jsx"));
export const AdminPayments = lazyWithReload(() => import("./Payments.jsx"));
export const SaleHistory = lazyWithReload(() => import("./SaleHistory.jsx"));
export const AdminReplacementCases = lazyWithReload(() => import("./ReplacementCases.jsx"));
export const AdminShipments = lazyWithReload(() => import("./Shipments.jsx"));
export const AdminPurchaseOrders = lazyWithReload(() => import("./PurchaseOrders.jsx"));
export const AdminStockReceived = lazyWithReload(() => import("./StockReceived.jsx"));
export const PaymentSettings = lazyWithReload(() => import("./PaymentSettings.jsx"));
export const LoyaltyTopFans = lazyWithReload(() => import("./LoyaltyTopFans.jsx"));
export const UserProfileDetail = lazyWithReload(() => import("./UserProfileDetail.jsx"));
