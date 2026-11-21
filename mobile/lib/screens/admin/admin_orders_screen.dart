import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../models/user_model.dart';
import '../../core/admin_navigation.dart';
import '../../l10n/l10n_extension.dart';
import '../../services/admin_service.dart';
import '../../utils/admin_context.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_ui_kit.dart';
import '../../widgets/common/fs_empty_state.dart';

class AdminOrdersScreen extends StatefulWidget {
  const AdminOrdersScreen({super.key, required this.user});

  final UserModel user;

  @override
  State<AdminOrdersScreen> createState() => _AdminOrdersScreenState();
}

class _AdminOrdersScreenState extends State<AdminOrdersScreen> {
  final _search = TextEditingController();
  final _items = <AdminOrderRow>[];
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _page = 1;
  bool _hasMore = true;
  String? _statusFilter;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

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
      final page = await AdminService(context.read<ApiClient>()).listOrders(
        page: _page,
        search: _search.text.trim(),
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

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;
    if (!AdminPermissions.has(widget.user, 'orders', 'view')) {
      return AdminTabScaffold(
        title: l10n.orders,
        child: AdminAccessDenied(title: 'Orders access denied'),
      );
    }

    final fmt = AdminFmt.of(context);
    final primary = Theme.of(context).colorScheme.primary;

    Widget body;
    if (_loading) {
      body = Center(child: CircularProgressIndicator(color: primary));
    } else if (_error != null) {
      body = FsEmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'Could not load orders',
        subtitle: _error,
        actionLabel: l10n.retry,
        onAction: () => _load(reset: true),
      );
    } else if (_items.isEmpty) {
      body = const FsEmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'No orders yet',
        subtitle: 'Orders from the storefront appear here.',
      );
    } else {
      body = RefreshIndicator(
        color: primary,
        onRefresh: () => _load(reset: true),
        child: ListView.builder(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 100),
          itemCount: _items.length + (_hasMore ? 1 : 0),
          itemBuilder: (context, index) {
            if (index >= _items.length) {
              if (_loadingMore) {
                return Padding(padding: const EdgeInsets.all(16), child: Center(child: CircularProgressIndicator(color: primary)));
              }
              _load();
              return const SizedBox.shrink();
            }
            final row = _items[index];
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: AdminListRow(
                index: index,
                title: row.orderNumber,
                subtitle: '${row.paymentLabel} · ${row.status} · ${row.customerName ?? 'Guest'}',
                trailing: Text(fmt.usd(row.total), style: const TextStyle(fontWeight: FontWeight.w800)),
                onTap: () => AdminNavigation.openOrderDetail(context, user: widget.user, orderId: row.id),
              ),
            );
          },
        ),
      );
    }

    return AdminTabScaffold(
      title: l10n.orders,
      subtitle: _loading ? '…' : '${fmt.formatNum(_items.length)} loaded',
      trailing: PopupMenuButton<String?>(
        onSelected: (v) {
          _statusFilter = v;
          _load(reset: true);
        },
        itemBuilder: (_) => const [
          PopupMenuItem(value: null, child: Text('All statuses')),
          PopupMenuItem(value: 'processing', child: Text('Processing')),
          PopupMenuItem(value: 'shipped', child: Text('Shipped')),
          PopupMenuItem(value: 'awaiting_payment', child: Text('Awaiting payment')),
        ],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 8),
            child: AdminSearchField(
              controller: _search,
              hint: l10n.searchOrders,
              onSubmitted: (_) => _load(reset: true),
              onRefresh: () => _load(reset: true),
            ),
          ),
          Expanded(child: body),
        ],
      ),
    );
  }
}
