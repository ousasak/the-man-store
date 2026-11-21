import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/admin_navigation.dart';
import '../../l10n/l10n_extension.dart';
import '../../config/app_config.dart';
import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../models/user_model.dart';
import '../../providers/auth_provider.dart';
import '../../services/admin_notification_service.dart';
import '../../theme/admin_theme.dart';
import '../../theme/app_colors.dart';
import '../navigation/admin_bottom_nav.dart';
import 'admin_ai_sheet.dart';
import 'admin_command_items.dart';
import 'admin_notifications_sheet.dart';
import 'admin_profile_avatar.dart';

/// Admin header: logo (profile) · search · Ask AI · notifications.
class AdminToolbar extends StatefulWidget {
  const AdminToolbar({
    super.key,
    required this.user,
    this.onNavigate,
  });

  final UserModel user;
  final ValueChanged<AdminNavItem>? onNavigate;

  @override
  State<AdminToolbar> createState() => _AdminToolbarState();
}

class _AdminToolbarState extends State<AdminToolbar> {
  int _notificationBadge = 0;

  @override
  void initState() {
    super.initState();
    _loadBadge();
    _startNotificationPolling();
  }

  void _startNotificationPolling() {
    Future<void> poll() async {
      await Future.delayed(const Duration(seconds: 45));
      if (!mounted) return;
      await _loadBadge();
      poll();
    }
    poll();
  }

  Future<void> _loadBadge() async {
    try {
      final count = await AdminNotificationService(context.read<ApiClient>()).fetchUnreadCount();
      if (mounted) setState(() => _notificationBadge = count);
    } catch (_) {}
  }

  Future<void> _openNotifications() async {
    await showAdminNotificationsSheet(context, onNavigate: widget.onNavigate);
    await _loadBadge();
  }

  void _openAccount() => widget.onNavigate?.call(AdminNavItem.me);

