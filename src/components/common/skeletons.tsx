import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 5 }: TableSkeletonProps) {
  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex gap-3 px-4 py-3 bg-sunken rounded-t-lg">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={`h-${i}`} className="h-3 flex-1 shimmer rounded" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 px-4 py-3.5 border-b border-border/40">
          {Array.from({ length: columns }).map((_, c) => (
            <div key={`${r}-${c}`} className="h-3 flex-1 shimmer rounded" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 p-5 space-y-3">
      <div className="h-4 w-24 shimmer rounded" />
      <div className="h-8 w-32 shimmer rounded" />
      <div className="h-3 w-full shimmer rounded" />
    </div>
  );
}

export function KPISkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-[120px] rounded-xl shimmer" />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 250 }: { height?: number }) {
  return <div className="w-full rounded-xl shimmer" style={{ height }} />;
}

export function FormSkeleton() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="h-8 w-48 shimmer rounded" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-4 items-center gap-4">
            <div className="h-4 w-20 ml-auto shimmer rounded" />
            <div className="h-10 col-span-3 shimmer rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
