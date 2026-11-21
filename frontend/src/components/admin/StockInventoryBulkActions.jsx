import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Layers } from "lucide-react";

import api from "../../lib/api";
import { errorAlert, toastSuccess, warningConfirm } from "../../lib/swal";
import { ADMIN_LIST_FIELD_CLASS } from "../../lib/adminListQuery.js";
import AdminModal from "./AdminModal.jsx";
import InventorySellStrategyCard from "./InventorySellStrategyCard.jsx";

const BULK_MENU_GROUPS = [
  {
    id: "hold",
    label: "On hold",
    items: [
      { id: "set_on_hold", label: "Set on hold" },
      { id: "release_hold", label: "Release hold" },
    ],
  },
  {
    id: "clearance",
    label: "Clearance",
    items: [
      { id: "mark_clearance", label: "Mark as clearance", modal: "clearance" },
      { id: "revert_clearance", label: "End clearance" },
    ],
  },
  {
    id: "pricing",
    label: "Pricing",
    items: [
      { id: "set_unit_price", label: "Set lot price", modal: "unit_price" },
      { id: "apply_lot_discount", label: "Lot discount", modal: "discount" },
      { id: "remove_lot_discount", label: "Remove discount" },
    ],
  },
  {
    id: "settings",
    label: "Store",
    items: [{ id: "sell_strategy", label: "Sell old / newer first…", strategy: true }],
  },
];

const BULK_ACTION_BY_ID = Object.fromEntries(
  BULK_MENU_GROUPS.flatMap((group) => group.items.map((item) => [item.id, item])),
);

const STATUS_LABELS = {
  on_hold: "on hold",
  active: "active",
  clearance: "clearance",
  discontinued: "discontinued",
};

