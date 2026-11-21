import 'dart:math' as math;
import 'dart:ui';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../models/user_model.dart';
import '../../core/admin_report_period.dart';
import '../../theme/admin_theme.dart';
import '../../theme/app_colors.dart';
import '../../utils/admin_context.dart';
import '../../utils/media_url.dart';
import '../product_image.dart';

/// Soft mesh background used behind every admin tab.
class AdminBackdrop extends StatelessWidget {
  const AdminBackdrop({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gradient = isDark
        ? const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF0F172A), Color(0xFF1E293B), Color(0xFF0F172A)],
          )
        : AdminColors.meshGradient;

    return Stack(
      children: [
        Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: gradient))),
        if (!isDark) ...[
          Positioned(
            top: -80,
            right: -40,
            child: _glowBlob(180, AdminColors.accentGlow.withValues(alpha: 0.35)),
          ),
          Positioned(
            top: 120,
            left: -60,
            child: _glowBlob(140, AdminColors.positiveBright.withValues(alpha: 0.18)),
          ),
          Positioned(
            bottom: 120,
            right: -30,
            child: _glowBlob(120, AdminColors.negativeBright.withValues(alpha: 0.14)),
          ),
        ],
        child,
      ],
    );
  }

  Widget _glowBlob(double size, Color color) {
    return ImageFiltered(
      imageFilter: ImageFilter.blur(sigmaX: 50, sigmaY: 50),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
    );
  }
}

class AdminAppear extends StatefulWidget {
  const AdminAppear({
    super.key,
    required this.index,
    required this.child,
    this.delayMs = 48,
  });

  final int index;
  final Widget child;
  final int delayMs;

  @override
  State<AdminAppear> createState() => _AdminAppearState();
}

class _AdminAppearState extends State<AdminAppear> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _fade;
  late final Animation<Offset> _slide;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 560), value: 1);
    final curve = CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);
    _fade = curve;
    _slide = Tween<Offset>(begin: const Offset(0, 0.12), end: Offset.zero).animate(curve);
    _scale = Tween<double>(begin: 0.96, end: 1).animate(curve);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!TickerMode.of(context)) return;
      _controller.value = 0;
      Future<void>.delayed(Duration(milliseconds: widget.index * widget.delayMs), () {
        if (mounted) _controller.forward();
      });
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fade,
      child: SlideTransition(
        position: _slide,
        child: ScaleTransition(scale: _scale, child: widget.child),
      ),
    );
  }
}

class AdminSoftCard extends StatefulWidget {
  const AdminSoftCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.onTap,
    this.gradient,
    this.radius = 24,
    this.shadow = true,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final Gradient? gradient;
  final double radius;
  final bool shadow;

  @override
  State<AdminSoftCard> createState() => _AdminSoftCardState();
}

class _AdminSoftCardState extends State<AdminSoftCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final cardColor = Theme.of(context).cardTheme.color ?? AdminColors.card;
    final borderColor = Theme.of(context).dividerColor;
    final decoration = BoxDecoration(
      gradient: widget.gradient,
      color: widget.gradient == null ? cardColor : null,
      borderRadius: BorderRadius.circular(widget.radius),
      boxShadow: widget.shadow ? AdminColors.cardShadow : null,
      border: widget.gradient == null ? Border.all(color: borderColor.withValues(alpha: 0.65), width: 1) : null,
    );

    final content = AnimatedScale(
      scale: _pressed ? 0.985 : 1,
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOut,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: widget.padding,
        decoration: decoration,
        child: widget.child,
      ),
    );

    if (widget.onTap == null) return content;

    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: content,
    );
  }
}

/// Lightweight page chrome for admin tabs (toolbar handles search/profile).
class AdminTabScaffold extends StatelessWidget {
  const AdminTabScaffold({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    required this.child,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AdminBackdrop(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 8, 22, 8),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: Theme.of(context).textTheme.titleLarge),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
                      ],
                    ],
                  ),
                ),
                if (trailing != null) trailing!,
              ],
            ),
          ),
          Expanded(child: child),
        ],
      ),
    );
  }
}

