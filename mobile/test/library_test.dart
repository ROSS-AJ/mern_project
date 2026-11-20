import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:partwise_mobile/models.dart';
import 'package:partwise_mobile/screens/library_screen.dart';

void main() {
  testWidgets('Library shows projects, filters by search, sorts', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);
    final user = User(id: '1', firstName: 'Nick', lastName: 'O', login: 'nick', email: 'n@x.com', token: 't');
    await tester.pumpWidget(MaterialApp(home: LibraryScreen(user: user)));
    await tester.pumpAndSettle();
    expect(find.text('Welcome, Nick!'), findsOneWidget);
    expect(find.text('5 of 5 projects'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'tuba');
    await tester.pump();
    expect(find.text('3 of 5 projects'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '');
    await tester.tap(find.text('Newest first'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Title A–Z').last);
    await tester.pumpAndSettle();
    final first = tester.getTopLeft(find.text('Amazing Grace (Brass Quintet)')).dy;
    final second = tester.getTopLeft(find.text('First Suite in E-flat')).dy;
    expect(first < second, isTrue);
  });
}
