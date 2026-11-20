import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import 'login_screen.dart';

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

/// Main page after login: the user's score library (read-only on mobile).
class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, required this.user});
  final User user;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final _search = TextEditingController();
  List<Project> _all = [];
  bool _loading = true;
  bool _usingSamples = false;
  SortBy _sort = SortBy.newest;

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
    setState(() => _loading = true);
    final fromServer = await Api.listProjects(widget.user.token);
    if (!mounted) return;
    setState(() {
      _usingSamples = fromServer == null;
      _all = fromServer ?? List.of(sampleProjects);
      _loading = false;
    });
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
        list.sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
      case SortBy.titleZa:
        list.sort((a, b) => b.title.toLowerCase().compareTo(a.title.toLowerCase()));
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

  void _openProject(Project p) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => _ProjectSheet(project: p),
    );
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
                Text('Browse your scores. Editing is done on the website.',
                    style: TextStyle(color: scheme.onSurfaceVariant)),
                if (_usingSamples) ...[
                  const SizedBox(height: 12),
                  Card(
                    color: scheme.secondaryContainer,
                    child: const ListTile(
                      leading: Icon(Icons.info_outline),
                      title: Text('Showing sample projects'),
                      subtitle: Text(
                          'Library sync with your account is coming soon.'),
                    ),
                  ),
                ],
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
                            onPressed: () =>
                                setState(() => _search.clear()),
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
            else if (items.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: Text(
                    _all.isEmpty
                        ? 'No projects yet. Create one on the website.'
                        : 'No projects match "${_search.text}".',
                    style: TextStyle(color: scheme.onSurfaceVariant),
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                sliver: SliverList.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => _ProjectCard(
                    project: items[i],
                    onTap: () => _openProject(items[i]),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String _fmtDate(DateTime d) {
  const m = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  return '${m[d.month - 1]} ${d.day}, ${d.year}';
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.project, required this.onTap});
  final Project project;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
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
                child: Icon(Icons.queue_music, color: scheme.onPrimaryContainer),
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
                    Text(
                      '${project.partNames.length} parts · '
                      '${project.pageCount} page${project.pageCount == 1 ? '' : 's'}',
                      style: TextStyle(color: scheme.onSurfaceVariant),
                    ),
                    Text('Updated ${_fmtDate(project.updatedAt)}',
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

class _ProjectSheet extends StatelessWidget {
  const _ProjectSheet({required this.project});
  final Project project;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(project.title,
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text(
                '${project.pageCount} pages · updated ${_fmtDate(project.updatedAt)}',
                style: TextStyle(color: scheme.onSurfaceVariant)),
            const SizedBox(height: 20),
            Text('Parts (${project.partNames.length})',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: project.partNames
                  .map((n) => Chip(
                        avatar: const Icon(Icons.music_note, size: 18),
                        label: Text(n),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 20),
            Text(
              'Open this project on the Partwise website to edit or export parts.',
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