/// Full-screen admin module pushed from dashboard / search (back + backdrop).
class AdminModuleScaffold extends StatelessWidget {
  const AdminModuleScaffold({
    super.key,
    required this.title,
    this.subtitle,
    required this.body,
    this.actions,
  });

  final String title;
  final String? subtitle;
  final Widget body;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AdminBackdrop(
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 4, 16, 8),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.maybePop(context),
                      icon: const Icon(Icons.arrow_back_rounded),
                      tooltip: 'Back',
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(title, style: Theme.of(context).textTheme.titleLarge),
                          if (subtitle != null) ...[
                            const SizedBox(height: 2),
                            Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
                          ],
                        ],
                      ),
                    ),
                    if (actions != null) ...actions!,
                  ],
                ),
              ),
              Expanded(child: body),
            ],
          ),
        ),
      ),
    );
  }
}

class AdminPageHeader extends StatelessWidget {
  const AdminPageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.user,
    this.badge,
    this.trailing,
    this.periodLabel,
    this.onProfileTap,
  });

  final String title;
  final String? subtitle;
  final UserModel? user;
  final String? badge;
  final Widget? trailing;
  final String? periodLabel;
  final VoidCallback? onProfileTap;

  @override
  Widget build(BuildContext context) {
    final imageUrl = resolveMediaUrl(user?.profileImageUrl);
    final initial = (user?.name.isNotEmpty ?? false) ? user!.name[0].toUpperCase() : 'A';
    final showProfile = user != null;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: Theme.of(context).brightness == Brightness.dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 6, 22, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (showProfile) ...[
                  _AvatarRing(imageUrl: imageUrl, initial: initial, onTap: onProfileTap),
                  const SizedBox(width: 14),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (subtitle != null)
                        Text(
                          subtitle!,
                          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                                color: AdminColors.textSecondary,
                                fontWeight: FontWeight.w500,
                              ),
                        ),
                      Text(title, style: Theme.of(context).textTheme.titleLarge),
                    ],
                  ),
                ),
                if (badge != null) ...[
                  _RoleChip(label: badge!, superAdmin: user?.isSuperAdmin == true),
                  const SizedBox(width: 8),
                ],
                if (showProfile) _HeaderIcon(icon: Icons.notifications_none_rounded),
                if (trailing != null) trailing!,
              ],
            ),
            if (periodLabel != null) ...[
              const SizedBox(height: 14),
              _PeriodChip(label: periodLabel!),
            ],
          ],
        ),
      ),
    );
  }
}

class _AvatarRing extends StatelessWidget {
  const _AvatarRing({required this.imageUrl, required this.initial, this.onTap});

  final String imageUrl;
  final String initial;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final avatar = Container(
      padding: const EdgeInsets.all(2.5),
      decoration: BoxDecoration(shape: BoxShape.circle, color: AdminColors.primary.withValues(alpha: 0.25)),
      child: CircleAvatar(
        radius: 23,
        backgroundColor: AdminColors.card,
        child: imageUrl.isNotEmpty
            ? ClipOval(child: SizedBox(width: 44, height: 44, child: ProductImage(imageUrl: imageUrl, fit: BoxFit.cover)))
            : Text(initial, style: GoogleFonts.inter(fontWeight: FontWeight.w800, color: AdminColors.primary, fontSize: 18)),
      ),
    );
    if (onTap == null) return avatar;
    return GestureDetector(onTap: onTap, child: avatar);
  }
}

class _RoleChip extends StatelessWidget {
  const _RoleChip({required this.label, required this.superAdmin});

  final String label;
  final bool superAdmin;

  @override
  Widget build(BuildContext context) {
    final color = superAdmin ? AppColors.superBadge : AdminColors.accent;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Text(
        label,
        style: GoogleFonts.inter(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: color,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

class _HeaderIcon extends StatelessWidget {
  const _HeaderIcon({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: 6),
      decoration: BoxDecoration(
        color: AdminColors.card,
        shape: BoxShape.circle,
        boxShadow: AdminColors.softShadow,
      ),
      child: IconButton(
        visualDensity: VisualDensity.compact,
        icon: Icon(icon, size: 20, color: AdminColors.textPrimary),
        onPressed: () {},
      ),
    );
  }
}

class _PeriodChip extends StatelessWidget {
  const _PeriodChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: AdminColors.card,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AdminColors.softShadow,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(width: 4),
          const Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: AdminColors.textSecondary),
        ],
      ),
    );
  }
}

