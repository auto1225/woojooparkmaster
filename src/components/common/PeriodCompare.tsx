/** P6-7: 기간 비교 공통 컴포넌트 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowLeftRight } from "lucide-react";
import { getCompareRange, formatDateKR } from "@/lib/compare-utils";

interface PeriodCompareProps {
  currentStart: Date;
  currentEnd: Date;
  onCompareChange: (compareStart: Date, compareEnd: Date, type: string) => void;
  onCompareOff?: () => void;
}

export function PeriodCompare({ currentStart, currentEnd, onCompareChange, onCompareOff }: PeriodCompareProps) {
  const [enabled, setEnabled] = useState(false);
  const [compareType, setCompareType] = useState("prevMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const handleToggle = () => {
    if (enabled) {
      setEnabled(false);
      onCompareOff?.();
    } else {
      setEnabled(true);
      const range = getCompareRange(compareType, currentStart, currentEnd);
      onCompareChange(range.start, range.end, compareType);
    }
  };

  const handleTypeChange = (type: string) => {
    setCompareType(type);
    if (type === 'custom') return;
    const range = getCompareRange(type, currentStart, currentEnd);
    onCompareChange(range.start, range.end, type);
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onCompareChange(new Date(customStart), new Date(customEnd), 'custom');
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={handleToggle}
        className="text-xs gap-1"
      >
        <ArrowLeftRight className="h-3 w-3" />
        비교
      </Button>
      {enabled && (
        <>
          <Select value={compareType} onValueChange={handleTypeChange}>
            <SelectTrigger className="w-28 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="prevMonth">전월</SelectItem>
              <SelectItem value="prevQuarter">전분기</SelectItem>
              <SelectItem value="prevYear">전년 동기</SelectItem>
              <SelectItem value="custom">직접 선택</SelectItem>
            </SelectContent>
          </Select>
          {compareType === 'custom' && (
            <div className="flex items-center gap-1">
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-7 text-xs w-32" />
              <span className="text-xs text-muted-foreground">~</span>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-7 text-xs w-32" />
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleCustomApply}>적용</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
