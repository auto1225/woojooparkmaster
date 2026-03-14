import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import {
  CHANNEL_LABELS, CATEGORY_LABELS, COMPLAINT_STATUS_LABELS, COMPLAINT_STATUS_COLORS,
  PRIORITY_LABELS, PRIORITY_COLORS, COMMENT_TYPE_LABELS, RESOLUTION_TYPE_LABELS, getDDay,
} from "@/types/complaint";
import { ArrowLeft, MessageCircle, Lock, Send, Star, UserPlus, Play, Reply, CheckCircle, RotateCcw, ExternalLink, Sparkles } from "lucide-react";
import { useModuleLicenses, useSystemConfig } from "@/hooks/useSystemConfig";
import { callAI } from "@/lib/ai-service";

export default function ComplaintDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { data: licenses } = useModuleLicenses();
  const { data: config } = useSystemConfig();
  const aiEnabled = config?.ai_enabled === 'true';
  const opsActive = (licenses ?? []).some(m => m.module_code === "OPS" && m.is_active);

  const [commentText, setCommentText] = useState("");
  const [commentType, setCommentType] = useState("internal");
  const [responseDialog, setResponseDialog] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [responseChannel, setResponseChannel] = useState("phone");
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [closeDialog, setCloseDialog] = useState(false);
  const [resolutionType, setResolutionType] = useState("resolved");
  const [satDialog, setSatDialog] = useState(false);
  const [satScore, setSatScore] = useState(3);
  const [satFeedback, setSatFeedback] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);

  const { data: complaint, isLoading } = useQuery({
    queryKey: ["complaint", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("complaints")
        .select("*, parking_lots(code, name), profiles!complaints_assigned_to_fkey(name, team)")
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

  const updateStatus = async (newStatus: string, extra: Record<string, any> = {}) => {
    const { error } = await supabase.from("complaints").update({ status: newStatus, ...extra }).eq("id", id!);
    if (error) { toast({ title: "상태 변경 실패", variant: "destructive" }); return; }
    await logActivity({ module: "COMPLAINT", action: `상태변경→${newStatus}`, targetType: "complaint", targetId: id!, targetName: complaint?.complaint_number });
    queryClient.invalidateQueries({ queryKey: ["complaint", id] });
    queryClient.invalidateQueries({ queryKey: ["complaint-comments", id] });
    toast({ title: "상태가 변경되었습니다" });
  };

  const addComment = async () => {
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

    setCommentText("");
    queryClient.invalidateQueries({ queryKey: ["complaint-comments", id] });
    toast({ title: "코멘트가 등록되었습니다" });
  };

  const handleAssign = async () => {
    if (!assignTo) return;
    await supabase.from("complaints").update({
      assigned_to: assignTo, assigned_at: new Date().toISOString(), status: complaint?.status === "received" ? "assigned" : complaint?.status,
    }).eq("id", id!);
    await supabase.from("notifications").insert([{
      user_id: assignTo, title: "민원 배정", message: `[${complaint?.complaint_number}] ${complaint?.title}`, link: `/complaints/${id}`, type: "complaint", module: "COMPLAINT",
    }]);
    setAssignDialog(false);
    queryClient.invalidateQueries({ queryKey: ["complaint", id] });
    toast({ title: "담당자가 배정되었습니다" });
  };

  const handleResponse = async () => {
    await updateStatus("responded", {
      response: responseText, responded_at: new Date().toISOString(), response_channel: responseChannel,
    });
    await supabase.from("complaint_comments").insert({
      complaint_id: id!, author_id: profile!.id, author_name: profile!.name,
      content: responseText, comment_type: "external",
    });
    setResponseDialog(false);
    setResponseText("");
  };

  const handleClose = async () => {
    await updateStatus("closed", {
      closed_at: new Date().toISOString(), closed_by: profile?.id, resolution_type: resolutionType,
    });
    setCloseDialog(false);
  };

  const handleSatisfaction = async () => {
    await supabase.from("complaints").update({
      satisfaction_score: satScore, satisfaction_feedback: satFeedback || null, satisfaction_date: new Date().toISOString().slice(0, 10),
    }).eq("id", id!);
    setSatDialog(false);
    queryClient.invalidateQueries({ queryKey: ["complaint", id] });
    toast({ title: "만족도가 입력되었습니다" });
  };

  if (isLoading) return <DashboardLayout><Skeleton className="h-96" /></DashboardLayout>;
  if (!complaint) return <DashboardLayout><p>민원을 찾을 수 없습니다</p></DashboardLayout>;

  const dday = getDDay(complaint.due_date);

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
              접수: {CHANNEL_LABELS[complaint.channel]} | {complaint.received_at?.slice(0, 10)} | 기한: <span className={dday.isOverdue ? "text-destructive font-bold" : ""}>{dday.text}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">민원 내용</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm whitespace-pre-wrap">{complaint.content}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground border-t pt-2 mt-2">
                  {complaint.parking_lots && <span>주차장: {(complaint as any).parking_lots.name}</span>}
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

            {/* Timeline */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">처리 타임라인</CardTitle></CardHeader>
              <CardContent>
                {/* Comment input */}
                <div className="mb-4 space-y-2 border-b pb-4">
                  <Textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="코멘트 입력..." rows={3} className="text-sm" />
                  <div className="flex items-center gap-2">
                    <Select value={commentType} onValueChange={setCommentType}>
                      <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">내부메모</SelectItem>
                        <SelectItem value="external">민원인회신</SelectItem>
                        <SelectItem value="escalation">상향보고</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={addComment} disabled={!commentText.trim()}>
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
                              await logActivity({ module: 'ai', action: 'draft_response', details: { complaint_id: id } });
                              toast({ title: "AI 답변 초안이 생성되었습니다" });
                            } catch (e: any) {
                              toast({ title: "AI 답변 생성 실패", description: e.message, variant: "destructive" });
                            } finally { setAiDrafting(false); }
                          }}>
                          <Sparkles className="h-3 w-3" />{aiDrafting ? "생성 중..." : "AI 답변"}
                        </Button>
                        <span className="text-[9px] text-muted-foreground hidden md:inline">검토 후 발송하세요</span>
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
                        c.is_system ? "bg-muted-foreground" : c.comment_type === "external" ? "bg-blue-500" : c.comment_type === "escalation" ? "bg-orange-500" : "bg-primary"
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
                    <p>{complaint.complainant_name || "-"}</p>
                    <p className="text-xs text-muted-foreground">{complaint.complainant_phone}</p>
                    <p className="text-xs text-muted-foreground">{complaint.complainant_email}</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">배정 정보</CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setAssignDialog(true)}>
                    <UserPlus className="h-3 w-3 mr-1" />재배정
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="text-sm">
                <p>담당자: {(complaint as any).profiles?.name || "미배정"}</p>
                <p className="text-xs text-muted-foreground">팀: {(complaint as any).profiles?.team || "-"}</p>
              </CardContent>
            </Card>

            {/* Action buttons */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">처리 액션</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {complaint.status === "received" && (
                  <Button className="w-full" size="sm" onClick={() => setAssignDialog(true)}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" />배정
                  </Button>
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
                    <Button className="w-full" size="sm" variant="outline" onClick={() => updateStatus("pending_external")}>
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
                    <Button className="w-full" size="sm" variant="outline" onClick={() => updateStatus("reopened")}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />재개
                    </Button>
                  </>
                )}
                {complaint.status === "closed" && (
                  <Button className="w-full" size="sm" variant="outline" onClick={() => setSatDialog(true)}>
                    <Star className="h-3.5 w-3.5 mr-1" />만족도 입력
                  </Button>
                )}
                {complaint.status === "reopened" && (
                  <>
                    <Button className="w-full" size="sm" onClick={() => updateStatus("in_progress")}>
                      <Play className="h-3.5 w-3.5 mr-1" />처리 시작
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

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
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>담당자 배정</DialogTitle></DialogHeader>
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
          <DialogHeader><DialogTitle>회신 등록</DialogTitle></DialogHeader>
          <div className="space-y-3">
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
            <div>
              <Label className="text-xs">회신 내용</Label>
              <Textarea value={responseText} onChange={e => setResponseText(e.target.value)} rows={5} />
            </div>
          </div>
          <DialogFooter><Button onClick={handleResponse} disabled={!responseText.trim()}>회신</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>민원 완결</DialogTitle></DialogHeader>
          <div>
            <Label className="text-xs">해결 유형</Label>
            <Select value={resolutionType} onValueChange={setResolutionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RESOLUTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button onClick={handleClose}>완결</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={satDialog} onOpenChange={setSatDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>만족도 입력</DialogTitle></DialogHeader>
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
