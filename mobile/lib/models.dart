class User {
  final String id;
  final String firstName;
  final String lastName;
  final String login;
  final String email;
  final String token;

  User({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.login,
    required this.email,
    required this.token,
  });

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: '${j['id'] ?? ''}',
        firstName: (j['firstName'] as String?) ?? '',
        lastName: (j['lastName'] as String?) ?? '',
        login: (j['login'] as String?) ?? '',
        email: (j['email'] as String?) ?? '',
        token: (j['token'] as String?) ?? '',
      );

  String get displayName => firstName.isNotEmpty ? firstName : login;
}

/// Matches the server's project summary (see summary() in server.js).
class Project {
  final String id;
  final String title;
  final String originalName;
  final int size;
  final int pageCount;
  final List<String> partNames;
  final bool hasLayout;
  final DateTime createdAt;
  final DateTime updatedAt;

  Project({
    required this.id,
    required this.title,
    this.originalName = '',
    this.size = 0,
    required this.pageCount,
    required this.partNames,
    this.hasLayout = false,
    DateTime? createdAt,
    required this.updatedAt,
  }) : createdAt = createdAt ?? updatedAt;

  factory Project.fromJson(Map<String, dynamic> j) {
    final updated =
        DateTime.tryParse('${j['updatedAt'] ?? ''}')?.toLocal() ?? DateTime.now();
    return Project(
      id: '${j['_id'] ?? j['id'] ?? ''}',
      title: (j['title'] as String?) ?? 'Untitled score',
      originalName: (j['originalName'] as String?) ?? '',
      size: (j['size'] as num?)?.toInt() ?? 0,
      pageCount: (j['pageCount'] as num?)?.toInt() ?? 0,
      partNames: ((j['partNames'] as List?) ?? []).map((e) => '$e').toList(),
      hasLayout: j['hasLayout'] == true,
      createdAt: DateTime.tryParse('${j['createdAt'] ?? ''}')?.toLocal(),
      updatedAt: updated,
    );
  }

  /// "2.4 MB", "830 KB"
  String get sizeLabel {
    if (size <= 0) return '';
    if (size >= 1024 * 1024) {
      return '${(size / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(size / 1024).ceil()} KB';
  }
}
