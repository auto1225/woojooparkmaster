import { Card, CardContent } from "@/components/ui/card";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { CountUp } from "@/components/common/CountUp";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: number;
  sub?: string;
  icon: LucideIcon;
  color: string;
  trend?: number[];
  trendDirection?: "up" | "down" | "flat";
  changePercent?: number;
  suffix?: string;
}

export function KPICard({ title, value, sub, icon: Icon, color, trend, trendDirection, changePercent, suffix }: KPICardProps) {
  const trendColor = trendDirection === "up" ? "text-success" : trendDirection === "down" ? "text-destructive" : "text-muted-foreground";
  const trendBg = trendDirection === "up" ? "bg-success/10" : trendDirection === "down" ? "bg-destructive/10" : "bg-sunken";
  const lineColor = trendDirection === "up" ? "hsl(160,84%,39%)" : trendDirection === "down" ? "hsl(0,72%,51%)" : "hsl(221,83%,53%)";

  return (
    <Card className="hover-lift border border-border/60 shadow-xs hover:shadow-premium-md">
      <CardContent className="p-5">
        {/* Top row: label + icon + change badge */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color}`}>
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">{title}</span>
          </div>
          {changePercent !== undefined && (
            <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${trendColor} ${trendBg}`}>
              {trendDirection === "up" && <TrendingUp className="h-3 w-3" />}
              {trendDirection === "down" && <TrendingDown className="h-3 w-3" />}
              {trendDirection === "flat" && <Minus className="h-3 w-3" />}
              {changePercent > 0 ? "+" : ""}{changePercent.toFixed(1)}%
            </div>
          )}
        </div>

        {/* Value + sparkline */}
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="font-display text-kpi text-foreground tabular-nums">
              <CountUp end={value} suffix={suffix} />
            </div>
            {sub && <p className="text-caption text-muted-foreground mt-2">{sub}</p>}
          </div>
          {trend && trend.length > 1 && (
            <ResponsiveContainer width={64} height={28}>
              <LineChart data={trend.map((v, i) => ({ v, i }))}>
                <Line type="monotone" dataKey="v" stroke={lineColor} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
