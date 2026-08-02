import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { handoffConstructionToOperations, setConstructionCompletionCheck } from "@/lib/workflow-commands";
import {
  PHASE_LABELS, PHASE_ORDER, PROJECT_TYPE_LABELS,
  CONSTRUCTION_STATUS_LABELS, CONSTRUCTION_STATUS_COLORS,
  PERMIT_STATUS_LABELS, PERMIT_STATUS_COLORS,
  DOC_TYPE_LABELS, REVIEW_STATUS_LABELS,
  formatBudgetWon,
} from "@/types/planning";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function PlanningProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [checkInputs, setCheckInputs] = useState<Record<string, { evidencePath: string; notes: string }>>({});
  const [handoffForm, setHandoffForm] = useState({ lotCode: "", lotName: "", totalSpaces: "", addressRoad: "" });

  const { data: project, isLoading } = useQuery({
    queryKey: ["planning-project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_projects")
        .select("*, site:site_candidates(*), parking_lot:parking_lots(code, name, address_road, total_spaces)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!project) return;
    const site = (project as any).site;
    const existingLot = (project as any).parking_lot;
    setHandoffForm((current) => ({
      lotCode: current.lotCode || existingLot?.code || `LOT-${project.project_number.replace(/[^a-zA-Z0-9]/g, "").slice(-8)}`,
      lotName: current.lotName || existingLot?.name || site?.name || project.project_name.replace(/(조성|건설|공사)\s*사업?$/g, "").trim(),
      totalSpaces: current.totalSpaces || String(existingLot?.total_spaces || site?.estimated_spaces || ""),
      addressRoad: current.addressRoad || existingLot?.address_road || site?.address_road || "",
    }));
  }, [project]);

  const { data: completionChecks } = useQuery({
    queryKey: ["construction-completion-checks", id],
    queryFn: async () => {
      const { error: ensureError } = await (supabase.rpc as any)("ensure_construction_completion_checklist", { p_project_id: id });
      if (ensureError) throw ensureError;
      const { data, error } = await (supabase as any).from("construction_completion_checks")
        .select("*")
        .eq("project_id", id)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const checkMutation = useMutation({
    mutationFn: ({ check, completed }: { check: any; completed: boolean }) => {
      const input = checkInputs[check.id] || { evidencePath: check.evidence_path || "", notes: check.notes || "" };
      return setConstructionCompletionCheck(check.id, completed, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["construction-completion-checks", id] });
      toast({ title: "준공 체크 항목을 저장했습니다" });
    },
    onError: (error: Error) => toast({ title: "체크 항목 저장 실패", description: error.message, variant: "destructive" }),
  });

  const handoffMutation = useMutation({
    mutationFn: () => handoffConstructionToOperations(id!, {
      lotCode: handoffForm.lotCode,
      lotName: handoffForm.lotName,
      totalSpaces: Number(handoffForm.totalSpaces),
      addressRoad: handoffForm.addressRoad,
    }),
    onSuccess: (lotId) => {
      queryClient.invalidateQueries({ queryKey: ["planning-project", id] });
      queryClient.invalidateQueries({ queryKey: ["parking-lots"] });
      toast({ title: "준공 사업을 주차장 운영 원장으로 전환했습니다" });
      navigate(`/lots/${lotId}`);
    },
    onError: (error: Error) => toast({ title: "운영 전환 실패", description: error.message, variant: "destructive" }),
  });

  const { data: docs } = useQuery({
    queryKey: ["planning-project-docs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("design_documents")
        .select("*")
        .eq("project_id", id!)
        .eq("is_current", true)
        .order("doc_type");
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const { data: permits } = useQuery({
    queryKey: ["planning-project-permits", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permits")
        .select("*")
        .eq("project_id", id!)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const canEdit = profile?.role && ["admin", "manager", "editor"].includes(profile.role);

  const handlePhaseChange = async (newPhase: string) => {
    if (!project) return;
    if (newPhase === "completion") {
      toast({ title: "준공·운영 전환 탭에서 필수 체크 후 완료해 주세요", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("construction_projects")
      .update({ phase: newPhase } as any)
      .eq("id", project.id);
    if (error) { toast({ title: "변경 실패", variant: "destructive" }); return; }
    toast({ title: `단계 변경: ${PHASE_LABELS[newPhase]}` });
    logActivity({ module: "PLANNING", action: "phase_changed", targetType: "construction_project", targetId: project.id, targetName: project.project_name, details: { phase: newPhase } });
    queryClient.invalidateQueries({ queryKey: ["planning-project", id] });
  };

  if (isLoading) return <DashboardLayout><div className="p-8"><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-64 w-full" /></div></DashboardLayout>;
  if (!project) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">프로젝트를 찾을 수 없습니다</div></DashboardLayout>;

  const phaseIdx = PHASE_ORDER.indexOf(project.phase);

  const budgetData = [
    { name: "설계비", 예산: Number(project.design_cost) || 0 },
    { name: "공사비", 예산: Number(project.construction_cost) || 0 },
    { name: "감리비", 예산: Number(project.supervision_cost) || 0 },
    { name: "기타", 예산: Number(project.other_cost) || 0 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/planning/projects")}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{project.project_name}</h1>
              <Badge variant="outline">{PROJECT_TYPE_LABELS[project.project_type] || project.project_type}</Badge>
              <Badge className={CONSTRUCTION_STATUS_COLORS[project.status] || ''} variant="outline">{CONSTRUCTION_STATUS_LABELS[project.status] || project.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{project.project_number}</p>
          </div>
        </div>

        <DocumentLinksPanel module="PLANNING" recordId={project.id} recordPath={`/planning/projects/${project.id}`} recordTitle={project.project_name} />

        {/* Phase Step Bar */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">진행 단계</span>
              {canEdit && (
                <Select value={project.phase} onValueChange={handlePhaseChange}>
                  <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{PHASE_ORDER.map(p => <SelectItem key={p} value={p}>{PHASE_LABELS[p]}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div className="flex items-center gap-1">
              {PHASE_ORDER.map((ph, i) => (
                <div key={ph} className="flex-1 text-center">
                  <div className={`h-2 rounded-full mb-1 ${i < phaseIdx ? 'bg-primary' : i === phaseIdx ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
                  <span className={`text-[10px] ${i <= phaseIdx ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{PHASE_LABELS[ph]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="info">
          <div className="w-full overflow-x-auto">
            <TabsList className="min-w-max">
              <TabsTrigger value="info">사업정보</TabsTrigger>
              <TabsTrigger value="docs">도면 ({(docs || []).length})</TabsTrigger>
              <TabsTrigger value="permits">인허가 ({(permits || []).length})</TabsTrigger>
              <TabsTrigger value="completion">준공·운영 전환</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="info" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">기본 정보</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">사업번호</span><span>{project.project_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">사업유형</span><span>{PROJECT_TYPE_LABELS[project.project_type] || project.project_type}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">시공업체</span><span>{project.contractor || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">감리업체</span><span>{project.supervisor || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">설계업체</span><span>{project.designer || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">준공 목표</span><span>{project.target_completion || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">진척률</span>
                    <div className="flex items-center gap-2">
                      <Progress value={Number(project.progress_pct)} className="w-20 h-1.5" />
                      <span>{Number(project.progress_pct).toFixed(0)}%</span>
                    </div>
                  </div>
                  {project.description && <div className="pt-2 border-t"><p className="text-xs text-muted-foreground">{project.description}</p></div>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">예산 현황</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between"><span className="text-muted-foreground">총 예산</span><span className="font-bold">{formatBudgetWon(project.total_budget)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">집행액</span><span>{formatBudgetWon(project.spent)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">잔액</span><span>{formatBudgetWon(project.remaining)}</span></div>
                    <Progress value={Number(project.budget_execution_rate) || 0} className="h-2" />
                    <p className="text-xs text-right text-muted-foreground">집행률 {Number(project.budget_execution_rate || 0).toFixed(1)}%</p>
                  </div>
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={budgetData}>
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} />
                        <Tooltip formatter={(v: number) => formatBudgetWon(v)} />
                        <Bar dataKey="예산" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="docs" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>번호</TableHead>
                      <TableHead>유형</TableHead>
                      <TableHead>제목</TableHead>
                      <TableHead>버전</TableHead>
                      <TableHead>검토상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(docs || []).map(d => (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs font-mono">{d.doc_number}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{DOC_TYPE_LABELS[d.doc_type] || d.doc_type}</Badge></TableCell>
                        <TableCell>{d.title}</TableCell>
                        <TableCell className="text-xs">{d.version}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{REVIEW_STATUS_LABELS[d.review_status] || d.review_status}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {(docs || []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">등록된 도면이 없습니다. <Button variant="link" className="p-0" onClick={() => navigate("/planning/documents")}>도면 관리로 이동</Button></TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permits" className="mt-4">
            <Card>
              <CardContent className="p-4">
                {(permits || []).length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">인허가 진행</span>
                      <span className="text-sm">{project.permits_completed}/{project.permits_total} 완료 ({project.permits_total > 0 ? ((project.permits_completed / project.permits_total) * 100).toFixed(0) : 0}%)</span>
                    </div>
                    <Progress value={project.permits_total > 0 ? (project.permits_completed / project.permits_total) * 100 : 0} className="h-2" />
                  </div>
                )}
                <div className="space-y-2">
                  {(permits || []).map(p => (
                    <div key={p.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{["approved", "conditional_approved"].includes(p.status) ? "✅" : p.status === "reviewing" || p.status === "submitted" ? "🔄" : "⬜"}</span>
                        <div>
                          <p className="text-sm font-medium">{p.permit_type}</p>
                          <p className="text-xs text-muted-foreground">{p.authority}</p>
                        </div>
                      </div>
                      <Badge className={PERMIT_STATUS_COLORS[p.status] || ''} variant="outline">{PERMIT_STATUS_LABELS[p.status] || p.status}</Badge>
                    </div>
                  ))}
                  {(permits || []).length === 0 && (
                    <p className="text-center py-8 text-muted-foreground text-sm">등록된 인허가가 없습니다. <Button variant="link" className="p-0" onClick={() => navigate("/planning/permits")}>인허가 관리로 이동</Button></p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completion" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>준공 체크리스트</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {(completionChecks || []).filter((check: any) => check.is_completed).length}/{(completionChecks || []).length} 완료
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(completionChecks || []).map((check: any) => {
                    const input = checkInputs[check.id] || { evidencePath: check.evidence_path || "", notes: check.notes || "" };
                    return (
                      <div key={check.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={check.is_completed}
                            disabled={!canEdit || checkMutation.isPending}
                            onCheckedChange={(value) => checkMutation.mutate({ check, completed: value === true })}
                          />
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{check.label}</p>
                              {check.requires_evidence && <Badge variant="outline" className="text-[10px]">증빙 필수</Badge>}
                            </div>
                            {!check.is_completed && canEdit && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <Input
                                  value={input.evidencePath}
                                  onChange={(event) => setCheckInputs((current) => ({ ...current, [check.id]: { ...input, evidencePath: event.target.value } }))}
                                  placeholder={check.requires_evidence ? "증빙 문서 경로 또는 문서번호" : "증빙 경로 (선택)"}
                                />
                                <Input
                                  value={input.notes}
                                  onChange={(event) => setCheckInputs((current) => ({ ...current, [check.id]: { ...input, notes: event.target.value } }))}
                                  placeholder="확인 메모"
                                />
                              </div>
                            )}
                            {check.is_completed && (
                              <p className="text-xs text-muted-foreground">
                                {check.evidence_path ? `증빙: ${check.evidence_path}` : "증빙 없음"}
                                {check.notes ? ` | ${check.notes}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">주차장 운영 원장 전환</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {project.status === "completed" && project.lot_id ? (
                    <div className="space-y-3 text-center py-4">
                      <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
                      <p className="text-sm font-medium">운영 전환 완료</p>
                      <Button variant="outline" onClick={() => navigate(`/lots/${project.lot_id}`)}>
                        <ExternalLink className="h-4 w-4 mr-1" />주차장 원장 보기
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div><Label>주차장 코드</Label><Input value={handoffForm.lotCode} disabled={!!project.lot_id} onChange={(event) => setHandoffForm({ ...handoffForm, lotCode: event.target.value })} /></div>
                      <div><Label>주차장 명칭</Label><Input value={handoffForm.lotName} disabled={!!project.lot_id} onChange={(event) => setHandoffForm({ ...handoffForm, lotName: event.target.value })} /></div>
                      <div><Label>총 주차면</Label><Input type="number" min={1} value={handoffForm.totalSpaces} onChange={(event) => setHandoffForm({ ...handoffForm, totalSpaces: event.target.value })} /></div>
                      <div><Label>도로명 주소</Label><Input value={handoffForm.addressRoad} disabled={!!project.lot_id} onChange={(event) => setHandoffForm({ ...handoffForm, addressRoad: event.target.value })} /></div>
                      <div className="rounded border bg-muted/30 p-3 text-xs text-muted-foreground">
                        필수 체크와 인허가 승인을 서버에서 다시 검증한 뒤 주차장 원장을 생성하거나 기존 원장을 운영 상태로 전환합니다.
                      </div>
                      <Button
                        className="w-full"
                        disabled={!['admin', 'manager'].includes(profile?.role || '') || handoffMutation.isPending || !handoffForm.totalSpaces}
                        onClick={() => handoffMutation.mutate()}
                      >
                        {handoffMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        준공 승인 및 운영 전환
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
