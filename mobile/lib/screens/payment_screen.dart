import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../l10n/l10n_extension.dart';
import '../l10n/storefront_l10n.dart';
import '../models/khqr_bank_option.dart';
import '../models/order_model.dart';
import '../models/payment_model.dart';
import '../services/payment_service.dart';
import '../theme/app_colors.dart';
import '../widgets/common/fs_button.dart';
import '../widgets/telegram_connect_button.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({
    super.key,
    required this.orderId,
    required this.orderNumber,
    required this.amount,
    this.currency = 'KHR',
    this.bank = KhqrBankId.aba,
    this.onPaid,
  });

  final int orderId;
  final String orderNumber;
  final double amount;
  final String currency;
  final KhqrBankId bank;
  final VoidCallback? onPaid;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  PaymentModel? _payment;
  String _status = 'loading';
  String? _error;
  String? _note;
  Timer? _pollTimer;
  Timer? _countdownTimer;
  Duration _remaining = Duration.zero;
  bool _creating = false;
  bool _showQr = false;
  bool _openingBankApp = false;
  bool _autoOpenAttempted = false;

  KhqrBankOption get _bank => KhqrBankOption.byId(widget.bank);

  @override
  void initState() {
    super.initState();
    _createPayment();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _countdownTimer?.cancel();
    super.dispose();
  }

  void _startCountdown(DateTime? expiresAt) {
    _countdownTimer?.cancel();
    if (expiresAt == null) return;
    void tick() {
      final diff = expiresAt.difference(DateTime.now());
      if (!mounted) return;
      setState(() => _remaining = diff.isNegative ? Duration.zero : diff);
      if (diff.isNegative) _countdownTimer?.cancel();
    }
    tick();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) => tick());
  }

  void _startPolling() {
    _pollTimer?.cancel();
    final paymentId = _payment?.paymentId;
    if (paymentId == null || paymentId == 0) return;
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) => _checkStatus());
  }

  Future<void> _createPayment() async {
    setState(() {
      _creating = true;
      _error = null;
      _status = 'loading';
    });
    try {
      final payment = await context.read<PaymentService>().createBakongPayment(widget.orderId);
      if (!mounted) return;
      _applyPayment(payment);
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = context.read<ApiClient>().apiMessage(e);
        _status = 'error';
      });
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _checkStatus() async {
    final paymentId = _payment?.paymentId;
    if (paymentId == null || paymentId == 0 || _status == 'paid') return;

    try {
      final payment = await context.read<PaymentService>().checkBakongStatus(paymentId);
      if (!mounted) return;
      _applyPayment(payment);
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _note = context.read<ApiClient>().apiMessage(e));
    }
  }

  void _applyPayment(PaymentModel payment) {
    setState(() {
      _payment = payment;
      _status = payment.status;
      _startCountdown(payment.expiresAt);
    });

    if (payment.isPaid) {
      _pollTimer?.cancel();
      widget.onPaid?.call();
      return;
    }

    if (payment.isExpired) {
      _pollTimer?.cancel();
      return;
    }

    _startPolling();

    if (!_autoOpenAttempted &&
        widget.bank == KhqrBankId.aba &&
        payment.hasQr) {
      _autoOpenAttempted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _openBankingApp());
    }
  }

  String _formatAmount() {
    final currency = _payment?.currency ?? widget.currency;
    final amount = _payment?.amount ?? widget.amount;
    if (currency.toUpperCase() == 'KHR') {
      return '${NumberFormat('#,###').format(amount.round())} KHR';
    }
    return NumberFormat.simpleCurrency(name: 'USD').format(amount);
  }

  Future<void> _openBankingApp() async {
    if (_openingBankApp) return;
    final paymentId = _payment?.paymentId;
    if (paymentId == null || paymentId == 0) return;

    setState(() => _openingBankApp = true);
    try {
      final shortLink = await context.read<PaymentService>().fetchBakongDeeplink(paymentId);
      final opened = await launchUrl(
        Uri.parse(shortLink),
        mode: LaunchMode.externalApplication,
      );
      if (!opened && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10nRead.bankAppNotInstalled)),
        );
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = context.read<ApiClient>().apiMessage(e);
      setState(() => _showQr = true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            msg.contains('deeplink') || msg.contains('provider') || msg.contains('unavailable')
                ? context.l10nRead.deeplinkUnavailableScanQr
                : msg,
          ),
          duration: const Duration(seconds: 5),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _showQr = true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10nRead.deeplinkUnavailableScanQr)),
      );
    } finally {
      if (mounted) setState(() => _openingBankApp = false);
    }
  }

  Future<void> _sharePayment() async {
    final qrString = _payment?.qrString;
    if (qrString == null || qrString.isEmpty) return;

    final bill = _payment?.billNumber ?? widget.orderNumber;
    final text =
        'The Man Store\nOrder: ${widget.orderNumber}\nBill: $bill\nAmount: ${_formatAmount()}\n\nPay with any Bakong / KHQR banking app.';

    try {
      final painter = QrPainter(
        data: qrString,
        version: QrVersions.auto,
        gapless: true,
        eyeStyle: const QrEyeStyle(color: Colors.black),
        dataModuleStyle: const QrDataModuleStyle(color: Colors.black),
      );
      final imageData = await painter.toImageData(512, format: ui.ImageByteFormat.png);
      if (imageData != null) {
        final dir = await getTemporaryDirectory();
        final file = File('${dir.path}/khqr-${widget.orderNumber}.png');
        await file.writeAsBytes(imageData.buffer.asUint8List());
        await Share.shareXFiles(
          [XFile(file.path)],
          text: text,
          subject: 'The Man Store payment ${widget.orderNumber}',
        );
        return;
      }
    } catch (_) {
      // Fall back to text-only share.
    }

    await Share.share(text, subject: 'The Man Store payment ${widget.orderNumber}');
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isKm = l10n.isKm;
    final theme = Theme.of(context);
    final onSurfaceVariant = theme.colorScheme.onSurfaceVariant;
    final payLabel = _bank.payButtonLabelEn(isKm);
    final isAba = widget.bank == KhqrBankId.aba;

    return Scaffold(
      appBar: AppBar(title: Text('Pay #${widget.orderNumber}')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _formatAmount(),
              style: theme.textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.primary,
              ),
              textAlign: TextAlign.center,
            ),
            if (_payment?.billNumber != null) ...[
              const SizedBox(height: 6),
              Text(
                l10n.billLabel(_payment!.billNumber!),
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: onSurfaceVariant),
              ),
            ],
            const SizedBox(height: 20),
            if (_creating || _status == 'loading')
              const Center(child: CircularProgressIndicator())
            else if (_status == 'paid')
              _StatusCard(
                icon: Icons.check_circle_outline,
                color: AppColors.success,
                title: l10n.paymentReceived,
                subtitle: l10n.paymentProcessingOrder,
              )
            else if (_status == 'expired')
              _StatusCard(
                icon: Icons.timer_off_outlined,
                color: AppColors.warning,
                title: l10n.paymentQrExpired,
                subtitle: l10n.paymentRegenerateQr,
              )
            else if (_error != null)
              _StatusCard(
                icon: Icons.error_outline,
                color: AppColors.error,
                title: l10n.paymentUnavailable,
                subtitle: _error!,
              )
            else if (_payment?.hasQr == true) ...[
              _MobilePaySteps(l10n: l10n, isAba: isAba),
              const SizedBox(height: 20),
              FsButton(
                label: payLabel,
                variant: FsButtonVariant.accent,
                icon: Icons.account_balance_outlined,
                loading: _openingBankApp,
                onPressed: _openingBankApp ? null : _openBankingApp,
              ),
              if (!isAba) ...[
                const SizedBox(height: 10),
                FsButton(
                  label: l10n.sharePayment,
                  variant: FsButtonVariant.outline,
                  icon: Icons.ios_share_outlined,
                  onPressed: _sharePayment,
                ),
              ],
              const SizedBox(height: 16),
              if (isAba) ...[
                if (!_showQr)
                  Align(
                    alignment: Alignment.center,
                    child: TextButton(
                      onPressed: () => setState(() => _showQr = true),
                      child: Text(l10n.showQrCode),
                    ),
                  )
                else ...[
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => setState(() => _showQr = false),
                      child: Text(l10n.hideQrCode),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: QrImageView(
                        data: _payment!.qrString!,
                        version: QrVersions.auto,
                        size: 200,
                        backgroundColor: Colors.white,
                      ),
                    ),
                  ),
                ],
              ] else ...[
                Center(
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: QrImageView(
                      data: _payment!.qrString!,
                      version: QrVersions.auto,
                      size: 200,
                      backgroundColor: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.mobileKhqrQrHint,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(color: onSurfaceVariant),
                ),
              ],
              if (_remaining > Duration.zero) ...[
                const SizedBox(height: 12),
                Text(
                  l10n.expiresInLabel(
                    '${_remaining.inMinutes}:${(_remaining.inSeconds % 60).toString().padLeft(2, '0')}',
                  ),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium,
                ),
              ],
              const SizedBox(height: 12),
              _StatusPill(status: _status, waitingLabel: l10n.paymentWaiting),
            ],
            if (_note != null) ...[
              const SizedBox(height: 16),
              Text(_note!, style: theme.textTheme.bodySmall),
            ],
            const SizedBox(height: 24),
            if (_status != 'paid')
              FsButton(
                label: _status == 'expired' || _error != null
                    ? l10n.paymentRegenerateQr
                    : l10n.refreshPaymentStatus,
                onPressed: _creating
                    ? null
                    : () {
                        if (_status == 'expired' || _error != null) {
                          _createPayment();
                        } else {
                          _checkStatus();
                        }
                      },
                loading: _creating,
              ),
            if (_status == 'paid') ...[
              const SizedBox(height: 12),
              TelegramConnectButton(orderNumber: widget.orderNumber),
              const SizedBox(height: 12),
              FsButton(
                label: l10n.done,
                variant: FsButtonVariant.accent,
                onPressed: () => Navigator.of(context).pop(true),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MobilePaySteps extends StatelessWidget {
  const _MobilePaySteps({required this.l10n, required this.isAba});

  final StorefrontL10n l10n;
  final bool isAba;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final onSurface = theme.colorScheme.onSurface;
    final onSurfaceVariant = theme.colorScheme.onSurfaceVariant;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.storeHeader.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.storeHeader.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.mobileKhqrTitle,
            style: TextStyle(fontWeight: FontWeight.w700, color: onSurface),
          ),
          const SizedBox(height: 12),
          _StepRow(number: '1', text: isAba ? l10n.mobileAbaStep1 : l10n.mobileKhqrStep1, onSurfaceVariant: onSurfaceVariant),
          const SizedBox(height: 8),
          _StepRow(number: '2', text: l10n.mobileKhqrStep2, onSurfaceVariant: onSurfaceVariant),
          const SizedBox(height: 8),
          _StepRow(number: '3', text: l10n.mobileKhqrStep3, onSurfaceVariant: onSurfaceVariant),
        ],
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.number,
    required this.text,
    required this.onSurfaceVariant,
  });

  final String number;
  final String text;
  final Color onSurfaceVariant;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 22,
          height: 22,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.storeHeader,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            number,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(text, style: TextStyle(color: onSurfaceVariant, height: 1.35)),
        ),
      ],
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 48),
          const SizedBox(height: 12),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(subtitle, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status, required this.waitingLabel});

  final String status;
  final String waitingLabel;

  @override
  Widget build(BuildContext context) {
    final label = status == 'pending' ? waitingLabel : status.replaceAll('_', ' ');
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.accent.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
      ),
    );
  }
}

/// Navigate to payment after checkout.
Future<bool?> openOrderPayment(
  BuildContext context, {
  required OrderModel order,
}) {
  return Navigator.of(context).push<bool>(
    MaterialPageRoute(
      builder: (_) => PaymentScreen(
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.total,
      ),
    ),
  );
}
