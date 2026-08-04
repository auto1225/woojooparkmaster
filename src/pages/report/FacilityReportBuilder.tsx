import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ChevronRight, Download, FileText, Loader2, Printer, RotateCcw, ShieldAlert } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-logger";
import { cn } from "@/lib/utils";
import { downloadStoredReport, generateReport, openStoredReport } from "@/lib/report-engine";
import {
  defaultFacilityReportFields,
  FACILITY_LOT_TYPE_OPTIONS,
  FACILITY_REPORT_PRESETS,
  FACILITY_REPORT_SECTIONS,
  getFacilityReportEvidence,
  parseFacilityReportOptions,
  type FacilityReportOrientation,
  type FacilityReportSectionId,
  type FacilityReportSort,
} from "@/lib/facility-report";
import { FACILITY_REPORT_TEMPLATE_CODE } from "@/lib/report-catalog";
import type { ReportTemplate } from "@/types/report";

function localDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

const today = new Date();
const INITIAL_START = localDate(new Date(today.getFullYear(), today.getMonth(), 1));
const INITIAL_END = localDate(today);
const SOURCE_LABELS: Record<string, string> = { lots: "주차장", equipment: "장비", maintenance: "유지보수", schedules: "점검일정", safety: "안전점검", markings: "노면표시", documents: "공식문서", photos: "사진증빙" };
type FacilityPresetKey = keyof typeof FACILITY_REPORT_PRESETS;
const PRESETS = Object.entries(FACILITY_REPORT_PRESETS) as Array<[FacilityPresetKey, (typeof FACILITY_REPORT_PRESETS)[FacilityPresetKey]]>;
const TOTAL_FIELD_COUNT = FACILITY_REPORT_SECTIONS.reduce((sum, section) => sum + section.fields.length, 0);
const validFocus = (value: string | null): value is FacilityReportSectionId => FACILITY_REPORT_SECTIONS.some(section => section.id === value);
const selectionClass = (selected: boolean) => cn("min-h-10 border px-3 transition-colors", selected ? "border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/25 hover:bg-primary/90 hover:text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted");

function sameValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every(value => right.includes(value));
}

function matchingPreset(sections: readonly FacilityReportSectionId[]) {
  return PRESETS.find(([, preset]) => sameValues(sections, preset.sections))?.[0] ?? null;
}

