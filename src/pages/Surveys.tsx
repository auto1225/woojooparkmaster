import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { runtimeConfig } from "@/config/runtime-config";
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
  multilevel: "주차빌딩",
  vacant_lot: "공한지",
  underground: "지하",
};

function getDong(lot: any): string {
  return lot?.admin_dong || "";
}

async function seedRealSurveySamples() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("로그인 세션이 없습니다.");

  const moduleRows = [
    ["CORE", "코어"], ["SURVEY", "현황조사"], ["OPS", "운영관리"], ["FACILITY", "시설관리"],
    ["REVENUE", "수입관리"], ["BUDGET", "예산관리"], ["PROCUREMENT", "입찰관리"],
    ["SERVICE", "협약사업관리"], ["COMPLAINT", "민원관리"], ["PLANNING", "신설기획"],
    ["REALTIME", "실시간정보"], ["REPORT", "보고서/통계"],
  ].map(([module_code, module_name]) => ({
    module_code,
    module_name,
    license_type: "demo",
    starts_at: new Date().toISOString().slice(0, 10),
    is_active: true,
    activated_at: new Date().toISOString(),
  }));

  const { error: licenseError } = await supabase
    .from("module_licenses")
    .upsert(moduleRows as any, { onConflict: "module_code" });
  if (licenseError) throw licenseError;

  const lotRows = [
    {
      code: "PM-REAL-001",
      name: "제주시청 공영주차장",
      address_jibun: "제주시 이도이동 1176-1",
      address_road: "제주시 광양9길 10",
      admin_dong: "이도2동",
      lot_type: "offstreet",
      total_spaces: 126,
      disabled_spaces: 4,
      ev_spaces: 6,
      operator_type: "direct",
      fee_policy: { type: "paid" },
      has_gate: true,
      has_lpr: true,
      has_cctv: true,
      has_display_board: true,
      has_sensor: true,
      status: "active",
      latitude: 33.4996,
      longitude: 126.5312,
      notes: "[REAL-SEED] 현황조사 테스트용 실제 샘플",
      created_by: user.id,
    },
    {
      code: "PM-REAL-002",
      name: "동문시장 공영주차장",
      address_jibun: "제주시 일도일동 1148-2",
      address_road: "제주시 동문로4길 9",
      admin_dong: "일도1동",
      lot_type: "multilevel",
      total_spaces: 214,
      disabled_spaces: 7,
      ev_spaces: 8,
      operator_type: "outsourced",
      operator_name: "제주주차서비스",
      fee_policy: { type: "paid" },
      has_gate: true,
      has_lpr: true,
      has_kiosk: true,
      has_cctv: true,
      has_display_board: true,
      has_sensor: true,
      status: "active",
      latitude: 33.5136,
      longitude: 126.5261,
      notes: "[REAL-SEED] 현황조사 테스트용 실제 샘플",
      created_by: user.id,
    },
    {
      code: "PM-REAL-003",
      name: "용담해안도로 공영주차장",
      address_jibun: "제주시 용담삼동 1020",
      address_road: "제주시 서해안로 352",
      admin_dong: "용담2동",
      lot_type: "onstreet",
      total_spaces: 68,
      disabled_spaces: 2,
      ev_spaces: 0,
      operator_type: "direct",
      fee_policy: { type: "free" },
      has_cctv: true,
      status: "active",
      latitude: 33.5164,
      longitude: 126.5018,
      notes: "[REAL-SEED] 현황조사 테스트용 실제 샘플",
      created_by: user.id,
    },
  ];

  const { data: lots, error: lotError } = await supabase
    .from("parking_lots")
    .upsert(lotRows as any, { onConflict: "code" })
    .select("id, code");
  if (lotError) throw lotError;
  if (!lots?.length) throw new Error("주차장 샘플 생성 결과가 없습니다.");

  const { data: existingSurveys, error: existingError } = await supabase
    .from("surveys")
    .select("id")
    .like("notes", "[REAL-SEED]%");
  if (existingError) throw existingError;
  if (existingSurveys?.length) return existingSurveys.length;

  const statusByCode: Record<string, string> = {
    "PM-REAL-001": "draft",
    "PM-REAL-002": "submitted",
    "PM-REAL-003": "approved",
  };
  const typeByCode: Record<string, string> = {
    "PM-REAL-001": "initial",
    "PM-REAL-002": "regular",
    "PM-REAL-003": "special",
  };

  const surveyRows = lots.map((lot: any, index: number) => {
    const status = statusByCode[lot.code] || "draft";
    return {
      lot_id: lot.id,
      survey_type: typeByCode[lot.code] || "regular",
      status,
      surveyor_id: user.id,
      reviewer_id: status === "approved" ? user.id : null,
      approver_id: status === "approved" ? user.id : null,
      survey_date: new Date(Date.now() - index * 86400000).toISOString().slice(0, 10),
      submitted_at: status === "submitted" || status === "approved" ? new Date().toISOString() : null,
      reviewed_at: status === "approved" ? new Date().toISOString() : null,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      notes: `[REAL-SEED] ${lot.code} 실제 샘플 현황조사`,
    };
  });

  const { data: inserted, error: surveyError } = await supabase
    .from("surveys")
    .insert(surveyRows as any)
    .select("id");
  if (surveyError) throw surveyError;
  return inserted?.length || 0;
}

