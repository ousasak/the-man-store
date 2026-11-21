import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/admin_auth_navigation.dart';
import '../core/api_client.dart';
import '../core/auth_flow.dart';
import '../providers/auth_provider.dart';
import '../widgets/common/fs_button.dart';
import '../widgets/auth/auth_branded_header.dart';
import '../widgets/auth/auth_social_buttons.dart';
import '../services/social_auth_service.dart';
import 'forgot_password_screen.dart';
import 'otp_screen.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = context.read<AuthProvider>();
    final api = context.read<ApiClient>();
    try {
      final data = await auth.login(
        _emailController.text.trim(),
        _passwordController.text,
      );
      if (!mounted) return;
      if (authRequiresOtpStep(data)) {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => OtpScreen(
              email: _emailController.text.trim(),
              purpose: (data['purpose'] ?? 'login').toString(),
              challengeToken: data['challenge_token']?.toString(),
              notice: data['message']?.toString(),
            ),
          ),
        );
        return;
      }
      if (mounted) navigateAfterAuthentication(context);
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(api.apiMessage(e))),
      );
    }
  }

  Future<void> _socialSignIn(String provider) async {
    final auth = context.read<AuthProvider>();
    try {
      await auth.loginWithSocial(provider);
      if (!mounted) return;
      navigateAfterAuthentication(context);
    } catch (e) {
      if (!mounted) return;
      final message = socialAuthErrorMessage(e);
      if (message.isEmpty) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const AuthBrandedHeader(
                  title: 'Welcome back',
                  subtitle:
                      'Sign in with your The Man Store account. We\'ll email a verification code when needed.',
                ),
                const SizedBox(height: 28),
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(
                    labelText: 'Email address',
                    prefixIcon: Icon(Icons.email_outlined),
                  ),
                  validator: (v) =>
                      v == null || !v.contains('@') ? 'Enter a valid email' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passwordController,
                  obscureText: _obscure,
                  autofillHints: const [AutofillHints.password],
                  decoration: InputDecoration(
                    labelText: 'Password',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  validator: (v) =>
                      v == null || v.length < 8 ? 'Password must be at least 8 characters' : null,
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const ForgotPasswordScreen()),
                    ),
                    child: const Text('Forgot password?'),
                  ),
                ),
                const SizedBox(height: 20),
                FsButton(
                  label: 'Continue',
                  onPressed: auth.busy ? null : _submit,
                  loading: auth.busy,
                  icon: Icons.arrow_forward_rounded,
                ),
                const AuthSocialDivider(),
                AuthSocialButtons(
                  disabled: auth.busy,
                  onGoogle: () => _socialSignIn('google'),
                  onFacebook: () => _socialSignIn('facebook'),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const RegisterScreen()),
                  ),
                  child: const Text('Create a new account'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
