import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import {
  CHANNEL_LABELS, CATEGORY_LABELS, COMPLAINT_STATUS_LABELS, COMPLAINT_STATUS_COLORS,
  PRIORITY_LABELS, PRIORITY_COLORS, COMMENT_TYPE_LABELS, RESOLUTION_TYPE_LABELS, getDDay,
} from "@/types/complaint";
import { ArrowLeft, MessageCircle, Lock, Send, Star, UserPlus, Play, Reply, CheckCircle, RotateCcw, ExternalLink, Sparkles, Repeat2, Pencil, ClipboardList } from "lucide-react";
import { useModuleLicenses, useSystemConfig } from "@/hooks/useSystemConfig";
import { callAI, reviewAIAssistance, type AISource } from "@/lib/ai-service";
import { runtimeConfig } from "@/config/runtime-config";
import { assignComplaint } from "@/lib/workflow-commands";
import { isModuleEnabled } from "@/lib/authorization";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { ComplaintEditDialog } from "@/components/complaint/ComplaintEditDialog";
import { ComplaintFieldWorkPanel } from "@/components/complaint/ComplaintFieldWorkPanel";
import { MaskedField } from "@/components/security/MaskedField";
import { LOT_TYPE_LABELS, TEAM_LABELS, type LotType, type TeamType } from "@/types/database";
import {
  getComplaintNextAction,
  isFieldVerificationRequired,
  validateComplaintClosure,
  validateComplaintResponse,
} from "@/lib/complaint-field-work";
import { getRecommendedDueDate } from "@/lib/parking-lot-work-profile";
import { useAuthorization } from "@/hooks/useAuthorization";
import { MAINT_STATUS_LABELS } from "@/types/facility";

