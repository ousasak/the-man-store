/** Modern Luxury palette for charts (Obsidian, Gold, Royal Blue, Emerald, Amber, Slate). */
export const REPORT_CHART_COLORS = [
  "#0F172A",
  "#C59B27",
  "#2563EB",
  "#059669",
  "#D97706",
  "#475569",
  "#854D0E",
];

export const REPORT_CLUSTER = {
  primary: "#0F172A",
  secondary: "#C59B27",
};

function hexToRgb(hex, fallback = "15, 23, 42") {
  const h = String(hex || "").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/i.test(h)) return fallback;
  return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
}

export function paletteColorAt(palette, index = 0) {
  const colors = palette?.length ? palette : REPORT_CHART_COLORS;
  const n = colors.length;
  return colors[((index % n) + n) % n];
}

export function reportChartColor(index = 0, palette) {
  return paletteColorAt(palette, index);
}

/** @param {'light' | 'dark'} mode */
export function getReportChartTheme(mode, options = {}) {
  const isDark = mode === "dark";
  const palette = options.palette?.length >= 2
    ? options.palette
    : [options.primaryColor, ...REPORT_CHART_COLORS].filter(Boolean);
  const primary = options.primaryColor || palette[0] || REPORT_CHART_COLORS[0];
  const secondary = palette[1] || primary;
  const rgb = hexToRgb(primary);

  return {
    isDark,
    pageBg: "transparent",
    cardBg: isDark ? "var(--admin-card-bg, #161B22)" : "#ffffff",
    cardBorder: isDark ? "transparent" : "rgba(226, 232, 240, 0.8)",
    cardShadow: isDark
      ? "0 1px 2px rgba(1,4,9,0.6), 0 10px 26px rgba(1,4,9,0.42)"
      : `0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(${rgb},0.08)`,
    panelBg: isDark ? "var(--admin-elevated, #21262D)" : "#F8FAFC",
    panelHeaderBg: isDark ? "rgba(33,38,45,0.92)" : "#F1F5F9",
    title: isDark ? "var(--admin-heading, #F0F6FC)" : "#0F172A",
    subtitle: isDark ? "var(--admin-muted, #8B949E)" : "#64748B",
    grid: isDark ? "rgba(139, 148, 158, 0.16)" : "rgba(148, 163, 184, 0.2)",
    axis: isDark ? "rgba(139, 148, 158, 0.38)" : "#E2E8F0",
    tick: isDark ? "var(--admin-muted, #8B949E)" : "#94A3B8",
    cursor: isDark ? `rgba(${rgb},0.18)` : `rgba(${rgb},0.08)`,
    tooltipBg: isDark ? "rgba(22,27,34,0.98)" : "#ffffff",
    tooltipBorder: isDark ? "var(--admin-card-border, #30363D)" : "#E2E8F0",
    pillValueBg: isDark ? "rgba(148, 163, 184, 0.12)" : "#F1F5F9",
    donutStroke: isDark ? "var(--admin-elevated, #21262D)" : "#ffffff",
    barRadius: [6, 6, 0, 0],
    barRadiusH: [0, 6, 6, 0],
    accentColor: primary,
    accentSecondary: secondary,
    sectionAccentGradient: `linear-gradient(to bottom, ${primary}, ${secondary})`,
    palette,
    chartColor: (index = 0) => paletteColorAt(palette, index),
  };
}

export const reportAxisTick = (theme) => ({
  fill: theme.tick,
  fontSize: 11,
  fontWeight: 500,
});

export const reportAxisLine = (theme) => ({
  stroke: theme.axis,
});
