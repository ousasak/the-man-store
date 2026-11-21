import {
  PAGE_LOCALES,
  normalizeSharedOrder,
  reorderSharedOrderKeys,
  resolvePageLocale,
  syncBilingualLocales,
  updateBilingualLocale,
} from './pageLocaleContent.js';

export const DEFAULT_PRIVACY_SECTION_ORDER = [
  'introduction',
  'data_we_collect',
  'how_we_use_data',
  'data_sharing',
  'data_security',
  'your_rights',
  'cookies',
  'childrens_privacy',
  'policy_changes',
  'contact_us',
];

const DEFAULT_PRIVACY_INQUIRY_EN = {
  enabled: true,
  title: 'Privacy Inquiry',
  subtitle: 'Have a privacy concern? Send us a message directly',
  button_label: 'Send Privacy Inquiry',
  dialog_description: 'Tell us about your privacy concern',
  subject_placeholder: 'Privacy concern...',
  message_placeholder: 'Details of your concern...',
  submit_label: 'Send Inquiry',
};

const DEFAULT_PRIVACY_INQUIRY_KM = {
  enabled: true,
  title: 'សំណួរអំពីភាពឯកជន',
  subtitle: 'មានការព្រួយបារម្ភអំពីភាពឯកជន? ផ្ញើសារមកយើងដោយផ្ទាល់',
  button_label: 'ផ្ញើសំណួរភាពឯកជន',
  dialog_description: 'ប្រាប់យើងអំពីការព្រួយបារម្ភរបស់អ្នក',
  subject_placeholder: 'បញ្ហាពាក់ព័ន្ធភាពឯកជន...',
  message_placeholder: 'ព័ត៌មានលម្អិតអំពីបញ្ហារបស់អ្នក...',
  submit_label: 'ផ្ញើសំណួរ',
};

const DEFAULT_PRIVACY_EN = {
  title: 'Privacy Policy',
  last_updated: 'Last updated: January 2026',
  sections: {
    introduction: {
      title: '1. Introduction',
      intro: '',
      body: 'Welcome to The Man Store. We respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, and safeguard your information when you visit our website and make purchases.',
      items: [],
      footer: '',
      contact_box: null,
    },
    data_we_collect: {
      title: '2. Data We Collect',
      intro: 'We may collect the following types of information:',
      body: '',
      items: [
        { label: 'Personal information:', text: 'Name, email address, phone number, shipping and billing addresses' },
        { label: 'Payment information:', text: 'Transaction data, payment method details (processed securely through our payment providers)' },
        { label: 'Account data:', text: 'Username, password, purchase history, wishlist items' },
        { label: 'Technical data:', text: 'IP address, browser type, operating system, referring URLs' },
        { label: 'Communication data:', text: 'Messages you send to our customer support' },
      ],
      footer: '',
      contact_box: null,
    },
    how_we_use_data: {
      title: '3. How We Use Your Data',
      intro: 'We use your data for the following purposes:',
      body: '',
      items: [
        { label: '', text: 'Processing and fulfilling your orders' },
        { label: '', text: 'Managing your account and providing customer support' },
        { label: '', text: 'Sending order updates and delivery notifications' },
        { label: '', text: 'Improving our website and shopping experience' },
        { label: '', text: 'Sending promotional offers (with your consent)' },
        { label: '', text: 'Detecting and preventing fraud' },
      ],
      footer: '',
      contact_box: null,
    },
    data_sharing: {
      title: '4. Data Sharing',
      intro: 'We do not sell your personal data. We may share your information with:',
      body: '',
      items: [
        { label: 'Service providers:', text: 'Payment processors, shipping companies, hosting services' },
        { label: 'Legal requirements:', text: 'When required by law or to protect our rights' },
        { label: 'Business transfers:', text: 'In case of merger, acquisition, or sale of assets' },
      ],
      footer: '',
      contact_box: null,
    },
    data_security: {
      title: '5. Data Security',
      intro: '',
      body: 'We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction. All data is encrypted in transit and at rest where possible.',
      items: [],
      footer: '',
      contact_box: null,
    },
    your_rights: {
      title: '6. Your Rights',
      intro: 'You have the following rights regarding your personal data:',
      body: '',
      items: [
        { label: 'Access:', text: 'Request a copy of the data we hold about you' },
        { label: 'Correction:', text: 'Request correction of inaccurate or incomplete data' },
        { label: 'Deletion:', text: 'Request deletion of your account and associated data' },
        { label: 'Opt-out:', text: 'Unsubscribe from marketing emails at any time' },
      ],
      footer: 'To exercise these rights, please contact us at kalapakgpt@gmail.com',
      contact_box: null,
    },
    cookies: {
      title: '7. Cookies',
      intro: '',
      body: 'We use cookies and similar technologies to enhance your browsing experience, analyze site traffic, and personalize content. You can control cookies through your browser settings. For more information, please see our Cookie Policy.',
      items: [],
      footer: '',
      contact_box: null,
    },
    childrens_privacy: {
      title: "8. Children's Privacy",
      intro: '',
      body: 'Our website is not intended for children under 18. We do not knowingly collect personal information from minors. If you believe we have collected data from a child, please contact us immediately.',
      items: [],
      footer: '',
      contact_box: null,
    },
    policy_changes: {
      title: '9. Changes to This Policy',
      intro: '',
      body: 'We may update this privacy policy from time to time. Any changes will be posted on this page with an updated revision date. We encourage you to review this policy periodically.',
      items: [],
      footer: '',
      contact_box: null,
    },
    contact_us: {
      title: '10. Contact Us',
      intro: '',
      body: 'If you have questions about this privacy policy or our data practices, please contact us:',
      items: [],
      footer: '',
      contact_box: {
        company: 'The Man Store',
        email_label: 'Email:',
        email: 'support@themanstore.com',
        location: 'Phnom Penh, Cambodia',
      },
    },
  },
  inquiry: DEFAULT_PRIVACY_INQUIRY_EN,
};

