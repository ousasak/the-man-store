import 'package:flutter/foundation.dart';

/// API and media URLs for the Laravel backend.
///
/// [fitandsleek.online](https://www.fitandsleek.online/) is the React storefront only —
/// `/api` on that host returns the SPA HTML shell, not JSON. Laravel lives on a separate
/// origin (same map as `frontend/src/lib/backendOrigin.js`).
///
/// Override at run time:
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.10:8001/api
///   flutter run --dart-define=BACKEND_ORIGIN=http://192.168.1.10:8001
class AppConfig {
  AppConfig._();

  static const String _apiFromEnv = String.fromEnvironment('API_BASE_URL');
  static const String _originFromEnv = String.fromEnvironment('BACKEND_ORIGIN');

  /// Public storefront (branding / deep links only — not the API host).
  static const String storefrontUrl = 'https://www.fitandsleek.online';

  /// Laravel API paired with [storefrontUrl] (Railway).
  static const String productionApiBaseUrl =
      'https://fitandsleek-official-v2-production.up.railway.app/api';
  static const String productionBackendOrigin =
      'https://fitandsleek-official-v2-production.up.railway.app';

  static String get defaultApiBaseUrl => productionApiBaseUrl;

  static String get defaultBackendOrigin => productionBackendOrigin;

  static String get apiBaseUrl {
    final raw = _apiFromEnv.trim();
    if (raw.isEmpty) return defaultApiBaseUrl;
    return raw.endsWith('/api') ? raw : '$raw/api';
  }

  static String get backendOrigin {
    final raw = _originFromEnv.trim();
    return raw.isEmpty ? defaultBackendOrigin : raw.replaceAll(RegExp(r'/+$'), '');
  }

  /// Bundled site logo on Laravel `public/logo.png` (raster). Web uses `/logo.svg`.
  static String get siteLogoPath => '/logo.png';

  /// Flutter web: `/api/site-logo` (PNG + CORS). Native uses bundled asset, then storefront PNG.
  static String get siteLogoUrl {
    if (kIsWeb) {
      return '${apiBaseUrl.replaceAll(RegExp(r'/+$'), '')}/site-logo';
    }
    return '$storefrontUrl$siteLogoPath';
  }

  static const String tokenKey = 'fs_token';

  /// OAuth deep link — must match iOS/Android URL scheme and backend MOBILE_OAUTH_CALLBACK_URL.
  static const String oauthCallbackUrl = 'themanstore://oauth/callback';
  static const String oauthCallbackScheme = 'themanstore';
}
