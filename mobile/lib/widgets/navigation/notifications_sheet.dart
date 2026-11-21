import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../l10n/l10n_extension.dart';
import '../../providers/app_settings_provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/notification_service.dart';
import '../../theme/app_colors.dart';
import '../../utils/media_url.dart';
import '../../utils/notification_navigation.dart';
import '../../widgets/common/fs_empty_state.dart';
import '../product_image.dart';

Future<void> showNotificationsSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFFF8FAFC),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const _NotificationsSheetBody(),
  );
}

class _NotificationsSheetBody extends StatefulWidget {
  const _NotificationsSheetBody();

  @override
  State<_NotificationsSheetBody> createState() => _NotificationsSheetBodyState();
}

class _NotificationsSheetBodyState extends State<_NotificationsSheetBody> {
  List<StoreNotification> _items = [];
  int _unread = 0;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final auth = context.read<AuthProvider>();
    final language = context.read<AppSettingsProvider>().language;
    final service = NotificationService(context.read<ApiClient>());
    final result = await service.fetchNotifications(
      isLoggedIn: auth.isLoggedIn,
      language: language,
    );
    if (!mounted) return;
    setState(() {
      _items = result.items;
      _unread = result.unreadCount;
      _error = result.error;
      _loading = false;
    });
  }

  Future<void> _markAllRead() async {
    final auth = context.read<AuthProvider>();
    if (!auth.isLoggedIn) return;
    await NotificationService(context.read<ApiClient>()).markAllRead();
    await _load();
  }

  Future<void> _openItem(StoreNotification item) async {
    final auth = context.read<AuthProvider>();
    final service = NotificationService(context.read<ApiClient>());
    if (auth.isLoggedIn) {
      await service.markAsRead(item);
      if (mounted) {
        setState(() {
          _items = _items
              .map((n) => n.id == item.id ? _copyAsRead(n) : n)
              .toList();
          if (!item.isRead && item.id.startsWith('notification-')) {
            _unread = (_unread - 1).clamp(0, 1 << 30);
          }
        });
      }
    }

    if (!mounted || !item.hasActionableLink) return;
    await openNotificationItem(context, item);
  }

  StoreNotification _copyAsRead(StoreNotification item) {
    return StoreNotification(
      id: item.id,
      title: item.title,
      message: item.message,
      isRead: true,
      type: item.type,
      createdAt: item.createdAt,
      linkUrl: item.linkUrl,
      mediaUrl: item.mediaUrl,
      mediaType: item.mediaType,
      data: item.data,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final onSurface = theme.colorScheme.onSurface;
    final onSurfaceVariant = theme.colorScheme.onSurfaceVariant;
    final border = theme.dividerTheme.color ?? theme.colorScheme.outline;

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.62,
      minChildSize: 0.35,
      maxChildSize: 0.9,
      builder: (context, scrollController) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(20, 14, 12, 12),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border(bottom: BorderSide(color: border.withValues(alpha: 0.5))),
              ),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: AppColors.storeHeader.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.notifications_outlined,
                      size: 20,
                      color: AppColors.storeHeader,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.menuNotifications,
                          style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: onSurface,
                              ),
                        ),
                        if (_unread > 0)
                          Text(
                            '$_unread unread',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: onSurfaceVariant,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (_unread > 0)
                    TextButton(
                      onPressed: _markAllRead,
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.storeHeader,
                      ),
                      child: Text(l10n.markAllRead),
                    ),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? FsEmptyState(
                          icon: Icons.notifications_outlined,
                          title: 'Could not load notifications',
                          subtitle: _error,
                          actionLabel: 'Retry',
                          onAction: _load,
                        )
                      : _items.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 56,
                                  height: 56,
                                  decoration: const BoxDecoration(
                                    color: Color(0xFFF1F5F9),
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(
                                    Icons.notifications_outlined,
                                    color: onSurfaceVariant,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  l10n.notificationsEmpty,
                                  style: theme.textTheme.titleSmall?.copyWith(
                                        fontWeight: FontWeight.w600,
                                        color: onSurface,
                                      ),
                                ),
                              ],
                            ),
                          ),
                        )
                      : ListView.builder(
                          controller: scrollController,
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                          itemCount: _items.length,
                          itemBuilder: (context, i) {
                            final item = _items[i];
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: _NotificationCard(
                                item: item,
                                hasLink: item.hasActionableLink,
                                onTap: () => _openItem(item),
                              ),
                            );
                          },
                        ),
            ),
          ],
        );
      },
    );
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({
    required this.item,
    required this.hasLink,
    required this.onTap,
  });

  final StoreNotification item;
  final bool hasLink;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final onSurface = theme.colorScheme.onSurface;
    final onSurfaceVariant = theme.colorScheme.onSurfaceVariant;
    final border = theme.dividerTheme.color ?? theme.colorScheme.outline;
    final mediaUrl = resolveMediaUrl(item.mediaUrl);
    final showMedia = item.hasDisplayMedia && mediaUrl.isNotEmpty;

    return Material(
      color: Colors.white,
      elevation: 0,
      shadowColor: Colors.black.withValues(alpha: 0.06),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: item.isRead
              ? border.withValues(alpha: 0.55)
              : AppColors.storeHeader.withValues(alpha: 0.35),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (!item.isRead)
                const ColoredBox(
                  color: AppColors.storeHeader,
                  child: SizedBox(width: 3),
                ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (showMedia)
                      _NotificationMediaBanner(
                        item: item,
                        mediaUrl: mediaUrl,
                      ),
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: showMedia
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item.title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                        fontWeight: item.isRead
                                            ? FontWeight.w500
                                            : FontWeight.w700,
                                        color: onSurface,
                                        height: 1.25,
                                      ),
                                ),
                                if (item.message.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    item.message,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: theme.textTheme.bodySmall?.copyWith(
                                          color: onSurfaceVariant,
                                          height: 1.35,
                                        ),
                                  ),
                                ],
                                const SizedBox(height: 8),
                                _NotificationMeta(
                                  item: item,
                                  hasLink: hasLink,
                                  onSurfaceVariant: onSurfaceVariant,
                                ),
                              ],
                            )
                          : Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _NotificationIcon(type: item.type),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item.title,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: theme.textTheme.bodyMedium?.copyWith(
                                              fontWeight: item.isRead
                                                  ? FontWeight.w500
                                                  : FontWeight.w700,
                                              color: onSurface,
                                              height: 1.25,
                                            ),
                                      ),
                                      if (item.message.isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        Text(
                                          item.message,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: theme.textTheme.bodySmall?.copyWith(
                                                color: onSurfaceVariant,
                                                height: 1.35,
                                              ),
                                        ),
                                      ],
                                      const SizedBox(height: 8),
                                      _NotificationMeta(
                                        item: item,
                                        hasLink: hasLink,
                                        onSurfaceVariant: onSurfaceVariant,
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NotificationMediaBanner extends StatelessWidget {
  const _NotificationMediaBanner({
    required this.item,
    required this.mediaUrl,
  });

  final StoreNotification item;
  final String mediaUrl;

  static const double _height = 148;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _height,
      width: double.infinity,
      child: item.resolvedMediaType == 'video'
          ? Stack(
              fit: StackFit.expand,
              children: [
                ProductImage(imageUrl: mediaUrl, fit: BoxFit.cover),
                ColoredBox(
                  color: Colors.black.withValues(alpha: 0.28),
                  child: const Center(
                    child: Icon(Icons.play_arrow_rounded, color: Colors.white, size: 40),
                  ),
                ),
              ],
            )
          : ProductImage(imageUrl: mediaUrl, fit: BoxFit.cover),
    );
  }
}

