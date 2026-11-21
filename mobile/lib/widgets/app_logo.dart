import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../config/app_assets.dart';
import '../config/app_config.dart';
import '../utils/media_url.dart';

/// Storefront logo — bundled asset shows instantly; optional API URL upgrades when online.
class AppLogo extends StatefulWidget {
  const AppLogo({
    super.key,
    this.logoUrl,
    this.height = 48,
    this.logoText = 'The Man Store',
    this.onColoredHeader = false,
  });

  final String? logoUrl;
  final double height;
  final String logoText;
  final bool onColoredHeader;

  @override
  State<AppLogo> createState() => _AppLogoState();
}

class _AppLogoState extends State<AppLogo> {
  int _candidateIndex = 0;
  bool _networkFailed = false;

  List<String> get _networkCandidates {
    final urls = <String>[];
    final raw = widget.logoUrl?.trim();
    if (raw != null && raw.isNotEmpty) {
      urls.add(resolveMediaUrl(raw));
    }
    urls.add('${AppConfig.storefrontUrl}${AppConfig.siteLogoPath}');
    urls.add('${AppConfig.backendOrigin}${AppConfig.siteLogoPath}');
    return urls.where((u) => u.isNotEmpty).toList();
  }

  String? get _currentNetworkUrl {
    if (_networkFailed) return null;
    final list = _networkCandidates;
    if (list.isEmpty) return null;
    final i = _candidateIndex.clamp(0, list.length - 1);
    return list[i];
  }

  void _tryNextUrl() {
    final list = _networkCandidates;
    if (_candidateIndex + 1 < list.length) {
      setState(() {
        _candidateIndex++;
        _networkFailed = false;
      });
    } else {
      setState(() => _networkFailed = true);
    }
  }

  @override
  void didUpdateWidget(AppLogo oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.logoUrl != widget.logoUrl) {
      _candidateIndex = 0;
      _networkFailed = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final networkUrl = _currentNetworkUrl;

    return Align(
      alignment: widget.onColoredHeader ? Alignment.center : Alignment.centerLeft,
      child: SizedBox(
        height: widget.height,
        width: widget.height * 2.75,
        child: Stack(
          alignment: Alignment.center,
          fit: StackFit.expand,
          children: [
            Image.asset(
              AppAssets.logo,
              fit: BoxFit.contain,
              filterQuality: FilterQuality.high,
            ),
            if (networkUrl != null)
              CachedNetworkImage(
                key: ValueKey(networkUrl),
                imageUrl: networkUrl,
                fit: BoxFit.contain,
                fadeInDuration: const Duration(milliseconds: 200),
                placeholder: (_, __) => const SizedBox.shrink(),
                errorWidget: (_, __, ___) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (mounted) _tryNextUrl();
                  });
                  return const SizedBox.shrink();
                },
              ),
          ],
        ),
      ),
    );
  }
}
