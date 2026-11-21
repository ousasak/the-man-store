import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../models/header_settings.dart';
import '../../services/storefront_service.dart';
import '../app_logo.dart';

/// Branded auth header — system logo on sage gradient (matches web login/register modal).
class AuthBrandedHeader extends StatefulWidget {
  const AuthBrandedHeader({
    super.key,
    this.title,
    required this.subtitle,
    this.logoHeight = 72,
  });

  final String? title;
  final String subtitle;
  final double logoHeight;

  @override
  State<AuthBrandedHeader> createState() => _AuthBrandedHeaderState();
}

class _AuthBrandedHeaderState extends State<AuthBrandedHeader> {
  HeaderSettings _settings = const HeaderSettings();

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final settings = await StorefrontService(context.read<ApiClient>()).fetchHeaderSettings();
    if (!mounted) return;
    setState(() => _settings = settings);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF4A6B5E), Color(0xFF38554A), Color(0xFF2E4A3F)],
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: widget.logoHeight * 3.2,
            height: widget.logoHeight,
            child: AppLogo(
              logoUrl: _settings.logoUrl,
              logoText: _settings.logoText,
              height: widget.logoHeight,
              onColoredHeader: true,
            ),
          ),
          if (widget.title != null && widget.title!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              widget.title!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 6),
          ] else
            const SizedBox(height: 10),
          Text(
            widget.subtitle,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.85),
              fontSize: 14,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}
