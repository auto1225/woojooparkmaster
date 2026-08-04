import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LOT_TYPE_LABELS, LOT_STATUS_LABELS, OPERATOR_LABELS } from "@/types/database";
import type { LotType, LotStatus, OperatorType } from "@/types/database";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-success/10 text-success border-success/20",
  inactive: "bg-muted text-muted-foreground border-muted",
  construction: "bg-warning/10 text-warning border-warning/20",
  closed: "bg-destructive/10 text-destructive border-destructive/20",
};

type SortKey = "code" | "name" | "lot_type" | "total_spaces" | "updated_at" | "status";
const PAGE_SIZE = 20;

function isSortKey(value: string | null): value is SortKey {
  return ["code", "name", "lot_type", "total_spaces", "updated_at", "status"].includes(value || "");
}

export default function LotsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [typeFilter, setTypeFilter] = useState(() => searchParams.get("type") || searchParams.get("lotType") || "all");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "all");
  const [operatorFilter, setOperatorFilter] = useState(() => searchParams.get("operator") || "all");
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const requested = searchParams.get("sort");
    return isSortKey(requested) ? requested : "code";
  });
  const [sortAscending, setSortAscending] = useState(() => searchParams.get("direction") !== "desc");
  const [page, setPage] = useState(() => Math.max(0, Number(searchParams.get("page") || 1) - 1));

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set("search", search);
    if (typeFilter !== "all") next.set("type", typeFilter);
    if (statusFilter !== "all") next.set("status", statusFilter);
    if (operatorFilter !== "all") next.set("operator", operatorFilter);
    if (sortKey !== "code") next.set("sort", sortKey);
    if (!sortAscending) next.set("direction", "desc");
    if (page > 0) next.set("page", String(page + 1));
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [operatorFilter, page, search, searchParams, setSearchParams, sortAscending, sortKey, statusFilter, typeFilter]);

  const { data: lots, isLoading, isError, error } = useQuery({
    queryKey: ["parking-lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parking_lots")
        .select("*")
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    let result = lots || [];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((l) =>
        l.name.toLowerCase().includes(q) ||
        l.address_jibun?.toLowerCase().includes(q) ||
        l.address_road?.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") result = result.filter((l) => l.lot_type === typeFilter);
    if (statusFilter !== "all") result = result.filter((l) => l.status === statusFilter);
    if (operatorFilter !== "all") result = result.filter((l) => l.operator_type === operatorFilter);
    return [...result].sort((a, b) => {
      const aValue = sortKey === "total_spaces" ? Number(a.total_spaces || 0) : String(a[sortKey] ?? "");
      const bValue = sortKey === "total_spaces" ? Number(b.total_spaces || 0) : String(b[sortKey] ?? "");
      const compared = typeof aValue === "number"
        ? aValue - (bValue as number)
        : aValue.localeCompare(bValue as string, "ko", { numeric: true, sensitivity: "base" });
      return sortAscending ? compared : -compared;
    });
  }, [lots, search, typeFilter, statusFilter, operatorFilter, sortKey, sortAscending]);

  const typeCounts = useMemo(() => ({
    offstreet: (lots || []).filter((lot) => lot.lot_type === "offstreet").length,
    multilevel: (lots || []).filter((lot) => lot.lot_type === "multilevel").length,
    onstreet: (lots || []).filter((lot) => lot.lot_type === "onstreet").length,
  }), [lots]);

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setOperatorFilter("all");
    setSortKey("code");
    setSortAscending(true);
    setPage(0);
  };

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">주차장 관리</h2>
          <Button size="sm" className="min-h-11" onClick={() => navigate("/lots/new")}>
            <Plus className="h-4 w-4 mr-1" /> 신규 등록
          </Button>
        </div>

        <div className="grid grid-cols-3 overflow-hidden border bg-card text-center">
          <button type="button" className="min-h-14 border-r px-2 py-2 hover:bg-muted/40" onClick={() => { setTypeFilter("offstreet"); setPage(0); }}>
            <span className="block text-xs text-muted-foreground">노외</span><strong>{isLoading ? "-" : typeCounts.offstreet.toLocaleString()}</strong>
          </button>
          <button type="button" className="min-h-14 border-r px-2 py-2 hover:bg-muted/40" onClick={() => { setTypeFilter("multilevel"); setPage(0); }}>
            <span className="block text-xs text-muted-foreground">주차빌딩</span><strong>{isLoading ? "-" : typeCounts.multilevel.toLocaleString()}</strong>
          </button>
          <button type="button" className="min-h-14 px-2 py-2 hover:bg-muted/40" onClick={() => { setTypeFilter("onstreet"); setPage(0); }}>
            <span className="block text-xs text-muted-foreground">노상</span><strong>{isLoading ? "-" : typeCounts.onstreet.toLocaleString()}</strong>
          </button>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="주차장명, 주소 검색..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
              </div>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="유형" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 유형</SelectItem>
                  {Object.entries(LOT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="상태" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  {Object.entries(LOT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={operatorFilter} onValueChange={(v) => { setOperatorFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="운영주체" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {Object.entries(OPERATOR_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={(value) => { setSortKey(value as SortKey); setPage(0); }}>
                <SelectTrigger className="w-[150px]" aria-label="정렬 기준"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="code">코드</SelectItem>
                  <SelectItem value="name">주차장명</SelectItem>
                  <SelectItem value="lot_type">유형</SelectItem>
                  <SelectItem value="total_spaces">주차면수</SelectItem>
                  <SelectItem value="updated_at">최근 수정일</SelectItem>
                  <SelectItem value="status">상태</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => { setSortAscending((value) => !value); setPage(0); }}
                title={sortAscending ? "오름차순" : "내림차순"}
                aria-label={sortAscending ? "오름차순" : "내림차순"}
              >
                {sortAscending ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={resetFilters} title="필터 초기화" aria-label="필터 초기화">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-xs text-muted-foreground font-mono">
              총 {filtered.length.toLocaleString()}개 주차장
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-5 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : isError ? (
              <div className="p-8 text-center">
                <p className="text-sm font-medium text-destructive">주차장 목록을 불러오지 못했습니다.</p>
                <p className="mt-1 text-xs text-muted-foreground">{error instanceof Error ? error.message : "잠시 후 다시 시도하세요."}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-5 py-2.5 font-medium text-xs text-muted-foreground">코드</th>
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">주차장명</th>
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground hidden md:table-cell">주소</th>
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">유형</th>
                      <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground hidden sm:table-cell">주차면</th>
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground hidden lg:table-cell">운영주체</th>
                      <th className="text-left px-5 py-2.5 font-medium text-xs text-muted-foreground">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-12 text-center">
                          <p className="text-sm text-muted-foreground">조건에 맞는 주차장이 없습니다.</p>
                          <Button type="button" variant="link" className="mt-1 min-h-11" onClick={resetFilters}>필터 초기화</Button>
                        </td>
                      </tr>
                    )}
                    {paged.map((lot) => (
                      <tr
                        key={lot.id}
                        onClick={() => navigate(`/lots/${lot.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            navigate(`/lots/${lot.id}`);
                          }
                        }}
                        tabIndex={0}
                        aria-label={`${lot.name} 상세 보기`}
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{lot.code}</td>
                        <td className="px-3 py-2.5 font-medium">{lot.name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs hidden md:table-cell truncate max-w-[200px]">{lot.address_jibun}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className="text-[10px] font-normal">{LOT_TYPE_LABELS[lot.lot_type as LotType]}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs hidden sm:table-cell">{(lot.total_spaces || 0).toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-xs hidden lg:table-cell">{OPERATOR_LABELS[lot.operator_type as OperatorType]}</td>
                        <td className="px-5 py-2.5">
                          <Badge variant="outline" className={`text-[10px] font-normal ${STATUS_COLORS[lot.status] || ""}`}>
                            {LOT_STATUS_LABELS[lot.status as LotStatus]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4 border-t">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button>
                <span className="text-xs text-muted-foreground font-mono">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>다음</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
