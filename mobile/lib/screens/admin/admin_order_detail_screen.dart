import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_config.dart';
import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../models/user_model.dart';
import '../../services/admin_service.dart';
import '../../utils/admin_context.dart';
import '../../widgets/admin/admin_ui_kit.dart';
import '../../widgets/admin/order_cod_collection_panel.dart';
import '../../widgets/admin/order_delivery_panel.dart';

class AdminOrderDetailScreen extends StatefulWidget {
  const AdminOrderDetailScreen({super.key, required this.user, required this.orderId});

  final UserModel user;
  final int orderId;

  @override
  State<AdminOrderDetailScreen> createState() => _AdminOrderDetailScreenState();
}

class _AdminOrderDetailScreenState extends State<AdminOrderDetailScreen> {
  AdminOrderDetail? _order;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  static const _statuses = ['awaiting_payment', 'processing', 'shipped', 'completed', 'cancelled'];

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
      final order = await AdminService(context.read<ApiClient>()).getOrder(widget.orderId);
      if (!mounted) return;
      setState(() {
        _order = order;
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

  Future<void> _updateStatus(String status) async {
    if (!AdminPermissions.has(widget.user, 'orders', 'edit')) return;
    setState(() => _saving = true);
    try {
      final svc = AdminService(context.read<ApiClient>());
      await svc.updateOrderStatus(widget.orderId, status);
      final order = await svc.getOrder(widget.orderId);
      if (!mounted) return;
      setState(() {
        _order = order;
        _saving = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Status → $status')));
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))));
    }
  }

  Future<void> _openShopInvoice() async {
    final uri = Uri.parse('${AppConfig.storefrontUrl}/admin/orders/${widget.orderId}/invoice');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open invoice')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = AdminFmt.of(context);
    final canEdit = AdminPermissions.has(widget.user, 'orders', 'edit');

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(title: Text(_order?.orderNumber ?? 'Order #${widget.orderId}')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      AdminSoftCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_order!.orderNumber, style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: 8),
                            Text('Status: ${_order!.status}', style: const TextStyle(fontWeight: FontWeight.w600)),
                            Text('Payment: ${_order!.paymentStatus}${_order!.paymentMethod != null ? ' · ${_order!.paymentMethod}' : ''}'),
                            Text('Total: ${fmt.usd(_order!.total)}', style: const TextStyle(fontWeight: FontWeight.w800)),
                            if (_order!.customerName != null) ...[
                              const Divider(height: 24),
                              Text(_order!.customerName!, style: const TextStyle(fontWeight: FontWeight.w700)),
                              if (_order!.customerEmail != null) Text(_order!.customerEmail!),
                              if (_order!.customerPhone != null)
                                InkWell(
                                  onTap: () => launchUrl(Uri.parse('tel:${_order!.customerPhone}')),
                                  child: Text(_order!.customerPhone!, style: TextStyle(color: Theme.of(context).colorScheme.primary)),
                                ),
                            ],
                            if (_order!.shippingAddress != null && _order!.shippingAddress!.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Text('Ship to: ${_order!.shippingAddress}'),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      OrderDeliveryPanel(
                        order: _order!,
                        onOpenShopInvoice: _openShopInvoice,
                      ),
                      if (_order!.isCod) ...[
                        const SizedBox(height: 16),
                        OrderCodCollectionPanel(
                          order: _order!,
                          canEdit: canEdit,
                          onCollected: (order) {
                            setState(() => _order = order);
                          },
                        ),
                      ],
                      if (canEdit) ...[
                        const SizedBox(height: 16),
                        const AdminSectionTitle(title: 'Update status'),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _statuses.map((s) {
                            final active = _order!.status == s;
                            return ChoiceChip(
                              label: Text(s.replaceAll('_', ' ')),
                              selected: active,
                              onSelected: _saving ? null : (_) => _updateStatus(s),
                            );
                          }).toList(),
                        ),
                      ],
                      const SizedBox(height: 16),
                      const AdminSectionTitle(title: 'Items'),
                      const SizedBox(height: 8),
                      ..._order!.items.map(
                        (item) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: AdminListRow(
                            title: item.name,
                            subtitle: 'Qty ${item.qty}',
                            trailing: Text(fmt.usd(item.price * item.qty)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}
