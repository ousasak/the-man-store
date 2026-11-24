/**
 * Global API Endpoint Constants
 * Centralized registry of all backend endpoints for the application.
 */

export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: "/auth/login",
    REGISTER: "/auth/register",
    LOGOUT: "/auth/logout",
    ME: "/auth/me",
    REFRESH: "/auth/refresh",
    FORGOT_PASSWORD: "/auth/forgot-password",
    RESET_PASSWORD: "/auth/reset-password",
  },

  // Products & Catalog
  PRODUCTS: {
    LIST: "/admin/products",
    DETAIL: (id) => `/admin/products/${id}`,
    BY_ID: (id) => `/admin/products/${id}`,
    CREATE: "/admin/products",
    UPDATE: (id) => `/admin/products/${id}`,
    DELETE: (id) => `/admin/products/${id}`,
    BULK_DELETE: "/admin/products/bulk-delete",
    GALLERY_UPLOAD: "/admin/products/gallery-upload",
    BARCODE_GENERATE: "/admin/products/generate-barcode",
    CATEGORIES: "/admin/categories",
    BRANDS: "/admin/brands",
    ATTRIBUTES: "/admin/attributes",
  },

  // Brands
  BRANDS: {
    LIST: "/admin/brands",
    DETAIL: (id) => `/admin/brands/${id}`,
    BY_ID: (id) => `/admin/brands/${id}`,
    CREATE: "/admin/brands",
    UPDATE: (id) => `/admin/brands/${id}`,
    DELETE: (id) => `/admin/brands/${id}`,
  },

  // Categories
  CATEGORIES: {
    LIST: "/admin/categories",
    DETAIL: (id) => `/admin/categories/${id}`,
    BY_ID: (id) => `/admin/categories/${id}`,
    CREATE: "/admin/categories",
    UPDATE: (id) => `/admin/categories/${id}`,
    DELETE: (id) => `/admin/categories/${id}`,
  },

  // Inventory & Warehouse
  INVENTORY: {
    LIST: "/admin/inventory",
    ADJUST: "/admin/inventory/adjust",
    BATCHES: "/admin/inventory/batches",
    RECEIVE: "/admin/inventory/receive",
    TRANSFERS: "/admin/inventory/transfers",
    LOTS: "/admin/inventory/lots",
  },

  // Purchase Orders (PO)
  PURCHASES: {
    LIST: "/admin/purchase-orders",
    DETAIL: (id) => `/admin/purchase-orders/${id}`,
    CREATE: "/admin/purchase-orders",
    UPDATE: (id) => `/admin/purchase-orders/${id}`,
    RECEIVE: (id) => `/admin/purchase-orders/${id}/receive`,
  },

  // Orders & Sales
  ORDERS: {
    LIST: "/admin/orders",
    DETAIL: (id) => `/admin/orders/${id}`,
    BY_ID: (id) => `/admin/orders/${id}`,
    UPDATE_STATUS: (id) => `/admin/orders/${id}/status`,
    INVOICE: (id) => `/admin/orders/${id}/invoice`,
    SHIPMENTS: "/admin/shipments",
  },

  // POS (Point of Sale)
  POS: {
    CHECKOUT: "/admin/pos/checkout",
    PRODUCTS: "/admin/pos/products",
    SCAN: "/admin/pos/scan",
    RECEIPT: (id) => `/admin/pos/receipt/${id}`,
  },

  // Bakong KHQR Payments
  BAKONG: {
    GENERATE_QR: "/payments/bakong/generate-qr",
    CHECK_STATUS: (md5) => `/payments/bakong/status/${md5}`,
    SETTINGS: "/admin/payment-settings/bakong",
  },

  // Customers & CRM
  CUSTOMERS: {
    LIST: "/admin/customers",
    DETAIL: (id) => `/admin/customers/${id}`,
    BY_ID: (id) => `/admin/customers/${id}`,
    CREATE: "/admin/customers",
    UPDATE: (id) => `/admin/customers/${id}`,
    LOYALTY: "/admin/loyalty",
  },

  // Suppliers / Vendors
  SUPPLIERS: {
    LIST: "/admin/suppliers",
    DETAIL: (id) => `/admin/suppliers/${id}`,
    BY_ID: (id) => `/admin/suppliers/${id}`,
    CREATE: "/admin/suppliers",
    UPDATE: (id) => `/admin/suppliers/${id}`,
    DELETE: (id) => `/admin/suppliers/${id}`,
  },

  // Reports & Analytics
  REPORTS: {
    DASHBOARD: "/admin/reports/dashboard",
    SALES: "/admin/reports/sales",
    INVENTORY: "/admin/reports/inventory",
    EXPORT: "/admin/reports/export",
  },

  // Settings & Configuration
  SETTINGS: {
    GENERAL: "/admin/settings",
    BULK: "/admin/settings/bulk",
    PAYMENTS: "/admin/payment-settings",
    UI_PREFERENCES: "/admin/ui-preferences",
  },

  // Users & Roles (RBAC)
  USERS: {
    LIST: "/admin/users",
    DETAIL: (id) => `/admin/users/${id}`,
    ROLES: "/admin/roles",
    PERMISSIONS: "/admin/permissions",
  },
};

export default API_ENDPOINTS;
