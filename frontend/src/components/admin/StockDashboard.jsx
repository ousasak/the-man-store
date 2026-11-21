import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ChartResizeMenu from "./ChartResizeMenu.jsx";
import AdminSearchSelect from "./AdminSearchSelect.jsx";
import api from "../../lib/api";
import { ADMIN_NUMBER_FORMAT, formatNumber } from "../../lib/adminNumberFormat.js";
import {
  ReportChartPanel,
  ReportChartTooltip,
  ReportDonutChart,
  ReportEmptyChart,
  ReportSection,
  reportAxisLineProps,
  reportAxisTickProps,
} from "./ReportChartUI.jsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAdminUiPreference } from "../../lib/adminUiPreferences.js";

function yearRangeLabel(fromYear, toYear) {
  if (fromYear === toYear) return String(fromYear);
  return `${fromYear} – ${toYear}`;
}

function FilterYearSelect({ label, value, onChange, options, theme }) {
  return (
    <label className="block flex-1 min-w-[8rem]">
      <span
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide"
        style={{ color: theme.subtitle }}
      >
        {label}
      </span>
      <AdminSearchSelect
        value={value}
        onChange={onChange}
        options={options}
        inputClassName="h-10 w-full rounded-xl border px-3 text-sm outline-none dark:[color-scheme:dark]"
        inputStyle={{
          background: theme.isDark ? "rgba(15, 23, 42, 0.6)" : "#ffffff",
          borderColor: theme.cardBorder,
          color: theme.title,
        }}
        ariaLabel={label}
        placeholder={`Search ${label.toLowerCase()}…`}
        allowEmpty={false}
      />
    </label>
  );
}

