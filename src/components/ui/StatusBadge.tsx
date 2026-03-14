import { cn } from "@/lib/utils";

type StatusVariant =
  | "active" | "inactive" | "construction" | "closed"
  | "draft" | "surveying" | "submitted" | "reviewing" | "approved" | "rejected"
  | "empty" | "normal" | "crowded" | "full"
  | "low" | "medium" | "high" | "urgent"
  | "pending" | "in_progress" | "completed" | "cancelled"
  | "expired" | "suspended";

type BadgeSize = "sm" | "md" | "lg";

const VARIANT_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  active:       { dot: "bg-success",         text: "text-success",       bg: "bg-success/10" },
  inactive:     { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted" },
  construction: { dot: "bg-warning",         text: "text-warning",       bg: "bg-warning/10" },
  closed:       { dot: "bg-destructive",     text: "text-destructive",   bg: "bg-destructive/10" },
  draft:        { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted" },
  surveying:    { dot: "bg-info",            text: "text-info",          bg: "bg-info/10" },
  submitted:    { dot: "bg-warning",         text: "text-warning",       bg: "bg-warning/10" },
  reviewing:    { dot: "bg-purple-500",      text: "text-purple-600",    bg: "bg-purple-500/10" },
  approved:     { dot: "bg-success",         text: "text-success",       bg: "bg-success/10" },
  rejected:     { dot: "bg-destructive",     text: "text-destructive",   bg: "bg-destructive/10" },
  empty:        { dot: "bg-success",         text: "text-success",       bg: "bg-success/10" },
  normal:       { dot: "bg-info",            text: "text-info",          bg: "bg-info/10" },
  crowded:      { dot: "bg-warning",         text: "text-warning",       bg: "bg-warning/10" },
  full:         { dot: "bg-destructive",     text: "text-destructive",   bg: "bg-destructive/10" },
  low:          { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-transparent" },
  medium:       { dot: "bg-info",            text: "text-info",          bg: "bg-transparent" },
  high:         { dot: "bg-warning",         text: "text-warning",       bg: "bg-warning/10" },
  urgent:       { dot: "bg-destructive",     text: "text-destructive",   bg: "bg-destructive/10" },
  pending:      { dot: "bg-warning",         text: "text-warning",       bg: "bg-warning/10" },
  in_progress:  { dot: "bg-info",            text: "text-info",          bg: "bg-info/10" },
  completed:    { dot: "bg-success",         text: "text-success",       bg: "bg-success/10" },
  cancelled:    { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted" },
  expired:      { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted" },
  suspended:    { dot: "bg-warning",         text: "text-warning",       bg: "bg-warning/10" },
};

const SIZE_MAP: Record<BadgeSize, { container: string; dot: string; text: string }> = {
  sm: { container: "px-2 py-0.5", dot: "h-1.5 w-1.5", text: "text-[11px]" },
  md: { container: "px-2.5 py-1",  dot: "h-1.5 w-1.5", text: "text-[13px]" },
  lg: { container: "px-3 py-1.5",  dot: "h-2 w-2",     text: "text-sm" },
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  size?: BadgeSize;
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({ status, label, size = "md", pulse, className }: StatusBadgeProps) {
  const variant = VARIANT_STYLES[status] || VARIANT_STYLES.inactive;
  const sizeStyle = SIZE_MAP[size];
  const shouldPulse = pulse || status === "full" || status === "urgent";

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
      variant.bg, variant.text, sizeStyle.container, sizeStyle.text,
      className,
    )}>
      <span className={cn(
        "rounded-full shrink-0",
        variant.dot, sizeStyle.dot,
        shouldPulse && (status === "full" ? "pulse-dot-fast" : "pulse-dot"),
      )} />
      {label || status}
    </span>
  );
}
