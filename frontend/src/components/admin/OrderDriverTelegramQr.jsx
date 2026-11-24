import React, { useCallback, useEffect, useState } from "react";
import { QrCode, Lock, Unlock } from "lucide-react";
import api from "../../lib/api";
import { useTranslation } from "../../lib/i18n.jsx";

/**
 * External courier job QR: works only after Admin/Superadmin confirms pickup (unlock).
 * Couriers do not need a The Man Store account.
 */
export default function OrderDriverTelegramQr({
  orderId,
  orderNumber,
  shipment,
  canEdit,
  onShipmentChange,
}) {
  const { t, language } = useTranslation();
  const [blobUrl, setBlobUrl] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickupName, setPickupName] = useState(shipment?.picked_up_by_name || "");
  const [pickupPhone, setPickupPhone] = useState(shipment?.picked_up_by_phone || "");

  useEffect(() => {
    setPickupName(shipment?.picked_up_by_name || "");
    setPickupPhone(shipment?.picked_up_by_phone || "");
  }, [shipment?.picked_up_by_name, shipment?.picked_up_by_phone]);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError("");
    let objectUrl = null;
    try {
      const [{ data: meta }, png] = await Promise.all([
        api.get(`/admin/orders/${orderId}/driver-telegram-qr`, { params: { format: "json" } }),
        api.get(`/admin/orders/${orderId}/driver-telegram-qr`, { responseType: "blob" }),
      ]);
      setJob(meta?.data || null);
      objectUrl = URL.createObjectURL(png.data);
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objectUrl;
      });
    } catch (err) {
      setError(err?.response?.data?.message || t("orders.couldNotLoadCourierQr", "Could not load courier Telegram QR"));
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, t]);

  useEffect(() => {
    load();
    return () => {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [load]);

  const unlock = async () => {
    if (!canEdit || !orderId) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/admin/orders/${orderId}/courier-job/unlock`, {
        picked_up_by_name: pickupName.trim() || null,
        picked_up_by_phone: pickupPhone.trim() || null,
      });
      setJob(data?.data?.courier_job || null);
      if (data?.data?.order?.shipment) {
        onShipmentChange?.(data.data.order.shipment);
      }
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || t("orders.failedToUnlockCourierJob", "Failed to unlock courier job"));
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    if (!canEdit || !orderId) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/admin/orders/${orderId}/courier-job/lock`);
      setJob(data?.data?.courier_job || null);
      if (data?.data?.order?.shipment) {
        onShipmentChange?.(data.data.order.shipment);
      }
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || t("orders.failedToLockCourierJob", "Failed to lock courier job"));
    } finally {
      setBusy(false);
    }
  };

  const unlocked = Boolean(job?.unlocked);

  return (
    <div className="mb-6 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <QrCode className="w-4 h-4" />
          {t("orders.courierTelegramJobQr", "Courier Telegram job QR")}
        </h4>
        <span
          className={
            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold " +
            (unlocked
              ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
              : "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800")
          }
        >
          {unlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          {unlocked ? t("orders.unlocked", "Unlocked") : t("orders.lockedConfirmPickup", "Locked — confirm pickup first")}
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        {t(
          "orders.courierTelegramQrDesc",
          "External courier — no shop account. When they arrive, Admin/Superadmin confirms pickup to unlock. Then they scan this QR for order {orderNumber} (shipped → in transit → arrived → goods received).",
          { orderNumber: orderNumber || `#${orderId}` }
        )}
      </p>

      {canEdit ? (
        <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={pickupName}
            onChange={(e) => setPickupName(e.target.value)}
            placeholder={t("orders.courierNameOptional", "Courier name (optional)")}
            className="h-9 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
          />
          <input
            type="text"
            value={pickupPhone}
            onChange={(e) => setPickupPhone(e.target.value)}
            placeholder={t("orders.courierPhoneOptional", "Courier phone (optional)")}
            className="h-9 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
          />
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">{t("orders.loadingQr", "Loading QR…")}</p> : null}
      {error ? <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p> : null}

      {blobUrl ? (
        <div className="flex flex-col sm:flex-row items-start gap-4 mb-3">
          <img
            src={blobUrl}
            alt={t("orders.courierTelegramJobQr", "Courier Telegram job QR")}
            className={"w-40 h-40 rounded-lg bg-white border border-slate-200 " + (unlocked ? "" : "opacity-50")}
          />
          <div className="min-w-0 space-y-2">
            {job?.deep_link ? (
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t("orders.deepLink", "Deep link")}</p>
                <a
                  href={job.deep_link}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-xs text-[color:var(--admin-primary)] hover:underline"
                >
                  {job.deep_link}
                </a>
              </div>
            ) : null}
            {unlocked && job?.unlocked_at ? (
              <p className="text-xs text-slate-500">
                {t("orders.unlockedAt", "Unlocked {time}", {
                  time: new Date(job.unlocked_at).toLocaleString(language === "km" || language === "kh" ? "km-KH" : "en-US"),
                })}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          {!unlocked ? (
            <button
              type="button"
              disabled={busy}
              onClick={unlock}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[color:var(--admin-primary)] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
            >
              <Unlock className="w-3.5 h-3.5" />
              {t("orders.confirmPickupUnlockQr", "Confirm pickup & unlock QR")}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={lock}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              <Lock className="w-3.5 h-3.5" />
              {t("orders.lockQrAgain", "Lock QR again")}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
