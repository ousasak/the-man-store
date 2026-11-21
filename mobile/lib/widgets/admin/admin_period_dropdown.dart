import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/admin_report_period.dart';
import '../../theme/admin_theme.dart';
import '../../utils/admin_context.dart';

/// YouTube Studio–style period picker (quick range · year · month · custom).
class AdminPeriodDropdown extends StatefulWidget {
  const AdminPeriodDropdown({
    super.key,
    required this.value,
    required this.onChanged,
    this.alignRight = true,
  });

  final AdminReportPeriod value;
  final ValueChanged<AdminReportPeriod> onChanged;
  final bool alignRight;

  @override
  State<AdminPeriodDropdown> createState() => _AdminPeriodDropdownState();
}

class _AdminPeriodDropdownState extends State<AdminPeriodDropdown> {
  final _anchorKey = GlobalKey();
  OverlayEntry? _entry;

  @override
  void dispose() {
    _removeOverlay();
    super.dispose();
  }

  void _removeOverlay() {
    _entry?.remove();
    _entry = null;
  }

  void _toggle() {
    if (_entry != null) {
      _removeOverlay();
      return;
    }
    final box = _anchorKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    final offset = box.localToGlobal(Offset.zero);
    final size = box.size;

    _entry = OverlayEntry(
      builder: (ctx) => Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              onTap: _removeOverlay,
              behavior: HitTestBehavior.opaque,
              child: const ColoredBox(color: Colors.transparent),
            ),
          ),
          Positioned(
            left: widget.alignRight ? null : offset.dx,
            right: widget.alignRight ? MediaQuery.of(ctx).size.width - offset.dx - size.width : null,
            top: offset.dy + size.height + 6,
            width: 208,
            child: _PeriodMenu(
              value: widget.value,
              onSelect: (p) {
                _removeOverlay();
                widget.onChanged(p);
              },
              onCustom: () async {
                _removeOverlay();
                final range = await _pickCustomRange(context);
                if (range != null && mounted) {
                  widget.onChanged(range);
                }
              },
            ),
          ),
        ],
      ),
    );
    Overlay.of(context).insert(_entry!);
  }

  static Future<AdminReportPeriod?> _pickCustomRange(BuildContext context) async {
    final now = DateTime.now();
    final from = await showDatePicker(
      context: context,
      initialDate: now.subtract(const Duration(days: 28)),
      firstDate: DateTime(2000),
      lastDate: now,
      helpText: 'From date',
    );
    if (from == null || !context.mounted) return null;

    final to = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: from,
      lastDate: now,
      helpText: 'To date',
    );
    if (to == null) return null;

    return AdminReportPeriod('custom', customFrom: from, customTo: to);
  }

  @override
  Widget build(BuildContext context) {
    final surface = AdminSurface.of(context);
    return KeyedSubtree(
      key: _anchorKey,
      child: Material(
        color: surface.canvas,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: _toggle,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: surface.border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.calendar_today_rounded, size: 14, color: surface.textSecondary),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    widget.value.label,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: surface.textPrimary,
                        ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 4),
                Icon(Icons.expand_more_rounded, size: 18, color: AdminColors.textSecondary),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PeriodMenu extends StatelessWidget {
  const _PeriodMenu({
    required this.value,
    required this.onSelect,
    required this.onCustom,
  });

  final AdminReportPeriod value;
  final ValueChanged<AdminReportPeriod> onSelect;
  final VoidCallback onCustom;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final thisYear = now.year;
    final thisMonth = now.month;

    final recentMonths = List.generate(3, (i) {
      final d = DateTime(thisYear, thisMonth - i, 1);
      return (
        key: '${d.year}-${d.month.toString().padLeft(2, '0')}',
        label: _monthName(d.month),
      );
    });

    final groups = <({String label, List<({String key, String label})> items})>[
      (
        label: 'Quick range',
        items: [
          (key: '7d', label: 'Last 7 days'),
          (key: '28d', label: 'Last 28 days'),
          (key: '90d', label: 'Last 90 days'),
          (key: '365d', label: 'Last 365 days'),
          (key: 'lifetime', label: 'Lifetime'),
        ],
      ),
      (
        label: 'Year',
        items: [
          (key: '$thisYear', label: '$thisYear'),
          (key: '${thisYear - 1}', label: '${thisYear - 1}'),
        ],
      ),
      (
        label: 'Month',
        items: [for (final m in recentMonths) (key: m.key, label: m.label)],
      ),
      (
        label: 'Custom',
        items: [(key: 'custom', label: 'Custom range…')],
      ),
    ];

    final surface = AdminSurface.of(context);
    return Material(
      elevation: 12,
      shadowColor: Colors.black26,
      borderRadius: BorderRadius.circular(16),
      color: surface.card,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: surface.border),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var gi = 0; gi < groups.length; gi++) ...[
              if (gi > 0) Divider(height: 1, color: surface.border.withValues(alpha: 0.6)),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 2),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    groups[gi].label.toUpperCase(),
                    style: GoogleFonts.inter(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.2,
                      color: AdminColors.textSecondary,
                    ),
                  ),
                ),
              ),
              for (final item in groups[gi].items)
                _MenuItem(
                  label: item.label,
                  active: value.key == item.key ||
                      (item.key == 'custom' && value.key == 'custom'),
                  onTap: () {
                    if (item.key == 'custom') {
                      onCustom();
                    } else {
                      onSelect(AdminReportPeriod(item.key));
                    }
                  },
                ),
            ],
          ],
        ),
      ),
    );
  }

  static String _monthName(int m) {
    const names = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return names[m - 1];
  }
}

class _MenuItem extends StatelessWidget {
  const _MenuItem({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final surface = AdminSurface.of(context);
    final accent = Theme.of(context).colorScheme.primary;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            if (active)
              Container(
                width: 5,
                height: 5,
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
              )
            else
              const SizedBox(width: 13),
            Expanded(
              child: Text(
                label,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                      color: active ? accent : surface.textPrimary,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