const DEFAULT_PRIVACY_KM = {
  title: 'គោលនយោបាយភាពឯកជន',
  last_updated: 'ធ្វើបច្ចុប្បន្នភាពចុងក្រោយ៖ មករា 2026',
  sections: {
    introduction: {
      title: '1. បើកកថា',
      intro: '',
      body: 'សូមស្វាគមន៍មកកាន់ The Man Store។ យើងគោរពភាពឯកជនរបស់អ្នក និងប្តេជ្ញាការពារទិន្នន័យផ្ទាល់ខ្លួន។ គោលនយោបាយនេះពន្យល់អំពីការប្រមូល ប្រើប្រាស់ និងការពារព័ត៌មាននៅពេលអ្នកប្រើគេហទំព័រ និងទិញទំនិញ។',
      items: [],
      footer: '',
      contact_box: null,
    },
    data_we_collect: {
      title: '2. ទិន្នន័យដែលយើងប្រមូល',
      intro: 'យើងអាចប្រមូលព័ត៌មានប្រភេទដូចខាងក្រោម៖',
      body: '',
      items: [
        { label: 'ព័ត៌មានផ្ទាល់ខ្លួន៖', text: 'ឈ្មោះ អ៊ីមែល លេខទូរស័ព្ទ អាសយដ្ឋានដឹកជញ្ជូន និងវិក្កយបត្រ' },
        { label: 'ព័ត៌មានបង់ប្រាក់៖', text: 'ទិន្នន័យប្រតិបត្តិការ និងព័ត៌មានវិធីបង់ប្រាក់ (ដំណើរការដោយសុវត្ថិភាពតាមអ្នកផ្តល់សេវាបង់ប្រាក់)' },
        { label: 'ទិន្នន័យគណនី៖', text: 'ឈ្មោះអ្នកប្រើ ពាក្យសម្ងាត់ ប្រវត្តិទិញ បញ្ជីចង់បាន' },
        { label: 'ទិន្នន័យបច្ចេកទេស៖', text: 'អាសយដ្ឋាន IP ប្រភេទកម្មវិធីរុករក ប្រព័ន្ធប្រតិបត្តិការ តំណយោង' },
        { label: 'ទិន្នន័យទំនាក់ទំនង៖', text: 'សារដែលអ្នកផ្ញើទៅការគាំទ្រអតិថិជន' },
      ],
      footer: '',
      contact_box: null,
    },
    how_we_use_data: {
      title: '3. របៀបប្រើប្រាស់ទិន្នន័យ',
      intro: 'យើងប្រើទិន្នន័យសម្រាប់គោលបំណងដូចខាងក្រោម៖',
      body: '',
      items: [
        { label: '', text: 'ដំណើរការ និងបំពេញការបញ្ជាទិញ' },
        { label: '', text: 'គ្រប់គ្រងគណនី និងផ្តល់ការគាំទ្រអតិថិជន' },
        { label: '', text: 'ផ្ញើការធ្វើបច្ចុប្បន្នភាពការបញ្ជាទិញ និងសារជូនដំណឹងដឹកជញ្ជូន' },
        { label: '', text: 'ធ្វើឱ្យគេហទំព័រ និងបទពិសោធន៍ទិញប្រសើរឡើង' },
        { label: '', text: 'ផ្ញើការផ្តល់ជូនពិសេស (ដោយការយល់ព្រម)' },
        { label: '', text: 'រកឃើញ និងទប់ស្កាត់ការក្លែងបន្លំ' },
      ],
      footer: '',
      contact_box: null,
    },
    data_sharing: {
      title: '4. ការចែករំលែកទិន្នន័យ',
      intro: 'យើងមិនលក់ទិន្នន័យផ្ទាល់ខ្លួនរបស់អ្នកទេ។ យើងអាចចែករំលែកព័ត៌មានជាមួយ៖',
      body: '',
      items: [
        { label: 'អ្នកផ្តល់សេវា៖', text: 'អ្នកដំណើរការបង់ប្រាក់ ក្រុមហ៊ុនដឹកជញ្ជូន សេវាហូស្ទីង' },
        { label: 'តម្រូវការផ្លូវច្បាប់៖', text: 'នៅពេលច្បាប់ទាមទារ ឬការពារសិទ្ធិរបស់យើង' },
        { label: 'ការផ្ទេរអាជីវកម្ម៖', text: 'ក្នុងករណីបញ្ចូលគ្នា ទិញយក ឬលក់ទ្រព្យសម្បត្តិ' },
      ],
      footer: '',
      contact_box: null,
    },
    data_security: {
      title: '5. សុវត្ថិភាពទិន្នន័យ',
      intro: '',
      body: 'យើងអនុវត្តវិធានការបច្ចេកទេស និងរចនាសម្ព័ន្ធសមស្រប ដើម្បីការពារទិន្នន័យផ្ទាល់ខ្លួនពីការចូលប្រើ ប្រែប្រួល បង្ហាញ ឬបំផ្លាញដោយគ្មានការអនុញ្ញាត។ ទិន្នន័យត្រូវបានអ៊ិនគ្រីបក្នុងការផ្ទេរ និងរក្សាទុក។',
      items: [],
      footer: '',
      contact_box: null,
    },
    your_rights: {
      title: '6. សិទ្ធិរបស់អ្នក',
      intro: 'អ្នកមានសិទ្ធិដូចខាងក្រោមពាក់ព័ន្ធនឹងទិន្នន័យផ្ទាល់ខ្លួន៖',
      body: '',
      items: [
        { label: 'ចូលប្រើ៖', text: 'ស្នើសុំច្បាប់ចម្លងទិន្នន័យដែលយើងរក្សាទុក' },
        { label: 'កែតម្រូវ៖', text: 'ស្នើសុំកែតម្រូវទិន្នន័យមិនត្រឹមត្រូវ ឬមិនពេញលេញ' },
        { label: 'លុបចោល៖', text: 'ស្នើសុំលុបគណនី និងទិន្នន័យពាក់ព័ន្ធ' },
        { label: 'បោះបង់៖', text: 'បោះបង់ការទទួលអ៊ីមែលផ្សព្វផ្សាយគ្រប់ពេល' },
      ],
      footer: 'ដើម្បីអនុវត្តសិទ្ធិទាំងនេះ សូមទំនាក់ទំនងមក kalapakgpt@gmail.com',
      contact_box: null,
    },
    cookies: {
      title: '7. ខូគី (Cookies)',
      intro: '',
      body: 'យើងប្រើខូគី និងបច្ចេកវិទ្យាស្រដៀង ដើម្បីធ្វើឱ្យបទពិសោធន៍រុករកល្អប្រសើរ វិភាគចរាចរណ៍ និងប្ដូរខ្លឹមសារ។ អ្នកអាចគ្រប់គ្រងខូគីតាមការកំណត់កម្មវិធីរុករក។',
      items: [],
      footer: '',
      contact_box: null,
    },
    childrens_privacy: {
      title: '8. ភាពឯកជនកុមារ',
      intro: '',
      body: 'គេហទំព័រមិនសម្រាប់កុមារអាយុក្រោម 18 ឆ្នាំទេ។ យើងមិនមានបំណងប្រមូលព័ត៌មានពីកុមារទេ។ ប្រសិនបើអ្នកគិតថាមានទិន្នន័យពីកុមារ សូមទំនាក់ទំនងភ្លាមៗ។',
      items: [],
      footer: '',
      contact_box: null,
    },
    policy_changes: {
      title: '9. ការផ្លាស់ប្តូរគោលនយោបាយនេះ',
      intro: '',
      body: 'យើងអាចធ្វើបច្ចុប្បន្នភាពគោលនយោបាយនេះពីពេលទៅពេល។ ការផ្លាស់ប្តូរណាមួយនឹងត្រូវបានបង្ហាញនៅលើទំព័រនេះជាមួយកាលបរិច្ឆេទថ្មី។',
      items: [],
      footer: '',
      contact_box: null,
    },
    contact_us: {
      title: '10. ទំនាក់ទំនងយើង',
      intro: '',
      body: 'ប្រសិនបើអ្នកមានសំណួរអំពីគោលនយោបាយនេះ ឬការប្រើទិន្នន័យ សូមទំនាក់ទំនងមកយើង៖',
      items: [],
      footer: '',
      contact_box: {
        company: 'The Man Store',
        email_label: 'អ៊ីមែល៖',
        email: 'support@themanstore.com',
        location: 'ភ្នំពេញ កម្ពុជា',
      },
    },
  },
  inquiry: DEFAULT_PRIVACY_INQUIRY_KM,
};

