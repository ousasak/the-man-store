import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import api from "../../lib/api";
import { useAdminPermissions } from "../../hooks/useAdminPermissions.js";
import { getFirstAccessibleAdminPath } from "../../lib/adminPermissions.js";
import { useHomepageSettings } from "../../state/homepageSettings";
import Logo from "../../components/Logo.jsx";
import { resolveBundledLogoUrl } from "../../lib/siteLogo.js";
import { AdminPageLoader } from "@/components/admin/AdminLoading";
import AdminReportExportMenu from "../../components/admin/AdminReportExportMenu.jsx";
import AdminSearchSelect from "../../components/admin/AdminSearchSelect.jsx";
import { downloadBlobResponse } from "../../lib/adminReportDownload.js";
import { exportAdminTable } from "../../lib/adminTableExport.js";
import { toastSuccess } from "../../lib/swal";
import { showKhqrSuccess } from "../../lib/khqrSuccess.js";

const PAPER_SIZE_OPTIONS = [
  { value: "a4", label: "A4" },
  { value: "thermal", label: "4x6 Thermal" },
];

function money(value) {
 return `$${Number(value || 0).toFixed(2)}`;
}

export default function AdminInvoicePage() {
 const { orderId } = useParams();
 const { user, can, permissionsReady, canPath } = useAdminPermissions();
 const canViewOrders = can("orders", "view");
 const { settings } = useHomepageSettings();
 const [invoice, setInvoice] = useState(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");
 const [paperSize, setPaperSize] = useState("a4");
 const [exportBusy, setExportBusy] = useState(false);
 const paidAlertedRef = useRef(false);
 const seenUnpaidRef = useRef(false);

 const downloadPdf = async () => {
 setExportBusy(true);
 try {
 const res = await api.get(`/admin/orders/${orderId}/invoice/pdf`, { responseType: "blob" });
 await downloadBlobResponse(res, `invoice-${orderId}.pdf`);
 await toastSuccess({ enText: "PDF downloaded successfully" });
 } catch {
 setError("Failed to download invoice PDF.");
 } finally {
 setExportBusy(false);
 }
 };

 const downloadExcel = async () => {
 if (!invoice) return;
 setExportBusy(true);
 try {
 const itemRows = (invoice.items || []).map((item) => [
 item.product_name || "",
 item.sku || "",
 String(item.quantity ?? ""),
 money(item.price),
 money(item.discount),
 money(item.shipping_fee),
 money(item.grand_total),
 ]);
 itemRows.push(
 ["", "", "", "", "", "Subtotal", money(invoice.subtotal)],
 ["", "", "", "", "", "Discount", money(invoice.discount)],
 ["", "", "", "", "", "Shipping", money(invoice.shipping_fee)],
 ["", "", "", "", "", "Grand Total", money(invoice.grand_total)],
 );
 await exportAdminTable({
 format: "excel",
 filename: `invoice-${invoice.invoice_number || orderId}`,
 title: `Invoice ${invoice.invoice_number}`,
 subtitle: `${invoice.customer?.name || "Customer"} · ${invoice.invoice_date || ""}`,
 headers: ["Product", "SKU", "Qty", "Price", "Discount", "Shipping", "Total"],
 rows: itemRows,
 });
 await toastSuccess({ enText: "Excel downloaded successfully" });
 } catch {
 setError("Failed to download invoice Excel.");
 } finally {
 setExportBusy(false);
 }
 };

 useEffect(() => {
 if (!permissionsReady || !canViewOrders) {
  setLoading(false);
  setInvoice(null);
  return;
 }
 (async () => {
 setLoading(true);
 setError("");
 try {
 const { data } = await api.get(`/admin/orders/${orderId}/invoice`);
 setInvoice(data?.data || null);
 } catch (err) {
 setError(err?.response?.data?.message || "Failed to load invoice.");
 } finally {
 setLoading(false);
 }
 })();
 }, [orderId, permissionsReady, canViewOrders]);

 const isPaid = useMemo(() => invoice?.payment_status === "PAID", [invoice]);
 const payQr = invoice?.payment_qr;
 const logoUrl = resolveBundledLogoUrl(settings?.app_logo_url || settings?.header?.logo_url);

 useEffect(() => {
  if (!invoice) return;
  if (!isPaid) {
   seenUnpaidRef.current = true;
   return;
  }
  if (!seenUnpaidRef.current || paidAlertedRef.current) return;
  paidAlertedRef.current = true;
  showKhqrSuccess({
   orderNumber: invoice.order_number,
   total: payQr?.amount || invoice.grand_total,
   currency: payQr?.currency || "KHR",
   body: "Customer paid the paper invoice. This sale is complete.",
   showTelegram: false,
   showRedirect: false,
   redirectSeconds: 0,
   buttonLabel: "OK",
   statusLabel: "Paid & Complete",
  });
 }, [invoice, isPaid, payQr]);

 useEffect(() => {
  if (!permissionsReady || !canViewOrders || !orderId || isPaid) return undefined;
  let cancelled = false;
  const tick = async () => {
   try {
    const { data } = await api.get(`/admin/orders/${orderId}/invoice`);
    if (!cancelled) setInvoice(data?.data || null);
   } catch {
    /* keep last invoice */
   }
  };
  const id = window.setInterval(tick, 3000);
  return () => {
   cancelled = true;
   window.clearInterval(id);
  };
 }, [orderId, permissionsReady, canViewOrders, isPaid]);

 if (!permissionsReady || loading) return <AdminPageLoader />;

 if (!canViewOrders) {
 return <Navigate to={getFirstAccessibleAdminPath(user)} replace />;
 }

 if (error || !invoice) {
 return (
 <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
 <div className="mx-auto max-w-3xl rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 p-6 text-rose-700 dark:text-rose-100">{error || "Invoice not found."}</div>
 </div>
 );
 }

 return (
 <div className="min-h-screen bg-slate-100 dark:bg-slate-950 print:bg-white print:p-0">
 <div className="mb-4 flex w-full min-w-0 flex-wrap items-center justify-between gap-3 print:hidden">
 {canPath("/admin/orders") ? (
 <Link to="/admin/orders" className="text-sm font-semibold text-slate-700 dark:text-slate-200 underline">Back to Orders</Link>
 ) : (
 <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Invoice</span>
 )}
 <div className="flex items-center gap-2">
 <label className="text-sm text-slate-600 dark:text-slate-300">Paper</label>
 <AdminSearchSelect
 value={paperSize}
 onChange={setPaperSize}
 options={PAPER_SIZE_OPTIONS}
 inputClassName="h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-800 dark:text-slate-100"
 ariaLabel="Paper size"
 placeholder="Search size…"
 allowEmpty={false}
 />
 <button onClick={() => window.print()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Print</button>
 <AdminReportExportMenu
 label="Download"
 onExportPdf={downloadPdf}
 onExportExcel={downloadExcel}
 busy={exportBusy}
 />
 </div>
 </div>

 <div className={`invoice-sheet w-full min-w-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 md:p-8 print:max-w-none print:rounded-none print:border-0 print:p-4 ${paperSize === "thermal" ? "max-w-[4.1in] mx-auto" : ""}`}>
 <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-28deg] select-none text-[90px] font-bold tracking-[0.25em] text-slate-900/5 dark:text-slate-100/5 print:text-slate-900/10">
 {invoice.payment_status}
 </div>

 <div className="relative z-10">
 <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-800/60 p-5">
 <div className="min-w-0">
 {logoUrl ? <Logo src={logoUrl} alt="Brand logo" className={`mb-3 ${paperSize === "thermal" ? "h-16 max-w-[250px]" : "h-20 max-w-[250px]"}`} /> : null}
 <h1 className="text-2xl font-bold text-[color:var(--admin-primary)]">{invoice.doc_title || "Shop Delivery Note"}</h1>
 <p className="text-sm text-slate-600 dark:text-slate-300">{invoice.doc_title_km || "វិក័យបត្រ ហាង"} · Invoice #: {invoice.invoice_number}</p>
 <p className="text-sm text-slate-600 dark:text-slate-300">Date: {invoice.invoice_date}</p>
 </div>
 <span className={`rounded-full border px-4 py-1 text-sm font-bold ${isPaid ? "border-[rgba(var(--admin-primary-rgb),0.45)] bg-[rgba(var(--admin-primary-rgb),0.1)] dark:bg-[rgba(var(--admin-primary-rgb),0.18)] text-[color:var(--admin-primary)] dark:text-[color:var(--admin-primary)]" : "border-rose-400 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-200"}`}>
 {invoice.payment_status}
 </span>
 </div>

 <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-sm text-slate-800 dark:text-slate-200">
 <p><span className="font-semibold">Customer:</span> {invoice.customer?.name}</p>
 <p><span className="font-semibold">Phone:</span> {invoice.customer?.phone || "-"}</p>
 <p><span className="font-semibold">Address:</span> {invoice.customer?.full_address || "-"}</p>
 {invoice.courier_provider ? (
  <p><span className="font-semibold">Courier:</span> {invoice.courier_provider}</p>
 ) : null}
 {invoice.is_cod ? (
  <p><span className="font-semibold text-amber-700 dark:text-amber-300">Payment:</span> COD — collect on delivery</p>
 ) : null}
 {invoice.tracking_code ? (
  <p><span className="font-semibold">Tracking:</span> <span className="font-mono">{invoice.tracking_code}</span></p>
 ) : null}
 </div>

 <div className="overflow-x-auto">
 <table className="w-full border-collapse text-xs md:text-sm">
 <thead>
 <tr className="text-white" style={{ backgroundColor: "var(--admin-primary)" }}>
 <th className="border px-2 py-2 text-left" style={{ borderColor: "var(--admin-primary)" }}>
 Product Name
 </th>
 <th className="border px-2 py-2 text-left" style={{ borderColor: "var(--admin-primary)" }}>
 SKU
 </th>
 <th className="border px-2 py-2 text-right" style={{ borderColor: "var(--admin-primary)" }}>
 Quantity
 </th>
 <th className="border px-2 py-2 text-right" style={{ borderColor: "var(--admin-primary)" }}>
 Price
 </th>
 <th className="border px-2 py-2 text-right" style={{ borderColor: "var(--admin-primary)" }}>
 Discount
 </th>
 <th className="border px-2 py-2 text-right" style={{ borderColor: "var(--admin-primary)" }}>
 Shipping Fee
 </th>
 <th className="border px-2 py-2 text-right" style={{ borderColor: "var(--admin-primary)" }}>
 Grand Total
 </th>
 </tr>
 </thead>
 <tbody>
 {(invoice.items || []).map((item, idx) => (
 <tr key={`${item.sku}-${idx}`}>
 <td className="border border-[rgba(var(--admin-primary-rgb),0.22)] px-2 py-2">{item.product_name}</td>
 <td className="border border-[rgba(var(--admin-primary-rgb),0.22)] px-2 py-2">{item.sku}</td>
 <td className="border border-[rgba(var(--admin-primary-rgb),0.22)] px-2 py-2 text-right">{item.quantity}</td>
 <td className="border border-[rgba(var(--admin-primary-rgb),0.22)] px-2 py-2 text-right">{money(item.price)}</td>
 <td className="border border-[rgba(var(--admin-primary-rgb),0.22)] px-2 py-2 text-right">{money(item.discount)}</td>
 <td className="border border-[rgba(var(--admin-primary-rgb),0.22)] px-2 py-2 text-right">{money(item.shipping_fee)}</td>
 <td className="border border-[rgba(var(--admin-primary-rgb),0.22)] px-2 py-2 text-right font-semibold">{money(item.grand_total)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 <div className="mt-4 space-y-1 text-right text-sm text-slate-800 dark:text-slate-200">
 <p>Subtotal: <span className="font-semibold">{money(invoice.subtotal)}</span></p>
 <p>Discount: <span className="font-semibold">{money(invoice.discount)}</span></p>
 <p>Shipping Fee: <span className="font-semibold">{money(invoice.shipping_fee)}</span></p>
 <p className="text-lg font-bold text-slate-900 dark:text-white">Grand Total: {money(invoice.grand_total)}</p>
 </div>

 {payQr?.status === "pending" && payQr.qr_string ? (
 <div className="mt-4 rounded-xl border-2 border-[#C0272D]/40 bg-[#FFF8F8] p-4 dark:border-[#C0272D]/50 dark:bg-red-950/20 print:border-[#C0272D]">
  <div className={`flex flex-col items-center gap-4 ${paperSize === "thermal" ? "" : "sm:flex-row sm:items-center"}`}>
   <div className="rounded-xl bg-white p-2 shadow-sm">
    <QRCodeSVG value={payQr.qr_string} size={paperSize === "thermal" ? 160 : 200} level="M" includeMargin />
   </div>
   <div className="min-w-0 text-center sm:text-left">
    <p className="text-xs font-bold uppercase tracking-wide text-[#C0272D]">KHQR · Bakong</p>
    <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">ស្កេនដើម្បីបង់ទៅហាង</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
     Scan with any Bakong bank app to pay the shop in full. This QR stays valid until this invoice is paid — then the sale is complete.
     <br />
     QR នេះមិនផុតកំណត់ទេ ទាល់តែបង់រួច។
    </p>
    <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{payQr.amount_label || money(invoice.grand_total)}</p>
    {payQr.usd_label ? <p className="text-sm text-slate-500 dark:text-slate-400">{payQr.usd_label}</p> : null}
   </div>
  </div>
 </div>
 ) : isPaid ? (
 <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-100">
  PAID · បានបង់រួច — payment QR is closed
 </div>
 ) : invoice.payment_qr_error ? (
 <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
  {invoice.payment_qr_error}
 </div>
 ) : null}

 <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm dark:border-slate-600 dark:bg-slate-800/50">
 <p className="font-bold text-slate-800 dark:text-slate-100">Courier pickup · អ្នកដឹកមកយកពីហាង</p>
 <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Sign on paper; blank lines below if not yet recorded in admin.</p>
 <div className="grid gap-2 sm:grid-cols-3">
 <p><span className="font-semibold">Name:</span> {invoice.picked_up_by_name || "________________"}</p>
 <p><span className="font-semibold">Phone:</span> {invoice.picked_up_by_phone || "________________"}</p>
 <p><span className="font-semibold">Date:</span> {invoice.picked_up_at || "________________"}</p>
 </div>
 <div className="mt-4 grid gap-4 sm:grid-cols-2 text-xs text-slate-600 dark:text-slate-300">
 <div>
 <div className="mb-1 border-b border-slate-400 pb-6 dark:border-slate-500" />
 Courier signature / ហត្ថលេខា
 </div>
 <div>
 <div className="mb-1 border-b border-slate-400 pb-6 dark:border-slate-500" />
 Shop staff / បុគ្គលិកហាង
 </div>
 </div>
 </div>

 <div className="mt-4 border-t-2 border-dashed border-slate-400 dark:border-slate-600 pt-2 text-center text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
 — CUT HERE —
 </div>
 </div>
 </div>

 <style>{`
 .invoice-sheet { position: relative; }
 @media print {
 @page { size: A4; margin: 10mm; }
 .invoice-sheet { width: 100%; }
 .invoice-sheet.max-w-\[4\.1in\] { width: 4in !important; margin: 0 auto; }
 }
 `}</style>
 </div>
 );
}
