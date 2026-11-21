import '../core/api_client.dart';

class AdminNotification {
  AdminNotification({
    required this.id,
    required this.message,
    required this.read,
    this.time,
    this.link,
  });

  final int id;
  final String message;
  final bool read;
  final String? time;
  final String? link;

  factory AdminNotification.fromJson(Map<String, dynamic> json) {
    return AdminNotification(
      id: AdminNotificationService._toInt(json['id']),
      message: (json['message'] ?? json['title'] ?? '').toString(),
      read: json['read'] == true,
      time: json['time']?.toString(),
      link: json['link']?.toString(),
    );
  }
}

class AdminNotificationService {
  AdminNotificationService(this._api);

  final ApiClient _api;

  Future<({List<AdminNotification> items, int unreadCount})> fetch() async {
    final res = await _api.dio.get('/admin/notifications');
    final data = res.data as Map;
    final list = data['notifications'];
    final items = list is List
        ? list.whereType<Map>().map((e) => AdminNotification.fromJson(Map<String, dynamic>.from(e))).toList()
        : <AdminNotification>[];
    return (items: items, unreadCount: _toInt(data['unread_count']));
  }

  Future<int> fetchUnreadCount() async {
    try {
      final result = await fetch();
      return result.unreadCount;
    } catch (_) {
      return 0;
    }
  }

  Future<void> markAllRead() async {
    await _api.dio.post('/admin/notifications/mark-all-read');
  }

  static int _toInt(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
}
