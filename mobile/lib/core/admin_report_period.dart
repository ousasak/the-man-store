/// Report date-range selection — mirrors web `Reports.jsx` `buildSalesParams`.
class AdminReportPeriod {
  const AdminReportPeriod(this.key, {this.customFrom, this.customTo});

  final String key;
  final DateTime? customFrom;
  final DateTime? customTo;

  static const defaultPeriod = AdminReportPeriod('28d');

  static String _pad(int n) => n.toString().padLeft(2, '0');

  static String _fmt(DateTime d) =>
      '${d.year}-${_pad(d.month)}-${_pad(d.day)}';

  Map<String, dynamic> toQueryParams() {
    if (key == 'custom' && customFrom != null && customTo != null) {
      return {'from': _fmt(customFrom!), 'to': _fmt(customTo!)};
    }
    if (key == '7d') return {'period': 7};
    if (key == '28d') return {'period': 28};
    if (key == '90d') return {'period': 90};
    if (key == '365d') return {'period': 365};
    if (key == 'lifetime') return {'period': 3650};

    final yearMatch = RegExp(r'^\d{4}$').firstMatch(key);
    if (yearMatch != null) {
      final y = int.parse(key);
      return {'from': '$y-01-01', 'to': '$y-12-31'};
    }

    final monthMatch = RegExp(r'^(\d{4})-(\d{2})$').firstMatch(key);
    if (monthMatch != null) {
      final y = int.parse(monthMatch.group(1)!);
      final m = int.parse(monthMatch.group(2)!);
      final last = DateTime(y, m + 1, 0).day;
      return {'from': '$y-${_pad(m)}-01', 'to': '$y-${_pad(m)}-${_pad(last)}'};
    }

    return {'period': 30};
  }

  (DateTime from, DateTime to) resolveRange() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    if (key == 'custom' && customFrom != null && customTo != null) {
      return (
        DateTime(customFrom!.year, customFrom!.month, customFrom!.day),
        DateTime(customTo!.year, customTo!.month, customTo!.day),
      );
    }
    if (key == '7d') return (today.subtract(const Duration(days: 7)), today);
    if (key == '28d') return (today.subtract(const Duration(days: 28)), today);
    if (key == '90d') return (today.subtract(const Duration(days: 90)), today);
    if (key == '365d') return (today.subtract(const Duration(days: 365)), today);
    if (key == 'lifetime') return (DateTime(2000), today);

    final yearMatch = RegExp(r'^\d{4}$').firstMatch(key);
    if (yearMatch != null) {
      final y = int.parse(key);
      return (DateTime(y), DateTime(y, 12, 31));
    }

    final monthMatch = RegExp(r'^(\d{4})-(\d{2})$').firstMatch(key);
    if (monthMatch != null) {
      final y = int.parse(monthMatch.group(1)!);
      final m = int.parse(monthMatch.group(2)!);
      return (DateTime(y, m), DateTime(y, m + 1, 0));
    }

    return (today.subtract(const Duration(days: 30)), today);
  }

  AdminReportPeriod previousPeriod() {
    final (from, to) = resolveRange();
    final days = to.difference(from).inDays + 1;
    final prevEnd = from.subtract(const Duration(days: 1));
    final prevStart = prevEnd.subtract(Duration(days: days - 1));
    return AdminReportPeriod('custom', customFrom: prevStart, customTo: prevEnd);
  }

  String get label {
    const names = {
      '7d': 'Last 7 days',
      '28d': 'Last 28 days',
      '90d': 'Last 90 days',
      '365d': 'Last 365 days',
      'lifetime': 'Lifetime',
      'custom': 'Custom',
    };
    if (names.containsKey(key)) return names[key]!;

    if (RegExp(r'^\d{4}$').hasMatch(key)) return key;

    final monthMatch = RegExp(r'^(\d{4})-(\d{2})$').firstMatch(key);
    if (monthMatch != null) {
      final y = int.parse(monthMatch.group(1)!);
      final m = int.parse(monthMatch.group(2)!);
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];
      final now = DateTime.now();
      return now.year == y ? monthNames[m - 1] : '${monthNames[m - 1]} $y';
    }

    if (key == 'custom' && customFrom != null && customTo != null) {
      return '${_fmt(customFrom!)} – ${_fmt(customTo!)}';
    }

    return key;
  }

  (int fromYear, int toYear) stockYearRange() {
    final (from, to) = resolveRange();
    return (from.year, to.year);
  }
}

class TrendDelta {
  const TrendDelta({required this.current, required this.previous});

  final double current;
  final double previous;

  bool get isUp => current > previous;
  bool get isDown => current < previous;
  bool get isFlat => current == previous;

  double get delta => current - previous;

  String formatComparison({
    required String Function(double) valueFormatter,
    bool preferPercent = false,
  }) {
    if (isFlat) return 'Same as previous period';
    if (previous == 0) return isUp ? 'Up from previous period' : 'Down from previous period';

    final pct = ((current - previous) / previous.abs()) * 100;
    if (preferPercent || previous.abs() < 1) {
      return '${pct.abs().toStringAsFixed(0)}% ${isUp ? 'more' : 'less'} than previous period';
    }

    return '${valueFormatter(delta.abs())} ${isUp ? 'more' : 'less'} than previous period';
  }
}
