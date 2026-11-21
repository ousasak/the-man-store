import '../core/api_client.dart';
import '../models/payment_model.dart';

class PaymentService {
  PaymentService(this._api);

  final ApiClient _api;

  Future<PaymentModel> createBakongPayment(int orderId) async {
    final res = await _api.dio.post('/payments/bakong/create', data: {
      'order_id': orderId,
    });
    return PaymentModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<PaymentModel> checkBakongStatus(int paymentId) async {
    final res = await _api.dio.get('/payments/bakong/status/$paymentId');
    return PaymentModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  /// NBC Bakong short link — opens banking app with KHQR pre-filled (ABA, Wing, etc.).
  Future<String> fetchBakongDeeplink(int paymentId) async {
    final res = await _api.dio.post('/payments/bakong/deeplink/$paymentId');
    final link = res.data['short_link']?.toString() ?? '';
    if (link.isEmpty) {
      throw StateError('No deeplink returned');
    }
    return link;
  }
}
