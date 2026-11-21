# The Man Store Store — Database Map & Models

This document references the core database schema and model mappings for The Man Store Store.

---

## 1. Primary Schemas & Tables

| Domain | Core Tables | Corresponding Models | Notes |
| :--- | :--- | :--- | :--- |
| **Catalog** | `products`, `categories`, `brands`, `collections`, `product_images` | `Product`, `Category`, `Brand`, `Collection`, `ProductImage` | Multi-image variants, barcode mapping |
| **Inventory & Lots** | `inventory_lots`, `stock_inventories`, `inventory_lot_detail_events` | `InventoryLot`, `StockInventory`, `InventoryLotDetailEvent` | Tracks IMEI, serials, purchase cost per lot, batch transfers |
| **Sales & POS** | `orders`, `order_items`, `payments`, `carts`, `cart_items` | `Order`, `OrderItem`, `Payment`, `Cart`, `CartItem` | Cash, Card, Bakong KHQR, Split payments |
| **Purchasing** | `purchase_orders`, `purchase_order_items`, `suppliers` | `PurchaseOrder`, `PurchaseOrderItem`, `Supplier` | PO workflow with receiving into inventory lots |
| **Repairs & Warranty**| `replacement_cases`, `replacement_case_items` | `ReplacementCase`, `ReplacementCaseItem` | Repair tickets, diagnosis, parts tracking |
| **Logistics** | `shipments`, `shipment_tracking_events`, `addresses` | `Shipment`, `ShipmentTrackingEvent`, `Address` | Driver QR/barcode scan on delivery, COD settlement |
| **Users & Security** | `users`, `user_device_sessions`, `security_audit_logs` | `User`, `UserDeviceSession`, `SecurityAuditLog` | RBAC roles, 2FA, session devices |

---

## 2. Technical Documentation Hub

* **Data Dictionary**: [DataDictionary.md](../../../docs/database/DataDictionary.md)
* **Entity Relationship Diagram (ERD)**: [ERD.md](../../../docs/database/ERD.md)
* **System Architecture**: [SystemArchitecture.md](../../../docs/architecture/SystemArchitecture.md)
* **Documentation Hub**: [README.md](../../../docs/README.md)
