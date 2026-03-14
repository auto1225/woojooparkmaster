import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { Plus } from "lucide-react";
import {
  PROJECT_TYPE_LABELS, PHASE_LABELS, CONSTRUCTION_STATUS_LABELS, CONSTRUCTION_STATUS_COLORS,
  formatBudgetWon,
} from "@/types/planning";

export default function PlanningProjects() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: projects, isLoading } = useQuery({
    queryKey: ["planning-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: selectedSites } = useQuery({
    queryKey: ["planning-selected-sites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_candidates")
        .select("id, name, site_number, estimated_spaces, address_jibun")
        .in("status", ["selected", "evaluating", "candidate"]);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = (projects || []).filter(p => statusFilter === "all" || p.status === statusFilter);

  const [form, setForm] = useState<Record<string, any>>({});
  const updateForm = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.project_name) { toast({ title: "사업명을 입력해주세요", variant: "destructive" }); return; }
    const year = new Date().getFullYear();
    const count = (projects || []).length + 1;
    const projectNumber = `CP-${year}-${String(count).padStart(3, '0')}`;
    const totalBudget = (Number(form.design_cost) || 0) + (Number(form.construction_cost) || 0) + (Number(form.supervision_cost) || 0) + (Number(form.other_cost) || 0);

    const { error } = await supabase.from("construction_projects").insert([{
      project_number: projectNumber,
      project_name: form.project_name,
      project_type: form.project_type || 'new_construction',
      site_id: form.site_id || null,
      description: form.description || null,
      contractor: form.contractor || null,
      supervisor: form.supervisor || null,
      designer: form.designer || null,
      total_budget: totalBudget || null,
      design_cost: Number(form.design_cost) || 0,
      construction_cost: Number(form.construction_cost) || 0,
      supervision_cost: Number(form.supervision_cost) || 0,
      other_cost: Number(form.other_cost) || 0,
      target_completion: form.target_completion || null,
      created_by: profile?.id,
    }] as any);
    if (error) { toast({ title: "등록 실패", description: error.message, variant: "destructive" }); return; }
    toast({ title: "공사 프로젝트 등록 완료" });
    logActivity({ module: "PLANNING", action: "project_created", targetType: "construction_project", targetName: form.project_name });
    setShowNew(false);
    setForm({});
    queryClient.invalidateQueries({ queryKey: ["planning-projects"] });
  };

  const canEdit = profile?.role && ["admin", "manager", "editor"].includes(profile.role);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">공사 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">신설/확장 공사 프로젝트 관리</p>
          </div>
          {canEdit && <Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" />공사 등록</Button>}
        </div>

        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="상태" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {Object.entries(CONSTRUCTION_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>사업번호</TableHead>
                    <TableHead>사업명</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>단계</TableHead>
                    <TableHead className="text-right">예산</TableHead>
                    <TableHead className="w-[100px]">집행률</TableHead>
                    <TableHead className="w-[100px]">진척률</TableHead>
                    <TableHead>인허가</TableHead>
                    <TableHead>준공예정</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/planning/projects/${p.id}`)}>
                      <TableCell className="text-xs font-mono">{p.project_number}</TableCell>
                      <TableCell className="font-medium">{p.project_name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{PROJECT_TYPE_LABELS[p.project_type] || p.project_type}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{PHASE_LABELS[p.phase] || p.phase}</Badge></TableCell>
                      <TableCell className="text-right text-xs">{formatBudgetWon(p.total_budget)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Progress value={Number(p.budget_execution_rate) || 0} className="h-1.5 flex-1" />
                          <span className="text-[10px] w-8 text-right">{Number(p.budget_execution_rate || 0).toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Progress value={Number(p.progress_pct)} className="h-1.5 flex-1" />
                          <span className="text-[10px] w-8 text-right">{Number(p.progress_pct).toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{p.permits_completed}/{p.permits_total}</TableCell>
                      <TableCell className="text-xs">{p.target_completion || '-'}</TableCell>
                      <TableCell><Badge className={CONSTRUCTION_STATUS_COLORS[p.status] || ''} variant="outline">{CONSTRUCTION_STATUS_LABELS[p.status] || p.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">데이터가 없습니다</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Dialog */}
      <Dialog open={showNew} onOpenChange={v => { setShowNew(v); if (!v) setForm({}); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>공사 프로젝트 등록</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>사업명 *</Label><Input value={form.project_name || ''} onChange={e => updateForm('project_name', e.target.value)} /></div>
            <div><Label>사업유형</Label>
              <Select value={form.project_type || 'new_construction'} onValueChange={v => updateForm('project_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>연계 후보부지</Label>
              <Select value={form.site_id || ''} onValueChange={v => updateForm('site_id', v)}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>{(selectedSites || []).map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.site_number})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>설명</Label><Textarea value={form.description || ''} onChange={e => updateForm('description', e.target.value)} /></div>
            <div><Label>시공업체</Label><Input value={form.contractor || ''} onChange={e => updateForm('contractor', e.target.value)} /></div>
            <div><Label>감리업체</Label><Input value={form.supervisor || ''} onChange={e => updateForm('supervisor', e.target.value)} /></div>
            <div><Label>설계업체</Label><Input value={form.designer || ''} onChange={e => updateForm('designer', e.target.value)} /></div>
            <div><Label>준공 목표일</Label><Input type="date" value={form.target_completion || ''} onChange={e => updateForm('target_completion', e.target.value)} /></div>
            <div><Label>설계비 (원)</Label><Input type="number" value={form.design_cost || ''} onChange={e => updateForm('design_cost', e.target.value)} /></div>
            <div><Label>공사비 (원)</Label><Input type="number" value={form.construction_cost || ''} onChange={e => updateForm('construction_cost', e.target.value)} /></div>
            <div><Label>감리비 (원)</Label><Input type="number" value={form.supervision_cost || ''} onChange={e => updateForm('supervision_cost', e.target.value)} /></div>
            <div><Label>기타비 (원)</Label><Input type="number" value={form.other_cost || ''} onChange={e => updateForm('other_cost', e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>취소</Button>
            <Button onClick={handleSave}>등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
