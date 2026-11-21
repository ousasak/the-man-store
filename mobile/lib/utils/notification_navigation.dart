import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../models/brand_model.dart';
import '../models/homepage_section.dart';
import '../screens/brand_products_screen.dart';
import '../screens/home_section_products_screen.dart';
import '../screens/order_detail_screen.dart';
import '../screens/orders_screen.dart';
import '../screens/product_detail_screen.dart';
import '../services/notification_service.dart';
import '../services/order_service.dart';
import '../services/product_service.dart';
import 'notification_link.dart';

Future<void> openNotificationItem(
  BuildContext context,
  StoreNotification item,
) async {
  final target = notificationLinkTarget(item.effectiveLinkUrl);
  if (target == null) return;

  final navigator = Navigator.of(context);
  final productService = context.read<ProductService>();
  final apiClient = context.read<ApiClient>();
  final orderService = context.read<OrderService>();

  navigator.pop();

  switch (target) {
    case ProductNotificationLink(:final slug):
      await navigator.push(
        MaterialPageRoute(
          builder: (_) => ProductDetailScreen(
            productService: productService,
            slug: slug,
          ),
        ),
      );
    case SearchNotificationLink():
      await navigator.push(
        MaterialPageRoute(
          builder: (_) => HomeSectionProductsScreen(
            browse: HomeSectionBrowse(
              key: 'search',
              title: target.title,
              tab: target.tab,
              searchQuery: target.query,
              parentCategory: target.parentCategory,
            ),
            productService: productService,
            apiClient: apiClient,
          ),
        ),
      );
    case BrandNotificationLink(:final slug):
      await navigator.push(
        MaterialPageRoute(
          builder: (_) => BrandProductsScreen(
            brand: BrandModel(id: 0, name: slug, slug: slug),
            productService: productService,
            apiClient: apiClient,
          ),
        ),
      );
    case CategoryNotificationLink(:final slug):
      await navigator.push(
        MaterialPageRoute(
          builder: (_) => HomeSectionProductsScreen(
            browse: HomeSectionBrowse(
              key: 'search',
              title: slug,
              categorySlug: slug,
            ),
            productService: productService,
            apiClient: apiClient,
          ),
        ),
      );
    case DiscountsNotificationLink():
      await navigator.push(
        MaterialPageRoute(
          builder: (_) => HomeSectionProductsScreen(
            browse: const HomeSectionBrowse(
              key: 'discounts',
              title: 'Discounts',
              discounts: true,
            ),
            productService: productService,
            apiClient: apiClient,
          ),
        ),
      );
    case OrdersNotificationLink():
      await navigator.push(
        MaterialPageRoute(builder: (_) => const OrdersScreen()),
      );
    case OrderDetailNotificationLink(:final orderId):
      try {
        final order = await orderService.fetchOrderById(orderId);
        if (!navigator.mounted) return;
        await navigator.push(
          MaterialPageRoute(
            builder: (_) => OrderDetailScreen(order: order),
          ),
        );
      } catch (_) {
        if (!navigator.mounted) return;
        await navigator.push(
          MaterialPageRoute(builder: (_) => const OrdersScreen()),
        );
      }
    case StorefrontWebNotificationLink(:final uri):
      await launchUrl(uri, mode: LaunchMode.inAppBrowserView);
    case ExternalNotificationLink(:final uri):
      await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
