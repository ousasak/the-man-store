import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../theme/admin_theme.dart';
import '../../utils/admin_context.dart';

/// Vertical bar chart with short x-axis labels — catalogue by country.
class AdminLabeledBarChart extends StatelessWidget {
  const AdminLabeledBarChart({
    super.key,
    required this.items,
    this.height = 180,
    this.maxBars = 6,
  });

  final List<({String label, double value})> items;
  final double height;
  final int maxBars;

  @override
  Widget build(BuildContext context) {
    final surface = AdminSurface.of(context);
    final visible = items.take(maxBars).toList();
    if (visible.isEmpty) {
      return SizedBox(height: height, child: const Center(child: Text('No data')));
    }

    final maxY = visible.map((e) => e.value).reduce((a, b) => a > b ? a : b);

    return SizedBox(
      height: height,
      child: BarChart(
        BarChartData(
          maxY: maxY * 1.2,
          gridData: FlGridData(
            show: true,
            drawVerticalLine: false,
            horizontalInterval: maxY > 0 ? maxY / 3 : 1,
            getDrawingHorizontalLine: (_) => FlLine(color: surface.border.withValues(alpha: 0.5), strokeWidth: 1),
          ),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 28,
                getTitlesWidget: (value, meta) {
                  final i = value.toInt();
                  if (i < 0 || i >= visible.length) return const SizedBox.shrink();
                  final short = visible[i].label.length > 4 ? visible[i].label.substring(0, 4) : visible[i].label;
                  return Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(short, style: GoogleFonts.inter(fontSize: 10, fontWeight: FontWeight.w600, color: surface.textSecondary)),
                  );
                },
              ),
            ),
          ),
          barGroups: [
            for (var i = 0; i < visible.length; i++)
              BarChartGroupData(
                x: i,
                barRods: [
                  BarChartRodData(
                    toY: visible[i].value,
                    width: 14,
                    color: AdminColors.chartPalette[i % AdminColors.chartPalette.length],
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                  ),
                ],
              ),
          ],
        ),
        duration: const Duration(milliseconds: 700),
        curve: Curves.easeOutCubic,
      ),
    );
  }
}

/// Panel wrapper for report sections — accent stripe, icon, title.
class AdminReportPanel extends StatelessWidget {
  const AdminReportPanel({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.accentColor,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(18, 16, 18, 18),
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final Color? accentColor;
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final accent = accentColor ?? AdminColors.accent;
    final surface = AdminSurface.of(context);
    return Container(
      decoration: BoxDecoration(
        color: surface.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: surface.border.withValues(alpha: 0.7)),
        boxShadow: surface.isDark ? null : AdminColors.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(height: 3, color: accent),
          Padding(
            padding: padding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (icon != null) ...[
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: accent.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(icon, size: 18, color: accent),
                      ),
                      const SizedBox(width: 12),
                    ],
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: surface.textPrimary,
                                ),
                          ),
                          if (subtitle != null) ...[
                            const SizedBox(height: 2),
                            Text(subtitle!, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: surface.textSecondary)),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                child,
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Hero summary at top of reports.
class AdminReportHero extends StatelessWidget {
  const AdminReportHero({
    super.key,
    required this.headline,
    required this.trendText,
    required this.trendUp,
    required this.periodControl,
  });

  final String headline;
  final String trendText;
  final bool? trendUp;
  final Widget periodControl;

  @override
  Widget build(BuildContext context) {
    final trendColor = trendUp == null
        ? AdminColors.textSecondary
        : trendUp!
            ? AdminColors.positiveBright
            : AdminColors.textSecondary;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AdminColors.primarySurface,
            AdminColors.card,
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AdminColors.border.withValues(alpha: 0.6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'OVERVIEW',
                      style: GoogleFonts.inter(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.4,
                        color: AdminColors.accent,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      headline,
                      style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w800, height: 1.25, color: AdminColors.textPrimary),
                    ),
                  ],
                ),
              ),
              periodControl,
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              if (trendUp != null)
                Icon(
                  trendUp! ? Icons.trending_up_rounded : Icons.trending_down_rounded,
                  size: 16,
                  color: trendColor,
                ),
              if (trendUp != null) const SizedBox(width: 4),
              Expanded(
                child: Text(
                  trendText,
                  style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w600, color: trendColor),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Compact dot legend for donuts.
class AdminChartLegendRow extends StatelessWidget {
  const AdminChartLegendRow({super.key, required this.items});

  final List<({String label, Color color, String value})> items;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final item in items)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AdminColors.canvas,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AdminColors.border.withValues(alpha: 0.8)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(width: 7, height: 7, decoration: BoxDecoration(color: item.color, shape: BoxShape.circle)),
                const SizedBox(width: 6),
                Text(item.label, style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w600)),
                const SizedBox(width: 4),
                Text(item.value, style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w700, color: item.color)),
              ],
            ),
          ),
      ],
    );
  }
}

/// Horizontal bar chart — good for countries, categories, stock labels.
class AdminHorizontalBarChart extends StatelessWidget {
  const AdminHorizontalBarChart({
    super.key,
    required this.items,
    this.maxBars = 8,
    this.valueFormatter,
  });

