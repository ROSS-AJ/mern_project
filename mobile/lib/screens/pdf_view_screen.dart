import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:pdfx/pdfx.dart';

/// Read-only score viewer with pinch-to-zoom.
class PdfViewScreen extends StatefulWidget {
  const PdfViewScreen({super.key, required this.title, required this.bytes});
  final String title;
  final Uint8List bytes;

  @override
  State<PdfViewScreen> createState() => _PdfViewScreenState();
}

class _PdfViewScreenState extends State<PdfViewScreen> {
  late final PdfControllerPinch _controller =
      PdfControllerPinch(document: PdfDocument.openData(widget.bytes));

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title, overflow: TextOverflow.ellipsis),
        actions: [
          Center(
            child: Padding(
              padding: const EdgeInsets.only(right: 16),
              child: PdfPageNumber(
                controller: _controller,
                builder: (_, state, page, count) => Text(
                  count == null ? '' : '$page / $count',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
            ),
          ),
        ],
      ),
      body: PdfViewPinch(
        controller: _controller,
        onDocumentError: (e) => ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Could not open this PDF: $e'))),
      ),
    );
  }
}
