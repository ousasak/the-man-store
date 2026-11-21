/// Mobile KHQR bank choices at checkout — payment opens via NBC Bakong deeplink.
enum KhqrBankId {
  aba,
  bakongKhqr,
}

class KhqrBankOption {
  const KhqrBankOption({
    required this.id,
    required this.labelEn,
    required this.labelKm,
    required this.subtitleEn,
    required this.subtitleKm,
  });

  final KhqrBankId id;
  final String labelEn;
  final String labelKm;
  final String subtitleEn;
  final String subtitleKm;

  static const aba = KhqrBankOption(
    id: KhqrBankId.aba,
    labelEn: 'ABA PAY',
    labelKm: 'ABA PAY',
    subtitleEn: 'Tap to pay with ABA Mobile',
    subtitleKm: 'ចុចដើម្បីបង់តាម ABA Mobile',
  );

  static const bakongKhqr = KhqrBankOption(
    id: KhqrBankId.bakongKhqr,
    labelEn: 'KHQR (other banks)',
    labelKm: 'KHQR (ធនាគារផ្សេង)',
    subtitleEn: 'Wing, ACLEDA, Canadia & Bakong apps',
    subtitleKm: 'Wing, ACLEDA, Canadia និង Bakong',
  );

  static const List<KhqrBankOption> all = [aba, bakongKhqr];

  static KhqrBankOption byId(KhqrBankId id) =>
      all.firstWhere((b) => b.id == id, orElse: () => aba);

  String payButtonLabelEn(bool isKm) {
    if (isKm) {
      return id == KhqrBankId.aba ? 'បង់ជាមួយ ABA Mobile' : 'បង់តាម KHQR';
    }
    return id == KhqrBankId.aba ? 'Pay with ABA Mobile' : 'Pay with banking app';
  }
}