export default function SurveysPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") || "all");
  const [typeFilter, setTypeFilter] = useState<string>(searchParams.get("type") || "all");
  const [sortBy, setSortBy] = useState<SortOption>((searchParams.get("sort") as SortOption) || "date");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [seedStatus, setSeedStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [seedMessage, setSeedMessage] = useState("");
  const [seedAttempt, setSeedAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: surveys, isLoading, isError, error } = useQuery({
    queryKey: ["surveys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("surveys")
        .select("*, parking_lots(code, name, address_jibun, admin_dong, lot_type, total_spaces, fee_policy), surveyor:profiles!surveys_surveyor_id_fkey(name)")
        .order("survey_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (statusFilter !== "all") next.set("status", statusFilter);
    if (typeFilter !== "all") next.set("type", typeFilter);
    if (sortBy !== "date") next.set("sort", sortBy);
    setSearchParams(next, { replace: true });
  }, [search, setSearchParams, sortBy, statusFilter, typeFilter]);

  useEffect(() => {
    if (runtimeConfig.deploymentMode !== "development") return;
    if (isLoading || !surveys || surveys.length > 0 || seedStatus === "running" || seedStatus === "done" || seedAttempt >= 2) return;

    setSeedAttempt((attempt) => attempt + 1);
    setSeedStatus("running");
    setSeedMessage("실제 Supabase 테이블에 샘플 데이터를 생성하고 있습니다.");
    seedRealSurveySamples()
      .then((count) => {
        setSeedStatus("done");
        setSeedMessage(`실제 샘플 데이터 ${count}건을 생성했습니다.`);
        queryClient.invalidateQueries({ queryKey: ["module-licenses"] });
        queryClient.invalidateQueries({ queryKey: ["surveys"] });
      })
      .catch((error: any) => {
        setSeedStatus("error");
        setSeedMessage(error?.message || "실제 샘플 데이터 생성에 실패했습니다.");
      });
  }, [isLoading, queryClient, seedAttempt, seedStatus, surveys]);

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
          const dongA = getDong(lotA);
          const dongB = getDong(lotB);
          return dongA.localeCompare(dongB, "ko");
        }
        case "lot_type": {
          const orderA = LOT_TYPE_ORDER[lotA?.lot_type] ?? 99;
          const orderB = LOT_TYPE_ORDER[lotB?.lot_type] ?? 99;
          return orderA - orderB;
        }
        case "fee": {
          const feeA = lotA?.fee_policy?.type === "free" ? 0 : 1;
          const feeB = lotB?.fee_policy?.type === "free" ? 0 : 1;
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
        {seedStatus !== "idle" && (
          <Card className={seedStatus === "error" ? "border-destructive/40" : "border-primary/30"}>
            <CardContent className="py-3 text-sm">
              {seedMessage}
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="주차장명/코드 검색" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9 h-11 md:h-9" />
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
            ) : isError ? (
              <div className="p-8 text-center">
                <p className="text-sm font-medium text-destructive">현황조사 목록을 불러오지 못했습니다.</p>
                <p className="mt-1 text-xs text-muted-foreground">{(error as Error)?.message}</p>
              </div>
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
                    <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                      <p>조건에 맞는 조사 데이터가 없습니다.</p>
                      {(search || statusFilter !== "all" || typeFilter !== "all") && (
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); setSortBy("date"); setPage(0); }}>필터 초기화</Button>
                      )}
                    </TableCell></TableRow>
                  ) : paged.map((s: any, idx: number) => {
                    const lot = s.parking_lots as any;
                    const currentDong = getDong(lot);
                    const prevLot = idx > 0 ? (paged[idx - 1] as any).parking_lots as any : null;
                    const prevDong = prevLot ? getDong(prevLot) : null;
                    const showDongHeader = sortBy === "dong" && currentDong !== prevDong;

                    return (
                      <Fragment key={s.id ?? `${lot?.code ?? "survey"}-${idx}`}>
                        {showDongHeader && (
                          <TableRow key={`dong-${currentDong}-${idx}`} className="bg-muted/60 hover:bg-muted/60">
                            <TableCell colSpan={10} className="py-2 font-semibold text-sm text-primary">
                              📍 {currentDong}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          tabIndex={0}
                          role="link"
                          onClick={() => navigate(s.status === "submitted" || s.status === "review" ? `/surveys/${s.id}/review` : `/surveys/${s.id}`)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              navigate(s.status === "submitted" || s.status === "review" ? `/surveys/${s.id}/review` : `/surveys/${s.id}`);
                            }
                          }}
                        >
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
                      </Fragment>
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
