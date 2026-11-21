import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../models/user_model.dart';
import '../../l10n/l10n_extension.dart';
import '../../services/admin_service.dart';
import '../../utils/admin_context.dart';
import '../../widgets/admin/admin_barcode_scanner.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_ui_kit.dart';

/// Unified checkout — matches web `/admin/checkout` (pickup + POS on one page).
class AdminCheckoutScreen extends StatefulWidget {
  const AdminCheckoutScreen({
    super.key,
    required this.user,
    this.focusPickup = false,
  });

  final UserModel user;
  final bool focusPickup;

  @override
  State<AdminCheckoutScreen> createState() => _AdminCheckoutScreenState();
}

class _AdminCheckoutScreenState extends State<AdminCheckoutScreen> {
  final _scrollController = ScrollController();
  final _pickupSectionKey = GlobalKey();
  final _pickupCodeController = TextEditingController();
  final _pickupQtyController = TextEditingController(text: '1');
  final _cartCodeController = TextEditingController();
  final List<PosLine> _lines = [];
  BarcodeLookup? _pickupPreview;
  bool _pickupLookupBusy = false;
  bool _pickupSubmitBusy = false;
  String? _pickupError;
  DateTime? _lastPickupLookupAt;
  String _paymentMethod = 'cash';
  bool _cartBusy = false;

  static const _methods = [
    ('cash', 'Cash'),
    ('khqr', 'Bakong KHQR'),
    ('debit', 'Debit card'),
    ('credit', 'Credit card'),
  ];

