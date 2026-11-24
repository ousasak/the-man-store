import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import api from "@/lib/api";
import { useAdminAccents } from "@/lib/adminAccents.js";
import { useTheme } from "@/state/theme.jsx";
import { useLanguage } from "@/lib/i18n.jsx";
import ChartResizeMenu from "@/components/admin/ChartResizeMenu.jsx";
import { useAdminUiPreference } from "@/lib/adminUiPreferences.js";
import {
  ADMIN_NUMBER_FORMAT,
  formatNumber,
  formatUsd,
  formatUsdFull,
} from "@/lib/adminNumberFormat.js";
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
import { AdminContentSkeleton } from "@/components/admin/AdminLoading";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAdminPermissions } from "@/hooks/useAdminPermissions.js";
import { getFirstAccessibleAdminPath } from "@/lib/adminPermissions.js";
import { adminCacheKey, readAdminCache, writeAdminCache } from "@/lib/adminPageCache.js";

const DEFAULT_STATS = {
  revenue: { total: 0, month: 0, today: 0 },
  ordersHead: { total: 0, pending: 0, processing: 0, completed: 0 },
  ordersByStatus: [],
  products: { total: 0, active: 0, low_stock: 0 },
  customers: { total: 0, new_this_month: 0 },
};

function readDashboardSnapshot(periodDays) {
  return readAdminCache(adminCacheKey("dashboard-v2", periodDays));
}

