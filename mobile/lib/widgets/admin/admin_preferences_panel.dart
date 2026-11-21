import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../l10n/l10n_extension.dart';
import '../../providers/admin_preferences_provider.dart';
import '../../providers/app_settings_provider.dart';
import '../../utils/admin_number_format.dart';
import 'admin_ui_kit.dart';

/// Language, dark mode, theme preset — lives on Account screen.
class AdminPreferencesPanel extends StatelessWidget {
  const AdminPreferencesPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final prefs = context.watch<AdminPreferencesProvider>();
    final appSettings = context.watch<AppSettingsProvider>();
    final l10n = context.adminL10n;
    final primary = prefs.primaryColor;

    return AdminSoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.preferences, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 14),
          Row(
            children: [
              Icon(Icons.translate_rounded, size: 18, color: primary),
              const SizedBox(width: 10),
              Expanded(child: Text(l10n.languageTitle, style: Theme.of(context).textTheme.bodyMedium)),
              SegmentedButton<bool>(
                key: ValueKey(appSettings.language),
                segments: const [
                  ButtonSegment(value: false, label: Text('EN')),
                  ButtonSegment(value: true, label: Text('ខ្មែរ')),
                ],
                selected: {appSettings.isKhmer},
                onSelectionChanged: (s) {
                  final wantKm = s.first;
                  appSettings.setLanguage(wantKm ? 'km' : 'en');
                },
              ),
            ],
          ),
          const Divider(height: 24),
          Row(
            children: [
              Icon(Icons.dark_mode_outlined, size: 18, color: primary),
              const SizedBox(width: 10),
              Expanded(child: Text(l10n.lightDark, style: Theme.of(context).textTheme.bodyMedium)),
              Switch(
                value: prefs.themeMode == ThemeMode.dark,
                onChanged: (_) => prefs.toggleTheme(),
              ),
            ],
          ),
          const Divider(height: 24),
          Text(l10n.numberFormat, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 8),
          SegmentedButton<AdminNumberFormat>(
            segments: [
              ButtonSegment(value: AdminNumberFormat.compact, label: Text(l10n.numberFormatCompact)),
              ButtonSegment(value: AdminNumberFormat.full, label: Text(l10n.numberFormatFull)),
            ],
            selected: {prefs.numberFormat},
            onSelectionChanged: (s) => prefs.setNumberFormat(s.first),
          ),
          const Divider(height: 24),
          Text(l10n.themePreset, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: AdminPreferencesProvider.presets.entries.map((e) {
              final selected = prefs.presetId == e.key;
              return ChoiceChip(
                label: Text(e.key),
                selected: selected,
                selectedColor: e.value.withValues(alpha: 0.22),
                onSelected: (_) => prefs.setPreset(e.key),
              );
            }).toList(),
          ),
          const SizedBox(height: 14),
          Text(l10n.chartStyle, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 8),
          SegmentedButton<AdminChartStyle>(
            segments: const [
              ButtonSegment(value: AdminChartStyle.line, label: Text('Line'), icon: Icon(Icons.show_chart_rounded, size: 16)),
              ButtonSegment(value: AdminChartStyle.bar, label: Text('Bar'), icon: Icon(Icons.bar_chart_rounded, size: 16)),
            ],
            selected: {prefs.chartStyle},
            onSelectionChanged: (s) => prefs.setChartStyle(s.first),
          ),
        ],
      ),
    );
  }
}