  @override
  void initState() {
    super.initState();
    _pickupCodeController.addListener(() {
      final t = _pickupCodeController.text.trim();
      if (t.length >= 3) {
        _debouncedPickupLookup(t);
      } else if (_pickupPreview != null) {
        setState(() => _pickupPreview = null);
      }
    });
    if (widget.focusPickup) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToPickup());
    }
  }

  @override
  void didUpdateWidget(AdminCheckoutScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.focusPickup && !oldWidget.focusPickup) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToPickup());
    }
  }

  void _scrollToPickup() {
    final ctx = _pickupSectionKey.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic);
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _pickupCodeController.dispose();
    _pickupQtyController.dispose();
    _cartCodeController.dispose();
    super.dispose();
  }

  double get _subtotal => _lines.fold(0, (sum, l) => sum + l.lineTotal);
  int get _itemCount => _lines.fold(0, (sum, l) => sum + l.qty);

  Future<void> _debouncedPickupLookup(String code) async {
    _lastPickupLookupAt = DateTime.now();
    final stamp = _lastPickupLookupAt;
    await Future<void>.delayed(const Duration(milliseconds: 450));
    if (!mounted || stamp != _lastPickupLookupAt || code != _pickupCodeController.text.trim()) return;
    await _pickupLookup(code);
  }

  Future<void> _pickupLookup(String code) async {
    setState(() {
      _pickupLookupBusy = true;
      _pickupError = null;
    });
    try {
      final row = await AdminService(context.read<ApiClient>()).barcodeLookup(code);
      if (!mounted || code != _pickupCodeController.text.trim()) return;
      setState(() {
        _pickupPreview = row;
        _pickupLookupBusy = false;
        if (row == null) _pickupError = 'No product matches this code';
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _pickupPreview = null;
        _pickupLookupBusy = false;
        _pickupError = context.read<ApiClient>().apiMessage(e);
      });
    }
  }

  Future<void> _reduceStock() async {
    if (_pickupPreview == null) return;
    if (!AdminPermissions.has(widget.user, 'checkout', 'create')) {
      setState(() => _pickupError = 'You don\'t have permission to complete sales.');
      return;
    }
    final qty = int.tryParse(_pickupQtyController.text.trim()) ?? 1;
    setState(() {
      _pickupSubmitBusy = true;
      _pickupError = null;
    });
    try {
      await AdminService(context.read<ApiClient>()).submitScanSale(code: _pickupPreview!.code, qty: qty);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Stock reduced · ${_pickupPreview!.name}')));
      setState(() {
        _pickupCodeController.clear();
        _pickupPreview = null;
        _pickupQtyController.text = '1';
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _pickupError = context.read<ApiClient>().apiMessage(e));
    } finally {
      if (mounted) setState(() => _pickupSubmitBusy = false);
    }
  }

  Future<void> _lookupAndAdd([String? code]) async {
    final raw = (code ?? _cartCodeController.text).trim();
    if (raw.isEmpty) return;
    setState(() => _cartBusy = true);
    try {
      final row = await AdminService(context.read<ApiClient>()).barcodeLookup(raw);
      if (!mounted) return;
      if (row == null) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No product matches this code')));
        return;
      }
      final existing = _lines.indexWhere((l) => l.code == row.code);
      setState(() {
        if (existing >= 0) {
          final old = _lines[existing];
          _lines[existing] = PosLine(code: old.code, name: old.name, qty: old.qty + 1, unitPrice: old.unitPrice);
        } else {
          _lines.add(PosLine(code: row.code, name: row.name, qty: 1, unitPrice: row.price));
        }
        _cartCodeController.clear();
      });
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))));
    } finally {
      if (mounted) setState(() => _cartBusy = false);
    }
  }

  Future<void> _completeSale() async {
    if (_lines.isEmpty) return;
    setState(() => _cartBusy = true);
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
            actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Done'))],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Sale ${result.orderNumber} recorded')));
      }
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))));
    } finally {
      if (mounted) setState(() => _cartBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;
    if (!AdminPermissions.has(widget.user, 'checkout', 'view')) {
      return AdminTabScaffold(title: l10n.checkout, child: AdminAccessDenied(title: 'Checkout access denied'));
    }

    final fmt = AdminFmt.of(context);
    final primary = Theme.of(context).colorScheme.primary;
    final canSell = AdminPermissions.has(widget.user, 'checkout', 'create');

    return AdminTabScaffold(
      title: l10n.checkout,
      subtitle: 'Scan pickup & in-store sales',
      child: Column(
        children: [
          Expanded(
            child: ListView(
              controller: _scrollController,
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 16),
              children: [
                AdminSoftCard(
                  key: _pickupSectionKey,
                  padding: EdgeInsets.zero,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Scan sale / payment pickup', style: Theme.of(context).textTheme.titleSmall),
                            const SizedBox(height: 4),
                            Text(
                              'Type or scan a code — product info appears automatically. Confirm, then reduce stock.',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ],
                        ),
                      ),
                      const Divider(height: 1),
                      Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Code (scan or type)', style: Theme.of(context).textTheme.labelLarge),
                            const SizedBox(height: 8),
                            AdminSearchField(
                              controller: _pickupCodeController,
                              hint: 'Slug, full URL from QR, or barcode text',
                              prefixIcon: Icons.qr_code_scanner_rounded,
                              onSubmitted: (v) => _pickupLookup(v.trim()),
                            ),
                            const SizedBox(height: 8),
                            AdminBarcodeScanButton(
                              onScanned: (code) {
                                _pickupCodeController.text = code;
                                _pickupLookup(code);
                              },
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                SizedBox(
                                  width: 88,
                                  child: TextField(
                                    controller: _pickupQtyController,
                                    keyboardType: TextInputType.number,
                                    decoration: const InputDecoration(labelText: 'Qty'),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: FilledButton(
                                    onPressed: !canSell || _pickupSubmitBusy || _pickupPreview == null ? null : _reduceStock,
                                    child: _pickupSubmitBusy
                                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                        : const Text('Reduce stock'),
                                  ),
                                ),
                              ],
                            ),
                            if (_pickupLookupBusy) ...[
                              const SizedBox(height: 16),
                              Center(child: CircularProgressIndicator(color: primary)),
                            ],
                            if (_pickupError != null) ...[
                              const SizedBox(height: 12),
                              Text(_pickupError!, style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13)),
                            ],
                            if (_pickupPreview != null) ...[
                              const SizedBox(height: 16),
                              AdminListRow(
                                index: 0,
                                title: _pickupPreview!.name,
                                subtitle: '${fmt.usd(_pickupPreview!.price)} · ${_pickupPreview!.code}',
                                trailing: _pickupPreview!.maxSellableQty != null ? Text('Max ${_pickupPreview!.maxSellableQty}') : null,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                AdminSoftCard(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('In-store sale', style: Theme.of(context).textTheme.titleSmall),
                      const SizedBox(height: 4),
                      Text('Scan a label or product code to add a line.', style: Theme.of(context).textTheme.bodyMedium),
                      const SizedBox(height: 14),
                      Text('Code (scan or type)', style: Theme.of(context).textTheme.labelLarge),
                      const SizedBox(height: 8),
                      AdminSearchField(
                        controller: _cartCodeController,
                        hint: 'Slug, full URL from QR, or barcode text',
                        prefixIcon: Icons.qr_code_scanner_rounded,
                        onSubmitted: (_) => _lookupAndAdd(),
                      ),
                      const SizedBox(height: 8),
                      AdminBarcodeScanButton(
                        onScanned: (code) {
                          _cartCodeController.text = code;
                          _lookupAndAdd(code);
                        },
                      ),
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerRight,
                        child: FilledButton.icon(
                          onPressed: _cartBusy ? null : () => _lookupAndAdd(),
                          icon: _cartBusy
                              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.add_rounded, size: 18),
                          label: const Text('Add line'),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                if (_lines.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(
                      'Your cart is empty.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  )
                else
                  ...[
                    for (var i = 0; i < _lines.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: AdminListRow(
                          index: i,
                          title: '${_lines[i].qty} × ${_lines[i].name}',
                          subtitle: '${fmt.usd(_lines[i].unitPrice)} · ${_lines[i].code}',
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(fmt.usd(_lines[i].lineTotal), style: const TextStyle(fontWeight: FontWeight.w800)),
                              const SizedBox(width: 6),
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
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: null,
                    child: Text('Add Discount', style: TextStyle(color: primary.withValues(alpha: 0.45))),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('TOTAL', style: Theme.of(context).textTheme.titleMedium),
                    Text(fmt.usd(_subtotal), style: Theme.of(context).textTheme.titleMedium),
                  ],
                ),
                const SizedBox(height: 100),
              ],
            ),
          ),
          if (canSell)
            Container(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              decoration: BoxDecoration(
                color: Theme.of(context).cardTheme.color?.withValues(alpha: 0.98),
                border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
              ),
              child: SafeArea(
                top: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: _paymentMethod,
                      decoration: const InputDecoration(labelText: 'Payment method', isDense: true),
                      items: _methods.map((m) => DropdownMenuItem(value: m.$1, child: Text(m.$2))).toList(),
                      onChanged: _cartBusy ? null : (v) => setState(() => _paymentMethod = v ?? 'cash'),
                    ),
                    const SizedBox(height: 10),
                    FilledButton(
                      onPressed: _lines.isEmpty || _cartBusy ? null : _completeSale,
                      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: _cartBusy
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Column(
                              children: [
                                Text('$_itemCount ${_itemCount == 1 ? 'item' : 'items'} = ${fmt.usd(_subtotal)}'),
                                const SizedBox(height: 2),
                                Text('Verify details, then pay', style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.9))),
                              ],
                            ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _qtyBtn(IconData icon, VoidCallback onTap) {
    final primary = Theme.of(context).colorScheme.primary;
    return Material(
      color: primary.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Padding(padding: const EdgeInsets.all(6), child: Icon(icon, size: 18, color: primary)),
      ),
    );
  }
}
