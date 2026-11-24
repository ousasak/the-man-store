import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import axios from "axios";
import Logo from "@/components/Logo.jsx";
import { resolveBundledLogoUrl } from "@/lib/siteLogo.js";
import { resolveApiBaseUrl } from "@/lib/backendOrigin.js";
import { useTranslation } from "@/lib/i18n.jsx";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatKhr(value) {
  return `${Number(value || 0).toLocaleString()} ៛`;
}

export default function PublicReceiptPage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qr, setQr] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  const apiBase = resolveApiBaseUrl();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${apiBase}/receipt/${token}`);
      setInvoice(data?.data || null);
    } catch (e) {
      setError(e?.response?.data?.message || "Receipt not found or link expired.");
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    load();
  }, [load]);

  const isPaid = invoice?.payment_status === "PAID";
  const isCod = invoice?.is_cod || invoice?.payment_method === "cod";
  const logoUrl = resolveBundledLogoUrl(invoice?.logo_url);

  const loadPayQr = async () => {
    if (!token || isPaid) return;
    setQrLoading(true);
    try {
      const { data } = await axios.get(`${apiBase}/receipt/${token}/pay-qr`);
      setQr(data?.data || null);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load payment QR.");
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (invoice && !isPaid && !isCod) {
      loadPayQr();
    }
  }, [invoice, isPaid, isCod]);

  const pdfUrl = useMemo(() => `${apiBase}/receipt/${token}/pdf`, [apiBase, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#eef3f1] to-white flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#708A7C]/30 border-t-[#497869]" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#eef3f1] to-white flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-lg">
          <p className="text-rose-700 font-medium">{error || "Receipt unavailable."}</p>
          <Link to="/" className="mt-4 inline-block text-sm font-semibold text-[#497869] underline">
            Back to shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#eef3f1] via-white to-[#f8faf9] print:bg-white">
      <div className="mx-auto max-w-lg px-4 py-6 print:max-w-none print:px-0">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link to="/" className="text-sm font-semibold text-[#497869] hover:underline">
            ← The Man Store
          </Link>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl border border-[#708A7C]/40 bg-white px-4 py-2 text-sm font-semibold text-[#497869] shadow-sm"
            >
              Print
            </button>
            <a
              href={pdfUrl}
              className="rounded-xl bg-[#497869] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            >
              Download PDF
            </a>
          </div>
        </div>

        {/* Receipt card */}
        <div className="relative overflow-hidden rounded-3xl border border-[#708A7C]/25 bg-white shadow-xl shadow-[#497869]/10 print:shadow-none print:border-0">
          {/* Header band */}
          <div className="bg-gradient-to-br from-[#497869] via-[#567D74] to-[#708A7C] px-6 py-8 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                {logoUrl ? (
                  <Logo src={logoUrl} alt="Logo" className="mb-4 h-14 max-w-[180px] brightness-0 invert" />
                ) : null}
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                  {t("storefront.receipt", "Invoice")}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight">{invoice.invoice_number}</h1>
                <p className="mt-1 text-sm text-white/85">{invoice.invoice_date}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide ${
                  isPaid
                    ? "bg-white/20 text-white ring-1 ring-white/40"
                    : "bg-amber-400/95 text-amber-950"
                }`}
              >
                {invoice.payment_status}
              </span>
            </div>
          </div>

          <div className="px-6 py-6">
            {/* Customer */}
            <div className="rounded-2xl bg-[#f8faf9] p-4 text-sm text-slate-700">
              <p className="font-bold text-slate-900">{invoice.customer?.name}</p>
              {invoice.customer?.phone ? <p className="mt-0.5">{invoice.customer.phone}</p> : null}
              {invoice.customer?.full_address ? (
                <p className="mt-2 leading-relaxed text-slate-600">{invoice.customer.full_address}</p>
              ) : null}
            </div>

            {/* Items */}
            <div className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Items</h2>
              <ul className="mt-3 divide-y divide-slate-100">
                {(invoice.items || []).map((item, idx) => (
                  <li key={`${item.sku}-${idx}`} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{item.product_name}</p>
                      <p className="text-xs text-slate-500">
                        SKU {item.sku} · Qty {item.quantity}
                      </p>
                    </div>
                    <p className="shrink-0 font-bold tabular-nums text-slate-900">{money(item.grand_total)}</p>
                  </li>
                ))}
              </ul>
            </div>

            {/* Totals */}
            <div className="mt-6 space-y-2 border-t border-dashed border-slate-200 pt-4 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>{t("storefront.subtotal")}</span>
                <span className="tabular-nums">{money(invoice.subtotal)}</span>
              </div>
              {Number(invoice.discount) > 0 ? (
                <div className="flex justify-between text-slate-600">
                  <span>{t("sales.discount")}</span>
                  <span className="tabular-nums">−{money(invoice.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-slate-600">
                <span>{t("orders.shippingFee")}</span>
                <span className="tabular-nums">{money(invoice.shipping_fee)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold text-[#497869]">
                <span>{t("storefront.total")}</span>
                <span className="tabular-nums">{money(invoice.grand_total)}</span>
              </div>
            </div>

            {/* Tracking */}
            {invoice.tracking_code ? (
              <div className="mt-6 rounded-2xl border border-[#708A7C]/20 bg-[#eef3f1]/60 p-4 text-sm">
                <p className="font-semibold text-[#497869]">Tracking</p>
                <p className="mt-1 font-mono text-slate-800">{invoice.tracking_code}</p>
              </div>
            ) : null}

            {/* Payment QR on receipt page — online KHQR only. COD shop QR is driver/admin. */}
            {!isPaid && isCod ? (
              <div className="mt-6 rounded-2xl border border-[#708A7C]/25 bg-[#eef3f1]/70 p-5 text-center print:hidden">
                <p className="text-sm font-bold text-[#497869]">{t("sales.payOnDelivery", "Pay on delivery")}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {t("sales.payOnDeliveryNotice", "Pay the driver in cash, or scan the shop QR the driver shows you. This receipt does not generate shop QR.")}
                </p>
              </div>
            ) : null}
            {!isPaid && !isCod ? (
              <div className="mt-6 rounded-2xl border-2 border-[#C0272D]/20 bg-gradient-to-b from-red-50/80 to-white p-5 text-center print:hidden">
                <p className="text-sm font-bold text-[#C0272D]">
                  {isCod ? t("sales.payOnDeliveryScanKhqr", "Pay on delivery — Scan KHQR") : t("sales.completePaymentScanKhqr", "Complete payment — Scan KHQR")}
                </p>
                {qrLoading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading QR…</p>
                ) : qr?.qr_string ? (
                  <>
                    <div className="mx-auto mt-4 inline-block rounded-2xl bg-white p-4 shadow-inner">
                      <QRCodeSVG value={qr.qr_string} size={200} level="M" includeMargin />
                    </div>
                    <p className="mt-3 text-lg font-bold tabular-nums text-slate-900">
                      {qr.currency === "KHR" ? formatKhr(qr.amount) : money(qr.amount)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Open ABA / Bakong and scan to pay</p>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={loadPayQr}
                    className="mt-4 rounded-xl bg-[#C0272D] px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    Show payment QR
                  </button>
                )}
              </div>
            ) : null}

            <p className="mt-8 text-center text-xs text-slate-400">
              Thank you for shopping with {invoice.brand_name || "The Man Store"}
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
