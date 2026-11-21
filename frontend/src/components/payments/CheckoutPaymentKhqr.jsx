import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../../lib/api";
import KhqrModal from "./KhqrModal";
import { announceTelegramKhqrPaid } from "../../lib/telegramMiniApp.js";
import { showKhqrSuccess } from "../../lib/khqrSuccess.js";

export default function CheckoutPaymentKhqr({
  open,
  orderId,
  orderNumber,
  amount,
  currency = "KHR",
  onClose,
  onPaid,
}) {
  const [payment, setPayment] = useState(null);
  const [paymentId, setPaymentId] = useState(null);
  const [status, setStatus] = useState("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verificationNote, setVerificationNote] = useState("");
  const pollRef = useRef(null);
  const pollFailuresRef = useRef(0);
  const paidNotifiedRef = useRef(false);
  const creatingRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handlePaid = useCallback(
    (payload) => {
      if (paidNotifiedRef.current) return;
      paidNotifiedRef.current = true;
      setStatus("paid");
      setError("");
      stopPolling();
      announceTelegramKhqrPaid({
        orderNumber: payload?.order_number || orderNumber,
      });
      showKhqrSuccess({
        orderNumber: payload?.order_number || orderNumber,
        total: payload?.khr_amount ?? payload?.amount ?? amount,
        currency: payload?.khr_amount != null ? "KHR" : (payload?.currency || currency),
        redirectSeconds: 60,
        redirectTo: "/orders",
      });
      onPaid?.(payload);
    },
    [onPaid, orderNumber, stopPolling, amount, currency],
  );

  const createKhqr = useCallback(async () => {
    if (!orderId || creatingRef.current) return;
    creatingRef.current = true;
    setLoading(true);
    setError("");
    paidNotifiedRef.current = false;

    try {
      const { data } = await api.post("/payments/bakong/create", { order_id: orderId });
      const nextPayment = data?.payment || data;
      const nextStatus = nextPayment?.status || data?.status || "pending";
      setPayment(nextPayment);
      setPaymentId(nextPayment?.payment_id || nextPayment?.id);
      setStatus(nextStatus);
      if (nextStatus === "paid") {
        handlePaid(nextPayment);
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const message = e?.response?.data?.message || "Failed to create KHQR.";
      setError(detail && detail !== message ? `${message} (${detail})` : message);
      setStatus("error");
    } finally {
      creatingRef.current = false;
      setLoading(false);
    }
  }, [handlePaid, orderId]);

  const checkStatus = useCallback(async ({ force = false } = {}) => {
    const targetId = paymentId;
    if (!targetId || paidNotifiedRef.current) return;

    try {
      const { data } = await api.get(`/payments/bakong/status/${targetId}`, { params: force ? { force: 1 } : undefined });
      pollFailuresRef.current = 0;
      setError("");

      const nextPayment = data?.payment || data;
      const nextStatus = nextPayment?.status || data?.status;

      if (data?.message && nextStatus !== "paid") {
        setVerificationNote(String(data.message));
      } else {
        setVerificationNote("");
      }

      const hasQr =
        nextPayment &&
        (nextPayment.qr_string ||
          nextPayment.qr_image_base64 ||
          nextPayment.md5 ||
          nextPayment.bill_number);
      if (hasQr) setPayment(nextPayment);

      if (nextStatus === "paid") {
        handlePaid(nextPayment || data);
        return;
      }

      if (nextStatus && nextStatus !== "idle") {
        setStatus(nextStatus);
      }
    } catch (e) {
      pollFailuresRef.current += 1;
      if (e?.response?.status === 403) {
        setError(e?.response?.data?.message || "Unauthorized.");
        setStatus("error");
        stopPolling();
        return;
      }
      if (pollFailuresRef.current >= 3) {
        setError(
          e?.response?.data?.message ||
            "Unable to verify payment status. Keep this screen open and try scanning again.",
        );
      }
    }
  }, [handlePaid, paymentId, stopPolling]);

  useEffect(() => {
    if (!orderId) {
      setPayment(null);
      setPaymentId(null);
      setStatus("idle");
      setError("");
      pollFailuresRef.current = 0;
      paidNotifiedRef.current = false;
      creatingRef.current = false;
      setVerificationNote("");
      stopPolling();
    }
  }, [orderId, stopPolling]);

  useEffect(() => {
    if (!open || !orderId) return;
    createKhqr();
  }, [open, orderId, createKhqr]);

  useEffect(() => {
    if (!paymentId) return;
    if (status === "paid" || status === "error") return;

    checkStatus();
    pollRef.current = setInterval(() => {
      checkStatus();
    }, 3000);

    return () => {
      stopPolling();
    };
  }, [status, checkStatus, paymentId, stopPolling]);

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      if (!paidNotifiedRef.current) checkStatus();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    const tg = window.Telegram?.WebApp;
    tg?.onEvent?.("activated", onResume);
    return () => {
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      tg?.offEvent?.("activated", onResume);
    };
  }, [checkStatus]);

  const displayAmount = payment?.khr_amount ?? amount;
  const displayCurrency = payment?.khr_amount != null ? "KHR" : currency;

  return (
    <KhqrModal
      open={open}
      onClose={onClose}
      qrImageBase64={payment?.qr_image_base64}
      qrString={payment?.qr_string}
      billNumber={payment?.bill_number}
      md5={payment?.md5}
      expiresAt={payment?.expires_at}
      status={status}
      loading={loading}
      error={error || verificationNote}
      amount={displayAmount}
      currency={displayCurrency}
      onRegenerate={createKhqr}
      
    />
  );
}
