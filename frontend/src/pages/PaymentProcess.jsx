import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import BakongKhqrPanel from "../components/payments/BakongKhqrPanel";
import { announceTelegramKhqrPaid } from "../lib/telegramMiniApp.js";
import { showKhqrSuccess } from "../lib/khqrSuccess.js";

const SUCCESS_REDIRECT_SECONDS = 60;

export default function PaymentProcess() {
  const nav = useNavigate();
  const { orderId } = useParams();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState("pending");

  const loadOrder = useCallback(async () => {
    try {
      const { data } = await api.get(`/orders/${orderId}`);
      setOrder(data.data);
      if (data.data?.payment_method === "cod") {
        nav("/orders", { replace: true });
        return;
      }
      if (data.data?.payment_status === "paid") {
        setPaymentStatus("success");
      }
      setLoading(false);
    } catch (e) {
      console.error("Failed to load order", e);
      setLoading(false);
    }
  }, [orderId, nav]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleBakongStatusChange = useCallback((status) => {
    if (status === "paid") {
      setPaymentStatus("success");
      announceTelegramKhqrPaid({ orderNumber: order?.order_number || order?.id });
      showKhqrSuccess({
        orderNumber: order?.order_number || order?.id,
        total: order?.khqr_amount ?? order?.total,
        currency: order?.khqr_currency || "USD",
        redirectSeconds: SUCCESS_REDIRECT_SECONDS,
        redirectTo: `/orders/${orderId}`,
      });
    }
  }, [order?.id, order?.order_number, order?.khqr_amount, order?.total, order?.khqr_currency, orderId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading payment…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Order not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-10 px-4">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Complete payment</h1>
        <p className="text-sm text-slate-500 mb-6">
          Order {order.order_number || order.id} — ${Number(order.total || 0).toFixed(2)}
        </p>

        {paymentStatus === "success" && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <p className="text-emerald-800 font-semibold">Payment successful!</p>
            <button
              type="button"
              onClick={() => nav("/orders")}
              className="mt-4 rounded-xl bg-[#567D74] px-5 py-2.5 text-sm font-semibold text-white"
            >
              View orders
            </button>
          </div>
        )}

        {order.payment_method === "bakong_khqr" && paymentStatus !== "success" && (
          <BakongKhqrPanel orderId={order.id} onStatusChange={handleBakongStatusChange} />
        )}
      </div>
    </div>
  );
}
