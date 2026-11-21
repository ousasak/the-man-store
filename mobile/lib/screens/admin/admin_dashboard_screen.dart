import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_navigation.dart';
import '../../core/admin_permissions.dart';
import '../../core/admin_report_period.dart';
import '../../core/api_client.dart';
import '../../l10n/admin_l10n.dart';
import '../../l10n/l10n_extension.dart';
import '../../models/user_model.dart';
import '../../providers/admin_preferences_provider.dart';
import '../../services/admin_service.dart';
import '../../theme/admin_theme.dart';
import '../../utils/admin_context.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_period_dropdown.dart';
import '../../widgets/admin/admin_report_charts.dart';
import '../../widgets/admin/admin_ui_kit.dart';
import '../../widgets/navigation/admin_bottom_nav.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({
    super.key,
    required this.user,
    this.onNavigate,
    this.onStatsLoaded,
  });

  final UserModel user;
  final ValueChanged<AdminNavItem>? onNavigate;
  final ValueChanged<AdminDashboardStats?>? onStatsLoaded;

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  SuperAdminStats? _superStats;
  AdminDashboardStats? _stats;
  AdminDashboardStats? _prevStats;
  List<double> _sparkline = [];
  List<CategorySlice> _categories = [];
  AdminReportPeriod _period = AdminReportPeriod.defaultPeriod;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final service = AdminService(context.read<ApiClient>());
    final prevPeriod = _period.previousPeriod();
    try {
      final stats = await service.fetchDashboard(period: _period);
      AdminDashboardStats? prev;
      try {
        prev = await service.fetchDashboard(period: prevPeriod);
      } catch (_) {
        prev = null;
      }
      final sales = await service.fetchSales(period: _period);
      SuperAdminStats? superStats;
      if (widget.user.isSuperAdmin) {
        superStats = await service.fetchSuperAdminStats();
      }
      List<CategorySlice> cats = [];
      try {
        cats = await service.fetchProductAnalytics();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _stats = stats;
        _prevStats = prev;
        _superStats = superStats;
        _sparkline = sales.map((r) => r.revenue).toList();
        _categories = cats;
        _loading = false;
      });
      widget.onStatsLoaded?.call(stats);
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = context.read<ApiClient>().apiMessage(e);
        _loading = false;
      });
      widget.onStatsLoaded?.call(null);
    }
  }

  void _setPeriod(AdminReportPeriod period) {
    if (_period.key == period.key &&
        _period.customFrom == period.customFrom &&
        _period.customTo == period.customTo) {
      return;
    }
    setState(() => _period = period);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;

    if (!AdminPermissions.has(widget.user, 'reports', 'view')) {
      return AdminTabScaffold(
        title: l10n.dashboard,
        child: AdminAccessDenied(title: 'Dashboard access denied'),
      );
    }

    final primary = Theme.of(context).colorScheme.primary;
    final fmt = AdminFmt.of(context);
    final chartStyle = context.watch<AdminPreferencesProvider>().chartStyle;

    if (_loading && _stats == null) {
      return AdminTabScaffold(
        title: l10n.dashboard,
        subtitle: l10n.analyticsPeriod(_period.label),
        trailing: AdminPeriodDropdown(value: _period, onChanged: _setPeriod),
        child: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null && _stats == null) {
      return AdminTabScaffold(
        title: l10n.dashboard,
        subtitle: l10n.analyticsPeriod(_period.label),
        trailing: AdminPeriodDropdown(value: _period, onChanged: _setPeriod),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: Text(l10n.retry)),
            ],
          ),
        ),
      );
    }

    final stats = _stats!;
    final prev = _prevStats;
    final orderTrend = TrendDelta(
      current: stats.totalOrders.toDouble(),
      previous: (prev?.totalOrders ?? 0).toDouble(),
    );
    final revenueTrend = TrendDelta(
      current: stats.totalRevenue,
      previous: prev?.totalRevenue ?? 0,
    );
    final customersTrend = TrendDelta(
      current: stats.totalCustomers.toDouble(),
      previous: (prev?.totalCustomers ?? 0).toDouble(),
    );
    final catalogTrend = TrendDelta(
      current: stats.totalProducts.toDouble(),
      previous: (prev?.totalProducts ?? 0).toDouble(),
    );

    return AdminTabScaffold(
      title: l10n.dashboard,
      subtitle: l10n.analyticsPeriod(_period.label),
      trailing: AdminPeriodDropdown(value: _period, onChanged: _setPeriod),
      child: RefreshIndicator(
        color: primary,
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 100),
          children: [
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.05,
              children: [
                AdminTrendKpiCard(
                  title: l10n.revenue,
                  value: fmt.usd(stats.totalRevenue),
                  trend: revenueTrend,
                  icon: Icons.payments_outlined,
                  accentIndex: 0,
                ),
                AdminTrendKpiCard(
                  title: l10n.orders,
                  value: fmt.formatNum(stats.totalOrders),
                  trend: orderTrend,
                  icon: Icons.receipt_long_outlined,
                  accentIndex: 1,
                ),
                AdminTrendKpiCard(
                  title: l10n.catalog,
                  value: fmt.formatNum(stats.totalProducts),
                  trend: catalogTrend,
                  icon: Icons.inventory_2_outlined,
                  accentIndex: 2,
                ),
                AdminTrendKpiCard(
                  title: l10n.customers,
                  value: fmt.formatNum(stats.totalCustomers),
                  trend: customersTrend,
                  icon: Icons.people_outline,
                  accentIndex: 3,
                ),
              ],
            ),
            const SizedBox(height: 14),
            AdminReportPanel(
              title: l10n.dailyRevenue,
              subtitle: '${_period.label} · ${l10n.netSettledSales.toLowerCase()}',
              icon: Icons.show_chart_rounded,
              accentColor: primary,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_sparkline.isNotEmpty)
                    chartStyle == AdminChartStyle.bar
                        ? AdminBarChart(values: _sparkline, color: primary, height: 190)
                        : AdminLineChart(values: _sparkline, lineColor: primary, height: 190)
                  else
                    const SizedBox(height: 100, child: Center(child: Text('No sales in this period'))),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Text(l10n.today, style: Theme.of(context).textTheme.bodySmall),
                      const Spacer(),
                      Text(
                        fmt.usd(stats.todayRevenue),
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800, color: primary),
                      ),
                    ],
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => widget.onNavigate?.call(AdminNavItem.reports),
                      child: Text(l10n.fullReports),
                    ),
                  ),
                ],
              ),
            ),
            if (_categories.isNotEmpty) ...[
              const SizedBox(height: 14),
              AdminReportPanel(
                title: l10n.productsByCategory,
                subtitle: l10n.shareOfCatalogue,
                icon: Icons.category_outlined,
                child: AdminDonutChart(
                  size: 150,
                  compactLegend: true,
                  centerLabel: 'ITEMS',
                  centerValue: fmt.formatNum(stats.totalProducts),
                  slices: [
                    for (final c in _categories)
                      (label: c.name, value: c.count, percentage: c.percentage),
                  ],
                ),
              ),
            ],
            if (_superStats != null) ...[
              const SizedBox(height: 14),
              AdminSoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.admin_panel_settings_outlined, size: 18, color: primary),
                        const SizedBox(width: 8),
                        Text('Superadmin overview', style: Theme.of(context).textTheme.titleSmall),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: _SuperStat(label: 'Users', value: fmt.formatNum(_superStats!.totalUsers))),
                        Expanded(child: _SuperStat(label: 'Admins', value: fmt.formatNum(_superStats!.totalAdmins))),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(child: _SuperStat(label: l10n.customers, value: fmt.formatNum(_superStats!.totalCustomers))),
                        Expanded(child: _SuperStat(label: 'Active', value: fmt.formatNum(_superStats!.activeUsers))),
                      ],
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 14),
            AdminSectionTitle(title: l10n.quickActions),
            const SizedBox(height: 10),
            _QuickActions(user: widget.user, onNavigate: widget.onNavigate),
          ],
        ),
      ),
    );
  }
}

