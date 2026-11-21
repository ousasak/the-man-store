import React from "react";
import { ADMIN_LIST_FIELD_CLASS, adminListFiltersActive } from "../../lib/adminListQuery.js";
import { mapIdLabelOptions, SORT_DIR_OPTIONS } from "../../lib/adminSelectHelpers.js";
import { useAdminSidebarPinned } from "../../lib/useAdminSidebarPinned.js";
import AdminSearchSelect from "./AdminSearchSelect.jsx";

function ToolbarSearchSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  wrapperClassName = "",
  placeholder = "Search…",
  menuMinWidth,
}) {
  if (!options?.length) return null;
  return (
    <AdminSearchSelect
      value={value}
      onChange={onChange}
      options={mapIdLabelOptions(options)}
      ariaLabel={ariaLabel}
      inputClassName={className}
      className={wrapperClassName}
      placeholder={placeholder}
      allowEmpty={false}
      menuMinWidth={menuMinWidth}
    />
  );
}

/**
 * Search + optional filter selects + sort (matches Purchase Orders list toolbar).
 */
export default function AdminListQueryToolbar({
  search = "",
  onSearchChange,
  searchPlaceholder = "Search…",
  statusFilter,
  onStatusFilterChange,
  statusOptions = null,
  supplierFilter,
  onSupplierFilterChange,
  supplierOptions = null,
  stockFilter,
  onStockFilterChange,
  stockOptions = null,
  stockFilterAriaLabel = "Filter by stock",
  methodFilter,
  onMethodFilterChange,
  methodOptions = null,
  sortBy,
  onSortByChange,
  sortOptions = [],
  sortDir,
  onSortDirChange,
  showSortDir = true,
  showingCount = 0,
  totalCount = 0,
  onClearFilters,
  hasDateRangeFilter = false,
  fromDate = "",
  onFromDateChange = null,
  toDate = "",
  onToDateChange = null,
  controlsAlign = "default",
  /** One horizontal row: search, filters, dates, and count (scrolls on narrow viewports). */
  singleRow = false,
  /** No outer card border — use inside a section header (e.g. SKU detail movement block). */
  embedded = false,
}) {
  const sidebarPinned = useAdminSidebarPinned();
  const compact = singleRow && sidebarPinned;
  const fieldClass = compact
    ? `${ADMIN_LIST_FIELD_CLASS} h-10 px-2.5 text-sm`
    : ADMIN_LIST_FIELD_CLASS;
  const showDateRange = typeof onFromDateChange === "function" && typeof onToDateChange === "function";
  const shellClass = embedded
    ? ""
    : "rounded-xl border border-border bg-card/60 p-3 shadow-sm";

  const dateLabelClass = "text-xs font-medium text-muted-foreground";
  const inlineFieldClass = singleRow ? "shrink-0 w-auto" : "w-full sm:w-auto";
  const dateInputWidth = compact ? "w-[9.5rem]" : "w-[11.25rem]";
  const searchMinWidth = compact ? "min-w-[9rem]" : "min-w-[11rem]";
  const searchMaxWidth = compact ? "max-w-[12rem]" : "max-w-[16rem]";
  const selectMin = (wide, narrow) => (compact ? narrow : wide);

  const sortOptionLabel = (opt) => {
    if (compact) return opt.label;
    return `Sort: ${opt.label}`;
  };

  const dateRangeFields = showDateRange ? (
    <>
      <label className={`flex flex-col gap-1 ${singleRow ? "shrink-0" : ""}`}>
        <span className={dateLabelClass}>From date</span>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => onFromDateChange(e.target.value)}
          max={toDate || undefined}
          className={`${fieldClass} ${dateInputWidth} max-w-full`}
          aria-label="From date"
        />
      </label>
      <label className={`flex flex-col gap-1 ${singleRow ? "shrink-0" : ""}`}>
        <span className={dateLabelClass}>To date</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => onToDateChange(e.target.value)}
          min={fromDate || undefined}
          className={`${fieldClass} ${dateInputWidth} max-w-full`}
          aria-label="To date"
        />
      </label>
    </>
  ) : null;

  const filtersActive = adminListFiltersActive({
    search,
    statusFilter,
    supplierFilter,
    stockFilter,
    methodFilter,
    hasDateRangeFilter,
  });
  const showSort = Array.isArray(sortOptions) && sortOptions.length > 0;

  const filterSelects = (
    <>
      {statusOptions?.length ? (
        <ToolbarSearchSelect
          value={statusFilter}
          onChange={onStatusFilterChange}
          options={statusOptions}
          ariaLabel="Filter by status"
          className={`${fieldClass} ${inlineFieldClass} ${selectMin("sm:min-w-[9.5rem]", "min-w-[8rem] max-w-[9rem]")}`}
          wrapperClassName={`${inlineFieldClass} shrink-0`}
          menuMinWidth={152}
        />
      ) : null}
      {supplierOptions?.length ? (
        <ToolbarSearchSelect
          value={supplierFilter}
          onChange={onSupplierFilterChange}
          options={supplierOptions}
          ariaLabel="Filter by supplier"
          className={`${fieldClass} ${inlineFieldClass} ${selectMin("sm:min-w-[10rem]", "min-w-[8.5rem] max-w-[9.5rem]")}`}
          wrapperClassName={`${inlineFieldClass} shrink-0`}
          menuMinWidth={160}
        />
      ) : null}
      {stockOptions?.length ? (
        <ToolbarSearchSelect
          value={stockFilter}
          onChange={onStockFilterChange}
          options={stockOptions}
          ariaLabel={stockFilterAriaLabel}
          className={`${fieldClass} ${inlineFieldClass} ${selectMin("sm:min-w-[9.5rem]", "min-w-[8rem] max-w-[9rem]")}`}
          wrapperClassName={`${inlineFieldClass} shrink-0`}
          menuMinWidth={152}
        />
      ) : null}
      {methodOptions?.length ? (
        <ToolbarSearchSelect
          value={methodFilter}
          onChange={onMethodFilterChange}
          options={methodOptions}
          ariaLabel="Filter by method"
          className={`${fieldClass} ${inlineFieldClass} ${selectMin("sm:min-w-[10rem]", "min-w-[8.5rem] max-w-[9.5rem]")}`}
          wrapperClassName={`${inlineFieldClass} shrink-0`}
          menuMinWidth={160}
        />
      ) : null}
      {showSort ? (
        <>
          <ToolbarSearchSelect
            value={sortBy}
            onChange={onSortByChange}
            options={sortOptions.map((opt) => ({
              id: opt.id,
              label: sortOptionLabel(opt),
            }))}
            ariaLabel="Sort by"
            className={`${fieldClass} ${inlineFieldClass} ${selectMin("sm:min-w-[10.5rem]", "min-w-[9rem] max-w-[10rem]")}`}
            wrapperClassName={`${inlineFieldClass} shrink-0`}
            menuMinWidth={168}
          />
          {showSortDir ? (
            <ToolbarSearchSelect
              value={sortDir}
              onChange={onSortDirChange}
              options={SORT_DIR_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label }))}
              ariaLabel="Sort direction"
              className={`${fieldClass} ${inlineFieldClass} ${selectMin("sm:min-w-[5.5rem]", "min-w-[5rem] max-w-[5.5rem]")}`}
              wrapperClassName={`${inlineFieldClass} shrink-0`}
              menuMinWidth={120}
            />
          ) : null}
        </>
      ) : null}
    </>
  );

  const controlSelects = (
    <>
      {filterSelects}
      {dateRangeFields}
    </>
  );

  const metaRow = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>
        Showing {showingCount} of {totalCount}
        {filtersActive ? " (filtered)" : ""}
      </span>
      {filtersActive && onClearFilters ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="font-semibold text-primary hover:underline transition-colors"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );

  if (singleRow) {
    return (
      <div className={shellClass}>
        <div className={`flex flex-nowrap items-end overflow-x-auto pb-0.5 ${compact ? "gap-2" : "gap-2"}`}>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className={`${fieldClass} shrink-0 ${searchMinWidth} ${searchMaxWidth}`}
            aria-label="Search list"
          />
          {controlSelects}
        </div>
        <div className="mt-2">{metaRow}</div>
      </div>
    );
  }

  if (controlsAlign === "right") {
    return (
      <div className={shellClass}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className={`${ADMIN_LIST_FIELD_CLASS} w-full min-w-[12rem] xl:flex-1 xl:min-w-[18rem]`}
              aria-label="Search list"
            />
            <div className="flex flex-wrap items-center gap-2 xl:shrink-0">
              {filterSelects}
            </div>
          </div>
          {showDateRange ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-end gap-2">{dateRangeFields}</div>
              <div className="sm:mb-2.5">{metaRow}</div>
            </div>
          ) : (
            metaRow
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-12">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className={`${ADMIN_LIST_FIELD_CLASS} lg:col-span-4`}
          aria-label="Search list"
        />
        {statusOptions?.length ? (
          <ToolbarSearchSelect
            value={statusFilter}
            onChange={onStatusFilterChange}
            options={statusOptions}
            ariaLabel="Filter by status"
            className={`${ADMIN_LIST_FIELD_CLASS} lg:col-span-2`}
            wrapperClassName="lg:col-span-2"
          />
        ) : null}
        {supplierOptions?.length ? (
          <ToolbarSearchSelect
            value={supplierFilter}
            onChange={onSupplierFilterChange}
            options={supplierOptions}
            ariaLabel="Filter by supplier"
            className={`${ADMIN_LIST_FIELD_CLASS} lg:col-span-3`}
            wrapperClassName="lg:col-span-3"
          />
        ) : null}
        {stockOptions?.length ? (
          <ToolbarSearchSelect
            value={stockFilter}
            onChange={onStockFilterChange}
            options={stockOptions}
            ariaLabel={stockFilterAriaLabel}
            className={`${ADMIN_LIST_FIELD_CLASS} lg:col-span-2`}
            wrapperClassName="lg:col-span-2"
          />
        ) : null}
        {methodOptions?.length ? (
          <ToolbarSearchSelect
            value={methodFilter}
            onChange={onMethodFilterChange}
            options={methodOptions}
            ariaLabel="Filter by method"
            className={`${ADMIN_LIST_FIELD_CLASS} lg:col-span-2`}
            wrapperClassName="lg:col-span-2"
          />
        ) : null}
        {showSort ? (
          <>
            <ToolbarSearchSelect
              value={sortBy}
              onChange={onSortByChange}
              options={sortOptions.map((opt) => ({ id: opt.id, label: `Sort: ${opt.label}` }))}
              ariaLabel="Sort by"
              className={`${ADMIN_LIST_FIELD_CLASS} lg:col-span-2`}
              wrapperClassName="lg:col-span-2"
            />
            {showSortDir ? (
              <ToolbarSearchSelect
                value={sortDir}
                onChange={onSortDirChange}
                options={SORT_DIR_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label }))}
                ariaLabel="Sort direction"
                className={`${ADMIN_LIST_FIELD_CLASS} lg:col-span-1`}
                wrapperClassName="lg:col-span-1"
              />
            ) : null}
          </>
        ) : null}
        {showDateRange ? (
          <>
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className={dateLabelClass}>From date</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => onFromDateChange(e.target.value)}
                max={toDate || undefined}
                className={`${ADMIN_LIST_FIELD_CLASS} min-w-0 w-full`}
                aria-label="From date"
              />
            </label>
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className={dateLabelClass}>To date</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => onToDateChange(e.target.value)}
                min={fromDate || undefined}
                className={`${ADMIN_LIST_FIELD_CLASS} min-w-0 w-full`}
                aria-label="To date"
              />
            </label>
          </>
        ) : null}
      </div>
      <div className="mt-2">{metaRow}</div>
    </div>
  );
}
