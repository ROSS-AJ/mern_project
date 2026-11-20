import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'models.dart';

/// Same backend the Partwise website uses.
const String apiBase = 'https://lamp.rosslampdemo.com/mern/api';

/// Thrown when the server answers with an error status.
class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);

  @override
  String toString() => message;
}

/// Thin wrapper around the Express API.
class Api {
  static const _storage = FlutterSecureStorage();
  static const _tokenKey = 'jwt';
  static const _timeout = Duration(seconds: 15);

  static Future<String?> readToken() => _storage.read(key: _tokenKey);
  static Future<void> clearToken() => _storage.delete(key: _tokenKey);

  static Future<Map<String, dynamic>> _post(
      String path, Map<String, dynamic> body,
      {Duration timeout = _timeout}) async {
    final res = await http
        .post(
          Uri.parse('$apiBase$path'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(timeout);
    return _decode(res);
  }

  static Map<String, dynamic> _decode(http.Response res) {
    Map<String, dynamic> data;
    try {
      data = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      data = {};
    }
    if (res.statusCode >= 400) {
      final msg = (data['error'] as String?)?.trim();
      throw ApiException(
          res.statusCode, (msg == null || msg.isEmpty) ? 'Request failed (${res.statusCode})' : msg);
    }
    return data;
  }

  /// POST /api/login -> user + JWT. Saves the token to secure storage.
  static Future<User> login(String login, String password) async {
    final data = await _post('/login', {'login': login, 'password': password});
    final user = User.fromJson(data);
    await _storage.write(key: _tokenKey, value: user.token);
    return user;
  }

  /// POST /api/register -> returns the server's message.
  static Future<String> register({
    required String firstName,
    required String lastName,
    required String login,
    required String email,
    required String password,
  }) async {
    final data = await _post('/register', {
      'firstName': firstName,
      'lastName': lastName,
      'login': login,
      'email': email,
      'password': password,
    }, timeout: const Duration(seconds: 60)); // server may be slow sending the verify email
    return (data['message'] as String?) ?? 'Account created.';
  }

  static Future<String> resendVerification(String email) async {
    final data = await _post('/resend-verification', {'email': email});
    return (data['message'] as String?) ?? 'Verification email sent.';
  }

  static Future<String> forgotPassword(String email) async {
    final data = await _post('/forgot-password', {'email': email});
    return (data['message'] as String?) ??
        'If that email has an account, a reset link was sent.';
  }

  /// GET /api/projects. Returns null if the server doesn't have this
  /// endpoint yet, so the UI can fall back to sample data.
  static Future<List<Project>?> listProjects(String token) async {
    try {
      final res = await http.get(Uri.parse('$apiBase/projects'), headers: {
        'Authorization': 'Bearer $token',
      }).timeout(_timeout);
      if (res.statusCode == 404) return null;
      final body = jsonDecode(res.body);
      if (res.statusCode >= 400) return null;
      final list = body is List ? body : (body['projects'] as List? ?? []);
      return list
          .map((e) => Project.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return null;
    }
  }
}
