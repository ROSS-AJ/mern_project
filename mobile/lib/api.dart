import 'dart:convert';
import 'dart:typed_data';

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

  bool get isUnauthorized => status == 401;

  @override
  String toString() => message;
}

/// A downloaded file: its bytes and the name the server suggested.
class DownloadedFile {
  final Uint8List bytes;
  final String fileName;
  DownloadedFile(this.bytes, this.fileName);
}

/// Thin wrapper around the Express API.
class Api {
  static const _storage = FlutterSecureStorage();
  static const _tokenKey = 'jwt';
  static const _timeout = Duration(seconds: 15);
  static const _fileTimeout = Duration(seconds: 90);

  static const _userKey = 'user';

  static Future<String?> readToken() => _storage.read(key: _tokenKey);

  /// Signs out on this device: forgets the token and the saved user.
  static Future<void> clearToken() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
  }

  /// The user saved by the last login, if their login still works.
  ///
  /// Returns null (and signs out) when there is no saved login, the token
  /// has run out, or the server rejects it. If the server can't be reached,
  /// keeps the user signed in; the library shows the error and a retry.
  static Future<User?> restoreSession() async {
    final token = await _storage.read(key: _tokenKey);
    final saved = await _storage.read(key: _userKey);
    if (token == null || saved == null) return null;
    final exp = tokenExpiry(token);
    if (exp != null && exp.isBefore(DateTime.now())) {
      await clearToken();
      return null;
    }
    try {
      await http
          .get(Uri.parse('$apiBase/projects'), headers: _auth(token))
          .timeout(const Duration(seconds: 8))
          .then(_decode);
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        await clearToken();
        return null;
      }
    } catch (_) {
      // Offline or slow: stay signed in.
    }
    try {
      return User.fromJson(
          {...jsonDecode(saved) as Map<String, dynamic>, 'token': token});
    } catch (_) {
      await clearToken();
      return null;
    }
  }

  /// When a JWT runs out, read from its payload (no network needed).
  static DateTime? tokenExpiry(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;
      final payload = jsonDecode(
          utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
      final exp = (payload as Map<String, dynamic>)['exp'];
      return exp is num
          ? DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000)
          : null;
    } catch (_) {
      return null;
    }
  }

  static Map<String, String> _auth(String token) =>
      {'Authorization': 'Bearer $token'};

  static Map<String, String> _json(String token) =>
      {..._auth(token), 'Content-Type': 'application/json'};

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
      throw ApiException(res.statusCode,
          (msg == null || msg.isEmpty) ? 'Request failed (${res.statusCode})' : msg);
    }
    return data;
  }

  // ---- Auth ---------------------------------------------------------------

  /// POST /api/login -> user + JWT. Saves the token to secure storage.
  static Future<User> login(String login, String password) async {
    final data = await _post('/login', {'login': login, 'password': password});
    final user = User.fromJson(data);
    await _storage.write(key: _tokenKey, value: user.token);
    await _storage.write(key: _userKey, value: jsonEncode(user.toJson()));
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
    }, timeout: const Duration(seconds: 60)); // server waits on the verify email
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

  // ---- Projects -----------------------------------------------------------

  /// GET /api/projects -> the signed-in user's projects, newest first.
  static Future<List<Project>> listProjects(String token) async {
    final res = await http
        .get(Uri.parse('$apiBase/projects'), headers: _auth(token))
        .timeout(_timeout);
    final data = _decode(res);
    final list = (data['projects'] as List?) ?? const [];
    return list
        .map((e) => Project.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /api/projects/:id/file (the original PDF) or
  /// GET /api/projects/:id/export (a .partwise file: layout + PDF).
  static Future<DownloadedFile> downloadPdf(String token, Project p) =>
      _download(token, '/projects/${p.id}/file', '${_safe(p.title)}.pdf');

  static Future<DownloadedFile> downloadPartwise(String token, Project p) =>
      _download(
          token, '/projects/${p.id}/export', '${_safe(p.title)}.partwise');

  static Future<DownloadedFile> _download(
      String token, String path, String fallbackName) async {
    final res = await http
        .get(Uri.parse('$apiBase$path'), headers: _auth(token))
        .timeout(_fileTimeout);
    if (res.statusCode >= 400) _decode(res); // throws ApiException
    final name = _fileNameFrom(res.headers['content-disposition']) ?? fallbackName;
    return DownloadedFile(res.bodyBytes, name);
  }

  /// POST /api/projects (multipart "file": a PDF or .partwise file).
  static Future<Project> uploadProject(
      String token, String filePath, String fileName) async {
    final req = http.MultipartRequest('POST', Uri.parse('$apiBase/projects'))
      ..headers.addAll(_auth(token))
      ..files.add(await http.MultipartFile.fromPath('file', filePath,
          filename: fileName));
    final streamed = await req.send().timeout(_fileTimeout);
    final res = await http.Response.fromStream(streamed);
    final data = _decode(res);
    return Project.fromJson(data['project'] as Map<String, dynamic>);
  }

  /// Renames a project.
  ///
  /// Tries PATCH /api/projects/:id { title } first. If the server doesn't
  /// have that route yet, falls back to loading the editor layout, changing
  /// its title and saving it with PUT (only works once the project has been
  /// opened in the web editor).
  static Future<Project> renameProject(
      String token, Project p, String newTitle) async {
    final patch = await http
        .patch(Uri.parse('$apiBase/projects/${p.id}'),
            headers: _json(token), body: jsonEncode({'title': newTitle}))
        .timeout(_timeout);
    if (patch.statusCode != 404 || !_isMissingRoute(patch)) {
      final data = _decode(patch);
      return Project.fromJson(data['project'] as Map<String, dynamic>);
    }

    // Fallback: PUT the layout with a new title.
    final getRes = await http
        .get(Uri.parse('$apiBase/projects/${p.id}'), headers: _auth(token))
        .timeout(_timeout);
    final full = _decode(getRes)['project'] as Map<String, dynamic>;
    final layout = full['pageLayout'];
    if (layout is! Map<String, dynamic>) {
      throw ApiException(409,
          'Open this project once in the Partwise website before renaming it on mobile.');
    }
    layout['title'] = newTitle;
    final put = await http
        .put(Uri.parse('$apiBase/projects/${p.id}'),
            headers: _json(token), body: jsonEncode({'layout': layout}))
        .timeout(_timeout);
    final data = _decode(put);
    return Project.fromJson(data['project'] as Map<String, dynamic>);
  }

  /// DELETE /api/projects/:id
  static Future<void> deleteProject(String token, Project p) async {
    final res = await http
        .delete(Uri.parse('$apiBase/projects/${p.id}'), headers: _auth(token))
        .timeout(_timeout);
    _decode(res);
  }

  // ---- Helpers ------------------------------------------------------------

  /// Express answers an unknown route with an HTML "Cannot PATCH ..." page,
  /// while a real 404 from our routes is JSON ({ error }).
  static bool _isMissingRoute(http.Response res) =>
      res.body.contains('Cannot PATCH');

  static String? _fileNameFrom(String? disposition) {
    if (disposition == null) return null;
    final m = RegExp(r'filename="?([^";]+)"?').firstMatch(disposition);
    return m?.group(1);
  }

  static String _safe(String s) {
    final cleaned = s.replaceAll(RegExp(r'[^\w\- ]+'), '').trim();
    return cleaned.isEmpty ? 'score' : cleaned;
  }
}
