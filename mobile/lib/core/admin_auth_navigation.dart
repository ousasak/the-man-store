import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../screens/admin/admin_shell.dart';
import '../screens/home_shell.dart';

/// After login/OTP: admins land on dashboard; customers return to storefront.
void navigateAfterAuthentication(BuildContext context) {
  final user = context.read<AuthProvider>().user;
  if (user != null && user.isAdmin) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const AdminShell()),
      (_) => false,
    );
    return;
  }
  Navigator.of(context).popUntil((route) => route.isFirst);
}

void openStorefrontFromAdmin(BuildContext context) {
  Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => const HomeShell()),
  );
}
