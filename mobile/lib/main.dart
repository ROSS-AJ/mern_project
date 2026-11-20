import 'package:flutter/material.dart';

import 'screens/login_screen.dart';

void main() => runApp(const PartwiseApp());

class PartwiseApp extends StatelessWidget {
  const PartwiseApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF3D3A8C);
    return MaterialApp(
      title: 'Partwise',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
      darkTheme: ThemeData(
        colorScheme:
            ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.dark),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
      // Rubric: the app always opens on the Login page.
      home: const LoginScreen(),
    );
  }
}
