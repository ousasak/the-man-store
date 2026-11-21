import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../l10n/l10n_extension.dart';
import '../../models/user_model.dart';
import '../../services/admin_service.dart';
import '../../theme/app_colors.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_list_pagination.dart';
import '../../widgets/admin/admin_ui_kit.dart';
import '../../widgets/common/fs_empty_state.dart';

class AdminReplacementsScreen extends StatefulWidget {
  const AdminReplacementsScreen({super.key, required this.user});

  final UserModel user;

  @override
  State<AdminReplacementsScreen> createState() => _AdminReplacementsScreenState();
}

class _AdminReplacementsScreenState extends State<AdminReplacementsScreen> {
  final _items = <AdminReplacementRow>[];
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
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
      final page = await AdminService(context.read<ApiClient>()).listReplacements(
        page: _page,
        status: 'pending',
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

  Future<void> _approve(AdminReplacementRow row) async {
    try {
      await AdminService(context.read<ApiClient>()).approveReplacement(row.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Replacement approved')));
      _load(reset: true);
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))));
    }
  }

  Future<void> _reject(AdminReplacementRow row) async {
    final notes = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final c = TextEditingController();
        return AlertDialog(
          title: const Text('Reject replacement'),
          content: TextField(controller: c, decoration: const InputDecoration(labelText: 'Reason (required)')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: const Text('Reject')),
          ],
        );
      },
    );
    if (notes == null || notes.isEmpty) return;
    try {
      await AdminService(context.read<ApiClient>()).rejectReplacement(row.id, notes: notes);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Replacement rejected')));
      _load(reset: true);
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;

    if (!AdminPermissions.has(widget.user, 'replacements', 'view')) {
      return AdminModuleScaffold(
        title: l10n.replacements,
        body: const AdminAccessDenied(title: 'Replacements access denied'),
      );
    }

    final canEdit = AdminPermissions.has(widget.user, 'replacements', 'edit');
    final dense = _items.length > 12;

    Widget body;
    if (_loading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (_error != null) {
      body = FsEmptyState(
        icon: Icons.sync_alt_rounded,
        title: 'Error',
        subtitle: _error,
        onAction: () => _load(reset: true),
        actionLabel: l10n.retry,
      );
    } else if (_items.isEmpty) {
      body = const FsEmptyState(icon: Icons.sync_alt_rounded, title: 'No pending cases', subtitle: 'All caught up');
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
                dense: dense,
                onLoadMore: () => _load(),
              );
            }
            final row = _items[i];
            return Padding(
              padding: EdgeInsets.only(bottom: adminListItemGap(_items.length)),
              child: AdminSoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AdminListRow(
                      index: i,
                      dense: dense,
                      title: row.orderNumber ?? 'Case #${row.id}',
                      subtitle: '${row.reason} · ${row.customerName ?? ''}',
                    ),
                    if (canEdit && row.status == 'pending') ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton(onPressed: () => _approve(row), child: const Text('Approve')),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => _reject(row),
                              child: const Text('Reject', style: TextStyle(color: AppColors.error)),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      );
    }

    return AdminModuleScaffold(
      title: l10n.replacements,
      subtitle: 'Pending',
      body: body,
    );
  }
}
