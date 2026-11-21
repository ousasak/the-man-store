import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_config.dart';
import '../../core/admin_permissions.dart';
import '../../models/user_model.dart';
import '../../theme/admin_theme.dart';
import '../navigation/admin_bottom_nav.dart';

class AdminModuleMenu extends StatelessWidget {
  const AdminModuleMenu({
    super.key,
    required this.user,
    required this.onNavigate,
  });

  final UserModel user;
  final ValueChanged<AdminNavItem> onNavigate;

  Future<void> _openWeb(BuildContext context, String path) async {
    final uri = Uri.parse('${AppConfig.storefrontUrl}$path');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open link')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = <_ModuleItem>[
      if (AdminPermissions.canAccessTab(user, AdminNavItem.checkout))
        _ModuleItem(Icons.point_of_sale_rounded, 'Checkout', () => onNavigate(AdminNavItem.checkout)),
      if (AdminPermissions.canAccessTab(user, AdminNavItem.products))
        _ModuleItem(Icons.inventory_2_outlined, 'Products', () => onNavigate(AdminNavItem.products)),
      if (AdminPermissions.has(user, 'customers', 'view'))
        _ModuleItem(Icons.people_outline, 'Customers', () => _openWeb(context, '/admin/customers')),
      if (AdminPermissions.has(user, 'stock', 'view'))
        _ModuleItem(Icons.warehouse_outlined, 'Inventory', () => _openWeb(context, '/admin/stock')),
      if (AdminPermissions.has(user, 'shipments', 'view'))
        _ModuleItem(Icons.local_shipping_outlined, 'Shipments', () => _openWeb(context, '/admin/shipments')),
      if (AdminPermissions.has(user, 'replacements', 'view'))
        _ModuleItem(Icons.swap_horiz_rounded, 'Replacements', () => _openWeb(context, '/admin/replacements')),
      if (AdminPermissions.has(user, 'general_settings', 'view'))
        _ModuleItem(Icons.settings_outlined, 'Settings', () => _openWeb(context, '/admin/settings')),
      if (user.isSuperAdmin)
        _ModuleItem(Icons.home_outlined, 'Homepage', () => _openWeb(context, '/admin/homepage')),
      _ModuleItem(Icons.language_rounded, 'Full web admin', () => _openWeb(context, '/admin')),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: AdminColors.border, borderRadius: BorderRadius.circular(4)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 16, 8, 8),
            child: Text('More modules', style: Theme.of(context).textTheme.titleMedium),
          ),
          if (user.isSuperAdmin)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: Text('Superadmin · extra modules open in browser', style: Theme.of(context).textTheme.bodySmall),
            ),
          ...items.map(
            (item) => ListTile(
              leading: Icon(item.icon, color: AdminColors.primary),
              title: Text(item.label),
              trailing: const Icon(Icons.chevron_right_rounded, size: 20),
              onTap: () {
                Navigator.pop(context);
                item.onTap();
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ModuleItem {
  const _ModuleItem(this.icon, this.label, this.onTap);

  final IconData icon;
  final String label;
  final VoidCallback onTap;
}

void showAdminModuleMenu(BuildContext context, {required UserModel user, required ValueChanged<AdminNavItem> onNavigate}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => AdminModuleMenu(user: user, onNavigate: onNavigate),
  );
}