export default function FacilityReportBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sourceId = searchParams.get("source");
  const focus = validFocus(searchParams.get("focus")) ? searchParams.get("focus") as FacilityReportSectionId : null;
  const { user, profile } = useAuth();
  const initialSections = focus && focus !== "overview" ? ["overview", focus] as FacilityReportSectionId[] : FACILITY_REPORT_PRESETS.summary.sections;
  const [title, setTitle] = useState(`${today.getFullYear()}년 ${today.getMonth() + 1}월 시설관리 종합 현황 보고서`);
  const [periodStart, setPeriodStart] = useState(INITIAL_START);
  const [periodEnd, setPeriodEnd] = useState(INITIAL_END);
  const [officialDocumentNumber, setOfficialDocumentNumber] = useState("");
  const [disclosureStatus, setDisclosureStatus] = useState("공개");
  const [disclosureBasis, setDisclosureBasis] = useState("");
  const [documentSummary, setDocumentSummary] = useState("시설·장비의 상태와 점검·정비 이력을 확인하고 안전 및 운영 중단 위험에 선제적으로 대응하기 위함.");
  const [keywords, setKeywords] = useState("공영주차장, 시설관리, 장비, 안전점검, 제주시");
  const [selectedSections, setSelectedSections] = useState<FacilityReportSectionId[]>(initialSections);
  const [selectedFields, setSelectedFields] = useState(defaultFacilityReportFields());
  const [lotTypes, setLotTypes] = useState(FACILITY_LOT_TYPE_OPTIONS.map(item => item.value));
  const [sort, setSort] = useState<FacilityReportSort>("attention");
  const [orientation, setOrientation] = useState<FacilityReportOrientation>("portrait");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [activePreset, setActivePreset] = useState<FacilityPresetKey | null>(focus ? null : "summary");
  const [customized, setCustomized] = useState(Boolean(focus));
  const [activeSection, setActiveSection] = useState<FacilityReportSectionId>(focus || "equipment");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [result, setResult] = useState<{ id: string; reportNumber: string; filePath: string; hwpPath?: string; documentLinked: boolean } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const { data: template, isError: templateError } = useQuery({
    queryKey: ["facility-report-template"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_templates").select("*").eq("template_code", FACILITY_REPORT_TEMPLATE_CODE).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("시설관리 보고서 템플릿이 없습니다.");
      return data as any as ReportTemplate;
    },
  });

  const { data: sourceReport, isError: sourceError } = useQuery({
    queryKey: ["facility-report-copy-source", sourceId], enabled: Boolean(sourceId),
    queryFn: async () => {
      const { data, error } = await supabase.from("report_generated").select("title, description, parameters_used").eq("id", sourceId!).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!sourceReport) return;
    const copied = (sourceReport.parameters_used || {}) as Record<string, string>;
    const options = parseFacilityReportOptions(copied);
    setTitle(sourceReport.title || title);
    setPeriodStart(options.periodStart || INITIAL_START);
    setPeriodEnd(options.periodEnd || INITIAL_END);
    setOfficialDocumentNumber(copied.official_document_number || "");
    setDisclosureStatus(copied.disclosure_status || "공개");
    setDisclosureBasis(copied.disclosure_basis || "");
    setDocumentSummary(copied.document_summary || sourceReport.description || "");
    setKeywords(copied.keywords || keywords);
    setSelectedSections(options.selectedSections);
    setSelectedFields(options.selectedFields);
    const preset = matchingPreset(options.selectedSections);
    setActivePreset(preset);
    setCustomized(!preset);
    setActiveSection(options.selectedSections.find(section => section !== "overview") || "overview");
    setLotTypes(options.lotTypes);
    setSort(options.sort);
    setOrientation(options.orientation);
    setIncludeInactive(options.includeInactive);
  // Copying a report is intentionally a one-time state hydrate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceReport]);

  const parameters = useMemo(() => ({
    period_start: periodStart, period_end: periodEnd, report_scope: "facility",
    official_document_number: officialDocumentNumber.trim(),
    facility_sections: selectedSections.join(","), facility_fields: JSON.stringify(selectedFields),
    facility_lot_types: lotTypes.join(","), facility_sort: sort, facility_orientation: orientation,
    facility_include_inactive: String(includeInactive), disclosure_status: disclosureStatus,
    disclosure_basis: disclosureBasis.trim(), document_summary: documentSummary.trim(), keywords: keywords.trim(),
  }), [periodStart, periodEnd, officialDocumentNumber, selectedSections, selectedFields, lotTypes, sort, orientation, includeInactive, disclosureStatus, disclosureBasis, documentSummary, keywords]);

  const evidenceParameters = useMemo(() => ({
    period_start: periodStart, period_end: periodEnd, report_scope: "facility",
    facility_sections: FACILITY_REPORT_SECTIONS.map(section => section.id).join(","),
    facility_fields: JSON.stringify(defaultFacilityReportFields()), facility_lot_types: lotTypes.join(","),
    facility_sort: sort, facility_include_inactive: String(includeInactive),
  }), [periodStart, periodEnd, lotTypes, sort, includeInactive]);

  const evidence = useQuery({
    queryKey: ["facility-report-evidence", evidenceParameters], queryFn: () => getFacilityReportEvidence(evidenceParameters),
    enabled: Boolean(template && periodStart && periodEnd && periodStart <= periodEnd && lotTypes.length), retry: 1, staleTime: 30_000,
  });

  const configuredFields = useMemo(() => Object.values(selectedFields).reduce((sum, fields) => sum + (fields?.length || 0), 0), [selectedFields]);
  const selectedFieldTotal = useMemo(() => selectedSections.reduce((sum, id) => sum + (selectedFields[id]?.length || 0), 0), [selectedFields, selectedSections]);
  const protectedFieldCount = useMemo(() => selectedSections.reduce((count, id) => {
    const section = FACILITY_REPORT_SECTIONS.find(item => item.id === id);
    return count + (section?.fields.filter(item => item.protected && (selectedFields[id] || []).includes(item.key)).length || 0);
  }, 0), [selectedFields, selectedSections]);
  const allSections = selectedSections.length === FACILITY_REPORT_SECTIONS.length;
  const allFields = configuredFields === TOTAL_FIELD_COUNT;
  const currentSection = FACILITY_REPORT_SECTIONS.find(section => section.id === activeSection) || FACILITY_REPORT_SECTIONS[0];

  useEffect(() => {
    if (!result) return;
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      resultRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      resultRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result]);

  const selectPreset = (key: FacilityPresetKey, resetFields = false) => {
    if (activePreset === key && !resetFields) return;
    const sections = [...FACILITY_REPORT_PRESETS[key].sections];
    setSelectedSections(sections);
    setActivePreset(key);
    if (resetFields) setSelectedFields(defaultFacilityReportFields());
    setCustomized(false);
    setActiveSection(current => sections.includes(current) ? current : sections.find(section => section !== "overview") || "overview");
  };
  const toggleSection = (id: FacilityReportSectionId, checked: boolean) => {
    setCustomized(true); setActivePreset(null);
    setSelectedSections(current => checked ? Array.from(new Set([...current, id])) : current.filter(item => item !== id));
    if (checked) {
      setActiveSection(id);
      const section = FACILITY_REPORT_SECTIONS.find(item => item.id === id);
      if (section?.fields.length && !(selectedFields[id] || []).length) setSelectedFields(current => ({ ...current, [id]: [...section.defaultFields] }));
    }
  };
  const toggleField = (sectionId: FacilityReportSectionId, key: string, checked: boolean) => {
    setCustomized(true);
    setSelectedFields(current => ({ ...current, [sectionId]: checked ? Array.from(new Set([...(current[sectionId] || []), key])) : (current[sectionId] || []).filter(item => item !== key) }));
  };
  const toggleAllFields = (sectionId: FacilityReportSectionId, checked: boolean) => {
    const section = FACILITY_REPORT_SECTIONS.find(item => item.id === sectionId);
    if (!section) return;
    setCustomized(true); setSelectedFields(current => ({ ...current, [sectionId]: checked ? section.fields.map(item => item.key) : [] }));
  };

  const validationError = () => {
    if (!user || !template) return "로그인 또는 보고서 템플릿을 확인해 주세요.";
    if (!title.trim()) return "보고서 제목을 입력해 주세요.";
    if (!periodStart || !periodEnd || periodStart > periodEnd) return "보고기간을 확인해 주세요.";
    if (!selectedSections.length) return "한 개 이상의 시설관리 업무를 선택해 주세요.";
    if (!lotTypes.length) return "한 개 이상의 주차장 형태를 선택해 주세요.";
    if (selectedSections.some(id => id !== "overview" && !(selectedFields[id] || []).length)) return "선택한 업무마다 한 개 이상의 출력 항목을 선택해 주세요.";
    if (disclosureStatus !== "공개" && !disclosureBasis.trim()) return "부분공개·비공개 문서는 근거를 입력해 주세요.";
    if (evidence.isError) return "원천자료 조회 오류를 해결한 뒤 다시 생성해 주세요.";
    return "";
  };

  const handleGenerate = async () => {
    const error = validationError();
    if (error) { setGenerationError(error); toast.error(error); return; }
    setGenerating(true); setGenerationError(""); setResult(null);
    try {
      const generated = await generateReport({ template: template!, title: title.trim(), description: documentSummary.trim(), parameters, outputFormat: "pdf+hwpx", userId: user!.id, authorName: profile?.name || user!.email || "" });
      await logActivity({ module: "FACILITY", action: "시설관리 보고서 생성", targetType: "report", targetId: generated.id, targetName: title.trim() });
      setResult({ id: generated.id, reportNumber: generated.reportNumber, filePath: generated.filePath, hwpPath: generated.hwpPath, documentLinked: generated.documentLinked });
      toast.success("시설관리 한글 원본과 동일한 한컴 PDF를 생성했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "시설관리 보고서 생성에 실패했습니다.";
      setGenerationError(message); toast.error(message);
    } finally { setGenerating(false); }
  };

  const saveFile = async (path: string | undefined, extension: "pdf" | "hwpx") => {
    if (!path) return toast.error("저장할 파일이 없습니다.");
    try {
      const saved = await downloadStoredReport(path, `${title}_${periodStart}_${periodEnd}.${extension}`);
      if (saved !== "cancelled") toast.success(saved === "saved" ? "선택한 위치에 저장했습니다." : "파일 다운로드를 시작했습니다.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "파일을 저장하지 못했습니다."); }
  };

  return <DashboardLayout><div className="space-y-5 pb-20 lg:pb-0">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3"><Button variant="ghost" size="icon" aria-label="보고서 센터로 돌아가기" onClick={() => navigate("/reports")}><ArrowLeft className="h-4 w-4" /></Button><div><p className="text-sm text-muted-foreground">보고서/통계 · 시설관리</p><h1 className="mt-1 text-xl font-bold">{sourceId ? "시설 보고서 조건 복사 작성" : "시설관리 통합보고서"}</h1></div></div>
      <div className="flex items-center gap-2"><div className="hidden xl:flex xl:gap-2"><Badge variant="outline">HWPX 원본</Badge><Badge variant="outline">한컴 변환 PDF</Badge><Badge variant="secondary">A4 세로 기본</Badge></div><Button className="hidden lg:inline-flex" onClick={handleGenerate} disabled={generating || evidence.isPending || templateError || sourceError}>{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}한글·동일 PDF 생성</Button></div>
    </div>
    {(templateError || sourceError) && <div className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{sourceError ? "복사할 보고서 조건을 불러오지 못했습니다." : "시설관리 보고서 템플릿을 불러오지 못했습니다."}</div>}
    {generationError && <div role="alert" className="flex gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-medium">보고서 생성 실패</p><p className="mt-1 break-words">{generationError}</p></div></div>}

    <Card><CardContent className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(260px,2fr)_150px_150px_auto]">
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-1"><Label htmlFor="facility-report-title">제목 *</Label><Input id="facility-report-title" value={title} onChange={event => setTitle(event.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="facility-report-start">시작일 *</Label><Input id="facility-report-start" type="date" value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="facility-report-end">종료일 *</Label><Input id="facility-report-end" type="date" value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></div>
      <Dialog><DialogTrigger asChild><Button type="button" variant="outline" className="self-end"><FileText className="mr-1.5 h-4 w-4" />문서 세부정보</Button></DialogTrigger><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>문서 세부정보</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="facility-report-document">관련 공문 문서번호</Label><Input id="facility-report-document" value={officialDocumentNumber} onChange={event => setOfficialDocumentNumber(event.target.value)} placeholder="제주시청-차량관리과운영팀-연도-번호" /></div>
        <div className="space-y-1.5"><Label>공개구분 *</Label><Select value={disclosureStatus} onValueChange={setDisclosureStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="공개">공개</SelectItem><SelectItem value="부분공개">부분공개</SelectItem><SelectItem value="비공개">비공개</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="facility-report-basis">비공개 근거</Label><Input id="facility-report-basis" value={disclosureBasis} onChange={event => setDisclosureBasis(event.target.value)} disabled={disclosureStatus === "공개"} placeholder="정보공개법 제9조 제1항 제○호" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="facility-report-summary">작성 목적·핵심 내용</Label><Textarea id="facility-report-summary" rows={3} value={documentSummary} onChange={event => setDocumentSummary(event.target.value)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="facility-report-keywords">키워드</Label><Input id="facility-report-keywords" value={keywords} onChange={event => setKeywords(event.target.value)} /></div>
      </div></DialogContent></Dialog>
    </CardContent></Card>

    <div className="grid gap-4 lg:grid-cols-[minmax(300px,0.82fr)_minmax(420px,1.18fr)] lg:items-start">
      <Card className="h-fit"><CardHeader className="border-b p-3"><CardTitle className="text-base">조회 조건</CardTitle></CardHeader><CardContent className="space-y-3 p-3">
        <div className="space-y-2"><div className="flex min-h-7 flex-wrap items-center justify-between gap-2"><Label>보고서 구성</Label><div className="flex items-center gap-1.5">{customized && <Badge className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-50">사용자 조정됨</Badge>}{customized && activePreset && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => selectPreset(activePreset, true)}><RotateCcw className="mr-1 h-3.5 w-3.5" />기본값 복원</Button>}</div></div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="보고서 구성">{PRESETS.map(([key, preset]) => { const selected = activePreset === key; return <Button key={key} type="button" variant="outline" className={cn(selectionClass(selected), "justify-center px-2")} aria-pressed={selected} onClick={() => selectPreset(key)}>{selected && <CheckCircle2 className="mr-1.5 h-4 w-4 shrink-0" />}{preset.label}</Button>; })}</div>
        </div>
        <div className="space-y-2"><Label>주차장 형태 *</Label><div className="grid grid-cols-3 gap-2">{FACILITY_LOT_TYPE_OPTIONS.map(item => { const selected = lotTypes.includes(item.value); return <label key={item.value} className={cn("flex min-h-10 cursor-pointer items-center justify-center gap-1 whitespace-nowrap border px-1 text-xs transition-colors", selected ? "border-primary bg-primary/10 font-medium text-primary ring-1 ring-primary/20" : "border-border bg-background hover:bg-muted")}><Checkbox checked={selected} onCheckedChange={checked => setLotTypes(current => checked ? Array.from(new Set([...current, item.value])) : current.filter(value => value !== item.value))} />{item.label}</label>; })}</div></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>정렬</Label><Select value={sort} onValueChange={value => setSort(value as FacilityReportSort)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="attention">조치 필요 우선</SelectItem><SelectItem value="parking_lot">주차장명순</SelectItem><SelectItem value="date_desc">최근일자순</SelectItem><SelectItem value="cost_desc">비용 큰순</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>용지 방향</Label><div className="grid grid-cols-2 gap-2" role="group" aria-label="용지 방향"><Button type="button" size="sm" variant="outline" className={selectionClass(orientation === "portrait")} aria-pressed={orientation === "portrait"} onClick={() => setOrientation("portrait")}>{orientation === "portrait" && <CheckCircle2 className="mr-1.5 h-4 w-4" />}A4 세로</Button><Button type="button" size="sm" variant="outline" className={selectionClass(orientation === "landscape")} aria-pressed={orientation === "landscape"} onClick={() => setOrientation("landscape")}>{orientation === "landscape" && <CheckCircle2 className="mr-1.5 h-4 w-4" />}A4 가로</Button></div></div>
        </div>
        <label className={cn("flex min-h-10 cursor-pointer items-center justify-between gap-3 border px-3 text-sm transition-colors", includeInactive ? "border-primary bg-primary/10 font-medium text-primary" : "border-border bg-background")}><span>중지·폐기·보관 자료 포함</span><Switch checked={includeInactive} onCheckedChange={setIncludeInactive} /></label>
        {protectedFieldCount > 0 && <div className="flex gap-2 border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>개인·보안정보 {protectedFieldCount}개 항목이 포함됩니다. 공개구분과 배포 범위를 확인하세요.</span></div>}
        <details className="group border-t pt-2 text-sm"><summary className="flex min-h-8 cursor-pointer list-none items-center justify-between font-medium marker:content-none"><span className="flex items-center gap-2">원천자료 확인{evidence.data && <Badge variant="secondary">{Object.entries(evidence.data.sourceCounts).filter(([key]) => !["documents", "photos"].includes(key)).reduce((sum, [, count]) => sum + Number(count), 0).toLocaleString("ko-KR")}건</Badge>}</span><span className="flex items-center gap-2">{evidence.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}<ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" /></span></summary><div className="pt-3">{evidence.isError ? <div className="flex items-center justify-between text-destructive"><span>원천자료를 확인하지 못했습니다.</span><Button variant="outline" size="sm" onClick={() => evidence.refetch()}>다시 확인</Button></div> : evidence.data ? <><div className="grid grid-cols-2 gap-2">{Object.entries(evidence.data.sourceCounts).map(([key, count]) => <div key={key} className="flex items-center justify-between border bg-muted/20 px-2 py-1.5"><span className="text-xs">{SOURCE_LABELS[key] || key}</span><strong className="text-sm">{Number(count).toLocaleString("ko-KR")}건</strong></div>)}</div><p className="mt-2 text-xs text-muted-foreground">사진은 등록 건수만 보고하며 PC 절대경로와 개인정보 메타데이터는 출력하지 않습니다.</p></> : <p className="text-muted-foreground">조회 조건을 확인해 주세요.</p>}</div></details>
      </CardContent></Card>

      <Card className="h-fit"><CardHeader className="space-y-2 border-b p-3"><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">출력 항목</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">시설관리 업무와 세부 항목을 선택하세요.</p></div><div className="flex gap-2"><Badge variant="secondary">{selectedSections.length}개 업무</Badge><Badge variant="outline">{selectedFieldTotal}개 항목</Badge></div></div>
        <div className="flex flex-wrap gap-2 border-t pt-2"><label className={cn("flex min-h-9 cursor-pointer items-center gap-2 border px-3 text-sm", allSections ? "border-primary bg-primary/10 font-medium text-primary" : "border-border")}><Checkbox checked={allSections ? true : selectedSections.length ? "indeterminate" : false} onCheckedChange={checked => { setCustomized(true); setActivePreset(null); setSelectedSections(checked ? FACILITY_REPORT_SECTIONS.map(section => section.id) : []); }} />업무 전체 선택</label><label className={cn("flex min-h-9 cursor-pointer items-center gap-2 border px-3 text-sm", allFields ? "border-primary bg-primary/10 font-medium text-primary" : "border-border")}><Checkbox checked={allFields ? true : configuredFields ? "indeterminate" : false} onCheckedChange={checked => { setCustomized(true); setSelectedFields(Object.fromEntries(FACILITY_REPORT_SECTIONS.map(section => [section.id, checked ? section.fields.map(field => field.key) : []]))); }} />출력항목 전체 선택</label></div>
      </CardHeader><CardContent className="space-y-3 p-3"><div className="grid grid-cols-2 gap-2 lg:grid-cols-3">{FACILITY_REPORT_SECTIONS.map(section => { const enabled = selectedSections.includes(section.id); const active = activeSection === section.id; return <div key={section.id} className={cn("grid min-h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 border px-2 py-1", active ? "border-primary bg-primary/10 ring-2 ring-primary/20" : enabled ? "border-primary/40 bg-primary/5" : "border-border")}><Checkbox checked={enabled} onCheckedChange={checked => toggleSection(section.id, Boolean(checked))} /><button type="button" className="flex min-w-0 items-center justify-between gap-1 text-left" onClick={() => setActiveSection(section.id)}><span className={cn("truncate text-xs font-medium", active && "text-primary")}>{section.label}</span><span className="shrink-0 text-[11px] text-muted-foreground">{section.fields.length ? `${(selectedFields[section.id] || []).length}/${section.fields.length}` : "자동"}</span></button><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>; })}</div>
        <div className="border-t pt-3"><div className="mb-2 flex min-h-9 flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{currentSection.label} 세부 항목</p><p className="text-xs text-muted-foreground">{currentSection.description}</p></div>{currentSection.fields.length > 0 && <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium"><Checkbox checked={(selectedFields[currentSection.id] || []).length === currentSection.fields.length ? true : (selectedFields[currentSection.id] || []).length ? "indeterminate" : false} disabled={!selectedSections.includes(currentSection.id)} onCheckedChange={checked => toggleAllFields(currentSection.id, Boolean(checked))} />전체 선택 <Badge variant="secondary">{(selectedFields[currentSection.id] || []).length}/{currentSection.fields.length}</Badge></label>}</div>
          {currentSection.fields.length ? <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">{currentSection.fields.map(item => <label key={item.key} className={cn("flex min-h-9 cursor-pointer items-center gap-2 px-1 text-sm", !selectedSections.includes(currentSection.id) && "cursor-not-allowed text-muted-foreground")}><Checkbox checked={(selectedFields[currentSection.id] || []).includes(item.key)} disabled={!selectedSections.includes(currentSection.id)} onCheckedChange={checked => toggleField(currentSection.id, item.key, Boolean(checked))} /><span className="truncate">{item.label}{item.protected && <span className="ml-1 text-xs text-amber-700">보호</span>}</span></label>)}</div> : <p className="py-3 text-sm text-muted-foreground">시설 현황은 선택한 업무의 주요 지표로 자동 구성됩니다.</p>}
        </div>
      </CardContent></Card>
    </div>

    <div className="fixed inset-x-4 bottom-20 z-30 border bg-background/95 p-2 shadow-lg backdrop-blur lg:hidden"><Button className="min-h-11 w-full" onClick={handleGenerate} disabled={generating || evidence.isPending || templateError || sourceError}>{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}한글·동일 PDF 생성 <span className="ml-2 hidden text-xs opacity-80 sm:inline">{selectedSections.length}개 업무·{selectedFieldTotal}개 항목</span></Button></div>
    {result && <div ref={resultRef} tabIndex={-1} role="status" aria-live="polite" className="scroll-mt-4 space-y-4 border border-emerald-400 bg-emerald-50 p-4 outline-none focus:ring-2 focus:ring-emerald-600"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><div><p className="font-medium text-emerald-950">시설관리 보고서 생성 완료</p><p className="font-mono text-xs text-emerald-800">{result.reportNumber}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openStoredReport(result.filePath)}><Printer className="mr-1.5 h-4 w-4" />PDF 보기·인쇄</Button><Button variant="outline" size="sm" onClick={() => saveFile(result.filePath, "pdf")}><Download className="mr-1.5 h-4 w-4" />PDF 저장 위치 선택</Button>{result.hwpPath && <Button variant="outline" size="sm" onClick={() => saveFile(result.hwpPath, "hwpx")}><Download className="mr-1.5 h-4 w-4" />HWPX 저장 위치 선택</Button>}<Button size="sm" onClick={() => navigate("/reports/history")}><FileText className="mr-1.5 h-4 w-4" />이력</Button></div></div>{officialDocumentNumber && !result.documentLinked && <p className="text-xs text-amber-900">입력한 문서번호가 문서대장에 없어 자동 연결하지 못했습니다.</p>}<DocumentLinksPanel module="REPORT" recordId={result.id} recordPath={`/reports/history?report=${result.id}`} recordTitle={`${result.reportNumber} ${title}`} initialDocumentNumber={officialDocumentNumber} /></div>}
  </div></DashboardLayout>;
}
