import 'dart:io';

import 'package:dio/dio.dart';

import '../core/admin_report_period.dart';
import '../core/api_client.dart';
import '../models/brand_model.dart';
import '../utils/cod_settlement.dart';

class AdminDashboardStats {
  AdminDashboardStats({
    required this.totalRevenue,
    required this.todayRevenue,
    required this.totalOrders,
    required this.pendingOrders,
    required this.totalProducts,
    required this.lowStockProducts,
    required this.totalCustomers,
    this.prepaidOrders = 0,
    this.prepaidRevenue = 0,
    this.codOrders = 0,
    this.codRevenue = 0,
    this.codUnpaidOrders = 0,
  });

  final double totalRevenue;
  final double todayRevenue;
  final int totalOrders;
  final int pendingOrders;
  final int totalProducts;
  final int lowStockProducts;
  final int totalCustomers;
  final int prepaidOrders;
  final double prepaidRevenue;
  final int codOrders;
  final double codRevenue;
  final int codUnpaidOrders;

  factory AdminDashboardStats.fromJson(Map<String, dynamic> json) {
    final revenue = json['revenue'] as Map? ?? {};
    final orders = json['orders'] as Map? ?? {};
    final products = json['products'] as Map? ?? {};
    final customers = json['customers'] as Map? ?? {};
    final payment = json['payment_methods'] as Map? ?? {};
    final prepaid = payment['prepaid'] as Map? ?? {};
    final cod = payment['cod'] as Map? ?? {};
    return AdminDashboardStats(
      totalRevenue: _toDouble(revenue['total']),
      todayRevenue: _toDouble(revenue['today']),
      totalOrders: _toInt(orders['total']),
      pendingOrders: _toInt(orders['pending']),
      totalProducts: _toInt(products['total']),
      lowStockProducts: _toInt(products['low_stock']),
      totalCustomers: _toInt(customers['total']),
      prepaidOrders: _toInt(prepaid['orders']),
      prepaidRevenue: _toDouble(prepaid['revenue']),
      codOrders: _toInt(cod['orders']),
      codRevenue: _toDouble(cod['revenue']),
      codUnpaidOrders: _toInt(cod['unpaid_orders']),
    );
  }

  static double _toDouble(dynamic v) => v == null ? 0 : (v is num ? v.toDouble() : double.tryParse('$v') ?? 0);
  static int _toInt(dynamic v) => v == null ? 0 : (v is num ? v.toInt() : int.tryParse('$v') ?? 0);
}

class SuperAdminStats {
  SuperAdminStats({
    required this.totalUsers,
    required this.totalAdmins,
    required this.totalCustomers,
    required this.activeUsers,
  });

  final int totalUsers;
  final int totalAdmins;
  final int totalCustomers;
  final int activeUsers;

  factory SuperAdminStats.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map? ?? json;
    return SuperAdminStats(
      totalUsers: AdminDashboardStats._toInt(data['total_users']),
      totalAdmins: AdminDashboardStats._toInt(data['total_admins']),
      totalCustomers: AdminDashboardStats._toInt(data['total_customers']),
      activeUsers: AdminDashboardStats._toInt(data['active_users']),
    );
  }
}

class AdminService {
  AdminService(this._api);

  final ApiClient _api;

