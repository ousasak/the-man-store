import '../models/user_model.dart';
import '../widgets/navigation/admin_bottom_nav.dart';

/// Mirrors web admin mobile bottom nav + permission checks.
abstract final class AdminPermissions {
  static bool has(UserModel user, String resource, String action) {
    if (user.isSuperAdmin) return true;
    final perms = user.effectiveAdminPermissions;
    if (perms == null || perms.isEmpty) return false;
    if (perms['$resource.$action'] == true) return true;
    if (resource == 'checkout' && action == 'create' && perms['checkout.edit'] == true) {
      return true;
    }
    return false;
  }

  static bool canAccessTab(UserModel user, AdminNavItem tab) {
    switch (tab) {
      case AdminNavItem.home:
      case AdminNavItem.reports:
        return has(user, 'reports', 'view');
      case AdminNavItem.scan:
        return has(user, 'checkout', 'view');
      case AdminNavItem.checkout:
        return has(user, 'checkout', 'view');
      case AdminNavItem.orders:
        return has(user, 'orders', 'view');
      case AdminNavItem.payments:
        return has(user, 'payments', 'view');
      case AdminNavItem.products:
        return has(user, 'products', 'view');
      case AdminNavItem.me:
        return user.isAdmin;
    }
  }

  /// Web mobile bottom bar: Dashboard · Reports · Scan · Orders · Payments
  static List<AdminNavItem> bottomNavTabs(UserModel user) {
    const order = [
      AdminNavItem.home,
      AdminNavItem.reports,
      AdminNavItem.scan,
      AdminNavItem.orders,
      AdminNavItem.payments,
    ];
    return order.where((t) => canAccessTab(user, t)).toList();
  }

  static List<AdminNavItem> visibleTabs(UserModel user) {
    final tabs = AdminNavItem.values.where((t) => canAccessTab(user, t)).toList();
    return tabs.isEmpty ? [AdminNavItem.me] : tabs;
  }

  /// IndexedStack tabs — scan shares the checkout screen (web `/admin/checkout`).
  static List<AdminNavItem> stackTabs(UserModel user) {
    final tabs = visibleTabs(user);
    if (tabs.contains(AdminNavItem.checkout)) {
      return tabs.where((t) => t != AdminNavItem.scan).toList();
    }
    return tabs;
  }

  /// Resolve bottom-nav / search target to a stack tab index.
  static AdminNavItem stackTabFor(AdminNavItem nav, UserModel user) {
    final tabs = stackTabs(user);
    if (nav == AdminNavItem.scan && visibleTabs(user).contains(AdminNavItem.checkout)) {
      return AdminNavItem.checkout;
    }
    if (tabs.contains(nav)) return nav;
    return tabs.first;
  }

  static bool focusPickupOnTab(AdminNavItem nav) => nav == AdminNavItem.scan;

  static const _superadminOnlyPaths = [
    '/admin/administrators',
    '/admin/loyalty-top-fans',
    '/admin/payment-settings',
    '/admin/user-management',
    '/admin/admin-management',
  ];

  static const _pathPermissions = <String, (String, String)>{
    '/admin': ('reports', 'view'),
    '/admin/orders': ('orders', 'view'),
    '/admin/checkout': ('checkout', 'view'),
    '/admin/pos': ('checkout', 'view'),
    '/admin/discounts': ('discounts', 'view'),
    '/admin/products': ('products', 'view'),
    '/admin/categories': ('categories', 'view'),
    '/admin/brands': ('brands', 'view'),
    '/admin/stock-inventory': ('stock', 'view'),
    '/admin/inventory-lots': ('stock', 'view'),
    '/admin/purchase-orders': ('purchase_orders', 'view'),
    '/admin/suppliers': ('suppliers', 'view'),
    '/admin/payments': ('payments', 'view'),
    '/admin/payments/sale-history': ('sale_history', 'view'),
    '/admin/reports': ('reports', 'view'),
    '/admin/contacts': ('contacts', 'view'),
    '/admin/messages': ('messages', 'view'),
    '/admin/notifications': ('notifications', 'view'),
    '/admin/shipments': ('shipments', 'view'),
    '/admin/replacement-cases': ('replacements', 'view'),
    '/admin/customers': ('customers', 'view'),
    '/admin/chatbot': ('chatbot', 'view'),
    '/admin/profile': ('profile', 'view'),
    '/admin/settings': ('general_settings', 'view'),
    '/admin/homepage': ('homepage', 'view'),
    '/admin/homepage-complete': ('homepage_complete', 'view'),
  };

  static bool canAccessAdminPath(UserModel user, String path) {
    if (user.isSuperAdmin) return true;
    final normalized = path.split('?').first.replaceAll(RegExp(r'/+$'), '');
    final clean = normalized.isEmpty ? '/admin' : normalized;
    for (final p in _superadminOnlyPaths) {
      if (clean == p || clean.startsWith('$p/')) return false;
    }
    final perms = user.effectiveAdminPermissions;
    if (perms == null || perms.isEmpty) return false;
    final entries = _pathPermissions.entries.toList()..sort((a, b) => b.key.length.compareTo(a.key.length));
    for (final entry in entries) {
      if (clean == entry.key || clean.startsWith('${entry.key}/')) {
        return has(user, entry.value.$1, entry.value.$2);
      }
    }
    return true;
  }

  static List<String> enabledModuleLabels(UserModel user) {
    if (user.isSuperAdmin) return const ['Full access (Superadmin)'];
    const modules = <String, String>{
      'reports': 'Reports & dashboard',
      'checkout': 'POS checkout & scan pickup',
      'products': 'Products',
      'orders': 'Orders',
      'payments': 'Payments',
      'stock': 'Inventory',
      'customers': 'Customers',
      'shipments': 'Shipments',
      'replacements': 'Replacements',
      'general_settings': 'Settings',
      'homepage': 'Homepage',
    };
    final labels = <String>[];
    for (final entry in modules.entries) {
      if (has(user, entry.key, 'view')) labels.add(entry.value);
    }
    return labels.isEmpty ? const ['No modules assigned'] : labels;
  }
}
