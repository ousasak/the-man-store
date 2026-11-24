import { useTranslation } from "../../lib/i18n.jsx";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import api from "../../lib/api";
import { settlementFromPayment } from "../../lib/codSettlement.js";
import { COURIER_PROVIDERS } from "../../lib/courierTracking.js";
import { errorAlert, toastSuccess } from "../../lib/swal";
import { showKhqrSuccess } from "../../lib/khqrSuccess.js";

function defaultCourierFromOrder(order) {
  const provider = order?.shipment?.provider;
  if (!provider || provider === "Internal") return "J&T Express";
  return COURIER_PROVIDERS.includes(provider) ? provider : provider;
}

function ChoiceButton({ selected, onClick, disabled, title, subtitle, accent = "teal" }) {
  const selectedClass = accent === "red"
    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
    : "border-[#567D74] bg-[#eef3f1] dark:bg-[#2f433e]/40";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${selected
          ? selectedClass
          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900"
        }`}
    >
      <span className="block text-sm font-bold text-slate-900 dark:text-white">{title}</span>
      <span className="block text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>
    </button>
  );
}

/**
 * @param {object} props
 * @param {object} props.order
 * @param {boolean} props.canEdit
 * @param {(order: object) => void} [props.onCollected]
 * @param {'admin'|'driver'} [props.apiScope] admin → /admin/orders, driver → /driver/orders
 * @param {import('axios').AxiosInstance} [props.apiClient] defaults to shared admin api
 */
export default function OrderCodCollectionPanel({
  order,
  canEdit,
  onCollected,
  apiScope = "admin",
  apiClient,
}) {
  const { t, language } = useTranslation();
  const http = apiClient || api;
  const orderBase = apiScope === "driver" ? `/driver/orders/${order?.id}` : `/admin/orders/${order?.id}`;
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [khqr, setKhqr] = useState(null);
  const [polling, setPolling] = useState(false);
  /** @type {'driver_advance' | 'collect_at_delivery' | 'shop_khqr' | null} */
  const [plan, setPlan] = useState(null);
  /** @type {'qr' | 'cash' | null} */
  const [advancePay, setAdvancePay] = useState(null);
  const [cashCurrency, setCashCurrency] = useState("USD");
  const [actualAmount, setActualAmount] = useState("");
  const [courierName, setCourierName] = useState("");
  const [notes, setNotes] = useState("");
  const paidAlertedRef = useRef(false);

  const isCod = order?.payment_method === "cod";
  const isCodPending = isCod && order?.payment_status !== "paid";
  const paidSettlement = settlementFromPayment(order?.payments);
  const savedPlan = quote?.cod_plan || null;

  const announcePaid = useCallback((orderData, payment) => {
    if (paidAlertedRef.current) return true;
    paidAlertedRef.current = true;
    setPolling(false);
    const planNow = savedPlan || plan;
    const amount = payment?.amount
      ?? khqr?.amount
      ?? quote?.shop_qr_khr
      ?? orderData?.total
      ?? order?.total;
    const currency = payment?.currency
      || khqr?.currency
      || (quote?.shop_qr_khr != null ? "KHR" : "USD");
    const body = planNow === "customer_pays_shop"
      ? "Customer paid the shop. This order is complete."
      : planNow === "collect_at_delivery"
        ? "Driver paid the shop. This order is complete."
        : "Payment received. This order is complete.";
    showKhqrSuccess({
      orderNumber: orderData?.order_number || order?.order_number,
      total: amount,
      currency,
      body,
      showTelegram: false,
      showRedirect: false,
      redirectSeconds: 0,
      buttonLabel: "OK",
      statusLabel: "Paid & Complete",
    });
    onCollected?.(orderData);
    return true;
  }, [onCollected, plan, savedPlan, khqr, quote, order]);

  const applyPaidKhqr = useCallback((data) => {
    const paid = data?.payment?.status === "paid" || data?.order?.payment_status === "paid";
    if (!paid) return false;
    return announcePaid(data?.order, data?.payment);
  }, [announcePaid]);

  const loadQuote = useCallback(async () => {
    if (!order?.id || !isCodPending) return;
    try {
      const { data } = await http.get(`${orderBase}/cod`);
      const next = data?.data || null;
      setQuote(next);
      if (next?.cod_plan) setPlan(next.cod_plan);
      if (next?.shop_khqr?.qr_string) {
        setKhqr(next.shop_khqr);
        setPolling(true);
      }
    } catch {
      setQuote(null);
    }
  }, [http, orderBase, order?.id, isCodPending]);

  useEffect(() => {
    paidAlertedRef.current = false;
  }, [order?.id]);

  useEffect(() => {
    loadQuote();
  }, [loadQuote]);

  useEffect(() => {
    setCourierName(defaultCourierFromOrder(order));
  }, [order?.id, order?.shipment?.provider]);

  const khrLabel = quote?.khr_amount
    ? `${Number(quote.khr_amount).toLocaleString()} ៛`
    : "—";
  const usdLabel = quote?.usd_amount != null ? `$${Number(quote.usd_amount).toFixed(2)}` : "—";
  const goodsLabel = quote?.goods_usd != null ? `$${Number(quote.goods_usd).toFixed(2)}` : null;
  const shippingLabel = quote?.shipping_usd != null ? `$${Number(quote.shipping_usd).toFixed(2)}` : null;
  const remitLabel = quote?.shop_qr_usd != null ? `$${Number(quote.shop_qr_usd).toFixed(2)}` : null;
  const remitKhrLabel = quote?.shop_qr_khr
    ? `${Number(quote.shop_qr_khr).toLocaleString()} ៛`
    : null;
  const isDeliveryPlan = plan === "collect_at_delivery" || plan === "customer_pays_shop";

  const dueForCash = useMemo(() => {
    if (cashCurrency === "KHR") return quote?.khr_amount ?? "";
    return quote?.usd_amount ?? "";
  }, [cashCurrency, quote?.khr_amount, quote?.usd_amount]);

  useEffect(() => {
    if (dueForCash !== "" && dueForCash != null) {
      setActualAmount(String(dueForCash));
    }
  }, [dueForCash]);

  const waitingForDriverScan = Boolean(canEdit && advancePay === "qr");
  const watchRemotePaid = Boolean(canEdit && isCodPending && (
    polling
    || advancePay === "qr"
    || savedPlan === "collect_at_delivery"
    || savedPlan === "customer_pays_shop"
  ));

  useEffect(() => {
    if (!watchRemotePaid || !order?.id) return undefined;
    const tick = async () => {
      if (paidAlertedRef.current) return;
      try {
        const quoteRes = await http.get(`${orderBase}/cod`).catch(() => null);
        const nextQuote = quoteRes?.data?.data;
        if (nextQuote) {
          setQuote(nextQuote);
          if (nextQuote.shop_khqr?.qr_string) {
            setKhqr(nextQuote.shop_khqr);
            setPolling(true);
          }
        }
        if (nextQuote?.shop_khqr?.qr_string) {
          const statusRes = await http.get(`${orderBase}/cod/khqr/status`).catch(() => null);
          if (statusRes?.data && applyPaidKhqr(statusRes.data)) return;
        }
        const { data } = await http.get(`${orderBase}`);
        const next = data?.data || data;
        if (next?.payment_status === "paid") {
          announcePaid(next, null);
        }
      } catch {
        // keep waiting for Bakong / Telegram settlement
      }
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [watchRemotePaid, order?.id, orderBase, http, applyPaidKhqr, announcePaid]);

  useEffect(() => {
    if (!watchRemotePaid) return undefined;
    const onResume = () => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      if (paidAlertedRef.current) return;
      http.get(`${orderBase}/cod/khqr/status`).then(({ data }) => {
        applyPaidKhqr(data);
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    return () => {
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, [watchRemotePaid, orderBase, http, applyPaidKhqr]);

  if (!isCod) return null;

  const resetChoices = () => {
    setPlan(savedPlan);
    setAdvancePay(null);
    setKhqr(null);
    setPolling(false);
    setNotes("");
    setCourierName(defaultCourierFromOrder(order));
  };

  const recordSettlement = async (payload) => {
    if (!canEdit) return;
    setLoading(true);
    try {
      const { data } = await http.post(`${orderBase}/cod/cash`, {
        courier_name: courierName.trim() || null,
        notes: notes.trim() || null,
        ...payload,
      });
      const nextOrder = data?.data?.order || data?.order;
      announcePaid(nextOrder, {
        amount: payload.actual_amount_received ?? nextOrder?.total ?? order?.total,
        currency: payload.currency || "USD",
      });
    } catch (e) {
      await errorAlert({
        enTitle: "Failed to record payment",
        khTitle: "មិនអាចកត់ត្រាបានទេ",
        enText: e?.response?.data?.message || e?.response?.data?.errors?.qr_bank?.[0] || "Failed to record payment.",
      });
    } finally {
      setLoading(false);
    }
  };

  const startShopQr = async (nextPlan) => {
    if (!canEdit) return;
    setPlan(nextPlan);
    if (nextPlan === "driver_advance") setAdvancePay("qr");
    setLoading(true);
    try {
      await http.post(`${orderBase}/cod/plan`, { plan: nextPlan });
      setQuote((prev) => ({ ...(prev || {}), cod_plan: nextPlan }));
      const { data } = await http.post(`${orderBase}/cod/khqr`, {
        courier_name: courierName.trim() || null,
        notes: notes.trim() || null,
      });
      setKhqr(data?.data?.payment || null);
      setPolling(true);
      void toastSuccess({
        khTitle: "QR ហាងរួចរាល់",
        enTitle: "Shop QR ready",
        khText: "អ្នកដឹកជាអ្នកស្កេន",
        enText: "The driver scans this QR.",
      });
    } catch (e) {
      await errorAlert({
        enTitle: "Failed to generate shop QR",
        khTitle: "មិនអាចបង្កើត QR ហាង",
        enText: e?.response?.data?.message || "Failed to generate shop QR.",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveDeliveryPlan = async (nextPlan) => {
    if (!canEdit) return;
    setPlan(nextPlan);
    setAdvancePay(null);
    setKhqr(null);
    setPolling(true);
    setLoading(true);
    try {
      await http.post(`${orderBase}/cod/plan`, { plan: nextPlan });
      try {
        const { data } = await http.get(`${orderBase}/cod`);
        const next = data?.data || { ...(quote || {}), cod_plan: nextPlan };
        setQuote(next);
        if (next?.shop_khqr?.qr_string) setKhqr(next.shop_khqr);
      } catch {
        setQuote((prev) => ({ ...(prev || {}), cod_plan: nextPlan }));
      }
      void toastSuccess({
        khTitle: "បានកត់ផែនការ",
        enTitle: "Plan saved",
        khText: "QR នៅក្នុង Telegram bot អ្នកដឹក — ទំព័រនេះនឹងលោត Alert ពេលហាងទទួលប្រាក់។",
        enText: "Shop QR is in the driver Telegram bot. This page will alert when the shop is paid.",
      });
    } catch (e) {
      setPolling(false);
      await errorAlert({
        enTitle: "Failed to save COD plan",
        khTitle: "មិនអាចរក្សាផែនការ",
        enText: e?.response?.data?.message || "Failed to save COD plan.",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkShopQrNow = async () => {
    if (!canEdit || !order?.id) return;
    setLoading(true);
    try {
      const { data } = await http.get(`${orderBase}/cod/khqr/status`);
      if (!applyPaidKhqr(data)) {
        void toastSuccess({
          khTitle: "នៅមិនទាន់ឃើញការបង់",
          enTitle: "Payment not confirmed yet",
          khText: "កំពុងរង់ចាំ Bakong បញ្ជាក់។ បើធនាគារទទួលរួច ចុច «បានទទួលប្រាក់ហើយ».",
          enText: "Still waiting for Bakong. If the bank already received it, tap Money received.",
        });
      }
    } catch (e) {
      await errorAlert({
        enTitle: "Failed to check KHQR status",
        khTitle: "ពិនិត្យ KHQR មិនបាន",
        enText: e?.response?.data?.message || "Failed to check KHQR status.",
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmShopQrReceived = async () => {
    if (!canEdit || !order?.id) return;
    setLoading(true);
    try {
      const { data } = await http.post(`${orderBase}/cod/khqr/confirm`, {
        courier_name: courierName.trim() || null,
        notes: notes.trim() || null,
      });
      if (!applyPaidKhqr(data)) {
        await errorAlert({
          enTitle: "Could not mark as received",
          khTitle: "មិនអាចកត់ថាបានទទួលប្រាក់ទេ",
          enText: "The shop KHQR payment could not be confirmed.",
        });
      }
    } catch (e) {
      await errorAlert({
        enTitle: "Failed to confirm KHQR payment",
        khTitle: "បញ្ជាក់ KHQR មិនបាន",
        enText: e?.response?.data?.message || "Failed to confirm KHQR payment.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isCodPending && paidSettlement) {
    const showAmountMismatch =
      paidSettlement.expectedAmount != null
      && paidSettlement.actualAmountReceived != null
      && Number(paidSettlement.expectedAmount) !== Number(paidSettlement.actualAmountReceived);

    return (
      <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 dark:border-emerald-800/50 dark:bg-emerald-950/25">
        <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
          {t("sales.codPaidOnDelivery", "COD — Paid on delivery")}
        </h4>
        <div className="mt-2 space-y-1 text-sm text-emerald-800 dark:text-emerald-200">
          <p>
            <span className="font-semibold">{t("sales.collectionChannel", "Channel:")}</span>{" "}
            {paidSettlement.channelKm || paidSettlement.channelEn}
          </p>
          <p>
            <span className="font-semibold">{t("sales.settlement", "Settlement:")}</span>{" "}
            {paidSettlement.labelKm}
          </p>
          {paidSettlement.qrBank ? (
            <p>
              <span className="font-semibold">QR:</span> {paidSettlement.qrBank}
            </p>
          ) : null}
          {paidSettlement.remittanceToShop === "pending" ? (
            <p className="text-amber-800 dark:text-amber-200">
              {t("sales.driverRemitsPending", "Driver still remits this amount to the shop.")}
            </p>
          ) : null}
          {paidSettlement.actualLabel ? (
            <p>
              <span className="font-semibold">{t("sales.receivedAmount", "Received:")}</span>{" "}
              {paidSettlement.actualLabel}
              {showAmountMismatch && paidSettlement.expectedLabel ? (
                <span className="ml-1 text-amber-700 dark:text-amber-300">
                  ({t("sales.expectedToPay", "Expected:")} {paidSettlement.expectedLabel})
                </span>
              ) : null}
            </p>
          ) : null}
          {paidSettlement.courierName ? (
            <p>
              <span className="font-semibold">{t("sales.courier", "Courier:")}</span>{" "}
              {paidSettlement.courierName}
            </p>
          ) : null}
          {paidSettlement.notes ? (
            <p>
              <span className="font-semibold">{t("sales.notes", "Notes:")}</span>{" "}
              {paidSettlement.notes}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!isCodPending) return null;

  return (
    <div className="mb-6 rounded-2xl border-2 border-amber-300/60 bg-amber-50/80 p-4 dark:border-amber-500/40 dark:bg-amber-950/20">
      <h4 className="text-sm font-bold text-amber-900 dark:text-amber-100">
        {t("sales.codTitle", "COD — Driver payment")}
      </h4>
      <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/80">
        {t("sales.codDesc", "Option 1: Driver scans shop QR. Option 2: Pay on delivery — QR inside driver Telegram bot.")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
        <span>{t("sales.customerDue", "Customer Due:")} {usdLabel}</span>
        <span>≈ {khrLabel}</span>
        {quote?.exchange_rate ? <span>({quote.exchange_rate} ៛/USD)</span> : null}
        {goodsLabel && shippingLabel && Number(quote?.shipping_usd) > 0 ? (
          <span>{t("sales.itemsAndShipping", "Items {items} + Shipping {shipping}", { items: goodsLabel, shipping: shippingLabel })}</span>
        ) : null}
      </div>

      {savedPlan === "collect_at_delivery" ? (
        <p className="mt-3 rounded-lg border border-amber-400/50 bg-white/70 px-3 py-2 text-xs text-amber-900 dark:bg-slate-900/60 dark:text-amber-100">
          {t("sales.codPlanCollectAtDeliveryDesc", "Plan: Customer pays driver QR {usd}. Driver remits {remit} via Telegram (shipping fee {shipping} deducted). Customer does not see this.", { usd: usdLabel, remit: remitLabel || goodsLabel, shipping: shippingLabel })}
        </p>
      ) : null}
      {savedPlan === "customer_pays_shop" ? (
        <p className="mt-3 rounded-lg border border-emerald-400/50 bg-white/70 px-3 py-2 text-xs text-emerald-900 dark:bg-slate-900/60 dark:text-emerald-100">
          {t("sales.codPlanCustomerPaysShopDesc", "Plan: Shop covered shipping. Driver generates shop QR in Telegram for customer to scan full {usd} to shop.", { usd: usdLabel })}
        </p>
      ) : null}

      {canEdit ? (
        <>
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {t("sales.driverOptions", "Driver options")}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <ChoiceButton
              selected={plan === "driver_advance"}
              disabled={loading}
              onClick={() => { setPlan("driver_advance"); setAdvancePay(null); setKhqr(null); setPolling(false); }}
              title={t("sales.codOptionDriverAdvance", "Option 1: Driver pays now")}
              subtitle={t("sales.codOptionDriverAdvanceDesc", "Advance payment for customer · QR or Cash")}
            />
            <ChoiceButton
              selected={isDeliveryPlan}
              disabled={loading}
              accent="red"
              onClick={() => { setPlan("collect_at_delivery"); setAdvancePay(null); setKhqr(null); setPolling(false); }}
              title={t("sales.codOptionDelivery", "Option 2: Pay on delivery")}
              subtitle={t("sales.codOptionDeliveryDesc", "Collect from customer or customer scans shop QR in Telegram")}
            />
          </div>

          {plan === "driver_advance" ? (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {t("sales.driverPaidVia", "How the driver paid")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <ChoiceButton
                  selected={advancePay === "qr"}
                  disabled={loading}
                  onClick={() => startShopQr("driver_advance")}
                  title={t("sales.codPaidByQr", "QR (ABA, ACLEDA…)")}
                  subtitle={t("sales.codPaidByQrDesc", "Shop shows QR — Driver scans")}
                />
                <ChoiceButton
                  selected={advancePay === "cash"}
                  disabled={loading}
                  onClick={() => { setAdvancePay("cash"); }}
                  title={t("sales.codPaidByCash", "Cash")}
                  subtitle={t("sales.codPaidByCashDesc", "Manual settlement — Driver gives cash")}
                />
              </div>

              {advancePay === "qr" ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
                  <DriverScanWait
                    waiting={waitingForDriverScan || polling}
                    title={t("sales.shopQrDriverScans", "Shop QR — Driver scans")}
                    body={t("sales.shopQrDriverScansBody", "The shop does not scan. Show the QR below for the driver to scan with ABA / ACLEDA / Wing. System records payment by driver via QR.")}
                  />
                  <NotesAndCourier
                    courierName={courierName}
                    setCourierName={setCourierName}
                    notes={notes}
                    setNotes={setNotes}
                    notesPlaceholder={t("sales.notesExampleTime", "e.g. Transferred at 7 AM...")}
                  />
                </div>
              ) : null}

              {advancePay === "cash" ? (
                <div className="space-y-3 rounded-xl border border-dashed border-amber-400 bg-white p-4 dark:border-amber-500/50 dark:bg-slate-900">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    {t("sales.manualDriverCash", "Manual — Driver gives cash")}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setCashCurrency("USD")}
                      className={`rounded-xl border px-4 py-3 text-left ${cashCurrency === "USD"
                          ? "border-[#567D74] bg-[#eef3f1] dark:bg-[#2f433e]/40"
                          : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950"
                        }`}
                    >
                      <span className="block text-sm font-bold">{t("sales.usdCurrency", "USD ($)")}</span>
                      <span className="block text-xs text-slate-500">{usdLabel}</span>
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setCashCurrency("KHR")}
                      className={`rounded-xl border px-4 py-3 text-left ${cashCurrency === "KHR"
                          ? "border-[#567D74] bg-[#eef3f1] dark:bg-[#2f433e]/40"
                          : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950"
                        }`}
                    >
                      <span className="block text-sm font-bold">{t("sales.khrCurrency", "KHR (៛)")}</span>
                      <span className="block text-xs text-slate-500">{khrLabel}</span>
                    </button>
                  </div>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {t("sales.cashAmount", "Cash amount")}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step={cashCurrency === "KHR" ? "1" : "0.01"}
                      value={actualAmount}
                      onChange={(e) => setActualAmount(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm tabular-nums dark:border-slate-600 dark:bg-slate-950"
                    />
                  </label>
                  <NotesAndCourier
                    courierName={courierName}
                    setCourierName={setCourierName}
                    notes={notes}
                    setNotes={setNotes}
                    notesPlaceholder={t("sales.notesExampleCashAtShop", "e.g. Driver paid cash at shop...")}
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      const parsed = Number(actualAmount);
                      if (!actualAmount || Number.isNaN(parsed) || parsed < 0) {
                        void errorAlert({
                          khTitle: "បញ្ចូលចំនួនលុយសុទ្ធ",
                          enTitle: "Enter the cash amount",
                          enText: "Enter the cash amount the driver paid.",
                        });
                        return;
                      }
                      recordSettlement({
                        settlement_method: "cod_driver_cash",
                        currency: cashCurrency,
                        actual_amount_received: parsed,
                      });
                    }}
                    className="w-full rounded-xl bg-[#567D74] px-4 py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
                  >
                    {t("sales.recordDriverGivesCash", "Record: Driver gives cash")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {isDeliveryPlan ? (
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {t("sales.atDelivery", "At delivery")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <ChoiceButton
                  selected={plan === "collect_at_delivery"}
                  disabled={loading}
                  onClick={() => saveDeliveryPlan("collect_at_delivery")}
                  title={t("sales.codOption2aTitle", "2A — Customer pays driver QR")}
                  subtitle={t("sales.codOption2aSub", "Customer pays {usd}. Driver remits {remit} in Telegram (shipping {shipping} deducted). Customer does not see this.", { usd: usdLabel, remit: remitLabel || goodsLabel || usdLabel, shipping: shippingLabel || "$0" })}
                />
                <ChoiceButton
                  selected={plan === "customer_pays_shop"}
                  disabled={loading}
                  onClick={() => saveDeliveryPlan("customer_pays_shop")}
                  title={t("sales.codOption2bTitle", "2B — Shop covered shipping")}
                  subtitle={t("sales.codOption2bSub", "Driver creates shop QR in Telegram. Customer scans full {usd} directly to shop.", { usd: usdLabel })}
                />
              </div>
              {plan === "collect_at_delivery" ? (
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {t("sales.codOption2aExample", "Example: Customer pays {usd} (items {goods} + shipping {shipping}). Driver Telegram bot has shop QR to remit {remit}. Shipping fee stays with driver. Customer is not notified.", {
                    usd: usdLabel,
                    goods: goodsLabel,
                    shipping: shippingLabel,
                    remit: remitLabel + (remitKhrLabel ? ` ≈ ${remitKhrLabel}` : ""),
                  })}
                </p>
              ) : (
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {t("sales.codOption2bExample", "The shop covered shipping. Upon delivery, the driver creates a shop QR in Telegram for the customer to scan full {usd} directly to the shop.", {
                    usd: usdLabel,
                  })}
                </p>
              )}
              <NotesAndCourier
                courierName={courierName}
                setCourierName={setCourierName}
                notes={notes}
                setNotes={setNotes}
                notesPlaceholder={plan === "customer_pays_shop"
                  ? t("sales.notesExample2b", "e.g. Shop covered shipping — Customer scanned shop QR...")
                  : t("sales.notesExample2a", "e.g. Customer paid driver QR, then driver remitted in Telegram...")}
              />
              {savedPlan === plan ? (
                <>
                  <DriverScanWait
                    waiting={watchRemotePaid}
                    title={plan === "customer_pays_shop"
                      ? t("sales.waitingCustomerScanShopQr", "Waiting for customer to scan shop QR")
                      : t("sales.waitingDriverRemitToShop", "Waiting for driver to remit to shop")}
                    body={plan === "customer_pays_shop"
                      ? t("sales.waitingCustomerScanShopQrBody", "When Bakong confirms, this page will alert. If bank confirmed, click 'Money received'.")
                      : t("sales.waitingDriverRemitToShopBody", "Driver scans shop QR in Telegram. When shop receives money, this page will alert.")}
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={checkShopQrNow}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    >
                      {t("sales.checkPaymentNow", "Check payment now")}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={confirmShopQrReceived}
                      className="w-full rounded-xl bg-[#567D74] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
                    >
                      {t("sales.moneyReceived", "Money received")}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {plan ? (
            <button
              type="button"
              disabled={loading}
              onClick={resetChoices}
              className="mt-3 text-xs text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300"
            >
              {t("sales.changeOption", "Change option")}
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-xs text-slate-500">{t("sales.noCodPermission", "You do not have permission to record COD payments.")}</p>
      )}

      {khqr?.qr_string && plan === "driver_advance" ? (
        <div className="mt-4 flex flex-col items-center rounded-xl border border-[#C0272D]/30 bg-white p-4 dark:bg-slate-950">
          <p className="text-xs font-semibold text-[#C0272D]">{t("sales.shopQrDriverScansOnly", "Shop QR — Driver scans (Shop does not scan)")}</p>
          <div className="mt-3 rounded-xl bg-white p-3">
            <QRCodeSVG value={khqr.qr_string} size={200} level="M" includeMargin />
          </div>
          <p className="mt-2 text-sm font-bold tabular-nums">
            {khqr.amount ? Number(khqr.amount).toLocaleString() : ""} {khqr.currency || "KHR"}
          </p>
          {polling ? (
            <p className="mt-1 text-xs text-slate-500">{t("sales.waitingForPayment", "Waiting for payment…")}</p>
          ) : null}
          {canEdit && khqr?.qr_string ? (
            <div className="mt-3 flex w-full flex-col gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={checkShopQrNow}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                {t("sales.checkPaymentNow", "Check payment now")}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={confirmShopQrReceived}
                className="w-full rounded-xl bg-[#567D74] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                {t("sales.moneyReceived", "Money received")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DriverScanWait({ waiting, title, body }) {
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-3 dark:border-teal-800/50 dark:bg-teal-950/30">
      <p className="text-sm font-bold text-teal-900 dark:text-teal-100">{title}</p>
      <p className="mt-1 text-xs text-teal-800 dark:text-teal-200">{body}</p>
      {waiting ? (
        <p className="mt-2 text-xs font-semibold text-teal-700 dark:text-teal-300">
          {t("sales.waitingForDriverScan", "Waiting for driver scan…")}
        </p>
      ) : null}
    </div>
  );
}

function NotesAndCourier({ courierName, setCourierName, notes, setNotes, notesPlaceholder }) {
  return (
    <>
      <label className="block">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {t("sales.courier", "Courier")}
        </span>
        <select
          value={courierName}
          onChange={(e) => setCourierName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
        >
          {COURIER_PROVIDERS.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
          {courierName && !COURIER_PROVIDERS.includes(courierName) ? (
            <option value={courierName}>{courierName}</option>
          ) : null}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {t("sales.notesOptional", "Notes (optional)")}
        </span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={notesPlaceholder}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
        />
      </label>
    </>
  );
}
