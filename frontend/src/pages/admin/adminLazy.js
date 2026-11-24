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
export { default as AdminHome } from "./reports/AdminHome.jsx";
export const Reports = lazyWithReload(() => import("./reports/Reports.jsx"));
export const AdminProducts = lazyWithReload(() => import("./catalog/Products.jsx"));
export const AdminProductForm = lazyWithReload(() => import("./catalog/ProductFormPage.jsx"));
export const AdminCategories = lazyWithReload(() => import("./catalog/Categories.jsx"));
export const AdminBrands = lazyWithReload(() => import("./catalog/Brands.jsx"));
export const AdminSuppliers = lazyWithReload(() => import("./inventory/Suppliers.jsx"));
export const AdminStockInventoryList = lazyWithReload(() => import("./inventory/StockInventoryList.jsx"));
export const AdminInventoryLotsCatalog = lazyWithReload(() => import("./inventory/InventoryLotsCatalog.jsx"));
export const AdminBarcodeQR = lazyWithReload(() => import("./inventory/StockInventory.jsx"));
export const AdminPosScan = lazyWithReload(() => import("./pos/Checkout.jsx"));
export const AdminOrders = lazyWithReload(() => import("./sales/Orders.jsx"));
export const AdminInvoicePage = lazyWithReload(() => import("./sales/Invoice.jsx"));
export const AdminCustomers = lazyWithReload(() => import("./customers/Customers.jsx"));
export const AdminAdministrators = lazyWithReload(() => import("./users/Administrators.jsx"));
export const HomePageManager = lazyWithReload(() => import("./settings/HomePageManager.jsx"));
export const CompleteHomepageManager = lazyWithReload(() => import("./settings/CompleteHomepageManager.jsx"));
export const Contacts = lazyWithReload(() => import("./customers/Contacts.jsx"));
export const Messages = lazyWithReload(() => import("./customers/Messages.jsx"));
export const ChatbotSettings = lazyWithReload(() => import("./settings/ChatbotSettings.jsx"));
export const Notifications = lazyWithReload(() => import("./settings/Notifications.jsx"));
export const Profile = lazyWithReload(() => import("./users/Profile.jsx"));
export const Settings = lazyWithReload(() => import("./settings/Settings.jsx"));
export const AdminDiscounts = lazyWithReload(() => import("./sales/Discounts.jsx"));
export const UserManagement = lazyWithReload(() => import("./users/UserManagement.jsx"));
export const AdminManagement = lazyWithReload(() => import("./users/AdminManagement.jsx"));
export const AdminPayments = lazyWithReload(() => import("./sales/Payments.jsx"));
export const SaleHistory = lazyWithReload(() => import("./sales/SaleHistory.jsx"));
export const AdminReplacementCases = lazyWithReload(() => import("./sales/ReplacementCases.jsx"));
export const AdminShipments = lazyWithReload(() => import("./sales/Shipments.jsx"));
export const AdminPurchaseOrders = lazyWithReload(() => import("./inventory/PurchaseOrders.jsx"));
export const AdminStockReceived = lazyWithReload(() => import("./inventory/StockReceived.jsx"));
export const PaymentSettings = lazyWithReload(() => import("./settings/PaymentSettings.jsx"));
export const LoyaltyTopFans = lazyWithReload(() => import("./customers/LoyaltyTopFans.jsx"));
export const UserProfileDetail = lazyWithReload(() => import("./users/UserProfileDetail.jsx"));
