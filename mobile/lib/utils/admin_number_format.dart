import 'package:intl/intl.dart';

enum AdminNumberFormat { full, compact }

extension AdminNumberFormatStorage on AdminNumberFormat {
  String get storageKey => this == AdminNumberFormat.full ? 'full' : 'compact';

  static AdminNumberFormat fromStorage(String? raw) {
    return raw == 'full' ? AdminNumberFormat.full : AdminNumberFormat.compact;
  }
}

final _fullUsd = NumberFormat.currency(symbol: '\$');
final _fullNumber = NumberFormat.decimalPattern();
final _compactNumber = NumberFormat.compact();

String formatAdminUsd(double value, AdminNumberFormat mode) {
  final n = value.isNaN ? 0.0 : value;
  if (mode == AdminNumberFormat.full) return _fullUsd.format(n);
  if (n.abs() >= 1000000) return '\$${(n / 1000000).toStringAsFixed(1)}M';
  if (n.abs() >= 1000) return '\$${(n / 1000).toStringAsFixed(1)}K';
  return _fullUsd.format(n);
}

String formatAdminNumber(num value, AdminNumberFormat mode) {
  final n = value is double && value.isNaN ? 0 : value;
  return mode == AdminNumberFormat.full ? _fullNumber.format(n) : _compactNumber.format(n);
}
