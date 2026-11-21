/** Labels for COD settlement methods recorded by admin/driver. */
export const COD_QR_BANKS = [
  { id: "aba", labelKm: "ABA", labelEn: "ABA" },
  { id: "acleda", labelKm: "ACLEDA", labelEn: "ACLEDA" },
  { id: "wing", labelKm: "Wing", labelEn: "Wing" },
  { id: "other", labelKm: "QR ផ្សេងទៀត", labelEn: "Other QR" },
];

export const COD_SETTLEMENT = {
  cod_cash_usd: {
    method: "cod_cash_usd",
    channel: "outdoor_cash",
    channelKm: "លុយក្រៅ",
    channelEn: "Outdoor cash",
    currency: "USD",
    labelKm: "លុយក្រៅ — ដុល្លារ (USD)",
    labelEn: "Outdoor cash — USD",
  },
  cod_cash_khr: {
    method: "cod_cash_khr",
    channel: "outdoor_cash",
    channelKm: "លុយក្រៅ",
    channelEn: "Outdoor cash",
    currency: "KHR",
    labelKm: "លុយក្រៅ — រៀល (KHR)",
    labelEn: "Outdoor cash — KHR",
  },
  cod_khqr: {
    method: "cod_khqr",
    channel: "driver_advance_qr",
    channelKm: "QR ហាង — អ្នកដឹកស្កេន",
    channelEn: "Shop QR — driver scans",
    currency: "KHR",
    labelKm: "បានបង់ដោយអ្នកដឹកជា QR",
    labelEn: "Paid by driver via QR",
  },
  cod_driver_qr: {
    method: "cod_driver_qr",
    channel: "driver_advance_qr",
    channelKm: "Driver បង់ឥឡូវ — QR",
    channelEn: "Driver pays now — QR",
    currency: "USD",
    labelKm: "បានបង់ដោយអ្នកដឹកជា QR",
    labelEn: "Paid by driver via QR",
  },
  cod_driver_cash: {
    method: "cod_driver_cash",
    channel: "driver_advance_cash",
    channelKm: "Driver អោយជាលុយសុទ្ធ",
    channelEn: "Driver paid cash",
    currency: "USD",
    labelKm: "Driver អោយជាលុយសុទ្ធ",
    labelEn: "Driver paid cash to the shop",
  },
  cod_customer_driver_qr: {
    method: "cod_customer_driver_qr",
    channel: "customer_to_driver_qr",
    channelKm: "Customer បង់ QR អ្នកដឹក",
    channelEn: "Customer paid driver’s QR",
    currency: "USD",
    labelKm: "Customer បង់ QR អ្នកដឹក — អ្នកដឹកនឹងបង់មកហាងផ្ទាល់",
    labelEn: "Customer paid the driver’s QR — driver remits to the shop",
  },
};

export function settlementLabel(method, lang = "km") {
  const row = COD_SETTLEMENT[method];
  if (!row) return method || "—";
  return lang === "en" ? row.labelEn : row.labelKm;
}

function formatAmount(amount, currency) {
  if (amount == null || amount === "") return null;
  const n = Number(amount);
  if (Number.isNaN(n)) return null;
  if (currency === "KHR") return `${n.toLocaleString()} ៛`;
  return `$${n.toFixed(2)}`;
}

export function settlementFromPayment(payments = []) {
  const paid = (payments || []).find((p) => p.status === "paid" || p.status === "success");
  if (!paid?.method) return null;

  const base = COD_SETTLEMENT[paid.method] || {
    method: paid.method,
    labelKm: paid.method,
    labelEn: paid.method,
  };
  const raw = paid.raw_response && typeof paid.raw_response === "object" ? paid.raw_response : {};
  const currency = raw.currency || paid.currency || base.currency;
  const expected = raw.expected_amount ?? paid.amount;
  const actual = raw.actual_amount_received ?? paid.amount;
  const qrBank = raw.qr_bank_label || raw.qr_bank || null;
  const labelKm = raw.settlement_label_km
    || ((paid.method === "cod_driver_qr" || paid.method === "cod_khqr") && qrBank
      ? `បានបង់ដោយអ្នកដឹកជា QR (${qrBank})`
      : base.labelKm);
  const labelEn = raw.settlement_label_en
    || ((paid.method === "cod_driver_qr" || paid.method === "cod_khqr") && qrBank
      ? `Paid by driver via QR (${qrBank})`
      : base.labelEn);

  return {
    ...base,
    currency,
    expectedAmount: expected,
    actualAmountReceived: actual,
    expectedLabel: formatAmount(expected, currency),
    actualLabel: formatAmount(actual, currency),
    courierName: raw.courier_name || null,
    notes: raw.notes || null,
    qrBank,
    remittanceToShop: raw.remittance_to_shop || null,
    labelKm,
    labelEn,
  };
}
