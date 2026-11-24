import React from "react";
import { useTranslation } from "../../lib/i18n.jsx";
import { ADMIN_LIST_FIELD_CLASS, adminListFiltersActive } from "../../lib/adminListQuery.js";
import { mapIdLabelOptions } from "../../lib/adminSelectHelpers.js";
import {
  LOT_LISTING_STATUS_FILTER_OPTIONS,
  LOT_TIER_FILTER_OPTIONS,
  getLotListingStatusFilterOptions,
  getLotTierFilterOptions,
} from "../../lib/inventoryLotHelpers.js";
import { useAdminSidebarPinned } from "../../lib/useAdminSidebarPinned.js";
import AdminSearchSelect from "./AdminSearchSelect.jsx";
import AdminDatePicker from "./AdminDatePicker.jsx";

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

/**
 * Aligned filter row for Inventory Lots catalog — all controls share h-10 baseline.
 */
export default function InventoryLotsQueryToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  lotTierFilter,
  onLotTierFilterChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  inStockOnly,
  onInStockOnlyChange,
  showingCount = 0,
  totalCount = 0,
  onHand = 0,
  sold = 0,
  loading = false,
  onClearFilters,
}) {
  const { t } = useTranslation();
  const hasDateRangeFilter = Boolean(fromDate || toDate);
  const filtersActive = adminListFiltersActive({
    search,
    statusFilter,
    stockFilter: lotTierFilter,
    hasDateRangeFilter,
  }) || !inStockOnly;

  const field = ADMIN_LIST_FIELD_CLASS;
  const sidebarPinned = useAdminSidebarPinned();
  // Unpinned sidebar = wider content area — keep search compact so filters stay on one row.
  const searchClass = sidebarPinned
    ? `${field} h-10 min-w-[11rem] max-w-[16rem] flex-1 basis-[11rem]`
    : `${field} h-10 w-[10.5rem] min-w-[9rem] max-w-[10.5rem] shrink-0`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={sidebarPinned ? t("inventory.searchLotsPlaceholder") : (t("inventory.searchLotsPlaceholder") || "Search product, SKU, lot…")}
          className={searchClass}
          aria-label={t("inventory.searchLotsPlaceholder")}
        />
        <AdminSearchSelect
          value={statusFilter}
          onChange={onStatusFilterChange}
          options={mapIdLabelOptions(getLotListingStatusFilterOptions(t))}
          ariaLabel={t("inventory.filterByListingStatus", "Filter by listing status")}
          inputClassName={`${field} h-10 w-full min-w-[8.5rem] sm:w-[9.5rem]`}
          className="w-full min-w-[8.5rem] sm:w-[9.5rem]"
          placeholder={t("inventory.searchStatus", "Search status…")}
          allowEmpty={false}
        />
        <AdminSearchSelect
          value={lotTierFilter}
          onChange={onLotTierFilterChange}
          options={mapIdLabelOptions(getLotTierFilterOptions(t))}
          ariaLabel={t("inventory.filterByLotTier", "Filter by lot tier")}
          inputClassName={`${field} h-10 w-full min-w-[8.5rem] sm:w-[9.5rem]`}
          className="w-full min-w-[8.5rem] sm:w-[9.5rem]"
          placeholder={t("inventory.searchTier", "Search tier…")}
          allowEmpty={false}
        />
        <AdminDatePicker
          value={fromDate}
          onChange={onFromDateChange}
          max={toDate || undefined}
          wrapperClassName="w-full min-w-[8.5rem] sm:w-[10.5rem]"
          className={`${field} h-10 w-full min-w-[8.5rem] sm:w-[10.5rem]`}
          ariaLabel={t("common.fromDate", "From date")}
          placeholder={t("common.fromDate", "From date")}
        />
        <AdminDatePicker
          value={toDate}
          onChange={onToDateChange}
          min={fromDate || undefined}
          wrapperClassName="w-full min-w-[8.5rem] sm:w-[10.5rem]"
          className={`${field} h-10 w-full min-w-[8.5rem] sm:w-[10.5rem]`}
          ariaLabel={t("common.toDate", "To date")}
          placeholder={t("common.toDate", "To date")}
        />
        <label className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <input
            type="checkbox"
            className="rounded border-slate-300 dark:border-slate-600"
            checked={inStockOnly}
            onChange={(e) => onInStockOnlyChange(e.target.checked)}
          />
          {t("inventory.hideSoldOutLots")}
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>
            {t("common.showing", "Showing")}{" "}
            <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
              {loading ? "…" : formatCount(showingCount)}
            </span>{" "}
            {t("common.of", "of")} <span className="font-semibold tabular-nums">{formatCount(totalCount)}</span>
            {filtersActive ? ` (${t("common.filtered", "filtered")})` : ""}
          </span>
          <span className="hidden text-slate-300 sm:inline dark:text-slate-600">·</span>
          <span>
            {t("inventory.onHand")}{" "}
            <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatCount(onHand)}</span>
            {" · "}
            {t("inventory.sold")}{" "}
            <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatCount(sold)}</span>
          </span>
          {hasDateRangeFilter ? (
            <>
              <span className="hidden text-slate-300 sm:inline dark:text-slate-600">·</span>
              <span>
                {t("inventory.received")}{" "}
                {fromDate && toDate
                  ? `${fromDate} – ${toDate}`
                  : fromDate
                    ? `${t("common.from", "from")} ${fromDate}`
                    : `${t("common.to", "to")} ${toDate}`}
              </span>
            </>
          ) : null}
          {!inStockOnly ? (
            <>
              <span className="hidden text-slate-300 sm:inline dark:text-slate-600">·</span>
              <span className="font-medium text-slate-600 dark:text-slate-300">{t("inventory.includingSoldOut")}</span>
            </>
          ) : null}
        </p>
        {filtersActive && onClearFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="shrink-0 font-semibold text-[color:var(--admin-primary)] hover:underline"
          >
            {t("inventory.clearFilters")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
