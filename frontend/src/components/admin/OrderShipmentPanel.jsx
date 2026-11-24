import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import AdminSearchSelect from "./AdminSearchSelect.jsx";
import { mapAdminSelectOptions } from "../../lib/adminSelectHelpers.js";
import {
  applyCourierTemplate,
  COURIER_URL_PRESETS,
} from "../../lib/courierTracking.js";
import { useTranslation } from "../../lib/i18n.jsx";

const DEFAULT_PROVIDERS = [
  "J&T Express",
  "Vireak Buntham Express",
  "Grab Express",
  "Ninja Van",
  "Kerry Express",
  "Other",
];

const PROVIDER_OPTIONS = mapAdminSelectOptions(
  DEFAULT_PROVIDERS.map((p) => ({ id: p, label: p })),
);

export default function OrderShipmentPanel({ orderId, shipment, canEdit, onSaved }) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState("J&T Express");
  const [trackingCode, setTrackingCode] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [presetId, setPresetId] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickedUpByName, setPickedUpByName] = useState("");
  const [pickedUpByPhone, setPickedUpByPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const presetOptions = React.useMemo(() => [
    { value: "", label: t("sales.manualUrl", "Manual URL") },
    ...COURIER_URL_PRESETS.map((p) => ({
      value: p.id,
      label: `${p.label} ${t("sales.template", "template")}`,
    })),
  ], [t]);

  useEffect(() => {
    if (!shipment) return;
    setProvider(shipment.provider && shipment.provider !== "Internal" ? shipment.provider : "J&T Express");
    setTrackingCode(shipment.tracking_code || shipment.tracking_number || "");
    setExternalUrl(shipment.external_tracking_url || "");
    setPickedUpByName(shipment.picked_up_by_name || "");
    setPickedUpByPhone(shipment.picked_up_by_phone || "");
  }, [shipment, orderId]);

  const applyPreset = (presetKey) => {
    setPresetId(presetKey);
    const preset = COURIER_URL_PRESETS.find((p) => p.id === presetKey);
    if (!preset) return;
    setProvider(preset.label);
    if (trackingCode.trim()) {
      setExternalUrl(applyCourierTemplate(preset.template, trackingCode));
    }
  };

  useEffect(() => {
    if (!presetId || !trackingCode.trim()) return;
    const preset = COURIER_URL_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setExternalUrl(applyCourierTemplate(preset.template, trackingCode));
    }
  }, [trackingCode, presetId]);

  const save = async () => {
    if (!canEdit || !orderId) return;
    const code = trackingCode.trim();
    const url = externalUrl.trim();
    if (!code) {
      setError(t("sales.trackingNumberRequired", "Tracking number is required."));
      return;
    }
    if (!url) {
      setError(t("sales.trackingUrlRequired", "Courier tracking URL is required to mark the order as shipped."));
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await api.post("/admin/shipments", {
        order_id: orderId,
        provider,
        tracking_code: code,
        external_tracking_url: url,
        mark_shipped: true,
        picked_up_by_name: pickedUpByName.trim() || null,
        picked_up_by_phone: pickedUpByPhone.trim() || null,
      });
      setSuccess(t("sales.courierTrackingSaved", "Courier tracking saved. Order marked as shipped."));
      onSaved?.(data?.data);
    } catch (e) {
      setError(e?.response?.data?.message || t("sales.courierTrackingFailed", "Failed to save courier tracking."));
    } finally {
      setSaving(false);
    }
  };

  if (!orderId) return null;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <h4 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {t("sales.courierTrackingTitle", "Courier tracking")}
      </h4>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        {t(
          "sales.courierTrackingDesc",
          "Paste the courier tracking link from J&T, Vireak Buntham, etc. Customers will see a \"Track package\" button on My Orders."
        )}
      </p>

      {shipment?.status ? (
        <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
          {t("sales.shipmentStatus", "Shipment status:")} <span className="font-semibold capitalize">{shipment.status}</span>
          {shipment.tracking_code ? (
            <span className="ml-2 font-mono text-[11px]">{shipment.tracking_code}</span>
          ) : null}
          {shipment.courier_provider || (shipment.provider && shipment.provider !== "Internal") ? (
            <span className="ml-2">· {t("sales.courier", "Courier")}: <span className="font-semibold">{shipment.courier_provider || shipment.provider}</span></span>
          ) : null}
          {shipment.picked_up_by_name ? (
            <span className="ml-2">· {t("sales.pickedUpBy", "Picked up by:")} <span className="font-semibold">{shipment.picked_up_by_name}</span>
              {shipment.picked_up_by_phone ? (
                <span className="font-normal"> · {shipment.picked_up_by_phone}</span>
              ) : null}
            </span>
          ) : null}
        </p>
      ) : null}

      {canEdit ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t("sales.courier", "Courier")}
              </label>
              <AdminSearchSelect
                value={provider}
                onChange={setProvider}
                options={PROVIDER_OPTIONS}
                inputClassName="h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                ariaLabel={t("sales.courier", "Courier")}
                placeholder={t("sales.courier", "Search or type courier…")}
                allowEmpty={false}
                allowCustomValue
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t("sales.urlPreset", "URL preset")}
              </label>
              <AdminSearchSelect
                value={presetId}
                onChange={applyPreset}
                options={presetOptions}
                inputClassName="h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                ariaLabel={t("sales.urlPreset", "URL preset")}
                placeholder={t("sales.urlPreset", "Search preset…")}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t("sales.trackingNumber", "Tracking number")}
            </label>
            <input
              type="text"
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder={t("sales.trackingNumberPlaceholder", "e.g. JT1234567890")}
              className="h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 outline-none focus:border-[var(--admin-primary)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t("sales.courierTrackingUrl", "Courier tracking URL")}
            </label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => {
                setPresetId("");
                setExternalUrl(e.target.value);
              }}
              placeholder={t("sales.trackingUrlPlaceholder", "https://...")}
              className="h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-3 dark:border-slate-600 dark:bg-slate-900/40">
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              {t("sales.courierPickupShopTitle", "Courier pickup at shop")}
            </p>
            <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
              {t("sales.courierPickupShopDesc", "Note driver name and phone when handing over items.")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t("sales.driverName", "Driver name")}
                </label>
                <input
                  type="text"
                  value={pickedUpByName}
                  onChange={(e) => setPickedUpByName(e.target.value)}
                  placeholder={t("sales.driverNamePlaceholder", "Courier driver name")}
                  className="h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t("sales.driverPhone", "Driver phone")}
                </label>
                <input
                  type="text"
                  value={pickedUpByPhone}
                  onChange={(e) => setPickedUpByPhone(e.target.value)}
                  placeholder={t("sales.driverPhonePlaceholder", "e.g. 012 345 678")}
                  className="h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          {success ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{success}</p> : null}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-11 rounded-xl bg-[color:var(--admin-primary)] px-5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {saving ? t("common.messages.saving", "Saving…") : t("sales.saveAndMarkShipped", "Save & mark shipped")}
          </button>
        </div>
      ) : shipment?.external_tracking_url ? (
        <a
          href={shipment.external_tracking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-[color:var(--admin-primary)] hover:underline"
        >
          {t("sales.openCourierTracking", "Open courier tracking")}
        </a>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("sales.noCourierLink", "No external courier link yet.")}
        </p>
      )}
    </div>
  );
}
