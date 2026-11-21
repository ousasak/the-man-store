import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/admin_auth_navigation.dart';
import '../../core/admin_permissions.dart';
import '../../models/user_model.dart';
import '../../l10n/l10n_extension.dart';
import '../../providers/admin_preferences_provider.dart';
import '../../providers/app_settings_provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/admin_service.dart';
import '../../core/api_client.dart';
import '../../theme/admin_theme.dart';
import '../../theme/app_colors.dart';
import '../../widgets/admin/admin_toolbar.dart';
import '../../widgets/admin/admin_profile_actions_sheet.dart';
import '../../widgets/admin/admin_profile_avatar.dart';
import '../../widgets/admin/admin_preferences_panel.dart';
import '../../widgets/admin/admin_ui_kit.dart';
import '../../widgets/navigation/admin_bottom_nav.dart';
import '../home_shell.dart';
import 'admin_checkout_screen.dart';
import 'admin_dashboard_screen.dart';
import 'admin_orders_screen.dart';
import 'admin_payments_screen.dart';
import 'admin_products_screen.dart';
import 'admin_reports_screen.dart';

void openAdminShell(BuildContext context, {AdminNavItem initialTab = AdminNavItem.home}) {
  Navigator.of(context).push(
    PageRouteBuilder(
      pageBuilder: (_, __, ___) => AdminShell(initialTab: initialTab),
      transitionsBuilder: (_, animation, __, child) => FadeTransition(opacity: animation, child: child),
      transitionDuration: const Duration(milliseconds: 280),
    ),
  );
}

class AdminShell extends StatefulWidget {
  const AdminShell({super.key, this.initialTab = AdminNavItem.home});

  final AdminNavItem initialTab;

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  late AdminNavItem _nav;
  int _pendingOrders = 0;
  bool _loadingProfile = true;
  AdminPreferencesProvider? _adminPrefs;

  @override
  void initState() {
    super.initState();
    _nav = widget.initialTab;
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final adminPrefs = AdminPreferencesProvider(prefs);
    await adminPrefs.bootstrap();
    if (!mounted) return;
    setState(() => _adminPrefs = adminPrefs);
    await _refreshAdminProfile();
  }

  Future<void> _refreshAdminProfile() async {
    final auth = context.read<AuthProvider>();
    final user = auth.user;
    if (user == null || !user.isAdmin) {
      if (mounted) setState(() => _loadingProfile = false);
      return;
    }
    try {
      final profile = await AdminService(context.read<ApiClient>()).fetchAdminProfile();
      final perms = UserModel.parseAdminPermissions(profile['effective_admin_permissions']);
      if (!mounted) return;
      auth.updateUser(user.copyWith(
        name: (profile['name'] ?? user.name).toString(),
        email: (profile['email'] ?? user.email).toString(),
        phone: profile['phone']?.toString() ?? user.phone,
        address: profile['address']?.toString() ?? user.address,
        profileImageUrl: profile['profile_image_url']?.toString() ?? user.profileImageUrl,
        effectiveAdminPermissions: perms ?? user.effectiveAdminPermissions,
      ));
      if (!AdminPermissions.canAccessTab(auth.user!, _nav)) {
        setState(() => _nav = AdminPermissions.stackTabs(auth.user!).first);
      }
    } catch (_) {
      // Keep cached permissions from login payload.
    } finally {
      if (mounted) setState(() => _loadingProfile = false);
    }
  }

  void _onStatsLoaded(AdminDashboardStats? stats) {
    if (stats == null || !mounted) return;
    setState(() => _pendingOrders = stats.pendingOrders);
  }

  void _goTo(AdminNavItem item) => setState(() => _nav = item);

  AdminNavItem _checkoutNavActive(AdminNavItem nav, List<AdminNavItem> bottomTabs) {
    if (bottomTabs.contains(nav)) return nav;
    if ((nav == AdminNavItem.checkout || nav == AdminNavItem.scan) && bottomTabs.contains(AdminNavItem.scan)) {
      return AdminNavItem.scan;
    }
    return bottomTabs.contains(AdminNavItem.home) ? AdminNavItem.home : bottomTabs.first;
  }

