import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../models/user_model.dart';
import '../../services/admin_service.dart';
import '../../l10n/l10n_extension.dart';
import '../../utils/admin_context.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_ui_kit.dart';

/// Scan sale / payment pickup only — separate from full checkout (web `?pickup=1`).
class AdminScanScreen extends StatefulWidget {
  const AdminScanScreen({super.key, required this.user});

  final UserModel user;

  @override
  State<AdminScanScreen> createState() => _AdminScanScreenState();
}

class _AdminScanScreenState extends State<AdminScanScreen> {
  final _codeController = TextEditingController();
  final _qtyController = TextEditingController(text: '1');
  BarcodeLookup? _preview;
  bool _lookupBusy = false;
  bool _submitBusy = false;
  String? _error;
  DateTime? _lastLookupAt;

  @override
  void initState() {
    super.initState();
    _codeController.addListener(() {
      final t = _codeController.text.trim();
      if (t.length >= 3) {
        _debouncedLookup(t);
      } else if (_preview != null) {
        setState(() => _preview = null);
      }
    });
  }

  @override
  void dispose() {
    _codeController.dispose();
    _qtyController.dispose();
    super.dispose();
  }

  Future<void> _debouncedLookup(String code) async {
    _lastLookupAt = DateTime.now();
    final stamp = _lastLookupAt;
    await Future<void>.delayed(const Duration(milliseconds: 450));
    if (!mounted || stamp != _lastLookupAt || code != _codeController.text.trim()) return;
    await _lookup(code);
  }

  Future<void> _lookup(String code) async {
    setState(() {
      _lookupBusy = true;
      _error = null;
    });
    try {
      final row = await AdminService(context.read<ApiClient>()).barcodeLookup(code);
      if (!mounted || code != _codeController.text.trim()) return;
      setState(() {
        _preview = row;
        _lookupBusy = false;
        if (row == null) _error = 'No product matches this code';
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _preview = null;
        _lookupBusy = false;
        _error = context.read<ApiClient>().apiMessage(e);
      });
    }
  }

  Future<void> _reduceStock() async {
    if (_preview == null) return;
    if (!AdminPermissions.has(widget.user, 'checkout', 'create')) {
      setState(() => _error = 'You don\'t have permission to complete sales.');
      return;
    }
    final qty = int.tryParse(_qtyController.text.trim()) ?? 1;
    setState(() {
      _submitBusy = true;
      _error = null;
    });
    try {
      await AdminService(context.read<ApiClient>()).submitScanSale(code: _preview!.code, qty: qty);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Stock reduced · ${_preview!.name}')));
      setState(() {
        _codeController.clear();
        _preview = null;
        _qtyController.text = '1';
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _error = context.read<ApiClient>().apiMessage(e));
    } finally {
      if (mounted) setState(() => _submitBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;
    if (!AdminPermissions.has(widget.user, 'checkout', 'view')) {
      return AdminTabScaffold(
        title: l10n.scan,
        child: AdminAccessDenied(title: 'Scan access denied'),
      );
    }

    final fmt = AdminFmt.of(context);
    final primary = Theme.of(context).colorScheme.primary;

    return AdminTabScaffold(
      title: l10n.scan,
      subtitle: l10n.checkout,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 100),
        children: [
          AdminSoftCard(
            child: Text(
              'Type or scan a code — product info appears automatically. Confirm to reduce stock.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          const SizedBox(height: 14),
          AdminSearchField(
            controller: _codeController,
            hint: 'Slug, QR URL, or barcode',
            prefixIcon: Icons.qr_code_scanner_rounded,
            onSubmitted: (v) => _lookup(v.trim()),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              SizedBox(
                width: 88,
                child: TextField(
                  controller: _qtyController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Qty'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _submitBusy || _preview == null ? null : _reduceStock,
                  child: _submitBusy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Reduce stock'),
                ),
              ),
            ],
          ),
          if (_lookupBusy) ...[
            const SizedBox(height: 16),
            Center(child: CircularProgressIndicator(color: primary)),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13)),
          ],
          if (_preview != null) ...[
            const SizedBox(height: 16),
            AdminListRow(
              index: 0,
              title: _preview!.name,
              subtitle: '${fmt.usd(_preview!.price)} · ${_preview!.code}',
              trailing: _preview!.maxSellableQty != null ? Text('Max ${_preview!.maxSellableQty}') : null,
            ),
          ],
        ],
      ),
    );
  }
}
