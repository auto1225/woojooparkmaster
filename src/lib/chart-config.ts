export const CHART_COLORS = {
  primary: ["#2563EB", "#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE"],
  categorical: ["#2563EB", "#16A34A", "#F59E0B", "#DC2626", "#8B5CF6", "#06B6D4", "#EC4899", "#F97316"],
  sequential: ["#EFF6FF", "#BFDBFE", "#93C5FD", "#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF"],
  status: { active: "#16A34A", warning: "#F59E0B", danger: "#DC2626", info: "#2563EB", muted: "#94A3B8" },
  congestion: { empty: "#16A34A", normal: "#2563EB", crowded: "#F59E0B", full: "#DC2626" },
};

export function getChartTheme(isDark: boolean) {
  return {
    axisColor: isDark ? "#64748B" : "#94A3B8",
    gridColor: isDark ? "#334155" : "#E2E8F0",
    textColor: isDark ? "#CBD5E1" : "#64748B",
    tooltipBg: isDark ? "#1E293B" : "#FFFFFF",
    tooltipBorder: isDark ? "#475569" : "#E2E8F0",
    tooltipText: isDark ? "#F8FAFC" : "#1A1A1A",
  };
}

export function formatAxisWon(value: number): string {
  if (value >= 100000000) return (value / 100000000).toFixed(0) + "억";
  if (value >= 10000) return (value / 10000).toFixed(0) + "만";
  return value.toLocaleString();
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  isDark?: boolean;
  valueFormatter?: (v: number) => string;
}

export function ChartTooltipContent({ active, payload, label, isDark = false, valueFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const theme = getChartTheme(isDark);
  return (
    <div style={{
      background: theme.tooltipBg,
      border: `1px solid ${theme.tooltipBorder}`,
      borderRadius: 8,
      padding: 12,
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    }}>
      <p style={{ fontWeight: 600, marginBottom: 4, color: theme.tooltipText, fontSize: 13 }}>{label}</p>
      {payload.map((item: any, i: number) => (
        <p key={i} style={{ color: item.color, fontSize: 12 }}>
          {item.name}: {valueFormatter ? valueFormatter(item.value) : item.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}