export default function StockDashboard({ theme, numberFormat = ADMIN_NUMBER_FORMAT.COMPACT }) {
  const currentYear = new Date().getFullYear();
  const [fromYear, setFromYear] = useState(String(currentYear - 1));
  const [toYear, setToYear] = useState(String(currentYear));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  /* chart resize state */
  const [labelSpan, setLabelSpan] = useAdminUiPreference("charts.stock.labelSpan", 1);
  const [monthSpan, setMonthSpan] = useAdminUiPreference("charts.stock.monthSpan", 1);

  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = currentYear; y >= currentYear - 15; y -= 1) {
      years.push({ value: String(y), label: String(y) });
    }
    return years;
  }, [currentYear]);

  const load = useCallback(async () => {
    let from = parseInt(fromYear, 10);
    let to = parseInt(toYear, 10);
    if (from > to) {
      [from, to] = [to, from];
    }

    setLoading(true);
    try {
      const { data: res } = await api.get("/admin/reports/stock-analytics", {
        params: { from_year: from, to_year: to },
      });
      setData(res);
    } catch (e) {
      console.error("Failed to load stock analytics", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fromYear, toYear]);

  useEffect(() => {
    load();
  }, [load]);

  const labelDonutData = useMemo(
    () =>
      (data?.by_label || []).map((row, index) => ({
        name: row.name,
        count: Number(row.count) || 0,
        percentage: row.percentage,
        fill: theme.chartColor?.(index) || theme.accentColor,
      })),
    [data?.by_label, theme],
  );

  const compareYears = data?.compare_years || [];
  const rangeFrom = data?.year_range?.from ?? parseInt(fromYear, 10);
  const rangeTo = data?.year_range?.to ?? parseInt(toYear, 10);
  const totalStock = data?.total_stock ?? 0;
  const rangeLabel = yearRangeLabel(rangeFrom, rangeTo);

  const monthlyChartData = useMemo(() => {
    const years = compareYears.length ? compareYears : [rangeFrom, rangeTo];
    return (data?.monthly_compare || []).map((row) => {
      const point = {
        month: row.month,
        month_label: row.month_label,
        month_short: row.month_short,
      };
      years.forEach((yr) => {
        const key = `y${yr}`;
        point[key] = Number(row.by_year?.[String(yr)] ?? row.by_year?.[yr] ?? 0);
      });
      return point;
    });
  }, [data?.monthly_compare, compareYears, rangeFrom, rangeTo]);

  const hasMonthlyCompare = monthlyChartData.some((row) =>
    compareYears.some((yr) => (row[`y${yr}`] ?? 0) > 0),
  );

  return (
    <ReportSection
      title="Stock"
      subtitle={
        loading ? "Loading…" : `${formatNumber(totalStock, numberFormat)} units on hand across inventory labels`
      }
      theme={theme}
    >
      {loading ? (
        <div className="grid min-h-[280px] place-items-center text-sm" style={{ color: theme.subtitle }}>
          Loading charts…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-2 xl:gap-10">
          <ReportChartPanel
            embedded
            className="report-chart-panel"
            title="Stock by label"
            subtitle="On-hand units per inventory label"
            theme={theme}
            style={{ gridColumn: `span ${labelSpan}` }}
            action={<ChartResizeMenu colSpan={labelSpan} maxCols={2} onChange={setLabelSpan} />}
          >
            {labelDonutData.length === 0 ? (
              <ReportEmptyChart message="No inventory labels with stock" theme={theme} />
            ) : (
              <ReportDonutChart
                data={labelDonutData}
                dataKey="count"
                centerTitle="Units"
                centerValue={formatNumber(totalStock, numberFormat)}
                theme={theme}
                legendRows={labelDonutData}
                formatLegendValue={(row) => `${formatNumber(row.count, numberFormat)} (${row.percentage}%)`}
                tooltipContent={(props) => (
                  <ReportChartTooltip
                    {...props}
                    theme={theme}
                    formatLine={(e) =>
                      `${formatNumber(e.payload?.count ?? e.value, numberFormat)} units (${e.payload?.percentage ?? 0}%)`
                    }
                  />
                )}
              />
            )}
          </ReportChartPanel>

          <ReportChartPanel
            embedded
            className="report-chart-panel"
            title="Stock in by month"
            subtitle={`Units received · ${rangeLabel}`}
            theme={theme}
            style={{ gridColumn: `span ${monthSpan}` }}
            action={<ChartResizeMenu colSpan={monthSpan} maxCols={2} onChange={setMonthSpan} />}
          >
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <FilterYearSelect
                label="From year"
                value={fromYear}
                onChange={setFromYear}
                options={yearOptions}
                theme={theme}
              />
              <span className="hidden pb-2.5 text-sm sm:inline" style={{ color: theme.subtitle }}>
                to
              </span>
              <FilterYearSelect
                label="To year"
                value={toYear}
                onChange={setToYear}
                options={yearOptions}
                theme={theme}
              />
            </div>

            {!hasMonthlyCompare ? (
              <ReportEmptyChart message="No stock received in this year range" theme={theme} />
            ) : (
              <div className="h-[min(22rem,calc(100vw-4rem))] min-h-[300px] w-full [&_.recharts-surface]:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyChartData}
                    margin={{ top: 12, right: 12, bottom: 48, left: 4 }}
                    barGap={compareYears.length > 4 ? 2 : 6}
                    barCategoryGap={compareYears.length > 4 ? "12%" : "24%"}
                  >
                    <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="month_short"
                      tick={reportAxisTickProps(theme)}
                      axisLine={reportAxisLineProps(theme)}
                      tickLine={reportAxisLineProps(theme)}
                      angle={-28}
                      textAnchor="end"
                      height={52}
                      interval={0}
                    />
                    <YAxis
                      tick={reportAxisTickProps(theme)}
                      axisLine={reportAxisLineProps(theme)}
                      tickLine={reportAxisLineProps(theme)}
                      allowDecimals={false}
                      width={48}
                      tickFormatter={(v) => formatNumber(Number(v), numberFormat)}
                    />
                    <Tooltip
                      cursor={{ fill: theme.cursor }}
                      content={(props) => (
                        <ReportChartTooltip
                          {...props}
                          theme={theme}
                          label={props.payload?.[0]?.payload?.month_label}
                          formatLine={(e) => `${formatNumber(e.value, numberFormat)} units`}
                        />
                      )}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                      iconType="circle"
                      formatter={(value) => <span style={{ color: theme.subtitle }}>{value}</span>}
                    />
                    {compareYears.map((yr, index) => (
                      <Bar
                        key={yr}
                        dataKey={`y${yr}`}
                        name={String(yr)}
                        fill={theme.chartColor?.(index) || theme.accentColor}
                        radius={[8, 8, 0, 0]}
                        maxBarSize={compareYears.length > 4 ? 22 : 34}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ReportChartPanel>
        </div>
      )}
      {!loading ? (
        <div
          className="mt-8 pt-6"
          style={{ borderTop: `1px solid ${theme.cardBorder}` }}
        >
          <h3 className="text-sm font-semibold tracking-tight" style={{ color: theme.title }}>
            Low stock labels
          </h3>
          <p className="mt-0.5 mb-4 text-xs" style={{ color: theme.subtitle }}>
            At or below min stock (or under 20 units if min is not set)
          </p>
            {(data?.low_stock_labels || []).length === 0 ? (
              <p className="py-4 text-sm" style={{ color: theme.subtitle }}>
                No inventory labels are low right now
              </p>
            ) : (
              <ul>
                {(data.low_stock_labels || []).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        to={`/admin/stock-inventory?search=${encodeURIComponent(row.name)}`}
                        className="truncate font-medium hover:underline"
                        style={{ color: theme.title }}
                      >
                        {row.name}
                      </Link>
                      <p className="mt-0.5 text-[11px]" style={{ color: theme.subtitle }}>
                        {row.status === "out" ? "Out of stock" : `Low · min ${formatNumber(row.min_stock, numberFormat)}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: theme.subtitle }}>
                      {formatNumber(row.stock, numberFormat)} units
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      ) : null}
    </ReportSection>
  );
}
