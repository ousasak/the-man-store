import 'package:flutter/foundation.dart';

import '../config/app_config.dart';

bool _isLoopbackHost(String host) {
  final h = host.toLowerCase();
  return h == 'localhost' || h == '127.0.0.1' || h == '[::1]' || h == '0.0.0.0';
}

/// Host that serves `/storage/...` (Laravel). On Flutter web over LAN, use the PC IP, not 127.0.0.1.
String get mediaServingOrigin {
  final configured = AppConfig.backendOrigin;

  if (!kIsWeb) return configured;

  try {
    final backend = Uri.parse(configured);
    final page = Uri.base;
    final pageHost = page.host.toLowerCase();

    if (_isLoopbackHost(backend.host) && !_isLoopbackHost(pageHost)) {
      final port = backend.hasPort ? backend.port : 8001;
      return '${page.scheme}://$pageHost:$port';
    }
  } catch (_) {
    /* fall through */
  }

  return configured;
}

/// Relative path inside `storage/app/public` (no leading "storage/").
String? _publicDiskPath(String value) {
  var v = value.trim();
  if (v.startsWith('/storage/')) {
    v = v.substring('/storage/'.length);
  } else if (v.startsWith('storage/')) {
    v = v.substring('storage/'.length);
  } else {
    return null;
  }
  if (v.isEmpty || v.contains('..')) return null;
  return v;
}

bool _isSiteLogoPath(String value) {
  final v = value.trim().toLowerCase();
  return v == '/logo.png' ||
      v == 'logo.png' ||
      v.endsWith('/logo.png') ||
      v == '/logo.svg' ||
      v == 'logo.svg' ||
      v.endsWith('/logo.svg');
}

String _encodePublicPath(String path) {
  return path.split('/').map(Uri.encodeComponent).join('/');
}

String _apiMediaBase() => AppConfig.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');

bool _isApiHost(String host) {
  try {
    return host.toLowerCase() == Uri.parse(AppConfig.apiBaseUrl).host.toLowerCase();
  } catch (_) {
    return false;
  }
}

/// Flutter web: route external CDN URLs through Laravel so CORS headers are present.
String _webProxiedExternalUrl(String url) {
  if (!kIsWeb) return url;
  try {
    final uri = Uri.parse(url);
    if (uri.scheme != 'http' && uri.scheme != 'https') return url;
    if (_isApiHost(uri.host)) return url;
    if (uri.path.contains('/media/proxy')) return url;
    return '${_apiMediaBase()}/media/proxy?url=${Uri.encodeComponent(url)}';
  } catch (_) {
    return url;
  }
}

/// Resolve product/image paths from the Laravel API (same idea as `frontend/src/lib/images.js`).
String resolveMediaUrl(String? raw) {
  if (raw == null || raw.trim().isEmpty) return '';
  final value = raw.trim();

  if (value.toLowerCase().startsWith('data:')) return value;

  if (kIsWeb) {
    if (_isSiteLogoPath(value)) {
      return AppConfig.siteLogoUrl;
    }
    final diskPath = _publicDiskPath(value);
    if (diskPath != null) {
      return '${_apiMediaBase()}/media/${_encodePublicPath(diskPath)}';
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      final rewritten = _rewriteLoopback(value);
      try {
        final uri = Uri.parse(rewritten);
        if (_isSiteLogoPath(uri.path)) {
          return AppConfig.siteLogoUrl;
        }
        final diskFromUrl = _publicDiskPath(uri.path);
        if (diskFromUrl != null) {
          return '${_apiMediaBase()}/media/${_encodePublicPath(diskFromUrl)}';
        }
      } catch (_) {}
      return _webProxiedExternalUrl(rewritten);
    }
    final diskRelativeWeb = _diskRelativeStoragePath(value);
    if (diskRelativeWeb != null) {
      return '${_apiMediaBase()}/media/${_encodePublicPath(diskRelativeWeb)}';
    }
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return _rewriteLoopback(value);
  }

  final diskRelative = _diskRelativeStoragePath(value);
  if (diskRelative != null) {
    return '$mediaServingOrigin/storage/${_encodePublicPath(diskRelative)}';
  }

  final path = value.startsWith('/') ? value : '/$value';
  return '$mediaServingOrigin$path';
}

/// Disk-relative keys stored in the DB (e.g. `products/cover/abc.jpg`).
String? _diskRelativeStoragePath(String value) {
  var v = value.trim();
  if (v.isEmpty || v.contains('..')) return null;
  if (v.toLowerCase().startsWith('data:')) return null;
  if (v.startsWith('http://') || v.startsWith('https://')) return null;
  if (v.startsWith('/storage/') || v.startsWith('storage/')) return null;
  if (v.startsWith('/')) v = v.substring(1);
  if (!v.contains('/')) return null;
  return v;
}

bool isDataUri(String url) => url.toLowerCase().startsWith('data:');

String _rewriteLoopback(String url) {
  try {
    final uri = Uri.parse(url);
    final host = uri.host.toLowerCase();
    if (host == 'localhost' ||
        host == '127.0.0.1' ||
        host == 'backend' ||
        host == 'host.docker.internal' ||
        host.startsWith('10.0.2.2')) {
      final origin = Uri.parse(mediaServingOrigin);
      return uri
          .replace(
            scheme: origin.scheme,
            host: origin.host,
            port: origin.hasPort ? origin.port : null,
          )
          .toString();
    }
  } catch (_) {}
  return url;
}
