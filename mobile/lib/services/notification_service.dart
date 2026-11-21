import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../utils/notification_link.dart';

class StoreNotification {
  StoreNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.isRead,
    required this.type,
    this.createdAt,
    this.linkUrl,
    this.mediaUrl,
    this.mediaType,
    this.data,
  });

  final String id;
  final String title;
  final String message;
  final bool isRead;
  final String type;
  final DateTime? createdAt;
  final String? linkUrl;
  final String? mediaUrl;
  final String? mediaType;
  final Map<String, dynamic>? data;

  /// Best link for tap navigation (explicit URL or inferred from type/data).
  String? get effectiveLinkUrl {
    final direct = linkUrl?.trim();
    if (direct != null && direct.isNotEmpty) return direct;

    final orderId = data?['order_id'];
    if (orderId != null) {
      final id = int.tryParse(orderId.toString());
      if (id != null) return '/orders/$id';
    }

    switch (type) {
      case 'order':
        return '/orders';
      case 'promotion':
        return '/search';
      default:
        return null;
    }
  }

  bool get hasActionableLink {
    final link = effectiveLinkUrl?.trim() ?? '';
    return link.isNotEmpty && notificationLinkTarget(link) != null;
  }

  bool get hasDisplayMedia {
    final url = mediaUrl?.trim() ?? '';
    if (url.isEmpty) return false;
    final type = (mediaType ?? '').toLowerCase();
    if (type == 'video' || type == 'image') return true;
    final inferred = _inferMediaType(url, mediaType);
    if (inferred == 'image' || inferred == 'video') return true;
    // CDN / storage paths without a file extension still carry media.
    return url.startsWith('data:') ||
        url.startsWith('http') ||
        url.startsWith('/') ||
        url.contains('/');
  }

  String get resolvedMediaType => _inferMediaType(mediaUrl ?? '', mediaType);

  factory StoreNotification.fromJson(Map<String, dynamic> json) {
    DateTime? created;
    final raw = json['created_at'];
    if (raw != null) {
      created = DateTime.tryParse(raw.toString());
    }
    return StoreNotification(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Notification',
      message: json['message']?.toString() ?? '',
      isRead: json['is_read'] == true,
      type: json['type']?.toString() ?? 'notification',
      createdAt: created,
      linkUrl: json['link_url']?.toString(),
      mediaUrl: json['media_url']?.toString(),
      mediaType: json['media_type']?.toString(),
      data: _parseData(json['data']),
    );
  }

  static Map<String, dynamic>? _parseData(dynamic raw) {
    if (raw is Map) return Map<String, dynamic>.from(raw);
    return null;
  }
}

String _inferMediaType(String url, String? fallback) {
  final kind = fallback?.trim() ?? '';
  if (kind.isNotEmpty) return kind.toLowerCase();

  final lower = url.toLowerCase();
  if (lower.startsWith('data:video')) return 'video';
  if (lower.startsWith('data:image')) return 'image';
  if (RegExp(r'\.(mp4|webm|ogg)(\?|#|$)').hasMatch(lower)) return 'video';
  if (RegExp(r'\.(jpg|jpeg|png|webp|gif|svg)(\?|#|$)').hasMatch(lower)) {
    return 'image';
  }
  return '';
}

class NotificationService {
  NotificationService(this._api);

  final ApiClient _api;

  Future<int> fetchUnreadCount({
    required bool isLoggedIn,
    String language = 'en',
  }) async {
    try {
      final path = isLoggedIn ? '/notifications/unread-count' : '/notifications/public';
      final res = await _api.dio.get(
        path,
        options: Options(headers: {'Accept-Language': language}),
        queryParameters: path.endsWith('/public') ? {'per_page': 1} : null,
      );
      final data = res.data;
      if (data is Map) {
        return _parseCount(data['unread_count']);
      }
    } catch (_) {}
    return 0;
  }

  Future<({List<StoreNotification> items, int unreadCount, String? error})> fetchNotifications({
    required bool isLoggedIn,
    String language = 'en',
  }) async {
    final headers = {'Accept-Language': language};
    final paths = isLoggedIn
        ? ['/notifications', '/notifications/public']
        : ['/notifications/public'];

    for (final path in paths) {
      try {
        final res = await _api.dio.get(
          path,
          options: Options(headers: headers),
        );
        final parsed = _parseNotificationsResponse(res.data);
        if (parsed != null) {
          return (items: parsed.items, unreadCount: parsed.unreadCount, error: null);
        }
      } on DioException catch (e) {
        if (path != paths.last) continue;
        return (
          items: <StoreNotification>[],
          unreadCount: 0,
          error: _api.apiMessage(e),
        );
      } catch (_) {
        if (path != paths.last) continue;
        return (
          items: <StoreNotification>[],
          unreadCount: 0,
          error: 'Could not load notifications',
        );
      }
    }

    return (items: <StoreNotification>[], unreadCount: 0, error: 'Could not load notifications');
  }

  ({List<StoreNotification> items, int unreadCount})? _parseNotificationsResponse(dynamic data) {
    if (data is! Map) return null;

    final unread = _parseCount(data['unread_count']);
    final block = data['notifications'];
    final list = block is Map ? block['data'] : null;
    if (list is! List) return null;

    final items = list
        .whereType<Map>()
        .map((e) => StoreNotification.fromJson(Map<String, dynamic>.from(e)))
        .toList();

    return (items: items, unreadCount: unread);
  }

  Future<void> markAllRead() async {
    await _api.dio.post('/notifications/mark-all-read');
  }

  Future<void> markAsRead(StoreNotification item) async {
    if (item.isRead || !item.id.startsWith('notification-')) return;
    final rawId = item.id.replaceFirst('notification-', '');
    if (rawId.isEmpty) return;
    try {
      await _api.dio.patch('/notifications/$rawId/read');
    } catch (_) {}
  }

  static int _parseCount(dynamic v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse('$v') ?? 0;
  }
}
