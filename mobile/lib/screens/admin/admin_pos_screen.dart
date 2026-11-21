import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../models/user_model.dart';
import '../../services/admin_service.dart';
import '../../theme/admin_theme.dart';
import '../../utils/admin_context.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_ui_kit.dart';

class AdminPosScreen extends StatefulWidget {
  const AdminPosScreen({super.key, required this.user, this.embedded = false, this.bare = false});

  final UserModel user;
  final bool embedded;
  final bool bare;

  @override
  State<AdminPosScreen> createState() => _AdminPosScreenState();
}

class _AdminPosScreenState extends State<AdminPosScreen> {
  final _codeController = TextEditingController();
  final List<PosLine> _lines = [];
  String _paymentMethod = 'cash';
  bool _busy = false;

  static const _methods = [
    ('cash', 'Cash'),
    ('khqr', 'Bakong KHQR'),
    ('debit', 'Debit card'),
    ('credit', 'Credit card'),
  ];

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  double get _subtotal => _lines.fold(0, (sum, l) => sum + l.lineTotal);

  Future<void> _lookupAndAdd([String? code]) async {
    final raw = (code ?? _codeController.text).trim();
    if (raw.isEmpty) return;

    setState(() => _busy = true);
    try {
      final row = await AdminService(context.read<ApiClient>()).barcodeLookup(raw);
      if (!mounted) return;
      if (row == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No product matches this code')),
        );
        return;
      }
      final existing = _lines.indexWhere((l) => l.code == row.code);
      setState(() {
        if (existing >= 0) {
          final old = _lines[existing];
          _lines[existing] = PosLine(
            code: old.code,
            name: old.name,
            qty: old.qty + 1,
            unitPrice: old.unitPrice,
          );
        } else {
          _lines.add(PosLine(code: row.code, name: row.name, qty: 1, unitPrice: row.price));
        }
        _codeController.clear();
      });
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _completeSale() async {
    if (_lines.isEmpty) return;
    setState(() => _busy = true);
    try {
      final result = await AdminService(context.read<ApiClient>()).completePosSale(
        lines: _lines,
        paymentMethod: _paymentMethod,
      );
      if (!mounted) return;
      setState(() => _lines.clear());
      if (result.qrString != null) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: Text('Receipt ${result.orderNumber}'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Ask customer to scan this KHQR'),
                const SizedBox(height: 12),
                QrImageView(data: result.qrString!, size: 200),
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Done')),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Sale ${result.orderNumber} recorded')),
        );
      }
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!AdminPermissions.has(widget.user, 'checkout', 'view')) {
      return AdminScreenLayout(
        title: 'POS',
        subtitle: 'In-store sales',
        user: widget.user,
        child: const AdminAccessDenied(title: 'POS access denied'),
      );
    }

    final fmt = AdminFmt.of(context);
    final canSell = AdminPermissions.has(widget.user, 'checkout', 'create');

    final body = Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 16),
            children: [
              AdminAppear(
                index: 0,
                child: AdminSearchField(
                  controller: _codeController,
                  hint: 'Barcode / slug / product URL',
                  prefixIcon: Icons.qr_code_scanner_rounded,
                  onSubmitted: (_) => _lookupAndAdd(),
                ),
              ),
              const SizedBox(height: 12),
              AdminAppear(
                index: 1,
                child: FilledButton.icon(
                  onPressed: _busy ? null : () => _lookupAndAdd(),
                  icon: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.add_rounded),
                  label: const Text('Add item'),
                ),
              ),
              const SizedBox(height: 20),
              if (_lines.isEmpty)
                AdminAppear(
                  index: 2,
                  child: AdminSoftCard(
                    padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
                    child: Column(
                      children: [
                        Icon(Icons.shopping_cart_outlined, size: 48, color: AdminColors.accent.withValues(alpha: 0.5)),
                        const SizedBox(height: 12),
                        Text(
                          'Scan or enter a barcode to start',
                          style: Theme.of(context).textTheme.bodyMedium,
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                )
              else
                ...[
                  for (var i = 0; i < _lines.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: AdminListRow(
                        index: i + 2,
                        title: _lines[i].name,
                        subtitle: '${fmt.usd(_lines[i].unitPrice)} × ${_lines[i].qty}',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _qtyBtn(Icons.remove_rounded, () {
                              setState(() {
                                if (_lines[i].qty <= 1) {
                                  _lines.removeAt(i);
                                } else {
                                  final l = _lines[i];
                                  _lines[i] = PosLine(code: l.code, name: l.name, qty: l.qty - 1, unitPrice: l.unitPrice);
                                }
                              });
                            }),
                            _qtyBtn(Icons.add_rounded, () {
                              setState(() {
                                final l = _lines[i];
                                _lines[i] = PosLine(code: l.code, name: l.name, qty: l.qty + 1, unitPrice: l.unitPrice);
                              });
                            }),
                          ],
                        ),
                      ),
                    ),
                ],
            ],
          ),
        ),
      ],
    );

    final checkout = Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            initialValue: _paymentMethod,
            decoration: const InputDecoration(labelText: 'Payment method'),
            items: _methods.map((m) => DropdownMenuItem(value: m.$1, child: Text(m.$2))).toList(),
            onChanged: _busy ? null : (v) => setState(() => _paymentMethod = v ?? 'cash'),
          ),
          const SizedBox(height: 14),
          Text(
            fmt.usd(_subtotal),
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text('Total', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: !canSell || _lines.isEmpty || _busy ? null : _completeSale,
            child: _busy
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Complete sale'),
          ),
        ],
      ),
    );

    if (widget.bare) {
      return AdminBackdrop(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 8, 22, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Checkout', style: Theme.of(context).textTheme.titleLarge),
                  Text('Full POS sale', style: Theme.of(context).textTheme.bodyMedium),
                ],
              ),
            ),
            Expanded(child: body),
            checkout,
          ],
        ),
      );
    }

    return AdminScreenLayout(
      title: 'POS',
      subtitle: 'In-store sales',
      user: widget.user,
      floatingBottom: checkout,
      child: body,
    );
  }

  Widget _qtyBtn(IconData icon, VoidCallback onTap) {
    return Material(
      color: AdminColors.accentLight,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Icon(icon, size: 18, color: AdminColors.accentDark),
        ),
      ),
    );
  }
}
