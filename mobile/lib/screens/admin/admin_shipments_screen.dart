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

class AdminShipmentsScreen extends StatefulWidget {
  const AdminShipmentsScreen({super.key, required this.user});

  final UserModel user;

  @override
  State<AdminShipmentsScreen> createState() => _AdminShipmentsScreenState();
}

class _AdminShipmentsScreenState extends State<AdminShipmentsScreen> {
  final _items = <AdminShipmentRow>[];
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
      final page = await AdminService(context.read<ApiClient>()).listShipments(
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

  Future<void> _updateStatus(AdminShipmentRow row) async {
    if (!AdminPermissions.has(widget.user, 'shipments', 'edit')) return;
    final next = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: ['pending', 'processing', 'shipped', 'in_transit', 'delivered', 'failed']
              .map((s) => ListTile(title: Text(s), onTap: () => Navigator.pop(ctx, s)))
              .toList(),
        ),
      ),
    );
    if (next == null) return;
    try {
      await AdminService(context.read<ApiClient>()).updateShipmentStatus(row.id, next);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Shipment → $next')));
      _load(reset: true);
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;

    if (!AdminPermissions.has(widget.user, 'shipments', 'view')) {
      return AdminModuleScaffold(
        title: l10n.shipments,
        body: const AdminAccessDenied(title: 'Shipments access denied'),
      );
    }

    final dense = _items.length > 12;

    Widget body;
    if (_loading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (_error != null) {
      body = FsEmptyState(
        icon: Icons.local_shipping_outlined,
        title: 'Error',
        subtitle: _error,
        onAction: () => _load(reset: true),
        actionLabel: l10n.retry,
      );
    } else if (_items.isEmpty) {
      body = const FsEmptyState(icon: Icons.local_shipping_outlined, title: 'No shipments', subtitle: 'Nothing to show');
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
                onTap: AdminPermissions.has(widget.user, 'shipments', 'edit') ? () => _updateStatus(row) : null,
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: AdminListRow(
                  index: i,
                  dense: dense,
                  title: row.trackingCode.isNotEmpty ? row.trackingCode : 'Shipment #${row.id}',
                  subtitle: '${row.status} · Order #${row.orderId}${row.customerName != null ? ' · ${row.customerName}' : ''}',
                  trailing: row.provider != null ? Text(row.provider!) : null,
                ),
              ),
            );
          },
        ),
      );
    }

    return AdminModuleScaffold(
      title: l10n.shipments,
      actions: [
        PopupMenuButton<String?>(
          icon: const Icon(Icons.filter_list_rounded),
          onSelected: (v) {
            _statusFilter = v;
            _load(reset: true);
          },
          itemBuilder: (_) => [
            PopupMenuItem(value: null, child: Text(l10n.all)),
            const PopupMenuItem(value: 'pending', child: Text('Pending')),
            const PopupMenuItem(value: 'shipped', child: Text('Shipped')),
            const PopupMenuItem(value: 'delivered', child: Text('Delivered')),
          ],
        ),
      ],
      body: body,
    );
  }
}
