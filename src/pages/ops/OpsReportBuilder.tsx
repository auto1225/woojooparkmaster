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
  defaultOperationsReportFields,
  getOperationsReportEvidence,
  OPERATIONS_LOT_TYPE_OPTIONS,
  OPERATIONS_REPORT_PRESETS,
  OPERATIONS_REPORT_SECTIONS,
  parseOperationsReportOptions,
  type OperationsReportSectionId,
  type OperationsReportOrientation,
  type OperationsReportSort,
} from "@/lib/operations-report";
import type { ReportTemplate } from "@/types/report";
import { OPERATIONS_REPORT_TEMPLATE_CODE } from "@/lib/report-catalog";

function localDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

const today = new Date();
const INITIAL_START = localDate(new Date(today.getFullYear(), today.getMonth(), 1));
const INITIAL_END = localDate(today);

const SOURCE_LABELS: Record<string, string> = {
  lots: "주차장", contracts: "위탁계약", staff: "인력", fees: "요금정책", exemptions: "감면",
  passes: "정기권", enforcement: "단속", freeHours: "무료개방", abandoned: "방치차량", security: "보안점검",
};

type OperationsReportPresetKey = keyof typeof OPERATIONS_REPORT_PRESETS;

const PRESET_ENTRIES = Object.entries(OPERATIONS_REPORT_PRESETS) as Array<
  [OperationsReportPresetKey, (typeof OPERATIONS_REPORT_PRESETS)[OperationsReportPresetKey]]
>;
const TOTAL_OUTPUT_FIELD_COUNT = OPERATIONS_REPORT_SECTIONS.reduce((sum, section) => sum + section.fields.length, 0);

function sameValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every(value => right.includes(value));
}

function findMatchingPreset(sections: readonly OperationsReportSectionId[]) {
  return PRESET_ENTRIES.find(([, preset]) => sameValues(sections, preset.sections))?.[0] ?? null;
}

function fieldsMatchDefaults(fields: ReturnType<typeof defaultOperationsReportFields>) {
  const defaults = defaultOperationsReportFields();
  return OPERATIONS_REPORT_SECTIONS.every(section => sameValues(fields[section.id] || [], defaults[section.id] || []));
}

const selectionButtonClass = (selected: boolean) => cn(
  "min-h-10 border px-3 transition-colors",
  selected
    ? "border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/25 hover:bg-primary/90 hover:text-primary-foreground"
    : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted",
);

