import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/user_model.dart';
import '../../providers/admin_preferences_provider.dart';
import '../../providers/app_settings_provider.dart';
import '../../screens/admin/admin_contacts_screen.dart';
import '../../screens/admin/admin_customers_screen.dart';
import '../../screens/admin/admin_order_detail_screen.dart';
import '../../screens/admin/admin_payment_detail_screen.dart';
import '../../screens/admin/admin_replacements_screen.dart';
import '../../screens/admin/admin_sale_history_screen.dart';
import '../../screens/admin/admin_shipments_screen.dart';
import '../../screens/admin/admin_brands_screen.dart';
import '../../widgets/navigation/admin_bottom_nav.dart';

/// Push admin module screens from search, notifications, dashboard.
abstract final class AdminNavigation {
  static Future<T?> _push<T>(BuildContext context, Widget screen) {
    final theme = Theme.of(context);
    final adminPrefs = context.read<AdminPreferencesProvider>();
    final appSettings = context.read<AppSettingsProvider>();

    return Navigator.of(context).push<T>(
      MaterialPageRoute(
        builder: (_) => MultiProvider(
          providers: [
            ChangeNotifierProvider<AdminPreferencesProvider>.value(value: adminPrefs),
            ChangeNotifierProvider<AppSettingsProvider>.value(value: appSettings),
          ],
          child: Theme(data: theme, child: screen),
        ),
      ),
    );
  }

  static void openOrderDetail(BuildContext context, {required UserModel user, required int orderId}) {
    _push(context, AdminOrderDetailScreen(user: user, orderId: orderId));
  }

  static void openPaymentDetail(BuildContext context, {required UserModel user, required int paymentId}) {
    _push(context, AdminPaymentDetailScreen(user: user, paymentId: paymentId));
  }

  static void openShipments(BuildContext context, {required UserModel user}) {
    _push(context, AdminShipmentsScreen(user: user));
  }

  static void openCustomers(BuildContext context, {required UserModel user}) {
    _push(context, AdminCustomersScreen(user: user));
  }

  static void openContacts(BuildContext context, {required UserModel user}) {
    _push(context, AdminContactsScreen(user: user));
  }

  static void openReplacements(BuildContext context, {required UserModel user}) {
    _push(context, AdminReplacementsScreen(user: user));
  }

  static void openSaleHistory(BuildContext context, {required UserModel user}) {
    _push(context, AdminSaleHistoryScreen(user: user));
  }

  static void openBrands(BuildContext context, {required UserModel user}) {
    _push(context, AdminBrandsScreen(user: user));
  }

  /// Parse admin notification link e.g. `/admin/orders?id=42`
  static void openFromNotificationLink(BuildContext context, UserModel user, String? link, {ValueChanged<AdminNavItem>? onNavigate}) {
    if (link == null || link.isEmpty) return;
    final uri = Uri.tryParse(link.startsWith('/') ? 'https://x$link' : link);
    if (uri == null) return;
    final path = uri.path;
    final id = int.tryParse(uri.queryParameters['id'] ?? '');

    if (path.contains('/orders') && id != null) {
      openOrderDetail(context, user: user, orderId: id);
      return;
    }
    if (path.contains('/payments') && id != null) {
      openPaymentDetail(context, user: user, paymentId: id);
      return;
    }
    if (path.contains('/shipments')) {
      openShipments(context, user: user);
      return;
    }
    if (path.contains('/customers')) {
      openCustomers(context, user: user);
      return;
    }
    if (path.contains('/contacts')) {
      openContacts(context, user: user);
      return;
    }
    if (path.contains('/replacement')) {
      openReplacements(context, user: user);
      return;
    }
    if (path.contains('/sale-history')) {
      openSaleHistory(context, user: user);
      return;
    }
    if (path.contains('/reports')) {
      onNavigate?.call(AdminNavItem.reports);
    } else if (path.contains('/checkout') || path.contains('/pos')) {
      onNavigate?.call(AdminNavItem.checkout);
    }
  }
}
