import { Badge } from "@/components/ui/badge";

interface DateQuickFilterProps {
  onSelect: (start: string, end: string) => void;
  selected?: string;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function DateQuickFilter({ onSelect, selected }: DateQuickFilterProps) {
  const today = new Date();

  const options = [
    {
      key: "today", label: "오늘",
      range: () => [formatDate(today), formatDate(today)],
    },
    {
      key: "week", label: "이번 주",
      range: () => {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        return [formatDate(start), formatDate(today)];
      },
    },
    {
      key: "month", label: "이번 달",
      range: () => {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return [formatDate(start), formatDate(today)];
      },
    },
    {
      key: "quarter", label: "이번 분기",
      range: () => {
        const qMonth = Math.floor(today.getMonth() / 3) * 3;
        const start = new Date(today.getFullYear(), qMonth, 1);
        return [formatDate(start), formatDate(today)];
      },
    },
    {
      key: "year", label: "올해",
      range: () => {
        const start = new Date(today.getFullYear(), 0, 1);
        return [formatDate(start), formatDate(today)];
      },
    },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <Badge
          key={opt.key}
          variant={selected === opt.key ? "default" : "outline"}
          className="cursor-pointer text-[10px] px-2 py-0.5"
          onClick={() => {
            const [s, e] = opt.range();
            onSelect(s, e);
          }}
        >
          {opt.label}
        </Badge>
      ))}
    </div>
  );
}