  void _openSearch() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => _AdminSearchSheet(user: widget.user, onNavigate: widget.onNavigate),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;
    final primary = Theme.of(context).colorScheme.primary;
    final user = context.watch<AuthProvider>().user ?? widget.user;
    final firstName = user.name.trim().split(' ').first;

    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: SafeArea(
        bottom: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 8, 12, 10),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: Theme.of(context).dividerColor.withValues(alpha: 0.75))),
          ),
          child: Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: _openSearch,
                  child: Container(
                    height: 40,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).cardTheme.color ?? AdminColors.card,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Theme.of(context).dividerColor),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.search_rounded, size: 18, color: AdminColors.textSecondary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            l10n.search,
                            style: GoogleFonts.inter(fontSize: 13, color: AppColors.textMuted),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              _ToolbarIcon(
                icon: Icons.auto_awesome_rounded,
                highlight: true,
                primary: primary,
                onTap: () => showAdminAiSheet(context),
              ),
              _ToolbarIcon(
                icon: Icons.notifications_none_rounded,
                badge: _notificationBadge,
                onTap: _openNotifications,
              ),
              const SizedBox(width: 4),
              InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: _openAccount,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AdminProfileAvatar(user: user, radius: 18),
                      const SizedBox(width: 6),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 72),
                        child: Text(
                          firstName.isNotEmpty ? firstName : 'Admin',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Theme.of(context).colorScheme.onSurface,
                          ),
                        ),
                      ),
                      Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: Theme.of(context).hintColor),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ToolbarIcon extends StatelessWidget {
  const _ToolbarIcon({
    required this.icon,
    required this.onTap,
    this.highlight = false,
    this.primary,
    this.badge = 0,
  });

  final IconData icon;
  final VoidCallback onTap;
  final bool highlight;
  final Color? primary;
  final int badge;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: highlight
                ? Border.all(color: (primary ?? AdminColors.primary).withValues(alpha: 0.35))
                : Border.all(color: Theme.of(context).dividerColor.withValues(alpha: 0.5)),
            color: highlight ? (primary ?? AdminColors.primary).withValues(alpha: 0.08) : Theme.of(context).cardTheme.color,
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Icon(icon, size: 20, color: highlight ? primary : AdminColors.textSecondary),
              if (badge > 0)
                Positioned(
                  top: 7,
                  right: 7,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                    constraints: const BoxConstraints(minWidth: 14, minHeight: 14),
                    decoration: const BoxDecoration(color: AppColors.warning, shape: BoxShape.circle),
                    child: Text(
                      badge > 9 ? '9+' : '$badge',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: Colors.white, height: 1.1),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AdminSearchSheet extends StatefulWidget {
  const _AdminSearchSheet({required this.user, this.onNavigate});

  final UserModel user;
  final ValueChanged<AdminNavItem>? onNavigate;

  @override
  State<_AdminSearchSheet> createState() => _AdminSearchSheetState();
}

class _AdminSearchSheetState extends State<_AdminSearchSheet> {
  final _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _openItem(AdminCommandItem item) async {
    Navigator.pop(context);
    final user = context.read<AuthProvider>().user ?? widget.user;
    final nav = item.mobileNav;
    if (nav != null && AdminPermissions.canAccessTab(user, nav)) {
      widget.onNavigate?.call(nav);
      return;
    }
    switch (item.id) {
      case 'page-shipments':
        AdminNavigation.openShipments(context, user: user);
        return;
      case 'page-customers':
        AdminNavigation.openCustomers(context, user: user);
        return;
      case 'page-contacts':
        AdminNavigation.openContacts(context, user: user);
        return;
      case 'page-replacements':
        AdminNavigation.openReplacements(context, user: user);
        return;
      case 'page-sale-history':
        AdminNavigation.openSaleHistory(context, user: user);
        return;
      case 'page-brands':
        AdminNavigation.openBrands(context, user: user);
        return;
    }
    final uri = Uri.parse('${AppConfig.storefrontUrl}${item.path}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not open ${item.title}')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.sizeOf(context).height * 0.78;
    final results = AdminCommandItems.search(widget.user, _query.text);
    final quick = AdminCommandItems.quickActions.where((q) => results.any((r) => r.id == q.id)).toList();
    final pages = AdminCommandItems.pages.where((p) => results.any((r) => r.id == p.id)).toList();

    return SizedBox(
      height: maxH,
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: AdminColors.border, borderRadius: BorderRadius.circular(4))),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: TextField(
              controller: _query,
              autofocus: true,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Search admin — pages, actions, modules…',
                prefixIcon: Icon(Icons.search_rounded),
              ),
            ),
          ),
          Expanded(
            child: results.isEmpty
                ? Center(child: Text('No results for "${_query.text.trim()}"', style: Theme.of(context).textTheme.bodyMedium))
                : ListView(
                    padding: const EdgeInsets.only(bottom: 24),
                    children: [
                      if (quick.isNotEmpty) ...[
                        _sectionLabel(context, 'Quick actions'),
                        ...quick.map((item) => _resultTile(item)),
                      ],
                      if (pages.isNotEmpty) ...[
                        _sectionLabel(context, 'Pages'),
                        ...pages.map((item) => _resultTile(item)),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _sectionLabel(BuildContext context, String label) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
      child: Text(label.toUpperCase(), style: Theme.of(context).textTheme.labelSmall?.copyWith(letterSpacing: 0.8, color: AdminColors.textSecondary)),
    );
  }

  Widget _resultTile(AdminCommandItem item) {
    final onMobile = item.mobileNav != null && AdminPermissions.canAccessTab(widget.user, item.mobileNav!);
    return ListTile(
      leading: Icon(item.icon, color: Theme.of(context).colorScheme.primary),
      title: Text(item.title),
      subtitle: Text(item.description),
      trailing: onMobile
          ? const Icon(Icons.phone_iphone_rounded, size: 18, color: AdminColors.textSecondary)
          : const Icon(Icons.open_in_new_rounded, size: 18, color: AdminColors.textSecondary),
      onTap: () => _openItem(item),
    );
  }
}
