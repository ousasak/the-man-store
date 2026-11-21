import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_navigation.dart';
import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../models/user_model.dart';
import '../../services/admin_service.dart';
import '../../theme/app_colors.dart';
import '../../utils/admin_context.dart';
import '../../widgets/admin/admin_ui_kit.dart';

class AdminPaymentDetailScreen extends StatefulWidget {
  const AdminPaymentDetailScreen({super.key, required this.user, required this.paymentId});

  final UserModel user;
  final int paymentId;

  @override
  State<AdminPaymentDetailScreen> createState() => _AdminPaymentDetailScreenState();
}

class _AdminPaymentDetailScreenState extends State<AdminPaymentDetailScreen> {
  AdminPaymentDetail? _payment;
  bool _loading = true;
  bool _busy = false;
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
    try {
      final payment = await AdminService(context.read<ApiClient>()).getPayment(widget.paymentId);
      if (!mounted) return;
      setState(() {
        _payment = payment;
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = context.read<ApiClient>().apiMessage(e);
        _loading = false;
      });
    }
  }

  Future<void> _verify() async {
    setState(() => _busy = true);
    try {
      final payment = await AdminService(context.read<ApiClient>()).verifyPayment(widget.paymentId);
      if (!mounted) return;
      setState(() {
        _payment = payment;
        _busy = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payment verified')));
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))));
    }
  }

  Future<void> _reject() async {
    final notes = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final c = TextEditingController();
        return AlertDialog(
          title: const Text('Reject payment'),
          content: TextField(controller: c, decoration: const InputDecoration(labelText: 'Reason (optional)')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: const Text('Reject')),
          ],
        );
      },
    );
    if (notes == null) return;
    setState(() => _busy = true);
    try {
      final payment = await AdminService(context.read<ApiClient>()).rejectPayment(widget.paymentId, notes: notes.isEmpty ? null : notes);
      if (!mounted) return;
      setState(() {
        _payment = payment;
        _busy = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payment rejected')));
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = AdminFmt.of(context);
    final canEdit = AdminPermissions.has(widget.user, 'payments', 'edit');
    final p = _payment;
    final isPending = p != null && (p.status == 'pending' || p.status == 'awaiting_verification');

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(title: Text('Payment #${widget.paymentId}')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    AdminSoftCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(fmt.usd(p!.amount), style: Theme.of(context).textTheme.headlineSmall),
                          const SizedBox(height: 8),
                          Text('Status: ${p.status}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('Method: ${p.method}'),
                          if (p.orderNumber != null) Text('Order: ${p.orderNumber}'),
                          if (p.customerName != null) Text('Customer: ${p.customerName}'),
                          if (p.referenceCode != null) Text('Ref: ${p.referenceCode}'),
                        ],
                      ),
                    ),
                    if (p.orderId != null) ...[
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: () => AdminNavigation.openOrderDetail(context, user: widget.user, orderId: p.orderId!),
                        icon: const Icon(Icons.receipt_long_outlined),
                        label: const Text('View order'),
                      ),
                    ],
                    if (canEdit && isPending) ...[
                      const SizedBox(height: 24),
                      FilledButton.icon(
                        onPressed: _busy ? null : _verify,
                        icon: const Icon(Icons.check_circle_outline),
                        label: _busy ? const Text('Working…') : const Text('Verify payment'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: _busy ? null : _reject,
                        icon: const Icon(Icons.cancel_outlined, color: AppColors.error),
                        label: const Text('Reject', style: TextStyle(color: AppColors.error)),
                      ),
                    ],
                  ],
                ),
    );
  }
}
