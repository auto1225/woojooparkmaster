/** P6-7: 비교 가능한 KPI 카드 */
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { CountUp } from "@/components/common/CountUp";
import { calcChange } from "@/lib/compare-utils";
import type { LucideIcon } from "lucide-react";

interface CompareKPIProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
  suffix?: string;
  compareValue?: number;
  comparePeriodLabel?: string;
  prevValue?: number;
  prevLabel?: string;
  format?: 'number' | 'currency' | 'percent';
}

export function CompareKPI({ title, value, icon: Icon, color, suffix, compareValue, comparePeriodLabel, prevValue, prevLabel, format }: CompareKPIProps) {
  const change = prevValue !== undefined ? calcChange(value, prevValue) : undefined;
  const compareChange = compareValue !== undefined ? calcChange(value, compareValue) : undefined;

  const formatVal = (v: number) => {
    if (format === 'currency') return `${(v / 10000).toFixed(0)}만원`;
    if (format === 'percent') return `${v.toFixed(1)}%`;
    return v.toLocaleString();
  };

  return (
    <Card className="hover-lift border border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs text-muted-foreground font-medium">{title}</span>
        </div>
        <div className="font-display text-xl font-bold text-foreground tabular-nums">
          <CountUp end={value} suffix={suffix} />
        </div>

        {change && (
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[10px] text-muted-foreground">{prevLabel || '전월비'}:</span>
            <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${change.direction === 'up' ? 'text-emerald-600' : change.direction === 'down' ? 'text-red-500' : 'text-muted-foreground'}`}>
              {change.direction === 'up' && <TrendingUp className="h-2.5 w-2.5" />}
              {change.direction === 'down' && <TrendingDown className="h-2.5 w-2.5" />}
              {change.direction === 'flat' && <Minus className="h-2.5 w-2.5" />}
              {change.formatted}
            </span>
          </div>
        )}

        {compareChange && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-muted-foreground">{comparePeriodLabel || '비교'}:</span>
            <span className={`text-[10px] font-semibold ${compareChange.direction === 'up' ? 'text-emerald-600' : compareChange.direction === 'down' ? 'text-red-500' : 'text-muted-foreground'}`}>
              {compareChange.formatted}
            </span>
          </div>
        )}

        {compareValue !== undefined && (
          <div className="mt-2 flex gap-1 items-end h-3">
            <div className="bg-primary rounded-sm h-full" style={{ width: `${Math.min(100, (value / Math.max(value, compareValue)) * 100)}%`, minWidth: 4 }} />
            <div className="bg-muted rounded-sm h-full" style={{ width: `${Math.min(100, (compareValue / Math.max(value, compareValue)) * 100)}%`, minWidth: 4 }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
