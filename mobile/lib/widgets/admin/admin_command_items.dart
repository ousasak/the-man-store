import 'package:flutter/material.dart';

import '../../core/admin_permissions.dart';
import '../../models/user_model.dart';
import '../navigation/admin_bottom_nav.dart';

class AdminCommandItem {
  const AdminCommandItem({
    required this.id,
    required this.title,
    required this.description,
    required this.path,
    required this.icon,
    this.keywords = '',
    this.mobileNav,
  });

  final String id;
  final String title;
  final String description;
  final String path;
  final IconData icon;
  final String keywords;
  final AdminNavItem? mobileNav;
}

/// Mirrors web [AdminCommandPalette.jsx] PAGE_ITEMS + quick actions.
abstract final class AdminCommandItems {
  static const pages = [
    AdminCommandItem(id: 'page-dashboard', title: 'Dashboard', description: 'Overview & key metrics', path: '/admin', icon: Icons.grid_view_rounded, keywords: 'home overview', mobileNav: AdminNavItem.home),
    AdminCommandItem(id: 'page-purchase-orders', title: 'Purchase Orders', description: 'Supplier purchase orders', path: '/admin/purchase-orders', icon: Icons.description_outlined, keywords: 'po supplier buying procurement'),
    AdminCommandItem(id: 'page-products', title: 'Products', description: 'Manage catalogue', path: '/admin/products', icon: Icons.inventory_2_outlined, keywords: 'catalogue items inventory', mobileNav: AdminNavItem.products),
    AdminCommandItem(id: 'page-orders', title: 'Orders', description: 'Customer orders & status', path: '/admin/orders', icon: Icons.receipt_long_outlined, keywords: 'purchases sales', mobileNav: AdminNavItem.orders),
    AdminCommandItem(id: 'page-discounts', title: 'Discount', description: 'Product discounts & promo pricing', path: '/admin/discounts', icon: Icons.local_offer_outlined, keywords: 'discount promo sale'),
    AdminCommandItem(id: 'page-checkout', title: 'Checkout / POS', description: 'Point of sale', path: '/admin/checkout', icon: Icons.point_of_sale_rounded, keywords: 'pos register cashier scan', mobileNav: AdminNavItem.checkout),
    AdminCommandItem(id: 'page-categories', title: 'Categories', description: 'Product categories', path: '/admin/categories', icon: Icons.sell_outlined, keywords: 'taxonomy groups'),
    AdminCommandItem(id: 'page-brands', title: 'Brands', description: 'Brand directory', path: '/admin/brands', icon: Icons.bookmark_outline, keywords: 'manufacturers labels'),
    AdminCommandItem(id: 'page-suppliers', title: 'Suppliers', description: 'Vendor contacts for stock receiving', path: '/admin/suppliers', icon: Icons.phone_outlined, keywords: 'vendor supplier'),
    AdminCommandItem(id: 'page-inventory', title: 'Stock & Inventory', description: 'Stock levels & barcodes', path: '/admin/stock-inventory', icon: Icons.warehouse_outlined, keywords: 'barcode qr warehouse stock'),
    AdminCommandItem(id: 'page-inventory-lots', title: 'Inventory Lots', description: 'All lots — clearance, on hand & sold', path: '/admin/inventory-lots', icon: Icons.layers_outlined, keywords: 'lot clearance stock'),
    AdminCommandItem(id: 'page-reports', title: 'Reports', description: 'Business reports', path: '/admin/reports', icon: Icons.bar_chart_rounded, keywords: 'export pdf statistics', mobileNav: AdminNavItem.reports),
    AdminCommandItem(id: 'page-customers', title: 'Customers', description: 'Customer accounts', path: '/admin/customers', icon: Icons.people_outline, keywords: 'clients shoppers users'),
    AdminCommandItem(id: 'page-admins', title: 'Administrators', description: 'Admin team & roles', path: '/admin/administrators', icon: Icons.admin_panel_settings_outlined, keywords: 'team staff roles permissions'),
    AdminCommandItem(id: 'page-contacts', title: 'Contacts', description: 'Contact messages', path: '/admin/contacts', icon: Icons.contact_mail_outlined, keywords: 'leads inquiries'),
    AdminCommandItem(id: 'page-messages', title: 'Messages', description: 'Live chat & support', path: '/admin/messages', icon: Icons.chat_bubble_outline, keywords: 'chat support inbox'),
    AdminCommandItem(id: 'page-chatbot', title: 'Chatbot', description: 'AI assistant settings', path: '/admin/chatbot', icon: Icons.smart_toy_outlined, keywords: 'ai assistant'),
    AdminCommandItem(id: 'page-notifications', title: 'Notifications', description: 'System notifications', path: '/admin/notifications', icon: Icons.notifications_none_rounded, keywords: 'alerts'),
    AdminCommandItem(id: 'page-payments', title: 'Payments', description: 'Payment transactions', path: '/admin/payments', icon: Icons.payments_outlined, keywords: 'billing khqr transactions', mobileNav: AdminNavItem.payments),
    AdminCommandItem(id: 'page-sale-history', title: 'Sale History', description: 'POS checkout sales', path: '/admin/payments/sale-history', icon: Icons.history_rounded, keywords: 'pos sales checkout history'),
    AdminCommandItem(id: 'page-replacements', title: 'Replacements', description: 'Replacement cases', path: '/admin/replacement-cases', icon: Icons.sync_alt_rounded, keywords: 'returns refunds exchange'),
    AdminCommandItem(id: 'page-shipments', title: 'Shipments', description: 'Order shipment tracking', path: '/admin/shipments', icon: Icons.local_shipping_outlined, keywords: 'delivery shipping tracking'),
    AdminCommandItem(id: 'page-homepage', title: 'Home Page', description: 'Storefront homepage', path: '/admin/homepage', icon: Icons.home_outlined, keywords: 'storefront banner hero'),
    AdminCommandItem(id: 'page-homepage-complete', title: 'Complete Homepage Manager', description: 'Advanced homepage editor', path: '/admin/homepage-complete', icon: Icons.dashboard_customize_outlined, keywords: 'homepage builder'),
    AdminCommandItem(id: 'page-settings', title: 'Settings', description: 'System preferences', path: '/admin/settings', icon: Icons.settings_outlined, keywords: 'preferences config'),
    AdminCommandItem(id: 'page-profile', title: 'My Profile', description: 'Your account', path: '/admin/profile', icon: Icons.person_outline_rounded, keywords: 'account me', mobileNav: AdminNavItem.me),
  ];

