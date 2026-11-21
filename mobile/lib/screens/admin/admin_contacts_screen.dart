import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../l10n/l10n_extension.dart';
import '../../models/user_model.dart';
import '../../services/admin_service.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_list_pagination.dart';
import '../../widgets/admin/admin_ui_kit.dart';
import '../../widgets/common/fs_empty_state.dart';

class AdminContactsScreen extends StatefulWidget {
  const AdminContactsScreen({super.key, required this.user});

  final UserModel user;

  @override
  State<AdminContactsScreen> createState() => _AdminContactsScreenState();
}

class _AdminContactsScreenState extends State<AdminContactsScreen> {
  final _items = <AdminContactRow>[];
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  String? _statusFilter;
  int _page = 1;
  bool _hasMore = true;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  Future<void> _load({bool reset = false}) async {
    if (reset) {
      setState(() {
        _loading = true;
        _error = null;
        _page = 1;
        _hasMore = true;
        _items.clear();
      });
    } else {
      if (_loadingMore || !_hasMore) return;
      setState(() => _loadingMore = true);
    }
    try {
      final page = await AdminService(context.read<ApiClient>()).listContacts(
        page: _page,
        status: _statusFilter,
      );
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _hasMore = page.hasMore;
        _page = page.currentPage + 1;
        _loading = false;
        _loadingMore = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = context.read<ApiClient>().apiMessage(e);
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  Future<void> _openContact(AdminContactRow row) async {
    try {
      final contact = await AdminService(context.read<ApiClient>()).getContact(row.id);
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Theme.of(context).cardColor,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        builder: (ctx) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.65,
          builder: (_, scroll) => ListView(
            controller: scroll,
            padding: const EdgeInsets.all(20),
            children: [
              Text(contact.subject, style: Theme.of(ctx).textTheme.titleLarge),
              Text('${contact.name} · ${contact.email}'),
              if (contact.phone != null) Text(contact.phone!),
              const SizedBox(height: 12),
              Text(contact.message),
              const SizedBox(height: 16),
              if (AdminPermissions.has(widget.user, 'contacts', 'edit')) ...[
                const Text('Update status', style: TextStyle(fontWeight: FontWeight.w700)),
                Wrap(
                  spacing: 8,
                  children: ['new', 'read', 'replied', 'closed'].map((s) {
                    return ActionChip(
                      label: Text(s),
                      onPressed: () async {
                        await AdminService(context.read<ApiClient>()).updateContact(contact.id, status: s);
                        if (ctx.mounted) Navigator.pop(ctx);
                        _load(reset: true);
                      },
                    );
                  }).toList(),
                ),
              ],
            ],
          ),
        ),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;

    if (!AdminPermissions.has(widget.user, 'contacts', 'view')) {
      return AdminModuleScaffold(
        title: l10n.contactInbox,
        body: const AdminAccessDenied(title: 'Contacts access denied'),
      );
    }

    Widget body;
    if (_loading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (_error != null) {
      body = FsEmptyState(
        icon: Icons.mail_outline,
        title: 'Error',
        subtitle: _error,
        onAction: () => _load(reset: true),
        actionLabel: l10n.retry,
      );
    } else if (_items.isEmpty) {
      body = const FsEmptyState(icon: Icons.mail_outline, title: 'No messages', subtitle: 'Inbox is empty');
    } else {
      body = RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: ListView.builder(
          padding: adminListPadding(_items.length),
          itemCount: _items.length + 1,
          itemBuilder: (_, i) {
            if (i == _items.length) {
              return AdminListLoadMoreFooter(
                loading: _loadingMore,
                hasMore: _hasMore,
                dense: _items.length > 12,
                onLoadMore: () => _load(),
              );
            }
            final row = _items[i];
            return Padding(
              padding: EdgeInsets.only(bottom: adminListItemGap(_items.length)),
              child: AdminSoftCard(
                onTap: () => _openContact(row),
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: AdminListRow(
                  index: i,
                  dense: _items.length > 12,
                  title: row.subject,
                  subtitle: '${row.name} · ${row.status}',
                ),
              ),
            );
          },
        ),
      );
    }

    return AdminModuleScaffold(
      title: l10n.contactInbox,
      subtitle: l10n.contacts,
      actions: [
        PopupMenuButton<String?>(
          icon: const Icon(Icons.filter_list_rounded),
          onSelected: (v) {
            _statusFilter = v;
            _load(reset: true);
          },
          itemBuilder: (_) => [
            PopupMenuItem(value: null, child: Text(l10n.all)),
            const PopupMenuItem(value: 'new', child: Text('New')),
            const PopupMenuItem(value: 'read', child: Text('Read')),
            const PopupMenuItem(value: 'replied', child: Text('Replied')),
          ],
        ),
      ],
      body: body,
    );
  }
}
