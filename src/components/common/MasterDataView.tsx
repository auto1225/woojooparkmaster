import { useEffect, useState, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { AlertTriangle, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Printer, Columns3, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, RefreshCw, X } from "lucide-react";
import { createProfessionalExcel, masterColumnToExcelColumn, type ExcelSheetConfig as ProfExcelSheetConfig } from "@/lib/excel-engine";
import { exportMasterExcel, type ExcelSheetConfig } from "@/lib/master-excel-export";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { stableMultiSort, type NullPlacement } from "@/lib/list-sorting";
import { useAuthorization } from "@/hooks/useAuthorization";

export interface MasterColumn {
  key: string;
  label: string;
  group?: string;
  width?: number;
  format?: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'boolean' | 'badge';
  align?: 'left' | 'center' | 'right';
  sticky?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  hidden?: boolean;
  badgeMap?: Record<string, { label: string; color: string }>;
  booleanLabels?: { true: string; false: string };
  tooltip?: string;
  subTotal?: 'sum' | 'avg' | 'count' | 'max' | 'min';
}

export interface FilterDef {
  key: string;
  label: string;
  type: 'select' | 'daterange' | 'text';
  options?: { value: string; label: string }[];
}

interface MasterDataViewProps {
  title: string;
  subtitle?: string;
  columns: MasterColumn[];
  data: Record<string, any>[];
  loading: boolean;
  groupBy?: string;
  frozenColumns?: number;
  exportFileName: string;
  exportSheets?: ExcelSheetConfig[];
  printTitle?: string;
  printUrl?: string;
  filterConfig?: FilterDef[];
  onRowClick?: (row: Record<string, any>) => void;
  error?: boolean;
  onRetry?: () => void;
  moduleCode?: string;
}

const GROUP_COLORS: Record<string, string> = {
  '기본정보': 'bg-blue-50 dark:bg-blue-950/30',
  '기본현황': 'bg-blue-50 dark:bg-blue-950/30',
  '운영현황': 'bg-green-50 dark:bg-green-950/30',
  '인프라현황': 'bg-orange-50 dark:bg-orange-950/30',
  '이용현황': 'bg-purple-50 dark:bg-purple-950/30',
  '수입현황': 'bg-red-50 dark:bg-red-950/30',
  '센서설치계획': 'bg-teal-50 dark:bg-teal-950/30',
  '조사메타': 'bg-slate-50 dark:bg-slate-950/30',
};

function formatCell(value: any, col: MasterColumn): React.ReactNode {
  if ((value == null || value === '') && col.format === 'badge' && col.badgeMap?.__unassigned) {
    const badge = col.badgeMap.__unassigned;
    return <Badge className={`text-[10px] ${badge.color}`}>{badge.label}</Badge>;
  }
  if (value == null || value === '') return <span className="text-muted-foreground">-</span>;
  switch (col.format) {
    case 'currency':
      return <span className="font-mono">{Number(value).toLocaleString()}</span>;
    case 'number':
      return <span className="font-mono">{typeof value === 'number' ? value.toLocaleString() : value}</span>;
    case 'percent':
      return <span>{typeof value === 'number' ? `${value.toFixed(1)}%` : value}</span>;
    case 'date':
      return <span>{typeof value === 'string' ? value.split('T')[0] : value}</span>;
    case 'boolean': {
      const labels = col.booleanLabels || { true: '○', false: '×' };
      const isTrue = value === true || value === 'true' || value === 1;
      return <span className={isTrue ? 'text-green-600 font-bold' : 'text-muted-foreground'}>{isTrue ? labels.true : labels.false}</span>;
    }
    case 'badge': {
      if (col.badgeMap && col.badgeMap[value]) {
        const b = col.badgeMap[value];
        return <Badge className={`text-[10px] ${b.color}`}>{b.label}</Badge>;
      }
      return <Badge variant="outline" className="text-[10px]">{value}</Badge>;
    }
    default:
      return <span>{String(value)}</span>;
  }
}

function calcSubTotal(data: Record<string, any>[], col: MasterColumn): string {
  if (!col.subTotal) return '';
  const vals = data
    .map((row) => row[col.key])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite);
  switch (col.subTotal) {
    case 'sum': return vals.reduce((a, b) => a + b, 0).toLocaleString();
    case 'avg': return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '0';
    case 'count': return vals.length.toString();
    case 'max': return vals.length ? Math.max(...vals).toLocaleString() : '0';
    case 'min': return vals.length ? Math.min(...vals).toLocaleString() : '0';
    default: return '';
  }
}

