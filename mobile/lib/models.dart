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

class Project {
  final String id;
  final String title;
  final int pageCount;
  final List<String> partNames;
  final DateTime updatedAt;

  Project({
    required this.id,
    required this.title,
    required this.pageCount,
    required this.partNames,
    required this.updatedAt,
  });

  factory Project.fromJson(Map<String, dynamic> j) => Project(
        id: '${j['_id'] ?? j['id'] ?? ''}',
        title: (j['title'] as String?) ?? 'Untitled',
        pageCount: (j['pageCount'] as num?)?.toInt() ?? 0,
        partNames: ((j['partNames'] as List?) ?? []).map((e) => '$e').toList(),
        updatedAt:
            DateTime.tryParse('${j['updatedAt'] ?? ''}') ?? DateTime.now(),
      );
}

/// Shown until GET /api/projects exists on the server.
final List<Project> sampleProjects = [
  Project(
    id: 'sample1',
    title: 'First Suite in E-flat',
    pageCount: 6,
    partNames: ['Flute', 'Clarinet', 'Trumpet', 'Trombone', 'Tuba'],
    updatedAt: DateTime(2026, 11, 18, 21, 0),
  ),
  Project(
    id: 'sample2',
    title: 'Ode to Joy (String Quartet)',
    pageCount: 2,
    partNames: ['Violin I', 'Violin II', 'Viola', 'Cello'],
    updatedAt: DateTime(2026, 11, 12, 14, 30),
  ),
  Project(
    id: 'sample3',
    title: 'Pachelbel Canon in D',
    pageCount: 4,
    partNames: ['Violin I', 'Violin II', 'Violin III', 'Continuo'],
    updatedAt: DateTime(2026, 11, 3, 10, 15),
  ),
  Project(
    id: 'sample4',
    title: 'Stars and Stripes Forever',
    pageCount: 9,
    partNames: [
      'Piccolo', 'Flute', 'Oboe', 'Clarinet', 'Alto Sax', 'Trumpet',
      'Horn', 'Trombone', 'Tuba', 'Snare Drum', 'Bass Drum'
    ],
    updatedAt: DateTime(2026, 10, 28, 9, 0),
  ),
  Project(
    id: 'sample5',
    title: 'Amazing Grace (Brass Quintet)',
    pageCount: 1,
    partNames: ['Trumpet 1', 'Trumpet 2', 'Horn', 'Trombone', 'Tuba'],
    updatedAt: DateTime(2026, 10, 20, 16, 45),
  ),
];
