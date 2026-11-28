import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../api.dart';
import '../models.dart';
import '../session.dart';
import 'pdf_view_screen.dart';

/// What happened on the project page, so the library can update its list.
class ProjectResult {
  final Project? updated;
  final bool deleted;
  const ProjectResult({this.updated, this.deleted = false});
}

/// One project: view the score, export it, rename it or delete it.
/// There is deliberately no editor on mobile.
class ProjectScreen extends StatefulWidget {
  const ProjectScreen({super.key, required this.project, required this.token});
  final Project project;
  final String token;

  @override
  State<ProjectScreen> createState() => _ProjectScreenState();
}

class _ProjectScreenState extends State<ProjectScreen> {
  late Project _p = widget.project;
  bool _changed = false;
  String? _busy; // label of the action running, or null

  void _close() => Navigator.of(context)
      .pop(_changed ? ProjectResult(updated: _p) : null);

  Future<void> _run(String label, Future<void> Function() action) async {
    if (_busy != null) return;
    setState(() => _busy = label);
    try {
      await action();
    } catch (e) {
      if (mounted) await handleApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  void _snack(String msg) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(msg)));

  Future<void> _view() => _run('Opening score…', () async {
        final file = await Api.downloadPdf(widget.token, _p);
        if (!mounted) return;
        await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => PdfViewScreen(title: _p.title, bytes: file.bytes),
        ));
      });

  Future<void> _export() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text('Export'),
              subtitle: Text(
                  'Save or send this score. Part PDFs are exported from the website.'),
            ),
            ListTile(
              leading: const Icon(Icons.picture_as_pdf_outlined),
              title: const Text('Original score (PDF)'),
              subtitle: const Text('The full score as uploaded'),
              onTap: () => Navigator.pop(ctx, 'pdf'),
            ),
            ListTile(
              leading: const Icon(Icons.inventory_2_outlined),
              title: const Text('Partwise project (.partwise)'),
              subtitle: const Text('Score + layout. Open it on the website to keep editing'),
              onTap: () => Navigator.pop(ctx, 'partwise'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (choice == null) return;
    await _run('Preparing export…', () async {
      final file = choice == 'pdf'
          ? await Api.downloadPdf(widget.token, _p)
          : await Api.downloadPartwise(widget.token, _p);
      final dir = await getTemporaryDirectory();
      final out = File('${dir.path}/${file.fileName}');
      await out.writeAsBytes(file.bytes, flush: true);
      if (!mounted) return;
      await SharePlus.instance.share(ShareParams(
        files: [XFile(out.path)],
        subject: _p.title,
      ));
    });
  }

  Future<void> _rename() async {
    final ctrl = TextEditingController(text: _p.title);
    final newTitle = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rename project'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(labelText: 'Title'),
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text),
              child: const Text('Save')),
        ],
      ),
    );
    final title = newTitle?.trim() ?? '';
    if (title.isEmpty || title == _p.title) return;
    await _run('Renaming…', () async {
      final updated = await Api.renameProject(widget.token, _p, title);
      if (!mounted) return;
      setState(() {
        _p = updated;
        _changed = true;
      });
      _snack('Renamed to "${updated.title}"');
    });
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.delete_outline),
        title: const Text('Delete project?'),
        content: Text(
            '"${_p.title}" and its PDF will be permanently deleted from your account. This can\'t be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: Theme.of(ctx).colorScheme.error,
                foregroundColor: Theme.of(ctx).colorScheme.onError),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _run('Deleting…', () async {
      await Api.deleteProject(widget.token, _p);
      if (!mounted) return;
      _snack('Deleted "${_p.title}"');
      Navigator.of(context).pop(const ProjectResult(deleted: true));
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final info = [
      if (_p.pageCount > 0)
        '${_p.pageCount} page${_p.pageCount == 1 ? '' : 's'}',
      if (_p.sizeLabel.isNotEmpty) _p.sizeLabel,
      'Updated ${fmtDate(_p.updatedAt)}',
    ].join(' · ');

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: BackButton(onPressed: _close),
          title: const Text('Project'),
          actions: [
            PopupMenuButton<String>(
              enabled: _busy == null,
              onSelected: (v) => v == 'rename' ? _rename() : _delete(),
              itemBuilder: (_) => const [
                PopupMenuItem(
                    value: 'rename',
                    child: ListTile(
                        leading: Icon(Icons.edit_outlined),
                        title: Text('Rename'))),
                PopupMenuItem(
                    value: 'delete',
                    child: ListTile(
                        leading: Icon(Icons.delete_outline),
                        title: Text('Delete'))),
              ],
            ),
          ],
          bottom: _busy == null
              ? null
              : const PreferredSize(
                  preferredSize: Size.fromHeight(4),
                  child: LinearProgressIndicator()),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(_p.title, style: text.headlineSmall),
              const SizedBox(height: 4),
              Text(info, style: TextStyle(color: scheme.onSurfaceVariant)),
              if (_p.originalName.isNotEmpty)
                Text(_p.originalName,
                    style: text.bodySmall
                        ?.copyWith(color: scheme.onSurfaceVariant)),
              if (_busy != null) ...[
                const SizedBox(height: 8),
                Text(_busy!, style: TextStyle(color: scheme.primary)),
              ],
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _busy == null ? _view : null,
                icon: const Icon(Icons.menu_book_outlined),
                label: const Text('View score'),
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(48)),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _busy == null ? _export : null,
                      icon: const Icon(Icons.ios_share),
                      label: const Text('Export'),
                      style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(48)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _busy == null ? _rename : null,
                      icon: const Icon(Icons.edit_outlined),
                      label: const Text('Rename'),
                      style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(48)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 28),
              Text('Parts (${_p.partNames.length})', style: text.titleMedium),
              const SizedBox(height: 8),
              if (_p.partNames.isEmpty)
                Text(
                  'No parts yet. Open this score in the Partwise website to find and name its staffs.',
                  style: TextStyle(color: scheme.onSurfaceVariant),
                )
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _p.partNames
                      .map((n) => Chip(
                            avatar: const Icon(Icons.music_note, size: 18),
                            label: Text(n),
                          ))
                      .toList(),
                ),
              const SizedBox(height: 28),
              Card(
                color: scheme.surfaceContainerHighest,
                child: const ListTile(
                  leading: Icon(Icons.computer),
                  title: Text('Editing is on the website'),
                  subtitle: Text(
                      'Use the Partwise website to adjust staffs, add text and export part PDFs.'),
                ),
              ),
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: _busy == null ? _delete : null,
                icon: Icon(Icons.delete_outline, color: scheme.error),
                label: Text('Delete project',
                    style: TextStyle(color: scheme.error)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
