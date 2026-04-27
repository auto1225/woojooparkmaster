import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { SURVEY_STATUS_LABELS, SURVEY_STATUS_COLORS } from "@/types/survey";
import type { SurveyStatus, SurveyBasicInfo, SurveyOperation, SurveyInfra, SurveyUsage, SurveySensorPlan, SurveyPhoto } from "@/types/survey";
import { ArrowLeft, Check, Save } from "lucide-react";
import { StepBasicInfo } from "@/components/survey/StepBasicInfo";
import { StepOperation } from "@/components/survey/StepOperation";
import { StepInfra } from "@/components/survey/StepInfra";
import { StepUsage } from "@/components/survey/StepUsage";
import { StepSensorPlan } from "@/components/survey/StepSensorPlan";
import { StepPhotos } from "@/components/survey/StepPhotos";
import { StepReview } from "@/components/survey/StepReview";

const STEPS = [
  { label: "기본현황", key: "basic" },
  { label: "운영현황", key: "operation" },
  { label: "인프라현황", key: "infra" },
  { label: "이용현황", key: "usage" },
  { label: "센서설치예상", key: "sensor" },
  { label: "사진대장", key: "photos" },
  { label: "최종검토", key: "review" },
];

export default function SurveyWizardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["survey-wizard", id],
    queryFn: async () => {
      const [surveyRes, basicRes, opRes, infraRes, usageRes, sensorRes, photosRes] = await Promise.all([
        supabase.from("surveys").select("*, parking_lots(code, name, address_jibun)").eq("id", id!).single(),
        supabase.from("survey_basic_info").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_operation").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_infra").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_usage").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_sensor_plan").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_photos").select("*").eq("survey_id", id!).order("category").order("sort_order"),
      ]);
      return {
        survey: surveyRes.data,
        basic: basicRes.data,
        operation: opRes.data,
        infra: infraRes.data,
        usage: usageRes.data,
        sensor: sensorRes.data,
        photos: photosRes.data || [],
      };
    },
    enabled: !!id,
  });

  // Auto-update status to in_progress
  useEffect(() => {
    if (data?.survey?.status === "draft" && id) {
      supabase.from("surveys").update({ status: "in_progress" as any }).eq("id", id).then();
    }
  }, [data?.survey?.status, id]);

  const survey = data?.survey;
  const lot = survey?.parking_lots as any;
  const isReadOnly = false;

  const saveStep = useCallback(async (stepData: any, tableName: string, recordId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from(tableName as any).update(stepData).eq("id", recordId);
      if (error) throw error;
      toast({ title: "저장되었습니다" });
      refetch();
    } catch (err: any) {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [refetch]);

  const handleNext = async () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("surveys").update({
        status: "submitted" as any,
        submitted_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;

      // Create notification for reviewers
      const { data: managers } = await supabase.from("profiles").select("id").in("role", ["admin", "manager"]);
      if (managers?.length) {
        await supabase.from("notifications").insert(
          managers.map((m: any) => ({
            user_id: m.id,
            module: "survey",
            title: "조사 제출됨",
            message: `${lot?.name} 현황조사가 제출되었습니다.`,
            link: `/surveys/${id}/review`,
          }))
        );
      }

      await logActivity({ module: "survey", action: "submit", targetType: "survey", targetId: id, targetName: lot?.name });
      toast({ title: "제출이 완료되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
      navigate("/surveys");
    } catch (err: any) {
      toast({ title: "제출 실패", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <DashboardLayout><div className="space-y-4 max-w-4xl"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div></DashboardLayout>;
  }

  if (!survey) {
    return <DashboardLayout><div className="flex flex-col items-center py-20 gap-4"><p className="text-muted-foreground">조사를 찾을 수 없습니다</p><Button variant="outline" onClick={() => navigate("/surveys")}>목록</Button></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/surveys")} className="mb-2 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> 목록
            </Button>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold">{lot?.name}</h2>
              <Badge variant="outline" className="font-mono text-[10px]">{lot?.code}</Badge>
              <Badge variant="outline" className={`text-[10px] ${SURVEY_STATUS_COLORS[survey.status as SurveyStatus]}`}>
                {SURVEY_STATUS_LABELS[survey.status as SurveyStatus]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">조사일: {survey.survey_date || "-"}</p>
          </div>
        </div>

        {/* Step Progress */}
        <div className="flex gap-1 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : <span className="font-mono">{i + 1}</span>}
              {s.label}
            </button>
          ))}
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="pt-6">
            {step === 0 && <StepBasicInfo data={data?.basic} onSave={(d) => saveStep(d, "survey_basic_info", data?.basic?.id!)} readOnly={isReadOnly} />}
            {step === 1 && <StepOperation data={data?.operation} onSave={(d) => saveStep(d, "survey_operation", data?.operation?.id!)} readOnly={isReadOnly} />}
            {step === 2 && <StepInfra data={data?.infra} onSave={(d) => saveStep(d, "survey_infra", data?.infra?.id!)} readOnly={isReadOnly} />}
            {step === 3 && <StepUsage data={data?.usage} onSave={(d) => saveStep(d, "survey_usage", data?.usage?.id!)} readOnly={isReadOnly} />}
            {step === 4 && <StepSensorPlan data={data?.sensor} onSave={(d) => saveStep(d, "survey_sensor_plan", data?.sensor?.id!)} readOnly={isReadOnly} />}
            {step === 5 && <StepPhotos surveyId={id!} photos={data?.photos || []} onRefresh={refetch} readOnly={isReadOnly} />}
            {step === 6 && <StepReview data={data!} onGoToStep={setStep} onSubmit={handleSubmit} isReadOnly={isReadOnly} />}
          </CardContent>
        </Card>

        {/* Navigation */}
        {step < 6 && (
          <div className="flex justify-between">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep(s => s - 1)}>이전</Button>
            <div className="flex gap-2">
              {!isReadOnly && (
                <Button variant="outline" disabled={saving} onClick={() => {
                  // Trigger save via form ref or current step's save
                  toast({ title: "현재 스텝 데이터를 저장하려면 각 필드 입력 후 '다음' 또는 '임시저장' 버튼을 이용하세요." });
                }}>
                  <Save className="h-4 w-4 mr-1" /> 임시저장
                </Button>
              )}
              <Button onClick={handleNext}>다음</Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
