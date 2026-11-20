import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import '../api.dart';
import 'library_screen.dart';
import 'login_error_screen.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.prefillLogin});
  final String? prefillLogin;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  late final _login = TextEditingController(text: widget.prefillLogin);
  final _password = TextEditingController();
  bool _busy = false;
  bool _hidePw = true;

  @override
  void dispose() {
    _login.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final user = await Api.login(_login.text.trim(), _password.text);
      if (!mounted) return;
      _password.clear();
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => LibraryScreen(user: user)),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.status == 403) {
        _showUnverified();
      } else {
        // Wrong username/password (or missing fields): generic failure page.
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const LoginErrorScreen()),
        );
      }
    } on SocketException {
      _snack('No internet connection. Check your network and try again.');
    } on TimeoutException {
      _snack('The server took too long to respond. Try again.');
    } catch (e) {
      _snack('Something went wrong: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _showUnverified() async {
    final email = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Verify your email'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
                'Your account exists but the email has not been verified yet. '
                'Check your inbox for the link, or resend it below.'),
            const SizedBox(height: 16),
            TextField(
              controller: email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
          FilledButton(
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                _snack(await Api.resendVerification(email.text.trim()));
              } catch (e) {
                _snack('$e');
              }
            },
            child: const Text('Resend link'),
          ),
        ],
      ),
    );
  }

  Future<void> _forgotPassword() async {
    final email = TextEditingController();
    final send = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset password'),
        content: TextField(
          controller: email,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(labelText: 'Account email'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Send link')),
        ],
      ),
    );
    if (send != true || email.text.trim().isEmpty) return;
    try {
      _snack(await Api.forgotPassword(email.text.trim()));
    } catch (e) {
      _snack('$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(Icons.library_music_rounded,
                        size: 64, color: scheme.primary),
                    const SizedBox(height: 12),
                    Text('Partwise',
                        textAlign: TextAlign.center,
                        style: Theme.of(context)
                            .textTheme
                            .headlineMedium
                            ?.copyWith(fontWeight: FontWeight.bold)),
                    Text('Split any score into parts',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: scheme.onSurfaceVariant)),
                    const SizedBox(height: 32),
                    TextFormField(
                      key: const Key('login'),
                      controller: _login,
                      autocorrect: false,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Username',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                      validator: (v) => (v == null || v.trim().isEmpty)
                          ? 'Enter your username'
                          : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const Key('password'),
                      controller: _password,
                      obscureText: _hidePw,
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _busy ? null : _submit(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          icon: Icon(_hidePw
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined),
                          onPressed: () => setState(() => _hidePw = !_hidePw),
                        ),
                      ),
                      validator: (v) => (v == null || v.isEmpty)
                          ? 'Enter your password'
                          : null,
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _forgotPassword,
                        child: const Text('Forgot password?'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(48)),
                      child: _busy
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Log in'),
                    ),
                    const SizedBox(height: 24),
                    Wrap(
                      alignment: WrapAlignment.center,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        const Text("Don't have an account?"),
                        TextButton(
                          onPressed: () async {
                            final newLogin =
                                await Navigator.of(context).push<String>(
                              MaterialPageRoute(
                                  builder: (_) => const RegisterScreen()),
                            );
                            if (newLogin != null) {
                              _login.text = newLogin;
                              _password.clear();
                            }
                          },
                          child: const Text('Register'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
