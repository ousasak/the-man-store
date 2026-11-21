import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_permissions.dart';
import '../../core/admin_report_period.dart';
import '../../core/api_client.dart';
import '../../l10n/l10n_extension.dart';
import '../../models/user_model.dart';
import '../../providers/admin_preferences_provider.dart';
import '../../services/admin_service.dart';
import '../../theme/admin_theme.dart';
import '../../utils/admin_context.dart';
import '../../utils/media_url.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_period_dropdown.dart';
import '../../widgets/admin/admin_report_charts.dart';
import '../../widgets/admin/admin_ui_kit.dart';
import '../../widgets/common/fs_empty_state.dart';
import '../../widgets/product_image.dart';

class AdminReportsScreen extends StatefulWidget {
  const AdminReportsScreen({super.key, required this.user, this.embedded = false});

  final UserModel user;
  final bool embedded;

  @override
  State<AdminReportsScreen> createState() => _AdminReportsScreenState();
}

class _AdminReportsScreenState extends State<AdminReportsScreen> {
  AdminDashboardStats? _dash;
  AdminDashboardStats? _prevDash;
  List<SalesDayRow> _sales = [];
  List<TopProductRow> _topProducts = [];
  ProductAnalyticsData? _productAnalytics;
  CategorySalesData? _categorySales;
  OrderAnalyticsData? _orderAnalytics;
  ChannelSalesData? _channelSales;
  StockAnalyticsData? _stockAnalytics;
  AdminReportPeriod _period = AdminReportPeriod.defaultPeriod;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<T> _safe<T>(Future<T> future, T fallback) async {
    try {
      return await future;
    } catch (_) {
      return fallback;
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final service = AdminService(context.read<ApiClient>());
    final prevPeriod = _period.previousPeriod();
    try {
      final results = await Future.wait([
        service.fetchDashboard(period: _period),
        _safe(
          service.fetchDashboard(period: prevPeriod),
          AdminDashboardStats(
            totalRevenue: 0,
            todayRevenue: 0,
            totalOrders: 0,
            pendingOrders: 0,
            totalProducts: 0,
            lowStockProducts: 0,
            totalCustomers: 0,
          ),
        ),
        _safe(service.fetchSales(period: _period), <SalesDayRow>[]),
        _safe(service.fetchTopProducts(limit: 20), <TopProductRow>[]),
        _safe(
          service.fetchProductAnalyticsData(),
          ProductAnalyticsData(totalProducts: 0, byCategory: [], byCountry: []),
        ),
        _safe(
          service.fetchCategorySalesData(period: _period),
          CategorySalesData(totalRevenue: 0, totalUnits: 0, revenueByCategory: [], topCategories: []),
        ),
        _safe(
          service.fetchOrderAnalyticsData(period: _period),
          OrderAnalyticsData(totalOrders: 0, byStatus: [], byCategory: []),
        ),
        _safe(service.fetchChannelSales(period: _period), ChannelSalesData(channels: [])),
        _safe(
          service.fetchStockAnalytics(period: _period),
          StockAnalyticsData(totalStock: 0, byLabel: [], compareYears: []),
        ),
      ]);
      if (!mounted) return;
      setState(() {
        _dash = results[0] as AdminDashboardStats;
        _prevDash = results[1] as AdminDashboardStats;
        _sales = results[2] as List<SalesDayRow>;
        _topProducts = results[3] as List<TopProductRow>;
        _productAnalytics = results[4] as ProductAnalyticsData;
        _categorySales = results[5] as CategorySalesData;
        _orderAnalytics = results[6] as OrderAnalyticsData;
        _channelSales = results[7] as ChannelSalesData;
        _stockAnalytics = results[8] as StockAnalyticsData;
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = context.read<ApiClient>().apiMessage(e);
        _loading = false;
      });
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

  Color _channelColor(String channel) {
    return switch (channel) {
      'pos' => AdminColors.accent,
      'storefront' => const Color(0xFF5B8DEF),
      'replacement' => AdminColors.warning,
      _ => AdminColors.textSecondary,
    };
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;

    if (!AdminPermissions.has(widget.user, 'reports', 'view')) {
      return AdminTabScaffold(
        title: l10n.reports,
        child: AdminAccessDenied(title: 'Reports access denied'),
      );
    }

    final primary = Theme.of(context).colorScheme.primary;
    final fmt = AdminFmt.of(context);
    final chartStyle = context.watch<AdminPreferencesProvider>().chartStyle;

    if (_loading) {
      return AdminTabScaffold(
        title: l10n.reports,
        subtitle: l10n.analyticsPeriod(_period.label),
        trailing: AdminPeriodDropdown(value: _period, onChanged: _setPeriod),
        child: Center(child: CircularProgressIndicator(color: primary)),
      );
    }

    if (_error != null) {
      return AdminTabScaffold(
        title: l10n.reports,
        subtitle: l10n.analyticsPeriod(_period.label),
        trailing: AdminPeriodDropdown(value: _period, onChanged: _setPeriod),
        child: FsEmptyState(
          icon: Icons.bar_chart_rounded,
          title: 'Could not load reports',
          subtitle: _error,
          actionLabel: l10n.retry,
          onAction: _load,
        ),
      );
    }

    final dash = _dash!;
    final prev = _prevDash!;
    final productAnalytics = _productAnalytics!;
    final categorySales = _categorySales!;
    final orderAnalytics = _orderAnalytics!;
    final channelSales = _channelSales!;
    final stockAnalytics = _stockAnalytics!;
    final chartValues = _sales.map((r) => r.revenue).toList();
    final totalRevenue = _sales.fold(0.0, (s, r) => s + r.revenue);
    final catalogueTotal = productAnalytics.totalProducts > 0 ? productAnalytics.totalProducts : dash.totalProducts;
    final orderTotal = orderAnalytics.totalOrders > 0 ? orderAnalytics.totalOrders : dash.totalOrders;

    final revenueTrend = TrendDelta(current: dash.totalRevenue, previous: prev.totalRevenue);
    final ordersTrend = TrendDelta(current: orderTotal.toDouble(), previous: prev.totalOrders.toDouble());
    final customersTrend = TrendDelta(current: dash.totalCustomers.toDouble(), previous: prev.totalCustomers.toDouble());
    final channelTotal = channelSales.channels.fold(0.0, (s, c) => s + c.revenue);

    return AdminTabScaffold(
      title: l10n.reports,
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
                  title: 'Revenue',
                  value: fmt.usd(dash.totalRevenue),
                  trend: revenueTrend,
                  icon: Icons.payments_outlined,
                  accentIndex: 0,
                ),
                AdminTrendKpiCard(
                  title: 'Orders',
                  value: fmt.formatNum(orderTotal),
                  trend: ordersTrend,
                  icon: Icons.receipt_long_outlined,
                  accentIndex: 1,
                ),
                AdminTrendKpiCard(
                  title: 'Catalog',
                  value: fmt.formatNum(catalogueTotal),
                  trend: TrendDelta(current: catalogueTotal.toDouble(), previous: prev.totalProducts.toDouble()),
                  icon: Icons.inventory_2_outlined,
                  accentIndex: 2,
                ),
                AdminTrendKpiCard(
                  title: 'Customers',
                  value: fmt.formatNum(dash.totalCustomers),
                  trend: customersTrend,
                  icon: Icons.people_outline,
                  accentIndex: 3,
                ),
              ],
            ),
            const SizedBox(height: 14),
            AdminReportPanel(
              title: 'Daily revenue',
              subtitle: '${_period.label} · net settled sales',
              icon: Icons.show_chart_rounded,
              accentColor: primary,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (chartValues.isNotEmpty)
                    chartStyle == AdminChartStyle.bar
                        ? AdminBarChart(values: chartValues, color: primary, height: 190)
                        : AdminLineChart(values: chartValues, lineColor: primary, height: 190)
                  else
                    const SizedBox(height: 100, child: Center(child: Text('No sales in this period'))),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Text('Period total', style: Theme.of(context).textTheme.bodySmall),
                      const Spacer(),
                      Text(
                        fmt.usd(totalRevenue),
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800, color: primary),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            AdminReportPanel(
              title: 'Payment method',
              subtitle: 'Pay now (KHQR) vs COD courier',
              icon: Icons.account_balance_wallet_outlined,
              accentColor: primary,
              child: Column(
                children: [
                  _PaymentMethodRow(
                    label: 'Pay now · KHQR',
                    orders: dash.prepaidOrders,
                    revenue: dash.prepaidRevenue,
                    hint: 'Paid online',
                    color: const Color(0xFF2563EB),
                    fmt: fmt,
                  ),
                  const SizedBox(height: 10),
                  _PaymentMethodRow(
                    label: 'COD · Courier',
                    orders: dash.codOrders,
                    revenue: dash.codRevenue,
                    hint: dash.codUnpaidOrders > 0
                        ? '${fmt.formatNum(dash.codUnpaidOrders)} to collect'
                        : 'Collected / settled',
                    color: const Color(0xFFEA580C),
                    fmt: fmt,
                  ),
                  if (orderAnalytics.byPayment.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    AdminDonutChart(
                      size: 140,
                      showLegend: false,
                      centerLabel: 'ORDERS',
                      centerValue: fmt.formatNum(
                        orderAnalytics.byPayment.fold<int>(0, (s, e) => s + e.count),
                      ),
                      slices: [
                        for (final s in orderAnalytics.byPayment)
                          (label: s.name, value: s.count, percentage: s.percentage),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            if (channelSales.channels.isNotEmpty) ...[
              const SizedBox(height: 14),
              AdminReportPanel(
                title: 'Sales by channel',
                subtitle: 'POS vs Web · ${fmt.usd(channelTotal)}',
                icon: Icons.storefront_outlined,
                accentColor: const Color(0xFF5B8DEF),
                child: Column(
                  children: [
                    AdminSegmentStrip(
                      segments: [
                        for (final c in channelSales.channels)
                          (label: c.label, value: c.revenue, color: _channelColor(c.channel)),
                      ],
                    ),
                    const SizedBox(height: 16),
                    AdminChannelSplitCards(
                      valueFormatter: fmt.usd,
                      channels: [
                        for (final c in channelSales.channels)
                          (label: c.label, revenue: c.revenue, orders: c.orders, color: _channelColor(c.channel)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
            if (stockAnalytics.byLabel.isNotEmpty) ...[
              const SizedBox(height: 14),
              AdminReportPanel(
                title: 'Stock by label',
                subtitle: '${fmt.formatNum(stockAnalytics.totalStock)} units · New / Old & more',
                icon: Icons.warehouse_outlined,
                accentColor: AdminColors.warning,
                child: AdminHorizontalBarChart(
                  items: [for (final l in stockAnalytics.byLabel) (label: l.name, value: l.count.toDouble())],
                  valueFormatter: (v) => fmt.formatNum(v.round()),
                ),
              ),
            ],
            if (categorySales.revenueByCategory.isNotEmpty) ...[
              const SizedBox(height: 14),
              AdminReportPanel(
                title: 'Revenue mix',
                subtitle: fmt.usd(categorySales.totalRevenue),
                icon: Icons.pie_chart_outline_rounded,
                child: AdminDonutChart(
                  size: 155,
                  compactLegend: true,
                  centerLabel: 'REVENUE',
                  centerValue: fmt.usd(categorySales.totalRevenue),
                  slices: [
                    for (final c in categorySales.revenueByCategory)
                      (label: c.name, value: c.revenue.round(), percentage: c.percentage),
                  ],
                ),
              ),
            ],
            if (categorySales.topCategories.isNotEmpty) ...[
              const SizedBox(height: 14),
              AdminReportPanel(
                title: 'Top categories',
                subtitle: 'Units sold & revenue',
                icon: Icons.leaderboard_outlined,
                accentColor: AdminColors.positiveBright,
                child: AdminRankedBarList(
                  items: [
                    for (final c in categorySales.topCategories)
                      (
                        title: c.name,
                        subtitle: '${fmt.formatNum(c.unitsSold)} units · ${c.percentage.toStringAsFixed(1)}%',
                        value: c.revenue,
                        displayValue: fmt.usd(c.revenue),
                        leading: null,
                      ),
                  ],
                ),
              ),
            ],
            if (productAnalytics.byCategory.isNotEmpty) ...[
              const SizedBox(height: 14),
              AdminReportPanel(
                title: 'Catalogue by category',
                subtitle: '${fmt.formatNum(catalogueTotal)} products',
                icon: Icons.category_outlined,
                child: AdminDonutChart(
                  size: 150,
                  compactLegend: true,
                  centerLabel: 'ITEMS',
                  centerValue: fmt.formatNum(catalogueTotal),
                  slices: [
                    for (final c in productAnalytics.byCategory)
                      (label: c.name, value: c.count, percentage: c.percentage),
                  ],
                ),
              ),
            ],
            if (productAnalytics.byCountry.isNotEmpty) ...[
              const SizedBox(height: 14),
              AdminReportPanel(
                title: 'Catalogue by country',
                subtitle: 'Product origin distribution',
                icon: Icons.public_outlined,
                accentColor: const Color(0xFF8B5CF6),
                child: Column(
                  children: [
                    AdminLabeledBarChart(
                      items: [
                        for (final c in productAnalytics.byCountry)
                          (label: c.name, value: c.count.toDouble()),
                      ],
                    ),
                    const SizedBox(height: 10),
                    AdminChartLegendRow(
                      items: [
                        for (var i = 0; i < productAnalytics.byCountry.length && i < 5; i++)
                          (
                            label: productAnalytics.byCountry[i].name,
                            color: AdminColors.chartPalette[i % AdminColors.chartPalette.length],
                            value: fmt.formatNum(productAnalytics.byCountry[i].count),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
            if (orderAnalytics.byStatus.isNotEmpty) ...[
              const SizedBox(height: 14),
              AdminReportPanel(
                title: 'Orders by status',
                subtitle: '${fmt.formatNum(orderTotal)} total',
                icon: Icons.pending_actions_outlined,
                child: Column(
                  children: [
                    AdminDonutChart(
                      size: 145,
                      showLegend: false,
                      centerLabel: 'ORDERS',
                      centerValue: fmt.formatNum(orderTotal),
                      slices: [
                        for (final s in orderAnalytics.byStatus)
                          (label: s.name, value: s.count, percentage: s.percentage),
                      ],
                    ),
                    const SizedBox(height: 8),
                    AdminChartLegendRow(
                      items: [
                        for (var i = 0; i < orderAnalytics.byStatus.length; i++)
                          (
                            label: orderAnalytics.byStatus[i].name,
                            color: AdminColors.chartPalette[i % AdminColors.chartPalette.length],
                            value: fmt.formatNum(orderAnalytics.byStatus[i].count),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
            if (orderAnalytics.byCategory.isNotEmpty) ...[
              const SizedBox(height: 14),
              AdminReportPanel(
                title: 'Orders by category',
                subtitle: 'Volume by product type',
                icon: Icons.shopping_bag_outlined,
                accentColor: AdminColors.info,
                child: AdminHorizontalBarChart(
                  items: [
                    for (final s in orderAnalytics.byCategory)
                      (label: s.name, value: s.count.toDouble()),
                  ],
                  valueFormatter: (v) => fmt.formatNum(v.round()),
                ),
              ),
            ],
            const SizedBox(height: 14),
            AdminReportPanel(
              title: 'Top products',
              subtitle: _topProducts.isEmpty ? 'No sales yet' : 'Best sellers in period',
              icon: Icons.star_outline_rounded,
              accentColor: AdminColors.accent,
              child: _topProducts.isEmpty
                  ? const Text('No product sales yet')
                  : AdminRankedBarList(
                      items: [
                        for (final row in _topProducts)
                          (
                            title: row.name,
                            subtitle: '${fmt.formatNum(row.totalSold)} sold',
                            value: row.totalRevenue,
                            displayValue: fmt.usd(row.totalRevenue),
                            leading: _productThumb(row, primary),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget? _productThumb(TopProductRow row, Color primary) {
    final imageUrl = resolveMediaUrl(row.imageUrl);
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: SizedBox(
        width: 32,
        height: 32,
        child: imageUrl.isNotEmpty
            ? ProductImage(imageUrl: imageUrl, fit: BoxFit.cover)
            : ColoredBox(
                color: primary.withValues(alpha: 0.1),
                child: Icon(Icons.image_outlined, size: 16, color: primary.withValues(alpha: 0.45)),
              ),
      ),
    );
  }
}

class _PaymentMethodRow extends StatelessWidget {
  const _PaymentMethodRow({
    required this.label,
    required this.orders,
    required this.revenue,
    required this.hint,
    required this.color,
    required this.fmt,
  });

  final String label;
  final int orders;
  final double revenue;
  final String hint;
  final Color color;
  final AdminFmt fmt;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text(hint, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(fmt.usd(revenue), style: TextStyle(fontWeight: FontWeight.w800, color: color)),
              Text('${fmt.formatNum(orders)} orders', style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ],
      ),
    );
  }
}
