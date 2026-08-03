import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { Plus, AlertTriangle } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { getPermitTypeLabel, PERMIT_STATUS_LABELS, PERMIT_STATUS_COLORS } from "@/types/planning";
import { advancePermit } from "@/lib/workflow-commands";

const PERMIT_TYPES = [
  '건축허가', '개발행위허가', '교통영향평가', '환경영향평가', '문화재지표조사',
  '소방동의', '도로점용허가', '배수시설허가', '전기사용신청', '상수도', '하수도', '통신',
];

export default function PlanningPermits() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [showAction, setShowAction] = useState<{ id: string; action: "approve" | "conditional_approve" | "reject" | "supplement"; rowVersion?: number } | null>(null);
  const [actionForm, setActionForm] = useState({ permitNumber: "", documentNumber: "", note: "", expiryDate: "" });
  const [form, setForm] = useState<Record<string, any>>({});
  const updateForm = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const { data: projects } = useQuery({
    queryKey: ["planning-projects-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("construction_projects").select("id, project_number, project_name").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: permits, isLoading } = useQuery({
    queryKey: ["planning-permits", statusFilter, projectFilter],
    queryFn: async () => {
      let query = supabase.from("permits").select("*, construction_projects(project_name, project_number)");
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (projectFilter !== "all") query = query.eq("project_id", projectFilter);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const today = new Date();
  const isExpiringSoon = (date?: string | null) => {
    if (!date) return false;
    const d = new Date(date);
    const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 60;
  };

  const handleSave = async () => {
    if (!form.project_id || !form.permit_type || !form.authority) {
      toast({ title: "필수 항목을 입력해주세요", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("permits").insert([{
      project_id: form.project_id,
      permit_type: form.permit_type,
      permit_category: form.permit_category || null,
      authority: form.authority,
      authority_department: form.authority_department || null,
      authority_contact: form.authority_contact || null,
      application_date: form.application_date || null,
      target_approval_date: form.target_approval_date || null,
      fee_amount: form.fee_amount ? Number(form.fee_amount) : 0,
      fee_paid: form.fee_paid || false,
      notes: form.notes || null,
      assigned_to: profile?.id,
      author_name: form.author_name || null,
      client_mutation_id: crypto.randomUUID(),
    }] as any);
    if (error) { toast({ title: "등록 실패", description: error.message, variant: "destructive" }); return; }
    toast({ title: "인허가 등록 완료" });
    logActivity({ module: "PLANNING", action: "permit_created", targetType: "permit", targetName: form.permit_type });
    setShowNew(false);
    setForm({});
    queryClient.invalidateQueries({ queryKey: ["planning-permits"] });
  };

  const handleStatusChange = async (permitId: string, action: "submit" | "approve" | "conditional_approve" | "reject" | "supplement", rowVersion?: number) => {
    try {
      await advancePermit(permitId, action, { ...actionForm, expectedVersion: rowVersion });
    } catch (error) {
      toast({ title: "상태 변경 실패", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return;
    }
    toast({ title: "인허가 처리 상태를 저장했습니다" });
    logActivity({ module: "PLANNING", action: "permit_status_changed", targetType: "permit", targetId: permitId, details: { action } });
    setShowAction(null);
    setActionForm({ permitNumber: "", documentNumber: "", note: "", expiryDate: "" });
    queryClient.invalidateQueries({ queryKey: ["planning-permits"] });
  };

  const canEdit = profile?.role && ["admin", "manager", "editor"].includes(profile.role);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">인허가 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">인허가 등록 및 상태 관리</p>
          </div>
          {canEdit && <Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" />인허가 등록</Button>}
        </div>

        <div className="flex gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="상태" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              {Object.entries(PERMIT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="프로젝트" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 프로젝트</SelectItem>
              {(projects || []).map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}
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
                    <TableHead>공사명</TableHead>
                    <TableHead>인허가 종류</TableHead>
                    <TableHead>관할기관</TableHead>
                    <TableHead>신청일</TableHead>
                    <TableHead>승인일</TableHead>
                    <TableHead>만료일</TableHead>
                    <TableHead>상태</TableHead>
                    {canEdit && <TableHead></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(permits || []).map((p: any) => (
                    <TableRow key={p.id} className={isExpiringSoon(p.expiry_date) ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}>
                      <TableCell className="text-sm">{p.construction_projects?.project_name || '-'}</TableCell>
                      <TableCell><div className="font-medium">{getPermitTypeLabel(p.permit_type)}</div><div className="text-xs text-muted-foreground">{p.permit_number || "허가번호 미등록"}</div></TableCell>
                      <TableCell><div className="text-xs">{p.authority}</div><div className="text-xs text-muted-foreground">{p.official_document_number || "공식 문서 미연계"}</div></TableCell>
                      <TableCell className="text-xs">{p.application_date || '-'}</TableCell>
                      <TableCell className="text-xs">{p.actual_approval_date || '-'}</TableCell>
                      <TableCell className="text-xs">
                        {p.expiry_date || '-'}
                        {isExpiringSoon(p.expiry_date) && <AlertTriangle className="inline h-3 w-3 ml-1 text-yellow-600" />}
                      </TableCell>
                      <TableCell><Badge className={PERMIT_STATUS_COLORS[p.status] || ''} variant="outline">{PERMIT_STATUS_LABELS[p.status] || p.status}</Badge></TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            {['not_started', 'preparing'].includes(p.status) && <Button size="sm" variant="outline" className="text-[10px] h-6" onClick={() => handleStatusChange(p.id, 'submit', p.row_version)}>제출</Button>}
                            {['submitted', 'reviewing'].includes(p.status) && (
                              <>
                                <Button size="sm" variant="outline" className="text-[10px] h-6" onClick={() => setShowAction({ id: p.id, action: 'approve', rowVersion: p.row_version })}>승인</Button>
                                <Button size="sm" variant="outline" className="text-[10px] h-6" onClick={() => setShowAction({ id: p.id, action: 'conditional_approve', rowVersion: p.row_version })}>조건부</Button>
                                <Button size="sm" variant="outline" className="text-[10px] h-6" onClick={() => setShowAction({ id: p.id, action: 'reject', rowVersion: p.row_version })}>반려</Button>
                              </>
                            )}
                            {['approved', 'conditional_approved'].includes(p.status) && (!p.permit_number || !p.official_document_number) && <Button size="sm" variant="outline" className="text-[10px] h-6" onClick={() => setShowAction({ id: p.id, action: 'supplement', rowVersion: p.row_version })}>근거보완</Button>}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {(permits || []).length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">데이터가 없습니다</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Dialog */}
      <Dialog open={showNew} onOpenChange={v => { setShowNew(v); if (!v) setForm({}); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>인허가 등록</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>공사 프로젝트 *</Label>
              <Select value={form.project_id || ''} onValueChange={v => updateForm('project_id', v)}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>{(projects || []).map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>인허가 종류 *</Label>
              <Select value={form.permit_type || ''} onValueChange={v => updateForm('permit_type', v)}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>{PERMIT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>구분</Label>
              <Select value={form.permit_category || ''} onValueChange={v => updateForm('permit_category', v)}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="required">필수</SelectItem>
                  <SelectItem value="conditional">조건부</SelectItem>
                  <SelectItem value="optional">선택</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>관할기관 *</Label><Input value={form.authority || ''} onChange={e => updateForm('authority', e.target.value)} /></div>
            <div><Label>담당부서</Label><Input value={form.authority_department || ''} onChange={e => updateForm('authority_department', e.target.value)} /></div>
            <div><Label>담당자 연락처</Label><Input value={form.authority_contact || ''} onChange={e => updateForm('authority_contact', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>신청일</Label><Input type="date" value={form.application_date || ''} onChange={e => updateForm('application_date', e.target.value)} /></div>
              <div><Label>목표승인일</Label><Input type="date" value={form.target_approval_date || ''} onChange={e => updateForm('target_approval_date', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>수수료 (원)</Label><Input type="number" value={form.fee_amount || ''} onChange={e => updateForm('fee_amount', e.target.value)} /></div>
              <div className="flex items-center gap-2 pt-6"><Switch checked={form.fee_paid || false} onCheckedChange={v => updateForm('fee_paid', v)} /><Label>납부완료</Label></div>
            </div>
            <div><Label>비고</Label><Textarea value={form.notes || ''} onChange={e => updateForm('notes', e.target.value)} /></div>
            <AuthorField value={form.author_name || ""} onChange={v => updateForm('author_name', v)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>취소</Button>
            <Button onClick={handleSave}>등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      <Dialog open={!!showAction} onOpenChange={v => { if (!v) { setShowAction(null); setActionForm({ permitNumber: "", documentNumber: "", note: "", expiryDate: "" }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{showAction?.action === 'reject' ? '반려 사유' : showAction?.action === 'supplement' ? '승인 근거 보완' : '승인 근거 입력'}</DialogTitle></DialogHeader>
          {showAction?.action !== "reject" && <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>허가번호 *</Label><Input value={actionForm.permitNumber} onChange={e => setActionForm(v => ({ ...v, permitNumber: e.target.value }))} /></div>
            <div><Label>만료일</Label><Input type="date" value={actionForm.expiryDate} onChange={e => setActionForm(v => ({ ...v, expiryDate: e.target.value }))} /></div>
            <div className="sm:col-span-2"><Label>공식 문서번호 *</Label><Input value={actionForm.documentNumber} onChange={e => setActionForm(v => ({ ...v, documentNumber: e.target.value }))} placeholder="문서대장에 등록된 문서번호" /></div>
          </div>}
          <div><Label>{showAction?.action === "conditional_approve" ? "승인 조건 *" : "처리 메모"}</Label><Textarea value={actionForm.note} onChange={e => setActionForm(v => ({ ...v, note: e.target.value }))} placeholder="처리 사유와 조건을 입력하세요" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAction(null)}>취소</Button>
            <Button onClick={() => showAction && handleStatusChange(showAction.id, showAction.action, showAction.rowVersion)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