export const DEFAULT_PRIVACY_PAGE = {
  ...DEFAULT_PRIVACY_EN,
  section_order: DEFAULT_PRIVACY_SECTION_ORDER,
};

export const DEFAULT_PRIVACY_BILINGUAL = {
  section_order: DEFAULT_PRIVACY_SECTION_ORDER,
  locales: { en: DEFAULT_PRIVACY_EN, km: DEFAULT_PRIVACY_KM },
};

function normalizeSection(section, fallbackTitle = 'Section') {
  if (!section || typeof section !== 'object') {
    return {
      title: fallbackTitle,
      intro: '',
      body: '',
      items: [],
      footer: '',
      contact_box: null,
    };
  }

  const items = Array.isArray(section.items)
    ? section.items.map((item) => ({
      label: String(item?.label || ''),
      text: String(item?.text || ''),
    }))
    : [];

  let contactBox = null;
  if (section.contact_box && typeof section.contact_box === 'object') {
    contactBox = {
      company: String(section.contact_box.company || ''),
      email_label: String(section.contact_box.email_label || 'Email:'),
      email: String(section.contact_box.email || ''),
      location: String(section.contact_box.location || ''),
    };
  }

  return {
    title: String(section.title || fallbackTitle),
    intro: String(section.intro || ''),
    body: String(section.body || ''),
    items,
    footer: String(section.footer || ''),
    contact_box: contactBox,
  };
}

