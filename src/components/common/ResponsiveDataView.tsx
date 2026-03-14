import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent } from "@/components/ui/card";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
}

interface ResponsiveDataViewProps<T> {
  columns: Column<T>[];
  data: T[];
  mobileCardRenderer: (item: T, index: number) => ReactNode;
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function ResponsiveDataView<T extends { id?: string }>({
  columns,
  data,
  mobileCardRenderer,
  onRowClick,
  isLoading,
  emptyMessage = "데이터가 없습니다",
}: ResponsiveDataViewProps<T>) {
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  // Mobile card view
  if (isMobile) {
    return (
      <div className="space-y-3">
        {data.map((item, i) => (
          <div
            key={(item as any).id || i}
            onClick={() => onRowClick?.(item)}
            className={onRowClick ? "cursor-pointer" : ""}
          >
            {mobileCardRenderer(item, i)}
          </div>
        ))}
      </div>
    );
  }

  // Desktop table view
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {columns.map((col) => (
              <th key={col.key} className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, i) => (
            <tr
              key={(item as any).id || i}
              className={`border-b last:border-0 ${onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}`}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <td key={col.key} className="py-2.5 px-3">
                  {col.render ? col.render(item) : String((item as any)[col.key] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
