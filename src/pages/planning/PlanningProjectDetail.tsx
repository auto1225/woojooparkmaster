import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { ArrowLeft } from "lucide-react";
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

  const { data: project, isLoading } = useQuery({
    queryKey: ["planning-project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_projects")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
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
    const { error } = await supabase.from("construction_projects")
      .update({ phase: newPhase, status: newPhase === 'completion' ? 'completed' : project.status } as any)
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
          <TabsList>
            <TabsTrigger value="info">사업정보</TabsTrigger>
            <TabsTrigger value="docs">도면 ({(docs || []).length})</TabsTrigger>
            <TabsTrigger value="permits">인허가 ({(permits || []).length})</TabsTrigger>
          </TabsList>

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
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