  Widget _tabScreen(UserModel user, AdminNavItem tab) {
    switch (tab) {
      case AdminNavItem.home:
        return AdminDashboardScreen(user: user, onNavigate: _goTo, onStatsLoaded: _onStatsLoaded);
      case AdminNavItem.reports:
        return AdminReportsScreen(user: user, embedded: true);
      case AdminNavItem.scan:
      case AdminNavItem.checkout:
        return AdminCheckoutScreen(
          key: ValueKey('checkout_pickup_${_nav == AdminNavItem.scan}'),
          user: user,
          focusPickup: AdminPermissions.focusPickupOnTab(_nav),
        );
      case AdminNavItem.orders:
        return AdminOrdersScreen(user: user);
      case AdminNavItem.payments:
        return AdminPaymentsScreen(user: user);
      case AdminNavItem.products:
        return AdminProductsScreen(user: user, embedded: true);
      case AdminNavItem.me:
        return AdminMeScreen(user: user, onNavigate: _goTo);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final appSettings = context.watch<AppSettingsProvider>();
    final user = auth.user;

    if (user == null || !user.isAdmin) {
      return Theme(
        data: AdminTheme.light(khmer: appSettings.isKhmer),
        child: const Scaffold(body: Center(child: Text('Admin access required'))),
      );
    }

    if (_adminPrefs == null || _loadingProfile) {
      return Theme(
        data: AdminTheme.light(khmer: appSettings.isKhmer),
        child: const Scaffold(
          body: AdminBackdrop(child: Center(child: CircularProgressIndicator(color: AdminColors.primary))),
        ),
      );
    }

    final stackTabs = AdminPermissions.stackTabs(user);
    final bottomTabs = AdminPermissions.bottomNavTabs(user);
    final activeStack = AdminPermissions.stackTabFor(_nav, user);
    final stackIndex = stackTabs.indexOf(activeStack);
    final safeStackIndex = stackIndex < 0 ? 0 : stackIndex;

    return ChangeNotifierProvider<AdminPreferencesProvider>.value(
      value: _adminPrefs!,
      child: Consumer2<AdminPreferencesProvider, AppSettingsProvider>(
        builder: (context, prefs, appSettings, _) {
          final themeData = prefs.themeMode == ThemeMode.dark
              ? AdminTheme.dark(primary: prefs.primaryColor, khmer: appSettings.isKhmer)
              : AdminTheme.light(primary: prefs.primaryColor, khmer: appSettings.isKhmer);

          return Theme(
            data: themeData,
            child: Scaffold(
              backgroundColor: themeData.scaffoldBackgroundColor,
              body: Column(
                children: [
                  AdminToolbar(
                    user: user,
                    onNavigate: _goTo,
                  ),
                  Expanded(
                    child: IndexedStack(
                      key: ValueKey('admin-tabs-${appSettings.language}'),
                      index: safeStackIndex,
                      sizing: StackFit.expand,
                      children: [
                        for (final tab in stackTabs)
                          KeyedSubtree(
                            key: ValueKey('admin-tab-$tab'),
                            child: _tabScreen(user, tab),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              bottomNavigationBar: AdminBottomNav(
                selected: _checkoutNavActive(_nav, bottomTabs),
                visibleTabs: bottomTabs,
                pendingOrders: _pendingOrders,
                onSelect: _goTo,
              ),
            ),
          );
        },
      ),
    );
  }
}

class AdminMeScreen extends StatelessWidget {
  const AdminMeScreen({super.key, required this.user, this.onNavigate});

  final UserModel user;
  final ValueChanged<AdminNavItem>? onNavigate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;
    final auth = context.watch<AuthProvider>();
    final liveUser = auth.user ?? user;
    final modules = AdminPermissions.enabledModuleLabels(user);
    final badge = user.isSuperAdmin ? 'SUPERADMIN' : 'ADMIN';

    return AdminTabScaffold(
      title: l10n.account,
      subtitle: badge,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 100),
        children: [
          AdminAppear(
            index: 0,
            child: AdminSoftCard(
              onTap: () => showAdminProfileActionsSheet(context, user: liveUser),
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  AdminProfileAvatar(user: liveUser, radius: 28),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(liveUser.name, style: Theme.of(context).textTheme.titleMedium),
                        Text(liveUser.email, style: Theme.of(context).textTheme.bodyMedium),
                        const SizedBox(height: 4),
                        Text(
                          'Tap to edit profile, photo or password',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).hintColor),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: Theme.of(context).colorScheme.primary),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          const AdminPreferencesPanel(),
          const SizedBox(height: 16),
          AdminSectionTitle(title: l10n.checkout),
          const SizedBox(height: 8),
          if (AdminPermissions.canAccessTab(user, AdminNavItem.checkout))
            AdminListRow(
              index: 3,
              title: l10n.checkout,
              subtitle: 'Scan pickup + POS sale',
              onTap: () => onNavigate?.call(AdminNavItem.checkout),
            ),
          if (AdminPermissions.canAccessTab(user, AdminNavItem.checkout)) const SizedBox(height: 16),
          const AdminSectionTitle(title: 'Your access'),
          const SizedBox(height: 10),
          AdminSoftCard(
            child: Column(
              children: [
                for (var i = 0; i < modules.length; i++) ...[
                  if (i > 0) const Divider(height: 18),
                  Row(
                    children: [
                      Icon(Icons.check_circle_rounded, size: 18, color: Theme.of(context).colorScheme.primary),
                      const SizedBox(width: 10),
                      Expanded(child: Text(modules[i], style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          AdminSoftCard(
            onTap: () => openStorefrontFromAdmin(context),
            padding: const EdgeInsets.all(16),
            child: const Row(
              children: [
                Icon(Icons.storefront_outlined, color: AdminColors.primary),
                SizedBox(width: 14),
                Expanded(child: Text('Back to Shop', style: TextStyle(fontWeight: FontWeight.w700))),
                Icon(Icons.chevron_right_rounded, color: AdminColors.primary),
              ],
            ),
          ),
          const SizedBox(height: 10),
          AdminSoftCard(
            onTap: auth.busy
                ? null
                : () async {
                    await auth.logout();
                    if (context.mounted) {
                      Navigator.of(context).pushAndRemoveUntil(
                        MaterialPageRoute(builder: (_) => const HomeShell()),
                        (_) => false,
                      );
                    }
                  },
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(Icons.logout_rounded, color: AppColors.error),
                const SizedBox(width: 14),
                Text('Sign out', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.error.withValues(alpha: auth.busy ? 0.4 : 1))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
