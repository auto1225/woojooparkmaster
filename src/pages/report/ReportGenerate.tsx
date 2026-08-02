import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, FileText, Loader2, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { REPORT_TYPE_LABELS, REPORT_CATEGORY_LABELS, type ReportTemplate } from "@/types/report";
import { logActivity } from "@/lib/activity-logger";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { callAI, reviewAIAssistance, type AISource } from "@/lib/ai-service";
import { runtimeConfig } from "@/config/runtime-config";
import { Textarea } from "@/components/ui/textarea";
import { generateReport, getReportEvidence } from "@/lib/report-engine";
import { isModuleEnabled } from "@/lib/authorization";

export default function ReportGenerate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateCode = searchParams.get("template");
  const sourceId = searchParams.get("source");
  const { user, profile } = useAuth();
  const { data: licenses } = useModuleLicenses();
  const [step, setStep] = useState(templateCode ? 2 : 1);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [outputFormat, setOutputFormat] = useState("pdf");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ status: string; id?: string; error?: string } | null>(null);
  const [aiSummary, setAiSummary] = useState("");
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiMeta, setAiMeta] = useState<{ id?: string; confidence?: number; sources: AISource[]; initial: string } | null>(null);
  const { data: config } = useSystemConfig();
  const aiEnabled = runtimeConfig.externalAiEnabled && config?.ai_enabled === 'true';

  const activeModules = new Set([
    "CORE",
    ...["OPS", "FACILITY", "REVENUE", "BUDGET", "COMPLAINT", "PLANNING", "REALTIME", "REPORT", "SURVEY"]
      .filter((code) => isModuleEnabled(licenses, code)),
  ]);

  const { data: templates } = useQuery({
    queryKey: ["report-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as any as ReportTemplate[];
    },
  });

  const { data: sourceReport } = useQuery({
    queryKey: ["report-copy-source", sourceId],
    enabled: Boolean(sourceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_generated")
        .select("*, template:report_templates(*)")
        .eq("id", sourceId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (templateCode && templates) {
      const t = templates.find((t) => t.template_code === templateCode);
      if (t) {
        setSelectedTemplate(t);
        if (!sourceId) setTitle(t.name);
        setStep(2);
      }
    }
  }, [templateCode, templates, sourceId]);

  useEffect(() => {
    if (!sourceReport?.template) return;
    setSelectedTemplate(sourceReport.template as any as ReportTemplate);
    setTitle(sourceReport.title || sourceReport.template.name);
    setDescription(sourceReport.description || "");
    setParams((sourceReport.parameters_used || {}) as Record<string, string>);
    setOutputFormat(sourceReport.file_format === "pdf+xlsx" ? "pdf+xlsx" : "pdf");
    setAiSummary(sourceReport.summary_data?.aiSummary || "");
    setStep(2);
  }, [sourceReport]);

  const isAvailable = (t: ReportTemplate) => {
    const req = Array.isArray(t.required_modules) ? t.required_modules : [];
    return req.every((m: string) => activeModules.has(m));
  };

  const availableTemplates = (templates ?? []).filter(isAvailable);

  const handleGenerate = async () => {
    if (!selectedTemplate || !user) return;
    const missingRequired = (selectedTemplate.parameters || []).some((parameter: any) => {
      if (!parameter.required) return false;
      if (parameter.type === "daterange") return !params.period_start || !params.period_end;
      if (parameter.type === "quarter") return !params[`${parameter.name}_year`] || !params[`${parameter.name}_q`];
      return !params[parameter.name];
    });
    if (missingRequired) {
      toast.error("필수 조건을 모두 입력해 주세요");
      return;
    }
    setGenerating(true);
    setResult(null);

    try {
      const inserted = await generateReport({
        template: selectedTemplate,
        title: title || selectedTemplate.name,
        description,
        parameters: params,
        outputFormat: outputFormat as "pdf" | "pdf+xlsx",
        userId: user.id,
        authorName: profile?.name || user.email || "",
        aiSummary,
      });

      await logActivity({
        module: "REPORT",
        action: "보고서 생성",
        targetType: "report",
        targetId: inserted.id,
        targetName: title || selectedTemplate.name,
      });
      await reviewAIAssistance(aiMeta?.id, {
        applied: Boolean(aiSummary),
        edited: Boolean(aiMeta && aiSummary !== aiMeta.initial),
        targetType: "report",
        targetId: inserted.id,
      });

      setResult({ status: "completed", id: inserted.id });
      toast.success("보고서가 생성되었습니다");
    } catch (err: any) {
      setResult({ status: "failed", error: err.message });
      toast.error("보고서 생성 실패");
    } finally {
      setGenerating(false);
    }
  };

  const renderParamInput = (p: any) => {
    const key = p.name;
    switch (p.type) {
      case "date":
        return <Input type="date" value={params[key] || ""} onChange={(e) => setParams({ ...params, [key]: e.target.value })} />;
      case "month":
        return <Input type="month" value={params[key] || ""} onChange={(e) => setParams({ ...params, [key]: e.target.value })} />;
      case "year":
        return <Input type="number" placeholder="2025" value={params[key] || ""} onChange={(e) => setParams({ ...params, [key]: e.target.value })} />;
      case "quarter":
        return (
          <div className="flex gap-2">
            <Input type="number" placeholder="년도" value={params[`${key}_year`] || ""} onChange={(e) => setParams({ ...params, [`${key}_year`]: e.target.value })} className="w-24" />
            <select className="border rounded px-2 text-sm" value={params[`${key}_q`] || ""} onChange={(e) => setParams({ ...params, [`${key}_q`]: e.target.value })}>
              <option value="">분기</option>
              <option value="1">1분기</option>
              <option value="2">2분기</option>
              <option value="3">3분기</option>
              <option value="4">4분기</option>
            </select>
          </div>
        );
      case "daterange":
        return (
          <div className="flex gap-2">
            <Input type="date" value={params.period_start || ""} onChange={(e) => setParams({ ...params, period_start: e.target.value })} />
            <span className="self-center text-muted-foreground">~</span>
            <Input type="date" value={params.period_end || ""} onChange={(e) => setParams({ ...params, period_end: e.target.value })} />
          </div>
        );
      default:
        return <Input value={params[key] || ""} onChange={(e) => setParams({ ...params, [key]: e.target.value })} />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-xl font-bold">{sourceId ? "보고서 조건 복사 작성" : "보고서 생성"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sourceId ? "기존 조건을 불러왔습니다. 필요한 내용을 수정하면 새 보고서번호로 생성됩니다." : "업무 데이터에서 보고서 파일을 생성하고 이력에 보관합니다."}</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-sm">
          {["템플릿 선택", "조건 설정", "미리보기/생성"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <span className={`px-3 py-1 rounded-full text-xs ${step === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{s}</span>
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {availableTemplates.map((t) => (
              <Card
                key={t.id}
                className={`cursor-pointer transition-all ${selectedTemplate?.id === t.id ? "ring-2 ring-primary" : "hover:shadow-md"}`}
                onClick={() => { setSelectedTemplate(t); setTitle(t.name); }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                      <Badge variant="outline" className="text-[10px] mt-1">{REPORT_TYPE_LABELS[t.report_type]}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            <div className="md:col-span-2 flex justify-end">
              <Button disabled={!selectedTemplate} onClick={() => setStep(2)}>다음</Button>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && selectedTemplate && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{selectedTemplate.name} — 조건 설정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>보고서 제목</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label>작성 목적 및 설명</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="보고 대상, 작성 목적, 포함할 특이사항을 입력하세요" />
              </div>
              <div>
                <Label>관련 공문 문서번호</Label>
                <Input value={params.official_document_number || ""} onChange={(e) => setParams({ ...params, official_document_number: e.target.value })} placeholder="예: 제주시청-차량관리과운영팀-2026-0142" />
                <p className="mt-1 text-xs text-muted-foreground">시행·접수 공문과 비교하거나 다시 찾을 때 사용하는 기관 문서번호입니다.</p>
              </div>
              {Array.isArray(selectedTemplate.parameters) && selectedTemplate.parameters.map((p: any) => (
                <div key={p.name}>
                  <Label>{p.label}{p.required && <span className="text-destructive">*</span>}</Label>
                  {renderParamInput(p)}
                </div>
              ))}
              <div>
                <Label>출력 형식</Label>
                <RadioGroup value={outputFormat} onValueChange={setOutputFormat} className="flex gap-4 mt-1">
                  <div className="flex items-center gap-2"><RadioGroupItem value="pdf" id="fmt-pdf" /><Label htmlFor="fmt-pdf">PDF</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="pdf+xlsx" id="fmt-both" /><Label htmlFor="fmt-both">PDF + 엑셀</Label></div>
                </RadioGroup>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>이전</Button>
                <Button onClick={() => setStep(3)}>다음</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 */}
        {step === 3 && selectedTemplate && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">설정 확인</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">템플릿</span>
                <span className="font-medium">{selectedTemplate.name}</span>
                <span className="text-muted-foreground">제목</span>
                <span className="font-medium">{title}</span>
                <span className="text-muted-foreground">작성 목적</span>
                <span className="font-medium whitespace-pre-wrap">{description || "-"}</span>
                {Object.entries(params).map(([k, v]) => (
                  <React.Fragment key={k}><span className="text-muted-foreground">{k}</span><span>{v}</span></React.Fragment>
                ))}
                <span className="text-muted-foreground">형식</span>
                <span>{outputFormat === "pdf+xlsx" ? "PDF + 엑셀" : "PDF"}</span>
              </div>

              {/* AI Summary */}
              {aiEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">총평</Label>
                    <Button type="button" variant="outline" size="sm" className="text-xs gap-1" disabled={aiSummaryLoading}
                      onClick={async () => {
                        setAiSummaryLoading(true);
                        try {
                          const evidence = await getReportEvidence(params);
                          const result = await callAI({
                            task: 'summarize_report',
                            input: { template: selectedTemplate?.name, parameters: params, ...evidence },
                            context: `기관: ${config?.org_name || ''}\n보고서: ${title}\n기간: ${params.date || params.month || params.period_start || ''}~${params.period_end || ''}`,
                          });
                          const summary = result.result || "";
                          setAiSummary(summary);
                          setAiMeta({ id: result.assistanceId, confidence: result.confidence, sources: result.sources, initial: summary });
                          await logActivity({ module: 'ai', action: 'summarize_report' });
                        } catch (e: any) { toast.error(e.message || "AI 총평 생성에 실패했습니다"); }
                        finally { setAiSummaryLoading(false); }
                      }}>
                      <Sparkles className="h-3 w-3" />{aiSummaryLoading ? '생성 중...' : 'AI 총평 생성'}
                    </Button>
                  </div>
                  {aiSummary && (
                    <>
                      <Textarea value={aiSummary} onChange={e => setAiSummary(e.target.value)} rows={6} className="text-sm" />
                      <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                        <span>AI 초안, 검토 후 보고서에 반영</span>
                        {aiMeta?.confidence != null && <Badge variant="outline" className="text-[9px]">신뢰도 {Math.round(aiMeta.confidence * 100)}%</Badge>}
                        {aiMeta?.sources.slice(0, 5).map((source) => <Badge key={source.path} variant="secondary" className="text-[9px]">근거 {source.label}</Badge>)}
                      </div>
                    </>
                  )}
                </div>
              )}

              {result && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${result.status === "completed" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                  {result.status === "completed" ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                  <div>
                    <p className="text-sm font-medium">{result.status === "completed" ? "보고서 생성 완료!" : "생성 실패"}</p>
                    {result.error && <p className="text-xs text-red-600 mt-1">{result.error}</p>}
                  </div>
                  {result.status === "completed" && (
                    <Button size="sm" className="ml-auto" onClick={() => navigate("/reports/history")}>이력 보기</Button>
                  )}
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>이전</Button>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />생성중...</> : "보고서 생성"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
