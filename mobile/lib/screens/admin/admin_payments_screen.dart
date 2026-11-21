import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../models/user_model.dart';
import '../../core/admin_navigation.dart';
import '../../l10n/l10n_extension.dart';
import '../../utils/admin_context.dart';
import '../../services/admin_service.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_ui_kit.dart';
import '../../widgets/common/fs_empty_state.dart';

class AdminPaymentsScreen extends StatefulWidget {
  const AdminPaymentsScreen({super.key, required this.user});

  final UserModel user;

  @override
  State<AdminPaymentsScreen> createState() => _AdminPaymentsScreenState();
}

class _AdminPaymentsScreenState extends State<AdminPaymentsScreen> {
  final _items = <AdminPaymentRow>[];
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _page = 1;
  bool _hasMore = true;
  String? _statusFilter; // null = all (matches web admin default)

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
      final page = await AdminService(context.read<ApiClient>()).listPayments(page: _page, status: _statusFilter);
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
    if (!AdminPermissions.has(widget.user, 'payments', 'view')) {
      return AdminTabScaffold(
        title: l10n.payments,
        child: AdminAccessDenied(title: 'Payments access denied'),
      );
    }

    final fmt = AdminFmt.of(context);
    final primary = Theme.of(context).colorScheme.primary;

    Widget body;
    if (_loading) {
      body = Center(child: CircularProgressIndicator(color: primary));
    } else if (_error != null) {
      body = FsEmptyState(
        icon: Icons.payments_outlined,
        title: 'Could not load payments',
        subtitle: _error,
        actionLabel: 'Retry',
        onAction: () => _load(reset: true),
      );
    } else if (_items.isEmpty) {
      body = const FsEmptyState(
        icon: Icons.payments_outlined,
        title: 'No payments yet',
        subtitle: 'Customer payments appear here for review.',
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
                title: row.orderNumber ?? 'Payment #${row.id}',
                subtitle: '${row.method} · ${row.status}',
                trailing: Text(fmt.usd(row.amount), style: const TextStyle(fontWeight: FontWeight.w800)),
                onTap: () => AdminNavigation.openPaymentDetail(context, user: widget.user, paymentId: row.id),
              ),
            );
          },
        ),
      );
    }

    return AdminTabScaffold(
      title: l10n.payments,
      subtitle: _loading ? '…' : '${fmt.formatNum(_items.length)} records',
      trailing: PopupMenuButton<String?>(
        onSelected: (v) {
          _statusFilter = v;
          _load(reset: true);
        },
        itemBuilder: (_) => const [
          PopupMenuItem(value: null, child: Text('All')),
          PopupMenuItem(value: 'pending', child: Text('Pending')),
          PopupMenuItem(value: 'paid', child: Text('Paid')),
          PopupMenuItem(value: 'failed', child: Text('Failed')),
        ],
      ),
      child: body,
    );
  }
}