const pad = (n) => String(n).padStart(2, "0");
const fmtYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function hexToRgb(hex) {
  const h = (hex || "").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 107, g: 126, b: 115 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function mixChannel(c, toward, ratio) {
  return Math.round(c + (toward - c) * ratio);
}

function shadeHex(hex, toward255, ratio) {
  const { r, g, b } = hexToRgb(hex);
  const t = toward255 ? 255 : 0;
  const rr = mixChannel(r, t, ratio);
  const gg = mixChannel(g, t, ratio);
  const bb = mixChannel(b, t, ratio);
  const x = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${x(rr)}${x(gg)}${x(bb)}`;
}

/** Human-readable order status for charts */
function formatStatusLabel(status) {
  if (!status) return "Unknown";
  const s = String(status).toLowerCase().replace(/_/g, " ");
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_SORT_ORDER = [
  "pending",
  "pending_payment",
  "paid",
  "processing",
  "preparing",
  "shipped",
  "in_transit",
  "arrived",
  "completed",
  "cancelled",
  "canceled",
];

function sortStatusRows(rows) {
  const orderMap = new Map(STATUS_SORT_ORDER.map((k, i) => [k, i]));
  return [...rows].sort((a, b) => {
    const ka = orderMap.get(String(a.status || "").toLowerCase()) ?? 99;
    const kb = orderMap.get(String(b.status || "").toLowerCase()) ?? 99;
    if (ka !== kb) return ka - kb;
    return b.count - a.count;
  });
}

function buildDailySeries(salesRows, periodDays, endDate = new Date()) {
  const byKey = {};
  (salesRows || []).forEach((r) => {
    const raw = r.date || r.CreatedAt;
    const key = typeof raw === "string" ? raw.slice(0, 10) : "";
    if (!key) return;
    byKey[key] = {
      revenue: Number(r.revenue ?? 0),
      orders: Number(r.orders ?? 0),
    };
  });

  const out = [];
  for (let i = periodDays - 1; i >= 0; i--) {
    const d = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - i);
    const key = fmtYmd(d);
    const bucket = byKey[key] || { revenue: 0, orders: 0 };
    const invalid = Number.isNaN(d.getTime());
    out.push({
      dateKey: key,
      revenue: bucket.revenue,
      orders: bucket.orders,
      xLabel: invalid
        ? "—"
        : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      dateLong: invalid ? key : d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" }),
    });
  }
  return out;
}

function RevenueTooltip({ active, payload, mode }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur-sm"
      style={{
        borderColor: mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)",
        background: mode === "dark" ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.95)",
      }}
    >
      <p className="font-semibold text-slate-800 dark:text-slate-100">{row.dateLong}</p>
      <p className="mt-1 tabular-nums text-slate-600 dark:text-slate-300">
        Revenue:{" "}
        <span className="font-semibold text-slate-900 dark:text-white">{formatUsdFull(row.revenue || 0)}</span>
      </p>
      <p className="mt-0.5 tabular-nums text-slate-500 dark:text-slate-400">Orders: {row.orders ?? 0}</p>
    </div>
  );
}

function StatusTooltip({ active, payload, mode }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur-sm"
      style={{
        borderColor: mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)",
        background: mode === "dark" ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.95)",
      }}
    >
      <p className="font-semibold text-slate-800 dark:text-slate-100">{row.label}</p>
      <p className="mt-1 tabular-nums text-slate-600 dark:text-slate-300">
        Orders in period:{" "}
        <span className="font-semibold text-slate-900 dark:text-white">{row.count}</span>
      </p>
    </div>
  );
}

function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0 }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const target = Number(value) || 0;
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReducedMotion) {
      setDisplayValue(target);
      return undefined;
    }

    let raf = 0;
    const start = performance.now();
    const duration = 620;
    setDisplayValue(0);

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const formatted = displayValue.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return <>{prefix}{formatted}{suffix}</>;
}

function StatCard({ title, value, sub, icon, accentIndex = 0, iconBoxStyle, to, linkHint }) {
  const inner = (
    <Card
      className="admin-spectrum-kpi relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 p-5"
      style={{ borderTop: "3px solid var(--admin-kpi-accent, var(--admin-primary))" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground/80">{sub}</p>}
          {to && linkHint ? (
            <p className="mt-2 text-xs font-semibold text-primary">
              {linkHint} →
            </p>
          ) : null}
        </div>
        <div
          className="admin-stat-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border shadow-xs"
          style={iconBoxStyle}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
      </div>
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="block no-underline" aria-label={`${title} — ${linkHint || title}`}>
        {inner}
      </Link>
    );
  }

  return <div>{inner}</div>;
}

function CardChrome({ title, description, action, children, animationDelay }) {
  return (
    <Card
      className="fade-in-up w-full min-w-0 overflow-hidden shadow-sm"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function PeriodTabs({ days, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-muted/60 p-0.5">
      {days.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all " +
            (value === d
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { user, can, canPath, permissionsReady } = useAdminPermissions();
  const canViewReports = can("reports", "view");
  const canViewOrders = can("orders", "view");
  const { primaryColor, mode } = useTheme();
  const { isSpectrum, iconBoxStyle, barFill } = useAdminAccents();
  const { t } = useLanguage();
  const gid = useId().replace(/:/g, "");

  const initialSnapshot = readDashboardSnapshot(30);

  const [periodDays, setPeriodDays] = useState(30);
  const [numberFormat] = useAdminUiPreference("dashboard.numberFormat", ADMIN_NUMBER_FORMAT.COMPACT);

  /* ── Chart resize state (xl col-span, max 3 in the 3-col grid) ── */
  const [revenueSpan, setRevenueSpan] = useAdminUiPreference("charts.dashboard.revenueSpan", 2);
  const [statusSpan, setStatusSpan] = useAdminUiPreference("charts.dashboard.statusSpan", 1);

  const [stats, setStats] = useState(initialSnapshot?.stats ?? DEFAULT_STATS);
  const [salesSeriesRaw, setSalesSeriesRaw] = useState(initialSnapshot?.salesSeriesRaw ?? []);
  const [recentOrders, setRecentOrders] = useState(initialSnapshot?.recentOrders ?? []);
  const [loading, setLoading] = useState(() => !initialSnapshot);
  /** After first successful load, period changes refetch in-place (no full-page skeleton flash). */
  const hasLoadedOnceRef = useRef(false);
  /** First paint only: Recharts enter animation. Later updates swap data without re-animating from zero. */
  const [chartEnterAnim, setChartEnterAnim] = useState(true);

  const chartGridColor = mode === "dark" ? "rgba(148, 163, 184, 0.1)" : "rgba(15, 23, 42, 0.06)";
  const chartAxisLine = mode === "dark" ? "#334155" : "#e2e8f0";
  const chartTickColor = mode === "dark" ? "#94a3b8" : "#64748b";

  const barTop = useMemo(() => shadeHex(primaryColor, true, 0.35), [primaryColor]);
  const barBottom = useMemo(() => shadeHex(primaryColor, false, 0.25), [primaryColor]);

  useEffect(() => {
    let cancelled = false;
    const cached = readDashboardSnapshot(periodDays);
    const skipFullScreenLoad = hasLoadedOnceRef.current || Boolean(cached);

    if (cached) {
      setStats(cached.stats ?? DEFAULT_STATS);
      setSalesSeriesRaw(cached.salesSeriesRaw ?? []);
      setRecentOrders(cached.recentOrders ?? []);
      setLoading(false);
    } else if (!skipFullScreenLoad) {
      setLoading(true);
    }

    if (!permissionsReady) {
      return () => {
        cancelled = true;
      };
    }

    if (!canViewReports) {
      if (!cancelled) {
        setSalesSeriesRaw([]);
        setStats((prev) => ({ ...prev, ordersByStatus: [] }));
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const requests = [
          api.get("/admin/reports/dashboard", { params: { period: periodDays } }),
          api.get("/admin/reports/sales", { params: { period: periodDays } }),
        ];
        if (canViewOrders) {
          requests.push(api.get("/admin/orders", { params: { per_page: 8, compact: 1 } }));
        }

        const results = await Promise.all(requests);
        const dashRes = results[0];
        const salesRes = results[1];
        const ordersRes = canViewOrders ? results[2] : null;

        const d = dashRes.data || {};
        const ordersByStatus = Array.isArray(d.orders_by_status) ? d.orders_by_status : [];

        const salesPayload = salesRes.data?.sales || salesRes.data?.data?.rows || salesRes.data?.data || [];
        const salesArr = Array.isArray(salesPayload) ? salesPayload : [];
        const nextRecentOrders = ordersRes?.data?.data?.slice(0, 8) || [];

        const nextStats = {
          revenue: d.revenue || { total: 0, month: 0, today: 0 },
          ordersHead: d.orders || { total: 0, pending: 0, processing: 0, completed: 0 },
          ordersByStatus,
          products: d.products || { total: 0, active: 0, low_stock: 0 },
          customers: d.customers || { total: 0, new_this_month: 0 },
        };

        if (!cancelled) {
          setStats(nextStats);
          setSalesSeriesRaw(salesArr);
          setRecentOrders(nextRecentOrders);
          writeAdminCache(adminCacheKey("dashboard-v2", periodDays), {
            stats: nextStats,
            salesSeriesRaw: salesArr,
            recentOrders: nextRecentOrders,
          });
        }
      } catch {
        if (!cancelled && !cached) {
          setSalesSeriesRaw([]);
          setStats((prev) => ({ ...prev, ordersByStatus: [] }));
          setRecentOrders([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          hasLoadedOnceRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [periodDays, permissionsReady, canViewReports, canViewOrders]);

  useEffect(() => {
    if (loading) return undefined;
    setChartEnterAnim(false);
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setChartEnterAnim(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [loading, periodDays, salesSeriesRaw, stats.ordersByStatus]);

  const chartData = useMemo(() => buildDailySeries(salesSeriesRaw, periodDays), [salesSeriesRaw, periodDays]);

  const statusBars = useMemo(() => {
    const rows = sortStatusRows(
      stats.ordersByStatus.map((r) => ({
        status: r.status,
        count: Number(r.count || 0),
        label: formatStatusLabel(r.status),
      }))
    ).filter((r) => r.count > 0);
    return rows;
  }, [stats.ordersByStatus]);

  if (!permissionsReady) {
    return <AdminContentSkeleton lines={3} imageHeight={220} />;
  }

  if (!canViewReports) {
    return <Navigate to={getFirstAccessibleAdminPath(user)} replace />;
  }

  if (loading && !hasLoadedOnceRef.current && !readDashboardSnapshot(periodDays)) {
    return <AdminContentSkeleton lines={3} imageHeight={220} />;
  }

  const pctActive =
    stats.products.total > 0 ? Math.round((stats.products.active / stats.products.total) * 100) : null;

  const statCards = [
    {
      id: "kpi-revenue",
      title: `${t('dashboardRevenue')} (${periodDays}d)`,
      value:
        numberFormat === ADMIN_NUMBER_FORMAT.FULL ? (
          <AnimatedNumber value={stats.revenue.total || 0} prefix="$" decimals={2} />
        ) : (
          formatUsd(stats.revenue.total || 0, numberFormat)
        ),
      sub: (
        <>
          {t('dashboardToday')} ·{" "}
          {numberFormat === ADMIN_NUMBER_FORMAT.FULL ? (
            <AnimatedNumber value={stats.revenue.today || 0} prefix="$" decimals={2} />
          ) : (
            formatUsd(stats.revenue.today || 0, numberFormat)
          )}
        </>
      ),
      icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      to: canPath("/admin/reports") ? "/admin/reports" : null,
    },
    {
      id: "kpi-mtd",
      title: t('dashboardMonthToDate'),
      value:
        numberFormat === ADMIN_NUMBER_FORMAT.FULL ? (
          <AnimatedNumber value={stats.revenue.month || 0} prefix="$" decimals={2} />
        ) : (
          formatUsd(stats.revenue.month || 0, numberFormat)
        ),
      sub: <>{t('dashboardNewCustomers')} ({periodDays}d): <AnimatedNumber value={stats.customers.new_this_month ?? 0} /></>,
      icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
      to: canPath("/admin/reports") ? "/admin/reports" : null,
    },
    {
      id: "kpi-orders",
      title: `${t('dashboardOrders')} (${periodDays}d)`,
      value:
        numberFormat === ADMIN_NUMBER_FORMAT.FULL ? (
          <AnimatedNumber value={stats.ordersHead.total || 0} />
        ) : (
          formatNumber(stats.ordersHead.total || 0, numberFormat)
        ),
      sub: (
        <>
          {numberFormat === ADMIN_NUMBER_FORMAT.FULL
            ? <AnimatedNumber value={stats.ordersHead.pending ?? 0} />
            : formatNumber(stats.ordersHead.pending ?? 0, numberFormat)}{" "}
          {t('dashboardPending')} ·{" "}
          {numberFormat === ADMIN_NUMBER_FORMAT.FULL
            ? <AnimatedNumber value={stats.ordersHead.completed ?? 0} />
            : formatNumber(stats.ordersHead.completed ?? 0, numberFormat)}{" "}
          {t('dashboardCompleted')}
        </>
      ),
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
      to: canPath("/admin/orders") ? "/admin/orders" : null,
    },
    {
      id: "kpi-customers",
      title: t('dashboardCustomersTotal'),
      value:
        numberFormat === ADMIN_NUMBER_FORMAT.FULL ? (
          <AnimatedNumber value={stats.customers.total || 0} />
        ) : (
          formatNumber(stats.customers.total || 0, numberFormat)
        ),
      sub: pctActive !== null ? <>{t('dashboardCatalog')} · <AnimatedNumber value={pctActive} suffix="%" /> {t('dashboardProductsActive')}</> : t('dashboardRegisteredAccounts'),
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
      to: canPath("/admin/customers") ? "/admin/customers" : null,
    },
  ];

  const gradientId = `dash-rev-${gid}`;
  const barGradId = `dash-bar-${gid}`;

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* KPI */}
      <div className="admin-stat-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((c, index) => (
          <StatCard
            key={c.id}
            title={c.title}
            value={c.value}
            sub={c.sub}
            icon={c.icon}
            accentIndex={index}
            iconBoxStyle={iconBoxStyle(index)}
            to={c.to}
            linkHint={c.to ? t("dashboardViewDetails") : undefined}
          />
        ))}
      </div>

      {/* Charts — dynamic col-spans controlled by resize menus */}
      <div className="grid w-full min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
        <div
          className="min-w-0"
          style={{ gridColumn: `span ${revenueSpan}` }}
        >
          <CardChrome
            title={t('dashboardDailyRevenueTrend')}
            description={`${t('dashboardNetSettledSales')} · ${t('dashboardLast')} ${periodDays} ${t('dashboardDays')}`}
            animationDelay={300}
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <PeriodTabs days={[7, 30, 90]} value={periodDays} onChange={setPeriodDays} />
                {canViewReports ? (
                <Link
                  to="/admin/reports"
                  className="rounded-lg border admin-border px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-[rgba(var(--admin-primary-rgb),0.08)] dark:text-slate-300 dark:hover:bg-[rgba(var(--admin-primary-rgb),0.12)]"
                >
                  {t('dashboardFullReports')}
                </Link>
                ) : null}
                <ChartResizeMenu colSpan={revenueSpan} maxCols={3} onChange={setRevenueSpan} />
              </div>
            }
          >
            <div className="h-[min(22rem,calc(100vw-5rem))] min-h-[280px] w-full px-2 pb-2 pt-1 md:px-4 [&_.recharts-surface]:outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={primaryColor} stopOpacity={0.42} />
                      <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartGridColor} strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="xLabel"
                    tick={{ fill: chartTickColor, fontSize: 11 }}
                    axisLine={{ stroke: chartAxisLine }}
                    tickLine={{ stroke: chartAxisLine }}
                    interval={periodDays >= 45 ? Math.floor(periodDays / 10) : periodDays > 14 ? 3 : 1}
                    minTickGap={8}
                    height={28}
                    angle={periodDays > 31 ? -32 : 0}
                    textAnchor={periodDays > 31 ? "end" : "middle"}
                    dy={periodDays > 31 ? 4 : 0}
                  />
                  <YAxis
                    tickFormatter={(v) => formatUsd(v, numberFormat)}
                    tick={{ fill: chartTickColor, fontSize: 11 }}
                    axisLine={{ stroke: chartAxisLine }}
                    tickLine={{ stroke: chartAxisLine }}
                    width={62}
                    domain={[0, "auto"]}
                  />
                  <Tooltip content={<RevenueTooltip mode={mode} />} wrapperStyle={{ outline: "none" }} animationDuration={200} />
                  <Area
                    type="natural"
                    dataKey="revenue"
                    stroke={primaryColor}
                    strokeWidth={2.25}
                    fill={`url(#${gradientId})`}
                    activeDot={{
                      r: 5,
                      fill: primaryColor,
                      stroke: mode === "dark" ? "#0f172a" : "#fff",
                      strokeWidth: 2,
                    }}
                    animationDuration={chartEnterAnim ? 720 : 0}
                    animationEasing="ease-out"
                    isAnimationActive={chartEnterAnim}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardChrome>
        </div>

        {/* Orders by status */}
        <div
          className="flex min-w-0 flex-col gap-4"
          style={{ gridColumn: `span ${statusSpan}` }}
        >
          <CardChrome
            title={t('dashboardOrdersByStatus')}
            description={t('dashboardOrdersPlacedInPeriod')}
            animationDelay={360}
            action={<ChartResizeMenu colSpan={statusSpan} maxCols={3} onChange={setStatusSpan} />}
          >
            <div className="h-[min(22rem,calc(100vw-6rem))] min-h-[240px] w-full px-2 pb-2 pt-1 md:px-4 [&_.recharts-surface]:outline-none">
              {statusBars.length === 0 ? (
                <div className="flex h-[240px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  No order data this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusBars} margin={{ top: 10, right: 12, left: 4, bottom: 4 }} barCategoryGap={16}>
                    <defs>
                      <linearGradient id={barGradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={barTop} />
                        <stop offset="100%" stopColor={barBottom} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={chartGridColor} strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: chartTickColor, fontSize: 10 }}
                      axisLine={{ stroke: chartAxisLine }}
                      tickLine={{ stroke: chartAxisLine }}
                      interval={0}
                      height={56}
                      angle={statusBars.length > 4 ? -28 : 0}
                      textAnchor={statusBars.length > 4 ? "end" : "middle"}
                      tickMargin={statusBars.length > 4 ? 6 : 4}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: chartTickColor, fontSize: 11 }}
                      axisLine={{ stroke: chartAxisLine }}
                      tickLine={{ stroke: chartAxisLine }}
                      width={38}
                      domain={[0, "auto"]}
                    />
                    <Tooltip content={<StatusTooltip mode={mode} />} cursor={{ fill: "rgba(var(--admin-primary-rgb),0.06)" }} animationDuration={200} />
                    <Bar
                      dataKey="count"
                      fill={isSpectrum ? barFill(0) : `url(#${barGradId})`}
                      radius={[10, 10, 4, 4]}
                      maxBarSize={44}
                      animationDuration={chartEnterAnim ? 680 : 0}
                      animationEasing="ease-out"
                      isAnimationActive={chartEnterAnim}
                    >
                      {isSpectrum
                        ? statusBars.map((row, index) => (
                            <Cell key={row.status ?? index} fill={barFill(index)} />
                          ))
                        : null}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardChrome>
        </div>
      </div>

      {/* Recent Orders */}
      <CardChrome title={t('dashboardRecentOrders')} description={t('dashboardRecentActivity')} animationDelay={460}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('dashboardOrder')}
              </TableHead>
              <TableHead className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('dashboardCustomer')}
              </TableHead>
              <TableHead className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('dashboardAmount')}
              </TableHead>
              <TableHead className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('dashboardStatus')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
                  {t('dashboardNoRecentOrders')}
                </TableCell>
              </TableRow>
            ) : (
              recentOrders.map((order) => (
                <TableRow
                  key={order.id}
                  className="transition-colors hover:bg-muted/50"
                >
                  <TableCell className="px-5 py-3.5 font-medium text-foreground">#{order.order_number}</TableCell>
                  <TableCell className="px-5 py-3.5 text-muted-foreground">{order.user_name || t('guest')}</TableCell>
                  <TableCell className="px-5 py-3.5 tabular-nums text-foreground font-semibold">
                    ${Number(order.total || 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="px-5 py-3.5">
                    <StatusBadge status={order.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {canViewOrders ? (
        <div className="border-t border-border px-5 py-3 text-right">
          <Link
            to="/admin/orders"
            className="text-xs font-semibold text-primary hover:underline transition-colors"
          >
            {t('dashboardViewAllOrders')} →
          </Link>
        </div>
        ) : null}
      </CardChrome>

      <style>{`
        @keyframes fade-in-up-dash {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in-up {
          opacity: 0;
          animation: fade-in-up-dash 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    delivered: { label: "Delivered", variant: "success" },
    completed: { label: "Completed", variant: "success" },
    shipped: { label: "Shipped", variant: "secondary" },
    processing: { label: "Processing", variant: "warning" },
    pending: { label: "Pending", variant: "secondary" },
    paid: { label: "Paid", variant: "success" },
    cancelled: { label: "Cancelled", variant: "destructive" },
    canceled: { label: "Cancelled", variant: "destructive" },
    pending_payment: { label: "Pending payment", variant: "secondary" },
  };
  const key = (status || "pending").toLowerCase();
  const hit = map[key] || { label: status || "Unknown", variant: "secondary" };
  return (
    <Badge variant={hit.variant} className="capitalize">
      {hit.label}
    </Badge>
  );
}
