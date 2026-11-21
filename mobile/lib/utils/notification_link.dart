import '../config/app_config.dart';

/// Parsed in-app destination for a storefront notification link.
sealed class NotificationLinkTarget {
  const NotificationLinkTarget();
}

class ProductNotificationLink extends NotificationLinkTarget {
  const ProductNotificationLink(this.slug);

  final String slug;
}

class SearchNotificationLink extends NotificationLinkTarget {
  const SearchNotificationLink({
    this.query,
    this.tab,
    this.parentCategory,
    this.sort,
    this.title = 'Shop',
  });

  final String? query;
  final String? tab;
  final String? parentCategory;
  final String? sort;
  final String title;
}

class BrandNotificationLink extends NotificationLinkTarget {
  const BrandNotificationLink(this.slug);

  final String slug;
}

class CategoryNotificationLink extends NotificationLinkTarget {
  const CategoryNotificationLink(this.slug);

  final String slug;
}

class DiscountsNotificationLink extends NotificationLinkTarget {
  const DiscountsNotificationLink();
}

class OrdersNotificationLink extends NotificationLinkTarget {
  const OrdersNotificationLink();
}

class OrderDetailNotificationLink extends NotificationLinkTarget {
  const OrderDetailNotificationLink(this.orderId);

  final int orderId;
}

/// Opens the React storefront page in an in-app browser (parity with web SPA routes).
class StorefrontWebNotificationLink extends NotificationLinkTarget {
  const StorefrontWebNotificationLink(this.uri);

  final Uri uri;
}

class ExternalNotificationLink extends NotificationLinkTarget {
  const ExternalNotificationLink(this.uri);

  final Uri uri;
}

bool _isStorefrontHost(String host) {
  final h = host.toLowerCase();
  if (h == 'localhost' || h == '127.0.0.1' || h.startsWith('10.') || h.startsWith('192.168.')) {
    return true;
  }
  return h.contains('fitandsleek') || h.contains('onrender.com');
}

Uri _storefrontUriForPath(String pathWithQuery) {
  final base = AppConfig.storefrontUrl.replaceAll(RegExp(r'/+$'), '');
  final path = pathWithQuery.startsWith('/') ? pathWithQuery : '/$pathWithQuery';
  return Uri.parse('$base$path');
}

/// Extract a storefront path (+ query) from a stored notification link.
String? _storefrontPathFromRaw(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    final uri = Uri.tryParse(trimmed);
    if (uri == null) return null;
    if (!_isStorefrontHost(uri.host)) return null;
    final path = uri.path.isEmpty ? '/' : uri.path;
    if (uri.hasQuery) return '$path?${uri.query}';
    return path;
  }

  if (trimmed.startsWith('/')) return trimmed;
  return null;
}

Map<String, String> _queryParams(String path) {
  final idx = path.indexOf('?');
  if (idx < 0) return const {};
  final uri = Uri.tryParse('https://local$path');
  return uri?.queryParameters ?? const {};
}

/// Resolve storefront links from notifications (web parity with `paths.js` + fallback).
NotificationLinkTarget? notificationLinkTarget(String? raw) {
  final trimmed = raw?.trim() ?? '';
  if (trimmed.isEmpty) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    final uri = Uri.tryParse(trimmed);
    if (uri == null) return null;
    if (!_isStorefrontHost(uri.host)) {
      return ExternalNotificationLink(uri);
    }
  }

  final path = _storefrontPathFromRaw(trimmed);
  if (path == null) return null;

  final pathOnly = path.split('?').first.split('#').first;
  final query = _queryParams(path);

  if (pathOnly.startsWith('/p/')) {
    final slug = pathOnly.substring(3);
    if (slug.isNotEmpty) return ProductNotificationLink(slug);
  }
  if (pathOnly.startsWith('/products/')) {
    final slug = pathOnly.substring('/products/'.length);
    if (slug.isNotEmpty) return ProductNotificationLink(slug);
  }

  if (pathOnly == '/orders' || pathOnly == '/profile/orders') {
    return const OrdersNotificationLink();
  }

  final orderMatch = RegExp(r'^/orders/(\d+)$').firstMatch(pathOnly);
  if (orderMatch != null) {
    return OrderDetailNotificationLink(int.parse(orderMatch.group(1)!));
  }

  if (pathOnly == '/search' || pathOnly == '/shop' || pathOnly.startsWith('/search/')) {
    final q = query['q']?.trim();
    final tab = query['tab']?.trim();
    final parent = query['parent_category']?.trim() ?? query['gender']?.trim();
    final sort = query['sort']?.trim();
    final title = (q != null && q.isNotEmpty)
        ? q
        : (tab != null && tab.isNotEmpty ? tab : 'Shop');
    return SearchNotificationLink(
      query: q?.isNotEmpty == true ? q : null,
      tab: tab?.isNotEmpty == true ? tab : null,
      parentCategory: parent?.isNotEmpty == true ? parent : null,
      sort: sort?.isNotEmpty == true ? sort : null,
      title: title,
    );
  }

  final brandMatch = RegExp(r'^/brands?/([^/]+)$').firstMatch(pathOnly);
  if (brandMatch != null) {
    return BrandNotificationLink(Uri.decodeComponent(brandMatch.group(1)!));
  }

  if (pathOnly.startsWith('/category/')) {
    final slug = pathOnly.substring('/category/'.length);
    if (slug.isNotEmpty) return CategoryNotificationLink(Uri.decodeComponent(slug));
  }

  if (pathOnly == '/discounts' || pathOnly.startsWith('/discounts/')) {
    return const DiscountsNotificationLink();
  }

  // Same as web: any other storefront path opens on the website.
  return StorefrontWebNotificationLink(_storefrontUriForPath(path));
}

/// @deprecated Use [notificationLinkTarget].
String? productSlugFromStorefrontLink(String? raw) {
  final target = notificationLinkTarget(raw);
  if (target is ProductNotificationLink) return target.slug;
  return null;
}

bool notificationHasLink(String? raw) => notificationLinkTarget(raw) != null;