export default function OpsReportBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sourceId = searchParams.get("source");
  const { user, profile } = useAuth();
  const [title, setTitle] = useState(`${today.getFullYear()}년 ${today.getMonth() + 1}월 운영관리 종합 현황 보고서`);
  const [periodStart, setPeriodStart] = useState(INITIAL_START);
  const [periodEnd, setPeriodEnd] = useState(INITIAL_END);
  const [officialDocumentNumber, setOfficialDocumentNumber] = useState("");
  const [disclosureStatus, setDisclosureStatus] = useState("공개");
  const [disclosureBasis, setDisclosureBasis] = useState("");
  const [documentSummary, setDocumentSummary] = useState("보고기간 중 제주시 공영주차장의 운영 현황과 조치 필요사항을 파악하여 업무 우선순위와 후속 조치를 결정하기 위함.");
  const [keywords, setKeywords] = useState("공영주차장, 운영관리, 제주시");
  const [selectedSections, setSelectedSections] = useState<OperationsReportSectionId[]>(OPERATIONS_REPORT_PRESETS.summary.sections);
  const [selectedFields, setSelectedFields] = useState(defaultOperationsReportFields());
  const [lotTypes, setLotTypes] = useState(OPERATIONS_LOT_TYPE_OPTIONS.map(item => item.value));
  const [sort, setSort] = useState<OperationsReportSort>("parking_lot");
  const [orientation, setOrientation] = useState<OperationsReportOrientation>("portrait");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [result, setResult] = useState<{ id: string; reportNumber: string; filePath: string; hwpPath?: string; documentLinked: boolean } | null>(null);
  const [activePreset, setActivePreset] = useState<OperationsReportPresetKey | null>("summary");
  const [presetCustomized, setPresetCustomized] = useState(false);
  const [activeFieldSection, setActiveFieldSection] = useState<OperationsReportSectionId>("lots");
  const resultRef = useRef<HTMLDivElement>(null);

  const { data: template, isError: templateError } = useQuery({
    queryKey: ["operations-report-template"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_templates").select("*").in("template_code", [OPERATIONS_REPORT_TEMPLATE_CODE, "RPT-MONTHLY"]).eq("is_active", true);
      if (error) throw error;
      const selected = data?.find(item => item.template_code === OPERATIONS_REPORT_TEMPLATE_CODE)
        ?? data?.find(item => item.template_code === "RPT-MONTHLY");
      if (!selected) throw new Error("운영관리 현황 보고서 템플릿이 없습니다.");
      return selected as any as ReportTemplate;
    },
  });

  const { data: sourceReport, isError: sourceReportError } = useQuery({
    queryKey: ["operations-report-copy-source", sourceId],
    enabled: Boolean(sourceId),
    queryFn: async () => {
      const { data, error } = await supabase.from("report_generated").select("title, description, parameters_used").eq("id", sourceId!).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!sourceReport) return;
    const copied = (sourceReport.parameters_used || {}) as Record<string, string>;
    const options = parseOperationsReportOptions(copied);
    setTitle(sourceReport.title || `${today.getFullYear()}년 ${today.getMonth() + 1}월 운영관리 종합 현황 보고서`);
    setPeriodStart(options.periodStart || INITIAL_START);
    setPeriodEnd(options.periodEnd || INITIAL_END);
    setOfficialDocumentNumber(copied.official_document_number || "");
    setDisclosureStatus(copied.disclosure_status || "공개");
    setDisclosureBasis(copied.disclosure_basis || "");
    setDocumentSummary(copied.document_summary || sourceReport.description || "");
    setKeywords(copied.keywords || "공영주차장, 운영관리, 제주시");
    setSelectedSections(options.selectedSections);
    setSelectedFields(options.selectedFields);
    const matchedPreset = findMatchingPreset(options.selectedSections);
    setActivePreset(matchedPreset);
    setPresetCustomized(!matchedPreset || !fieldsMatchDefaults(options.selectedFields));
    setActiveFieldSection(options.selectedSections.find(section => section !== "overview") || "overview");
    setLotTypes(options.lotTypes);
    setSort(options.sort);
    setOrientation(options.orientation);
    setIncludeInactive(options.includeInactive);
  }, [sourceReport]);

  const parameters = useMemo(() => ({
    period_start: periodStart,
    period_end: periodEnd,
    official_document_number: officialDocumentNumber.trim(),
    report_scope: "operations",
    ops_sections: selectedSections.join(","),
    ops_fields: JSON.stringify(selectedFields),
    ops_lot_types: lotTypes.join(","),
    ops_sort: sort,
    ops_orientation: orientation,
    ops_include_inactive: String(includeInactive),
    disclosure_status: disclosureStatus,
    disclosure_basis: disclosureBasis.trim(),
    document_summary: documentSummary.trim(),
    keywords: keywords.trim(),
  }), [periodStart, periodEnd, officialDocumentNumber, selectedSections, selectedFields, lotTypes, sort, orientation, includeInactive, disclosureStatus, disclosureBasis, documentSummary, keywords]);

  const evidenceParameters = useMemo(() => ({
    period_start: periodStart,
    period_end: periodEnd,
    report_scope: "operations",
    ops_sections: OPERATIONS_REPORT_SECTIONS.map(section => section.id).join(","),
    ops_fields: JSON.stringify(defaultOperationsReportFields()),
    ops_lot_types: lotTypes.join(","),
    ops_sort: sort,
    ops_include_inactive: String(includeInactive),
  }), [periodStart, periodEnd, lotTypes, sort, includeInactive]);

  const evidence = useQuery({
    queryKey: ["operations-report-evidence", evidenceParameters],
    queryFn: () => getOperationsReportEvidence(evidenceParameters),
    enabled: Boolean(template && periodStart && periodEnd && periodStart <= periodEnd && lotTypes.length),
    placeholderData: previousData => lotTypes.length ? previousData : undefined,
    retry: 1,
    staleTime: 30_000,
  });

  const sensitiveFieldCount = useMemo(() => selectedSections.reduce((count, sectionId) => {
    const section = OPERATIONS_REPORT_SECTIONS.find(item => item.id === sectionId);
    const keys = selectedFields[sectionId] || [];
    return count + (section?.fields.filter(item => item.sensitive && keys.includes(item.key)).length || 0);
  }, 0), [selectedFields, selectedSections]);

  const selectedFieldTotal = useMemo(
    () => selectedSections.reduce((sum, sectionId) => sum + (selectedFields[sectionId]?.length || 0), 0),
    [selectedFields, selectedSections],
  );
  const configuredFieldTotal = useMemo(
    () => Object.values(selectedFields).reduce((sum, fields) => sum + (fields?.length || 0), 0),
    [selectedFields],
  );
  const allSectionsSelected = selectedSections.length === OPERATIONS_REPORT_SECTIONS.length;
  const allOutputFieldsSelected = configuredFieldTotal === TOTAL_OUTPUT_FIELD_COUNT;

  const activeSection = OPERATIONS_REPORT_SECTIONS.find(section => section.id === activeFieldSection)
    ?? OPERATIONS_REPORT_SECTIONS[0];

  useEffect(() => {
    if (!result) return;
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      resultRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      resultRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result]);

  const selectPreset = (key: OperationsReportPresetKey, forceReset = false) => {
    if (activePreset === key && !forceReset) return;
    const sections = [...OPERATIONS_REPORT_PRESETS[key].sections];
    setSelectedSections(sections);
    setActivePreset(key);
    if (forceReset) {
      setSelectedFields(defaultOperationsReportFields());
      setPresetCustomized(false);
    }
    setActiveFieldSection(current => sections.includes(current) ? current : sections.find(section => section !== "overview") || "overview");
  };

  const toggleAllSections = (checked: boolean) => {
    setPresetCustomized(true);
    setSelectedSections(checked ? OPERATIONS_REPORT_SECTIONS.map(section => section.id) : []);
    if (checked) setActiveFieldSection(current => current || "lots");
  };

  const toggleAllOutputFields = (checked: boolean) => {
    setPresetCustomized(true);
    setSelectedFields(current => {
      const next = { ...current };
      OPERATIONS_REPORT_SECTIONS.forEach(section => {
        if (section.fields.length) next[section.id] = checked ? section.fields.map(field => field.key) : [];
      });
      return next;
    });
  };

  const toggleSection = (id: OperationsReportSectionId, checked: boolean) => {
    setPresetCustomized(true);
    setSelectedSections(current => checked ? Array.from(new Set([...current, id])) : current.filter(item => item !== id));
    if (checked) {
      setActiveFieldSection(id);
      const section = OPERATIONS_REPORT_SECTIONS.find(item => item.id === id);
      if (section?.fields.length && !(selectedFields[id] || []).length) {
        setSelectedFields(current => ({ ...current, [id]: [...section.defaultFields] }));
      }
    }
  };

  const toggleField = (sectionId: OperationsReportSectionId, key: string, checked: boolean) => {
    setPresetCustomized(true);
    setSelectedFields(current => {
      const keys = current[sectionId] || [];
      return { ...current, [sectionId]: checked ? Array.from(new Set([...keys, key])) : keys.filter(item => item !== key) };
    });
  };

  const toggleAllFields = (sectionId: OperationsReportSectionId, checked: boolean) => {
    const section = OPERATIONS_REPORT_SECTIONS.find(item => item.id === sectionId);
    if (!section) return;
    setPresetCustomized(true);
    setSelectedFields(current => ({ ...current, [sectionId]: checked ? section.fields.map(item => item.key) : [] }));
  };

  const validate = () => {
    if (!user || !template) return "로그인 또는 보고서 템플릿을 확인해 주세요.";
    if (!title.trim()) return "보고서 제목을 입력해 주세요.";
    if (!periodStart || !periodEnd || periodStart > periodEnd) return "보고기간을 확인해 주세요.";
    if (!selectedSections.length) return "한 개 이상의 보고 항목을 선택해 주세요.";
    if (!lotTypes.length) return "한 개 이상의 주차장 형태를 선택해 주세요.";
    if (selectedSections.some(id => id !== "overview" && !(selectedFields[id] || []).length)) return "선택한 업무마다 한 개 이상의 출력 항목을 선택해 주세요.";
    if (disclosureStatus !== "공개" && !disclosureBasis.trim()) return "부분공개·비공개 문서는 근거를 입력해 주세요.";
    if (evidence.isError) return "원천자료 조회 오류를 해결한 뒤 다시 생성해 주세요.";
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
        template: template!, title: title.trim(), description: documentSummary.trim(), parameters,
        outputFormat: "pdf+hwpx", userId: user!.id, authorName: profile?.name || user!.email || "",
      });
      await logActivity({ module: "OPS", action: "운영관리 보고서 생성", targetType: "report", targetId: generated.id, targetName: title.trim() });
      setResult({ id: generated.id, reportNumber: generated.reportNumber, filePath: generated.filePath, hwpPath: generated.hwpPath, documentLinked: generated.documentLinked });
      toast.success("한글 원본과 동일한 한컴 PDF를 생성했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "운영관리 보고서 생성에 실패했습니다.";
      setGenerationError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const saveFile = async (path: string | undefined, extension: "pdf" | "hwpx") => {
    if (!path) return toast.error("저장할 파일이 없습니다.");
    try {
      const saveResult = await downloadStoredReport(path, `${title}_${periodStart}_${periodEnd}.${extension}`);
      if (saveResult === "cancelled") return;
      const format = extension === "pdf" ? "PDF" : "한글 HWPX";
      toast.success(saveResult === "saved" ? `${format} 파일을 선택한 위치에 저장했습니다.` : `${format} 파일 다운로드를 시작했습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일을 저장하지 못했습니다.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" aria-label="보고서 센터로 돌아가기" onClick={() => navigate("/reports")}><ArrowLeft className="h-4 w-4" /></Button>
            <div><p className="text-sm text-muted-foreground">보고서/통계 · 운영관리</p><h1 className="mt-1 text-xl font-bold">{sourceId ? "운영 보고서 조건 복사 작성" : "운영관리 보고서"}</h1></div>
          </div>
          <div className="flex items-center gap-2"><div className="hidden xl:flex xl:gap-2"><Badge variant="outline">HWPX 원본</Badge><Badge variant="outline">한컴 변환 PDF</Badge><Badge variant="secondary">KS X 6101</Badge></div><Button className="hidden lg:inline-flex" onClick={handleGenerate} disabled={generating || evidence.isPending || templateError || sourceReportError}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}한글·동일 PDF 생성
          </Button></div>
        </div>

        {(templateError || sourceReportError) && <div className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{sourceReportError ? "복사할 보고서 조건을 불러오지 못했습니다." : "보고서 템플릿을 불러오지 못했습니다."}</div>}
        {generationError && (
          <div role="alert" className="flex gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div><p className="font-medium">보고서 생성 실패</p><p className="mt-1 break-words">{generationError}</p></div>
          </div>
        )}

        <Card>
          <CardContent className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(260px,2fr)_150px_150px_auto]">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1"><Label htmlFor="ops-report-title">제목 *</Label><Input id="ops-report-title" value={title} onChange={event => setTitle(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ops-report-start">시작일 *</Label><Input id="ops-report-start" type="date" value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ops-report-end">종료일 *</Label><Input id="ops-report-end" type="date" value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></div>
            <Dialog>
              <DialogTrigger asChild><Button type="button" variant="outline" className="self-end"><FileText className="mr-1.5 h-4 w-4" />문서 세부정보</Button></DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader><DialogTitle>문서 세부정보</DialogTitle></DialogHeader>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ops-report-document">관련 공문 문서번호</Label><Input id="ops-report-document" value={officialDocumentNumber} onChange={event => setOfficialDocumentNumber(event.target.value)} placeholder="제주시청-차량관리과운영팀-연도-번호" /></div>
                  <div className="space-y-1.5"><Label>공개구분 *</Label><Select value={disclosureStatus} onValueChange={setDisclosureStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="공개">공개</SelectItem><SelectItem value="부분공개">부분공개</SelectItem><SelectItem value="비공개">비공개</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1.5"><Label htmlFor="ops-report-basis">비공개 근거</Label><Input id="ops-report-basis" value={disclosureBasis} onChange={event => setDisclosureBasis(event.target.value)} disabled={disclosureStatus === "공개"} placeholder="정보공개법 제9조 제1항 제○호" /></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ops-report-summary">작성 목적·핵심 내용</Label><Textarea id="ops-report-summary" rows={3} value={documentSummary} onChange={event => setDocumentSummary(event.target.value)} /></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ops-report-keywords">키워드</Label><Input id="ops-report-keywords" value={keywords} onChange={event => setKeywords(event.target.value)} /></div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(300px,0.82fr)_minmax(420px,1.18fr)] lg:items-start">
          <Card className="h-fit">
            <CardHeader className="border-b p-3"><CardTitle className="text-base">조회 조건</CardTitle></CardHeader>
            <CardContent className="space-y-3 p-3">
              <div className="space-y-2">
                <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                  <Label>보고서 구성</Label>
                  <div className="flex items-center gap-1.5">
                    {presetCustomized && <Badge className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-50">사용자 조정됨</Badge>}
                    {presetCustomized && activePreset && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => selectPreset(activePreset, true)}><RotateCcw className="mr-1 h-3.5 w-3.5" />기본값 복원</Button>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="보고서 구성">
                  {PRESET_ENTRIES.map(([key, preset]) => {
                    const selected = activePreset === key;
                    return <Button key={key} type="button" variant="outline" className={cn(selectionButtonClass(selected), "justify-center px-2")} aria-pressed={selected} onClick={() => selectPreset(key)}>
                      {selected && <CheckCircle2 className="mr-1.5 h-4 w-4 shrink-0" />}{preset.label}<span className="sr-only">{selected ? " 선택됨" : ""}</span>
                    </Button>;
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>주차장 형태 *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {OPERATIONS_LOT_TYPE_OPTIONS.map(item => {
                    const selected = lotTypes.includes(item.value);
                    return <label key={item.value} className={cn("flex min-h-10 cursor-pointer items-center justify-center gap-1 whitespace-nowrap border px-1 text-xs transition-colors", selected ? "border-primary bg-primary/10 font-medium text-primary ring-1 ring-primary/20" : "border-border bg-background hover:bg-muted")}>
                      <Checkbox checked={selected} onCheckedChange={checked => setLotTypes(current => checked ? Array.from(new Set([...current, item.value])) : current.filter(value => value !== item.value))} />{item.label}
                    </label>;
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>정렬</Label><Select value={sort} onValueChange={value => setSort(value as OperationsReportSort)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="parking_lot">주차장명순</SelectItem><SelectItem value="date_desc">최근일자순</SelectItem><SelectItem value="status">조치필요 상태순</SelectItem><SelectItem value="amount_desc">금액 큰순</SelectItem></SelectContent></Select></div>
                <div className="space-y-2">
                  <Label>용지 방향</Label>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="용지 방향">
                    <Button type="button" size="sm" variant="outline" className={selectionButtonClass(orientation === "portrait")} aria-pressed={orientation === "portrait"} onClick={() => setOrientation("portrait")}>{orientation === "portrait" && <CheckCircle2 className="mr-1.5 h-4 w-4" />}A4 세로</Button>
                    <Button type="button" size="sm" variant="outline" className={selectionButtonClass(orientation === "landscape")} aria-pressed={orientation === "landscape"} onClick={() => setOrientation("landscape")}>{orientation === "landscape" && <CheckCircle2 className="mr-1.5 h-4 w-4" />}A4 가로</Button>
                  </div>
                </div>
              </div>

              <label className={cn("flex min-h-10 cursor-pointer items-center justify-between gap-3 border px-3 text-sm transition-colors", includeInactive ? "border-primary bg-primary/10 font-medium text-primary" : "border-border bg-background")}><span>중지·만료 자료 포함</span><Switch checked={includeInactive} onCheckedChange={setIncludeInactive} /></label>
              {sensitiveFieldCount > 0 && <div className="flex gap-2 border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>개인·연락정보 {sensitiveFieldCount}개 항목이 포함됩니다.</span></div>}

              <details className="group border-t pt-2 text-sm">
                <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between font-medium marker:content-none">
                  <span className="flex items-center gap-2">원천자료 확인{evidence.data && <Badge variant="secondary">{Object.values(evidence.data.sourceCounts).reduce((sum, count) => sum + Number(count), 0).toLocaleString("ko-KR")}건</Badge>}</span>
                  <span className="flex items-center gap-2" aria-live="polite">{evidence.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="원천자료 갱신 중" />}<ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" /></span>
                </summary>
                <div className="pt-3">
                  {evidence.isError ? <div className="flex items-center justify-between gap-3 text-sm text-destructive"><span>원천자료를 확인하지 못했습니다.</span><Button variant="outline" size="sm" onClick={() => evidence.refetch()}>다시 확인</Button></div>
                    : evidence.data ? <div className="grid grid-cols-2 gap-2">{Object.entries(evidence.data.sourceCounts).map(([key, count]) => <div key={key} className={cn("flex items-center justify-between border px-2 py-1.5", Number(count) > 0 ? "bg-muted/20" : "bg-muted/5 text-muted-foreground")}><span className="text-xs">{SOURCE_LABELS[key] || key}</span><strong className="text-sm">{Number(count).toLocaleString("ko-KR")}건</strong></div>)}</div>
                    : <p className="text-sm text-muted-foreground">조회 조건을 확인해 주세요.</p>}
                </div>
              </details>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader className="space-y-2 border-b p-3">
              <div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">출력 항목</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">포함할 업무와 세부 항목을 선택하세요.</p></div><div className="flex gap-2"><Badge variant="secondary">{selectedSections.length}개 업무</Badge><Badge variant="outline">{selectedFieldTotal}개 항목</Badge></div></div>
              <div className="flex flex-wrap gap-2 border-t pt-2">
                <label className={cn("flex min-h-9 cursor-pointer items-center gap-2 border px-3 text-sm transition-colors", allSectionsSelected ? "border-primary bg-primary/10 font-medium text-primary" : "border-border bg-background")}><Checkbox checked={allSectionsSelected ? true : selectedSections.length > 0 ? "indeterminate" : false} onCheckedChange={checked => toggleAllSections(Boolean(checked))} aria-label="업무 전체 선택" />업무 전체 선택</label>
                <label className={cn("flex min-h-9 cursor-pointer items-center gap-2 border px-3 text-sm transition-colors", allOutputFieldsSelected ? "border-primary bg-primary/10 font-medium text-primary" : "border-border bg-background")}><Checkbox checked={allOutputFieldsSelected ? true : configuredFieldTotal > 0 ? "indeterminate" : false} onCheckedChange={checked => toggleAllOutputFields(Boolean(checked))} aria-label="출력항목 전체 선택" />출력항목 전체 선택</label>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-3">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {OPERATIONS_REPORT_SECTIONS.map(section => {
                  const enabled = selectedSections.includes(section.id);
                  const active = activeFieldSection === section.id;
                  const fieldCount = (selectedFields[section.id] || []).length;
                  return <div key={section.id} className={cn("grid min-h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 border px-2 py-1 transition-colors", active ? "border-primary bg-primary/10 ring-2 ring-primary/20" : enabled ? "border-primary/40 bg-primary/5" : "border-border bg-background hover:bg-muted/50")}>
                    <Checkbox checked={enabled} onCheckedChange={checked => toggleSection(section.id, Boolean(checked))} aria-label={`${section.label} 포함`} />
                    <button type="button" className="flex min-w-0 items-center justify-between gap-1 text-left" onClick={() => setActiveFieldSection(section.id)} aria-pressed={active}>
                      <span className={cn("truncate text-xs font-medium", active && "text-primary")}>{section.label}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{section.fields.length ? `${fieldCount}/${section.fields.length}` : "자동"}</span>
                    </button>
                    <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", active && "text-primary")} />
                  </div>;
                })}
              </div>

              <div className="border-t pt-3">
                <div className="mb-2 flex min-h-9 flex-wrap items-center justify-between gap-2">
                  <div><p className="text-sm font-semibold">{activeSection.label} 세부 항목</p><p className="text-xs text-muted-foreground">{activeSection.description}</p></div>
                  {activeSection.fields.length > 0 && <label className="flex min-h-9 cursor-pointer items-center gap-2 px-1 text-sm font-medium"><Checkbox checked={(selectedFields[activeSection.id] || []).length === activeSection.fields.length ? true : (selectedFields[activeSection.id] || []).length > 0 ? "indeterminate" : false} disabled={!selectedSections.includes(activeSection.id)} onCheckedChange={checked => toggleAllFields(activeSection.id, Boolean(checked))} aria-label={`${activeSection.label} 출력항목 전체 선택`} />전체 선택 <Badge variant="secondary">{(selectedFields[activeSection.id] || []).length}/{activeSection.fields.length}</Badge></label>}
                </div>
                {activeSection.fields.length > 0 ? <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                  {activeSection.fields.map(item => <label key={item.key} className={cn("flex min-h-9 cursor-pointer items-center gap-2 px-1 text-sm", !selectedSections.includes(activeSection.id) && "cursor-not-allowed text-muted-foreground")}><Checkbox checked={(selectedFields[activeSection.id] || []).includes(item.key)} disabled={!selectedSections.includes(activeSection.id)} onCheckedChange={checked => toggleField(activeSection.id, item.key, Boolean(checked))} /><span className="truncate">{item.label}{item.sensitive && <span className="ml-1 text-xs text-amber-700">보호</span>}</span></label>)}
                </div> : <p className="py-3 text-sm text-muted-foreground">핵심 현황은 선택한 업무의 주요 지표로 자동 구성됩니다.</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="sticky bottom-3 z-20 border bg-background/95 p-3 shadow-lg backdrop-blur lg:hidden">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>{selectedSections.length}개 업무</span><span>{selectedFieldTotal}개 항목</span></div>
          <Button className="min-h-11 w-full" onClick={handleGenerate} disabled={generating || evidence.isPending || templateError || sourceReportError}>{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}한글·동일 PDF 생성</Button>
        </div>

        {result && <div ref={resultRef} tabIndex={-1} role="status" aria-live="polite" className="scroll-mt-4 space-y-4 border border-emerald-400 bg-emerald-50 p-4 outline-none focus:ring-2 focus:ring-emerald-600">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><div><p className="font-medium text-emerald-950">보고서 생성 완료</p><p className="font-mono text-xs text-emerald-800">{result.reportNumber}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openStoredReport(result.filePath)}><Printer className="mr-1.5 h-4 w-4" />PDF 보기·인쇄</Button><Button variant="outline" size="sm" onClick={() => saveFile(result.filePath, "pdf")}><Download className="mr-1.5 h-4 w-4" />PDF 저장 위치 선택</Button>{result.hwpPath && <Button variant="outline" size="sm" onClick={() => saveFile(result.hwpPath, "hwpx")}><Download className="mr-1.5 h-4 w-4" />HWPX 저장 위치 선택</Button>}<Button size="sm" onClick={() => navigate("/reports/history")}><FileText className="mr-1.5 h-4 w-4" />이력</Button></div></div>
          {officialDocumentNumber && !result.documentLinked && <p className="text-xs text-amber-900">입력한 문서번호가 문서대장에 없어 자동 연결하지 못했습니다.</p>}
          <DocumentLinksPanel module="REPORT" recordId={result.id} recordPath={`/reports/history?report=${result.id}`} recordTitle={`${result.reportNumber} ${title}`} initialDocumentNumber={officialDocumentNumber} />
        </div>}
      </div>
    </DashboardLayout>
  );
}
