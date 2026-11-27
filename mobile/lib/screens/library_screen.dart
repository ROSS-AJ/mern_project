import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../session.dart';
import 'login_screen.dart';
import 'project_screen.dart';

enum SortBy { newest, oldest, titleAz, titleZa, mostParts }

extension on SortBy {
  String get label => switch (this) {
        SortBy.newest => 'Newest first',
        SortBy.oldest => 'Oldest first',
        SortBy.titleAz => 'Title A–Z',
        SortBy.titleZa => 'Title Z–A',
        SortBy.mostParts => 'Most parts',
      };
}

typedef ProjectLoader = Future<List<Project>> Function(String token);

/// Main page after login: the user's score library. Mobile can view,
/// export, upload, rename and delete projects, but not edit them.
class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, required this.user, this.loader});
  final User user;

  /// Swappable for tests. Defaults to GET /api/projects.
  final ProjectLoader? loader;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final _search = TextEditingController();
  List<Project> _all = [];
  bool _loading = true;
  bool _uploading = false;
  String? _error;
  SortBy _sort = SortBy.newest;

  String get _token => widget.user.token;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _all.isEmpty;
      _error = null;
    });
    try {
      final list = await (widget.loader ?? Api.listProjects)(_token);
      if (!mounted) return;
      setState(() => _all = list);
    } catch (e) {
      if (!mounted) return;
      if (e is ApiException && e.isUnauthorized) {
        await handleApiError(context, e);
        return;
      }
      setState(() => _error = friendlyError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Project> get _visible {
    final q = _search.text.trim().toLowerCase();
    final list = _all.where((p) {
      if (q.isEmpty) return true;
      return p.title.toLowerCase().contains(q) ||
          p.partNames.any((n) => n.toLowerCase().contains(q));
    }).toList();
    switch (_sort) {
      case SortBy.newest:
        list.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
      case SortBy.oldest:
        list.sort((a, b) => a.updatedAt.compareTo(b.updatedAt));
      case SortBy.titleAz:
        list.sort(
            (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
      case SortBy.titleZa:
        list.sort(
            (a, b) => b.title.toLowerCase().compareTo(a.title.toLowerCase()));
      case SortBy.mostParts:
        list.sort((a, b) => b.partNames.length.compareTo(a.partNames.length));
    }
    return list;
  }

  Future<void> _logout() async {
    await Api.clearToken();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Future<void> _upload() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'partwise'],
    );
    final file = picked?.files.single;
    if (file == null || file.path == null) return;
    setState(() => _uploading = true);
    try {
      final project = await Api.uploadProject(_token, file.path!, file.name);
      if (!mounted) return;
      setState(() => _all = [project, ..._all]);
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Uploaded "${project.title}"')));
    } catch (e) {
      if (mounted) await handleApiError(context, e);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _open(Project p) async {
    final result = await Navigator.of(context).push<ProjectResult>(
      MaterialPageRoute(
          builder: (_) => ProjectScreen(project: p, token: _token)),
    );
    if (result == null || !mounted) return;
    setState(() {
      if (result.deleted) {
        _all.removeWhere((x) => x.id == p.id);
      } else if (result.updated != null) {
        _all = [
          for (final x in _all) x.id == p.id ? result.updated! : x,
        ];
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final items = _visible;
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Library'),
        actions: [
          PopupMenuButton<String>(
            icon: CircleAvatar(
              radius: 16,
              child: Text(widget.user.displayName.isEmpty
                  ? '?'
                  : widget.user.displayName[0].toUpperCase()),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(
                enabled: false,
                child: Text(
                    '${widget.user.firstName} ${widget.user.lastName}\n@${widget.user.login}'),
              ),
              const PopupMenuItem(value: 'logout', child: Text('Log out')),
            ],
            onSelected: (v) {
              if (v == 'logout') _logout();
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _uploading ? null : _upload,
        icon: _uploading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.upload_file),
        label: Text(_uploading ? 'Uploading…' : 'Upload'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              sliver: SliverList.list(children: [
                Text('Welcome, ${widget.user.displayName}!',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 4),
                Text(
                    'View, export and manage your scores. Editing is done on the website.',
                    style: TextStyle(color: scheme.onSurfaceVariant)),
                const SizedBox(height: 12),
                TextField(
                  controller: _search,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Search titles or instruments',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _search.text.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () => setState(() => _search.clear()),
                          ),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text('${items.length} of ${_all.length} projects',
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: scheme.onSurfaceVariant)),
                    ),
                    const Icon(Icons.sort, size: 20),
                    const SizedBox(width: 4),
                    DropdownButton<SortBy>(
                      value: _sort,
                      underline: const SizedBox.shrink(),
                      items: SortBy.values
                          .map((s) =>
                              DropdownMenuItem(value: s, child: Text(s.label)))
                          .toList(),
                      onChanged: (s) => setState(() => _sort = s!),
                    ),
                  ],
                ),
              ]),
            ),
            if (_loading)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && _all.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _Message(
                  icon: Icons.cloud_off,
                  text: _error!,
                  action: FilledButton.tonal(
                      onPressed: _load, child: const Text('Try again')),
                ),
              )
            else if (items.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _Message(
                  icon: Icons.library_music_outlined,
                  text: _all.isEmpty
                      ? 'No projects yet.\nTap Upload to add a PDF or .partwise file.'
                      : 'No projects match "${_search.text}".',
                ),
              )
            else
              SliverPadding(
                // Bottom padding leaves room for the Upload button.
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 96),
                sliver: SliverList.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => _ProjectCard(
                    project: items[i],
                    onTap: () => _open(items[i]),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text, this.action});
  final IconData icon;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 48, color: scheme.onSurfaceVariant),
          const SizedBox(height: 12),
          Text(text,
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurfaceVariant)),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    );
  }
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.project, required this.onTap});
  final Project project;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final parts = project.partNames.length;
    final details = [
      if (parts > 0) '$parts part${parts == 1 ? '' : 's'}',
      if (project.pageCount > 0)
        '${project.pageCount} page${project.pageCount == 1 ? '' : 's'}',
      if (parts == 0 && project.pageCount == 0) 'Not set up yet',
    ].join(' · ');
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 60,
                decoration: BoxDecoration(
                  color: scheme.primaryContainer,
                  borderRadius: BorderRadius.circular(6),
                ),
                child:
                    Icon(Icons.queue_music, color: scheme.onPrimaryContainer),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(project.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text(details,
                        style: TextStyle(color: scheme.onSurfaceVariant)),
                    Text('Updated ${fmtDate(project.updatedAt)}',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: scheme.onSurfaceVariant)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}