  Future<AdminDashboardStats> fetchDashboard({
    AdminReportPeriod period = AdminReportPeriod.defaultPeriod,
    int? periodDays,
  }) async {
    final params = periodDays != null ? {'period': periodDays} : period.toQueryParams();
    final res = await _api.dio.get('/admin/reports/dashboard', queryParameters: params);
    return AdminDashboardStats.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<SuperAdminStats?> fetchSuperAdminStats() async {
    try {
      final res = await _api.dio.get('/admin/superadmin/statistics');
      return SuperAdminStats.fromJson(Map<String, dynamic>.from(res.data as Map));
    } catch (_) {
      return null;
    }
  }

  Future<List<BrandModel>> fetchBrands() async {
    final res = await _api.dio.get('/admin/brands');
    final raw = res.data is Map ? res.data['data'] : res.data;
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((e) => BrandModel.fromJson(Map<String, dynamic>.from(e)))
        .where((b) => b.id > 0 && b.name.isNotEmpty)
        .toList();
  }

  Future<Map<String, dynamic>> fetchAdminProfile() async {
    final res = await _api.dio.get('/admin/profile');
    final body = res.data as Map;
    final user = body['user'] as Map? ?? body;
    return Map<String, dynamic>.from(user);
  }

  Future<Map<String, dynamic>> updateAdminProfile({
    required String name,
    required String email,
    String? phone,
    String? address,
  }) async {
    final res = await _api.dio.put('/admin/profile', data: {
      'name': name,
      'email': email,
      if (phone != null) 'phone': phone,
      if (address != null) 'address': address,
    });
    final body = res.data as Map;
    final user = body['user'] as Map? ?? body;
    return Map<String, dynamic>.from(user);
  }

  Future<String> uploadAdminProfileImage(File file) async {
    final form = FormData.fromMap({
      'profile_image': await MultipartFile.fromFile(file.path, filename: 'profile.jpg'),
    });
    final res = await _api.dio.post(
      '/admin/profile/upload-image',
      data: form,
      options: Options(contentType: 'multipart/form-data'),
    );
    final data = res.data as Map;
    return (data['profile_image_url'] ?? '').toString();
  }

  Future<void> updateAdminPassword({
    required String currentPassword,
    required String password,
    required String passwordConfirmation,
  }) async {
    await _api.dio.put('/admin/profile/password', data: {
      'current_password': currentPassword,
      'password': password,
      'password_confirmation': passwordConfirmation,
    });
  }

  Future<AdminProductPage> listProducts({int page = 1, String? query}) async {
    final res = await _api.dio.get('/admin/products', queryParameters: {
      'page': page,
      'per_page': 20,
      if (query != null && query.isNotEmpty) 'search': query,
    });
    return AdminProductPage.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminProductModel> getProduct(int id) async {
    final res = await _api.dio.get('/admin/products/$id');
    return AdminProductModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminProductModel> updateProduct(int id, Map<String, dynamic> data) async {
    final res = await _api.dio.patch('/admin/products/$id', data: data);
    return AdminProductModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<BarcodeLookup?> barcodeLookup(String code) async {
    final res = await _api.dio.get('/admin/barcode-scan/lookup', queryParameters: {'code': code});
    final data = res.data as Map;
    final row = data['data'];
    if (row is! Map) return null;
    return BarcodeLookup.fromJson(Map<String, dynamic>.from(row));
  }

  Future<PosSaleResult> completePosSale({
    required List<PosLine> lines,
    required String paymentMethod,
  }) async {
    final res = await _api.dio.post('/admin/pos/complete-sale', data: {
      'payment_method': paymentMethod,
      'lines': lines.map((l) => {'code': l.code, 'qty': l.qty}).toList(),
    });
    return PosSaleResult.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<List<SalesDayRow>> fetchSales({
    AdminReportPeriod period = AdminReportPeriod.defaultPeriod,
    int? periodDays,
  }) async {
    final params = periodDays != null ? {'period': periodDays} : period.toQueryParams();
    final res = await _api.dio.get('/admin/reports/sales', queryParameters: params);
    final data = res.data as Map;
    final list = data['sales'];
    if (list is! List) return [];
    return list
        .whereType<Map>()
        .map((e) => SalesDayRow.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<TopProductRow>> fetchTopProducts({int limit = 10}) async {
    final res = await _api.dio.get('/admin/reports/top-products', queryParameters: {'limit': limit});
    final data = res.data as Map;
    final list = data['data'];
    if (list is! List) return [];
    return list
        .whereType<Map>()
        .map((e) => TopProductRow.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<CategorySlice>> fetchProductAnalytics() async {
    final data = await fetchProductAnalyticsData();
    return data.byCategory;
  }

  Future<ProductAnalyticsData> fetchProductAnalyticsData() async {
    final res = await _api.dio.get('/admin/reports/product-analytics');
    final data = res.data as Map;
    return ProductAnalyticsData.fromJson(Map<String, dynamic>.from(data));
  }

  Future<List<RevenueSlice>> fetchCategorySales({
    AdminReportPeriod period = AdminReportPeriod.defaultPeriod,
    int? periodDays,
  }) async {
    final data = await fetchCategorySalesData(period: period, periodDays: periodDays);
    return data.revenueByCategory;
  }

  Future<CategorySalesData> fetchCategorySalesData({
    AdminReportPeriod period = AdminReportPeriod.defaultPeriod,
    int? periodDays,
    int limit = 10,
  }) async {
    final params = {
      ...(periodDays != null ? {'period': periodDays} : period.toQueryParams()),
      'limit': limit,
    };
    final res = await _api.dio.get('/admin/reports/category-sales', queryParameters: params);
    return CategorySalesData.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<List<CategorySlice>> fetchOrderAnalytics({
    AdminReportPeriod period = AdminReportPeriod.defaultPeriod,
    int? periodDays,
  }) async {
    final data = await fetchOrderAnalyticsData(period: period, periodDays: periodDays);
    return data.byStatus;
  }

  Future<OrderAnalyticsData> fetchOrderAnalyticsData({
    AdminReportPeriod period = AdminReportPeriod.defaultPeriod,
    int? periodDays,
  }) async {
    final params = periodDays != null ? {'period': periodDays} : period.toQueryParams();
    final res = await _api.dio.get('/admin/reports/order-analytics', queryParameters: params);
    return OrderAnalyticsData.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<ChannelSalesData> fetchChannelSales({
    AdminReportPeriod period = AdminReportPeriod.defaultPeriod,
  }) async {
    final res = await _api.dio.get('/admin/reports/channel-sales', queryParameters: period.toQueryParams());
    return ChannelSalesData.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<StockAnalyticsData> fetchStockAnalytics({
    int? fromYear,
    int? toYear,
    AdminReportPeriod? period,
  }) async {
    int from = fromYear ?? DateTime.now().year - 1;
    int to = toYear ?? DateTime.now().year;
    if (period != null) {
      final range = period.stockYearRange();
      from = range.$1;
      to = range.$2;
    }
    final res = await _api.dio.get('/admin/reports/stock-analytics', queryParameters: {
      'from_year': from,
      'to_year': to,
    });
    return StockAnalyticsData.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<ScanSaleResult> submitScanSale({required String code, required int qty}) async {
    final res = await _api.dio.post('/admin/barcode-scan/sale', data: {'code': code, 'qty': qty});
    return ScanSaleResult.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminOrderPage> listOrders({
    int page = 1,
    String? search,
    String? status,
  }) async {
    final res = await _api.dio.get('/admin/orders', queryParameters: {
      'page': page,
      'per_page': 20,
      'compact': 1,
      if (search != null && search.isNotEmpty) 'search': search,
      if (status != null && status.isNotEmpty) 'statuses[]': status,
    });
    return AdminOrderPage.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminOrderDetail> getOrder(int id) async {
    final res = await _api.dio.get('/admin/orders/$id');
    return AdminOrderDetail.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminOrderDetail> updateOrderStatus(int id, String status) async {
    final res = await _api.dio.patch('/admin/orders/$id', data: {'status': status});
    return AdminOrderDetail.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminOrderDetail> saveDeliveredByName({
    required int orderId,
    required int shipmentId,
    String? deliveredByName,
  }) async {
    final name = deliveredByName?.trim();
    await _api.dio.patch('/admin/shipments/$shipmentId/delivery', data: {
      'delivered_by_name': (name == null || name.isEmpty) ? null : name,
    });
    return getOrder(orderId);
  }

  Future<CodQuote> getCodQuote(int orderId) async {
    final res = await _api.dio.get('/admin/orders/$orderId/cod');
    final body = res.data as Map;
    final data = body['data'] as Map? ?? body;
    return CodQuote.fromJson(Map<String, dynamic>.from(data));
  }

  Future<AdminOrderDetail> collectCodCash({
    required int orderId,
    required String settlementMethod,
    double? actualAmountReceived,
    String? courierName,
    String? notes,
    String? qrBank,
    String? currency,
  }) async {
    final res = await _api.dio.post('/admin/orders/$orderId/cod/cash', data: {
      'settlement_method': settlementMethod,
      if (actualAmountReceived != null) 'actual_amount_received': actualAmountReceived,
      if (courierName != null && courierName.isNotEmpty) 'courier_name': courierName,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      if (qrBank != null && qrBank.isNotEmpty) 'qr_bank': qrBank,
      if (currency != null && currency.isNotEmpty) 'currency': currency,
    });
    final body = res.data as Map;
    final data = body['data'] as Map? ?? body;
    final order = data['order'] as Map? ?? data;
    return AdminOrderDetail.fromJson(Map<String, dynamic>.from(order));
  }

  Future<AdminOrderDetail> setCodPlan({
    required int orderId,
    required String plan,
  }) async {
    final res = await _api.dio.post('/admin/orders/$orderId/cod/plan', data: {
      'plan': plan,
    });
    final body = res.data as Map;
    final data = body['data'] as Map? ?? body;
    final order = data['order'] as Map? ?? data;
    return AdminOrderDetail.fromJson(Map<String, dynamic>.from(order));
  }

  Future<CodKhqrPayment> createCodKhqr({
    required int orderId,
    String? courierName,
    String? notes,
  }) async {
    final res = await _api.dio.post('/admin/orders/$orderId/cod/khqr', data: {
      if (courierName != null && courierName.isNotEmpty) 'courier_name': courierName,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
    final body = res.data as Map;
    final data = body['data'] as Map? ?? body;
    final payment = data['payment'] as Map? ?? data;
    return CodKhqrPayment.fromJson(Map<String, dynamic>.from(payment));
  }

  Future<({String paymentStatus, AdminOrderDetail? order})> codKhqrStatus(int orderId) async {
    final res = await _api.dio.get('/admin/orders/$orderId/cod/khqr/status');
    final body = Map<String, dynamic>.from(res.data as Map);
    final payment = body['payment'] as Map?;
    final orderRaw = body['order'] as Map?;
    return (
      paymentStatus: (payment?['status'] ?? '').toString(),
      order: orderRaw != null ? AdminOrderDetail.fromJson(Map<String, dynamic>.from(orderRaw)) : null,
    );
  }

  Future<AdminPaymentPage> listPayments({
    int page = 1,
    String? status,
  }) async {
    final res = await _api.dio.get('/admin/payments', queryParameters: {
      'page': page,
      'per_page': 20,
      if (status != null && status.isNotEmpty) 'status': status,
    });
    final body = res.data as Map;
    final paginator = body['data'] as Map? ?? body;
    return AdminPaymentPage.fromJson(Map<String, dynamic>.from(paginator));
  }

  Future<AdminPaymentDetail> getPayment(int id) async {
    final res = await _api.dio.get('/admin/payments/$id');
    final body = res.data as Map;
    final data = body['data'] as Map? ?? body;
    return AdminPaymentDetail.fromJson(Map<String, dynamic>.from(data));
  }

  Future<AdminPaymentDetail> verifyPayment(int id, {String? referenceCode}) async {
    final res = await _api.dio.post('/admin/payments/$id/verify', data: {
      if (referenceCode != null && referenceCode.isNotEmpty) 'reference_code': referenceCode,
    });
    final body = res.data as Map;
    final data = body['data'] as Map? ?? body;
    return AdminPaymentDetail.fromJson(Map<String, dynamic>.from(data));
  }

  Future<AdminPaymentDetail> rejectPayment(int id, {String? notes}) async {
    final res = await _api.dio.post('/admin/payments/$id/reject', data: {
      if (notes != null) 'notes': notes,
    });
    final body = res.data as Map;
    final data = body['data'] as Map? ?? body;
    return AdminPaymentDetail.fromJson(Map<String, dynamic>.from(data));
  }

  Future<AdminProductModel> quickUpdateProduct(int id, {int? stock, bool? isActive}) async {
    final data = <String, dynamic>{};
    if (stock != null) data['stock'] = stock;
    if (isActive != null) data['is_active'] = isActive;
    return updateProduct(id, data);
  }

  Future<AdminShipmentPage> listShipments({int page = 1, String? status}) async {
    final res = await _api.dio.get('/admin/shipments', queryParameters: {
      'page': page,
      'per_page': 20,
      if (status != null && status.isNotEmpty) 'status': status,
    });
    return AdminShipmentPage.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminShipmentDetail> updateShipmentStatus(int id, String status) async {
    final res = await _api.dio.patch('/admin/shipments/$id/status', data: {'status': status});
    return AdminShipmentDetail.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminCustomerPage> listCustomers({int page = 1, String? search}) async {
    final res = await _api.dio.get('/admin/customers', queryParameters: {
      'page': page,
      'per_page': 20,
      if (search != null && search.isNotEmpty) 'search': search,
    });
    return AdminCustomerPage.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminCustomerDetail> getCustomer(int id) async {
    final res = await _api.dio.get('/admin/customers/$id');
    return AdminCustomerDetail.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminContactPage> listContacts({int page = 1, String? status, String? search}) async {
    final res = await _api.dio.get('/admin/contacts', queryParameters: {
      'page': page,
      'per_page': 20,
      if (status != null && status.isNotEmpty) 'status': status,
      if (search != null && search.isNotEmpty) 'search': search,
    });
    return AdminContactPage.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminContactRow> getContact(int id) async {
    final res = await _api.dio.get('/admin/contacts/$id');
    return AdminContactRow.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminContactRow> updateContact(int id, {required String status, String? adminNote}) async {
    final res = await _api.dio.patch('/admin/contacts/$id', data: {
      'status': status,
      if (adminNote != null) 'admin_note': adminNote,
    });
    return AdminContactRow.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminReplacementPage> listReplacements({int page = 1, String? status}) async {
    final res = await _api.dio.get('/admin/replacement-cases', queryParameters: {
      'page': page,
      'per_page': 20,
      if (status != null && status.isNotEmpty) 'status': status,
    });
    return AdminReplacementPage.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<AdminReplacementDetail> approveReplacement(int id, {String? notes}) async {
    final res = await _api.dio.post('/admin/replacement-cases/$id/approve', data: {
      if (notes != null) 'notes': notes,
    });
    final body = res.data as Map;
    final data = body['data'] as Map? ?? body;
    return AdminReplacementDetail.fromJson(Map<String, dynamic>.from(data));
  }

  Future<AdminReplacementDetail> rejectReplacement(int id, {required String notes}) async {
    final res = await _api.dio.post('/admin/replacement-cases/$id/reject', data: {'notes': notes});
    final body = res.data as Map;
    final data = body['data'] as Map? ?? body;
    return AdminReplacementDetail.fromJson(Map<String, dynamic>.from(data));
  }

  Future<PosSaleHistoryPage> fetchPosSaleHistory({int page = 1, String? search}) async {
    final res = await _api.dio.get('/admin/pos/sale-history', queryParameters: {
      'page': page,
      'per_page': 20,
      if (search != null && search.isNotEmpty) 'search': search,
    });
    return PosSaleHistoryPage.fromJson(Map<String, dynamic>.from(res.data as Map));
  }
}

class AdminProductModel {
  AdminProductModel({
    required this.id,
    required this.name,
    required this.slug,
    required this.price,
    required this.stock,
    required this.isActive,
    this.sku,
    this.imageUrl,
    this.categoryName,
  });

  final int id;
  final String name;
  final String slug;
  final double price;
  final int stock;
  final bool isActive;
  final String? sku;
  final String? imageUrl;
  final String? categoryName;

  factory AdminProductModel.fromJson(Map<String, dynamic> json) {
    final category = json['category'];
    return AdminProductModel(
      id: json['id'] as int,
      name: (json['name'] ?? '').toString(),
      slug: (json['slug'] ?? '').toString(),
      price: AdminDashboardStats._toDouble(json['price']),
      stock: AdminDashboardStats._toInt(json['stock']),
      isActive: json['is_active'] == true || json['is_active'] == 1,
      sku: json['sku']?.toString(),
      imageUrl: json['image_url']?.toString(),
      categoryName: category is Map ? category['name']?.toString() : null,
    );
  }
}

class AdminProductPage {
  AdminProductPage({
    required this.items,
    required this.currentPage,
    required this.hasMore,
  });

  final List<AdminProductModel> items;
  final int currentPage;
  final bool hasMore;

  factory AdminProductPage.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    final items = data is List
        ? data
            .whereType<Map>()
            .map((e) => AdminProductModel.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <AdminProductModel>[];
    final current = json['current_page'] as int? ?? 1;
    final last = json['last_page'] as int? ?? current;
    return AdminProductPage(
      items: items,
      currentPage: current,
      hasMore: current < last,
    );
  }
}

class BarcodeLookup {
  BarcodeLookup({
    required this.code,
    required this.name,
    required this.price,
    this.maxSellableQty,
  });

  final String code;
  final String name;
  final double price;
  final int? maxSellableQty;

  factory BarcodeLookup.fromJson(Map<String, dynamic> json) {
    return BarcodeLookup(
      code: (json['code'] ?? '').toString(),
      name: (json['name'] ?? 'Item').toString(),
      price: AdminDashboardStats._toDouble(json['price']),
      maxSellableQty: json['max_sellable_qty'] as int?,
    );
  }
}

class PosLine {
  PosLine({required this.code, required this.name, required this.qty, required this.unitPrice});

  final String code;
  final String name;
  final int qty;
  final double unitPrice;

  double get lineTotal => unitPrice * qty;
}

class PosSaleResult {
  PosSaleResult({
    required this.orderNumber,
    required this.subtotal,
    this.qrString,
    this.qrAmount,
    this.qrCurrency,
  });

  final String orderNumber;
  final double subtotal;
  final String? qrString;
  final double? qrAmount;
  final String? qrCurrency;

  factory PosSaleResult.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map? ?? json;
    final order = data['order'] as Map? ?? {};
    final khqr = data['khqr'] as Map?;
    return PosSaleResult(
      orderNumber: (order['order_number'] ?? '').toString(),
      subtotal: AdminDashboardStats._toDouble(data['subtotal']),
      qrString: khqr?['qr_string']?.toString(),
      qrAmount: khqr?['amount'] != null ? AdminDashboardStats._toDouble(khqr!['amount']) : null,
      qrCurrency: khqr?['currency']?.toString(),
    );
  }
}

class SalesDayRow {
  SalesDayRow({required this.date, required this.orders, required this.revenue});

  final String date;
  final int orders;
  final double revenue;

  factory SalesDayRow.fromJson(Map<String, dynamic> json) {
    return SalesDayRow(
      date: (json['date'] ?? '').toString(),
      orders: AdminDashboardStats._toInt(json['orders']),
      revenue: AdminDashboardStats._toDouble(json['revenue']),
    );
  }
}

class TopProductRow {
  TopProductRow({
    required this.name,
    required this.totalSold,
    required this.totalRevenue,
    this.imageUrl,
  });

  final String name;
  final int totalSold;
  final double totalRevenue;
  final String? imageUrl;

  factory TopProductRow.fromJson(Map<String, dynamic> json) {
    final product = json['product'] as Map?;
    return TopProductRow(
      name: (product?['name'] ?? 'Product').toString(),
      totalSold: AdminDashboardStats._toInt(json['total_sold']),
      totalRevenue: AdminDashboardStats._toDouble(json['total_revenue']),
      imageUrl: product?['image_url']?.toString(),
    );
  }
}

class CategorySlice {
  CategorySlice({required this.name, required this.count, required this.percentage});

  final String name;
  final int count;
  final double percentage;

  factory CategorySlice.fromJson(Map<String, dynamic> json) {
    return CategorySlice(
      name: (json['name'] ?? 'Other').toString(),
      count: AdminDashboardStats._toInt(json['count']),
      percentage: AdminDashboardStats._toDouble(json['percentage']),
    );
  }
}

class RevenueSlice {
  RevenueSlice({required this.name, required this.revenue, required this.percentage});

  final String name;
  final double revenue;
  final double percentage;

  factory RevenueSlice.fromJson(Map<String, dynamic> json) {
    return RevenueSlice(
      name: (json['name'] ?? 'Other').toString(),
      revenue: AdminDashboardStats._toDouble(json['revenue']),
      percentage: AdminDashboardStats._toDouble(json['percentage']),
    );
  }
}

class TopCategoryRow {
  TopCategoryRow({
    required this.name,
    required this.revenue,
    required this.unitsSold,
    required this.percentage,
  });

  final String name;
  final double revenue;
  final int unitsSold;
  final double percentage;

  factory TopCategoryRow.fromJson(Map<String, dynamic> json) {
    return TopCategoryRow(
      name: (json['name'] ?? 'Other').toString(),
      revenue: AdminDashboardStats._toDouble(json['revenue']),
      unitsSold: AdminDashboardStats._toInt(json['units_sold'] ?? json['total_units']),
      percentage: AdminDashboardStats._toDouble(json['percentage']),
    );
  }
}

class ProductAnalyticsData {
  ProductAnalyticsData({
    required this.totalProducts,
    required this.byCategory,
    required this.byCountry,
  });

  final int totalProducts;
  final List<CategorySlice> byCategory;
  final List<CategorySlice> byCountry;

  factory ProductAnalyticsData.fromJson(Map<String, dynamic> json) {
    return ProductAnalyticsData(
      totalProducts: AdminDashboardStats._toInt(json['total_products']),
      byCategory: _sliceList(json['by_category']),
      byCountry: _sliceList(json['by_country']),
    );
  }

  static List<CategorySlice> _sliceList(dynamic list) {
    if (list is! List) return [];
    return list.whereType<Map>().map((e) => CategorySlice.fromJson(Map<String, dynamic>.from(e))).toList();
  }
}

class CategorySalesData {
  CategorySalesData({
    required this.totalRevenue,
    required this.totalUnits,
    required this.revenueByCategory,
    required this.topCategories,
  });

  final double totalRevenue;
  final int totalUnits;
  final List<RevenueSlice> revenueByCategory;
  final List<TopCategoryRow> topCategories;

  factory CategorySalesData.fromJson(Map<String, dynamic> json) {
    final revList = json['revenue_by_category'];
    final topList = json['top_categories'];
    return CategorySalesData(
      totalRevenue: AdminDashboardStats._toDouble(json['total_revenue']),
      totalUnits: AdminDashboardStats._toInt(json['total_units']),
      revenueByCategory: revList is List
          ? revList.whereType<Map>().map((e) => RevenueSlice.fromJson(Map<String, dynamic>.from(e))).toList()
          : [],
      topCategories: topList is List
          ? topList.whereType<Map>().map((e) => TopCategoryRow.fromJson(Map<String, dynamic>.from(e))).toList()
          : [],
    );
  }
}

class OrderAnalyticsData {
  OrderAnalyticsData({
    required this.totalOrders,
    required this.byStatus,
    required this.byCategory,
    this.byPayment = const [],
  });

  final int totalOrders;
  final List<CategorySlice> byStatus;
  final List<CategorySlice> byCategory;
  final List<CategorySlice> byPayment;

  factory OrderAnalyticsData.fromJson(Map<String, dynamic> json) {
    return OrderAnalyticsData(
      totalOrders: AdminDashboardStats._toInt(json['total_orders']),
      byStatus: ProductAnalyticsData._sliceList(json['by_status']),
      byCategory: ProductAnalyticsData._sliceList(json['by_category']),
      byPayment: ProductAnalyticsData._sliceList(json['by_payment']),
    );
  }
}

class ChannelSalesRow {
  ChannelSalesRow({
    required this.channel,
    required this.label,
    required this.orders,
    required this.revenue,
  });

  final String channel;
  final String label;
  final int orders;
  final double revenue;

  factory ChannelSalesRow.fromJson(Map<String, dynamic> json) {
    return ChannelSalesRow(
      channel: (json['channel'] ?? '').toString(),
      label: (json['label'] ?? json['channel'] ?? 'Other').toString(),
      orders: AdminDashboardStats._toInt(json['orders']),
      revenue: AdminDashboardStats._toDouble(json['revenue']),
    );
  }
}

class ChannelSalesData {
  ChannelSalesData({required this.channels});

  final List<ChannelSalesRow> channels;

  ChannelSalesRow? channelOf(String key) {
    for (final c in channels) {
      if (c.channel == key) return c;
    }
    return null;
  }

  factory ChannelSalesData.fromJson(Map<String, dynamic> json) {
    final list = json['channels'];
    return ChannelSalesData(
      channels: list is List
          ? list.whereType<Map>().map((e) => ChannelSalesRow.fromJson(Map<String, dynamic>.from(e))).toList()
          : [],
    );
  }
}

class StockLabelSlice {
  StockLabelSlice({required this.name, required this.count, required this.percentage});

  final String name;
  final int count;
  final double percentage;

  factory StockLabelSlice.fromJson(Map<String, dynamic> json) {
    return StockLabelSlice(
      name: (json['name'] ?? 'Other').toString(),
      count: AdminDashboardStats._toInt(json['count']),
      percentage: AdminDashboardStats._toDouble(json['percentage']),
    );
  }
}

class StockAnalyticsData {
  StockAnalyticsData({
    required this.totalStock,
    required this.byLabel,
    required this.compareYears,
  });

  final int totalStock;
  final List<StockLabelSlice> byLabel;
  final List<int> compareYears;

  factory StockAnalyticsData.fromJson(Map<String, dynamic> json) {
    final labels = json['by_label'];
    final years = json['compare_years'];
    return StockAnalyticsData(
      totalStock: AdminDashboardStats._toInt(json['total_stock']),
      byLabel: labels is List
          ? labels.whereType<Map>().map((e) => StockLabelSlice.fromJson(Map<String, dynamic>.from(e))).toList()
          : [],
      compareYears: years is List ? years.map((e) => AdminDashboardStats._toInt(e)).toList() : [],
    );
  }
}

class ScanSaleResult {
  ScanSaleResult({required this.message, this.productName, this.qty});

  final String message;
  final String? productName;
  final int? qty;

  factory ScanSaleResult.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map? ?? json;
    return ScanSaleResult(
      message: (json['message'] ?? 'Stock updated').toString(),
      productName: data['name']?.toString(),
      qty: data['qty'] as int?,
    );
  }
}

class AdminOrderRow {
  AdminOrderRow({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.total,
    required this.createdAt,
    this.customerName,
    this.paymentMethod,
    this.paymentStatus,
  });

  final int id;
  final String orderNumber;
  final String status;
  final double total;
  final String createdAt;
  final String? customerName;
  final String? paymentMethod;
  final String? paymentStatus;

  bool get isCod => (paymentMethod ?? '').toLowerCase() == 'cod';

  String get paymentLabel {
    if (isCod) {
      final collected = (paymentStatus ?? '').toLowerCase() == 'paid';
      return collected ? 'COD · Collected' : 'COD · Courier';
    }
    final paid = (paymentStatus ?? '').toLowerCase() == 'paid';
    return paid ? 'Pay now · Paid' : 'Pay now · KHQR';
  }

  factory AdminOrderRow.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map?;
    return AdminOrderRow(
      id: json['id'] as int,
      orderNumber: (json['order_number'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      total: AdminDashboardStats._toDouble(json['total']),
      createdAt: (json['created_at'] ?? '').toString(),
      customerName: user?['name']?.toString(),
      paymentMethod: json['payment_method']?.toString(),
      paymentStatus: json['payment_status']?.toString(),
    );
  }
}

class AdminOrderPage {
  AdminOrderPage({required this.items, required this.currentPage, required this.hasMore});

  final List<AdminOrderRow> items;
  final int currentPage;
  final bool hasMore;

  factory AdminOrderPage.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    final items = data is List
        ? data.whereType<Map>().map((e) => AdminOrderRow.fromJson(Map<String, dynamic>.from(e))).toList()
        : <AdminOrderRow>[];
    final current = json['current_page'] as int? ?? 1;
    final last = json['last_page'] as int? ?? current;
    return AdminOrderPage(items: items, currentPage: current, hasMore: current < last);
  }
}

class AdminPaymentRow {
  AdminPaymentRow({
    required this.id,
    required this.method,
    required this.status,
    required this.amount,
    required this.createdAt,
    this.orderNumber,
  });

  final int id;
  final String method;
  final String status;
  final double amount;
  final String createdAt;
  final String? orderNumber;

  factory AdminPaymentRow.fromJson(Map<String, dynamic> json) {
    final order = json['order'] as Map?;
    return AdminPaymentRow(
      id: json['id'] as int,
      method: (json['method'] ?? json['payment_method'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      amount: AdminDashboardStats._toDouble(json['amount'] ?? order?['total']),
      createdAt: (json['created_at'] ?? '').toString(),
      orderNumber: order?['order_number']?.toString(),
    );
  }
}

class AdminPaymentPage {
  AdminPaymentPage({required this.items, required this.currentPage, required this.hasMore});

  final List<AdminPaymentRow> items;
  final int currentPage;
  final bool hasMore;

  factory AdminPaymentPage.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    final items = data is List
        ? data.whereType<Map>().map((e) => AdminPaymentRow.fromJson(Map<String, dynamic>.from(e))).toList()
        : <AdminPaymentRow>[];
    final current = json['current_page'] as int? ?? 1;
    final last = json['last_page'] as int? ?? current;
    return AdminPaymentPage(items: items, currentPage: current, hasMore: current < last);
  }
}

class AdminOrderItemLine {
  AdminOrderItemLine({required this.name, required this.qty, required this.price, this.imageUrl});

  final String name;
  final int qty;
  final double price;
  final String? imageUrl;

  factory AdminOrderItemLine.fromJson(Map<String, dynamic> json) {
    final product = json['product'] as Map?;
    return AdminOrderItemLine(
      name: (product?['name'] ?? json['name'] ?? 'Item').toString(),
      qty: AdminDashboardStats._toInt(json['quantity'] ?? json['qty']),
      price: AdminDashboardStats._toDouble(json['price'] ?? json['unit_price']),
      imageUrl: product?['image_url']?.toString(),
    );
  }
}

class AdminOrderDetail {
  AdminOrderDetail({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.paymentStatus,
    required this.total,
    required this.createdAt,
    this.paymentMethod,
    this.customerName,
    this.customerEmail,
    this.customerPhone,
    this.shippingAddress,
    this.shipmentId,
    this.shipmentStatus,
    this.shipmentProvider,
    this.deliveredByName,
    this.pickedUpByName,
    this.pickedUpByPhone,
    this.items = const [],
    this.payments = const [],
  });

  final int id;
  final String orderNumber;
  final String status;
  final String paymentStatus;
  final double total;
  final String createdAt;
  final String? paymentMethod;
  final String? customerName;
  final String? customerEmail;
  final String? customerPhone;
  final String? shippingAddress;
  final int? shipmentId;
  final String? shipmentStatus;
  final String? shipmentProvider;
  final String? deliveredByName;
  final String? pickedUpByName;
  final String? pickedUpByPhone;
  final List<AdminOrderItemLine> items;
  final List<AdminPaymentSnippet> payments;

  bool get isCod => paymentMethod == 'cod';
  bool get isCodPending => isCod && paymentStatus != 'paid';

  String? get courierLabel {
    final raw = shipmentProvider?.trim();
    if (raw == null || raw.isEmpty || raw.toLowerCase() == 'internal') return null;
    return raw;
  }

  factory AdminOrderDetail.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map?;
    final itemsRaw = json['items'];
    final paymentsRaw = json['payments'];
    final shipment = json['shipment'] as Map?;
    final provider = shipment?['courier_provider']?.toString() ?? shipment?['provider']?.toString();
    String? shipTo;
    final addr = json['shipping_address'];
    if (addr is Map) {
      shipTo = (addr['formatted_address'] ??
              [
                addr['house_no'],
                addr['street_no'],
                addr['sangkat'],
                addr['khan'],
                addr['province'],
              ].whereType<Object>().map((e) => e.toString()).where((s) => s.isNotEmpty).join(', '))
          .toString();
      if (shipTo.trim().isEmpty) shipTo = null;
    } else if (addr != null) {
      shipTo = addr.toString();
    }
    return AdminOrderDetail(
      id: AdminDashboardStats._toInt(json['id']),
      orderNumber: (json['order_number'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      paymentStatus: (json['payment_status'] ?? '').toString(),
      total: AdminDashboardStats._toDouble(json['total']),
      createdAt: (json['created_at'] ?? '').toString(),
      paymentMethod: json['payment_method']?.toString(),
      customerName: user?['name']?.toString(),
      customerEmail: user?['email']?.toString(),
      customerPhone: user?['phone']?.toString(),
      shippingAddress: shipTo,
      shipmentId: shipment?['id'] is int
          ? shipment!['id'] as int
          : int.tryParse(shipment?['id']?.toString() ?? ''),
      shipmentStatus: shipment?['status']?.toString(),
      shipmentProvider: provider,
      deliveredByName: shipment?['delivered_by_name']?.toString() ??
          (shipment?['delivered_by_user'] as Map?)?['name']?.toString(),
      pickedUpByName: shipment?['picked_up_by_name']?.toString(),
      pickedUpByPhone: shipment?['picked_up_by_phone']?.toString(),
      items: itemsRaw is List
          ? itemsRaw.whereType<Map>().map((e) => AdminOrderItemLine.fromJson(Map<String, dynamic>.from(e))).toList()
          : [],
      payments: paymentsRaw is List
          ? paymentsRaw
              .whereType<Map>()
              .map((e) => AdminPaymentSnippet.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : [],
    );
  }
}

class CodQuote {
  CodQuote({
    required this.usdAmount,
    required this.khrAmount,
    required this.exchangeRate,
    this.codPlan,
  });

  final double usdAmount;
  final int khrAmount;
  final int exchangeRate;
  final String? codPlan;

  factory CodQuote.fromJson(Map<String, dynamic> json) {
    return CodQuote(
      usdAmount: AdminDashboardStats._toDouble(json['usd_amount']),
      khrAmount: AdminDashboardStats._toInt(json['khr_amount']),
      exchangeRate: AdminDashboardStats._toInt(json['exchange_rate']),
      codPlan: json['cod_plan']?.toString(),
    );
  }
}

class CodKhqrPayment {
  CodKhqrPayment({
    required this.id,
    required this.status,
    this.qrString,
    this.amount,
    this.currency,
  });

  final int id;
  final String status;
  final String? qrString;
  final double? amount;
  final String? currency;

  factory CodKhqrPayment.fromJson(Map<String, dynamic> json) {
    return CodKhqrPayment(
      id: AdminDashboardStats._toInt(json['id']),
      status: (json['status'] ?? '').toString(),
      qrString: json['qr_string']?.toString(),
      amount: json['amount'] != null ? AdminDashboardStats._toDouble(json['amount']) : null,
      currency: json['currency']?.toString(),
    );
  }
}

class AdminPaymentDetail {
  AdminPaymentDetail({
    required this.id,
    required this.status,
    required this.method,
    required this.amount,
    required this.createdAt,
    this.orderId,
    this.orderNumber,
    this.referenceCode,
    this.customerName,
  });

  final int id;
  final String status;
  final String method;
  final double amount;
  final String createdAt;
  final int? orderId;
  final String? orderNumber;
  final String? referenceCode;
  final String? customerName;

  factory AdminPaymentDetail.fromJson(Map<String, dynamic> json) {
    final order = json['order'] as Map?;
    final user = order?['user'] as Map?;
    return AdminPaymentDetail(
      id: AdminDashboardStats._toInt(json['id']),
      status: (json['status'] ?? '').toString(),
      method: (json['method'] ?? json['payment_method'] ?? '').toString(),
      amount: AdminDashboardStats._toDouble(json['amount'] ?? order?['total']),
      createdAt: (json['created_at'] ?? '').toString(),
      orderId: order != null ? AdminDashboardStats._toInt(order['id']) : null,
      orderNumber: order?['order_number']?.toString(),
      referenceCode: json['reference_code']?.toString(),
      customerName: user?['name']?.toString(),
    );
  }
}

class AdminShipmentRow {
  AdminShipmentRow({
    required this.id,
    required this.orderId,
    required this.status,
    required this.trackingCode,
    this.provider,
    this.customerName,
  });

  final int id;
  final int orderId;
  final String status;
  final String trackingCode;
  final String? provider;
  final String? customerName;

  factory AdminShipmentRow.fromJson(Map<String, dynamic> json) {
    final order = json['order'] as Map?;
    final user = order?['user'] as Map?;
    return AdminShipmentRow(
      id: AdminDashboardStats._toInt(json['id']),
      orderId: AdminDashboardStats._toInt(json['order_id'] ?? order?['id']),
      status: (json['status'] ?? '').toString(),
      trackingCode: (json['tracking_code'] ?? json['tracking_number'] ?? '').toString(),
      provider: json['provider']?.toString(),
      customerName: user?['name']?.toString(),
    );
  }
}

class AdminShipmentPage {
  AdminShipmentPage({required this.items, required this.currentPage, required this.hasMore});

  final List<AdminShipmentRow> items;
  final int currentPage;
  final bool hasMore;

  factory AdminShipmentPage.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    final items = data is List
        ? data.whereType<Map>().map((e) => AdminShipmentRow.fromJson(Map<String, dynamic>.from(e))).toList()
        : <AdminShipmentRow>[];
    final current = json['current_page'] as int? ?? 1;
    final last = json['last_page'] as int? ?? current;
    return AdminShipmentPage(items: items, currentPage: current, hasMore: current < last);
  }
}

class AdminShipmentDetail extends AdminShipmentRow {
  AdminShipmentDetail({
    required super.id,
    required super.orderId,
    required super.status,
    required super.trackingCode,
    super.provider,
    super.customerName,
    this.events = const [],
  });

  final List<String> events;

  factory AdminShipmentDetail.fromJson(Map<String, dynamic> json) {
    final eventsRaw = json['tracking_events'];
    final events = eventsRaw is List
        ? eventsRaw
            .whereType<Map>()
            .map((e) => (e['description'] ?? e['note'] ?? e['status'] ?? '').toString())
            .where((s) => s.isNotEmpty)
            .toList()
        : <String>[];
    final row = AdminShipmentRow.fromJson(json);
    return AdminShipmentDetail(
      id: row.id,
      orderId: row.orderId,
      status: row.status,
      trackingCode: row.trackingCode,
      provider: row.provider,
      customerName: row.customerName,
      events: events,
    );
  }
}

class AdminCustomerRow {
  AdminCustomerRow({
    required this.id,
    required this.name,
    required this.email,
    this.phone,
    this.ordersCount,
    this.totalSpent,
    this.loyaltyTier,
  });

  final int id;
  final String name;
  final String email;
  final String? phone;
  final int? ordersCount;
  final double? totalSpent;
  final String? loyaltyTier;

  factory AdminCustomerRow.fromJson(Map<String, dynamic> json) {
    return AdminCustomerRow(
      id: AdminDashboardStats._toInt(json['id']),
      name: (json['name'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      phone: json['phone']?.toString(),
      ordersCount: json['orders_count'] != null ? AdminDashboardStats._toInt(json['orders_count']) : null,
      totalSpent: json['total_spent'] != null ? AdminDashboardStats._toDouble(json['total_spent']) : null,
      loyaltyTier: json['loyalty_tier']?.toString(),
    );
  }
}

class AdminCustomerPage {
  AdminCustomerPage({required this.items, required this.currentPage, required this.hasMore});

  final List<AdminCustomerRow> items;
  final int currentPage;
  final bool hasMore;

  factory AdminCustomerPage.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    final items = data is List
        ? data.whereType<Map>().map((e) => AdminCustomerRow.fromJson(Map<String, dynamic>.from(e))).toList()
        : <AdminCustomerRow>[];
    final current = json['current_page'] as int? ?? 1;
    final last = json['last_page'] as int? ?? current;
    return AdminCustomerPage(items: items, currentPage: current, hasMore: current < last);
  }
}

class AdminCustomerDetail extends AdminCustomerRow {
  AdminCustomerDetail({
    required super.id,
    required super.name,
    required super.email,
    super.phone,
    super.ordersCount,
    super.totalSpent,
    super.loyaltyTier,
    this.address,
    this.createdAt,
  });

  final String? address;
  final String? createdAt;

  factory AdminCustomerDetail.fromJson(Map<String, dynamic> json) {
    final row = AdminCustomerRow.fromJson(json);
    return AdminCustomerDetail(
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      ordersCount: row.ordersCount,
      totalSpent: row.totalSpent,
      loyaltyTier: row.loyaltyTier,
      address: json['address']?.toString(),
      createdAt: json['created_at']?.toString(),
    );
  }
}

class AdminContactRow {
  AdminContactRow({
    required this.id,
    required this.name,
    required this.email,
    required this.subject,
    required this.message,
    required this.status,
    this.phone,
    this.adminNote,
    this.createdAt,
  });

  final int id;
  final String name;
  final String email;
  final String subject;
  final String message;
  final String status;
  final String? phone;
  final String? adminNote;
  final String? createdAt;

  factory AdminContactRow.fromJson(Map<String, dynamic> json) {
    return AdminContactRow(
      id: AdminDashboardStats._toInt(json['id']),
      name: (json['name'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      subject: (json['subject'] ?? '').toString(),
      message: (json['message'] ?? '').toString(),
      status: (json['status'] ?? 'new').toString(),
      phone: json['phone']?.toString(),
      adminNote: json['admin_note']?.toString(),
      createdAt: json['created_at']?.toString(),
    );
  }
}

class AdminContactPage {
  AdminContactPage({required this.items, required this.currentPage, required this.hasMore, this.stats});

  final List<AdminContactRow> items;
  final int currentPage;
  final bool hasMore;
  final Map<String, int>? stats;

  factory AdminContactPage.fromJson(Map<String, dynamic> json) {
    final contacts = json['contacts'];
    final items = contacts is List
        ? contacts.whereType<Map>().map((e) => AdminContactRow.fromJson(Map<String, dynamic>.from(e))).toList()
        : <AdminContactRow>[];
    final pagination = json['pagination'] as Map? ?? json;
    final current = AdminDashboardStats._toInt(pagination['current_page'] ?? json['current_page'] ?? 1);
    final last = AdminDashboardStats._toInt(pagination['last_page'] ?? json['last_page'] ?? current);
    final statsRaw = json['stats'] as Map?;
    return AdminContactPage(
      items: items,
      currentPage: current,
      hasMore: current < last,
      stats: statsRaw != null
          ? statsRaw.map((k, v) => MapEntry(k.toString(), AdminDashboardStats._toInt(v)))
          : null,
    );
  }
}

class AdminReplacementRow {
  AdminReplacementRow({
    required this.id,
    required this.status,
    required this.reason,
    this.orderNumber,
    this.customerName,
    this.createdAt,
  });

  final int id;
  final String status;
  final String reason;
  final String? orderNumber;
  final String? customerName;
  final String? createdAt;

  factory AdminReplacementRow.fromJson(Map<String, dynamic> json) {
    final order = json['order'] as Map?;
    final user = order?['user'] as Map?;
    return AdminReplacementRow(
      id: AdminDashboardStats._toInt(json['id']),
      status: (json['status'] ?? '').toString(),
      reason: (json['reason'] ?? '').toString(),
      orderNumber: order?['order_number']?.toString(),
      customerName: user?['name']?.toString(),
      createdAt: json['created_at']?.toString(),
    );
  }
}

class AdminReplacementPage {
  AdminReplacementPage({required this.items, required this.currentPage, required this.hasMore});

  final List<AdminReplacementRow> items;
  final int currentPage;
  final bool hasMore;

  factory AdminReplacementPage.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    final items = data is List
        ? data.whereType<Map>().map((e) => AdminReplacementRow.fromJson(Map<String, dynamic>.from(e))).toList()
        : <AdminReplacementRow>[];
    final current = json['current_page'] as int? ?? 1;
    final last = json['last_page'] as int? ?? current;
    return AdminReplacementPage(items: items, currentPage: current, hasMore: current < last);
  }
}

class AdminReplacementDetail extends AdminReplacementRow {
  AdminReplacementDetail({
    required super.id,
    required super.status,
    required super.reason,
    super.orderNumber,
    super.customerName,
    super.createdAt,
    this.notes,
  });

  final String? notes;

  factory AdminReplacementDetail.fromJson(Map<String, dynamic> json) {
    final row = AdminReplacementRow.fromJson(json);
    return AdminReplacementDetail(
      id: row.id,
      status: row.status,
      reason: row.reason,
      orderNumber: row.orderNumber,
      customerName: row.customerName,
      createdAt: row.createdAt,
      notes: json['notes']?.toString() ?? json['admin_notes']?.toString(),
    );
  }
}

class PosSaleHistoryRow {
  PosSaleHistoryRow({
    required this.id,
    required this.orderNumber,
    required this.total,
    required this.paymentMethod,
    required this.itemsCount,
    required this.createdAt,
    this.sellerName,
  });

  final int id;
  final String orderNumber;
  final double total;
  final String paymentMethod;
  final int itemsCount;
  final String createdAt;
  final String? sellerName;

  factory PosSaleHistoryRow.fromJson(Map<String, dynamic> json) {
    final seller = json['seller'] as Map?;
    return PosSaleHistoryRow(
      id: AdminDashboardStats._toInt(json['id']),
      orderNumber: (json['order_number'] ?? '').toString(),
      total: AdminDashboardStats._toDouble(json['total']),
      paymentMethod: (json['payment_method'] ?? '').toString(),
      itemsCount: AdminDashboardStats._toInt(json['items_count']),
      createdAt: (json['created_at'] ?? '').toString(),
      sellerName: seller?['name']?.toString(),
    );
  }
}

class PosSaleHistoryPage {
  PosSaleHistoryPage({
    required this.items,
    required this.currentPage,
    required this.hasMore,
    this.todayTotal,
    this.todayCount,
  });

  final List<PosSaleHistoryRow> items;
  final int currentPage;
  final bool hasMore;
  final double? todayTotal;
  final int? todayCount;

  factory PosSaleHistoryPage.fromJson(Map<String, dynamic> json) {
    final dataBlock = json['data'] as Map? ?? json;
    final list = dataBlock['data'];
    final items = list is List
        ? list.whereType<Map>().map((e) => PosSaleHistoryRow.fromJson(Map<String, dynamic>.from(e))).toList()
        : <PosSaleHistoryRow>[];
    final current = AdminDashboardStats._toInt(dataBlock['current_page'] ?? 1);
    final last = AdminDashboardStats._toInt(dataBlock['last_page'] ?? current);
    final summary = json['summary'] as Map?;
    final today = summary?['today'] as Map?;
    return PosSaleHistoryPage(
      items: items,
      currentPage: current,
      hasMore: current < last,
      todayTotal: today != null ? AdminDashboardStats._toDouble(today['total']) : null,
      todayCount: today != null ? AdminDashboardStats._toInt(today['count']) : null,
    );
  }
}
