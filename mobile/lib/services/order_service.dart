import '../core/api_client.dart';
import '../models/order_model.dart';

class OrderService {
  OrderService(this._api);

  final ApiClient _api;

  Future<OrderPage> listOrders({int page = 1}) async {
    final res = await _api.dio.get('/orders', queryParameters: {'page': page});
    return OrderPage.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<OrderTrackModel> trackOrder(String orderNumber) async {
    final res = await _api.dio.get('/orders/$orderNumber/track');
    return OrderTrackModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<OrderModel> fetchOrderById(int id) async {
    final res = await _api.dio.get('/orders/$id');
    final body = res.data;
    if (body is! Map) throw StateError('Order not found');
    final map = Map<String, dynamic>.from(body);
    final order = map['data'] ?? map['order'] ?? map;
    if (order is! Map) throw StateError('Order not found');
    return OrderModel.fromJson(Map<String, dynamic>.from(order));
  }

  Future<OrderModel> checkout({
    required String paymentMethod,
    required Map<String, dynamic> shippingAddress,
  }) async {
    final res = await _api.dio.post('/checkout', data: {
      'payment_method': paymentMethod,
      'shipping_address': shippingAddress,
    });
    final data = Map<String, dynamic>.from(res.data as Map);
    final order = data['order'];
    if (order is Map) {
      return OrderModel.fromJson(Map<String, dynamic>.from(order));
    }
    throw StateError('Checkout response missing order');
  }
}
