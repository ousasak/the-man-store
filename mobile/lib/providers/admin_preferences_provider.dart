import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/local_store_keys.dart';
import '../theme/admin_theme.dart';
import '../utils/admin_number_format.dart';

enum AdminChartStyle { line, bar }

class AdminPreferencesProvider extends ChangeNotifier {
  AdminPreferencesProvider(this._prefs);

  final SharedPreferences _prefs;

  static const presets = <String, Color>{
    'default': Color(0xFF6E8B7E),
    'emerald': Color(0xFF10A37F),
    'ocean': Color(0xFF6366F1),
    'coral': Color(0xFFF97316),
    'rose': Color(0xFFE11D48),
    'slate': Color(0xFF475569),
    'violet': Color(0xFF8B5CF6),
  };

  String _presetId = 'default';
  ThemeMode _themeMode = ThemeMode.light;
  AdminChartStyle _chartStyle = AdminChartStyle.line;
  AdminNumberFormat _numberFormat = AdminNumberFormat.compact;
  bool _booted = false;

  bool get booted => _booted;
  String get presetId => _presetId;
  ThemeMode get themeMode => _themeMode;
  AdminChartStyle get chartStyle => _chartStyle;
  AdminNumberFormat get numberFormat => _numberFormat;
  Color get primaryColor => presets[_presetId] ?? AdminColors.primary;

  Future<void> bootstrap() async {
    _presetId = _prefs.getString(LocalStoreKeys.adminThemePreset) ?? 'default';
    final mode = _prefs.getString(LocalStoreKeys.adminThemeMode) ?? 'light';
    _themeMode = mode == 'dark' ? ThemeMode.dark : ThemeMode.light;
    final chart = _prefs.getString(LocalStoreKeys.adminChartStyle) ?? 'line';
    _chartStyle = chart == 'bar' ? AdminChartStyle.bar : AdminChartStyle.line;
    _numberFormat = AdminNumberFormatStorage.fromStorage(_prefs.getString(LocalStoreKeys.adminNumberFormat));
    _booted = true;
    notifyListeners();
  }

  Future<void> setPreset(String id) async {
    if (!presets.containsKey(id)) return;
    _presetId = id;
    await _prefs.setString(LocalStoreKeys.adminThemePreset, id);
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    if (_themeMode == mode) return;
    _themeMode = mode;
    await _prefs.setString(LocalStoreKeys.adminThemeMode, mode == ThemeMode.dark ? 'dark' : 'light');
    notifyListeners();
  }

  Future<void> toggleTheme() async {
    await setThemeMode(_themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark);
  }

  Future<void> setChartStyle(AdminChartStyle style) async {
    if (_chartStyle == style) return;
    _chartStyle = style;
    await _prefs.setString(LocalStoreKeys.adminChartStyle, style == AdminChartStyle.bar ? 'bar' : 'line');
    notifyListeners();
  }

  Future<void> setNumberFormat(AdminNumberFormat format) async {
    if (_numberFormat == format) return;
    _numberFormat = format;
    await _prefs.setString(LocalStoreKeys.adminNumberFormat, format.storageKey);
    notifyListeners();
  }
}
