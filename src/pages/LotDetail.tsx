import { useParams, useNavigate } from "react-router-dom";
import { useMemo } from "react";
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
import { ArrowLeft, Pencil, Trash2, CheckCircle, XCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-success/10 text-success border-success/20",
  inactive: "bg-muted text-muted-foreground",
  construction: "bg-warning/10 text-warning border-warning/20",
  closed: "bg-destructive/10 text-destructive border-destructive/20",
};

function BoolIcon({ value }: { value: boolean }) {
  return value ? <CheckCircle className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-muted-foreground/40" />;
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value ?? "-"}</span>
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
  const budgetActive = (licenses ?? []).some(m => m.module_code === 'BUDGET' && m.is_active);
  const procurementActive = (licenses ?? []).some(m => m.module_code === 'PROCUREMENT' && m.is_active);

  const { data: bidProjects } = useQuery({
    queryKey: ['lot-bid-projects', id],
    queryFn: async () => {
      const { data } = await supabase.from('bid_projects').select('id, bid_number, title, status, bid_type, estimated_amount, contract_amount, successful_bidder, bid_deadline')
        .eq('lot_id', id!).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id && procurementActive,
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

  const canEdit = profile && ["admin", "manager", "editor"].includes(profile.role);
  const canDelete = profile?.role === "admin";

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
        <div className="flex items-start justify-between">
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
          <div className="flex gap-2 shrink-0">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/lots/${lot.id}/edit`)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> 수정
              </Button>
            )}
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> 삭제
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>주차장 삭제</AlertDialogTitle>
                    <AlertDialogDescription>정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">삭제</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">기본정보</TabsTrigger>
            {budgetActive && <TabsTrigger value="budget">예산현황</TabsTrigger>}
            {procurementActive && <TabsTrigger value="procurement">입찰/계약</TabsTrigger>}
          </TabsList>

          <TabsContent value="info">
            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs font-mono text-muted-foreground uppercase">기본 정보</CardTitle></CardHeader>
                <CardContent>
                  <InfoRow label="유형" value={LOT_TYPE_LABELS[lot.lot_type as LotType]} />
                  <InfoRow label="운영주체" value={OPERATOR_LABELS[lot.operator_type as OperatorType]} />
                  {lot.operator_name && <InfoRow label="위탁업체" value={lot.operator_name} />}
                  <InfoRow label="총 주차면" value={(lot.total_spaces || 0).toLocaleString()} />
                  <InfoRow label="층수" value={lot.floors} />
                  <InfoRow label="바닥 포장재" value={lot.surface_type ? SURFACE_LABELS[lot.surface_type as SurfaceType] : undefined} />
                  <InfoRow label="면적" value={lot.area_sqm ? `${lot.area_sqm} ㎡` : undefined} />
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
        </Tabs>
      </div>
    </DashboardLayout>
  );
}