import 'package:flutter_test/flutter_test.dart';
import 'package:partwise_mobile/main.dart';

void main() {
  testWidgets('App opens on the Login page with a Register option',
      (tester) async {
    await tester.pumpWidget(const PartwiseApp());
    expect(find.text('Log in'), findsOneWidget);
    expect(find.text('Register'), findsOneWidget);
  });
}
