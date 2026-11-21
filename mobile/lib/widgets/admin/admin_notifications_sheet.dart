import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_navigation.dart';
import '../../core/api_client.dart';
import '../../models/user_model.dart';
import '../../providers/auth_provider.dart';
import '../../services/admin_notification_service.dart';
import '../../theme/admin_theme.dart';
import '../../widgets/navigation/admin_bottom_nav.dart';

Future<void> showAdminNotificationsSheet(
  BuildContext context, {
  ValueChanged<AdminNavItem>? onNavigate,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => _AdminNotificationsSheet(onNavigate: onNavigate),
  );
}

class _AdminNotificationsSheet extends StatefulWidget {
  const _AdminNotificationsSheet({this.onNavigate});

  final ValueChanged<AdminNavItem>? onNavigate;

  @override
  State<_AdminNotificationsSheet> createState() => _AdminNotificationsSheetState();
}

class _AdminNotificationsSheetState extends State<_AdminNotificationsSheet> {
  List<AdminNotification> _items = [];
  bool _loading = true;

  UserModel? get _user => context.read<AuthProvider>().user;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final result = await AdminNotificationService(context.read<ApiClient>()).fetch();
      if (!mounted) return;
      setState(() {
        _items = result.items;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markAll() async {
    await AdminNotificationService(context.read<ApiClient>()).markAllRead();
    await _load();
  }

  void _open(AdminNotification n) {
    final user = _user;
    if (user == null) return;
    Navigator.pop(context);
    AdminNavigation.openFromNotificationLink(context, user, n.link, onNavigate: widget.onNavigate);
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.sizeOf(context).height * 0.72;
    return SizedBox(
      height: maxH,
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: AdminColors.border, borderRadius: BorderRadius.circular(4))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 12, 8),
            child: Row(
              children: [
                Expanded(child: Text('Notifications', style: Theme.of(context).textTheme.titleMedium)),
                TextButton(onPressed: _items.isEmpty ? null : _markAll, child: const Text('Mark all read')),
                IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded)),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _items.isEmpty
                    ? Center(child: Text('No notifications yet', style: Theme.of(context).textTheme.bodyMedium))
                    : ListView.separated(
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => Divider(height: 1, color: Theme.of(context).dividerColor),
                        itemBuilder: (_, i) {
                          final n = _items[i];
                          return ListTile(
                            title: Text(n.message, style: TextStyle(fontWeight: n.read ? FontWeight.w500 : FontWeight.w700)),
                            subtitle: n.time != null ? Text(n.time!) : null,
                            onTap: () => _open(n),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