/// Main balance — white premium card like reference home screen.
class AdminBalanceCard extends StatelessWidget {
  const AdminBalanceCard({
    super.key,
    required this.label,
    required this.value,
    this.trendLabel,
    this.trendPositive = true,
  });

  final String label;
  final String value;
  final String? trendLabel;
  final bool trendPositive;

  @override
  Widget build(BuildContext context) {
    return AdminSoftCard(
      padding: const EdgeInsets.fromLTRB(22, 22, 22, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 10),
          Text(
            value,
            style: Theme.of(context).textTheme.displaySmall?.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
          ),
          if (trendLabel != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: trendPositive ? AdminColors.positiveLight : AdminColors.negativeLight,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    trendPositive ? Icons.trending_up_rounded : Icons.trending_down_rounded,
                    size: 15,
                    color: trendPositive ? AdminColors.positive : AdminColors.negative,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    trendLabel!,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: trendPositive ? AdminColors.positive : AdminColors.negative,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Purple gradient hero — for reports / profile highlights.
class AdminHeroBalanceCard extends StatelessWidget {
  const AdminHeroBalanceCard({
    super.key,
    required this.label,
    required this.value,
    this.trendLabel,
    this.trendPositive = true,
  });

  final String label;
  final String value;
  final String? trendLabel;
  final bool trendPositive;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: Stack(
        children: [
          AdminSoftCard(
            gradient: AdminColors.heroGradient,
            shadow: true,
            padding: const EdgeInsets.fromLTRB(22, 22, 22, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.88), fontSize: 13, fontWeight: FontWeight.w500)),
                const SizedBox(height: 10),
                Text(
                  value,
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -1,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                if (trendLabel != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          trendPositive ? Icons.trending_up_rounded : Icons.trending_down_rounded,
                          size: 14,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          trendLabel!,
                          style: GoogleFonts.inter(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          Positioned(top: -30, right: -20, child: _orb(100, Colors.white.withValues(alpha: 0.12))),
          Positioned(bottom: -40, left: -10, child: _orb(80, Colors.white.withValues(alpha: 0.08))),
        ],
      ),
    );
  }

  Widget _orb(double size, Color color) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

class AdminMetricPair extends StatelessWidget {
  const AdminMetricPair({
    super.key,
    required this.leftLabel,
    required this.leftValue,
    required this.rightLabel,
    required this.rightValue,
    this.leftIcon = Icons.payments_outlined,
    this.rightIcon = Icons.receipt_long_outlined,
    this.leftColor = AdminColors.positive,
    this.rightColor = AdminColors.negative,
    this.leftSurface = AdminColors.positiveSurface,
    this.rightSurface = AdminColors.negativeSurface,
  });

  final String leftLabel;
  final String leftValue;
  final String rightLabel;
  final String rightValue;
  final IconData leftIcon;
  final IconData rightIcon;
  final Color leftColor;
  final Color rightColor;
  final Color leftSurface;
  final Color rightSurface;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _tile(leftLabel, leftValue, leftIcon, leftColor, leftSurface)),
        const SizedBox(width: 12),
        Expanded(child: _tile(rightLabel, rightValue, rightIcon, rightColor, rightSurface)),
      ],
    );
  }

  Widget _tile(String label, String value, IconData icon, Color color, Color surface) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: color.withValues(alpha: 0.12)),
        boxShadow: AdminColors.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(height: 14),
          Text(label, style: GoogleFonts.inter(fontSize: 12, color: AdminColors.textSecondary, fontWeight: FontWeight.w500)),
          const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.inter(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AdminColors.textPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class AdminPocketCard extends StatelessWidget {
  const AdminPocketCard({
    super.key,
    required this.label,
    required this.value,
    required this.gradient,
    this.subtitle,
    this.onTap,
  });

  final String label;
  final String value;
  final String? subtitle;
  final Gradient gradient;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 148,
      child: AdminSoftCard(
        onTap: onTap,
        gradient: gradient,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.inter(color: Colors.white.withValues(alpha: 0.85), fontSize: 11, fontWeight: FontWeight.w600),
            ),
            const Spacer(),
            Text(
              value,
              style: GoogleFonts.inter(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w800,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(
                subtitle!,
                style: GoogleFonts.inter(color: Colors.white.withValues(alpha: 0.75), fontSize: 11),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class AdminStatGridCard extends StatelessWidget {
  const AdminStatGridCard({
    super.key,
    required this.label,
    required this.value,
    this.subtitle,
    required this.icon,
    required this.color,
  });

  final String label;
  final String value;
  final String? subtitle;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AdminSoftCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const Spacer(),
          Text(label, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 6),
          Text(
            value,
            style: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w800, fontFeatures: const [FontFeature.tabularFigures()]),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ],
      ),
    );
  }
}

class AdminSectionTitle extends StatelessWidget {
  const AdminSectionTitle({super.key, required this.title, this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(title, style: Theme.of(context).textTheme.titleSmall)),
        if (action != null)
          TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(
              foregroundColor: AdminColors.accent,
              padding: EdgeInsets.zero,
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(action!, style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 13)),
          ),
      ],
    );
  }
}

