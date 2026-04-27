import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LOT_TYPE_LABELS, LOT_STATUS_LABELS, OPERATOR_LABELS } from "@/types/database";
import type { LotType, LotStatus, OperatorType } from "@/types/database";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-success/10 text-success border-success/20",
  inactive: "bg-muted text-muted-foreground border-muted",
  construction: "bg-warning/10 text-warning border-warning/20",
  closed: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function LotsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const { data: lots, isLoading } = useQuery({
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
    return result;
  }, [lots, search, typeFilter, statusFilter, operatorFilter]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">주차장 관리</h2>
          <Button size="sm" onClick={() => navigate("/lots/new")}>
            <Plus className="h-4 w-4 mr-1" /> 신규 등록
          </Button>
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
                    {paged.map((lot) => (
                      <tr
                        key={lot.id}
                        onClick={() => navigate(`/lots/${lot.id}`)}
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
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
