import { useParams, useNavigate } from "react-router-dom";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { LOT_TYPE_LABELS, LOT_STATUS_LABELS, OPERATOR_LABELS, SURFACE_LABELS, POWER_LABELS } from "@/types/database";
import type { LotType, LotStatus, OperatorType, SurfaceType, PowerStatus } from "@/types/database";
import { EXECUTION_TYPE_LABELS, BUDGET_STATUS_LABELS } from "@/types/budget";
import { formatManWon } from "@/types/revenue";
import { BID_STATUS_LABELS, BID_STATUS_COLORS } from "@/types/procurement";
import { CATEGORY_LABELS, COMPLAINT_STATUS_LABELS, COMPLAINT_STATUS_COLORS, isComplaintOverdue } from "@/types/complaint";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, SERVICE_TYPE_LABELS, formatServiceAmount } from "@/types/service";
import { CONGESTION_LABELS, CONGESTION_COLORS, CONGESTION_BG } from "@/types/realtime";
import { PrintButton } from "@/components/common/PrintButton";
import { PrintHeader } from "@/components/common/PrintHeader";
import { Input } from "@/components/ui/input";
import type { ParkingLotSurveyFact } from "@/types/parking-survey";
import { ArrowLeft, Pencil, Trash2, CheckCircle, XCircle, AlertTriangle, ClipboardList, Wrench } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { isModuleEnabled } from "@/lib/authorization";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-success/10 text-success border-success/20",
  inactive: "bg-muted text-muted-foreground",
  construction: "bg-warning/10 text-warning border-warning/20",
  closed: "bg-destructive/10 text-destructive border-destructive/20",
};

const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  reported: "접수", assigned: "배정", in_progress: "진행 중", pending_parts: "부품 대기", completed: "완료",
};

const SURVEY_STATUS_LABELS: Record<string, string> = {
  draft: "작성 중", in_progress: "조사 중", submitted: "제출", review: "검토 중", rejected: "반려",
};

function BoolIcon({ value }: { value: boolean }) {
  return value ? <CheckCircle className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-muted-foreground/40" />;
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-xs font-medium">{value ?? "-"}</span>
    </div>
  );
}

