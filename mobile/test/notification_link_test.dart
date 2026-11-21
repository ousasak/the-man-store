import 'package:flutter_test/flutter_test.dart';
import 'package:fitandsleek_mobile/utils/notification_link.dart';

void main() {
  test('product links resolve slug', () {
    final target = notificationLinkTarget('/p/nike-air-max');
    expect(target, isA<ProductNotificationLink>());
    expect((target as ProductNotificationLink).slug, 'nike-air-max');
  });

  test('order notifications open orders', () {
    expect(notificationLinkTarget('/orders'), isA<OrdersNotificationLink>());
    expect(notificationLinkTarget('/orders/42'), isA<OrderDetailNotificationLink>());
  });

  test('search and promo links resolve', () {
    final target = notificationLinkTarget('/search?tab=new');
    expect(target, isA<SearchNotificationLink>());
    expect((target as SearchNotificationLink).tab, 'new');
  });

  test('full storefront URLs resolve', () {
    final target = notificationLinkTarget('https://www.fitandsleek.online/p/chinos');
    expect(target, isA<ProductNotificationLink>());
  });

  test('unknown storefront paths open in web view', () {
    final target = notificationLinkTarget('https://www.fitandsleek.online/contact');
    expect(target, isA<StorefrontWebNotificationLink>());
    expect((target as StorefrontWebNotificationLink).uri.path, '/contact');
  });

  test('category and discount links resolve natively', () {
    expect(notificationLinkTarget('/category/men'), isA<CategoryNotificationLink>());
    expect(notificationLinkTarget('/discounts'), isA<DiscountsNotificationLink>());
  });
}
