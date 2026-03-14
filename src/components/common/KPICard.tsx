import { Card, CardContent } from "@/components/ui/card";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  color: string;
  trend?: number[];
  trendDirection?: "up" | "down" | "flat";
  changePercent?: number;
}

export function KPICard({ title, value, sub, icon: Icon, color, trend, trendDirection, changePercent }: KPICardProps) {
  const trendColor = trendDirection === "up" ? "text-success" : trendDirection === "down" ? "text-destructive" : "text-muted-foreground";
  const lineColor = trendDirection === "up" ? "hsl(152,55%,38%)" : trendDirection === "down" ? "hsl(0,72%,51%)" : "hsl(211,65%,45%)";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">{title}</span>
          <div className={`h-8 w-8 rounded-md flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
          </div>
          {trend && trend.length > 1 && (
            <div className="flex flex-col items-end gap-1">
              <ResponsiveContainer width={60} height={28}>
                <LineChart data={trend.map((v, i) => ({ v, i }))}>
                  <Line type="monotone" dataKey="v" stroke={lineColor} strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              {changePercent !== undefined && (
                <div className={`flex items-center gap-0.5 text-[10px] font-medium ${trendColor}`}>
                  {trendDirection === "up" && <TrendingUp className="h-3 w-3" />}
                  {trendDirection === "down" && <TrendingDown className="h-3 w-3" />}
                  {trendDirection === "flat" && <Minus className="h-3 w-3" />}
                  {changePercent > 0 ? "+" : ""}{changePercent.toFixed(1)}%
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
