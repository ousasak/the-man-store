import 'package:flutter/material.dart';

import '../../theme/admin_theme.dart';

class AdminAccessDenied extends StatelessWidget {
  const AdminAccessDenied({
    super.key,
    required this.title,
    this.subtitle = 'Your admin account does not have permission for this area.',
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AdminColors.negativeLight,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.lock_outline_rounded, color: AdminColors.negative, size: 28),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(subtitle, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 8),
            Text(
              'Ask a superadmin to update your permissions on the web admin.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: AdminColors.textSecondary.withValues(alpha: 0.9)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Legacy wrapper — use [AdminScreenLayout] from admin_ui_kit for new screens.
class AdminScreenScaffold extends StatelessWidget {
  const AdminScreenScaffold({
    super.key,
    required this.title,
    this.subtitle,
    required this.child,
    this.embedded = true,
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final bool embedded;

  @override
  Widget build(BuildContext context) {
    if (!embedded) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        backgroundColor: AdminColors.background,
        body: child,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
          child: SafeArea(
            bottom: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleLarge),
                if (subtitle != null) Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          ),
        ),
        Expanded(child: child),
      ],
    );
  }
}
