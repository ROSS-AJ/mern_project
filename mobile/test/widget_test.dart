import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:partwise_mobile/api.dart';
import 'package:partwise_mobile/models.dart';
import 'package:partwise_mobile/screens/library_screen.dart';
import 'package:partwise_mobile/screens/start_screen.dart';

final _user = User(
    id: '1', firstName: 'Nick', lastName: 'O', login: 'nick', email: 'n@x.com', token: 't');

String _jwt(DateTime exp) {
  String part(Map<String, dynamic> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${part({'alg': 'HS256'})}.${part({'id': '1', 'exp': exp.millisecondsSinceEpoch ~/ 1000})}.sig';
}

void main() {
  testWidgets('Not signed in: opens on Login with a Register option', (tester) async {
    await tester.pumpWidget(MaterialApp(home: StartScreen(restore: () async => null)));
    await tester.pumpAndSettle();
    expect(find.text('Log in'), findsOneWidget);
    expect(find.text('Register'), findsOneWidget);
  });

  testWidgets('Still signed in: opens straight on the library', (tester) async {
    await tester.pumpWidget(MaterialApp(home: StartScreen(restore: () async => _user)));
    await tester.pumpAndSettle();
    expect(find.text('Welcome, Nick!'), findsOneWidget);
    expect(find.text('Log in'), findsNothing);
  });

  testWidgets('Upload asks first, and Cancel goes back to the library', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
        home: LibraryScreen(user: _user, loader: (_) async => <Project>[])));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Upload'));
    await tester.pumpAndSettle();
    expect(find.text('Upload a score'), findsOneWidget);
    expect(find.text('Choose file'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('Upload a score'), findsNothing);
    expect(find.text('Welcome, Nick!'), findsOneWidget);
  });

  test('Reads when a login token runs out', () {
    final exp = DateTime.now().add(const Duration(hours: 1));
    final read = Api.tokenExpiry(_jwt(exp))!;
    expect((read.difference(exp).inSeconds).abs() <= 1, isTrue);
    expect(Api.tokenExpiry('not-a-jwt'), isNull);
  });
}