class _SuperStat extends StatelessWidget {
  const _SuperStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelLarge),
          Text(value, style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.user, this.onNavigate});

  final UserModel user;
  final ValueChanged<AdminNavItem>? onNavigate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;
    final items = <(AdminQuickActionId, IconData)>[
      if (AdminPermissions.canAccessTab(user, AdminNavItem.checkout))
        (AdminQuickActionId.checkout, Icons.point_of_sale_rounded),
      if (AdminPermissions.canAccessTab(user, AdminNavItem.orders))
        (AdminQuickActionId.orders, Icons.receipt_long_rounded),
      if (AdminPermissions.canAccessTab(user, AdminNavItem.payments))
        (AdminQuickActionId.payments, Icons.payments_rounded),
      if (AdminPermissions.canAccessTab(user, AdminNavItem.products))
        (AdminQuickActionId.products, Icons.inventory_2_rounded),
      if (AdminPermissions.has(user, 'shipments', 'view'))
        (AdminQuickActionId.shipments, Icons.local_shipping_outlined),
      if (AdminPermissions.has(user, 'customers', 'view'))
        (AdminQuickActionId.customers, Icons.people_outline),
      if (AdminPermissions.has(user, 'contacts', 'view'))
        (AdminQuickActionId.contacts, Icons.mail_outline),
      if (AdminPermissions.has(user, 'replacements', 'view'))
        (AdminQuickActionId.replacements, Icons.sync_alt_rounded),
      if (AdminPermissions.has(user, 'sale_history', 'view') || AdminPermissions.canAccessTab(user, AdminNavItem.checkout))
        (AdminQuickActionId.saleHistory, Icons.history_rounded),
      (AdminQuickActionId.account, Icons.person_outline_rounded),
    ];

    if (items.isEmpty) return const SizedBox.shrink();

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.2,
      children: [
        for (var i = 0; i < items.length; i++)
          AdminQuickAction(
            index: i,
            icon: items[i].$2,
            label: l10n.quickActionLabel(items[i].$1),
            color: AdminColors.chartPalette[i % AdminColors.chartPalette.length],
            onTap: () => _tap(context, items[i].$1),
          ),
      ],
    );
  }

  void _tap(BuildContext context, AdminQuickActionId id) {
    switch (id) {
      case AdminQuickActionId.shipments:
        AdminNavigation.openShipments(context, user: user);
      case AdminQuickActionId.customers:
        AdminNavigation.openCustomers(context, user: user);
      case AdminQuickActionId.contacts:
        AdminNavigation.openContacts(context, user: user);
      case AdminQuickActionId.replacements:
        AdminNavigation.openReplacements(context, user: user);
      case AdminQuickActionId.saleHistory:
        AdminNavigation.openSaleHistory(context, user: user);
      case AdminQuickActionId.checkout:
        onNavigate?.call(AdminNavItem.checkout);
      case AdminQuickActionId.orders:
        onNavigate?.call(AdminNavItem.orders);
      case AdminQuickActionId.payments:
        onNavigate?.call(AdminNavItem.payments);
      case AdminQuickActionId.products:
        onNavigate?.call(AdminNavItem.products);
      case AdminQuickActionId.account:
        onNavigate?.call(AdminNavItem.me);
    }
  }
}
