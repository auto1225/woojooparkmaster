import { ArrowDown, ArrowUp, ListTree, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ListControlOption {
  value: string;
  label: string;
}

interface OperationalListControlsProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  lots?: ListControlOption[];
  lotId?: string;
  onLotChange?: (value: string) => void;
  categoryLabel?: string;
  categories?: ListControlOption[];
  category?: string;
  onCategoryChange?: (value: string) => void;
  statusLabel?: string;
  statuses?: ListControlOption[];
  status?: string;
  onStatusChange?: (value: string) => void;
  sortOptions: ListControlOption[];
  sortKey: string;
  onSortKeyChange: (value: string) => void;
  sortDirection: "asc" | "desc";
  onSortDirectionChange: (value: "asc" | "desc") => void;
  secondarySortKey?: string;
  onSecondarySortKeyChange?: (value: string) => void;
  nullPlacement?: "first" | "last";
  onNullPlacementChange?: (value: "first" | "last") => void;
  groupByLot?: boolean;
  onGroupByLotChange?: (value: boolean) => void;
  resultCount: number;
  totalCount: number;
  onReset: () => void;
}

export function OperationalListControls({
  search,
  onSearchChange,
  searchPlaceholder,
  lots,
  lotId = "all",
  onLotChange,
  categoryLabel = "전체 종류",
  categories,
  category = "all",
  onCategoryChange,
  statusLabel = "전체 상태",
  statuses,
  status = "all",
  onStatusChange,
  sortOptions,
  sortKey,
  onSortKeyChange,
  sortDirection,
  onSortDirectionChange,
  secondarySortKey,
  onSecondarySortKeyChange,
  nullPlacement = "last",
  onNullPlacementChange,
  groupByLot,
  onGroupByLotChange,
  resultCount,
  totalCount,
  onReset,
}: OperationalListControlsProps) {
  return (
    <div className="space-y-2 rounded-md border bg-card p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[minmax(220px,1fr)_180px_150px_140px_180px_auto_180px_130px_auto]">
        <div className="relative sm:col-span-2 2xl:col-span-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={searchPlaceholder} value={search} onChange={(event) => onSearchChange(event.target.value)} />
        </div>
        {lots && onLotChange && (
          <Select value={lotId} onValueChange={onLotChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 주차장</SelectItem>
              {lots.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {categories && onCategoryChange && (
          <Select value={category} onValueChange={onCategoryChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{categoryLabel}</SelectItem>
              {categories.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {statuses && onStatusChange && (
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{statusLabel}</SelectItem>
              {statuses.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={sortKey} onValueChange={onSortKeyChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{sortOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title={sortDirection === "asc" ? "오름차순" : "내림차순"}
          onClick={() => onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc")}
        >
          {sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </Button>
        {onSecondarySortKeyChange && (
          <Select value={secondarySortKey || "none"} onValueChange={onSecondarySortKeyChange}>
            <SelectTrigger aria-label="2차 정렬 기준"><SelectValue placeholder="2차 정렬" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">2차 정렬 없음</SelectItem>
              {sortOptions.filter((option) => option.value !== sortKey).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {onNullPlacementChange && (
          <Select value={nullPlacement} onValueChange={(value) => onNullPlacementChange(value as "first" | "last")}>
            <SelectTrigger aria-label="빈값 정렬"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="last">빈값 뒤로</SelectItem><SelectItem value="first">빈값 앞으로</SelectItem></SelectContent>
          </Select>
        )}
        {onGroupByLotChange && (
          <Button type="button" variant={groupByLot ? "secondary" : "outline"} className="gap-1.5" onClick={() => onGroupByLotChange(!groupByLot)}>
            <ListTree className="h-4 w-4" />주차장별
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>총 {totalCount.toLocaleString()}건 중 {resultCount.toLocaleString()}건</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5" />초기화
        </Button>
      </div>
    </div>
  );
}