function BudgetTab({ lotId }: { lotId: string }) {
  const currentYear = new Date().getFullYear();

  const { data: items } = useQuery({
    queryKey: ['lot-budget-items', lotId, currentYear],
    queryFn: async () => {
      const { data: plans } = await supabase.from('budget_plans').select('id').eq('fiscal_year', currentYear);
      if (!plans?.length) return [];
      const planIds = plans.map(p => p.id);
      const { data } = await supabase.from('budget_items').select('*')
        .in('plan_id', planIds).eq('lot_id', lotId).eq('is_summary', false).eq('budget_type', 'expenditure');
      return data || [];
    },
  });

  const { data: executions } = useQuery({
    queryKey: ['lot-budget-executions', lotId, currentYear],
    queryFn: async () => {
      const { data } = await supabase.from('budget_executions')
        .select('*, budget_items(item_code, item_name, category_l1)')
        .eq('lot_id', lotId)
        .gte('execution_date', `${currentYear}-01-01`).lte('execution_date', `${currentYear}-12-31`)
        .order('execution_date', { ascending: false }).limit(10);
      return data || [];
    },
  });

  const stats = useMemo(() => {
    if (!items?.length) return { allocated: 0, executed: 0, remaining: 0 };
    return {
      allocated: items.reduce((s, i) => s + (i.allocated_amount || 0), 0),
      executed: items.reduce((s, i) => s + (i.executed_amount || 0), 0),
      remaining: items.reduce((s, i) => s + ((i.allocated_amount || 0) - (i.executed_amount || 0) - (i.returned_amount || 0)), 0),
    };
  }, [items]);

  const rate = stats.allocated > 0 ? Math.round(stats.executed / stats.allocated * 100) : 0;

  const categoryData = useMemo(() => {
    if (!items?.length) return [];
    const byL1: Record<string, { allocated: number; executed: number }> = {};
    items.forEach(i => {
      if (!byL1[i.category_l1]) byL1[i.category_l1] = { allocated: 0, executed: 0 };
      byL1[i.category_l1].allocated += i.allocated_amount || 0;
      byL1[i.category_l1].executed += i.executed_amount || 0;
    });
    return Object.entries(byL1).map(([name, v]) => ({
      name, 배정액: Math.round(v.allocated / 10000), 집행액: Math.round(v.executed / 10000),
    }));
  }, [items]);

  if (!items?.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">해당 주차장에 귀속된 예산 항목이 없습니다.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">배정액</p>
          <p className="text-lg font-bold">{formatManWon(stats.allocated)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">집행액</p>
          <p className="text-lg font-bold">{formatManWon(stats.executed)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">잔액</p>
          <p className="text-lg font-bold">{formatManWon(stats.remaining)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">집행률</p>
          <p className="text-lg font-bold">{rate}%</p>
          <Progress value={rate} className="h-1.5 mt-1" />
        </CardContent></Card>
      </div>

      {categoryData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">세출 분류별 현황 (만원)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 60 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={55} />
                <Tooltip />
                <Legend />
                <Bar dataKey="배정액" fill="hsl(var(--muted-foreground) / 0.3)" />
                <Bar dataKey="집행액" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">최근 집행 내역</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>일자</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>내용</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions?.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{e.execution_date}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{EXECUTION_TYPE_LABELS[e.execution_type] || e.execution_type}</Badge></TableCell>
                  <TableCell className="text-sm">{e.description}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{(e.amount || 0).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{BUDGET_STATUS_LABELS[e.status] || e.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!executions?.length && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">집행 내역 없음</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { data: licenses } = useModuleLicenses();
  const budgetActive = isModuleEnabled(licenses, "BUDGET");
  const procurementActive = isModuleEnabled(licenses, "PROCUREMENT");
  const serviceActive = isModuleEnabled(licenses, "SERVICE");
  const complaintActive = isModuleEnabled(licenses, "COMPLAINT");
  const realtimeActive = isModuleEnabled(licenses, "REALTIME");
  const facilityActive = isModuleEnabled(licenses, "FACILITY");
  const surveyActive = isModuleEnabled(licenses, "SURVEY");

  const { data: bidProjects } = useQuery({
    queryKey: ['lot-bid-projects', id],
    queryFn: async () => {
      const { data } = await supabase.from('bid_projects').select('id, bid_number, title, status, bid_type, estimated_amount, contract_amount, successful_bidder, bid_deadline')
        .eq('lot_id', id!).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id && procurementActive,
  });

  const { data: serviceProjects } = useQuery({
    queryKey: ['lot-service-projects', id],
    queryFn: async () => {
      const { data } = await supabase.from('service_projects')
        .select('id, project_number, title, service_type, contractor_name, start_date, end_date, progress_pct, status')
        .eq('lot_id', id!).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id && serviceActive,
  });

  const { data: lotComplaints } = useQuery({
    queryKey: ['lot-complaints', id],
    queryFn: async () => {
      const { data } = await supabase.from('complaints')
        .select('id, complaint_number, category, title, received_at, status, priority, due_date')
        .eq('lot_id', id!).order('received_at', { ascending: false }).limit(20);
      return data || [];
    },
    enabled: !!id && complaintActive,
  });

  const { data: lotMaintenance } = useQuery({
    queryKey: ['lot-open-maintenance', id],
    queryFn: async () => {
      const { data } = await supabase.from('maintenance_logs')
        .select('id, log_number, title, status, priority, reported_at, maintenance_schedules(next_due_date)')
        .eq('lot_id', id!)
        .in('status', ['reported', 'assigned', 'in_progress', 'pending_parts', 'completed'])
        .order('reported_at', { ascending: false });
      return data || [];
    },
    enabled: !!id && facilityActive,
  });

  const { data: lotSurveys } = useQuery({
    queryKey: ['lot-open-surveys', id],
    queryFn: async () => {
      const { data } = await supabase.from('surveys')
        .select('id, status, survey_date, submitted_at')
        .eq('lot_id', id!)
        .in('status', ['draft', 'in_progress', 'submitted', 'review', 'rejected'])
        .order('updated_at', { ascending: false });
      return data || [];
    },
    enabled: !!id && surveyActive,
  });

  const openWork = useMemo(() => {
    const items: Array<{ id: string; type: string; title: string; status: string; due?: string | null; route: string; overdue: boolean }> = [];
    lotComplaints?.filter((item) => !['closed', 'responded'].includes(item.status)).forEach((item) => items.push({
      id: item.id,
      type: '민원',
      title: item.title,
      status: COMPLAINT_STATUS_LABELS[item.status] || item.status,
      due: item.due_date,
      route: `/complaints/${item.id}`,
      overdue: isComplaintOverdue(item),
    }));
    lotMaintenance?.forEach((item: any) => items.push({
      id: item.id,
      type: '유지보수',
      title: item.title,
      status: MAINTENANCE_STATUS_LABELS[item.status] || item.status,
      due: item.maintenance_schedules?.next_due_date,
      route: `/facility/maintenance?work=${item.id}`,
      overdue: Boolean(item.maintenance_schedules?.next_due_date && item.maintenance_schedules.next_due_date < new Date().toISOString().slice(0, 10)),
    }));
    lotSurveys?.forEach((item) => items.push({
      id: item.id,
      type: '현황조사',
      title: '주차장 현황조사',
      status: SURVEY_STATUS_LABELS[item.status] || item.status,
      due: item.survey_date,
      route: item.status === 'submitted' || item.status === 'review' ? `/surveys/${item.id}/review` : `/surveys/${item.id}`,
      overdue: false,
    }));
    return items.sort((a, b) => Number(b.overdue) - Number(a.overdue));
  }, [lotComplaints, lotMaintenance, lotSurveys]);

  const { data: realtimeStatus } = useQuery({
    queryKey: ['lot-realtime-status', id],
    queryFn: async () => {
      const { data } = await supabase.from('lot_realtime_status').select('*').eq('lot_id', id!).maybeSingle();
      return data;
    },
    enabled: !!id && realtimeActive,
  });

  const { data: lotSensors } = useQuery({
    queryKey: ['lot-sensors-count', id],
    queryFn: async () => {
      const { data } = await supabase.from('sensor_devices').select('id, status').eq('lot_id', id!);
      return data || [];
    },
    enabled: !!id && realtimeActive,
  });

  const { data: lotGateways } = useQuery({
    queryKey: ['lot-gateways-count', id],
    queryFn: async () => {
      const { data } = await supabase.from('gateway_devices').select('id, status').eq('lot_id', id!);
      return data || [];
    },
    enabled: !!id && realtimeActive,
  });

  const { data: lotDisplays } = useQuery({
    queryKey: ['lot-displays-count', id],
    queryFn: async () => {
      const { data } = await supabase.from('display_boards').select('id, status').eq('lot_id', id!);
      return data || [];
    },
    enabled: !!id && realtimeActive,
  });

  const { data: lot, isLoading } = useQuery({
    queryKey: ["lot", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("parking_lots").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: surveyFact, isLoading: isSurveyLoading } = useQuery<ParkingLotSurveyFact | null>({
    queryKey: ["parking-lot-survey-fact", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("parking_lot_survey_facts")
        .select("*, survey_data_sources(source_code, title, publisher, contractor, report_month, source_filename, source_sha256, validation_status)")
        .eq("lot_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as ParkingLotSurveyFact | null;
    },
    enabled: !!id,
    retry: false,
  });

  const canEdit = profile && ["admin", "manager", "editor"].includes(profile.role);
  const canDelete = profile?.role === "admin";

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [relatedCounts, setRelatedCounts] = useState<Record<string, number>>({});
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [checkingRelated, setCheckingRelated] = useState(false);

  const checkRelatedData = async () => {
    if (!lot) return;
    setCheckingRelated(true);
    const counts: Record<string, number> = {};

    const relatedQueries = await Promise.all([
      supabase.from("surveys").select("id", { count: "exact", head: true }).eq("lot_id", lot.id),
      supabase.from("operations_staff").select("id", { count: "exact", head: true }).eq("lot_id", lot.id),
      supabase.from("equipment").select("id", { count: "exact", head: true }).eq("lot_id", lot.id),
      supabase.from("maintenance_logs").select("id", { count: "exact", head: true }).eq("lot_id", lot.id),
      supabase.from("parking_spaces").select("id", { count: "exact", head: true }).eq("lot_id", lot.id),
      supabase.from("revenue_daily").select("id", { count: "exact", head: true }).eq("lot_id", lot.id),
      supabase.from("complaints").select("id", { count: "exact", head: true }).eq("lot_id", lot.id),
      supabase.from("bid_projects").select("id", { count: "exact", head: true }).eq("lot_id", lot.id),
      supabase.from("service_projects").select("id", { count: "exact", head: true }).eq("lot_id", lot.id),
      supabase.from("attachments").select("id", { count: "exact", head: true })
        .eq("module", "LOT").eq("ref_id", lot.id).eq("ref_type", "official_document_link"),
    ]);
    const labels = ["현황조사", "관리인력", "시설장비", "유지보수", "주차면 배치", "수입기록", "민원", "입찰·계약", "용역사업", "공식 문서"];
    relatedQueries.forEach((result, index) => {
      if (result.count) counts[labels[index]] = result.count;
    });

    setRelatedCounts(counts);
    setCheckingRelated(false);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!lot) return;
    const { error } = await supabase.from("parking_lots").delete().eq("id", lot.id);
    if (error) {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    } else {
      await logActivity({ module: "core", action: "delete", targetType: "parking_lot", targetId: lot.id, targetName: lot.name });
      toast({ title: "삭제되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["parking-lots"] });
      navigate("/lots");
    }
  };

  const hasRelated = Object.keys(relatedCounts).length > 0;
  const canConfirmDelete = !hasRelated && deleteConfirmName === lot?.name;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4 max-w-4xl">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64" />
        </div>
      </DashboardLayout>
    );
  }

  if (!lot) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">주차장을 찾을 수 없습니다</p>
          <Button variant="outline" onClick={() => navigate("/lots")}>목록으로 돌아가기</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/lots")} className="mb-2 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> 목록
            </Button>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold">{lot.name}</h2>
              <Badge variant="outline" className="font-mono text-[10px]">{lot.code}</Badge>
              <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[lot.status] || ""}`}>
                {LOT_STATUS_LABELS[lot.status as LotStatus]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{lot.address_jibun || lot.address_road || "주소 미등록"}</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <PrintButton />
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/lots/${lot.id}/edit`)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> 수정
              </Button>
            )}
            {canDelete && (
              <>
                <Button
                  variant="outline" size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={checkRelatedData}
                  disabled={checkingRelated}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> 삭제
                </Button>
                <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirmName(""); }}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>주차장 삭제</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3">
                          {hasRelated ? (
                            <>
                              <p>이 주차장에 다음 데이터가 연결되어 있습니다:</p>
                              <ul className="list-disc list-inside text-sm space-y-1">
                                {Object.entries(relatedCounts).map(([label, count]) => (
                                  <li key={label}>{label}: <strong>{count}건</strong></li>
                                ))}
                              </ul>
                              <p className="text-destructive font-medium">행정·회계 이력 보존을 위해 삭제할 수 없습니다. 운영 상태를 폐쇄로 변경하거나 연결 데이터를 먼저 정리하세요.</p>
                            </>
                          ) : (
                            <>
                              <p>연결 데이터는 없지만 삭제하면 되돌릴 수 없습니다.</p>
                              <div className="space-y-1.5">
                                <p className="text-xs">삭제하려면 주차장명 "<strong>{lot.name}</strong>"을 입력하세요:</p>
                                <Input
                                  value={deleteConfirmName}
                                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                                  placeholder={lot.name}
                                  className="text-sm"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={!canConfirmDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {hasRelated ? "삭제 불가" : "삭제"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        <PrintHeader />

        <DocumentLinksPanel module="LOT" recordId={lot.id} recordPath={`/lots/${lot.id}`} recordTitle={lot.name} />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button variant="outline" className="min-h-11 justify-start" onClick={() => navigate(`/complaints/new?lot=${lot.id}`)}>
            <AlertTriangle className="mr-2 h-4 w-4" /> 이 주차장 민원 접수
          </Button>
          <Button variant="outline" className="min-h-11 justify-start" onClick={() => navigate(`/facility/maintenance?lot=${lot.id}`)}>
            <Wrench className="mr-2 h-4 w-4" /> 유지보수 업무 보기
          </Button>
          <Button variant="outline" className="min-h-11 justify-start" onClick={() => navigate(`/facility/layout/${lot.id}`)}>
            <ClipboardList className="mr-2 h-4 w-4" /> 주차면 배치 관리
          </Button>
        </div>

        <Tabs defaultValue="info">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="info">기본정보</TabsTrigger>
            <TabsTrigger value="survey">2025 현황조사</TabsTrigger>
            <TabsTrigger value="work">열린 업무 {openWork.length}</TabsTrigger>
            {budgetActive && <TabsTrigger value="budget">예산현황</TabsTrigger>}
            {procurementActive && <TabsTrigger value="procurement">입찰/계약</TabsTrigger>}
            {serviceActive && <TabsTrigger value="service">용역사업</TabsTrigger>}
            {complaintActive && <TabsTrigger value="complaint">민원</TabsTrigger>}
            {realtimeActive && <TabsTrigger value="realtime">실시간</TabsTrigger>}
          </TabsList>

          <TabsContent value="info">
            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs font-mono text-muted-foreground uppercase">기본 정보</CardTitle></CardHeader>
                <CardContent>
                  <InfoRow label="유형" value={LOT_TYPE_LABELS[lot.lot_type as LotType]} />
                  <InfoRow label="행정동" value={lot.admin_dong} />
                  <InfoRow label="운영주체" value={OPERATOR_LABELS[lot.operator_type as OperatorType]} />
                  {lot.operator_name && <InfoRow label="위탁업체" value={lot.operator_name} />}
                  <InfoRow label="총 주차면" value={(lot.total_spaces || 0).toLocaleString()} />
                  <InfoRow label="층수" value={lot.floors} />
                  <InfoRow label="바닥 포장재" value={lot.surface_type ? SURFACE_LABELS[lot.surface_type as SurfaceType] : undefined} />
                  <InfoRow label="면적" value={lot.area_sqm ? `${lot.area_sqm} ㎡` : undefined} />
                  <InfoRow label="장애인 주차면" value={lot.disabled_spaces ?? 0} />
                  <InfoRow label="전기차 주차면" value={lot.ev_spaces ?? 0} />
                  <InfoRow label="경차 주차면" value={lot.compact_spaces ?? 0} />
                  <InfoRow label="임산부 주차면" value={lot.pregnant_spaces ?? 0} />
                  <InfoRow label="기타 전용면" value={lot.other_spaces ?? 0} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs font-mono text-muted-foreground uppercase">설비 현황</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "차단기", val: lot.has_gate },
                      { label: "LPR", val: lot.has_lpr },
                      { label: "무인정산기", val: lot.has_kiosk },
                      { label: "CCTV", val: lot.has_cctv },
                      { label: "안내전광판", val: lot.has_display_board },
                      { label: "주차면센서", val: lot.has_sensor },
                      { label: "통합관제", val: lot.control_system_linked },
                      { label: "주차포털", val: lot.portal_linked },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex items-center gap-1.5 py-1">
                        <BoolIcon value={!!val} />
                        <span className="text-xs">{label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs font-mono text-muted-foreground uppercase">인프라</CardTitle></CardHeader>
                <CardContent>
                  <InfoRow label="전기 공급" value={lot.power_status ? POWER_LABELS[lot.power_status as PowerStatus] : undefined} />
                  <InfoRow label="통신망" value={lot.network_type} />
                </CardContent>
              </Card>

              {lot.notes && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-mono text-muted-foreground uppercase">비고</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{lot.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="survey">
            {isSurveyLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-52" />)}
              </div>
            ) : surveyFact ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">운영 및 주차면</CardTitle></CardHeader>
                    <CardContent>
                      <InfoRow label="일반 주차면" value={(surveyFact.general_spaces ?? 0).toLocaleString()} />
                      <InfoRow label="기타면 유형" value={surveyFact.other_space_type} />
                      <InfoRow label="운영 구분" value={surveyFact.operation_category} />
                      <InfoRow label="운영시간" value={surveyFact.operating_hours_text} />
                      <InfoRow label="관리인력" value={surveyFact.management_type} />
                      <InfoRow label="상주인원" value={`${surveyFact.resident_staff_count}명`} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">관제 및 안내</CardTitle></CardHeader>
                    <CardContent>
                      <InfoRow label="통합관제" value={surveyFact.control_system_linked ? "연계" : "미연계"} />
                      <InfoRow label="주차포털" value={surveyFact.parking_portal_linked ? "연계" : "미연계"} />
                      <InfoRow label="관제 제조사" value={surveyFact.control_manufacturer} />
                      <InfoRow label="전광판" value={surveyFact.display_installation_status} />
                      <InfoRow label="전광판 통신" value={surveyFact.display_network_type} />
                      <InfoRow label="전광판 운영" value={surveyFact.display_use_status} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">센서 및 구축량</CardTitle></CardHeader>
                    <CardContent>
                      <InfoRow label="기존 주차면센서" value={surveyFact.existing_sensor_status} />
                      <InfoRow label="센서 제조사" value={surveyFact.sensor_manufacturer} />
                      <InfoRow label="센서 사용여부" value={surveyFact.sensor_use_status} />
                      <InfoRow label="신규 센서" value={`${(surveyFact.new_sensor_target_count ?? 0).toLocaleString()}개`} />
                      <InfoRow label="게이트웨이" value={`${surveyFact.gateway_target_count ?? 0}개`} />
                      <InfoRow label="전광판 개발" value={surveyFact.display_development_possible} />
                      <InfoRow label="포털 연계 가능" value={surveyFact.portal_link_possible} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">이용 및 우선순위</CardTitle></CardHeader>
                    <CardContent>
                      <InfoRow label="이용률" value={surveyFact.utilization_band} />
                      <InfoRow label="혼잡시간" value={surveyFact.peak_period} />
                      <InfoRow label="주이용객" value={surveyFact.primary_users} />
                      <InfoRow label="이용객 기타" value={surveyFact.user_notes} />
                      <InfoRow label="구축 우선순위" value={surveyFact.priority_rank ? `${surveyFact.priority_rank}위` : null} />
                      <InfoRow label="평가점수" value={surveyFact.priority_score} />
                      <InfoRow label="평가 비고" value={surveyFact.priority_note} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">출입 및 현장환경</CardTitle></CardHeader>
                    <CardContent>
                      <InfoRow label="입구" value={`${surveyFact.entrance_count ?? 0}개`} />
                      <InfoRow label="출구" value={`${surveyFact.exit_count ?? 0}개`} />
                      <InfoRow label="입출구 겸용" value={surveyFact.entrance_exit_shared ? "예" : "아니오"} />
                      <InfoRow label="전기공급" value={surveyFact.power_supply_status} />
                      <InfoRow label="통신망" value={surveyFact.wired_network_status} />
                      <InfoRow label="Windows 업데이트" value={surveyFact.windows_update_status} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">조사 출처</CardTitle></CardHeader>
                    <CardContent>
                      <InfoRow label="기준번호" value={`제주시-${String(surveyFact.source_record_no ?? 0).padStart(3, "0")}`} />
                      <InfoRow label="보고서" value={surveyFact.survey_data_sources?.title} />
                      <InfoRow label="기준월" value={surveyFact.survey_data_sources?.report_month?.slice(0, 7)} />
                      <InfoRow label="주관기관" value={surveyFact.survey_data_sources?.publisher} />
                      <InfoRow label="수행기관" value={surveyFact.survey_data_sources?.contractor} />
                      <InfoRow label="검증상태" value={surveyFact.survey_data_sources?.validation_status === "validated" ? "검증완료" : surveyFact.survey_data_sources?.validation_status} />
                      <InfoRow label="원본 SHA-256" value={surveyFact.survey_data_sources?.source_sha256?.slice(0, 16)} />
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : lotSurveys?.length ? (
              <div className="overflow-hidden border bg-card">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-medium">진행 중인 현황조사</p>
                  <p className="text-xs text-muted-foreground">2025 기준 원본은 없지만 이 주차장에 연결된 조사 업무가 있습니다.</p>
                </div>
                {lotSurveys.map((survey) => (
                  <button
                    key={survey.id}
                    type="button"
                    className="flex min-h-12 w-full items-center justify-between border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/40"
                    onClick={() => navigate(survey.status === "submitted" || survey.status === "review" ? `/surveys/${survey.id}/review` : `/surveys/${survey.id}`)}
                  >
                    <span className="text-sm">주차장 현황조사</span>
                    <span className="text-xs text-muted-foreground">{SURVEY_STATUS_LABELS[survey.status] || survey.status}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="border py-12 text-center text-sm text-muted-foreground">연결된 현황조사 데이터가 없습니다</div>
            )}
          </TabsContent>

          <TabsContent value="work">
            <section className="overflow-hidden border bg-card">
              <div className="border-b px-4 py-3">
                <h3 className="text-sm font-semibold">주차장 열린 업무</h3>
                <p className="text-xs text-muted-foreground">민원, 유지보수, 현황조사를 기한 순으로 확인합니다</p>
              </div>
              {openWork.length > 0 ? openWork.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  onClick={() => navigate(item.route)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/40"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    {item.type === '민원' ? <AlertTriangle className="h-4 w-4" /> : item.type === '유지보수' ? <Wrench className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.type} · {item.status}</span>
                  </span>
                  <span className={`text-xs ${item.overdue ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                    {item.due || '기한 없음'}
                  </span>
                </button>
              )) : (
                <div className="py-12 text-center text-sm text-muted-foreground">진행 중인 업무가 없습니다</div>
              )}
            </section>
          </TabsContent>

          {budgetActive && (
            <TabsContent value="budget">
              <BudgetTab lotId={lot.id} />
            </TabsContent>
          )}

          {procurementActive && (
            <TabsContent value="procurement">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">관련 입찰 사업</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>입찰번호</TableHead>
                        <TableHead>사업명</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead className="text-right">설계금액</TableHead>
                        <TableHead>낙찰업체</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bidProjects?.map(bp => (
                        <TableRow key={bp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/procurement/projects/${bp.id}`)}>
                          <TableCell className="text-sm font-mono">{bp.bid_number}</TableCell>
                          <TableCell className="text-sm">{bp.title}</TableCell>
                          <TableCell><Badge variant="outline" className={`text-xs ${BID_STATUS_COLORS[bp.status] || ''}`}>{BID_STATUS_LABELS[bp.status] || bp.status}</Badge></TableCell>
                          <TableCell className="text-right text-sm">{bp.estimated_amount ? formatManWon(bp.estimated_amount) : '-'}</TableCell>
                          <TableCell className="text-sm">{bp.successful_bidder || '-'}</TableCell>
                        </TableRow>
                      ))}
                      {!bidProjects?.length && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">관련 입찰 사업 없음</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {serviceActive && (
            <TabsContent value="service">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">관련 용역사업</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>사업번호</TableHead>
                        <TableHead>사업명</TableHead>
                        <TableHead>유형</TableHead>
                        <TableHead>업체</TableHead>
                        <TableHead>기간</TableHead>
                        <TableHead>진척률</TableHead>
                        <TableHead>상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {serviceProjects?.map(sp => (
                        <TableRow key={sp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/service/projects/${sp.id}`)}>
                          <TableCell className="text-xs font-mono">{sp.project_number}</TableCell>
                          <TableCell className="text-sm">{sp.title}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{SERVICE_TYPE_LABELS[sp.service_type] || sp.service_type}</Badge></TableCell>
                          <TableCell className="text-sm">{sp.contractor_name}</TableCell>
                          <TableCell className="text-xs">{sp.start_date}~{sp.end_date}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Progress value={Number(sp.progress_pct || 0)} className="h-1.5 w-16" />
                              <span className="text-xs">{Number(sp.progress_pct || 0).toFixed(0)}%</span>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] ${PROJECT_STATUS_COLORS[sp.status] || ''}`}>{PROJECT_STATUS_LABELS[sp.status] || sp.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {!serviceProjects?.length && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-6">관련 용역사업 없음</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
          {complaintActive && (
            <TabsContent value="complaint">
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">최근 민원</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/complaints/new?lot=${id}`)}>민원 접수</Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>민원번호</TableHead>
                        <TableHead>유형</TableHead>
                        <TableHead>제목</TableHead>
                        <TableHead>접수일</TableHead>
                        <TableHead>상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lotComplaints?.map(c => (
                        <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/complaints/${c.id}`)}>
                          <TableCell className="text-xs font-mono">{c.complaint_number}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[c.category] || c.category}</Badge></TableCell>
                          <TableCell className="text-sm truncate max-w-[200px]">{c.title}</TableCell>
                          <TableCell className="text-xs">{c.received_at?.slice(0, 10)}</TableCell>
                          <TableCell><Badge className={`text-[10px] ${COMPLAINT_STATUS_COLORS[c.status]}`}>{COMPLAINT_STATUS_LABELS[c.status] || c.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {!lotComplaints?.length && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">민원 없음</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
          {realtimeActive && (
            <TabsContent value="realtime">
              <div className="space-y-4">
                {realtimeStatus ? (
                  <>
                    <Card>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between mb-3">
                          <Badge className={`${CONGESTION_COLORS[realtimeStatus.congestion_level] || ''}`}>
                            {CONGESTION_LABELS[realtimeStatus.congestion_level] || realtimeStatus.congestion_level}
                          </Badge>
                          {realtimeStatus.last_updated && (
                            <span className="text-[10px] text-muted-foreground">갱신: {new Date(realtimeStatus.last_updated).toLocaleTimeString('ko-KR')}</span>
                          )}
                        </div>
                        <div className="text-center mb-3">
                          <span className="text-4xl font-bold">{(realtimeStatus.available_spaces ?? 0).toLocaleString()}</span>
                          <span className="text-sm text-muted-foreground ml-1">대 잔여</span>
                          <span className="text-xs text-muted-foreground ml-2">/ 총 {(realtimeStatus.total_spaces || 0).toLocaleString()}</span>
                        </div>
                        <div className="h-3 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${CONGESTION_BG[realtimeStatus.congestion_level] || 'bg-blue-500'}`}
                            style={{ width: `${Math.min(Number(realtimeStatus.occupancy_rate || 0), 100)}%` }} />
                        </div>
                        <p className="text-xs text-center text-muted-foreground mt-1">점유율 {Number(realtimeStatus.occupancy_rate || 0).toFixed(1)}%</p>
                      </CardContent>
                    </Card>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Card><CardContent className="pt-3 pb-3">
                        <p className="text-xs text-muted-foreground">금일 입차</p>
                        <p className="text-lg font-bold">{(realtimeStatus.today_total_in || 0).toLocaleString()}</p>
                      </CardContent></Card>
                      <Card><CardContent className="pt-3 pb-3">
                        <p className="text-xs text-muted-foreground">금일 출차</p>
                        <p className="text-lg font-bold">{(realtimeStatus.today_total_out || 0).toLocaleString()}</p>
                      </CardContent></Card>
                      <Card><CardContent className="pt-3 pb-3">
                        <p className="text-xs text-muted-foreground">피크 점유</p>
                        <p className="text-lg font-bold">{realtimeStatus.today_peak_occupied || 0}대</p>
                        {realtimeStatus.today_peak_time && <p className="text-[10px] text-muted-foreground">{realtimeStatus.today_peak_time}</p>}
                      </CardContent></Card>
                      <Card><CardContent className="pt-3 pb-3">
                        <p className="text-xs text-muted-foreground">평균 주차시간</p>
                        <p className="text-lg font-bold">{realtimeStatus.today_avg_duration_min ? `${realtimeStatus.today_avg_duration_min}분` : '—'}</p>
                      </CardContent></Card>
                    </div>
                  </>
                ) : (
                  <Card><CardContent className="py-8 text-center text-muted-foreground">실시간 데이터가 아직 수집되지 않았습니다</CardContent></Card>
                )}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">설치 장비 현황</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">센서</p>
                        <p className="font-bold">{lotSensors?.length || 0}대</p>
                        <p className="text-[10px] text-muted-foreground">정상 {lotSensors?.filter(s => s.status === 'active').length || 0} / 이상 {lotSensors?.filter(s => s.status !== 'active').length || 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">게이트웨이</p>
                        <p className="font-bold">{lotGateways?.length || 0}대</p>
                        <p className="text-[10px] text-muted-foreground">정상 {lotGateways?.filter(g => g.status === 'active').length || 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">전광판</p>
                        <p className="font-bold">{lotDisplays?.length || 0}대</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
