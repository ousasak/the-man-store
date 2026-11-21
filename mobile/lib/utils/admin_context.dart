import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/admin_preferences_provider.dart';
import '../theme/admin_theme.dart';
import 'admin_number_format.dart';

/// Theme-aware admin surface colors (light + dark).
class AdminSurface {
  const AdminSurface._({
    required this.card,
    required this.canvas,
    required this.border,
    required this.textPrimary,
    required this.textSecondary,
    required this.isDark,
  });

  final Color card;
  final Color canvas;
  final Color border;
  final Color textPrimary;
  final Color textSecondary;
  final bool isDark;

  factory AdminSurface.of(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return AdminSurface._(
      card: theme.cardTheme.color ?? (isDark ? const Color(0xFF1E293B) : AdminColors.card),
      canvas: isDark ? const Color(0xFF172033) : AdminColors.canvas,
      border: theme.dividerColor,
      textPrimary: theme.colorScheme.onSurface,
      textSecondary: theme.textTheme.bodyMedium?.color ?? AdminColors.textSecondary,
      isDark: isDark,
    );
  }
}

/// Number formatting from admin preferences.
class AdminFmt {
  AdminFmt(this.mode);

  final AdminNumberFormat mode;

  static AdminFmt of(BuildContext context, {bool listen = true}) {
    final nf = listen
        ? context.watch<AdminPreferencesProvider>().numberFormat
        : context.read<AdminPreferencesProvider>().numberFormat;
    return AdminFmt(nf);
  }

  String usd(double value) => formatAdminUsd(value, mode);
  String formatNum(num value) => formatAdminNumber(value, mode);
}
