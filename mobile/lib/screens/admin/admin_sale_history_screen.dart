import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../l10n/l10n_extension.dart';
import '../../models/user_model.dart';
import '../../services/admin_service.dart';
import '../../utils/admin_context.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_list_pagination.dart';
import '../../widgets/admin/admin_ui_kit.dart';
import '../../widgets/common/fs_empty_state.dart';

class AdminSaleHistoryScreen extends StatefulWidget {
  const AdminSaleHistoryScreen({super.key, required this.user});

  final UserModel user;

  @override
  State<AdminSaleHistoryScreen> createState() => _AdminSaleHistoryScreenState();
}

class _AdminSaleHistoryScreenState extends State<AdminSaleHistoryScreen> {
  final _items = <PosSaleHistoryRow>[];
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  double? _todayTotal;
  int? _todayCount;
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
      final page = await AdminService(context.read<ApiClient>()).fetchPosSaleHistory(page: _page);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _hasMore = page.hasMore;
        _page = page.currentPage + 1;
        _todayTotal = page.todayTotal;
        _todayCount = page.todayCount;
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
    final fmt = AdminFmt.of(context);

    if (!AdminPermissions.has(widget.user, 'sale_history', 'view') &&
        !AdminPermissions.has(widget.user, 'checkout', 'view')) {
      return AdminModuleScaffold(
        title: l10n.saleHistory,
        body: const AdminAccessDenied(title: 'Sale history access denied'),
      );
    }

    final dense = _items.length > 12;

    Widget body;
    if (_loading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (_error != null) {
      body = FsEmptyState(
        icon: Icons.history_rounded,
        title: 'Error',
        subtitle: _error,
        onAction: () => _load(reset: true),
        actionLabel: l10n.retry,
      );
    } else {
      body = RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: ListView.builder(
          padding: adminListPadding(_items.length),
          itemCount: _items.length + (_todayTotal != null ? 2 : 1),
          itemBuilder: (_, i) {
            if (i == 0 && _todayTotal != null) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: AdminSoftCard(
                  child: Row(
                    children: [
                      Expanded(child: Text(l10n.today, style: Theme.of(context).textTheme.titleMedium)),
                      Text(
                        '${fmt.formatNum(_todayCount ?? 0)} sales · ${fmt.usd(_todayTotal!)}',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
              );
            }

            final listIndex = i - (_todayTotal != null ? 1 : 0);
            if (listIndex == _items.length) {
              return AdminListLoadMoreFooter(
                loading: _loadingMore,
                hasMore: _hasMore,
                dense: dense,
                onLoadMore: () => _load(),
              );
            }

            final row = _items[listIndex];
            return Padding(
              padding: EdgeInsets.only(bottom: adminListItemGap(_items.length)),
              child: AdminSoftCard(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: AdminListRow(
                  index: listIndex,
                  dense: dense,
                  title: row.orderNumber,
                  subtitle: '${row.paymentMethod} · ${fmt.formatNum(row.itemsCount)} items${row.sellerName != null ? ' · ${row.sellerName}' : ''}',
                  trailing: Text(fmt.usd(row.total), style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
              ),
            );
          },
        ),
      );
    }

    return AdminModuleScaffold(
      title: l10n.saleHistory,
      body: body,
    );
  }
}