function normalizeInquiry(inquiry, fallback) {
  const source = inquiry && typeof inquiry === 'object' ? inquiry : {};

  return {
    enabled: source.enabled !== false,
    title: String(source.title || fallback.title),
    subtitle: String(source.subtitle || fallback.subtitle),
    button_label: String(source.button_label || fallback.button_label),
    dialog_description: String(source.dialog_description || fallback.dialog_description),
    subject_placeholder: String(source.subject_placeholder || fallback.subject_placeholder),
    message_placeholder: String(source.message_placeholder || fallback.message_placeholder),
    submit_label: String(source.submit_label || fallback.submit_label),
  };
}

function normalizeLocale(localeData, fallback) {
  const sections = {};
  const source = localeData?.sections && typeof localeData.sections === 'object' ? localeData.sections : fallback.sections;

  for (const [key, section] of Object.entries(source)) {
    sections[key] = normalizeSection(section, key);
  }

  return {
    title: String(localeData?.title || fallback.title),
    last_updated: String(localeData?.last_updated || fallback.last_updated),
    sections: Object.keys(sections).length ? sections : fallback.sections,
    inquiry: normalizeInquiry(localeData?.inquiry, fallback.inquiry),
  };
}

function createEmptyPrivacySection(locale) {
  return {
    title: locale === 'km' ? 'ផ្នែកថ្មី' : 'New Section',
    intro: '',
    body: '',
    items: [],
    footer: '',
    contact_box: null,
  };
}

