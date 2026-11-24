import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import ChartResizeMenu from "@/components/admin/ChartResizeMenu.jsx";
import AdminSearchSelect from "@/components/admin/AdminSearchSelect.jsx";
import AdminDatePicker from "@/components/admin/AdminDatePicker.jsx";
import api from "@/lib/api";
import { errorAlert, toastSuccess } from "@/lib/swal";
import { useAdminAccents } from "@/lib/adminAccents.js";
import { useTheme } from "@/state/theme.jsx";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getReportChartTheme,
} from "@/lib/reportChartTheme.js";
import {
  ReportChartTooltip,
  ReportDonutChart,
  ReportEmptyChart,
  ReportLegendPills,
  ReportSection,
  reportAxisLineProps,
  reportAxisTickProps,
} from "@/components/admin/ReportChartUI.jsx";
import { AdminContentSkeleton } from "@/components/admin/AdminLoading";
import { useAdminPermissions } from "@/hooks/useAdminPermissions.js";
import { getFirstAccessibleAdminPath } from "@/lib/adminPermissions.js";
import { adminCacheKey, readAdminCache, writeAdminCache } from "@/lib/adminPageCache.js";
import StockDashboard from "@/components/admin/StockDashboard.jsx";
import AdminReportExportMenu from "@/components/admin/AdminReportExportMenu.jsx";
import { downloadBlobResponse, parseBlobErrorMessage } from "@/lib/adminReportDownload.js";
import { useAdminUiPreference } from "@/lib/adminUiPreferences.js";
import { ADMIN_NUMBER_FORMAT, formatNumber, formatUsd } from "@/lib/adminNumberFormat.js";
import { useTranslation } from "@/lib/i18n.jsx";

// ─── helpers ─────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const REPORT_TYPE_OPTIONS = [
  { value: "dashboard", label: "Dashboard Summary" },
  { value: "sales", label: "Sales Report" },
];

function truncateChartLabel(value, max = 26) {
  const s = String(value || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function buildSalesParams(period, customFrom, customTo) {
  const now = new Date();
  const year = now.getFullYear();

  if (period === "7d") return { period: 7 };
  if (period === "28d") return { period: 28 };
  if (period === "90d") return { period: 90 };
  if (period === "365d") return { period: 365 };
  if (period === "lifetime") return { period: 3650 };
  if (period === "custom") return { from: customFrom, to: customTo };

  if (/^\d{4}$/.test(period)) {
    const y = parseInt(period, 10);
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }

  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
  }

  return { period: 30 };
}

function buildSalesAreaSeries(salesRows, period, customFrom, customTo) {
  const rows = salesRows || [];
  const byKey = {};
  rows.forEach((row) => {
    const key = String(row.date || "").slice(0, 10);
    if (!key) return;
    byKey[key] = {
      revenue: Number(row.revenue || 0),
      orders: Number(row.orders || 0),
    };
  });

  const params = buildSalesParams(period, customFrom, customTo);
  const end = params.to
    ? new Date(`${params.to}T00:00:00`)
    : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const start = params.from
    ? new Date(`${params.from}T00:00:00`)
    : (() => {
        const days = Math.min(Number(params.period) || 28, 3650);
        const d = new Date(end);
        d.setDate(d.getDate() - (days - 1));
        return d;
      })();

  const daySpan = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  if (daySpan > 92) {
    const months = {};
    rows.forEach((row) => {
      const day = String(row.date || "").slice(0, 10);
      if (!day) return;
      const ym = day.slice(0, 7);
      if (!months[ym]) months[ym] = { revenue: 0, orders: 0 };
      months[ym].revenue += Number(row.revenue || 0);
      months[ym].orders += Number(row.orders || 0);
    });
    return Object.keys(months)
      .sort()
      .map((ym) => {
        const [y, m] = ym.split("-").map(Number);
        const d = new Date(y, m - 1, 1);
        return {
          dateKey: ym,
          revenue: months[ym].revenue,
          orders: months[ym].orders,
          xLabel: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
          dateLong: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        };
      });
  }

  const out = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const key = fmtDate(d);
    const bucket = byKey[key] || { revenue: 0, orders: 0 };
    out.push({
      dateKey: key,
      revenue: bucket.revenue,
      orders: bucket.orders,
      xLabel: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      dateLong: d.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    });
  }
  return out;
}