class AdminSearchField extends StatelessWidget {
  const AdminSearchField({
    super.key,
    required this.controller,
    required this.hint,
    this.prefixIcon = Icons.search_rounded,
    this.onSubmitted,
    this.onRefresh,
  });

  final TextEditingController controller;
  final String hint;
  final IconData prefixIcon;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onRefresh;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        boxShadow: AdminColors.softShadow,
      ),
      child: TextField(
        controller: controller,
        onSubmitted: onSubmitted,
        style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w500),
        decoration: InputDecoration(
          hintText: hint,
          prefixIcon: Icon(prefixIcon, color: AdminColors.textSecondary, size: 22),
          suffixIcon: onRefresh != null
              ? IconButton(icon: const Icon(Icons.tune_rounded), onPressed: onRefresh)
              : null,
        ),
      ),
    );
  }
}

class AdminListRow extends StatelessWidget {
  const AdminListRow({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.leading,
    this.onTap,
    this.index = 0,
    this.dense = false,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget? leading;
  final VoidCallback? onTap;
  final int index;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final surface = AdminSurface.of(context);
    return AdminAppear(
      index: index,
      child: Material(
        color: surface.card,
        borderRadius: BorderRadius.circular(18),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: EdgeInsets.symmetric(horizontal: dense ? 12 : 14, vertical: dense ? 9 : 13),
            decoration: BoxDecoration(
              border: Border.all(color: surface.border.withValues(alpha: 0.7)),
              borderRadius: BorderRadius.circular(18),
              boxShadow: surface.isDark ? null : AdminColors.softShadow,
            ),
            child: Row(
              children: [
                if (leading != null) ...[leading!, const SizedBox(width: 12)],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                      if (subtitle != null) Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
                    ],
                  ),
                ),
                if (trailing != null) trailing!,
                if (onTap != null) ...[
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.textMuted),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class AdminQuickAction extends StatelessWidget {
  const AdminQuickAction({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.index = 0,
    this.color = AdminColors.accent,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final int index;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AdminAppear(
      index: index,
      child: AdminSoftCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 10),
        radius: 20,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [color.withValues(alpha: 0.18), color.withValues(alpha: 0.08)],
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(height: 10),
            Text(
              label,
              style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.onSurface),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class AdminLineChart extends StatefulWidget {
  const AdminLineChart({
    super.key,
    required this.values,
    this.height = 180,
    this.lineColor = AdminColors.accent,
    this.fillColor,
  });

  final List<double> values;
  final double height;
  final Color lineColor;
  final Color? fillColor;

  @override
  State<AdminLineChart> createState() => _AdminLineChartState();
}

class _AdminLineChartState extends State<AdminLineChart> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));
    _anim = CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);
    _controller.forward();
  }

  @override
  void didUpdateWidget(AdminLineChart oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.values != widget.values) _controller.forward(from: 0);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.values.isEmpty) {
      return SizedBox(
        height: widget.height,
        child: Center(child: Text('No chart data', style: Theme.of(context).textTheme.bodyMedium)),
      );
    }

    final maxY = widget.values.reduce(math.max);
    final minY = widget.values.reduce(math.min);
    final range = (maxY - minY).abs() < 1 ? 1.0 : maxY - minY;

    return AnimatedBuilder(
      animation: _anim,
      builder: (context, _) {
        final visibleCount = math.max(2, (widget.values.length * _anim.value).round());
        final spots = [for (var i = 0; i < visibleCount; i++) FlSpot(i.toDouble(), widget.values[i])];

        return SizedBox(
          height: widget.height,
          child: LineChart(
            LineChartData(
              minY: minY - range * 0.12,
              maxY: maxY + range * 0.12,
              gridData: FlGridData(
                show: true,
                drawVerticalLine: false,
                horizontalInterval: range / 3,
                getDrawingHorizontalLine: (_) => FlLine(color: AdminColors.border.withValues(alpha: 0.5), strokeWidth: 1),
              ),
              titlesData: const FlTitlesData(show: false),
              borderData: FlBorderData(show: false),
              lineTouchData: LineTouchData(
                enabled: true,
                touchTooltipData: LineTouchTooltipData(
                  getTooltipColor: (_) => AdminColors.ink,
                  tooltipRoundedRadius: 12,
                  tooltipPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  getTooltipItems: (spots) => spots.map((s) {
                    return LineTooltipItem(
                      '\$${s.y.toStringAsFixed(2)}',
                      GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
                    );
                  }).toList(),
                ),
                getTouchedSpotIndicator: (_, spots) => spots.map((s) {
                  return TouchedSpotIndicatorData(
                    FlLine(color: widget.lineColor.withValues(alpha: 0.35), strokeWidth: 2, dashArray: [4, 4]),
                    FlDotData(
                      show: true,
                      getDotPainter: (_, __, ___, ____) => FlDotCirclePainter(
                        radius: 5,
                        color: AdminColors.card,
                        strokeWidth: 3,
                        strokeColor: widget.lineColor,
                      ),
                    ),
                  );
                }).toList(),
              ),
              lineBarsData: [
                LineChartBarData(
                  spots: spots,
                  isCurved: true,
                  curveSmoothness: 0.28,
                  color: widget.lineColor,
                  barWidth: 3.5,
                  dotData: const FlDotData(show: false),
                  belowBarData: BarAreaData(
                    show: true,
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        (widget.fillColor ?? widget.lineColor).withValues(alpha: 0.28),
                        (widget.fillColor ?? widget.lineColor).withValues(alpha: 0.02),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            duration: Duration.zero,
          ),
        );
      },
    );
  }
}

class AdminScreenLayout extends StatelessWidget {
  const AdminScreenLayout({
    super.key,
    required this.title,
    this.subtitle,
    this.user,
    this.badge,
    this.periodLabel,
    this.onProfileTap,
    required this.child,
    this.floatingBottom,
  });

  final String title;
  final String? subtitle;
  final UserModel? user;
  final String? badge;
  final String? periodLabel;
  final VoidCallback? onProfileTap;
  final Widget child;
  final Widget? floatingBottom;

  @override
  Widget build(BuildContext context) {
    return AdminBackdrop(
      child: Column(
        children: [
          AdminPageHeader(
            title: title,
            subtitle: subtitle,
            user: user,
            badge: badge,
            periodLabel: periodLabel,
            onProfileTap: onProfileTap,
          ),
          Expanded(child: child),
          if (floatingBottom != null)
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                child: Container(
                  decoration: BoxDecoration(
                    color: AdminColors.card.withValues(alpha: 0.94),
                    boxShadow: AdminColors.navShadow,
                    border: Border(top: BorderSide(color: AdminColors.border.withValues(alpha: 0.8))),
                  ),
                  child: SafeArea(top: false, child: floatingBottom!),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class AdminLoadingHero extends StatelessWidget {
  const AdminLoadingHero({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 8, 22, 0),
      child: Column(
        children: [
          _shimmer(height: 120, radius: 24),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _shimmer(height: 96, radius: 22)),
              const SizedBox(width: 12),
              Expanded(child: _shimmer(height: 96, radius: 22)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _shimmer({required double height, required double radius}) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.35, end: 0.65),
      duration: const Duration(milliseconds: 900),
      curve: Curves.easeInOut,
      builder: (context, value, _) {
        return Container(
          height: height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius),
            gradient: LinearGradient(
              colors: [
                AdminColors.border.withValues(alpha: value),
                AdminColors.accentLight.withValues(alpha: value * 0.6),
                AdminColors.border.withValues(alpha: value),
              ],
            ),
          ),
        );
      },
      onEnd: () {},
    );
  }
}

class AdminKpiCard extends StatelessWidget {
  const AdminKpiCard({
    super.key,
    required this.title,
    required this.value,
    this.subtitle,
    required this.icon,
    this.accentIndex = 0,
  });

  final String title;
  final String value;
  final String? subtitle;
  final IconData icon;
  final int accentIndex;

  @override
  Widget build(BuildContext context) {
    final color = AdminColors.chartPalette[accentIndex % AdminColors.chartPalette.length];
    return AdminSoftCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 18, color: color),
              ),
              const Spacer(),
            ],
          ),
          const SizedBox(height: 14),
          Text(title, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 6),
          Text(value, style: Theme.of(context).textTheme.titleLarge),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }
}

class AdminTrendKpiCard extends StatelessWidget {
  const AdminTrendKpiCard({
    super.key,
    required this.title,
    required this.value,
    required this.trend,
    required this.icon,
    this.accentIndex = 0,
  });

  final String title;
  final String value;
  final TrendDelta trend;
  final IconData icon;
  final int accentIndex;

  @override
  Widget build(BuildContext context) {
    final color = AdminColors.chartPalette[accentIndex % AdminColors.chartPalette.length];
    final up = trend.isUp;
    final down = trend.isDown;
    final surface = AdminSurface.of(context);
    final trendColor = up ? AdminColors.positiveBright : surface.textSecondary;
    final trendLabel = trend.formatComparison(
      valueFormatter: (v) => v.toStringAsFixed(0),
      preferPercent: true,
    );

    return Container(
      decoration: BoxDecoration(
        color: surface.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: surface.border.withValues(alpha: 0.7)),
        boxShadow: surface.isDark ? null : AdminColors.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(height: 2.5, color: color),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(icon, size: 16, color: color),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        title.toUpperCase(),
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                              color: surface.textSecondary,
                            ),
                      ),
                    ),
                    Icon(
                      up ? Icons.north_east_rounded : down ? Icons.south_east_rounded : Icons.remove_rounded,
                      size: 14,
                      color: trendColor,
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  value,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        height: 1.1,
                        color: surface.textPrimary,
                      ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Text(
                  trendLabel,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: trendColor,
                        height: 1.3,
                      ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Shows first [initialCount] items; expands when list is long.
class AdminExpandableListSection extends StatefulWidget {
  const AdminExpandableListSection({
    super.key,
    required this.children,
    this.initialCount = 8,
    this.denseThreshold = 12,
  });

  final List<Widget> children;
  final int initialCount;
  final int denseThreshold;

  @override
  State<AdminExpandableListSection> createState() => _AdminExpandableListSectionState();
}

class _AdminExpandableListSectionState extends State<AdminExpandableListSection> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final items = widget.children;
    if (items.isEmpty) return const SizedBox.shrink();

    final needsCollapse = items.length > widget.initialCount;
    final visible = !needsCollapse || _expanded ? items : items.take(widget.initialCount).toList();
    final dense = items.length >= widget.denseThreshold;
    final gap = dense ? 6.0 : 10.0;

    return Column(
      children: [
        for (var i = 0; i < visible.length; i++) ...[
          if (i > 0) SizedBox(height: gap),
          visible[i],
        ],
        if (needsCollapse) ...[
          SizedBox(height: gap),
          TextButton(
            onPressed: () => setState(() => _expanded = !_expanded),
            child: Text(_expanded ? 'Show less' : 'Show ${items.length - widget.initialCount} more'),
          ),
        ],
      ],
    );
  }
}

class AdminDonutChart extends StatefulWidget {
  const AdminDonutChart({
    super.key,
    required this.slices,
    this.centerLabel = 'TOTAL',
    this.centerValue,
    this.size = 180,
    this.showLegend = true,
    this.compactLegend = false,
  });

  final List<({String label, int value, double percentage})> slices;
  final String centerLabel;
  final String? centerValue;
  final double size;
  final bool showLegend;
  final bool compactLegend;

  @override
  State<AdminDonutChart> createState() => _AdminDonutChartState();
}

class _AdminDonutChartState extends State<AdminDonutChart> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.slices.isEmpty) {
      return SizedBox(height: widget.size, child: const Center(child: Text('No data')));
    }

    final total = widget.slices.fold(0, (s, e) => s + e.value);
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Column(
          children: [
            SizedBox(
              height: widget.size,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  PieChart(
                    PieChartData(
                      startDegreeOffset: -90,
                      sectionsSpace: 2,
                      centerSpaceRadius: widget.size * 0.32,
                      sections: [
                        for (var i = 0; i < widget.slices.length; i++)
                          PieChartSectionData(
                            value: widget.slices[i].value * _controller.value,
                            color: AdminColors.chartPalette[i % AdminColors.chartPalette.length],
                            radius: 22,
                            showTitle: false,
                          ),
                      ],
                    ),
                    duration: Duration.zero,
                  ),
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(widget.centerLabel, style: Theme.of(context).textTheme.labelSmall),
                      Text(
                        widget.centerValue ?? '$total',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (widget.showLegend) ...[
              const SizedBox(height: 12),
              if (widget.compactLegend)
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (var i = 0; i < widget.slices.length; i++)
                      _compactLegendChip(widget.slices[i], AdminColors.chartPalette[i % AdminColors.chartPalette.length]),
                  ],
                )
              else
                ...widget.slices.asMap().entries.map((entry) {
                  final i = entry.key;
                  final s = entry.value;
                  final color = AdminColors.chartPalette[i % AdminColors.chartPalette.length];
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: AdminColors.canvas,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AdminColors.border),
                    ),
                    child: Row(
                      children: [
                        Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                        const SizedBox(width: 10),
                        Expanded(child: Text(s.label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
                        Text(
                          '${s.value} (${s.percentage.toStringAsFixed(1)}%)',
                          style: TextStyle(fontWeight: FontWeight.w700, color: color, fontSize: 12),
                        ),
                      ],
                    ),
                  );
                }),
            ],
          ],
        );
      },
    );
  }

  Widget _compactLegendChip(({String label, int value, double percentage}) s, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AdminColors.canvas,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AdminColors.border.withValues(alpha: 0.8)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 7, height: 7, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(s.label, style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w600)),
          const SizedBox(width: 4),
          Text('${s.percentage.toStringAsFixed(0)}%', style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
        ],
      ),
    );
  }
}

class AdminBarChart extends StatelessWidget {
  const AdminBarChart({super.key, required this.values, this.height = 200, this.color});

  final List<double> values;
  final double height;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    if (values.isEmpty) return SizedBox(height: height, child: const Center(child: Text('No data')));
    final barColor = color ?? Theme.of(context).colorScheme.primary;
    final maxY = values.reduce((a, b) => a > b ? a : b);
    return SizedBox(
      height: height,
      child: BarChart(
        BarChartData(
          maxY: maxY * 1.15,
          gridData: const FlGridData(show: false),
          borderData: FlBorderData(show: false),
          titlesData: const FlTitlesData(show: false),
          barGroups: [
            for (var i = 0; i < values.length; i++)
              BarChartGroupData(
                x: i,
                barRods: [
                  BarChartRodData(
                    toY: values[i],
                    color: barColor,
                    width: 8,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                  ),
                ],
              ),
          ],
        ),
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeOutCubic,
      ),
    );
  }
}
