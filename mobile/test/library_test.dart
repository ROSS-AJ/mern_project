import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:partwise_mobile/models.dart';
import 'package:partwise_mobile/screens/library_screen.dart';

final _projects = [
  Project(id: '1', title: 'First Suite in E-flat', pageCount: 6,
      partNames: ['Flute', 'Clarinet', 'Trumpet', 'Tuba'], updatedAt: DateTime(2026, 11, 18)),
  Project(id: '2', title: 'Ode to Joy', pageCount: 2,
      partNames: ['Violin I', 'Viola', 'Cello'], updatedAt: DateTime(2026, 11, 12)),
  Project(id: '3', title: 'Amazing Grace', pageCount: 1,
      partNames: ['Trumpet', 'Horn', 'Tuba'], updatedAt: DateTime(2026, 10, 20)),
];

void main() {
  testWidgets('Library shows projects, filters by search, sorts', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);
    final user = User(id: '1', firstName: 'Nick', lastName: 'O', login: 'nick', email: 'n@x.com', token: 't');
    await tester.pumpWidget(MaterialApp(
        home: LibraryScreen(user: user, loader: (_) async => _projects)));
    await tester.pumpAndSettle();
    expect(find.text('Welcome, Nick!'), findsOneWidget);
    expect(find.text('3 of 3 projects'), findsOneWidget);
    expect(find.text('Upload'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'tuba');
    await tester.pump();
    expect(find.text('2 of 3 projects'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '');

    await tester.tap(find.text('Newest first'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Title A–Z').last);
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('Amazing Grace')).dy <
        tester.getTopLeft(find.text('First Suite in E-flat')).dy, isTrue);
  });

  testWidgets('Tapping a project opens its page with view/export/rename/delete', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);
    final user = User(id: '1', firstName: 'Nick', lastName: 'O', login: 'nick', email: 'n@x.com', token: 't');
    await tester.pumpWidget(MaterialApp(
        home: LibraryScreen(user: user, loader: (_) async => _projects)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ode to Joy'));
    await tester.pumpAndSettle();
    expect(find.text('View score'), findsOneWidget);
    expect(find.text('Export'), findsOneWidget);
    expect(find.text('Rename'), findsOneWidget);
    expect(find.text('Delete project'), findsOneWidget);
    expect(find.text('Viola'), findsOneWidget);
  });
}
