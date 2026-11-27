import 'package:flutter/material.dart';

import 'screens/start_screen.dart';

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
      // Opens on Login, or straight to the library if this device is
      // still signed in (log out first to demo the login flow).
      home: const StartScreen(),
    );
  }
}