  final List<({String label, double value})> items;
  final int maxBars;
  final String Function(double)? valueFormatter;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const SizedBox(height: 48, child: Center(child: Text('No data')));
    }

    final visible = items.take(maxBars).toList();
    final maxVal = visible.map((e) => e.value).reduce((a, b) => a > b ? a : b);
    final fmt = valueFormatter ?? (v) => v >= 1000 ? '${(v / 1000).toStringAsFixed(1)}k' : v.toStringAsFixed(v == v.roundToDouble() ? 0 : 1);

    return Column(
      children: [
        for (var i = 0; i < visible.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _HBarRow(
            label: visible[i].label,
            value: visible[i].value,
            maxValue: maxVal,
            color: AdminColors.chartPalette[i % AdminColors.chartPalette.length],
            displayValue: fmt(visible[i].value),
          ),
        ],
      ],
    );
  }
}

class _HBarRow extends StatelessWidget {
  const _HBarRow({
    required this.label,
    required this.value,
    required this.maxValue,
    required this.color,
    required this.displayValue,
  });

  final String label;
  final double value;
  final double maxValue;
  final Color color;
  final String displayValue;

  @override
  Widget build(BuildContext context) {
    final fraction = maxValue > 0 ? (value / maxValue).clamp(0.0, 1.0) : 0.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w600),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Text(displayValue, style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w800, color: color)),
          ],
        ),
        const SizedBox(height: 5),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: fraction,
            minHeight: 8,
            backgroundColor: AdminColors.canvas,
            color: color,
          ),
        ),
      ],
    );
  }
}

/// Stacked segment strip — POS vs Web, etc.
class AdminSegmentStrip extends StatelessWidget {
  const AdminSegmentStrip({super.key, required this.segments});

  final List<({String label, double value, Color color})> segments;

  @override
  Widget build(BuildContext context) {
    final total = segments.fold(0.0, (s, e) => s + e.value);
    if (total <= 0) return const SizedBox(height: 12, child: Center(child: Text('No data')));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: SizedBox(
            height: 14,
            child: Row(
              children: [
                for (final seg in segments)
                  if (seg.value > 0)
                    Expanded(
                      flex: (seg.value / total * 1000).round().clamp(1, 1000),
                      child: Container(color: seg.color),
                    ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            for (var i = 0; i < segments.length; i++) ...[
              if (i > 0) const SizedBox(width: 16),
              Expanded(
                child: Row(
                  children: [
                    Container(width: 8, height: 8, decoration: BoxDecoration(color: segments[i].color, borderRadius: BorderRadius.circular(2))),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        segments[i].label,
                        style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w600),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

/// Ranked list with inline progress — top products / categories.
class AdminRankedBarList extends StatelessWidget {
  const AdminRankedBarList({
    super.key,
    required this.items,
    this.maxItems = 10,
  });

  final List<({String title, String? subtitle, double value, String displayValue, Widget? leading})> items;
  final int maxItems;

  @override
  Widget build(BuildContext context) {
    final surface = AdminSurface.of(context);
    final accent = Theme.of(context).colorScheme.primary;
    final visible = items.take(maxItems).toList();
    if (visible.isEmpty) return const Text('No data');

    final maxVal = visible.map((e) => e.value).reduce((a, b) => a > b ? a : b);

    return Column(
      children: [
        for (var i = 0; i < visible.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: i < 3 ? accent.withValues(alpha: 0.14) : surface.canvas,
                  borderRadius: BorderRadius.circular(7),
                ),
                child: Text(
                  '${i + 1}',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: i < 3 ? accent : surface.textSecondary,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              if (visible[i].leading != null) ...[visible[i].leading!, const SizedBox(width: 10)],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            visible[i].title,
                            style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          visible[i].displayValue,
                          style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w800, color: accent),
                        ),
                      ],
                    ),
                    if (visible[i].subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(visible[i].subtitle!, style: Theme.of(context).textTheme.bodySmall),
                    ],
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: maxVal > 0 ? (visible[i].value / maxVal).clamp(0.0, 1.0) : 0,
                        minHeight: 4,
                        backgroundColor: surface.canvas,
                        color: AdminColors.chartPalette[i % AdminColors.chartPalette.length],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

/// Channel split cards — POS / Web side by side.
class AdminChannelSplitCards extends StatelessWidget {
  const AdminChannelSplitCards({
    super.key,
    required this.channels,
    required this.valueFormatter,
  });

  final List<({String label, double revenue, int orders, Color color})> channels;
  final String Function(double) valueFormatter;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < channels.length; i++) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: channels[i].color.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: channels[i].color.withValues(alpha: 0.18)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    channels[i].label.toUpperCase(),
                    style: GoogleFonts.inter(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1, color: channels[i].color),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    valueFormatter(channels[i].revenue),
                    style: GoogleFonts.inter(fontSize: 17, fontWeight: FontWeight.w800),
                  ),
                  Text('${channels[i].orders} orders', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}
