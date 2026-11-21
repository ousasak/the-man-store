import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

/// Web admin brand — Obsidian primary `#0F172A` (see frontend `ADMIN_BRAND_PRIMARY`).
abstract final class AdminColors {
  static const Color primary = Color(0xFF6E8B7E);
  static const Color primaryDark = Color(0xFF586F64);
  static const Color primaryLight = Color(0xFF9BB0A5);
  static const Color primarySurface = Color(0xFFEEF4F1);
  static const Color primaryRing = Color(0x246E8B7E);

  static const Color background = Color(0xFFF8FAFC);
  static const Color canvas = Color(0xFFF1F5F9);
  static const Color card = Color(0xFFFFFFFF);
  static const Color border = Color(0xFFE2E8F0);
  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF64748B);

  static const Color success = Color(0xFF7A9A8D);
  static const Color info = Color(0xFF5B8DEF);
  static const Color warning = Color(0xFFD4A574);
  static const Color danger = Color(0xFFDC2626);

  /// KPI / chart accent cycle (web `ADMIN_SPECTRUM_COLORS`).
  static const List<Color> chartPalette = [
    Color(0xFF6E8B7E),
    Color(0xFF5B8DEF),
    Color(0xFF7A9A8D),
    Color(0xFFD4A574),
    Color(0xFF9BB0A5),
    Color(0xFF6B9BD1),
    Color(0xFF8FA89A),
  ];

  static List<BoxShadow> get cardShadow => [
        BoxShadow(
          color: const Color(0xFF0F172A).withValues(alpha: 0.04),
          blurRadius: 16,
          offset: const Offset(0, 4),
        ),
      ];

  static List<BoxShadow> get navShadow => [
        BoxShadow(
          color: const Color(0xFF0F172A).withValues(alpha: 0.1),
          blurRadius: 24,
          offset: const Offset(0, 6),
        ),
      ];

  // Aliases used across admin UI kit
  static const Color accent = primary;
  static const Color accentDark = primaryDark;
  static const Color accentLight = primarySurface;
  static const Color accentBright = primary;
  static const Color accentGlow = primaryLight;
  static const Color positive = success;
  static const Color positiveLight = Color(0xFFDCFCE7);
  static const Color positiveSurface = Color(0xFFF0FDF4);
  static const Color negative = Color(0xFFEC4899);
  static const Color negativeLight = Color(0xFFFCE7F3);
  static const Color negativeSurface = Color(0xFFFDF2F8);
  static const Color ink = textPrimary;
  static const Color dock = primary;

  static const LinearGradient heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF7A9A8D), Color(0xFF6E8B7E), Color(0xFF586F64)],
  );

  static const LinearGradient meshGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF8FAFC), Color(0xFFF1F5F9), Color(0xFFEEF4F1)],
  );

  static List<BoxShadow> get softShadow => cardShadow;
  static List<BoxShadow> get fabShadow => navShadow;
  static const Color positiveBright = Color(0xFF4ADE80);
  static const Color negativeBright = negative;
}

abstract final class AdminTheme {
  static TextTheme _textTheme({
    required Color textPrimary,
    required Color textSecondary,
    bool khmer = false,
  }) {
    final primaryFamily = khmer ? GoogleFonts.notoSansKhmer().fontFamily : GoogleFonts.inter().fontFamily;
    final fallback = khmer
        ? <String>[GoogleFonts.inter().fontFamily!]
        : <String>[GoogleFonts.notoSansKhmer().fontFamily!];

    TextStyle style({
      required double size,
      FontWeight weight = FontWeight.w500,
      Color? color,
      double? height,
      double? letterSpacing,
    }) {
      return TextStyle(
        fontFamily: primaryFamily,
        fontFamilyFallback: fallback,
        fontSize: size,
        fontWeight: weight,
        color: color,
        height: height,
        letterSpacing: letterSpacing,
      );
    }

    return TextTheme(
      displaySmall: style(size: 32, weight: FontWeight.w800, color: textPrimary, letterSpacing: -1),
      titleLarge: style(size: 20, weight: FontWeight.w700, color: textPrimary, letterSpacing: -0.4),
      titleMedium: style(size: 16, weight: FontWeight.w700, color: textPrimary),
      titleSmall: style(size: 14, weight: FontWeight.w700, color: textPrimary),
      bodyMedium: style(size: 13, weight: FontWeight.w500, color: textSecondary, height: 1.45),
      labelLarge: style(size: 12, weight: FontWeight.w600, color: textSecondary),
      labelSmall: style(size: 11, weight: FontWeight.w600, color: AppColors.textMuted),
    );
  }

  static ThemeData light({Color primary = AdminColors.primary, bool khmer = false}) {
    return _build(primary: primary, brightness: Brightness.light, khmer: khmer);
  }

  static ThemeData dark({Color primary = AdminColors.primary, bool khmer = false}) {
    return _build(primary: primary, brightness: Brightness.dark, khmer: khmer);
  }

  static ThemeData _build({
    required Color primary,
    required Brightness brightness,
    bool khmer = false,
  }) {
    final isDark = brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0F172A) : AdminColors.background;
    final card = isDark ? const Color(0xFF1E293B) : AdminColors.card;
    final border = isDark ? const Color(0xFF334155) : AdminColors.border;
    final textPrimary = isDark ? const Color(0xFFF1F5F9) : AdminColors.textPrimary;
    final textSecondary = isDark ? const Color(0xFF94A3B8) : AdminColors.textSecondary;
    final textTheme = _textTheme(textPrimary: textPrimary, textSecondary: textSecondary, khmer: khmer);
    final primaryFamily = khmer ? GoogleFonts.notoSansKhmer().fontFamily : GoogleFonts.inter().fontFamily;
    final fallback = khmer
        ? <String>[GoogleFonts.inter().fontFamily!]
        : <String>[GoogleFonts.notoSansKhmer().fontFamily!];

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      fontFamily: primaryFamily,
      fontFamilyFallback: fallback,
      scaffoldBackgroundColor: bg,
      colorScheme: ColorScheme.fromSeed(seedColor: primary, brightness: brightness),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: bg,
        foregroundColor: textPrimary,
        systemOverlayStyle: isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
        titleTextStyle: textTheme.titleMedium,
      ),
      cardTheme: CardThemeData(color: card, elevation: 0),
      dividerColor: border,
      progressIndicatorTheme: ProgressIndicatorThemeData(color: primary),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: TextStyle(fontFamily: primaryFamily, fontFamilyFallback: fallback, fontSize: 14, fontWeight: FontWeight.w700),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: card,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: border)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: primary, width: 1.5)),
        hintStyle: TextStyle(fontFamily: primaryFamily, fontFamilyFallback: fallback, color: AppColors.textMuted, fontSize: 14),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        backgroundColor: textPrimary,
      ),
    );
  }
}