function statusSummary(preview) {
  const counts = preview?.listing_status;
  if (!counts || typeof counts !== "object") return "";
  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${STATUS_LABELS[status] || status}`);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

function previewLine(preview, variantMode) {
  if (!preview) return "Loading lots…";
  const lots = preview.lot_count ?? 0;
  if (lots === 0) return "No inventory lots for selection";
  const statusPart = statusSummary(preview);
  if (variantMode) {
    const skus = preview.variant_count ?? 0;
    return `${lots} lot${lots !== 1 ? "s" : ""} for ${skus} SKU${skus !== 1 ? "s" : ""}${statusPart}`;
  }
  const products = preview.linked_product_count ?? 0;
  return `${lots} lot${lots !== 1 ? "s" : ""} across ${products} product${products !== 1 ? "s" : ""}${statusPart}`;
}

function actionEligibleCount(preview, actionId) {
  return preview?.action_eligible?.[actionId] ?? preview?.lot_count ?? 0;
}

function isBulkActionEnabled(preview, action) {
  if (!preview || (preview.lot_count ?? 0) === 0) return false;
  if (action.strategy) return true;
  if (action.modal === "clearance" || action.modal === "discount" || action.modal === "unit_price") {
    return (preview.lot_count ?? 0) > 0;
  }
  return actionEligibleCount(preview, action.id) > 0;
}

function actionDisabledHint(preview, action) {
  if (isBulkActionEnabled(preview, action)) return "";
  const eligible = actionEligibleCount(preview, action.id);
  if ((preview?.lot_count ?? 0) === 0) return "No linked lots";
  if (eligible === 0) {
    if (action.id === "set_on_hold") return "All selected lots are already on hold";
    if (action.id === "release_hold") return "No on-hold lots in selection";
    if (action.id === "revert_clearance") return "No clearance lots in selection";
    if (action.id === "remove_lot_discount") return "No lot discount on selection";
  }
  return "Not available for current selection";
}

function selectionSummary(variantMode, selectionCount, preview) {
  const lots = preview?.lot_count ?? 0;
  const lotPhraseEn = `${lots} inventory lot${lots !== 1 ? "s" : ""}`;
  const lotPhraseKm = `${lots} lot ស្តុក`;
  if (variantMode) {
    const skuPhraseEn = `${selectionCount} selected SKU${selectionCount !== 1 ? "s" : ""}`;
    const skuPhraseKm = `SKU ដែលជ្រើស ${selectionCount}`;
    return { lotPhraseEn, lotPhraseKm, targetEn: skuPhraseEn, targetKm: skuPhraseKm };
  }
  const labelPhraseEn = `${selectionCount} selected stock label${selectionCount !== 1 ? "s" : ""}`;
  const labelPhraseKm = `stock label ដែលជ្រើស ${selectionCount}`;
  return { lotPhraseEn, lotPhraseKm, targetEn: labelPhraseEn, targetKm: labelPhraseKm };
}

async function confirmBulkChange(actionLabel, { variantMode, selectionCount, preview }) {
  if ((preview?.lot_count ?? 0) === 0) return false;
  const { lotPhraseEn, lotPhraseKm, targetEn, targetKm } = selectionSummary(
    variantMode,
    selectionCount,
    preview,
  );
  const res = await warningConfirm({
    enTitle: "Confirm bulk change",
    khTitle: "បញ្ជាក់ការផ្លាស់ប្តូរជា grupe",
    enText: `Apply "${actionLabel}" to ${lotPhraseEn} linked to ${targetEn}? Per-lot editing in SKU details still works as before.`,
    khText: `អនុវត្ត "${actionLabel}" ទៅ ${lotPhraseKm} ដែលភ្ជាប់ជាមួយ ${targetKm}? កែ lot មួយម្តងនៅក្នុង SKU details នៅតែធ្វើបានដូចមុន។`,
    enConfirm: "Yes, apply",
    khConfirm: "បាទ អនុវត្ត",
    khCancel: "បោះបង់",
  });
  return res.isConfirmed;
}

export default function StockInventoryBulkActions({
  stockLabelIds = null,
  variants = null,
  selectionLabel = null,
  canEdit = false,
  onDone,
  onClearSelection,
}) {
  const variantRows = useMemo(
    () =>
      (variants || [])
        .map((row) => ({
          product_id: Number(row?.product_id),
          size: row?.size || null,
          color: row?.color || null,
        }))
        .filter((row) => row.product_id > 0),
    [variants],
  );

  const labelIds = useMemo(() => {
    if (stockLabelIds instanceof Set) return [...stockLabelIds].map((id) => Number(id)).filter((id) => id > 0);
    return (stockLabelIds || []).map((id) => Number(id)).filter((id) => id > 0);
  }, [stockLabelIds]);

  const variantMode = variantRows.length > 0;
  const selectionCount = variantMode ? variantRows.length : labelIds.length;
  const hasSelection = selectionCount > 0;

  const requestBody = useMemo(() => {
    if (variantMode) return { variants: variantRows };
    return { stock_label_ids: labelIds };
  }, [variantMode, variantRows, labelIds]);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountPercent, setDiscountPercent] = useState("");
  const [unitPriceOpen, setUnitPriceOpen] = useState(false);
  const [bulkUnitPrice, setBulkUnitPrice] = useState("");
  const [clearanceOpen, setClearanceOpen] = useState(false);
  const [clearancePrice, setClearancePrice] = useState("");
  const [clearancePercent, setClearancePercent] = useState("");
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [sellOldFirst, setSellOldFirst] = useState(true);
  const menuRef = useRef(null);

  const loadPreview = useCallback(async () => {
    if (!hasSelection) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const { data } = await api.post("/admin/inventory-lots/bulk", {
        ...requestBody,
        dry_run: true,
      });
      setPreview(data?.data ?? null);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [hasSelection, requestBody]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    if (!strategyOpen) return;
    (async () => {
      try {
        const { data } = await api.get("/admin/inventory-settings");
        setSellOldFirst(data?.data?.sell_old_first !== false);
      } catch {
        setSellOldFirst(true);
      }
    })();
  }, [strategyOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  const runBulk = async (action, extra = {}) => {
    if (!canEdit || !hasSelection) return;
    setBusy(true);
    setErr("");
    try {
      const { data } = await api.post("/admin/inventory-lots/bulk", {
        ...requestBody,
        action,
        ...extra,
      });
      const result = data?.data ?? {};
      const updated = result.updated ?? 0;
      const skipped = result.skipped ?? 0;
      const suffix = skipped > 0 ? ` (${skipped} skipped)` : "";
      await toastSuccess({
        enText: `${data?.message || "Bulk update completed."} Updated ${updated} lot${updated !== 1 ? "s" : ""}${suffix}.`,
      });
      setDiscountOpen(false);
      setClearanceOpen(false);
      setUnitPriceOpen(false);
      setMenuOpen(false);
      await loadPreview();
      onDone?.();
    } catch (e) {
      const message = e?.response?.data?.message || "Bulk update failed.";
      setErr(message);
      await errorAlert({ enTitle: "Bulk update failed", enText: message });
    } finally {
      setBusy(false);
    }
  };

  const handleAction = async (actionId) => {
    const action = BULK_ACTION_BY_ID[actionId];
    if (!action) return;
    setMenuOpen(false);
    if (action.strategy) {
      setStrategyOpen(true);
      return;
    }
    if (action.modal === "discount") {
      setDiscountPercent("");
      setDiscountOpen(true);
      setErr("");
      return;
    }
    if (action.modal === "clearance") {
      setClearancePrice("");
      setClearancePercent("");
      setClearanceOpen(true);
      setErr("");
      return;
    }
    if (action.modal === "unit_price") {
      setBulkUnitPrice("");
      setUnitPriceOpen(true);
      setErr("");
      return;
    }
    const confirmed = await confirmBulkChange(action.label, {
      variantMode,
      selectionCount,
      preview,
    });
    if (!confirmed) return;
    await runBulk(action.id);
  };

  const submitDiscount = async (e) => {
    e.preventDefault();
    const percent = Number(discountPercent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      setErr("Enter a discount between 0.01 and 100.");
      return;
    }
    const confirmed = await confirmBulkChange("Lot discount", {
      variantMode,
      selectionCount,
      preview,
    });
    if (!confirmed) return;
    await runBulk("apply_lot_discount", { discount_percent: percent });
  };

  const submitClearance = async (e) => {
    e.preventDefault();
    const payload = {};
    if (clearancePrice !== "") {
      const price = Number(clearancePrice);
      if (!Number.isFinite(price) || price < 0) {
        setErr("Enter a valid clearance price or leave blank.");
        return;
      }
      payload.unit_price = price;
    }
    if (clearancePercent !== "") {
      const pct = Number(clearancePercent);
      if (!Number.isFinite(pct) || pct < 0) {
        setErr("Enter a valid clearance percent or leave blank.");
        return;
      }
      payload.price_percent = pct;
    }
    const confirmed = await confirmBulkChange("Mark as clearance", {
      variantMode,
      selectionCount,
      preview,
    });
    if (!confirmed) return;
    await runBulk("mark_clearance", payload);
  };

  const submitUnitPrice = async (e) => {
    e.preventDefault();
    const price = Number(bulkUnitPrice);
    if (!Number.isFinite(price) || price < 0) {
      setErr("Enter a valid sell price (0 or higher).");
      return;
    }
    const confirmed = await confirmBulkChange("Set lot price", {
      variantMode,
      selectionCount,
      preview,
    });
    if (!confirmed) return;
    await runBulk("set_unit_price", { unit_price: price });
  };

  if (!hasSelection) return null;

  const badgeLabel = selectionLabel || `${selectionCount} selected`;
  const hasEnabledBulkAction = BULK_MENU_GROUPS.some((group) =>
    group.items.some((action) => isBulkActionEnabled(preview, action)),
  );

  return (
    <>
      <div className="border-b border-emerald-200/80 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
                <Layers className="h-3.5 w-3.5" aria-hidden />
                {badgeLabel}
              </span>
              <span className="text-xs text-emerald-900/80 dark:text-emerald-200/80">
                {previewLoading ? "Checking linked lots…" : previewLine(preview, variantMode)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-900/70 dark:text-emerald-200/70">
              Use <span className="font-medium">Bulk actions</span> for hold, clearance, and pricing — per-lot edits stay in SKU details.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  disabled={busy || !hasEnabledBulkAction}
                  onClick={() => setMenuOpen((v) => !v)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300/80 bg-white px-3.5 text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100 dark:hover:bg-emerald-900"
                >
                  Bulk actions
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    {BULK_MENU_GROUPS.map((group, groupIndex) => (
                      <div key={group.id}>
                        {groupIndex > 0 ? (
                          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                        ) : null}
                        <p className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {group.label}
                        </p>
                        {group.items.map((action) => {
                          const enabled = isBulkActionEnabled(preview, action);
                          const hint = actionDisabledHint(preview, action);
                          const eligible = actionEligibleCount(preview, action.id);
                          const countLabel =
                            enabled && !action.strategy && action.modal !== "clearance" && eligible > 0
                              ? ` (${eligible})`
                              : "";
                          return (
                          <button
                            key={action.id}
                            type="button"
                            disabled={action.strategy ? busy : busy || !enabled}
                            title={hint || undefined}
                            onClick={() => void handleAction(action.id)}
                            className="flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800"
                          >
                            <span className={`text-sm ${enabled ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"}`}>
                              {action.label}
                              {countLabel}
                            </span>
                            {hint && !enabled ? (
                              <span className="text-[10px] leading-tight text-slate-400 dark:text-slate-500">{hint}</span>
                            ) : null}
                          </button>
                          );
                        })}
                      </div>
                    ))}
                    {onClearSelection ? (
                      <>
                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onClearSelection();
                          }}
                          className="flex w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          Clear selection
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">View only — no bulk edit permission</p>
            )}
          </div>
        </div>
      </div>

      <AdminModal open={discountOpen} onClose={() => setDiscountOpen(false)} title="Bulk lot discount" maxWidthClass="max-w-md">
        <form onSubmit={(e) => void submitDiscount(e)} className="space-y-4 p-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Apply the same discount percent to {preview?.lot_count ?? "all"} linked inventory lot
            {(preview?.lot_count ?? 0) !== 1 ? "s" : ""}.
          </p>
          {err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {err}
            </div>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Discount off lot price (%)
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              required
              className={ADMIN_LIST_FIELD_CLASS}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              placeholder="e.g. 20"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setDiscountOpen(false)} className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
              {busy ? "Applying…" : "Apply to all"}
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminModal open={clearanceOpen} onClose={() => setClearanceOpen(false)} title="Bulk mark as clearance" maxWidthClass="max-w-md">
        <form onSubmit={(e) => void submitClearance(e)} className="space-y-4 p-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mark linked lots as clearance. Leave pricing blank to keep each lot&apos;s current price.
          </p>
          {err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {err}
            </div>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Clearance unit price (optional, same for all)
            <input
              type="number"
              min="0"
              step="0.01"
              className={ADMIN_LIST_FIELD_CLASS}
              value={clearancePrice}
              onChange={(e) => setClearancePrice(e.target.value)}
              placeholder="Leave blank to keep lot prices"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Or % off standard price (optional)
            <input
              type="number"
              min="0"
              max="1000"
              step="0.01"
              className={ADMIN_LIST_FIELD_CLASS}
              value={clearancePercent}
              onChange={(e) => setClearancePercent(e.target.value)}
              placeholder="e.g. 30"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setClearanceOpen(false)} className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
              {busy ? "Applying…" : "Mark all clearance"}
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminModal open={unitPriceOpen} onClose={() => setUnitPriceOpen(false)} title="Bulk set lot sell price" maxWidthClass="max-w-md">
        <form onSubmit={(e) => void submitUnitPrice(e)} className="space-y-4 p-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Set the same fixed sell price on {preview?.lot_count ?? "all"} linked inventory lot
            {(preview?.lot_count ?? 0) !== 1 ? "s" : ""}. Does not change listing status (active / clearance / on hold).
          </p>
          {err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {err}
            </div>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Sell price (USD)
            <input
              type="number"
              min="0"
              step="0.01"
              required
              className={ADMIN_LIST_FIELD_CLASS}
              value={bulkUnitPrice}
              onChange={(e) => setBulkUnitPrice(e.target.value)}
              placeholder="e.g. 29.99"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setUnitPriceOpen(false)} className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
              {busy ? "Applying…" : "Apply to all"}
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminModal open={strategyOpen} onClose={() => setStrategyOpen(false)} title="Website sell strategy" maxWidthClass="max-w-lg">
        <div className="space-y-3 p-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Store-wide setting: which lot sells first on the website and POS when multiple lots exist. This applies to all
            stock, including your current selection.
          </p>
          <InventorySellStrategyCard
            canEdit={canEdit}
            sellOldFirst={sellOldFirst}
            onSaved={async () => {
              await toastSuccess({ enText: "Sell strategy saved." });
              onDone?.();
            }}
          />
        </div>
      </AdminModal>
    </>
  );
}
