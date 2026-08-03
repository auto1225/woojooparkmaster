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
import { ChevronRight, FileText, Loader2, CheckCircle2, XCircle, Sparkles, Database, CircleAlert } from "lucide-react";
import { REPORT_TYPE_LABELS, REPORT_CATEGORY_LABELS, type ReportTemplate } from "@/types/report";
import { logActivity } from "@/lib/activity-logger";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { callAI, reviewAIAssistance, type AISource } from "@/lib/ai-service";
import { runtimeConfig } from "@/config/runtime-config";
import { Textarea } from "@/components/ui/textarea";
import { generateReport, getDefaultReportParameters, getReportEvidence } from "@/lib/report-engine";
import { isModuleEnabled } from "@/lib/authorization";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";

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
  const [result, setResult] = useState<{ status: string; id?: string; error?: string; documentLinked?: boolean; documentNumber?: string } | null>(null);
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
        .eq("is_active", true)
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
        if (!sourceId) {
          setTitle(t.name);
          setParams(getDefaultReportParameters(t.report_type));
        }
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

  const evidenceQuery = useQuery({
    queryKey: ["report-evidence", selectedTemplate?.id, params],
    enabled: step === 3 && Boolean(selectedTemplate),
    retry: 1,
    queryFn: () => getReportEvidence(params),
  });

  const validateSettings = () => {
    if (!selectedTemplate) return false;
    if (!title.trim()) {
      toast.error("보고서 제목을 입력해 주세요.");
      return false;
    }
    const missing = (selectedTemplate.parameters || []).find((parameter: any) => {
      if (!parameter.required) return false;
      if (parameter.type === "daterange") return !params.period_start || !params.period_end;
      if (parameter.type === "quarter") return !params[`${parameter.name}_year`] || !params[`${parameter.name}_q`];
      return !params[parameter.name];
    });
    if (missing) {
      toast.error(`${missing.label || "필수 조건"}을 입력해 주세요.`);
      return false;
    }
    if (params.period_start && params.period_end && params.period_start > params.period_end) {
      toast.error("보고 종료일은 시작일보다 빠를 수 없습니다.");
      return false;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    if (!user) {
      toast.error("로그인 정보를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      return;
    }
    if (!validateSettings()) return;
    if (evidenceQuery.isError) {
      toast.error("원천자료 검증 오류를 해결한 뒤 생성해 주세요.");
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

      setResult({ status: "completed", id: inserted.id, documentLinked: inserted.documentLinked, documentNumber: inserted.documentNumber });
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

  const parameterLabel = (key: string) => {
    if (key === "official_document_number") return "관련 공문 문서번호";
    if (key === "period_start") return "보고 시작일";
    if (key === "period_end") return "보고 종료일";
    const parameter = (selectedTemplate?.parameters || []).find((item: any) => item.name === key || `${item.name}_year` === key || `${item.name}_q` === key);
    if (!parameter) return key;
    if (key.endsWith("_year")) return `${parameter.label} 연도`;
    if (key.endsWith("_q")) return `${parameter.label} 분기`;
    return parameter.label;
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
                onClick={() => { setSelectedTemplate(t); setTitle(t.name); setParams(getDefaultReportParameters(t.report_type)); }}
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
                <Button onClick={() => { if (validateSettings()) setStep(3); }}>다음</Button>
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
                  <React.Fragment key={k}><span className="text-muted-foreground">{parameterLabel(k)}</span><span>{k.endsWith("_q") ? `${v}분기` : v}</span></React.Fragment>
                ))}
                <span className="text-muted-foreground">형식</span>
                <span>{outputFormat === "pdf+xlsx" ? "PDF + 엑셀" : "PDF"}</span>
              </div>

              <div className="rounded-md border bg-muted/20 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium"><Database className="h-4 w-4 text-primary" />포함 자료 사전 검증</div>
                  {evidenceQuery.isFetching && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />확인 중</span>}
                </div>
                {evidenceQuery.isError ? (
                  <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <div><p className="font-medium">원천자료를 완전하게 조회하지 못했습니다.</p><p className="mt-1">{evidenceQuery.error instanceof Error ? evidenceQuery.error.message : "자료 조회 상태를 확인해 주세요."}</p><Button variant="outline" size="sm" className="mt-2 h-7" onClick={() => evidenceQuery.refetch()}>다시 확인</Button></div>
                  </div>
                ) : evidenceQuery.data ? (
                  <>
                    <p className="mb-2 text-xs text-muted-foreground">보고기간 {evidenceQuery.data.period.start} ~ {evidenceQuery.data.period.end}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                      {[
                        ["주차장", evidenceQuery.data.sourceCounts.parkingLots],
                        ["수입자료", evidenceQuery.data.sourceCounts.revenueRows],
                        ["민원", evidenceQuery.data.sourceCounts.complaintRows],
                        ["장비", evidenceQuery.data.sourceCounts.equipmentRows],
                        ["유지보수", evidenceQuery.data.sourceCounts.maintenanceRows],
                        ["예산집행", evidenceQuery.data.sourceCounts.budgetRows],
                        ["현황조사", evidenceQuery.data.sourceCounts.surveyRows],
                        ["실시간센서", evidenceQuery.data.sourceCounts.sensorRows],
                      ].map(([label, count]) => <div key={String(label)} className="rounded border bg-background px-2 py-2"><span className="block text-muted-foreground">{label}</span><strong className="mt-1 block text-sm">{Number(count).toLocaleString("ko-KR")}건</strong></div>)}
                    </div>
                  </>
                ) : null}
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

              {result?.status === "completed" && result.id && (
                <div className="space-y-2">
                  {result.documentNumber && !result.documentLinked && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      입력한 문서번호가 문서대장에 없어 자동 연결하지 못했습니다. 아래에서 기존 문서를 선택하거나 문서를 등록해 주세요.
                    </p>
                  )}
                  <DocumentLinksPanel
                    module="REPORT"
                    recordId={result.id}
                    recordPath={`/reports/history?report=${result.id}`}
                    recordTitle={`${title} (${result.documentNumber || "문서번호 미지정"})`}
                    initialDocumentNumber={result.documentNumber}
                  />
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>이전</Button>
                <Button onClick={handleGenerate} disabled={generating || evidenceQuery.isFetching || evidenceQuery.isError}>
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
