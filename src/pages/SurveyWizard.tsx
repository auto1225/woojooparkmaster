import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { SURVEY_STATUS_LABELS, SURVEY_STATUS_COLORS } from "@/types/survey";
import type { SurveyStatus, SurveyBasicInfo, SurveyOperation, SurveyInfra, SurveyUsage, SurveySensorPlan, SurveyPhoto } from "@/types/survey";
import { ArrowLeft, Check } from "lucide-react";
import { StepBasicInfo } from "@/components/survey/StepBasicInfo";
import { StepOperation } from "@/components/survey/StepOperation";
import { StepInfra } from "@/components/survey/StepInfra";
import { StepUsage } from "@/components/survey/StepUsage";
import { StepSensorPlan } from "@/components/survey/StepSensorPlan";
import { StepPhotos } from "@/components/survey/StepPhotos";
import { StepReview } from "@/components/survey/StepReview";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { submitSurvey } from "@/lib/workflow-commands";
import { saveSurveyOffline } from "@/lib/offline-survey";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const initialStep = Math.min(6, Math.max(0, Number(searchParams.get("step") || 0)));
  const [step, setStep] = useState(initialStep);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["survey-wizard", id],
    queryFn: async () => {
      const [surveyRes, basicRes, opRes, infraRes, usageRes, sensorRes, photosRes, documentLinksRes] = await Promise.all([
        supabase.from("surveys").select("*, parking_lots(code, name, address_jibun)").eq("id", id!).single(),
        supabase.from("survey_basic_info").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_operation").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_infra").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_usage").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_sensor_plan").select("*").eq("survey_id", id!).single(),
        supabase.from("survey_photos").select("*").eq("survey_id", id!).order("category").order("sort_order"),
        supabase.from("attachments").select("id").eq("module", "SURVEY").eq("ref_type", "official_document_link").eq("ref_id", id!),
      ]);
      return {
        survey: surveyRes.data,
        basic: basicRes.data,
        operation: opRes.data,
        infra: infraRes.data,
        usage: usageRes.data,
        sensor: sensorRes.data,
        photos: photosRes.data || [],
        documentLinks: documentLinksRes.data || [],
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
  const isReadOnly = ["submitted", "review", "approved"].includes(survey?.status || "");

  const saveStep = useCallback(async (stepData: any, tableName: string, recordId: string) => {
    setSaving(true);
    const { created_at: _createdAt, updated_at: _updatedAt, ...payload } = stepData;
    try {
      if (!navigator.onLine) {
        await saveSurveyOffline(id!, tableName, recordId, payload, survey?.updated_at);
        toast({ title: "오프라인 저장됨", description: "네트워크가 연결되면 자동으로 동기화합니다." });
        return;
      }
      const { error } = await supabase.from(tableName as any).update(payload).eq("id", recordId);
      if (error) throw error;
      await supabase.from("surveys").update({ updated_at: new Date().toISOString() }).eq("id", id!);
      toast({ title: "저장되었습니다" });
      await refetch();
    } catch (err: any) {
      if (!navigator.onLine || /fetch|network|connection/i.test(err.message || "")) {
        await saveSurveyOffline(id!, tableName, recordId, payload, survey?.updated_at);
        toast({ title: "오프라인 저장됨", description: "연결 복구 후 자동으로 동기화합니다." });
      } else {
        toast({ title: "저장 실패", description: err.message, variant: "destructive" });
        throw err;
      }
    } finally {
      setSaving(false);
    }
  }, [id, refetch, survey?.updated_at]);

  useEffect(() => {
    const refreshAfterSync = () => refetch();
    window.addEventListener("parkmaster:offline-sync", refreshAfterSync);
    return () => window.removeEventListener("parkmaster:offline-sync", refreshAfterSync);
  }, [refetch]);

  useEffect(() => {
    const expected = step === 0 ? null : String(step);
    if (searchParams.get("step") === expected) return;
    const next = new URLSearchParams(searchParams);
    if (step === 0) next.delete("step");
    else next.set("step", String(step));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, step]);

  const handleNext = async () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await submitSurvey(id, survey?.updated_at);
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

        <DocumentLinksPanel
          module="SURVEY"
          recordId={survey.id}
          recordPath={`/surveys/${survey.id}`}
          recordTitle={`${lot?.name || "주차장"} 현황조사`}
        />

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
            {step === 0 && <StepBasicInfo data={data?.basic} onSave={(d) => saveStep(d, "survey_basic_info", data?.basic?.id || '')} onNext={() => setStep(1)} readOnly={isReadOnly} />}
            {step === 1 && <StepOperation data={data?.operation} onSave={(d) => saveStep(d, "survey_operation", data?.operation?.id || '')} onNext={() => setStep(2)} readOnly={isReadOnly} />}
            {step === 2 && <StepInfra data={data?.infra} onSave={(d) => saveStep(d, "survey_infra", data?.infra?.id || '')} onNext={() => setStep(3)} readOnly={isReadOnly} />}
            {step === 3 && <StepUsage data={data?.usage} onSave={(d) => saveStep(d, "survey_usage", data?.usage?.id || '')} onNext={() => setStep(4)} readOnly={isReadOnly} />}
            {step === 4 && <StepSensorPlan data={data?.sensor} onSave={(d) => saveStep(d, "survey_sensor_plan", data?.sensor?.id || '')} onNext={() => setStep(5)} readOnly={isReadOnly} />}
            {step === 5 && <StepPhotos surveyId={id!} photos={data?.photos || []} onRefresh={refetch} lotType={data?.basic?.lot_type} readOnly={isReadOnly} />}
            {step === 6 && <StepReview data={data!} onGoToStep={setStep} onSubmit={handleSubmit} isReadOnly={isReadOnly} />}
          </CardContent>
        </Card>

        {/* Navigation */}
        {step < 6 && (
          <div className="sticky bottom-2 z-10 flex min-h-11 justify-between rounded-md border bg-background/95 p-2 shadow-sm backdrop-blur">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep(s => s - 1)}>이전</Button>
            {(isReadOnly || step === 5) && <Button onClick={handleNext}>다음 단계</Button>}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
