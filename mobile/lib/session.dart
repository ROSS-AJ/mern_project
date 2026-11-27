import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import 'api.dart';
import 'screens/login_screen.dart';

/// Turns any error from an API call into a message for the user.
String friendlyError(Object e) {
  if (e is ApiException) return e.message;
  if (e is SocketException) {
    return 'No internet connection. Check your network and try again.';
  }
  if (e is TimeoutException) {
    return 'The server took too long to respond. Try again.';
  }
  return 'Something went wrong: $e';
}

/// Call from a catch block. If the login expired, clears the token and
/// returns to Login. Otherwise shows the error in a snackbar.
Future<void> handleApiError(BuildContext context, Object e) async {
  if (e is ApiException && e.isUnauthorized) {
    await Api.clearToken();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Your session expired. Please log in again.')));
    return;
  }
  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(friendlyError(e))));
}

String fmtDate(DateTime d) {
  const m = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  return '${m[d.month - 1]} ${d.day}, ${d.year}';
}
