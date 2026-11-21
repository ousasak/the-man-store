const courierProviders = [
  'J&T Express',
  'Vireak Buntham Express',
  'Grab Express',
  'Ninja Van',
  'Kerry Express',
  'In-house / Staff',
  'Other',
];

List<String> get kCourierProviders => List.unmodifiable(courierProviders);

class CodSettlementInfo {
  const CodSettlementInfo({
    required this.method,
    required this.channelKm,
    required this.channelEn,
    required this.labelKm,
    required this.labelEn,
    this.currency,
    this.expectedAmount,
    this.actualAmountReceived,
    this.expectedLabel,
    this.actualLabel,
    this.courierName,
    this.notes,
  });

  final String method;
  final String channelKm;
  final String channelEn;
  final String labelKm;
  final String labelEn;
  final String? currency;
  final num? expectedAmount;
  final num? actualAmountReceived;
  final String? expectedLabel;
  final String? actualLabel;
  final String? courierName;
  final String? notes;
}

const _settlements = <String, CodSettlementInfo>{
  'cod_cash_usd': CodSettlementInfo(
    method: 'cod_cash_usd',
    channelKm: 'លុយក្រៅ',
    channelEn: 'Outdoor cash',
    labelKm: 'លុយក្រៅ — ដុល្លារ (USD)',
    labelEn: 'Outdoor cash — USD',
    currency: 'USD',
  ),
  'cod_cash_khr': CodSettlementInfo(
    method: 'cod_cash_khr',
    channelKm: 'លុយក្រៅ',
    channelEn: 'Outdoor cash',
    labelKm: 'លុយក្រៅ — រៀល (KHR)',
    labelEn: 'Outdoor cash — KHR',
    currency: 'KHR',
  ),
  'cod_khqr': CodSettlementInfo(
    method: 'cod_khqr',
    channelKm: 'QR ហាង — អ្នកដឹកស្កេន',
    channelEn: 'Shop QR — driver scans',
    labelKm: 'បានបង់ដោយអ្នកដឹកជា QR',
    labelEn: 'Paid by driver via QR',
    currency: 'KHR',
  ),
  'cod_driver_qr': CodSettlementInfo(
    method: 'cod_driver_qr',
    channelKm: 'Driver បង់ឥឡូវ — QR',
    channelEn: 'Driver pays now — QR',
    labelKm: 'បានបង់ដោយអ្នកដឹកជា QR',
    labelEn: 'Paid by driver via QR',
    currency: 'USD',
  ),
  'cod_driver_cash': CodSettlementInfo(
    method: 'cod_driver_cash',
    channelKm: 'Driver អោយជាលុយសុទ្ធ',
    channelEn: 'Driver paid cash',
    labelKm: 'Driver អោយជាលុយសុទ្ធ',
    labelEn: 'Driver paid cash to the shop',
    currency: 'USD',
  ),
  'cod_customer_driver_qr': CodSettlementInfo(
    method: 'cod_customer_driver_qr',
    channelKm: 'Customer បង់ QR អ្នកដឹក',
    channelEn: 'Customer paid driver QR',
    labelKm: 'Customer បង់ QR អ្នកដឹក — អ្នកដឹកនឹងបង់មកហាងផ្ទាល់',
    labelEn: 'Customer paid the driver QR — driver remits to the shop',
    currency: 'USD',
  ),
};

String? _formatAmount(num? amount, String? currency) {
  if (amount == null) return null;
  if (currency == 'KHR') {
    return '${amount.round().toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')} ៛';
  }
  return '\$${amount.toStringAsFixed(2)}';
}

CodSettlementInfo? settlementFromPayments(List<AdminPaymentSnippet> payments) {
  AdminPaymentSnippet? paid;
  for (final p in payments) {
    if (p.status == 'paid' || p.status == 'success') {
      paid = p;
      break;
    }
  }
  if (paid == null || paid.method.isEmpty) return null;

  final base = _settlements[paid.method] ??
      CodSettlementInfo(
        method: paid.method,
        channelKm: paid.method,
        channelEn: paid.method,
        labelKm: paid.method,
        labelEn: paid.method,
      );
  final raw = paid.rawResponse ?? const <String, dynamic>{};
  final currency = (raw['currency'] ?? paid.currency ?? base.currency)?.toString();
  final expected = raw['expected_amount'] is num
      ? raw['expected_amount'] as num
      : (paid.amount);
  final actual = raw['actual_amount_received'] is num
      ? raw['actual_amount_received'] as num
      : paid.amount;
  final qrBank = (raw['qr_bank_label'] ?? raw['qr_bank'])?.toString();
  final labelKm = raw['settlement_label_km']?.toString() ??
      (((paid.method == 'cod_driver_qr' || paid.method == 'cod_khqr') &&
              qrBank != null &&
              qrBank.isNotEmpty)
          ? 'បានបង់ដោយអ្នកដឹកជា QR ($qrBank)'
          : base.labelKm);
  final labelEn = raw['settlement_label_en']?.toString() ??
      (((paid.method == 'cod_driver_qr' || paid.method == 'cod_khqr') &&
              qrBank != null &&
              qrBank.isNotEmpty)
          ? 'Paid by driver via QR ($qrBank)'
          : base.labelEn);

  return CodSettlementInfo(
    method: base.method,
    channelKm: base.channelKm,
    channelEn: base.channelEn,
    labelKm: labelKm,
    labelEn: labelEn,
    currency: currency,
    expectedAmount: expected,
    actualAmountReceived: actual,
    expectedLabel: _formatAmount(expected, currency),
    actualLabel: _formatAmount(actual, currency),
    courierName: raw['courier_name']?.toString(),
    notes: raw['notes']?.toString(),
  );
}

/// Lightweight payment row used by admin order COD settlement.
class AdminPaymentSnippet {
  AdminPaymentSnippet({
    required this.id,
    required this.status,
    required this.method,
    required this.amount,
    this.currency,
    this.rawResponse,
  });

  final int id;
  final String status;
  final String method;
  final double amount;
  final String? currency;
  final Map<String, dynamic>? rawResponse;

  factory AdminPaymentSnippet.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic>? raw;
    final rawVal = json['raw_response'];
    if (rawVal is Map) {
      raw = Map<String, dynamic>.from(rawVal);
    }
    return AdminPaymentSnippet(
      id: int.tryParse('${json['id']}') ?? 0,
      status: (json['status'] ?? '').toString(),
      method: (json['method'] ?? '').toString(),
      amount: double.tryParse('${json['amount'] ?? 0}') ?? 0,
      currency: json['currency']?.toString(),
      rawResponse: raw,
    );
  }
}