  static const quickActions = [
    AdminCommandItem(id: 'action-new-product', title: 'Add new product', description: 'Create a product in your catalogue', path: '/admin/products?new=1', icon: Icons.add_rounded, keywords: 'create add product new'),
    AdminCommandItem(id: 'action-view-orders', title: 'View latest orders', description: 'Jump to recent orders', path: '/admin/orders', icon: Icons.receipt_long_outlined, keywords: 'recent orders today', mobileNav: AdminNavItem.orders),
    AdminCommandItem(id: 'action-reports', title: 'Open reports', description: 'Generate a business report', path: '/admin/reports', icon: Icons.bar_chart_rounded, keywords: 'report export', mobileNav: AdminNavItem.reports),
    AdminCommandItem(id: 'action-settings', title: 'Open settings', description: 'Configure system', path: '/admin/settings', icon: Icons.settings_outlined, keywords: 'settings configure'),
  ];

  static List<AdminCommandItem> visibleFor(UserModel user) {
    final all = [...pages, ...quickActions];
    return all.where((item) => AdminPermissions.canAccessAdminPath(user, item.path)).toList();
  }

  static List<AdminCommandItem> search(UserModel user, String query) {
    final q = query.trim().toLowerCase();
    final items = visibleFor(user);
    if (q.isEmpty) return items;
    return items.where((item) {
      final hay = '${item.title} ${item.description} ${item.keywords} ${item.path}'.toLowerCase();
      return hay.contains(q);
    }).toList();
  }
}