export function MasterDataView({
  title, subtitle, columns, data, loading, frozenColumns = 3,
  exportFileName, exportSheets, printTitle, printUrl, filterConfig, onRowClick, error = false, onRetry, moduleCode,
}: MasterDataViewProps) {
  const { data: config } = useSystemConfig();
  const { canExport } = useAuthorization(moduleCode);
  const orgName = config?.org_name || '';
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [secondarySortKey, setSecondarySortKey] = useState<string>('none');
  const [secondarySortDir, setSecondarySortDir] = useState<'asc' | 'desc'>('asc');
  const [nullPlacement, setNullPlacement] = useState<NullPlacement>('last');
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => 
    new Set(columns.filter(c => !c.hidden).map(c => c.key))
  );
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const activeFilterCount = Object.values(filters).filter(v => v && v !== '__all__').length;

  const visibleColumns = columns.filter(c => visibleCols.has(c.key));

  // Groups for 2-level header
  const groups = useMemo(() => {
    const g: { name: string; cols: MasterColumn[] }[] = [];
    let current = '';
    visibleColumns.forEach(c => {
      const grp = c.group || '';
      if (grp !== current) {
        g.push({ name: grp, cols: [c] });
        current = grp;
      } else {
        g[g.length - 1].cols.push(c);
      }
    });
    return g;
  }, [visibleColumns]);

  // Filter + search + sort
  const processed = useMemo(() => {
    let result = [...data];
    // Search
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r =>
        visibleColumns.some(c => String(r[c.key] ?? '').toLowerCase().includes(s))
      );
    }
    // Filters
    Object.entries(filters).forEach(([key, val]) => {
      if (val && val !== '__all__') {
        result = result.filter((row) => val === '__unassigned'
          ? row[key] == null || row[key] === ''
          : String(row[key]) === val);
      }
    });
    // Sort
    if (sortKey) result = stableMultiSort(result, [
      { value: (row) => row[sortKey], direction: sortDir },
      ...(secondarySortKey !== 'none' && secondarySortKey !== sortKey
        ? [{ value: (row: Record<string, any>) => row[secondarySortKey], direction: secondarySortDir }]
        : []),
    ], nullPlacement);
    return result;
  }, [data, search, filters, sortKey, sortDir, secondarySortKey, secondarySortDir, nullPlacement, visibleColumns]);

  const hasSubTotals = visibleColumns.some(c => c.subTotal);
  const pageCount = Math.max(1, Math.ceil(processed.length / pageSize));
  const paged = processed.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, filters, sortKey, sortDir, secondarySortKey, secondarySortDir, nullPlacement, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleColumn = (key: string) => {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setVisibleCols(next);
  };

  const toggleGroupColumns = (groupName: string, checked: boolean) => {
    const next = new Set(visibleCols);
    columns.filter(c => c.group === groupName).forEach(c => {
      if (checked) next.add(c.key);
      else next.delete(c.key);
    });
    setVisibleCols(next);
  };

  const handleExcel = async (mode: 'current' | 'full' | 'multi') => {
    const targetCols = mode === 'current' ? visibleColumns : columns;
    try {
      await createProfessionalExcel({
        fileName: exportFileName,
        orgName,
        title: printTitle || title,
        subtitle: subtitle,
        sheets: mode === 'multi' && exportSheets
          ? exportSheets.map(s => ({
              name: s.name.slice(0, 31),
              columns: s.columns.map(c => masterColumnToExcelColumn(c)),
              data: s.data,
              totalRow: s.columns.some(c => c.subTotal) ? { label: '합 계', labelColIndex: 0 } : undefined,
              extraCalcRows: s.columns.some(c => c.subTotal) ? [{ label: '평 균', formula: 'AVERAGE' as const, labelColIndex: 0 }] : undefined,
            }))
          : [{
              name: (printTitle || title).slice(0, 31),
              columns: targetCols.map(c => masterColumnToExcelColumn(c)),
              data: processed,
              totalRow: targetCols.some(c => c.subTotal) ? { label: '합 계', labelColIndex: 0 } : undefined,
              extraCalcRows: targetCols.some(c => c.subTotal) ? [{ label: '평 균', formula: 'AVERAGE' as const, labelColIndex: 0 }] : undefined,
            }],
      });
    } catch {
      // Fallback to legacy export
      await exportMasterExcel({
        fileName: exportFileName,
        orgName,
        title: printTitle || title,
        columns: targetCols,
        data: processed,
        mode,
        sheets: exportSheets,
      });
    }
  };

  const colGroups = useMemo(() => {
    const m = new Map<string, MasterColumn[]>();
    columns.forEach(c => {
      const g = c.group || '기타';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(c);
    });
    return m;
  }, [columns]);

  const getStickyLeft = (colIdx: number) => {
    if (colIdx >= frozenColumns) return undefined;
    let left = 0;
    for (let i = 0; i < colIdx; i++) {
      left += visibleColumns[i]?.width || 120;
    }
    return left;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">총 {processed.length}건</Badge>
          
          {/* Column selector */}
          <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm"><Columns3 className="h-3.5 w-3.5 mr-1" />컬럼 선택</Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 max-h-80 overflow-y-auto" align="end">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">표시할 컬럼</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="컬럼 선택 닫기" onClick={() => setColumnPickerOpen(false)}><X className="h-3.5 w-3.5" /></Button>
                </div>
                {Array.from(colGroups.entries()).map(([grp, cols]) => (
                  <div key={grp}>
                    <div className="flex items-center gap-2 mb-1">
                      <Checkbox
                        checked={cols.every(c => visibleCols.has(c.key))}
                        onCheckedChange={(c) => toggleGroupColumns(grp, !!c)}
                      />
                      <span className="text-xs font-semibold">{grp}</span>
                    </div>
                    <div className="pl-5 space-y-1">
                      {cols.map(c => (
                        <label key={c.key} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={visibleCols.has(c.key)} onCheckedChange={() => toggleColumn(c.key)} />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Excel dropdown */}
          {canExport ? <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><FileSpreadsheet className="h-3.5 w-3.5 mr-1" />엑셀</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExcel('current')}>현재 화면 엑셀</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExcel('full')}>전체 항목 엑셀</DropdownMenuItem>
              {exportSheets && <DropdownMenuItem onClick={() => handleExcel('multi')}>멀티시트 분석 엑셀</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu> : null}

          {canExport && printUrl && (
            <Button variant="outline" size="sm" onClick={() => window.open(printUrl, '_blank')}>
              <FileText className="h-3.5 w-3.5 mr-1" />PDF
            </Button>
          )}
          {canExport ? <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5 mr-1" />인쇄
          </Button> : null}
        </div>
      </div>

      {/* Filters */}
      {filterConfig && filterConfig.length > 0 && (
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-3.5 w-3.5 mr-1" />
            필터 {activeFilterCount > 0 && <Badge className="ml-1 text-[10px]">{activeFilterCount}</Badge>}
          </Button>
          {showFilters && (
            <div className="flex flex-wrap gap-3 items-end p-3 bg-muted/30 rounded-lg">
              {filterConfig.map(f => (
                <div key={f.key} className="w-40">
                  <label className="text-xs text-muted-foreground">{f.label}</label>
                  {f.type === 'select' && f.options ? (
                    <Select value={filters[f.key] || '__all__'} onValueChange={v => setFilters({ ...filters, [f.key]: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">전체</SelectItem>
                        {f.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input className="h-8 text-xs" value={filters[f.key] || ''} onChange={e => setFilters({ ...filters, [f.key]: e.target.value })} />
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setFilters({})}>
                <X className="h-3 w-3 mr-1" />초기화
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Search and detailed sorting */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-xs" placeholder="전체 컬럼 검색..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={sortKey || 'none'} onValueChange={(value) => setSortKey(value === 'none' ? null : value)}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="1차 정렬 기준"><SelectValue placeholder="1차 정렬" /></SelectTrigger>
          <SelectContent><SelectItem value="none">기본 순서</SelectItem>{columns.filter(c => c.sortable !== false).map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="h-8 px-2" aria-label="1차 정렬 방향" disabled={!sortKey} onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>
          {sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
        </Button>
        <Select value={secondarySortKey} onValueChange={setSecondarySortKey}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="2차 정렬 기준"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">2차 정렬 없음</SelectItem>{columns.filter(c => c.sortable !== false && c.key !== sortKey).map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="h-8 px-2" aria-label="2차 정렬 방향" disabled={secondarySortKey === 'none'} onClick={() => setSecondarySortDir(d => d === 'asc' ? 'desc' : 'asc')}>
          {secondarySortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
        </Button>
        <Select value={nullPlacement} onValueChange={(value) => setNullPlacement(value as NullPlacement)}>
          <SelectTrigger className="h-8 w-28 text-xs" aria-label="빈값 정렬"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="last">빈값 뒤로</SelectItem><SelectItem value="first">빈값 앞으로</SelectItem></SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : error ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 border py-8 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <div><p className="text-sm font-medium">종합 자료를 불러오지 못했습니다</p><p className="mt-1 text-xs text-muted-foreground">0건이 아니라 조회 실패 상태입니다.</p></div>
          {onRetry ? <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="mr-1 h-3.5 w-3.5" />다시 조회</Button> : null}
        </div>
      ) : processed.length === 0 ? (
        <EmptyState icon={Search} title="조회 결과가 없습니다" />
      ) : (
        <div ref={tableRef} className="border rounded-lg overflow-x-auto max-h-[calc(100vh-280px)]" style={{ position: 'relative' }}>
          <table className="w-max min-w-full text-sm border-collapse">
            {/* Group headers */}
            <thead className="sticky top-0 z-20">
              {groups.some(g => g.name) && (
                <tr>
                  {groups.map((g, gi) => (
                    <th
                      key={gi}
                      colSpan={g.cols.length}
                      className={`px-2 py-1.5 text-xs font-semibold text-center border-b border-r ${GROUP_COLORS[g.name] || 'bg-muted/50'}`}
                    >
                      {g.name}
                    </th>
                  ))}
                </tr>
              )}
              <tr>
                {visibleColumns.map((col, ci) => {
                  const isSticky = ci < frozenColumns;
                  const left = getStickyLeft(ci);
                  return (
                    <th
                      key={col.key}
                      className={`px-3 py-2 text-xs font-medium text-muted-foreground border-b border-r bg-background whitespace-nowrap cursor-pointer select-none hover:bg-muted/50 ${isSticky ? 'sticky z-30' : ''}`}
                      style={{
                        width: col.width || 120,
                        minWidth: col.width || 120,
                        left: isSticky ? left : undefined,
                        textAlign: col.align || (col.format === 'currency' || col.format === 'number' ? 'right' : 'left'),
                      }}
                      onClick={() => (col.sortable !== false) && handleSort(col.key)}
                      title={col.tooltip}
                    >
                      <div className="flex items-center gap-1 justify-between">
                        <span>{col.label}</span>
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : col.sortable !== false ? (
                          <ArrowUpDown className="h-3 w-3 opacity-30" />
                        ) : null}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, ri) => (
                <tr
                  key={row.id || `${page}-${ri}`}
                  className={`border-b hover:bg-primary/[0.03] ${ri % 2 === 1 ? 'bg-muted/20' : ''} ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick?.(row)}
                  onKeyDown={(event) => { if (onRowClick && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onRowClick(row); } }}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick ? `${title} ${row._no || (page - 1) * pageSize + ri + 1}번 상세 열기` : undefined}
                >
                  {visibleColumns.map((col, ci) => {
                    const isSticky = ci < frozenColumns;
                    const left = getStickyLeft(ci);
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-2 whitespace-nowrap border-r text-xs ${isSticky ? 'sticky bg-background z-10' : ''} ${ri % 2 === 1 && isSticky ? 'bg-muted/20' : ''}`}
                        style={{
                          left: isSticky ? left : undefined,
                          textAlign: col.align || (col.format === 'currency' || col.format === 'number' ? 'right' : col.format === 'boolean' || col.format === 'date' || col.format === 'percent' || col.format === 'badge' ? 'center' : 'left'),
                        }}
                      >
                        {formatCell(row[col.key], col)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {/* Sub-totals */}
            {hasSubTotals && (
              <tfoot className="sticky bottom-0 z-20">
                <tr className="bg-[#1B3A5C] text-white font-bold">
                  {visibleColumns.map((col, ci) => {
                    const isSticky = ci < frozenColumns;
                    const left = getStickyLeft(ci);
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-2 text-xs whitespace-nowrap border-r border-[#2a4f73] ${isSticky ? 'sticky z-30 bg-[#1B3A5C]' : ''}`}
                        style={{
                          left: isSticky ? left : undefined,
                          textAlign: col.align || (col.format === 'currency' || col.format === 'number' ? 'right' : 'left'),
                        }}
                      >
                        {ci === 0 ? '합계' : col.subTotal ? calcSubTotal(processed, col) : ''}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {!loading && !error && processed.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pb-14 pr-16 pt-3 text-xs text-muted-foreground md:pb-0">
          <span>{processed.length.toLocaleString()}건 중 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, processed.length)}건</span>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger aria-label="페이지당 행 수" className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="50">50건씩</SelectItem><SelectItem value="100">100건씩</SelectItem></SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="이전 페이지" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-16 text-center tabular-nums">{page} / {pageCount}</span>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="다음 페이지" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