function periodLabel(period) {
  const names = {
    "7d": "Last 7 days", "28d": "Last 28 days",
    "90d": "Last 90 days", "365d": "Last 365 days",
    "lifetime": "Lifetime", "custom": "Custom",
  };
  if (names[period]) return names[period];

  if (/^\d{4}$/.test(period)) return period;

  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-").map(Number);
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const now = new Date();
    return now.getFullYear() === y ? monthNames[m - 1] : `${monthNames[m - 1]} ${y}`;
  }

  return period;
}

// ─── PeriodDropdown ───────────────────────────────────────────────────────────
function PeriodDropdown({ value, onChange, mode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  const recentMonths = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(thisYear, thisMonth - i, 1);
    return {
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: d.toLocaleString("en-US", { month: "long" }),
    };
  });

  const groups = [
    {
      label: "Quick range",
      items: [
        { key: "7d", label: "Last 7 days" },
        { key: "28d", label: "Last 28 days" },
        { key: "90d", label: "Last 90 days" },
        { key: "365d", label: "Last 365 days" },
        { key: "lifetime", label: "Lifetime" },
      ],
    },
    {
      label: "Year",
      items: [
        { key: String(thisYear), label: String(thisYear) },
        { key: String(thisYear - 1), label: String(thisYear - 1) },
      ],
    },
    {
      label: "Month",
      items: recentMonths,
    },
    {
      label: "Custom",
      items: [{ key: "custom", label: "Custom range…" }],
    },
  ];

  const isDark = mode === "dark";
  const dropdownBg = isDark ? "#1a2235" : "#ffffff";
  const dropdownBorder = isDark ? "rgba(255,255,255,0.08)" : "#E2E8F0";
  const textColor = isDark ? "#E2E8F0" : "#334155";
  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "#F1F5F9";
  const groupLabelColor = isDark ? "#475569" : "#CBD5E1";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 h-9 px-3.5 rounded-xl border text-xs font-semibold transition-all"
        style={{
          background: isDark ? "rgba(255,255,255,0.06)" : "#F8FAFC",
          borderColor: dropdownBorder,
          color: textColor,
        }}
      >
        <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{periodLabel(value)}</span>
        <svg
          className={`w-3.5 h-3.5 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 w-52 rounded-2xl z-50 overflow-hidden py-1.5"
          style={{
            background: dropdownBg,
            border: `1px solid ${dropdownBorder}`,
            boxShadow: isDark
              ? "0 24px 64px rgba(0,0,0,0.65)"
              : "0 8px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)",
          }}
        >
          {groups.map((group, gi) => (
            <React.Fragment key={gi}>
              {gi > 0 && (
                <div style={{ height: 1, background: dividerColor, margin: "4px 8px" }} />
              )}
              <div
                className="px-4 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: groupLabelColor }}
              >
                {group.label}
              </div>
              {group.items.map((item) => {
                const isActive = value === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => { onChange(item.key); setOpen(false); }}
                    className="w-full text-left px-4 py-2 text-xs transition-colors"
                    style={{
                      color: isActive ? "var(--admin-primary)" : textColor,
                      background: isActive
                        ? "rgba(var(--admin-primary-rgb), 0.12)"
                        : "transparent",
                      fontWeight: isActive ? 700 : 500,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = isDark
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(var(--admin-primary-rgb), 0.06)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {isActive && (
                      <span
                        className="inline-block w-1 h-1 rounded-full mr-2 mb-0.5"
                        style={{ background: "var(--admin-primary)" }}
                      />
                    )}
                    {item.label}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function KpiSparkline({ data, dataKey, color, gradientId }) {
  if (!data?.length) return null;
  return (
    <div className="mt-3 -mx-1 h-11 w-[calc(100%+0.5rem)]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function kpiValueSize(text) {
  const n = String(text || "").replace(/\s/g, "").length;
  if (n >= 14) return "text-[1.05rem] sm:text-lg";
  if (n >= 11) return "text-xl";
  if (n >= 9) return "text-[1.4rem]";
  return "text-[1.65rem]";
}

function StatCard({ title, value, subtext, icon, iconBoxStyle, className = "", sparkline }) {
  return (
    <div
      className={`admin-surface admin-spectrum-kpi flex h-full min-h-[148px] min-w-0 flex-col overflow-hidden rounded-2xl border admin-border p-5 ${className}`}
      style={{ borderTop: "3px solid var(--admin-kpi-accent, var(--admin-primary))" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-medium text-slate-600 dark:text-slate-400">{title}</p>
        <div
          className="admin-stat-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border admin-border"
          style={iconBoxStyle}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
      </div>
      <p
        className={`mt-3 min-w-0 truncate font-semibold tabular-nums leading-tight text-slate-900 dark:text-white ${kpiValueSize(value)}`}
        title={String(value)}
      >
        {value}
      </p>
      {subtext ? (
        <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-500" title={String(subtext)}>
          {subtext}
        </p>
      ) : null}
      {sparkline}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Reports() {
  const { t } = useTranslation();
  const salesGradientId = useId().replace(/:/g, "");
  const { user, can, permissionsReady } = useAdminPermissions();
  const canViewReports = can("reports", "view");
  const { primaryColor, mode } = useTheme();
  const { iconBoxStyle, colors } = useAdminAccents();
  const reportTheme = useMemo(
    () => getReportChartTheme(mode, { palette: colors, primaryColor }),
    [mode, colors, primaryColor],
  );

  const [dashboard, setDashboard] = useState(null);
  const [sales, setSales] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [categorySales, setCategorySales] = useState({
    revenue_by_category: [],
    total_revenue: 0,
    total_units: 0,
  });
  const [period, setPeriod] = useState("28d");
  const [loading, setLoading] = useState(true);

  const [top10Span, setTop10Span] = useAdminUiPreference("charts.reports.top10Span", 1);
  const [catRevenueSpan, setCatRevenueSpan] = useAdminUiPreference("charts.reports.catRevenueSpan", 1);
  const [numberFormat] = useAdminUiPreference("dashboard.numberFormat", ADMIN_NUMBER_FORMAT.COMPACT);

  const [chartFrom, setChartFrom] = useState("");
  const [chartTo, setChartTo] = useState("");

  const [reportType, setReportType] = useState("dashboard");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [genOpen, setGenOpen] = useState(false);
  const genRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (genRef.current && !genRef.current.contains(e.target)) setGenOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const load = async () => {
    if (!canViewReports) {
      setLoading(false);
      return;
    }

    const cacheKey = adminCacheKey("reports-v4", period, chartFrom, chartTo);
    const cached = readAdminCache(cacheKey);
    if (cached) {
      setDashboard(cached.dashboard ?? null);
      setSales(cached.sales ?? []);
      setTopProducts(cached.topProducts ?? []);
      setCategorySales(cached.categorySales ?? {
        revenue_by_category: [],
        total_revenue: 0,
        total_units: 0,
      });
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const periodParams = buildSalesParams(period, chartFrom, chartTo);

      const [dashRes, salesRes, productsRes, categorySalesRes] = await Promise.all([
        api.get("/admin/reports/dashboard", { params: periodParams }),
        api.get("/admin/reports/sales", { params: periodParams }).catch(() => ({ data: { sales: [] } })),
        api.get("/admin/reports/top-products", { params: { ...periodParams, limit: 10 } }).catch(() => ({ data: { data: [] } })),
        api.get("/admin/reports/category-sales", { params: { ...periodParams, limit: 10 } }).catch(() => ({
          data: { revenue_by_category: [], total_revenue: 0, total_units: 0 },
        })),
      ]);

      const dashData = dashRes.data;
      const nextDashboard = {
        revenue: dashData.revenue || { total: 0, month: 0, today: 0 },
        orders: dashData.orders || { total: 0, pending: 0, processing: 0, completed: 0 },
        aov: Number(dashData.aov) || 0,
        payment_methods: dashData.payment_methods || {
          prepaid: { orders: 0, revenue: 0, paid_orders: 0, unpaid_orders: 0, paid_revenue: 0, unpaid_revenue: 0 },
          cod: { orders: 0, revenue: 0, paid_orders: 0, unpaid_orders: 0, paid_revenue: 0, unpaid_revenue: 0 },
        },
      };

      const nextTopProducts = productsRes.data?.data || [];
      const nextSales = salesRes.data?.sales || salesRes.data?.data || [];
      const nextCategorySales = {
        revenue_by_category: categorySalesRes.data?.revenue_by_category || [],
        total_revenue: categorySalesRes.data?.total_revenue || 0,
        total_units: categorySalesRes.data?.total_units || 0,
      };

      setDashboard(nextDashboard);
      setSales(nextSales);
      setTopProducts(nextTopProducts);
      setCategorySales(nextCategorySales);
      writeAdminCache(cacheKey, {
        dashboard: nextDashboard,
        sales: nextSales,
        topProducts: nextTopProducts,
        categorySales: nextCategorySales,
      });
    } catch (e) {
      console.error("Failed to load reports", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dateFrom || dateTo) return;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    setDateFrom(fmtDate(first));
    setDateTo(fmtDate(now));
  }, []);

  useEffect(() => {
    if (chartFrom || chartTo) return;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    setChartFrom(fmtDate(first));
    setChartTo(fmtDate(now));
  }, []);

  useEffect(() => {
    if (!permissionsReady || !canViewReports) {
      setLoading(false);
      return;
    }
    if (period === "custom" && (!chartFrom || !chartTo)) return;
    load();
  }, [period, chartFrom, chartTo, permissionsReady, canViewReports]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!canViewReports) return;
    if (!dateFrom || !dateTo) {
      await errorAlert({
        khTitle: "កាលបរិច្ឆេទមិនគ្រប់",
        enTitle: "Date range required",
        khText: "សូមជ្រើសរើសថ្ងៃចាប់ផ្ដើម និងថ្ងៃបញ្ចប់",
        enText: "Please select Date From and Date To",
      });
      return;
    }
    setGenerating(true);
    try {
      const { data } = await api.get("/admin/reports/generate", {
        params: { type: reportType, from: dateFrom, to: dateTo },
      });
      setGenerated(data?.data || null);
    } catch (e) {
      await errorAlert({
        khTitle: "បង្កើតរបាយការណ៍បរាជ័យ",
        enTitle: "Generate report failed",
        detail: e?.response?.data?.message || "Failed to generate report",
      });
    } finally {
      setGenerating(false);
    }
  };

  const ensureReportDateRange = async () => {
    if (!dateFrom || !dateTo) {
      await errorAlert({
        khTitle: "កាលបរិច្ឆេទមិនគ្រប់",
        enTitle: "Date range required",
        khText: "សូមជ្រើសរើសថ្ងៃចាប់ផ្ដើម និងថ្ងៃបញ្ចប់",
        enText: "Please select Date From and Date To",
      });
      return false;
    }
    return true;
  };

  const downloadGeneratedReport = async (format) => {
    if (!canViewReports) return;
    if (!(await ensureReportDateRange())) return;
    setExportBusy(true);
    try {
      const endpoint = format === "pdf" ? "/admin/reports/download-pdf" : "/admin/reports/download-excel";
      const res = await api.get(endpoint, {
        params: { type: reportType, from: dateFrom, to: dateTo },
        responseType: "blob",
      });
      const ext = format === "pdf" ? "pdf" : "xls";
      await downloadBlobResponse(res, `report-${reportType}-${dateFrom}-to-${dateTo}.${ext}`);
      await toastSuccess({
        khText: format === "pdf" ? "បានទាញយក PDF ដោយជោគជ័យ" : "បានទាញយក Excel ដោយជោគជ័យ",
        enText: format === "pdf" ? "PDF downloaded successfully" : "Excel downloaded successfully",
      });
    } catch (e) {
      const message = await parseBlobErrorMessage(
        e?.response?.data,
        format === "pdf" ? "Failed to download PDF" : "Failed to download Excel",
      );
      await errorAlert({
        khTitle: format === "pdf" ? "ទាញយក PDF បរាជ័យ" : "ទាញយក Excel បរាជ័យ",
        enTitle: format === "pdf" ? "Download PDF failed" : "Download Excel failed",
        detail: message,
      });
    } finally {
      setExportBusy(false);
    }
  };

  const handleDownloadPdf = () => downloadGeneratedReport("pdf");
  const handleDownloadExcel = () => downloadGeneratedReport("excel");

  const categoryRevenueDonutData = useMemo(
    () =>
      (categorySales.revenue_by_category || []).map((row, index) => ({
        name: row.name,
        revenue: Number(row.revenue) || 0,
        percentage: row.percentage,
        fill: reportTheme.chartColor(index),
      })),
    [categorySales.revenue_by_category, reportTheme],
  );

  const topSellingChartData = useMemo(
    () =>
      (topProducts || []).slice(0, 10).map((item, index) => {
        const fullName = item.product?.name || `Product #${item.product_id}`;
        return {
          productId: item.product_id,
          fullName,
          shortLabel: truncateChartLabel(fullName),
          unitsSold: Number(item.total_sold) || 0,
          revenue: Number(item.total_revenue) || 0,
          fill: reportTheme.chartColor(index),
        };
      }),
    [topProducts, reportTheme],
  );

  const salesAreaData = useMemo(
    () => buildSalesAreaSeries(sales, period, chartFrom, chartTo),
    [sales, period, chartFrom, chartTo],
  );
  const sparklineSeries = useMemo(() => salesAreaData.slice(-24), [salesAreaData]);
  const aovSparkSeries = useMemo(
    () =>
      sparklineSeries.map((row) => ({
        ...row,
        aov: row.orders > 0 ? row.revenue / row.orders : 0,
      })),
    [sparklineSeries],
  );
  const showSalesDots = salesAreaData.length <= 28;
  const salesTrendGrain = salesAreaData[0]?.dateKey?.length === 7 ? "Monthly" : "Daily";

  if (!permissionsReady || (loading && !dashboard)) {
    return <AdminContentSkeleton rows={8} />;
  }

  if (!canViewReports) {
    return <Navigate to={getFirstAccessibleAdminPath(user)} replace />;
  }

  const isDark = mode === "dark";

  return (
    <div className="reports-dashboard flex min-h-0 flex-1 flex-col text-slate-800 dark:text-slate-100">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
              {t("reports.title")}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5 max-w-xl">
              Track store performance, revenue trends, and key business metrics
            </p>
          </div>

          {/* Top-right controls */}
          <div className="flex flex-wrap items-start gap-3 mt-1">

            {/* ── Generate report ── */}
            <div className="relative" ref={genRef}>
              <button
                type="button"
                onClick={() => setGenOpen((p) => !p)}
                className="flex items-center gap-2 h-9 px-3.5 rounded-xl border text-xs font-semibold transition-all"
                style={{
                  background: isDark ? "rgba(255,255,255,0.06)" : "#F8FAFC",
                  borderColor: isDark ? "rgba(255,255,255,0.08)" : "#E2E8F0",
                  color: isDark ? "#E2E8F0" : "#334155",
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>{t("reports.generateReport")}</span>
                <svg
                  className={`w-3.5 h-3.5 opacity-80 transition-transform ${genOpen ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {genOpen && (
                <div
                  className="absolute right-0 z-40 mt-2 w-[min(92vw,400px)] rounded-2xl border p-5 shadow-2xl"
                  style={{
                    background: isDark ? "#141d2e" : "#ffffff",
                    borderColor: isDark ? "rgba(255,255,255,0.08)" : "#E2E8F0",
                    boxShadow: isDark
                      ? "0 24px 64px rgba(0,0,0,0.7)"
                      : "0 16px 48px rgba(15,23,42,0.14), 0 4px 12px rgba(15,23,42,0.06)",
                  }}
                >
                  <div className="flex items-center gap-2.5 mb-5">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${primaryColor}, ${reportTheme.accentSecondary})` }}
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800 dark:text-white">{t("reports.generateReport")}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">Export a dashboard or sales summary</div>
                    </div>
                  </div>

                  <form onSubmit={handleGenerate} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                        Report Type
                      </label>
                      <AdminSearchSelect
                        value={reportType}
                        onChange={setReportType}
                        options={REPORT_TYPE_OPTIONS}
                        inputClassName="w-full h-10 rounded-xl border px-3 text-sm outline-none dark:[color-scheme:dark] font-medium"
                        inputStyle={{
                          borderColor: isDark ? "rgba(148,163,184,0.2)" : "#E2E8F0",
                          background: isDark ? "rgba(255,255,255,0.05)" : "#F8FAFC",
                          color: isDark ? "#F1F5F9" : "#0F172A",
                        }}
                        ariaLabel="Report type"
                        placeholder="Search type…"
                        allowEmpty={false}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                          Date From
                        </label>
                        <AdminDatePicker
                          value={dateFrom}
                          onChange={setDateFrom}
                          max={dateTo || undefined}
                          className="w-full h-10 rounded-xl"
                          placeholder="From date"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                          Date To
                        </label>
                        <AdminDatePicker
                          value={dateTo}
                          onChange={setDateTo}
                          min={dateFrom || undefined}
                          className="w-full h-10 rounded-xl"
                          placeholder="To date"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={generating}
                        className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white transition disabled:opacity-60 disabled:cursor-not-allowed flex-1"
                        style={{
                          background: generating
                            ? "rgba(var(--admin-primary-rgb), 0.65)"
                            : `linear-gradient(135deg, ${primaryColor}, ${reportTheme.accentSecondary})`,
                          boxShadow: generating ? "none" : "0 4px 14px rgba(var(--admin-primary-rgb), 0.28)",
                        }}
                      >
                        {generating ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Generating…
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Generate
                          </>
                        )}
                      </button>
                      <AdminReportExportMenu
                        onExportPdf={handleDownloadPdf}
                        onExportExcel={handleDownloadExcel}
                        busy={exportBusy}
                        accentColor={primaryColor}
                        mode={mode}
                      />
                    </div>
                  </form>

                  {generated && (
                    <div
                      className="mt-4 p-3.5 rounded-xl text-xs"
                      style={{
                        background: "rgba(var(--admin-primary-rgb), 0.1)",
                        border: "1px solid rgba(var(--admin-primary-rgb), 0.22)",
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ background: "var(--admin-primary)" }}
                        >
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <span className="font-bold" style={{ color: "var(--admin-primary)" }}>Generated Successfully</span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        {generated.type === "dashboard" && (
                          <>
                            Dashboard summary from {generated.from} to {generated.to}.{" "}
                            Revenue: <strong>{formatUsd(generated.revenue?.total || 0, numberFormat)}</strong> ·{" "}
                            Orders: <strong>{formatNumber(generated.orders?.total || 0, numberFormat)}</strong> ({formatNumber(generated.orders?.pending || 0, numberFormat)} pending)
                          </>
                        )}
                        {generated.type === "sales" && (
                          <>
                            Sales report from {generated.from} to {generated.to}.{" "}
                            Orders: <strong>{formatNumber(generated.summary?.total_orders || 0, numberFormat)}</strong> ·{" "}
                            Revenue: <strong>{formatUsd(generated.summary?.total_revenue || 0, numberFormat)}</strong>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Global period selector */}
            <div className="flex flex-col items-end gap-2">
              <PeriodDropdown value={period} onChange={setPeriod} mode={mode} />
              {period === "custom" && (
                <div className="flex flex-wrap items-center gap-2">
                  <AdminDatePicker
                    value={chartFrom}
                    onChange={setChartFrom}
                    max={chartTo || undefined}
                    className="h-9 min-w-[8.5rem] rounded-xl text-xs"
                    placeholder="From"
                  />
                  <span className="text-xs font-bold text-slate-400">→</span>
                  <AdminDatePicker
                    value={chartTo}
                    onChange={setChartTo}
                    min={chartFrom || undefined}
                    className="h-9 min-w-[8.5rem] rounded-xl text-xs"
                    placeholder="To"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <AdminContentSkeleton lines={3} imageHeight={200} className="min-h-0 flex-1" />
        ) : (
          <>
            {/* ── KPI Stats Grid ──────────────────────────────────────────── */}
            <div className="admin-stat-grid mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 [&>*]:min-w-0">
              <StatCard
                title={t("reports.totalRevenue")}
                value={formatUsd(dashboard?.revenue?.total || 0, numberFormat)}
                subtext={`Today ${formatUsd(dashboard?.revenue?.today || 0, numberFormat)}`}
                icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                iconBoxStyle={iconBoxStyle(0)}
                sparkline={(
                  <KpiSparkline
                    data={sparklineSeries}
                    dataKey="revenue"
                    color={reportTheme.chartColor(0)}
                    gradientId={`${salesGradientId}-rev`}
                  />
                )}
              />
              <StatCard
                title={t("reports.totalOrders")}
                value={formatNumber(dashboard?.orders?.total || 0, numberFormat)}
                subtext={`${formatNumber(dashboard?.orders?.pending || 0, numberFormat)} pending`}
                icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                iconBoxStyle={iconBoxStyle(1)}
                sparkline={(
                  <KpiSparkline
                    data={sparklineSeries}
                    dataKey="orders"
                    color={reportTheme.chartColor(1)}
                    gradientId={`${salesGradientId}-ord`}
                  />
                )}
              />
              <StatCard
                title={t("reports.averageOrderValue")}
                value={formatUsd(
                  dashboard?.aov
                    || ((dashboard?.orders?.total || 0) > 0
                      ? (dashboard?.revenue?.total || 0) / dashboard.orders.total
                      : 0),
                  numberFormat,
                )}
                subtext="Per order"
                icon="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                iconBoxStyle={iconBoxStyle(2)}
                sparkline={(
                  <KpiSparkline
                    data={aovSparkSeries}
                    dataKey="aov"
                    color={reportTheme.chartColor(2)}
                    gradientId={`${salesGradientId}-aov`}
                  />
                )}
              />
              <StatCard
                title="Pay now"
                value={formatUsd(dashboard?.payment_methods?.prepaid?.paid_revenue || 0, numberFormat)}
                subtext={`${formatNumber(dashboard?.payment_methods?.prepaid?.paid_orders || 0, numberFormat)} paid`}
                icon="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                iconBoxStyle={iconBoxStyle(3)}
              />
              <StatCard
                title="COD to collect"
                value={formatUsd(dashboard?.payment_methods?.cod?.unpaid_revenue || 0, numberFormat)}
                subtext={`${formatNumber(dashboard?.payment_methods?.cod?.unpaid_orders || 0, numberFormat)} unpaid`}
                icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                iconBoxStyle={iconBoxStyle(4)}
              />
            </div>

            <ReportSection
              title="Sales details"
              subtitle={`${salesTrendGrain} revenue · ${periodLabel(period)}`}
              theme={reportTheme}
            >
              {salesAreaData.every((row) => row.revenue <= 0) ? (
                <ReportEmptyChart message="No sales in this period" theme={reportTheme} />
              ) : (
                <div className="h-[min(22rem,calc(100vw-5rem))] min-h-[280px] w-full [&_.recharts-surface]:outline-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesAreaData} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
                      <defs>
                        <linearGradient id={salesGradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={primaryColor} stopOpacity={0.38} />
                          <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={reportTheme.grid} strokeDasharray="4 4" vertical={false} />
                      <XAxis
                        dataKey="xLabel"
                        tick={reportAxisTickProps(reportTheme)}
                        axisLine={reportAxisLineProps(reportTheme)}
                        tickLine={reportAxisLineProps(reportTheme)}
                        minTickGap={salesAreaData.length > 40 ? 10 : 6}
                        interval="preserveStartEnd"
                        height={salesAreaData.length > 40 ? 40 : 28}
                        angle={salesAreaData.length > 40 ? -28 : 0}
                        textAnchor={salesAreaData.length > 40 ? "end" : "middle"}
                      />
                      <YAxis
                        width={64}
                        tick={reportAxisTickProps(reportTheme)}
                        axisLine={reportAxisLineProps(reportTheme)}
                        tickLine={reportAxisLineProps(reportTheme)}
                        tickFormatter={(v) => formatUsd(Number(v), numberFormat)}
                        domain={[0, "auto"]}
                      />
                      <Tooltip
                        cursor={{ stroke: primaryColor, strokeWidth: 1, strokeOpacity: 0.35 }}
                        content={(props) => (
                          <ReportChartTooltip
                            {...props}
                            theme={reportTheme}
                            label={props.payload?.[0]?.payload?.dateLong}
                            formatLine={(e) =>
                              e.dataKey === "revenue"
                                ? formatUsd(Number(e.value) || 0, numberFormat)
                                : `${formatNumber(e.value, numberFormat)} orders`
                            }
                          />
                        )}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue"
                        stroke={primaryColor}
                        strokeWidth={2.25}
                        fill={`url(#${salesGradientId})`}
                        dot={showSalesDots ? { r: 3, fill: primaryColor, stroke: "#fff", strokeWidth: 2 } : false}
                        activeDot={{ r: 5, fill: primaryColor, stroke: isDark ? "#0f172a" : "#fff", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ReportSection>

            <StockDashboard theme={reportTheme} numberFormat={numberFormat} />

            <ReportSection
              title={t("reports.topSellingProducts")}
              subtitle={`By revenue · non-cancelled · ${periodLabel(period)}`}
              theme={reportTheme}
              action={<ChartResizeMenu colSpan={top10Span} maxCols={2} onChange={setTop10Span} />}
            >
                {topSellingChartData.length === 0 ? (
                  <ReportEmptyChart message="No products sold in this period" theme={reportTheme} />
                ) : (
                  <>
                    <div
                      className="mb-5 w-full [&_.recharts-surface]:outline-none"
                      style={{ height: Math.max(260, topSellingChartData.length * 40 + 40) }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topSellingChartData} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }} barCategoryGap="16%">
                          <CartesianGrid stroke={reportTheme.grid} strokeDasharray="3 3" horizontal={false} />
                          <XAxis
                            type="number"
                            tick={reportAxisTickProps(reportTheme)}
                            axisLine={reportAxisLineProps(reportTheme)}
                            tickLine={reportAxisLineProps(reportTheme)}
                            tickFormatter={(v) => formatUsd(Number(v), numberFormat)}
                          />
                          <YAxis type="category" dataKey="shortLabel" width={148} tick={reportAxisTickProps(reportTheme)} axisLine={reportAxisLineProps(reportTheme)} tickLine={false} />
                          <Tooltip
                            cursor={{ fill: reportTheme.cursor }}
                            content={(props) => (
                              <ReportChartTooltip
                                {...props}
                                theme={reportTheme}
                                label={props.payload?.[0]?.payload?.fullName}
                                formatLine={(e) =>
                                  e.dataKey === "revenue"
                                    ? formatUsd(Number(e.value) || 0, numberFormat)
                                    : `${formatNumber(e.value, numberFormat)} units`
                                }
                              />
                            )}
                          />
                          <Bar dataKey="revenue" name="Revenue" radius={[0, 6, 6, 0]} maxBarSize={30}>
                            {topSellingChartData.map((row) => (
                              <Cell key={row.productId} fill={row.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <ReportLegendPills
                      rows={topSellingChartData.map((row) => ({
                        name: row.fullName,
                        fill: row.fill,
                        key: row.productId,
                        unitsSold: row.unitsSold,
                        revenue: row.revenue,
                      }))}
                      theme={reportTheme}
                      formatValue={(row) =>
                        `${formatUsd(row.revenue, numberFormat)} · ${formatNumber(row.unitsSold, numberFormat)} units`
                      }
                    />
                  </>
                )}
            </ReportSection>

            <ReportSection
              title={t("reports.categoryRevenue")}
              subtitle={`${formatUsd(categorySales.total_revenue || 0, numberFormat)} · ${formatNumber(categorySales.total_units || 0, numberFormat)} units · ${periodLabel(period)} · storefront categories`}
              theme={reportTheme}
              action={<ChartResizeMenu colSpan={catRevenueSpan} maxCols={2} onChange={setCatRevenueSpan} />}
            >
                {categoryRevenueDonutData.length === 0 ? (
                  <ReportEmptyChart message="No category sales in this period" theme={reportTheme} />
                ) : (
                  <ReportDonutChart
                    data={categoryRevenueDonutData}
                    dataKey="revenue"
                    centerTitle="Revenue"
                    centerValue={formatUsd(categorySales.total_revenue || 0, numberFormat)}
                    theme={reportTheme}
                    legendRows={categoryRevenueDonutData}
                    formatLegendValue={(row) => `${formatUsd(row.revenue, numberFormat)} (${row.percentage}%)`}
                    tooltipContent={(props) => (
                      <ReportChartTooltip
                        {...props}
                        theme={reportTheme}
                        formatLine={(e) =>
                          `${formatUsd(Number(e.payload?.revenue ?? e.value) || 0, numberFormat)} (${e.payload?.percentage ?? 0}%)`
                        }
                      />
                    )}
                  />
                )}
            </ReportSection>
          </>
        )}
      </div>
    </div>
  );
}
