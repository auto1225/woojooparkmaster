import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface DateRangeValidatorProps {
  startLabel?: string;
  endLabel?: string;
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  startId?: string;
  endId?: string;
}

export function DateRangeValidator({
  startLabel = "시작일",
  endLabel = "종료일",
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  startId = "start-date",
  endId = "end-date",
}: DateRangeValidatorProps) {
  const hasError = startValue && endValue && new Date(endValue) <= new Date(startValue);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={startId} className="text-xs">{startLabel}</Label>
          <Input
            id={startId}
            type="date"
            value={startValue}
            onChange={(e) => onStartChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={endId} className="text-xs">{endLabel}</Label>
          <Input
            id={endId}
            type="date"
            value={endValue}
            onChange={(e) => onEndChange(e.target.value)}
            className={hasError ? "border-destructive focus-visible:ring-destructive" : ""}
          />
        </div>
      </div>
      {hasError && (
        <p className="text-[10px] text-destructive">종료일은 시작일 이후여야 합니다</p>
      )}
    </div>
  );
}