export default function ComplaintDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { canEdit } = useAuthorization("COMPLAINT");
  const { data: licenses } = useModuleLicenses();
  const { data: config } = useSystemConfig();
  const aiEnabled = runtimeConfig.externalAiEnabled && config?.ai_enabled === 'true';
  const opsActive = isModuleEnabled(licenses, "OPS");

  const [commentText, setCommentText] = useState("");
  const [commentType, setCommentType] = useState("internal");
  const [responseDialog, setResponseDialog] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [responseChannel, setResponseChannel] = useState("phone");
  const [responseType, setResponseType] = useState("resolved");
  const [noVisitReason, setNoVisitReason] = useState("");
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [closeDialog, setCloseDialog] = useState(false);
  const [resolutionType, setResolutionType] = useState("resolved");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [pendingDialog, setPendingDialog] = useState(false);
  const [pendingOrganization, setPendingOrganization] = useState("");
  const [pendingReason, setPendingReason] = useState("");
  const [pendingFollowUpDate, setPendingFollowUpDate] = useState(() => getRecommendedDueDate(2));
  const [reopenDialog, setReopenDialog] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [satDialog, setSatDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [satScore, setSatScore] = useState(3);
  const [satFeedback, setSatFeedback] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiDraftMeta, setAiDraftMeta] = useState<{ id?: string; initial: string; confidence?: number; sources: AISource[] } | null>(null);

  const { data: complaint, isLoading } = useQuery({
    queryKey: ["complaint", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("complaints")
        .select("*, parking_lots(code, name, lot_type), profiles!complaints_assigned_to_fkey(name, team)")
        .eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: comments } = useQuery({
    queryKey: ["complaint-comments", id],
    queryFn: async () => {
      const { data } = await supabase.from("complaint_comments")
        .select("*").eq("complaint_id", id!).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: staffList } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, name, team").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: recentComplaints } = useQuery({
    queryKey: ["lot-recent-complaints", complaint?.lot_id],
    queryFn: async () => {
      const { data } = await supabase.from("complaints").select("id, complaint_number, title, status")
        .eq("lot_id", complaint!.lot_id!).neq("id", id!).order("received_at", { ascending: false }).limit(5);
      return data || [];
    },
    enabled: !!complaint?.lot_id,
  });

  const { data: relatedComplaint } = useQuery({
    queryKey: ["related-complaint", complaint?.related_complaint_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("complaints")
        .select("id, complaint_number, title, status")
        .eq("id", complaint!.related_complaint_id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!complaint?.related_complaint_id,
  });

  const { data: linkedFacilityWork } = useQuery({
    queryKey: ["complaint-linked-facility-work", id, complaint?.complaint_number],
    queryFn: async () => {
      const linked = await (supabase.from("maintenance_logs") as any)
        .select("id, log_number, title, status, due_date")
        .eq("source_module", "COMPLAINT")
        .eq("source_record_id", id!)
        .maybeSingle();
      if (!linked.error) {
        return linked.data as { id: string; log_number: string; title: string; status: string; due_date?: string | null } | null;
      }
      if (!["PGRST204", "42703"].includes(linked.error.code)) throw linked.error;

      const legacy = await supabase.from("maintenance_logs")
        .select("id, log_number, title, status, due_date")
        .ilike("description", `${complaint!.complaint_number}%`)
        .maybeSingle();
      if (legacy.error) throw legacy.error;
      return legacy.data;
    },
    enabled: !!id && !!complaint?.complaint_number,
  });

  useEffect(() => {
    if (!complaint || searchParams.get("action") !== "assign") return;
    setAssignTo(complaint.assigned_to || "");
    setAssignDialog(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("action");
    setSearchParams(nextParams, { replace: true });
  }, [complaint, searchParams, setSearchParams]);

  const updateStatus = async (newStatus: string, extra: Record<string, any> = {}) => {
    if (!canEdit) return false;
    const { error } = await supabase.from("complaints").update({ status: newStatus, ...extra }).eq("id", id!);
    if (error) { toast({ title: "상태 변경 실패", description: error.message, variant: "destructive" }); return false; }
    await logActivity({ module: "COMPLAINT", action: `상태변경→${newStatus}`, targetType: "complaint", targetId: id!, targetName: complaint?.complaint_number });
    queryClient.invalidateQueries({ queryKey: ["complaint", id] });
    queryClient.invalidateQueries({ queryKey: ["complaint-comments", id] });
    queryClient.invalidateQueries({ queryKey: ["complaints"] });
    toast({ title: "상태가 변경되었습니다" });
    return true;
  };

  const addComment = async () => {
    if (!canEdit) return;
    if (!commentText.trim()) return;
    const extra: any = {};
    if (commentType === "external") extra.response = commentText;

    await supabase.from("complaint_comments").insert({
      complaint_id: id!, author_id: profile!.id, author_name: profile!.name,
      content: commentText, comment_type: commentType,
    });

    if (commentType === "external") {
      await supabase.from("complaints").update({ response: commentText }).eq("id", id!);
    }

    if (aiDraftMeta) {
      await reviewAIAssistance(aiDraftMeta.id, {
        applied: true,
        edited: commentText !== aiDraftMeta.initial,
        targetType: "complaint",
        targetId: id,
      });
      setAiDraftMeta(null);
    }

    setCommentText("");
    queryClient.invalidateQueries({ queryKey: ["complaint-comments", id] });
    toast({ title: "코멘트가 등록되었습니다" });
  };

  const handleAssign = async () => {
    if (!canEdit || !assignTo) return;
    try {
      await assignComplaint(id!, assignTo, complaint?.updated_at);
      setAssignDialog(false);
      queryClient.invalidateQueries({ queryKey: ["complaint", id] });
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast({ title: "담당자가 배정되었습니다" });
    } catch (error: any) {
      toast({ title: "담당자 배정 실패", description: error.message, variant: "destructive" });
    }
  };

  const handleAssignToMe = async () => {
    if (!canEdit || !profile?.id) return;
    try {
      await assignComplaint(id!, profile.id, complaint?.updated_at);
      queryClient.invalidateQueries({ queryKey: ["complaint", id] });
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast({ title: "내 업무로 배정되었습니다", description: "바로 처리를 시작하거나 현장 확인을 등록할 수 있습니다." });
    } catch (error: any) {
      toast({ title: "담당자 배정 실패", description: error.message, variant: "destructive" });
    }
  };

  const handleResponse = async () => {
    const fieldRequired = isFieldVerificationRequired(complaint?.category, (complaint as any)?.parking_lots?.lot_type, complaint?.sub_category);
    const fieldVisitCount = comments?.filter((comment) => comment.comment_type === "field_visit").length || 0;
    const errors = validateComplaintResponse({ response: responseText, responseType, fieldRequired, fieldVisitCount, noVisitReason });
    if (errors.length) {
      toast({ title: "회신 전 확인이 필요합니다", description: errors.join(" "), variant: "destructive" });
      return;
    }
    const changed = await updateStatus("responded", {
      response: responseText, response_type: responseType, responded_at: new Date().toISOString(), response_channel: responseChannel,
    });
    if (!changed) return;
    await supabase.from("complaint_comments").insert({
      complaint_id: id!, author_id: profile!.id, author_name: profile!.name,
      content: responseText, comment_type: "external",
    });
    if (fieldRequired && fieldVisitCount === 0) {
      await supabase.from("complaint_comments").insert({
        complaint_id: id!, author_id: profile!.id, author_name: profile!.name,
        content: `현장확인 미실시 사유: ${noVisitReason.trim()}`, comment_type: "internal",
      });
    }
    await queryClient.invalidateQueries({ queryKey: ["complaint-comments", id] });
    setResponseDialog(false);
    setResponseText("");
    setNoVisitReason("");
  };

  const handleClose = async () => {
    const errors = validateComplaintClosure(resolutionType, resolutionSummary, closeConfirmed);
    if (errors.length) {
      toast({ title: "종결 전 확인이 필요합니다", description: errors.join(" "), variant: "destructive" });
      return;
    }
    const changed = await updateStatus("closed", {
      closed_at: new Date().toISOString(), closed_by: profile?.id, resolution_type: resolutionType,
      notes: [complaint?.notes, `[종결 근거] ${resolutionSummary.trim()}`].filter(Boolean).join("\n"),
    });
    if (!changed) return;
    await supabase.from("complaint_comments").insert({
      complaint_id: id!, author_id: profile!.id, author_name: profile!.name,
      content: resolutionSummary.trim(), comment_type: "closure",
    });
    await queryClient.invalidateQueries({ queryKey: ["complaint-comments", id] });
    setCloseDialog(false);
    setResolutionSummary("");
    setCloseConfirmed(false);
  };

  const handlePendingExternal = async () => {
    if (!pendingOrganization.trim() || !pendingReason.trim() || !pendingFollowUpDate) {
      toast({ title: "외부대기 정보를 모두 입력하세요", variant: "destructive" });
      return;
    }
    const changed = await updateStatus("pending_external");
    if (!changed) return;
    await supabase.from("complaint_comments").insert({
      complaint_id: id!, author_id: profile!.id, author_name: profile!.name,
      content: `기관·업체: ${pendingOrganization.trim()}\n대기 사유: ${pendingReason.trim()}\n재확인 예정일: ${pendingFollowUpDate}`,
      comment_type: "external_wait",
    });
    await queryClient.invalidateQueries({ queryKey: ["complaint-comments", id] });
    setPendingDialog(false);
    setPendingOrganization("");
    setPendingReason("");
    setPendingFollowUpDate(getRecommendedDueDate(2));
  };

  const handleReopen = async () => {
    if (reopenReason.trim().length < 5) {
      toast({ title: "재개 사유를 5자 이상 입력하세요", variant: "destructive" });
      return;
    }
    const changed = await updateStatus("reopened", { closed_at: null, closed_by: null });
    if (!changed) return;
    await supabase.from("complaint_comments").insert({
      complaint_id: id!, author_id: profile!.id, author_name: profile!.name,
      content: reopenReason.trim(), comment_type: "reopen",
    });
    await queryClient.invalidateQueries({ queryKey: ["complaint-comments", id] });
    setReopenDialog(false);
    setReopenReason("");
  };

  const handleSatisfaction = async () => {
    await supabase.from("complaints").update({
      satisfaction_score: satScore, satisfaction_feedback: satFeedback || null, satisfaction_date: new Date().toISOString().slice(0, 10),
    }).eq("id", id!);
    setSatDialog(false);
    queryClient.invalidateQueries({ queryKey: ["complaint", id] });
    toast({ title: "만족도가 입력되었습니다" });
  };

  const toggleRepeatComplaint = async () => {
    if (!canEdit) return;
    const nextRepeat = !complaint?.is_repeat;
    const { error } = await supabase.from("complaints").update({
      is_repeat: nextRepeat,
      repeat_count: nextRepeat ? Math.max(2, complaint?.repeat_count || 0) : 0,
    }).eq("id", id!);
    if (error) {
      toast({ title: "반복민원 변경 실패", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["complaint", id] });
    queryClient.invalidateQueries({ queryKey: ["complaints"] });
    toast({ title: nextRepeat ? "반복민원으로 지정했습니다" : "반복민원 지정을 해제했습니다" });
  };

  if (isLoading) return <DashboardLayout><Skeleton className="h-96" /></DashboardLayout>;
  if (!complaint) return <DashboardLayout><p>민원을 찾을 수 없습니다</p></DashboardLayout>;

  const dday = getDDay(complaint.due_date);
  const lotType = (complaint as any).parking_lots?.lot_type as string | undefined;
  const fieldVisitCount = comments?.filter((comment) => comment.comment_type === "field_visit").length || 0;
  const fieldRequired = isFieldVerificationRequired(complaint.category, lotType, complaint.sub_category);
  const nextAction = getComplaintNextAction(complaint.status, fieldRequired, fieldVisitCount, Boolean(complaint.response));
  const canSelfAssign = canEdit && Boolean(
    profile?.id && (!complaint.assigned_team || complaint.assigned_team === profile.team),
  );

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/complaints")}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant="outline" className="font-mono text-xs">{complaint.complaint_number}</Badge>
              <Badge variant="outline">{CATEGORY_LABELS[complaint.category] || complaint.category}</Badge>
              <Badge className={PRIORITY_COLORS[complaint.priority]}>{PRIORITY_LABELS[complaint.priority]}</Badge>
              <Badge className={`text-sm ${COMPLAINT_STATUS_COLORS[complaint.status]}`}>{COMPLAINT_STATUS_LABELS[complaint.status]}</Badge>
            </div>
            <h2 className="text-lg font-bold">{complaint.title}</h2>
            <p className="text-xs text-muted-foreground">
              접수: {CHANNEL_LABELS[complaint.channel]} | {complaint.received_at?.slice(0, 10)} | 기한: <span className={dday.isOverdue ? "text-destructive font-bold" : ""}>{complaint.due_date?.slice(0, 10) || "미지정"} ({dday.text})</span>
            </p>
          </div>
          {canEdit && <Button variant="outline" size="sm" onClick={() => setEditDialog(true)}><Pencil className="h-4 w-4 mr-1" />정보 수정</Button>}
        </div>

        <DocumentLinksPanel
          module="COMPLAINT"
          recordId={complaint.id}
          recordPath={`/complaints/${complaint.id}`}
          recordTitle={complaint.title}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">민원 내용</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm whitespace-pre-wrap">{complaint.content}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground border-t pt-2 mt-2">
                  {complaint.parking_lots && <span className="flex items-center gap-1.5">주차장: {(complaint as any).parking_lots.name}{(complaint as any).parking_lots.lot_type && <Badge variant="secondary" className="text-[9px]">{LOT_TYPE_LABELS[(complaint as any).parking_lots.lot_type as LotType]}</Badge>}</span>}
                  {complaint.incident_date && <span>사건일: {complaint.incident_date}</span>}
                  {complaint.location_detail && <span>위치: {complaint.location_detail}</span>}
                  {complaint.vehicle_number && <span>차량: {complaint.vehicle_number}</span>}
                </div>
                {opsActive && complaint.category === "enforcement_appeal" && complaint.vehicle_number && (
                  <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => navigate(`/ops/enforcement?vehicle=${complaint.vehicle_number}`)}>
                    <ExternalLink className="h-3 w-3 mr-1" />관련 단속 기록 조회
                  </Button>
                )}
              </CardContent>
            </Card>

            {linkedFacilityWork && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">{linkedFacilityWork.log_number}</Badge>
                      <Badge variant="secondary">{MAINT_STATUS_LABELS[linkedFacilityWork.status as keyof typeof MAINT_STATUS_LABELS] || linkedFacilityWork.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium">연계 시설작업</p>
                    <p className="text-xs text-muted-foreground">처리기한 {linkedFacilityWork.due_date?.slice(0, 10) || "미지정"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/facility/maintenance?work=${linkedFacilityWork.id}`)}>
                    <ExternalLink className="mr-2 h-4 w-4" />시설작업 열기
                  </Button>
                </CardContent>
              </Card>
            )}

            <ComplaintFieldWorkPanel
              complaintId={complaint.id}
              complaintNumber={complaint.complaint_number}
              lotType={lotType}
              subCategory={complaint.sub_category}
              status={complaint.status}
              canEdit={canEdit}
              authorId={profile!.id}
              authorName={profile!.name || "담당자"}
              comments={comments || []}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ["complaint", id] });
                queryClient.invalidateQueries({ queryKey: ["complaint-comments", id] });
                queryClient.invalidateQueries({ queryKey: ["complaints"] });
              }}
            />

            {/* Timeline */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">처리 타임라인</CardTitle></CardHeader>
              <CardContent>
                {/* Comment input */}
                <div className="mb-4 space-y-2 border-b pb-4">
                  <Textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder={canEdit ? "코멘트 입력..." : "조회 권한으로는 코멘트를 등록할 수 없습니다."} rows={3} className="text-sm" disabled={!canEdit} />
                  <div className="flex items-center gap-2">
                    <Select value={commentType} onValueChange={setCommentType}>
                      <SelectTrigger className="w-32 h-8 text-xs" disabled={!canEdit}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">내부메모</SelectItem>
                        <SelectItem value="external">민원인회신</SelectItem>
                        <SelectItem value="escalation">상향보고</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={addComment} disabled={!canEdit || !commentText.trim()}>
                      <Send className="h-3.5 w-3.5 mr-1" />등록
                    </Button>
                    {aiEnabled && commentType === 'external' && (
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="sm" className="text-xs gap-1" disabled={aiDrafting}
                          onClick={async () => {
                            setAiDrafting(true);
                            try {
                              const result = await callAI({
                                task: 'draft_response',
                                input: { title: complaint.title, content: complaint.content, category: complaint.category },
                                context: `주차장: ${(complaint as any).parking_lots?.name || '미지정'}\n유형: ${CATEGORY_LABELS[complaint.category]}\n민원인: ${complaint.complainant_name || '익명'}`,
                              });
                              const draft = result.result || JSON.stringify(result);
                              setCommentText(draft);
                              setAiDraftMeta({ id: result.assistanceId, initial: draft, confidence: result.confidence, sources: result.sources });
                              await logActivity({ module: 'ai', action: 'draft_response', details: { complaint_id: id } });
                              toast({ title: "AI 답변 초안이 생성되었습니다" });
                            } catch (e: any) {
                              toast({ title: "AI 답변 생성 실패", description: e.message, variant: "destructive" });
                            } finally { setAiDrafting(false); }
                          }}>
                          <Sparkles className="h-3 w-3" />{aiDrafting ? "생성 중..." : "AI 답변"}
                        </Button>
                        <span className="text-[9px] text-muted-foreground hidden md:inline">
                          {aiDraftMeta?.confidence != null ? `신뢰도 ${Math.round(aiDraftMeta.confidence * 100)}% · ` : ""}
                          근거 {aiDraftMeta?.sources.map((source) => source.label).slice(0, 3).join(", ") || "현재 민원"} · 검토 후 발송
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comments list */}
                <div className="relative space-y-0">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  {comments?.map(c => (
                    <div key={c.id} className="relative pl-10 py-3">
                      <div className={`absolute left-2.5 top-4 w-3 h-3 rounded-full border-2 border-background ${
                        c.is_system ? "bg-muted-foreground" : c.comment_type === "external" ? "bg-blue-500" : c.comment_type === "field_visit" ? "bg-emerald-500" : c.comment_type === "escalation" ? "bg-orange-500" : "bg-primary"
                      }`} />
                      <div className={`rounded-lg p-3 text-sm ${
                        c.is_system ? "bg-muted" : c.comment_type === "external" ? "bg-blue-50 dark:bg-blue-950/20" : c.comment_type === "internal" ? "bg-yellow-50 dark:bg-yellow-950/20" : "bg-card border"
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium">{c.is_system ? "시스템" : c.author_name}</span>
                          <Badge variant="outline" className="text-[9px]">
                            {c.comment_type === "internal" && <Lock className="h-2.5 w-2.5 mr-0.5" />}
                            {COMMENT_TYPE_LABELS[c.comment_type] || c.comment_type}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">{new Date(c.created_at).toLocaleString("ko-KR")}</span>
                        </div>
                        <p className="text-sm">{c.content}</p>
                        {c.status_from && c.status_to && (
                          <div className="flex items-center gap-1 mt-1">
                            <Badge variant="outline" className="text-[9px]">{COMPLAINT_STATUS_LABELS[c.status_from] || c.status_from}</Badge>
                            <span className="text-[10px]">→</span>
                            <Badge className={`text-[9px] ${COMPLAINT_STATUS_COLORS[c.status_to] || ""}`}>{COMPLAINT_STATUS_LABELS[c.status_to] || c.status_to}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {!comments?.length && <p className="text-sm text-muted-foreground text-center py-4 pl-10">아직 처리 이력이 없습니다</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right 1/3 */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">민원인 정보</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                {complaint.is_anonymous ? <p className="text-muted-foreground">익명</p> : (
                  <>
                    <p>
                      {complaint.complainant_name ? (
                        <MaskedField alwaysMask value={complaint.complainant_name} field="name" sourceField="complainant_name" table="complaints" recordId={complaint.id} createdBy={complaint.created_by} />
                      ) : "-"}
                    </p>
                    {complaint.complainant_phone && (
                      <p className="text-xs text-muted-foreground">
                        <MaskedField alwaysMask value={complaint.complainant_phone} field="phone" sourceField="complainant_phone" table="complaints" recordId={complaint.id} createdBy={complaint.created_by} />
                      </p>
                    )}
                    {complaint.complainant_email && (
                      <p className="text-xs text-muted-foreground">
                        <MaskedField alwaysMask value={complaint.complainant_email} field="email" sourceField="complainant_email" table="complaints" recordId={complaint.id} createdBy={complaint.created_by} />
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">배정 정보</CardTitle>
                  {canEdit && <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setAssignDialog(true)}>
                    <UserPlus className="h-3 w-3 mr-1" />재배정
                  </Button>}
                </div>
              </CardHeader>
              <CardContent className="text-sm">
                <p>담당자: {(complaint as any).profiles?.name || "미배정"}</p>
                <p className="text-xs text-muted-foreground">팀: {TEAM_LABELS[((complaint as any).profiles?.team || complaint.assigned_team) as TeamType] || complaint.assigned_team || "-"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">민원 분류 관리</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">반복민원</p>
                    <p className="text-xs text-muted-foreground">{complaint.is_repeat ? `${complaint.repeat_count || 1}회 반복 접수` : "일반 민원"}</p>
                  </div>
                  <Button variant={complaint.is_repeat ? "default" : "outline"} size="sm" onClick={toggleRepeatComplaint} disabled={!canEdit}>
                    <Repeat2 className="h-3.5 w-3.5 mr-1" />{complaint.is_repeat ? "지정 해제" : "반복 지정"}
                  </Button>
                </div>
                {complaint.saeol_ref && <p className="text-xs text-muted-foreground">새올 연계번호: <span className="font-mono text-foreground">{complaint.saeol_ref}</span></p>}
                {complaint.saeol_status && <p className="text-xs text-muted-foreground">새올 상태: <span className="text-foreground">{complaint.saeol_status}</span></p>}
                {complaint.external_ref && <p className="text-xs text-muted-foreground">외부 접수번호: <span className="font-mono text-foreground">{complaint.external_ref}</span></p>}
                {relatedComplaint && <button type="button" className="w-full text-left rounded border px-2 py-1.5 text-xs hover:bg-muted" onClick={() => navigate(`/complaints/${relatedComplaint.id}`)}><span className="text-muted-foreground">원 민원</span><br /><span className="font-mono">{relatedComplaint.complaint_number}</span> · {relatedComplaint.title}</button>}
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex items-start gap-3 p-4">
                <ClipboardList className="mt-0.5 h-4 w-4 text-primary" />
                <div><p className="text-xs font-medium">다음 처리</p><p className="mt-1 text-sm">{nextAction}</p></div>
              </CardContent>
            </Card>

            {/* Action buttons */}
            {canEdit && <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">처리 액션</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {complaint.status === "received" && (
                  <>
                    {canSelfAssign && <Button className="w-full" size="sm" onClick={handleAssignToMe}>
                      <UserPlus className="h-3.5 w-3.5 mr-1" />내가 처리
                    </Button>}
                    <Button className="w-full" size="sm" variant="outline" onClick={() => setAssignDialog(true)}>
                      다른 담당자 선택
                    </Button>
                  </>
                )}
                {complaint.status === "assigned" && (
                  <Button className="w-full" size="sm" onClick={() => updateStatus("in_progress")}>
                    <Play className="h-3.5 w-3.5 mr-1" />처리 시작
                  </Button>
                )}
                {complaint.status === "in_progress" && (
                  <>
                    <Button className="w-full" size="sm" onClick={() => setResponseDialog(true)}>
                      <Reply className="h-3.5 w-3.5 mr-1" />회신
                    </Button>
                    <Button className="w-full" size="sm" variant="outline" onClick={() => setPendingDialog(true)}>
                      외부 대기
                    </Button>
                  </>
                )}
                {complaint.status === "pending_external" && (
                  <Button className="w-full" size="sm" onClick={() => updateStatus("in_progress")}>
                    <Play className="h-3.5 w-3.5 mr-1" />처리 재개
                  </Button>
                )}
                {complaint.status === "responded" && (
                  <>
                    <Button className="w-full" size="sm" onClick={() => setCloseDialog(true)}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />완결
                    </Button>
                    <Button className="w-full" size="sm" variant="outline" onClick={() => setReopenDialog(true)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />재개
                    </Button>
                  </>
                )}
                {complaint.status === "closed" && (
                  <>
                    <Button className="w-full" size="sm" variant="outline" onClick={() => setSatDialog(true)}>
                      <Star className="h-3.5 w-3.5 mr-1" />만족도 입력
                    </Button>
                    <Button className="w-full" size="sm" variant="outline" onClick={() => setReopenDialog(true)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />재민원·이의로 재개
                    </Button>
                  </>
                )}
                {complaint.status === "reopened" && (
                  <>
                    <Button className="w-full" size="sm" onClick={() => updateStatus("in_progress")}>
                      <Play className="h-3.5 w-3.5 mr-1" />처리 시작
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>}

            {complaint.satisfaction_score && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">만족도</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`h-5 w-5 ${s <= complaint.satisfaction_score! ? "text-yellow-400 fill-yellow-400" : "text-muted"}`} />
                    ))}
                    <span className="text-sm ml-1">{complaint.satisfaction_score}점</span>
                  </div>
                  {complaint.satisfaction_feedback && <p className="text-xs text-muted-foreground mt-1">{complaint.satisfaction_feedback}</p>}
                </CardContent>
              </Card>
            )}

            {recentComplaints && recentComplaints.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">해당 주차장 최근 민원</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {recentComplaints.map(c => (
                    <div key={c.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-muted/50 rounded px-1" onClick={() => navigate(`/complaints/${c.id}`)}>
                      <Badge className={`text-[9px] ${COMPLAINT_STATUS_COLORS[c.status]}`}>{COMPLAINT_STATUS_LABELS[c.status]}</Badge>
                      <span className="text-xs truncate">{c.title}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ComplaintEditDialog
        complaint={complaint as unknown as import("@/types/complaint").Complaint}
        open={editDialog}
        onOpenChange={setEditDialog}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["complaint", id] });
          queryClient.invalidateQueries({ queryKey: ["complaint-comments", id] });
          queryClient.invalidateQueries({ queryKey: ["complaints"] });
        }}
      />
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>담당자 배정</DialogTitle><DialogDescription>민원을 처리할 담당자를 지정하거나 변경합니다.</DialogDescription></DialogHeader>
          <Select value={assignTo} onValueChange={setAssignTo}>
            <SelectTrigger><SelectValue placeholder="담당자 선택" /></SelectTrigger>
            <SelectContent>
              {staffList?.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.team})</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter><Button onClick={handleAssign} disabled={!assignTo}>배정</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={responseDialog} onOpenChange={setResponseDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>회신 등록</DialogTitle><DialogDescription>민원인에게 전달한 처리 결과와 회신 채널을 기록합니다.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">회신 유형</Label>
                <Select value={responseType} onValueChange={setResponseType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resolved">해결</SelectItem>
                    <SelectItem value="partially_resolved">부분 해결</SelectItem>
                    <SelectItem value="transferred">타 기관 이첩</SelectItem>
                    <SelectItem value="rejected">수용 불가</SelectItem>
                    <SelectItem value="information">안내</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">회신 채널</Label>
                <Select value={responseChannel} onValueChange={setResponseChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">전화</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="email">이메일</SelectItem>
                    <SelectItem value="mail">우편</SelectItem>
                    <SelectItem value="saeol">새올e</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">회신 내용</Label>
              <Textarea value={responseText} onChange={e => setResponseText(e.target.value)} rows={5} />
            </div>
            {fieldRequired && fieldVisitCount === 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20">
                <Label className="text-xs">현장확인 미실시 사유 *</Label>
                <Textarea value={noVisitReason} onChange={(event) => setNoVisitReason(event.target.value)} rows={2} placeholder="도면·관제기록 확인, 중복 현장점검 등 대체 근거를 입력하세요." />
              </div>
            )}
          </div>
          <DialogFooter><Button onClick={handleResponse}>회신 등록</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>민원 완결</DialogTitle><DialogDescription>현장 조치와 회신 근거를 확인한 뒤 민원을 완결합니다.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">해결 유형</Label>
              <Select value={resolutionType} onValueChange={setResolutionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RESOLUTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">종결 근거 *</Label><Textarea rows={4} value={resolutionSummary} onChange={(event) => setResolutionSummary(event.target.value)} placeholder="민원 내용, 현장 조치, 회신 결과와 남은 후속사항을 기록하세요." /></div>
            <label className="flex items-start gap-2 rounded border p-3 text-xs">
              <Checkbox checked={closeConfirmed} onCheckedChange={(checked) => setCloseConfirmed(Boolean(checked))} />
              <span>민원인 회신과 현장 조치·문서·사진 등 종결 근거를 확인했습니다.</span>
            </label>
          </div>
          <DialogFooter><Button onClick={handleClose}>완결</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingDialog} onOpenChange={setPendingDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>외부기관·업체 회신 대기</DialogTitle><DialogDescription>회신을 기다리는 기관과 사유, 재확인 예정일을 기록합니다.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">기관·업체 *</Label><Input value={pendingOrganization} onChange={(event) => setPendingOrganization(event.target.value)} placeholder="예: 유지보수 업체, 경찰서, 도로관리 부서" /></div>
            <div><Label className="text-xs">대기 사유 *</Label><Textarea rows={3} value={pendingReason} onChange={(event) => setPendingReason(event.target.value)} placeholder="요청한 자료·조치와 현재 처리 중단 사유를 기록하세요." /></div>
            <div><Label className="text-xs">재확인 예정일 *</Label><Input type="date" value={pendingFollowUpDate} onChange={(event) => setPendingFollowUpDate(event.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={handlePendingExternal}>외부대기 등록</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reopenDialog} onOpenChange={setReopenDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>민원 처리 재개</DialogTitle><DialogDescription>완결 후 추가 확인이 필요한 사유를 남기고 처리를 다시 시작합니다.</DialogDescription></DialogHeader>
          <div><Label className="text-xs">재개 사유 *</Label><Textarea rows={4} value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="추가 민원, 이의 제기, 조치 미흡 또는 새로운 현장상황을 기록하세요." /></div>
          <DialogFooter><Button onClick={handleReopen}>처리 재개</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={satDialog} onOpenChange={setSatDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>만족도 입력</DialogTitle><DialogDescription>민원 처리에 대한 만족도와 선택 의견을 기록합니다.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-1 justify-center">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setSatScore(s)}>
                  <Star className={`h-8 w-8 ${s <= satScore ? "text-yellow-400 fill-yellow-400" : "text-muted"}`} />
                </button>
              ))}
            </div>
            <Textarea placeholder="피드백 (선택)" value={satFeedback} onChange={e => setSatFeedback(e.target.value)} rows={3} />
          </div>
          <DialogFooter><Button onClick={handleSatisfaction}>저장</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
