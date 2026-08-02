import { useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import {
  SERVICE_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS,
  MILESTONE_TYPE_LABELS, MILESTONE_STATUS_LABELS,
  DELIVERABLE_STATUS_LABELS, INSPECTION_TYPE_LABELS, INSPECTION_STATUS_LABELS,
  PAYMENT_TYPE_LABELS, PAYMENT_STATUS_LABELS, ISSUE_TYPE_LABELS,
  SEVERITY_LABELS, SEVERITY_COLORS, ISSUE_STATUS_LABELS,
  RESULT_LABELS, RESULT_COLORS, formatServiceAmount,
} from "@/types/service";
import { ArrowLeft, CheckCircle, Circle, AlertCircle, Plus, Pencil } from "lucide-react";
import { advanceServicePayment, createServiceInspection, decideServiceInspection, requestServicePayment } from "@/lib/workflow-commands";

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value ?? "-"}</span>
    </div>
  );
}

export default function ServiceProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const canEdit = profile && ["admin", "manager", "editor"].includes(profile.role);
  const canApprove = profile && ["admin", "manager"].includes(profile.role);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionForm, setInspectionForm] = useState({ type: "progress", title: "", date: new Date().toISOString().slice(0, 10), targetAmount: 0 });
  const [inspectionAction, setInspectionAction] = useState<{ item: any; action: "require_correction" | "submit_correction" } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [correctionDeadline, setCorrectionDeadline] = useState("");
  const [workflowPending, setWorkflowPending] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({
    type: "delay",
    severity: "medium",
    title: "",
    description: "",
    impactAmount: 0,
    impactDays: 0,
  });
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactForm, setContactForm] = useState({
    contractor_name: "",
    contractor_business_number: "",
    contractor_representative: "",
    contractor_address: "",
    contractor_phone: "",
    contractor_email: "",
    contractor_manager: "",
    contractor_manager_phone: "",
  });

  const { data: project, isLoading } = useQuery({
    queryKey: ["service-project", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_projects")
        .select("*, parking_lots(code, name), supervisor:profiles!service_projects_supervisor_id_fkey(name), inspector:profiles!service_projects_inspector_id_fkey(name)")
        .eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: milestones } = useQuery({
    queryKey: ["service-milestones", id],
    queryFn: async () => {
      const { data } = await supabase.from("service_milestones").select("*")
        .eq("project_id", id!).order("milestone_number");
      return data || [];
    },
    enabled: !!id,
  });

  const { data: deliverables } = useQuery({
    queryKey: ["service-deliverables", id],
    queryFn: async () => {
      const { data } = await supabase.from("service_deliverables").select("*")
        .eq("project_id", id!).order("sort_order");
      return data || [];
    },
    enabled: !!id,
  });

  const { data: inspections } = useQuery({
    queryKey: ["service-inspections", id],
    queryFn: async () => {
      const { data } = await supabase.from("service_inspections").select("*")
        .eq("project_id", id!).order("inspection_seq");
      return data || [];
    },
    enabled: !!id,
  });

  const { data: payments } = useQuery({
    queryKey: ["service-payments", id],
    queryFn: async () => {
      const { data } = await supabase.from("service_payments").select("*")
        .eq("project_id", id!).order("payment_seq");
      return data || [];
    },
    enabled: !!id,
  });

  const { data: issues } = useQuery({
    queryKey: ["service-issues", id],
    queryFn: async () => {
      const { data } = await supabase.from("service_issues").select("*")
        .eq("project_id", id!).order("reported_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["service-project", id] });
    queryClient.invalidateQueries({ queryKey: ["service-milestones", id] });
    queryClient.invalidateQueries({ queryKey: ["service-deliverables", id] });
    queryClient.invalidateQueries({ queryKey: ["service-inspections", id] });
    queryClient.invalidateQueries({ queryKey: ["service-payments", id] });
    queryClient.invalidateQueries({ queryKey: ["service-issues", id] });
  };

  const handleStatusChange = async (newStatus: string, extra: Record<string, any> = {}) => {
    if (!project) return;
    const { error } = await supabase.from("service_projects").update({
      status: newStatus, status_changed_at: new Date().toISOString(), ...extra,
    } as any).eq("id", project.id);
    if (error) { toast({ title: "상태 변경 실패", description: error.message, variant: "destructive" }); return; }
    await logActivity({ module: "service", action: "status_change", targetType: "service_project", targetId: project.id, targetName: project.title, details: { from: project.status, to: newStatus } });
    toast({ title: `상태가 "${PROJECT_STATUS_LABELS[newStatus]}"(으)로 변경되었습니다` });
    invalidateAll();
  };

  const handleMilestoneComplete = async (msId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("service_milestones").update({ status: "completed", actual_date: today } as any).eq("id", msId);
    if (error) { toast({ title: "실패", description: error.message, variant: "destructive" }); return; }
    toast({ title: "마일스톤 완료 처리됨 (진척률 자동 갱신)" });
    invalidateAll();
  };

  const handleCreateInspection = async () => {
    if (!id) return;
    setWorkflowPending("create-inspection");
    try {
      await createServiceInspection(id, {
        type: inspectionForm.type,
        title: inspectionForm.title,
        date: inspectionForm.date,
        targetAmount: inspectionForm.targetAmount,
      });
      toast({ title: "검수를 생성했습니다" });
      setInspectionOpen(false);
      setInspectionForm({ type: "progress", title: "", date: new Date().toISOString().slice(0, 10), targetAmount: 0 });
      invalidateAll();
    } catch (error: any) {
      toast({ title: "검수 생성 실패", description: error.message, variant: "destructive" });
    } finally {
      setWorkflowPending(null);
    }
  };

  const handleInspectionDecision = async (inspection: any, action: "approve" | "require_correction" | "submit_correction") => {
    setWorkflowPending(inspection.id);
    try {
      await decideServiceInspection(inspection.id, action, {
        note: actionNote,
        correctionDeadline,
      });
      toast({ title: action === "approve" ? "검수를 승인했습니다" : action === "require_correction" ? "보완을 요구했습니다" : "보완자료를 제출했습니다" });
      setInspectionAction(null);
      setActionNote("");
      setCorrectionDeadline("");
      invalidateAll();
    } catch (error: any) {
      toast({ title: "검수 처리 실패", description: error.message, variant: "destructive" });
    } finally {
      setWorkflowPending(null);
    }
  };

  const handlePaymentRequest = async (inspection: any) => {
    setWorkflowPending(inspection.id);
    try {
      await requestServicePayment(inspection.id, inspection.inspection_type === "final" ? "final" : "progress");
      toast({ title: "지급 요청을 생성했습니다" });
      invalidateAll();
    } catch (error: any) {
      toast({ title: "지급 요청 실패", description: error.message, variant: "destructive" });
    } finally {
      setWorkflowPending(null);
    }
  };

  const handlePaymentAction = async (payment: any, action: "approve" | "pay") => {
    setWorkflowPending(payment.id);
    try {
      await advanceServicePayment(payment.id, action);
      toast({ title: action === "approve" ? "지급을 승인했습니다" : "지급 완료로 처리했습니다" });
      invalidateAll();
    } catch (error: any) {
      toast({ title: "지급 처리 실패", description: error.message, variant: "destructive" });
    } finally {
      setWorkflowPending(null);
    }
  };

  const handleCreateIssue = async () => {
    if (!id || !project || !issueForm.title.trim() || !issueForm.description.trim()) return;
    setWorkflowPending("create-issue");
    const issueNumber = `${project.project_number}-ISS-${String((issues?.length || 0) + 1).padStart(2, "0")}`;
    const { error } = await supabase.from("service_issues").insert({
      project_id: id,
      issue_number: issueNumber,
      issue_type: issueForm.type,
      severity: issueForm.severity,
      title: issueForm.title.trim(),
      description: issueForm.description.trim(),
      impact_amount: issueForm.impactAmount || null,
      impact_days: issueForm.impactDays || null,
      status: "open",
      reported_at: new Date().toISOString(),
      reported_by: profile?.id || null,
    });
    setWorkflowPending(null);
    if (error) {
      toast({ title: "이슈 등록 실패", description: error.message, variant: "destructive" });
      return;
    }
    await logActivity({ module: "service", action: "create", targetType: "service_issue", targetName: issueNumber, details: { project_id: id } });
    toast({ title: "이슈를 등록했습니다" });
    setIssueOpen(false);
    setIssueForm({ type: "delay", severity: "medium", title: "", description: "", impactAmount: 0, impactDays: 0 });
    invalidateAll();
  };

  const handleIssueStatus = async (issue: any, status: "in_progress" | "resolved") => {
    setWorkflowPending(issue.id);
    const { error } = await supabase.from("service_issues").update({
      status,
      ...(status === "resolved" ? { resolved_at: new Date().toISOString(), resolved_by: profile?.id || null } : {}),
    }).eq("id", issue.id);
    setWorkflowPending(null);
    if (error) {
      toast({ title: "이슈 처리 실패", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: status === "resolved" ? "이슈를 해결 처리했습니다" : "이슈 처리를 시작했습니다" });
    invalidateAll();
  };

  const openContactEditor = () => {
    if (!project) return;
    setContactForm({
      contractor_name: project.contractor_name || "",
      contractor_business_number: project.contractor_business_number || "",
      contractor_representative: project.contractor_representative || "",
      contractor_address: project.contractor_address || "",
      contractor_phone: project.contractor_phone || "",
      contractor_email: project.contractor_email || "",
      contractor_manager: project.contractor_manager || "",
      contractor_manager_phone: project.contractor_manager_phone || "",
    });
    setContactOpen(true);
  };

  const saveContact = async () => {
    if (!project || !contactForm.contractor_name.trim()) return;
    setContactSaving(true);
    const payload = Object.fromEntries(Object.entries(contactForm).map(([key, value]) => [key, value.trim() || null]));
    const { error } = await supabase.from("service_projects").update(payload).eq("id", project.id);
    setContactSaving(false);
    if (error) {
      toast({ title: "업체 연락망 저장 실패", description: error.message, variant: "destructive" });
      return;
    }
    await logActivity({ module: "service", action: "contractor_contact_update", targetType: "service_project", targetId: project.id, targetName: project.title, details: { contractor_name: contactForm.contractor_name, contractor_manager: contactForm.contractor_manager } });
    queryClient.invalidateQueries({ queryKey: ["service-project", id] });
    queryClient.invalidateQueries({ queryKey: ["service-projects"] });
    setContactOpen(false);
    toast({ title: "수행업체 연락망을 수정했습니다" });
  };

  if (isLoading) return <DashboardLayout><div className="space-y-4 max-w-5xl"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div></DashboardLayout>;
  if (!project) return <DashboardLayout><div className="flex flex-col items-center py-20 gap-4"><p className="text-muted-foreground">사업을 찾을 수 없습니다</p><Button variant="outline" onClick={() => navigate("/service/projects")}>목록</Button></div></DashboardLayout>;

  const p = project;
  const progressColor = Number(p.progress_pct) >= 70 ? "text-green-600" : Number(p.progress_pct) >= 30 ? "text-yellow-600" : "text-destructive";

  return (
    <DashboardLayout>
      <div className="max-w-5xl space-y-6">
        {/* Header */}
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/service/projects")} className="mb-2 -ml-2"><ArrowLeft className="h-4 w-4 mr-1" /> 목록</Button>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">{p.title}</h2>
                <Badge variant="outline" className="font-mono text-[10px]">{p.project_number}</Badge>
                <Badge variant="outline" className={`text-[10px] ${PROJECT_STATUS_COLORS[p.status]}`}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{p.contractor_name} | {(p.supervisor as any)?.name || "-"} | {p.start_date} ~ {p.extended_end_date || p.end_date}</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-sm mb-1">
              <span>진척률</span>
              <span className={`font-bold ${progressColor}`}>{Number(p.progress_pct || 0).toFixed(1)}%</span>
            </div>
            <Progress value={Number(p.progress_pct || 0)} className="h-3" />
          </div>
        </div>

        <DocumentLinksPanel module="SERVICE" recordId={p.id} recordPath={`/service/projects/${p.id}`} recordTitle={p.title} />

        {/* Milestone Timeline */}
        {milestones && milestones.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {milestones.map((m: any, idx: number) => (
              <div key={m.id} className="flex items-center">
                <div className="flex flex-col items-center min-w-[80px]">
                  {m.status === "completed" ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : m.status === "in_progress" ? (
                    <Circle className="h-5 w-5 text-blue-600 fill-blue-600" />
                  ) : m.delay_days > 0 ? (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="text-[10px] mt-1 text-center">{m.title}</span>
                  {m.delay_days > 0 && m.status !== "completed" && (
                    <span className="text-[9px] text-destructive">D+{m.delay_days}일</span>
                  )}
                </div>
                {idx < milestones.length - 1 && <div className="h-px w-6 bg-border mt-[-16px]" />}
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <Tabs
          value={["info", "milestones", "deliverables", "inspections", "payments", "issues"].includes(searchParams.get("tab") || "") ? searchParams.get("tab")! : "info"}
          onValueChange={(tab) => setSearchParams(tab === "info" ? {} : { tab }, { replace: true })}
        >
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <TabsList className="w-max min-w-full justify-start">
              <TabsTrigger value="info">사업 정보</TabsTrigger>
              <TabsTrigger value="milestones">마일스톤</TabsTrigger>
              <TabsTrigger value="deliverables">성과물</TabsTrigger>
              <TabsTrigger value="inspections">검수</TabsTrigger>
              <TabsTrigger value="payments">대가지급</TabsTrigger>
              <TabsTrigger value="issues">이슈</TabsTrigger>
            </TabsList>
          </div>

          {/* Tab 1: Info */}
          <TabsContent value="info">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground font-mono">기본 정보</CardTitle></CardHeader>
                <CardContent>
                  <InfoRow label="유형" value={SERVICE_TYPE_LABELS[p.service_type]} />
                  <InfoRow label="분류" value={p.service_category} />
                  <InfoRow label="관련 주차장" value={(p.parking_lots as any)?.name} />
                  <InfoRow label="감독관" value={(p.supervisor as any)?.name} />
                  <InfoRow label="검수관" value={(p.inspector as any)?.name} />
                </CardContent>
              </Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground font-mono">금액</CardTitle></CardHeader>
                <CardContent>
                  <InfoRow label="계약금액" value={`${(p.contract_amount ?? 0).toLocaleString()}원`} />
                  <InfoRow label="부가세" value={`${(p.vat_amount || 0).toLocaleString()}원`} />
                  <InfoRow label="총액" value={`${(p.total_amount ?? 0).toLocaleString()}원`} />
                  <InfoRow label="지급액" value={`${(p.paid_amount || 0).toLocaleString()}원`} />
                  <InfoRow label="잔액" value={`${(p.remaining_amount || 0).toLocaleString()}원`} />
                  <InfoRow label="지급률" value={`${Number(p.payment_rate || 0).toFixed(1)}%`} />
                </CardContent>
              </Card>
              <Card><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-xs uppercase text-muted-foreground font-mono">수행업체</CardTitle>{canEdit && <Button variant="ghost" size="sm" onClick={openContactEditor}><Pencil className="mr-1 h-3.5 w-3.5" />연락망 수정</Button>}</div></CardHeader>
                <CardContent>
                  <InfoRow label="업체명" value={p.contractor_name} />
                  <InfoRow label="사업자번호" value={p.contractor_business_number} />
                  <InfoRow label="대표자" value={p.contractor_representative} />
                  <InfoRow label="주소" value={p.contractor_address} />
                  <InfoRow label="담당자" value={p.contractor_manager} />
                  <InfoRow label="대표전화" value={p.contractor_phone} />
                  <InfoRow label="담당자 연락처" value={p.contractor_manager_phone} />
                  <InfoRow label="이메일" value={p.contractor_email} />
                </CardContent>
              </Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground font-mono">기간</CardTitle></CardHeader>
                <CardContent>
                  <InfoRow label="계약일" value={p.contract_date} />
                  <InfoRow label="착수일" value={p.start_date} />
                  <InfoRow label="완료예정일" value={p.end_date} />
                  <InfoRow label="연장일수" value={p.extended_days} />
                  <InfoRow label="연장 완료일" value={p.extended_end_date} />
                  <InfoRow label="하자보증 종료" value={p.warranty_end} />
                </CardContent>
              </Card>
              {p.description && (
                <Card className="md:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground font-mono">사업 개요</CardTitle></CardHeader>
                  <CardContent><p className="text-sm whitespace-pre-wrap">{p.description}</p></CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Tab 2: Milestones */}
          <TabsContent value="milestones">
            <div className="space-y-3">
              {milestones?.map((m: any) => (
                <Card key={m.id}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{m.milestone_number}.</span>
                        <Badge variant="outline" className="text-[10px]">{MILESTONE_TYPE_LABELS[m.milestone_type]}</Badge>
                        <span className="text-sm font-medium">{m.title}</span>
                        <Badge variant="outline" className="text-[10px]">{MILESTONE_STATUS_LABELS[m.status]}</Badge>
                        {m.delay_days > 0 && m.status !== "completed" && <Badge variant="outline" className="text-[10px] text-destructive">D+{m.delay_days}일 지연</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{m.weight_pct}%</span>
                        {canEdit && m.status !== "completed" && (
                          <Button size="sm" variant="outline" onClick={() => handleMilestoneComplete(m.id)}>완료 처리</Button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>목표: {m.target_date}</span>
                      <span>실제: {m.actual_date || "-"}</span>
                      {m.deliverables_expected && <span>성과물: {m.deliverables_expected}</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!milestones?.length && <p className="text-sm text-muted-foreground text-center py-8">마일스톤 없음</p>}
            </div>
          </TabsContent>

          {/* Tab 3: Deliverables */}
          <TabsContent value="deliverables">
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>번호</TableHead><TableHead>제목</TableHead><TableHead>유형</TableHead>
                  <TableHead>형식</TableHead><TableHead>제출일</TableHead><TableHead>상태</TableHead><TableHead>보완</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {deliverables?.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs font-mono">{d.deliverable_number}</TableCell>
                      <TableCell className="text-sm">{d.title}</TableCell>
                      <TableCell className="text-xs">{d.deliverable_type}</TableCell>
                      <TableCell className="text-xs">{d.format_required || "-"}</TableCell>
                      <TableCell className="text-xs">{d.submitted_at ? new Date(d.submitted_at).toLocaleDateString() : "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{DELIVERABLE_STATUS_LABELS[d.status] || d.status}</Badge></TableCell>
                      <TableCell className="text-xs">{d.revision_count}</TableCell>
                    </TableRow>
                  ))}
                  {!deliverables?.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">성과물 없음</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {/* Tab 4: Inspections */}
          <TabsContent value="inspections">
            {canEdit && <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setInspectionOpen(true)}><Plus className="mr-1 h-4 w-4" />검수 생성</Button></div>}
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>번호</TableHead><TableHead>유형</TableHead><TableHead>차수</TableHead>
                  <TableHead>검수일</TableHead><TableHead className="text-right">대상금액</TableHead>
                  <TableHead className="text-right">승인금액</TableHead><TableHead>결과</TableHead><TableHead>상태</TableHead><TableHead>실행</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {inspections?.map((i: any) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs font-mono">{i.inspection_number}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{INSPECTION_TYPE_LABELS[i.inspection_type]}</Badge></TableCell>
                      <TableCell className="text-sm">{i.inspection_seq}차</TableCell>
                      <TableCell className="text-sm">{i.inspection_date}</TableCell>
                      <TableCell className="text-right text-sm">{formatServiceAmount(i.target_amount)}</TableCell>
                      <TableCell className="text-right text-sm">{i.approved_amount ? formatServiceAmount(i.approved_amount) : "-"}</TableCell>
                      <TableCell>{i.result ? <Badge variant="outline" className={`text-[10px] ${RESULT_COLORS[i.result] || ''}`}>{RESULT_LABELS[i.result]}</Badge> : "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{INSPECTION_STATUS_LABELS[i.status]}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {canApprove && ["pending", "correction_submitted"].includes(i.status) && <Button size="sm" onClick={() => handleInspectionDecision(i, "approve")} disabled={workflowPending === i.id}>승인</Button>}
                          {canApprove && ["pending", "correction_submitted"].includes(i.status) && <Button size="sm" variant="outline" onClick={() => setInspectionAction({ item: i, action: "require_correction" })}>보완</Button>}
                          {canEdit && i.status === "correction_required" && <Button size="sm" variant="outline" onClick={() => setInspectionAction({ item: i, action: "submit_correction" })}>보완 제출</Button>}
                          {canApprove && i.status === "approved" && !payments?.some((payment: any) => payment.inspection_id === i.id && payment.status !== "cancelled") && (
                            <Button size="sm" variant="outline" onClick={() => handlePaymentRequest(i)} disabled={workflowPending === i.id}>지급 요청</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!inspections?.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">검수 내역 없음</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {/* Tab 5: Payments */}
          <TabsContent value="payments">
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>번호</TableHead><TableHead>유형</TableHead><TableHead>차수</TableHead>
                  <TableHead className="text-right">청구금액</TableHead><TableHead className="text-right">공제</TableHead>
                  <TableHead className="text-right">실지급</TableHead><TableHead>청구일</TableHead>
                  <TableHead>지급일</TableHead><TableHead>상태</TableHead><TableHead>실행</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {payments?.map((py: any) => (
                    <TableRow key={py.id} className={py.is_delayed ? "bg-destructive/5" : ""}>
                      <TableCell className="text-xs font-mono">{py.payment_number}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{PAYMENT_TYPE_LABELS[py.payment_type]}</Badge></TableCell>
                      <TableCell className="text-sm">{py.payment_seq}차</TableCell>
                      <TableCell className="text-right text-sm">{formatServiceAmount(py.gross_amount)}</TableCell>
                      <TableCell className="text-right text-sm">{formatServiceAmount((py.advance_deduction || 0) + (py.other_deduction || 0))}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatServiceAmount(py.net_amount || 0)}</TableCell>
                      <TableCell className="text-xs">{py.request_date}</TableCell>
                      <TableCell className="text-xs">{py.paid_date || "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{PAYMENT_STATUS_LABELS[py.status]}</Badge></TableCell>
                      <TableCell>
                        {canApprove && ["requested", "reviewing"].includes(py.status) && <Button size="sm" onClick={() => handlePaymentAction(py, "approve")} disabled={workflowPending === py.id}>지급 승인</Button>}
                        {canApprove && py.status === "approved" && <Button size="sm" onClick={() => handlePaymentAction(py, "pay")} disabled={workflowPending === py.id}>지급 완료</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!payments?.length && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">지급 내역 없음</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {/* Tab 6: Issues */}
          <TabsContent value="issues">
            {canEdit && <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setIssueOpen(true)}><Plus className="mr-1 h-4 w-4" />이슈 등록</Button></div>}
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>번호</TableHead><TableHead>유형</TableHead><TableHead>심각도</TableHead>
                  <TableHead>제목</TableHead><TableHead className="text-right">금액영향</TableHead>
                  <TableHead className="text-right">일정영향</TableHead><TableHead>상태</TableHead><TableHead>실행</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {issues?.map((i: any) => (
                    <TableRow key={i.id} className={i.severity === "critical" ? "bg-destructive/5" : ""}>
                      <TableCell className="text-xs font-mono">{i.issue_number}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{ISSUE_TYPE_LABELS[i.issue_type]}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[i.severity]}`}>{SEVERITY_LABELS[i.severity]}</Badge></TableCell>
                      <TableCell className="text-sm">{i.title}</TableCell>
                      <TableCell className="text-right text-sm">{i.impact_amount ? formatServiceAmount(i.impact_amount) : "-"}</TableCell>
                      <TableCell className="text-right text-sm">{i.impact_days ? `${i.impact_days}일` : "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{ISSUE_STATUS_LABELS[i.status]}</Badge></TableCell>
                      <TableCell>
                        {canEdit && i.status === "open" && <Button size="sm" variant="outline" onClick={() => handleIssueStatus(i, "in_progress")} disabled={workflowPending === i.id}>처리 시작</Button>}
                        {canEdit && i.status === "in_progress" && <Button size="sm" onClick={() => handleIssueStatus(i, "resolved")} disabled={workflowPending === i.id}>해결 완료</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!issues?.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">등록된 이슈가 없습니다</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        <Dialog open={inspectionOpen} onOpenChange={setInspectionOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>검수 생성</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>검수명 *</Label><Input value={inspectionForm.title} onChange={(event) => setInspectionForm((form) => ({ ...form, title: event.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>유형</Label>
                  <Select value={inspectionForm.type} onValueChange={(value) => setInspectionForm((form) => ({ ...form, type: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(INSPECTION_TYPE_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>검수일</Label><Input type="date" value={inspectionForm.date} onChange={(event) => setInspectionForm((form) => ({ ...form, date: event.target.value }))} /></div>
              </div>
              <div><Label>대상금액 *</Label><Input type="number" value={inspectionForm.targetAmount} onChange={(event) => setInspectionForm((form) => ({ ...form, targetAmount: Number(event.target.value) || 0 }))} /></div>
              <Button className="w-full" onClick={handleCreateInspection} disabled={!inspectionForm.title.trim() || inspectionForm.targetAmount <= 0 || workflowPending === "create-inspection"}>생성</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={contactOpen} onOpenChange={setContactOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>수행업체 연락망 수정</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label>업체명 *</Label><Input value={contactForm.contractor_name} onChange={(event) => setContactForm((form) => ({ ...form, contractor_name: event.target.value }))} /></div>
              <div><Label>사업자등록번호</Label><Input value={contactForm.contractor_business_number} onChange={(event) => setContactForm((form) => ({ ...form, contractor_business_number: event.target.value }))} /></div>
              <div><Label>대표자</Label><Input value={contactForm.contractor_representative} onChange={(event) => setContactForm((form) => ({ ...form, contractor_representative: event.target.value }))} /></div>
              <div><Label>대표전화</Label><Input type="tel" value={contactForm.contractor_phone} onChange={(event) => setContactForm((form) => ({ ...form, contractor_phone: event.target.value }))} /></div>
              <div><Label>업체 담당자</Label><Input value={contactForm.contractor_manager} onChange={(event) => setContactForm((form) => ({ ...form, contractor_manager: event.target.value }))} /></div>
              <div><Label>담당자 연락처</Label><Input type="tel" value={contactForm.contractor_manager_phone} onChange={(event) => setContactForm((form) => ({ ...form, contractor_manager_phone: event.target.value }))} /></div>
              <div><Label>이메일</Label><Input type="email" value={contactForm.contractor_email} onChange={(event) => setContactForm((form) => ({ ...form, contractor_email: event.target.value }))} /></div>
              <div><Label>주소</Label><Input value={contactForm.contractor_address} onChange={(event) => setContactForm((form) => ({ ...form, contractor_address: event.target.value }))} /></div>
            </div>
            <Button className="w-full" onClick={saveContact} disabled={!contactForm.contractor_name.trim() || contactSaving}>{contactSaving ? "저장 중..." : "연락망 저장"}</Button>
          </DialogContent>
        </Dialog>

        <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>용역 이슈 등록</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>유형</Label><Select value={issueForm.type} onValueChange={(type) => setIssueForm((form) => ({ ...form, type }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ISSUE_TYPE_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>심각도</Label><Select value={issueForm.severity} onValueChange={(severity) => setIssueForm((form) => ({ ...form, severity }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SEVERITY_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div><Label>제목 *</Label><Input value={issueForm.title} onChange={(event) => setIssueForm((form) => ({ ...form, title: event.target.value }))} /></div>
              <div><Label>내용 *</Label><Textarea rows={4} value={issueForm.description} onChange={(event) => setIssueForm((form) => ({ ...form, description: event.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>금액 영향</Label><Input type="number" min={0} value={issueForm.impactAmount} onChange={(event) => setIssueForm((form) => ({ ...form, impactAmount: Number(event.target.value) || 0 }))} /></div>
                <div><Label>일정 영향(일)</Label><Input type="number" min={0} value={issueForm.impactDays} onChange={(event) => setIssueForm((form) => ({ ...form, impactDays: Number(event.target.value) || 0 }))} /></div>
              </div>
              <Button className="w-full" onClick={handleCreateIssue} disabled={!issueForm.type || !issueForm.severity || !issueForm.title.trim() || !issueForm.description.trim() || workflowPending === "create-issue"}>이슈 등록</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(inspectionAction)} onOpenChange={(open) => { if (!open) setInspectionAction(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{inspectionAction?.action === "require_correction" ? "보완 요구" : "보완자료 제출"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{inspectionAction?.action === "require_correction" ? "보완 사유" : "보완 내용"} *</Label><Textarea value={actionNote} onChange={(event) => setActionNote(event.target.value)} rows={4} /></div>
              {inspectionAction?.action === "require_correction" && <div><Label>보완 기한 *</Label><Input type="date" value={correctionDeadline} onChange={(event) => setCorrectionDeadline(event.target.value)} /></div>}
              <Button
                className="w-full"
                onClick={() => inspectionAction && handleInspectionDecision(inspectionAction.item, inspectionAction.action)}
                disabled={!actionNote.trim() || (inspectionAction?.action === "require_correction" && !correctionDeadline) || Boolean(workflowPending)}
              >
                {inspectionAction?.action === "require_correction" ? "보완 요구" : "제출"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Status Action Buttons */}
        {canEdit && (
          <Card>
            <CardContent className="pt-4 pb-4 flex gap-2 flex-wrap">
              {p.status === "preparing" && (
                <Button onClick={() => handleStatusChange("in_progress", { actual_start_date: new Date().toISOString().slice(0, 10) })}>착수</Button>
              )}
              {p.status === "in_progress" && (
                <>
                  <Button onClick={() => handleStatusChange("inspection")}>검수 요청</Button>
                  <Button variant="outline" className="text-orange-600" onClick={() => handleStatusChange("suspended")}>중지</Button>
                </>
              )}
              {p.status === "inspection" && canApprove && (
                <Button onClick={() => handleStatusChange("completed", { actual_end_date: new Date().toISOString().slice(0, 10) })}>준공 처리</Button>
              )}
              {p.status === "completed" && (
                <Button onClick={() => handleStatusChange("warranty", { warranty_start: new Date().toISOString().slice(0, 10) })}>하자보증 시작</Button>
              )}
              {p.status === "warranty" && canApprove && (
                <Button onClick={() => handleStatusChange("closed")}>종결</Button>
              )}
              {p.status === "suspended" && (
                <Button onClick={() => handleStatusChange("in_progress")}>재개</Button>
              )}
              {canApprove && !["closed", "terminated"].includes(p.status) && (
                <Button variant="outline" className="text-destructive" onClick={() => handleStatusChange("terminated")}>해지</Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