class _NotificationIcon extends StatelessWidget {
  const _NotificationIcon({required this.type});

  final String type;

  @override
  Widget build(BuildContext context) {
    final border = Theme.of(context).dividerTheme.color ?? Theme.of(context).colorScheme.outline;

    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border.withValues(alpha: 0.45)),
      ),
      alignment: Alignment.center,
      child: Text(
        _notificationEmoji(type),
        style: const TextStyle(fontSize: 28),
      ),
    );
  }
}

class _NotificationMeta extends StatelessWidget {
  const _NotificationMeta({
    required this.item,
    required this.hasLink,
    required this.onSurfaceVariant,
  });

  final StoreNotification item;
  final bool hasLink;
  final Color onSurfaceVariant;

  @override
  Widget build(BuildContext context) {
    final time = item.createdAt != null ? DateFormat.MMMd().format(item.createdAt!) : null;

    return Row(
      children: [
        if (time != null)
          Text(
            time,
            style: TextStyle(fontSize: 11, color: onSurfaceVariant),
          ),
        if (time != null && hasLink)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Text('·', style: TextStyle(color: onSurfaceVariant.withValues(alpha: 0.6))),
          ),
        if (hasLink)
          const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'View',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.storeHeader,
                ),
              ),
              SizedBox(width: 2),
              Icon(
                Icons.chevron_right_rounded,
                size: 14,
                color: AppColors.storeHeader,
              ),
            ],
          ),
      ],
    );
  }
}

String _notificationEmoji(String type) {
  switch (type) {
    case 'order':
      return '📦';
    case 'promotion':
      return '🏷️';
    case 'system':
      return '🔔';
    case 'message':
      return '💬';
    default:
      return '📌';
  }
}