export function normalizePrivacySectionOrder(order, sections) {
  return normalizeSharedOrder(order, Object.keys(sections || {}));
}

export function reorderPrivacySectionKeys(order, sectionKey, direction) {
  return reorderSharedOrderKeys(order, sectionKey, direction);
}

export function orderPrivacySectionEntries(sections, order) {
  return normalizePrivacySectionOrder(order, sections)
    .filter((key) => sections?.[key])
    .map((key) => [key, sections[key]]);
}

export function reorderPrivacySectionsObject(sections, order) {
  const normalizedOrder = normalizePrivacySectionOrder(order, sections);
  const next = {};

  for (const key of normalizedOrder) {
    if (sections[key]) next[key] = sections[key];
  }

  return next;
}

export function normalizePrivacyPagePayload(incoming) {
  if (incoming?.locales && typeof incoming.locales === 'object') {
    const en = normalizeLocale(incoming.locales.en, DEFAULT_PRIVACY_EN);
    const km = normalizeLocale(incoming.locales.km, DEFAULT_PRIVACY_KM);
    const mergedKeys = [...new Set([...Object.keys(en.sections), ...Object.keys(km.sections)])];
    const sectionOrder = normalizeSharedOrder(incoming.section_order, mergedKeys);
    const locales = syncBilingualLocales({ en, km }, sectionOrder, createEmptyPrivacySection);

    for (const locale of PAGE_LOCALES) {
      locales[locale].sections = reorderPrivacySectionsObject(locales[locale].sections, sectionOrder);
      locales[locale].inquiry = normalizeInquiry(
        locales[locale].inquiry,
        locale === 'km' ? DEFAULT_PRIVACY_INQUIRY_KM : DEFAULT_PRIVACY_INQUIRY_EN,
      );
    }

    return { section_order: sectionOrder, locales };
  }

  const legacyInquiry = normalizeInquiry(incoming?.inquiry, DEFAULT_PRIVACY_INQUIRY_EN);
  const legacy = normalizeLocale(
    {
      title: incoming?.title,
      last_updated: incoming?.last_updated,
      sections: incoming?.sections,
      inquiry: legacyInquiry,
    },
    DEFAULT_PRIVACY_EN,
  );
  const sectionOrder = normalizeSharedOrder(incoming?.section_order, Object.keys(legacy.sections));
  legacy.sections = reorderPrivacySectionsObject(legacy.sections, sectionOrder);
  const locales = syncBilingualLocales(
    { en: legacy, km: normalizeLocale(DEFAULT_PRIVACY_KM, DEFAULT_PRIVACY_KM) },
    sectionOrder,
    createEmptyPrivacySection,
  );

  for (const locale of PAGE_LOCALES) {
    locales[locale].sections = reorderPrivacySectionsObject(locales[locale].sections, sectionOrder);
  }

  return { section_order: sectionOrder, locales };
}

