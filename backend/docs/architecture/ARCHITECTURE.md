# The Man Store Store — Backend Architecture Guide (v1 Production)

This architecture reflects the streamlined, pragmatic, and high-performance **Hybrid Clean Architecture** designed specifically for **The Man Store Store** (phone/electronics retail, serialized IMEI tracking, POS cashiers, warranty/repairs, Bakong KHQR, and multi-branch management).

---

## 1. Directory Tree Overview

```text
backend/app/Http/Controllers/Api/
├── BaseApiController.php                         # Base API controller
│
└── V1/                                           # Clean Module Subdirectories
    ├── Auth/                                     # Auth, SocialAuth, Sessions, 2FA, TelegramAuth
    │   ├── AuthController.php
    │   ├── AuthSessionController.php
    │   ├── SocialAuthController.php
    │   ├── TwoFactorController.php
    │   └── TelegramAuthController.php
    │
    ├── Admin/                                    # Backoffice Management by Domain
    │   ├── BaseAdminController.php
    │   ├── Dashboard/                            # DashboardController, AdminNavBadgesController
    │   ├── Products/                             # ProductAdmin, CategoryAdmin, BrandAdmin, CollectionAdmin, DiscountAdmin
    │   ├── Inventory/                            # InventoryLotAdmin, StockInventoryAdmin, StockReceivedAdmin, BarcodeScan, InventorySettings
    │   ├── Purchases/                            # PurchaseOrderAdmin, SupplierAdmin
    │   ├── Sales/                                # OrderAdmin, InvoiceAdmin, PosSale, PosSaleHistory, DeliveryFeeAdmin
    │   ├── Customers/                            # CustomerAdmin, UserProfileAdmin, LoyaltyAdmin
    │   ├── Repairs/                              # ReplacementCaseAdminController
    │   ├── Payments/                             # PaymentAdminController, PaymentSettingsController
    │   ├── Drivers/                              # DriverAdmin, ShipmentAdmin, ShipmentQr
    │   ├── Employees/                            # SuperAdmin, AdminPermission, Profile, SecurityAudit, AdminUiPreference
    │   ├── Reports/                              # ReportController, TableExportController
    │   ├── Communications/                       # AdminMessage, AdminNotification, Contact, AdminAiChat, AdminSearch, TelegramLink
    │   └── Settings/                             # SettingAdmin, HomepageAdmin, HomepageSettings, MenuAdmin, BannerAdmin, ChatbotSettings, FooterHeader
    │
    ├── Storefront/                               # Customer Facing Web & Mobile by Domain
    │   ├── Catalog/                              # Product, Category, Brand, Collection, Banner, StorefrontController
    │   ├── Orders/                               # Order, Cart, Payment, BakongPayment, CodCollection, PublicReceipt, DeliveryFee, ShipmentTracking
    │   ├── Customer/                             # CustomerProfile, Notification, Personalization
    │   ├── Pages/                                # HomepageBootstrap, Menu, Faq, ContactPage, PrivacyPage, TermsPage, CookiesPage, LegalContent, PublicMedia
    │   └── Services/                             # ImageSearch, Chatbot, Telegram, TelegramWebhook, ReplacementCase
    │
    ├── Cashier/                                  # In-store Counter POS
    │   └── POS/                                  # PosController
    │
    ├── Driver/                                   # Delivery Driver App
    │   ├── ShipmentDriverController.php
    │   └── DriverCodScanController.php
    │
    └── Technician/                               # Repair Workbench
        └── Repairs/                              # RepairController
```

---

## 2. Business Logic Layers

* **Actions (`app/Actions/[Domain]/`)**: Command pattern executing in DB transactions.
  * `Sales/CreateSaleAction.php`, `Sales/ProcessPaymentAction.php`, `Sales/ReturnSaleAction.php`
  * `Inventory/RegisterImeiDeviceAction.php`, `Inventory/TransferStockAction.php`
  * `Purchases/CreatePurchaseOrderAction.php`, `Purchases/ReceivePurchaseOrderAction.php`
  * `Repairs/AssignTechnicianAction.php`, `Repairs/UpdateRepairStatusAction.php`
* **Services (`app/Services/[Domain]/`)**: External APIs, calculations, integrations.
  * `Payments/BakongKhqrPaymentService.php`, `Pricing/DiscountCalculationService.php`, `Telegram/TelegramNotificationService.php`
* **DTOs (`app/DTOs/[Domain]/`)**: Strictly-typed Data Transfer Objects for complex payloads.
  * `Sales/SaleData.php`, `Inventory/ImeiDeviceData.php`
* **Enums (`app/Enums/`)**: Backed enums for typed status and role management.
  * `OrderStatus`, `PaymentMethod`, `PaymentStatus`, `RepairStatus`, `DeviceCondition`, `UserRole`
* **Rules (`app/Rules/`)**: Custom domain validation rules.
  * `ValidImeiRule`, `ValidKhqrPayloadRule`
