import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, BarChart3, Search, ArrowUpDown } from "lucide-react";
import { SURVEY_STATUS_LABELS, SURVEY_STATUS_COLORS, SURVEY_TYPE_LABELS } from "@/types/survey";
import type { SurveyStatus } from "@/types/survey";
import { NewSurveyDialog } from "@/components/survey/NewSurveyDialog";

type SortOption = "date" | "name_asc" | "spaces_desc" | "dong" | "lot_type" | "fee";

const SORT_LABELS: Record<SortOption, string> = {
  date: "조사일순",
  name_asc: "가나다순",
  spaces_desc: "주차면 많은순",
  dong: "행정동별",
  lot_type: "주차장유형별",
  fee: "유료/무료별",
};

const LOT_TYPE_ORDER: Record<string, number> = {
  onstreet: 0,
  offstreet: 1,
  multilevel: 2,
  vacant_lot: 3,
  underground: 4,
};

const LOT_TYPE_LABEL: Record<string, string> = {
  onstreet: "노상",
  offstreet: "노외",
  multilevel: "복층화",
  vacant_lot: "공한지",
  underground: "지하",
};

// Road-name addresses that don't start with 동 name - map to their administrative dong
const ROAD_TO_DONG: Record<string, string> = {
  "다호북길": "도두1동",
  "동광로": "삼도2동",
  "동문로": "일도1동",
  "산지로": "건입동",
  "용두암길": "용담1동",
  "원노형": "노형동",
  "고마로": "이도2동",
};

function extractDong(address?: string | null): string {
  if (!address) return "";
  // Try jibun-style: "노형동 1234"
  const jibunMatch = address.match(/^([가-힣]+\d*[동읍면리])/);
  if (jibunMatch) {
    // Normalize: 아라일동 -> 아라1동, 아라이동 -> 아라2동, etc.
    let dong = jibunMatch[1];
    dong = dong.replace("일동", "1동").replace("이동", "2동").replace("삼동", "3동");
    return dong;
  }
  // Try road-name: "다호북길 7 외 3필지"
  for (const [road, dong] of Object.entries(ROAD_TO_DONG)) {
    if (address.startsWith(road) || address.includes(road)) return dong;
  }
  return address.split(" ")[0] || "";
}

export default function SurveysPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: surveys, isLoading } = useQuery({
    queryKey: ["surveys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("surveys")
        .select("*, parking_lots(code, name, address_jibun, lot_type, total_spaces, fee_policy), surveyor:profiles!surveys_surveyor_id_fkey(name)")
        .order("survey_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!surveys) return [];
    let result = surveys.filter((s: any) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (typeFilter !== "all" && s.survey_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const lot = s.parking_lots as any;
        if (!lot?.name?.toLowerCase().includes(q) && !lot?.code?.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    // Sort
    result = [...result].sort((a: any, b: any) => {
      const lotA = a.parking_lots as any;
      const lotB = b.parking_lots as any;

      switch (sortBy) {
        case "name_asc":
          return (lotA?.name || "").localeCompare(lotB?.name || "", "ko");
        case "spaces_desc":
          return (lotB?.total_spaces || 0) - (lotA?.total_spaces || 0);
        case "dong": {
          const dongA = extractDong(lotA?.address_jibun);
          const dongB = extractDong(lotB?.address_jibun);
          return dongA.localeCompare(dongB, "ko");
        }
        case "lot_type": {
          const orderA = LOT_TYPE_ORDER[lotA?.lot_type] ?? 99;
          const orderB = LOT_TYPE_ORDER[lotB?.lot_type] ?? 99;
          return orderA - orderB;
        }
        case "fee": {
          const feeA = lotA?.fee_policy === "free" ? 0 : 1;
          const feeB = lotB?.fee_policy === "free" ? 0 : 1;
          return feeA - feeB;
        }
        case "date":
        default:
          return (b.survey_date || "").localeCompare(a.survey_date || "");
      }
    });

    return result;
  }, [surveys, statusFilter, typeFilter, search, sortBy]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">현황조사</h2>
            <p className="text-sm text-muted-foreground">총 {filtered.length}건</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/surveys/progress")}>
              <BarChart3 className="h-4 w-4 mr-1" /> 진행률 현황
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> 신규 조사
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="주차장명/코드 검색" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  {(Object.keys(SURVEY_STATUS_LABELS) as SurveyStatus[]).map(k => (
                    <SelectItem key={k} value={k}>{SURVEY_STATUS_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 유형</SelectItem>
                  {Object.entries(SURVEY_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={v => { setSortBy(v as SortOption); setPage(0); }}>
                <SelectTrigger className="w-[160px] h-9">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SORT_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">코드</TableHead>
                    <TableHead>주차장명</TableHead>
                    <TableHead className="w-[70px]">유형</TableHead>
                    <TableHead className="w-[70px]">주차장</TableHead>
                    <TableHead className="w-[80px]">주차면</TableHead>
                    <TableHead className="w-[90px]">조사일</TableHead>
                    <TableHead className="w-[80px]">조사자</TableHead>
                    <TableHead className="w-[80px]">상태</TableHead>
                    <TableHead className="w-[90px]">제출일</TableHead>
                    <TableHead className="w-[90px]">승인일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">조사 데이터가 없습니다</TableCell></TableRow>
                  ) : paged.map((s: any, idx: number) => {
                    const lot = s.parking_lots as any;
                    const currentDong = extractDong(lot?.address_jibun);
                    const prevLot = idx > 0 ? (paged[idx - 1] as any).parking_lots as any : null;
                    const prevDong = prevLot ? extractDong(prevLot?.address_jibun) : null;
                    const showDongHeader = sortBy === "dong" && currentDong !== prevDong;

                    return (
                      <>
                        {showDongHeader && (
                          <TableRow key={`dong-${currentDong}-${idx}`} className="bg-muted/60 hover:bg-muted/60">
                            <TableCell colSpan={10} className="py-2 font-semibold text-sm text-primary">
                              📍 {currentDong}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow key={s.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/surveys/${s.id}`)}>
                          <TableCell className="font-mono text-xs">{lot?.code}</TableCell>
                          <TableCell className="text-sm font-medium">{lot?.name}</TableCell>
                          <TableCell className="text-xs">{SURVEY_TYPE_LABELS[s.survey_type] || s.survey_type}</TableCell>
                          <TableCell className="text-xs">{LOT_TYPE_LABEL[lot?.lot_type] || lot?.lot_type || "-"}</TableCell>
                          <TableCell className="text-xs text-right">{lot?.total_spaces?.toLocaleString() || "-"}</TableCell>
                          <TableCell className="text-xs">{s.survey_date || "-"}</TableCell>
                          <TableCell className="text-xs">{(s.surveyor as any)?.name || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${SURVEY_STATUS_COLORS[s.status as SurveyStatus] || ""}`}>
                              {SURVEY_STATUS_LABELS[s.status as SurveyStatus]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString("ko") : "-"}</TableCell>
                          <TableCell className="text-xs">{s.approved_at ? new Date(s.approved_at).toLocaleDateString("ko") : "-"}</TableCell>
                        </TableRow>
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>이전</Button>
            <span className="text-sm self-center">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>다음</Button>
          </div>
        )}
      </div>

      <NewSurveyDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </DashboardLayout>
  );
}