import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/admin_auth_navigation.dart';
import '../core/api_client.dart';
import '../providers/auth_provider.dart';
import '../widgets/auth/auth_branded_header.dart';
import '../widgets/common/fs_button.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({
    super.key,
    required this.email,
    required this.purpose,
    this.challengeToken,
    this.notice,
  });

  final String email;
  final String purpose;
  final String? challengeToken;
  final String? notice;

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _codeController = TextEditingController();

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final auth = context.read<AuthProvider>();
    final api = context.read<ApiClient>();
    try {
      await auth.verifyOtp(
        email: widget.email,
        code: _codeController.text.trim(),
        purpose: widget.purpose,
        challengeToken: widget.challengeToken,
      );
      if (!mounted) return;
      navigateAfterAuthentication(context);
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(api.apiMessage(e))),
      );
    }
  }

  Future<void> _resend() async {
    final auth = context.read<AuthProvider>();
    final api = context.read<ApiClient>();
    try {
      await auth.resendOtp(
        email: widget.email,
        purpose: widget.purpose,
        challengeToken: widget.challengeToken,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('A new code was sent to your email')),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(api.apiMessage(e))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Verify email')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AuthBrandedHeader(
                title: 'Check your inbox',
                subtitle: widget.notice?.trim().isNotEmpty == true
                    ? widget.notice!.trim()
                    : 'We sent a verification code to ${widget.email}',
              ),
              const SizedBox(height: 28),
              TextField(
                controller: _codeController,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: 8),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                decoration: const InputDecoration(
                  labelText: '6-digit code',
                  hintText: '000000',
                ),
              ),
              const SizedBox(height: 28),
              FsButton(
                label: 'Verify & continue',
                onPressed: auth.busy ? null : _verify,
                loading: auth.busy,
                icon: Icons.verified_user_outlined,
              ),
              const SizedBox(height: 12),
              TextButton(onPressed: _resend, child: const Text('Resend code')),
            ],
          ),
        ),
      ),
    );
  }
}
