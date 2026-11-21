/// Admin mobile UI copy — English + Khmer.
class AdminL10n {
  const AdminL10n(this.language);

  final String language;

  bool get isKm => language == 'km';

  String _t(String en, String km) => isKm ? km : en;

  // Tabs & pages
  String get dashboard => _t('Dashboard', 'ផ្ទាំងគ្រប់គ្រង');
  String get reports => _t('Reports', 'របាយការណ៍');
  String analyticsPeriod(String periodLabel) => _t('Analytics · $periodLabel', 'វិភាគ · $periodLabel');
  String get orders => _t('Orders', 'ការបញ្ជាទិញ');
  String get payments => _t('Payments', 'ការទូទាត់');
  String get products => _t('Products', 'ផលិតផល');
  String get checkout => _t('Checkout', 'ទូទាត់');
  String get scan => _t('Scan', 'ស្កេន');
  String get account => _t('Account', 'គណនី');

  // Preferences
  String get preferences => _t('Preferences', 'ចំណូលចិត្ត');
  String get languageTitle => _t('Language', 'ភាសា');
  String get lightDark => _t('Light / Dark mode', 'ពន្លឺ / ងងឹត');
  String get themePreset => _t('Theme preset', 'ពណ៌រចនា');
  String get chartStyle => _t('Chart style', 'រូបបែបក្រាប');
  String get numberFormat => _t('Number format', 'ទម្រង់លេខ');
  String get numberFormatFull => _t('Full', 'ពេញ');
  String get numberFormatCompact => _t('Compact', 'ក្បៀន');

  // Modules
  String get contacts => _t('Contacts', 'សារទំនាក់ទំនង');
  String get contactInbox => _t('Contact inbox', 'ប្រអប់សារ');
  String get shipments => _t('Shipments', 'ការដឹកជញ្ជូន');
  String get customers => _t('Customers', 'អតិថិជន');
  String get replacements => _t('Replacements', 'ជំនួស');
  String get saleHistory => _t('POS sale history', 'ប្រវត្តិលក់ POS');

  // Dashboard / reports
  String get revenue => _t('Revenue', 'ចំណូល');
  String get catalog => _t('Catalog', 'កាតាឡុក');
  String get dailyRevenue => _t('Daily revenue', 'ចំណូលប្រចាំថ្ងៃ');
  String get netSettledSales => _t('Net settled sales', 'ការលក់សុទ្ធ');
  String get fullReports => _t('Full reports', 'របាយការណ៍ពេញ');
  String get quickActions => _t('Quick actions', 'សកម្មភាពរហ័ស');
  String get periodTotal => _t('Period total', 'សរុបរយៈពេល');
  String get productsByCategory => _t('Products by category', 'ផលិតផលតាមប្រភេទ');
  String get shareOfCatalogue => _t('Share of catalogue', 'សមាមាត្រកាតាឡុក');

  // Common
  String get loadMore => _t('Load more', 'មើលបន្ថែម');
  String get retry => _t('Retry', 'ព្យាយាមម្តងទៀត');
  String get today => _t('Today', 'ថ្ងៃនេះ');
  String get all => _t('All', 'ទាំងអស់');
  String get pending => _t('pending', 'កំពុងរង់ចាំ');
  String get searchOrders => _t('Search orders…', 'ស្វែងរកការបញ្ជាទិញ…');
  String get searchProducts => _t('Search products…', 'ស្វែងរកផលិតផល…');
  String get searchCustomers => _t('Search name, email, phone…', 'ស្វែងរកឈ្មោះ អ៊ីមែល ទូរស័ព្ទ…');
  String get search => _t('Search…', 'ស្វែងរក…');

  String navLabel(AdminNavItemKey item) {
    return switch (item) {
      AdminNavItemKey.home => dashboard,
      AdminNavItemKey.reports => reports,
      AdminNavItemKey.scan => scan,
      AdminNavItemKey.orders => orders,
      AdminNavItemKey.payments => payments,
    };
  }

  String quickActionLabel(AdminQuickActionId id) {
    return switch (id) {
      AdminQuickActionId.checkout => checkout,
      AdminQuickActionId.orders => orders,
      AdminQuickActionId.payments => payments,
      AdminQuickActionId.products => products,
      AdminQuickActionId.shipments => shipments,
      AdminQuickActionId.customers => customers,
      AdminQuickActionId.contacts => contacts,
      AdminQuickActionId.replacements => replacements,
      AdminQuickActionId.saleHistory => saleHistory,
      AdminQuickActionId.account => account,
    };
  }
}

enum AdminNavItemKey { home, reports, scan, orders, payments }

enum AdminQuickActionId {
  checkout,
  orders,
  payments,
  products,
  shipments,
  customers,
  contacts,
  replacements,
  saleHistory,
  account,
}
