import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
}

export function KpiCard({ label, value, change, changeType = "neutral", icon: Icon }: KpiCardProps) {
  return (
    <div className="rounded-md border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {change && (
          <span
            className={cn(
              "text-xs font-mono mb-0.5",
              changeType === "positive" && "text-success",
              changeType === "negative" && "text-destructive",
              changeType === "neutral" && "text-muted-foreground"
            )}
          >
            {change}
          </span>
        )}
      </div>
    </div>
  );
}
