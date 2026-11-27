import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import 'library_screen.dart';
import 'login_screen.dart';

/// First screen: if the last login on this device still works, go straight
/// to the library; otherwise show Login.
class StartScreen extends StatefulWidget {
  const StartScreen({super.key, this.restore = Api.restoreSession});

  /// Swappable for tests.
  final Future<User?> Function() restore;

  @override
  State<StartScreen> createState() => _StartScreenState();
}

class _StartScreenState extends State<StartScreen> {
  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    User? user;
    try {
      user = await widget.restore();
    } catch (_) {
      user = null; // storage unavailable: just ask for a login
    }
    if (!mounted) return;
    Navigator.of(context).pushReplacement(PageRouteBuilder(
      pageBuilder: (_, __, ___) =>
          user == null ? const LoginScreen() : LibraryScreen(user: user),
      transitionDuration: Duration.zero,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.library_music_rounded, size: 64, color: scheme.primary),
            const SizedBox(height: 24),
            const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2.5)),
          ],
        ),
      ),
    );
  }
}
