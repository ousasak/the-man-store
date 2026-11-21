import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

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

class AdminCustomersScreen extends StatefulWidget {
  const AdminCustomersScreen({super.key, required this.user});

  final UserModel user;

  @override
  State<AdminCustomersScreen> createState() => _AdminCustomersScreenState();
}

class _AdminCustomersScreenState extends State<AdminCustomersScreen> {
  final _search = TextEditingController();
  final _items = <AdminCustomerRow>[];
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _page = 1;
  bool _hasMore = true;

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
      final page = await AdminService(context.read<ApiClient>()).listCustomers(
        page: _page,
        search: _search.text.trim(),
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

  Future<void> _showCustomer(AdminCustomerRow row) async {
    try {
      final detail = await AdminService(context.read<ApiClient>()).getCustomer(row.id);
      if (!mounted) return;
      final fmt = AdminFmt.of(context);
      showModalBottomSheet<void>(
        context: context,
        backgroundColor: Theme.of(context).cardColor,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        builder: (ctx) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(detail.name, style: Theme.of(ctx).textTheme.titleLarge),
              Text(detail.email),
              if (detail.phone != null) ...[
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: () => launchUrl(Uri.parse('tel:${detail.phone}')),
                  icon: const Icon(Icons.phone_outlined),
                  label: Text(detail.phone!),
                ),
              ],
              if (detail.ordersCount != null) Text('Orders: ${detail.ordersCount}'),
              if (detail.totalSpent != null) Text('Spent: ${fmt.usd(detail.totalSpent!)}'),
              if (detail.loyaltyTier != null) Text('Tier: ${detail.loyaltyTier!.toUpperCase()}'),
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

    if (!AdminPermissions.has(widget.user, 'customers', 'view')) {
      return AdminModuleScaffold(
        title: l10n.customers,
        body: const AdminAccessDenied(title: 'Customers access denied'),
      );
    }

    final dense = _items.length > 12;

    Widget listBody;
    if (_loading) {
      listBody = const Center(child: CircularProgressIndicator());
    } else if (_error != null) {
      listBody = FsEmptyState(
        icon: Icons.people_outline,
        title: 'Error',
        subtitle: _error,
        onAction: () => _load(reset: true),
        actionLabel: l10n.retry,
      );
    } else if (_items.isEmpty) {
      listBody = const FsEmptyState(icon: Icons.people_outline, title: 'No customers', subtitle: 'Try another search');
    } else {
      listBody = RefreshIndicator(
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
                onTap: () => _showCustomer(row),
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: AdminListRow(
                  index: i,
                  dense: dense,
                  title: row.name,
                  subtitle: row.email,
                  trailing: row.loyaltyTier != null ? Text(row.loyaltyTier!.toUpperCase()) : null,
                ),
              ),
            );
          },
        ),
      );
    }

    return AdminModuleScaffold(
      title: l10n.customers,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 10),
            child: AdminSearchField(
              controller: _search,
              hint: 'Search name, email, phone…',
              onSubmitted: (_) => _load(reset: true),
              onRefresh: () => _load(reset: true),
            ),
          ),
          Expanded(child: listBody),
        ],
      ),
    );
  }
}
