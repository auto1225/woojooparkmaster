import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Database, Download, FileText, Loader2, Printer, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-logger";
import {
  ANNUAL_LOT_TYPE_OPTIONS,
  ANNUAL_PARKING_REPORT_SECTIONS,
  ANNUAL_PARKING_TEMPLATE_CODE,
  buildAnnualParkingReportModel,
  defaultAnnualParkingReportOptions,
  generateAnnualParkingTestDataset,
  type AnnualParkingLotType,
  type AnnualParkingReportSectionId,
} from "@/lib/annual-parking-report";
import { downloadStoredReport, generateReport, openStoredReport } from "@/lib/report-engine";
import { cn } from "@/lib/utils";
import type { ReportTemplate } from "@/types/report";

const REQUIRED_SECTIONS = ANNUAL_PARKING_REPORT_SECTIONS.filter(section => section.required).map(section => section.id);

export default function AnnualParkingReportBuilder() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const defaults = defaultAnnualParkingReportOptions(2025);
  const [year, setYear] = useState(2025);
  const [comparisonYear, setComparisonYear] = useState(2024);
  const [title, setTitle] = useState("2025년 제주시 공영주차장 현황 통합보고서");
  const [selectedSections, setSelectedSections] = useState<AnnualParkingReportSectionId[]>(defaults.selectedSections);
  const [lotTypes, setLotTypes] = useState<AnnualParkingLotType[]>(defaults.lotTypes);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [includeAppendix, setIncludeAppendix] = useState(true);
  const [officialDocumentNumber, setOfficialDocumentNumber] = useState("");
  const [disclosureStatus, setDisclosureStatus] = useState("공개");
  const [disclosureBasis, setDisclosureBasis] = useState("");
  const [documentSummary, setDocumentSummary] = useState("2025년 제주시 공영주차장의 공급·이용·수입·민원·시설·안전 현황을 전년과 비교하여 중점관리 대상과 차년도 조치계획을 결정하기 위함.");
  const [keywords, setKeywords] = useState("제주시, 공영주차장, 연간현황, 운영분석, 시설안전, 민원");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [result, setResult] = useState<{ id: string; reportNumber: string; filePath: string; hwpPath?: string; documentLinked: boolean } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const { data: template, isError: templateError } = useQuery({
    queryKey: ["annual-parking-report-template"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates")
        .select("*")
        .in("template_code", [ANNUAL_PARKING_TEMPLATE_CODE, "RPT-YEARLY", "RPT-DEMO-ANNUAL"])
        .eq("is_active", true);
      if (error) throw error;
      const selected = data?.find(item => item.template_code === ANNUAL_PARKING_TEMPLATE_CODE)
        ?? data?.find(item => item.template_code === "RPT-YEARLY")
        ?? data?.find(item => item.template_code === "RPT-DEMO-ANNUAL");
      if (!selected) throw new Error("연간 통합보고서 템플릿이 없습니다. 최신 데이터베이스 변경사항을 적용해 주세요.");
      return selected as any as ReportTemplate;
    },
  });

  const model = useMemo(() => buildAnnualParkingReportModel(
    generateAnnualParkingTestDataset(undefined, comparisonYear, year),
    { year, comparisonYear, selectedSections, orientation, lotTypes, includeAppendix },
  ), [comparisonYear, includeAppendix, lotTypes, orientation, selectedSections, year]);

  useEffect(() => {
    setTitle(`${year}년 제주시 공영주차장 현황 통합보고서`);
  }, [year]);

  useEffect(() => {
    if (!result) return;
    const frame = window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      resultRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result]);

  const toggleSection = (id: AnnualParkingReportSectionId, checked: boolean) => {
    const section = ANNUAL_PARKING_REPORT_SECTIONS.find(item => item.id === id);
    if (section?.required && !checked) return toast.info(`${section.label}은 통합보고서 필수 항목입니다.`);
    setSelectedSections(current => checked ? Array.from(new Set([...current, id])) : current.filter(item => item !== id));
    if (id === "appendix") setIncludeAppendix(checked);
  };

  const toggleAllSections = (checked: boolean) => {
    setSelectedSections(checked ? ANNUAL_PARKING_REPORT_SECTIONS.map(section => section.id) : [...REQUIRED_SECTIONS]);
    setIncludeAppendix(checked);
  };

  const validate = () => {
    if (!user || !template) return "로그인 또는 연간보고서 템플릿을 확인해 주세요.";
    if (!title.trim()) return "보고서 제목을 입력해 주세요.";
    if (year < 2000 || comparisonYear >= year) return "보고연도와 비교연도를 확인해 주세요.";
    if (!lotTypes.length) return "한 개 이상의 주차장 형태를 선택해 주세요.";
    if (disclosureStatus !== "공개" && !disclosureBasis.trim()) return "부분공개·비공개 문서는 근거를 입력해 주세요.";
    return "";
  };

  const handleGenerate = async () => {
    const error = validate();
    if (error) {
      setGenerationError(error);
      return toast.error(error);
    }
    setGenerating(true);
    setGenerationError("");
    setResult(null);
    try {
      const generated = await generateReport({
        template: template!,
        title: title.trim(),
        description: documentSummary.trim(),
        outputFormat: "pdf+hwpx",
        userId: user!.id,
        authorName: profile?.name || user!.email || "",
        parameters: {
          report_scope: "annual_parking",
          year: String(year),
          comparison_year: String(comparisonYear),
          period_start: `${year}-01-01`,
          period_end: `${year}-12-31`,
          annual_sections: selectedSections.join(","),
          annual_lot_types: lotTypes.join(","),
          annual_orientation: orientation,
          annual_include_appendix: String(includeAppendix),
          fixture_version: "JEJU-ANNUAL-2025-v1",
          official_document_number: officialDocumentNumber.trim(),
          disclosure_status: disclosureStatus,
          disclosure_basis: disclosureBasis.trim(),
          document_summary: documentSummary.trim(),
          keywords: keywords.trim(),
        },
      });
      await logActivity({ module: "REPORT", action: "제주시 공영주차장 연간 통합보고서 생성", targetType: "report", targetId: generated.id, targetName: title.trim() });
      setResult({ id: generated.id, reportNumber: generated.reportNumber, filePath: generated.filePath, hwpPath: generated.hwpPath, documentLinked: generated.documentLinked });
      toast.success("연간 통합보고서 한글 원본과 동일한 한컴 PDF를 생성했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "연간 통합보고서 생성에 실패했습니다.";
      setGenerationError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const saveFile = async (path: string | undefined, extension: "pdf" | "hwpx") => {
    if (!path) return toast.error("저장할 파일이 없습니다.");
    try {
      const saved = await downloadStoredReport(path, `${title}.${extension}`);
      if (saved !== "cancelled") toast.success(saved === "saved" ? "선택한 위치에 저장했습니다." : "파일 다운로드를 시작했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일을 저장하지 못했습니다.");
    }
  };

  const allSectionsSelected = selectedSections.length === ANNUAL_PARKING_REPORT_SECTIONS.length;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" aria-label="보고서 센터로 돌아가기" onClick={() => navigate("/reports")}><ArrowLeft className="h-4 w-4" /></Button>
            <div><p className="text-sm text-muted-foreground">보고서/통계 · 연간 통합</p><h1 className="mt-1 text-xl font-bold">제주시 공영주차장 연간 통합보고서</h1><p className="mt-1 text-sm text-muted-foreground">현황·전년 비교·원인 분석·중점관리 대상·차년도 조치계획을 한 문서로 작성합니다.</p></div>
          </div>
          <div className="flex items-center gap-2"><div className="hidden xl:flex xl:gap-2"><Badge variant="outline">HWPX 원본</Badge><Badge variant="outline">한컴 변환 PDF</Badge><Badge variant="secondary">A4 세로 기본</Badge></div><Button onClick={handleGenerate} disabled={generating || templateError}>{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}통합보고서 생성</Button></div>
        </div>

        <div className="flex gap-3 border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <Database className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-semibold">2025년 보고서 검증자료 준비 완료</p><p className="mt-1">제주시 현황조사 기준 112개소·6,380면에 2024~2025년 24개월 월별지표 {model.sourceCounts.monthlyFacts.toLocaleString("ko-KR")}건을 고정 규칙으로 생성합니다. 실제 행정실적과 혼동되지 않도록 문서에 시범자료 표기가 포함됩니다.</p></div>
        </div>

        {templateError && <div role="alert" className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">연간 통합보고서 템플릿을 불러오지 못했습니다.</div>}
        {generationError && <div role="alert" className="flex gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{generationError}</span></div>}

        <Card>
          <CardContent className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(300px,2fr)_130px_130px_auto]">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1"><Label htmlFor="annual-title">제목 *</Label><Input id="annual-title" value={title} onChange={event => setTitle(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>보고연도 *</Label><Select value={String(year)} onValueChange={value => setYear(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[2025, 2026, 2027].map(value => <SelectItem key={value} value={String(value)}>{value}년</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>비교연도 *</Label><Select value={String(comparisonYear)} onValueChange={value => setComparisonYear(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[2023, 2024, 2025, 2026].filter(value => value < year).map(value => <SelectItem key={value} value={String(value)}>{value}년</SelectItem>)}</SelectContent></Select></div>
            <Dialog><DialogTrigger asChild><Button type="button" variant="outline" className="self-end"><FileText className="mr-1.5 h-4 w-4" />문서 세부정보</Button></DialogTrigger><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>문서 세부정보</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="annual-document">관련 공문 문서번호</Label><Input id="annual-document" value={officialDocumentNumber} onChange={event => setOfficialDocumentNumber(event.target.value)} placeholder="제주시청-차량관리과운영팀-2025-번호" /></div>
              <div className="space-y-1.5"><Label>공개구분 *</Label><Select value={disclosureStatus} onValueChange={setDisclosureStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="공개">공개</SelectItem><SelectItem value="부분공개">부분공개</SelectItem><SelectItem value="비공개">비공개</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="annual-basis">비공개 근거</Label><Input id="annual-basis" value={disclosureBasis} onChange={event => setDisclosureBasis(event.target.value)} disabled={disclosureStatus === "공개"} placeholder="정보공개법 제9조 제1항 제○호" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="annual-summary">작성 목적·핵심 내용</Label><Textarea id="annual-summary" rows={3} value={documentSummary} onChange={event => setDocumentSummary(event.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="annual-keywords">키워드</Label><Input id="annual-keywords" value={keywords} onChange={event => setKeywords(event.target.value)} /></div>
            </div></DialogContent></Dialog>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(300px,0.82fr)_minmax(420px,1.18fr)] lg:items-start">
          <Card className="h-fit"><CardHeader className="border-b p-3"><CardTitle className="text-base">작성 조건</CardTitle></CardHeader><CardContent className="space-y-4 p-3">
            <div className="space-y-2"><Label>주차장 형태 *</Label><div className="grid grid-cols-3 gap-2">{ANNUAL_LOT_TYPE_OPTIONS.map(option => {
              const selected = lotTypes.includes(option.value);
              const count = model.typeSummary.find(row => row.lotType === option.value)?.lotCount || 0;
              return <label key={option.value} className={cn("flex min-h-12 cursor-pointer flex-col items-center justify-center border px-2 text-xs", selected ? "border-primary bg-primary/10 font-medium text-primary ring-1 ring-primary/20" : "border-border bg-background")}><span className="flex items-center gap-1.5"><Checkbox checked={selected} onCheckedChange={checked => setLotTypes(current => checked ? Array.from(new Set([...current, option.value])) : current.filter(value => value !== option.value))} />{option.label}</span><span className="mt-1 text-[11px] text-muted-foreground">{count}개소</span></label>;
            })}</div></div>
            <div className="space-y-2"><Label>용지 방향</Label><div className="grid grid-cols-2 gap-2">{(["portrait", "landscape"] as const).map(value => <Button key={value} type="button" variant="outline" aria-pressed={orientation === value} className={cn("min-h-10", orientation === value && "border-primary bg-primary text-primary-foreground ring-2 ring-primary/25 hover:bg-primary/90 hover:text-primary-foreground")} onClick={() => setOrientation(value)}>{orientation === value && <CheckCircle2 className="mr-1.5 h-4 w-4" />}{value === "portrait" ? "A4 세로" : "A4 가로"}</Button>)}</div></div>
            <div className="grid grid-cols-2 gap-2 text-sm"><div className="border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">대상시설</p><strong>{model.current.lotCount.toLocaleString("ko-KR")}개소</strong></div><div className="border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">총 주차면</p><strong>{model.current.spaces.toLocaleString("ko-KR")}면</strong></div><div className="border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">비교기간</p><strong>24개월</strong></div><div className="border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">월별지표</p><strong>{model.sourceCounts.monthlyFacts.toLocaleString("ko-KR")}건</strong></div></div>
          </CardContent></Card>

          <Card className="h-fit"><CardHeader className="space-y-2 border-b p-3"><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">출력 항목</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">통합보고서에 포함할 분석 영역을 선택하세요.</p></div><Badge variant="secondary">{selectedSections.length}개 영역</Badge></div><label className={cn("flex min-h-9 w-fit cursor-pointer items-center gap-2 border px-3 text-sm", allSectionsSelected ? "border-primary bg-primary/10 font-medium text-primary" : "border-border")}><Checkbox checked={allSectionsSelected ? true : "indeterminate"} onCheckedChange={checked => toggleAllSections(Boolean(checked))} />출력항목 전체 선택</label></CardHeader><CardContent className="grid gap-2 p-3 sm:grid-cols-2">{ANNUAL_PARKING_REPORT_SECTIONS.map(section => {
            const selected = selectedSections.includes(section.id);
            return <label key={section.id} className={cn("flex min-h-14 cursor-pointer items-start gap-2 border p-3", selected ? "border-primary bg-primary/5" : "border-border bg-background", section.required && "cursor-default")}><Checkbox checked={selected} disabled={section.required} onCheckedChange={checked => toggleSection(section.id, Boolean(checked))} /><span><span className="block text-sm font-medium">{section.label}{section.required && <Badge variant="outline" className="ml-2 text-[10px]">필수</Badge>}</span><span className="mt-0.5 block text-xs text-muted-foreground">{section.description}</span></span></label>;
          })}</CardContent></Card>
        </div>

        <div className="sticky bottom-3 z-20 border bg-background/95 p-3 shadow-lg backdrop-blur lg:hidden"><Button className="min-h-11 w-full" onClick={handleGenerate} disabled={generating || templateError}>{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}통합보고서 생성</Button></div>

        {result && <div ref={resultRef} tabIndex={-1} role="status" aria-live="polite" className="scroll-mt-4 space-y-4 border border-emerald-400 bg-emerald-50 p-4 outline-none focus:ring-2 focus:ring-emerald-600"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><div><p className="font-medium text-emerald-950">2025년 연간 통합보고서 생성 완료</p><p className="font-mono text-xs text-emerald-800">{result.reportNumber}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openStoredReport(result.filePath)}><Printer className="mr-1.5 h-4 w-4" />PDF 보기·인쇄</Button><Button variant="outline" size="sm" onClick={() => saveFile(result.filePath, "pdf")}><Download className="mr-1.5 h-4 w-4" />PDF 저장 위치 선택</Button>{result.hwpPath && <Button variant="outline" size="sm" onClick={() => saveFile(result.hwpPath, "hwpx")}><Download className="mr-1.5 h-4 w-4" />HWPX 저장 위치 선택</Button>}<Button size="sm" onClick={() => navigate("/reports/history")}><FileText className="mr-1.5 h-4 w-4" />이력</Button></div></div><DocumentLinksPanel module="REPORT" recordId={result.id} recordPath={`/reports/history?report=${result.id}`} recordTitle={`${result.reportNumber} ${title}`} initialDocumentNumber={officialDocumentNumber} /></div>}
      </div>
    </DashboardLayout>
  );
}