export function getPrivacyLocaleView(page, locale = 'en') {
  const normalized = normalizePrivacyPagePayload(page);
  const lang = resolvePageLocale(locale);
  const localeData = normalized.locales[lang];

  return {
    title: localeData.title,
    last_updated: localeData.last_updated,
    sections: localeData.sections,
    section_order: normalized.section_order,
    inquiry: localeData.inquiry,
  };
}

export function resolvePrivacyLocale(page, locale = 'en') {
  return getPrivacyLocaleView(page, locale);
}

export function updatePrivacyLocaleField(page, locale, field, value) {
  return updateBilingualLocale(page, locale, (current) => ({ ...current, [field]: value }));
}

export function updatePrivacyLocaleSection(page, locale, sectionKey, updater) {
  return updateBilingualLocale(page, locale, (current) => ({
    ...current,
    sections: {
      ...current.sections,
      [sectionKey]: updater(current.sections?.[sectionKey] || {
        title: '',
        intro: '',
        body: '',
        items: [],
        footer: '',
        contact_box: null,
      }),
    },
  }));
}

export function updatePrivacyInquiryField(page, locale, field, value) {
  return updateBilingualLocale(page, locale, (current) => ({
    ...current,
    inquiry: {
      ...(current.inquiry || {}),
      [field]: value,
    },
  }));
}

export function updatePrivacySectionItem(page, locale, sectionKey, itemIndex, field, value) {
  return updatePrivacyLocaleSection(page, locale, sectionKey, (section) => {
    const items = [...(section.items || [])];
    items[itemIndex] = { ...items[itemIndex], [field]: value };
    return { ...section, items };
  });
}

export function addPrivacySectionItem(page, locale, sectionKey) {
  return updatePrivacyLocaleSection(page, locale, sectionKey, (section) => ({
    ...section,
    items: [...(section.items || []), { label: '', text: '' }],
  }));
}

export function removePrivacySectionItem(page, locale, sectionKey, itemIndex) {
  return updatePrivacyLocaleSection(page, locale, sectionKey, (section) => ({
    ...section,
    items: (section.items || []).filter((_, index) => index !== itemIndex),
  }));
}

export function addPrivacySection(page, sectionKey) {
  const normalized = normalizePrivacyPagePayload(page);
  const sectionOrder = [...normalized.section_order, sectionKey];
  const locales = { ...normalized.locales };

  for (const locale of PAGE_LOCALES) {
    locales[locale] = {
      ...locales[locale],
      sections: {
        ...locales[locale].sections,
        [sectionKey]: createEmptyPrivacySection(locale),
      },
    };
  }

  return { section_order: sectionOrder, locales };
}

export function removePrivacySection(page, sectionKey) {
  const normalized = normalizePrivacyPagePayload(page);
  const sectionOrder = normalized.section_order.filter((key) => key !== sectionKey);
  const locales = { ...normalized.locales };

  for (const locale of PAGE_LOCALES) {
    const sections = { ...locales[locale].sections };
    delete sections[sectionKey];
    locales[locale] = { ...locales[locale], sections };
  }

  return { section_order: sectionOrder, locales };
}

export function movePrivacySection(page, sectionKey, direction) {
  const normalized = normalizePrivacyPagePayload(page);
  return { ...normalized, section_order: reorderPrivacySectionKeys(normalized.section_order, sectionKey, direction) };
}
