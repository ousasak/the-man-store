import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../screens/admin/admin_shell.dart';
import '../../theme/admin_theme.dart';
import 'admin_profile_avatar.dart';
import '../../models/user_model.dart';

/// Large return CTA — shown on storefront Account tab for admins (not a top bar).
class AdminDashboardReturnPanel extends StatelessWidget {
  const AdminDashboardReturnPanel({super.key, required this.user});

  final UserModel user;

  void _returnToAdmin(BuildContext context) {
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
      return;
    }
    openAdminShell(context);
  }

  @override
  Widget build(BuildContext context) {
    final primary = AdminColors.primary;

    return Column(
      children: [
        Container(
          width: double.infinity,
          color: primary,
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
          child: SafeArea(
            bottom: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Storefront',
                  style: GoogleFonts.inter(color: Colors.white.withValues(alpha: 0.9), fontSize: 14, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    AdminProfileAvatar(user: user, radius: 28),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user.name,
                            style: GoogleFonts.inter(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
                          ),
                          Text(
                            user.isSuperAdmin ? 'Superadmin · browsing shop' : 'Admin · browsing shop',
                            style: GoogleFonts.inter(color: Colors.white.withValues(alpha: 0.85), fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(22, 28, 22, 32),
            child: Column(
              children: [
                Icon(Icons.storefront_outlined, size: 56, color: primary.withValues(alpha: 0.45)),
                const SizedBox(height: 16),
                Text(
                  'You are browsing the customer shop',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(fontSize: 17, fontWeight: FontWeight.w700, color: AdminColors.textPrimary),
                ),
                const SizedBox(height: 8),
                Text(
                  'Use Home, Search or Shop tabs to preview the storefront. Return to admin when you are done.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(fontSize: 14, height: 1.45, color: AdminColors.textSecondary),
                ),
                const Spacer(),
                Material(
                  elevation: 0,
                  borderRadius: BorderRadius.circular(20),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    onTap: () => _returnToAdmin(context),
                    child: Ink(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        gradient: LinearGradient(
                          colors: [primary, primary.withValues(alpha: 0.82)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: primary.withValues(alpha: 0.35),
                            blurRadius: 20,
                            offset: const Offset(0, 10),
                          ),
                        ],
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 22),
                        child: Row(
                          children: [
                            Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.18),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: const Icon(Icons.admin_panel_settings_rounded, color: Colors.white, size: 28),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Back to Admin Dashboard',
                                    style: GoogleFonts.inter(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Reports · Orders · Checkout · Payments',
                                    style: GoogleFonts.inter(color: Colors.white.withValues(alpha: 0.88), fontSize: 12.5),
                                  ),
                                ],
                              ),
                            ),
                            const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 26),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
