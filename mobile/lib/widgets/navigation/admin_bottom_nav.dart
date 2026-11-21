import 'package:flutter/material.dart';

import '../../l10n/admin_l10n.dart';
import '../../l10n/l10n_extension.dart';
import '../../theme/admin_theme.dart';
import '../../theme/app_colors.dart';

enum AdminNavItem {
  home,
  reports,
  scan,
  checkout,
  orders,
  payments,
  products,
  me,
}

class AdminBottomNav extends StatelessWidget {
  const AdminBottomNav({
    super.key,
    required this.selected,
    required this.onSelect,
    required this.visibleTabs,
    this.pendingOrders = 0,
  });

  final AdminNavItem selected;
  final ValueChanged<AdminNavItem> onSelect;
  final List<AdminNavItem> visibleTabs;
  final int pendingOrders;

  static const _labels = {
    AdminNavItem.home: 'Dashboard',
    AdminNavItem.reports: 'Reports',
    AdminNavItem.scan: 'Scan',
    AdminNavItem.orders: 'Orders',
    AdminNavItem.payments: 'Payments',
  };

  static const _icons = {
    AdminNavItem.home: Icons.grid_view_rounded,
    AdminNavItem.reports: Icons.bar_chart_rounded,
    AdminNavItem.scan: Icons.qr_code_scanner_rounded,
    AdminNavItem.orders: Icons.receipt_long_outlined,
    AdminNavItem.payments: Icons.payments_outlined,
  };

  bool get _hasCenterScan => visibleTabs.contains(AdminNavItem.scan);

  List<AdminNavItem> get _sideTabs {
    if (!_hasCenterScan) return visibleTabs;
    return visibleTabs.where((t) => t != AdminNavItem.scan).toList();
  }

  static AdminNavItemKey _itemKey(AdminNavItem item) {
    return switch (item) {
      AdminNavItem.home => AdminNavItemKey.home,
      AdminNavItem.reports => AdminNavItemKey.reports,
      AdminNavItem.scan => AdminNavItemKey.scan,
      AdminNavItem.orders => AdminNavItemKey.orders,
      AdminNavItem.payments => AdminNavItemKey.payments,
      _ => AdminNavItemKey.home,
    };
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;
    final sides = _sideTabs;
    final leftCount = (sides.length / 2).ceil();
    final left = sides.take(leftCount).toList();
    final right = sides.skip(leftCount).toList();
    final primary = Theme.of(context).colorScheme.primary;
    final cardColor = Theme.of(context).cardTheme.color ?? AdminColors.card;
    final borderColor = Theme.of(context).dividerColor;

    return Container(
      decoration: BoxDecoration(
        color: cardColor.withValues(alpha: 0.98),
        border: Border(top: BorderSide(color: borderColor.withValues(alpha: 0.9))),
        boxShadow: AdminColors.navShadow,
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: _hasCenterScan ? 76 : 64,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.bottomCenter,
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(8, 6, 8, _hasCenterScan ? 4 : 6),
                child: Row(
                  children: [
                    ...left.map((item) => Expanded(child: _cell(item, primary, l10n))),
                    if (_hasCenterScan) const SizedBox(width: 52),
                    ...right.map((item) => Expanded(child: _cell(item, primary, l10n))),
                  ],
                ),
              ),
              if (_hasCenterScan)
                Positioned(
                  top: 0,
                  child: _ScanFab(
                    active: selected == AdminNavItem.scan,
                    primary: primary,
                    onTap: () => onSelect(AdminNavItem.scan),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _cell(AdminNavItem item, Color primary, AdminL10n l10n) {
    final active = selected == item;
    final badge = item == AdminNavItem.orders && pendingOrders > 0;
    final label = _labels.containsKey(item) ? l10n.navLabel(_itemKey(item)) : item.name;
    return _NavCell(
      label: label,
      icon: _icons[item]!,
      active: active,
      primary: primary,
      showDot: badge,
      onTap: () => onSelect(item),
    );
  }
}

class _ScanFab extends StatelessWidget {
  const _ScanFab({required this.active, required this.primary, required this.onTap});

  final bool active;
  final Color primary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: primary,
          shape: BoxShape.circle,
          boxShadow: AdminColors.navShadow,
          border: Border.all(
            color: active ? primary.withValues(alpha: 0.5) : Colors.white,
            width: 2,
          ),
        ),
        child: const Icon(Icons.qr_code_scanner_rounded, color: Colors.white, size: 24),
      ),
    );
  }
}

class _NavCell extends StatelessWidget {
  const _NavCell({
    required this.label,
    required this.icon,
    required this.active,
    required this.primary,
    required this.onTap,
    this.showDot = false,
  });

  final String label;
  final IconData icon;
  final bool active;
  final Color primary;
  final VoidCallback onTap;
  final bool showDot;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).brightness == Brightness.dark ? const Color(0xFF94A3B8) : AppColors.textMuted;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: active ? primary.withValues(alpha: 0.14) : Theme.of(context).cardTheme.color ?? AdminColors.card,
                  shape: BoxShape.circle,
                  border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: active ? 0 : 0.8)),
                ),
                child: Icon(icon, size: 18, color: active ? primary : muted),
              ),
              if (showDot)
                Positioned(
                  top: 2,
                  right: 2,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(color: AppColors.warning, shape: BoxShape.circle),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  color: active ? primary : muted,
                ),
          ),
        ],
      ),
    );
  }
}
