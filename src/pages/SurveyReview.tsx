import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/lib/activity-logger";
import { toast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SURVEY_STATUS_LABELS, SURVEY_STATUS_COLORS, SURVEY_TYPE_LABELS, PHOTO_CATEGORIES } from "@/types/survey";
import type { SurveyStatus } from "@/types/survey";
import { ArrowLeft, CheckCircle, XCircle, Clock } from "lucide-react";
import { useState } from "react";

function SummaryRow({ label, value }: { label: string; value?: any }) {
  const display = typeof value === "boolean" ? (value ? "예" : "아니오") : (value ?? "-");
  return (
    <div className="flex justify-between py-1 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{String(display)}</span>
    </div>
  );
}

export default function SurveyReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [syncToLot, setSyncToLot] = useState(true);
  const [acting, setActing] = useState(false);

  const isAuthorized = profile && ["admin", "manager"].includes(profile.role);

  const { data, isLoading } = useQuery({
    queryKey: ["survey-review", id],
    queryFn: async () => {
      const [surveyRes, basicRes, opRes, infraRes, usageRes, sensorRes, photosRes] = await Promise.all([
        supabase.from("surveys").select("*, parking_lots(id, code, name, address_jibun), surveyor:profiles!surveys_surveyor_id_fkey(name, team)").eq("id", id!).single(),
        supabase.from("survey_basic_info").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_operation").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_infra").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_usage").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_sensor_plan").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_photos").select("*").eq("survey_id", id!),
      ]);
      return { survey: surveyRes.data, basic: basicRes.data, operation: opRes.data, infra: infraRes.data, usage: usageRes.data, sensor: sensorRes.data, photos: photosRes.data || [] };
    },
    enabled: !!id,
  });

  const survey = data?.survey;
  const lot = survey?.parking_lots as any;
  const surveyor = survey?.surveyor as any;

  const handleApprove = async () => {
    setActing(true);
    try {
      await supabase.from("surveys").update({
        status: "approved" as any,
        approved_at: new Date().toISOString(),
        approver_id: user!.id,
      }).eq("id", id!);

      // Sync to parking_lots if checked
      if (syncToLot && data?.basic && lot?.id) {
        await supabase.from("parking_lots").update({
          total_spaces: data.basic.total_spaces,
          disabled_spaces: data.basic.disabled_spaces,
          ev_spaces: data.basic.ev_spaces,
          compact_spaces: data.basic.compact_spaces,
          pregnant_spaces: data.basic.pregnant_spaces,
          lot_type: data.basic.lot_type as any,
        }).eq("id", lot.id);
      }

      // Notify surveyor
      if (survey?.surveyor_id) {
        await supabase.from("notifications").insert({
          user_id: survey.surveyor_id,
          module: "survey",
          title: "조사가 승인되었습니다",
          message: `${lot?.name} 현황조사가 승인되었습니다.`,
          link: `/surveys/${id}`,
        });
      }

      await logActivity({ module: "survey", action: "approve", targetType: "survey", targetId: id!, targetName: lot?.name });
      toast({ title: "승인되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
      navigate("/surveys");
    } catch (err: any) {
      toast({ title: "승인 실패", description: err.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActing(true);
    try {
      await supabase.from("surveys").update({
        status: "rejected" as any,
        reject_reason: rejectReason,
      }).eq("id", id!);

      if (survey?.surveyor_id) {
        await supabase.from("notifications").insert({
          user_id: survey.surveyor_id,
          module: "survey",
          title: "조사가 반려되었습니다",
          message: `${lot?.name} 현황조사가 반려되었습니다: ${rejectReason}`,
          link: `/surveys/${id}`,
        });
      }

      await logActivity({ module: "survey", action: "reject", targetType: "survey", targetId: id!, targetName: lot?.name });
      toast({ title: "반려 처리되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
      navigate("/surveys");
    } catch (err: any) {
      toast({ title: "반려 실패", description: err.message, variant: "destructive" });
    } finally {
      setActing(false);
      setRejectOpen(false);
    }
  };

  const handleMarkReview = async () => {
    setActing(true);
    try {
      await supabase.from("surveys").update({
        status: "review" as any,
        reviewer_id: user!.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", id!);
      toast({ title: "검토중으로 변경됨" });
      queryClient.invalidateQueries({ queryKey: ["survey-review", id] });
    } finally {
      setActing(false);
    }
  };

  if (isLoading) return <DashboardLayout><Skeleton className="h-64 max-w-4xl" /></DashboardLayout>;
  if (!survey || !isAuthorized) return <DashboardLayout><p className="text-muted-foreground py-20 text-center">접근 권한이 없거나 조사를 찾을 수 없습니다</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/surveys")} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> 목록
        </Button>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold">{lot?.name}</h2>
              <Badge variant="outline" className="font-mono text-[10px]">{lot?.code}</Badge>
              <Badge variant="outline" className={`text-[10px] ${SURVEY_STATUS_COLORS[survey.status as SurveyStatus]}`}>
                {SURVEY_STATUS_LABELS[survey.status as SurveyStatus]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              조사자: {surveyor?.name || "-"} | 조사일: {survey.survey_date || "-"} | 유형: {SURVEY_TYPE_LABELS[survey.survey_type] || survey.survey_type}
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs">기본현황</CardTitle></CardHeader><CardContent>
            <SummaryRow label="주차장명" value={data?.basic?.lot_name} />
            <SummaryRow label="총 면수" value={data?.basic?.total_spaces} />
            <SummaryRow label="주소" value={data?.basic?.address} />
          </CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs">운영현황</CardTitle></CardHeader><CardContent>
            <SummaryRow label="운영시간" value={data?.operation?.operating_hours} />
            <SummaryRow label="관리방식" value={data?.operation?.management_type} />
          </CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs">인프라현황</CardTitle></CardHeader><CardContent>
            <SummaryRow label="전기" value={data?.infra?.power_status} />
            <SummaryRow label="전광판" value={data?.infra?.display_installed} />
            <SummaryRow label="센서" value={data?.infra?.sensor_installed} />
          </CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs">센서/이용</CardTitle></CardHeader><CardContent>
            <SummaryRow label="이용률" value={data?.usage?.avg_usage_rate} />
            <SummaryRow label="센서 예정" value={`${data?.sensor?.planned_sensors ?? 0}대`} />
          </CardContent></Card>
        </div>

        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">사진대장</CardTitle></CardHeader><CardContent>
          <div className="flex flex-wrap gap-1">
            {PHOTO_CATEGORIES.map(c => {
              const count = data?.photos.filter((p: any) => p.category === c.code).length || 0;
              return <Badge key={c.code} variant={count > 0 ? "default" : "outline"} className="text-[10px]">{c.label} {count}</Badge>;
            })}
          </div>
        </CardContent></Card>

        {survey.reject_reason && (
          <Card className="border-destructive/30">
            <CardContent className="pt-4">
              <p className="text-sm font-medium text-destructive">반려 사유</p>
              <p className="text-sm mt-1">{survey.reject_reason}</p>
            </CardContent>
          </Card>
        )}

        {/* Action Bar */}
        {(survey.status === "submitted" || survey.status === "review") && (
          <div className="flex gap-3 justify-center pt-4 pb-8">
            {survey.status === "submitted" && (
              <Button variant="outline" onClick={handleMarkReview} disabled={acting}>
                <Clock className="h-4 w-4 mr-1" /> 검토중으로 변경
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-success hover:bg-success/90 text-white" disabled={acting}>
                  <CheckCircle className="h-4 w-4 mr-1" /> 승인
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>조사 승인</AlertDialogTitle>
                  <AlertDialogDescription>이 조사를 승인하시겠습니까?</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex items-center gap-2 py-2">
                  <Checkbox id="sync" checked={syncToLot} onCheckedChange={v => setSyncToLot(!!v)} />
                  <Label htmlFor="sync" className="text-sm font-normal">조사 결과를 주차장 기본정보에 반영</Label>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleApprove}>승인</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="destructive" onClick={() => setRejectOpen(true)} disabled={acting}>
              <XCircle className="h-4 w-4 mr-1" /> 반려
            </Button>
          </div>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>반려 사유 입력</DialogTitle></DialogHeader>
          <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="반려 사유를 입력하세요 (필수)" rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>취소</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim() || acting}>반려</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
