import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, FileText, Loader2, Printer, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { downloadStoredReport, generateReport, openStoredReport } from "@/lib/report-engine";
import {
  defaultRevenueReportFields,
  getRevenueReportEvidence,
  REVENUE_LOT_TYPE_OPTIONS,
  REVENUE_REPORT_PRESETS,
  REVENUE_REPORT_SECTIONS,
  type RevenueReportOrientation,
  type RevenueReportSectionId,
  type RevenueReportSort,
} from "@/lib/revenue-report";
import { REVENUE_REPORT_TEMPLATE_CODE } from "@/lib/report-catalog";
import type { ReportTemplate } from "@/types/report";

function localDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

const now = new Date();
const INITIAL_START = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
const INITIAL_END = localDate(now);
type PresetKey = keyof typeof REVENUE_REPORT_PRESETS;
const PRESETS = Object.entries(REVENUE_REPORT_PRESETS) as Array<[PresetKey, (typeof REVENUE_REPORT_PRESETS)[PresetKey]]>;
const TOTAL_FIELDS = REVENUE_REPORT_SECTIONS.reduce((sum, section) => sum + section.fields.length, 0);

export default function RevenueReportBuilder() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState(`${now.getFullYear()}년 ${now.getMonth() + 1}월 공영주차장 수입·정산 현황 보고서`);
  const [periodStart, setPeriodStart] = useState(INITIAL_START);
  const [periodEnd, setPeriodEnd] = useState(INITIAL_END);
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentSummary, setDocumentSummary] = useState("공영주차장 수입원장의 검증·월마감 상태와 위탁대사 차이를 확인하여 정산 오류와 누락을 예방하기 위함.");
  const [selectedSections, setSelectedSections] = useState<RevenueReportSectionId[]>(REVENUE_REPORT_PRESETS.summary.sections);
  const [selectedFields, setSelectedFields] = useState(defaultRevenueReportFields());
  const [lotTypes, setLotTypes] = useState(REVENUE_LOT_TYPE_OPTIONS.map(item => item.value));
  const [sort, setSort] = useState<RevenueReportSort>("attention");
  const [orientation, setOrientation] = useState<RevenueReportOrientation>("portrait");
  const [activePreset, setActivePreset] = useState<PresetKey | null>("summary");
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<{ id: string; reportNumber: string; filePath: string; hwpPath?: string } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const templateQuery = useQuery({
    queryKey: ["revenue-report-template"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_templates").select("*").eq("template_code", REVENUE_REPORT_TEMPLATE_CODE).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("수입관리 보고서 템플릿이 없습니다.");
      return data as unknown as ReportTemplate;
    },
  });

  const parameters = useMemo(() => ({
    period_start: periodStart,
    period_end: periodEnd,
    report_scope: "revenue",
    official_document_number: documentNumber.trim(),
    document_summary: documentSummary.trim(),
    disclosure_status: "공개",
    keywords: "제주시, 공영주차장, 수입관리, 월마감, 위탁대사",
    revenue_sections: selectedSections.join(","),
    revenue_fields: JSON.stringify(selectedFields),
    revenue_lot_types: lotTypes.join(","),
    revenue_sort: sort,
    revenue_orientation: orientation,
    revenue_include_archived: "false",
  }), [periodStart, periodEnd, documentNumber, documentSummary, selectedSections, selectedFields, lotTypes, sort, orientation]);

  const evidence = useQuery({
    queryKey: ["revenue-report-evidence", parameters],
    queryFn: () => getRevenueReportEvidence(parameters),
    enabled: Boolean(templateQuery.data && periodStart && periodEnd && periodStart <= periodEnd && lotTypes.length),
    retry: 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!result) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    resultRef.current?.focus({ preventScroll: true });
  }, [result]);

  const configuredFields = Object.values(selectedFields).reduce((sum, fields) => sum + (fields?.length || 0), 0);
  const allSections = selectedSections.length === REVENUE_REPORT_SECTIONS.length;
  const allFields = configuredFields === TOTAL_FIELDS;
  const selectPreset = (key: PresetKey) => {
    setSelectedSections([...REVENUE_REPORT_PRESETS[key].sections]);
    setActivePreset(key);
  };
  const toggleSection = (id: RevenueReportSectionId, checked: boolean) => {
    setActivePreset(null);
    setSelectedSections(current => checked ? Array.from(new Set([...current, id])) : current.filter(value => value !== id));
  };
  const toggleField = (sectionId: RevenueReportSectionId, key: string, checked: boolean) => {
    setActivePreset(null);
    setSelectedFields(current => ({ ...current, [sectionId]: checked ? Array.from(new Set([...(current[sectionId] || []), key])) : (current[sectionId] || []).filter(value => value !== key) }));
  };
  const validationError = () => {
    if (!user || !templateQuery.data) return "로그인과 수입관리 보고서 템플릿을 확인해 주세요.";
    if (!title.trim()) return "보고서 제목을 입력해 주세요.";
    if (!periodStart || !periodEnd || periodStart > periodEnd) return "보고기간을 확인해 주세요.";
    if (!selectedSections.length) return "한 개 이상의 업무를 선택해 주세요.";
    if (!lotTypes.length) return "한 개 이상의 주차장 형태를 선택해 주세요.";
    if (selectedSections.some(id => id !== "overview" && !(selectedFields[id] || []).length)) return "선택한 업무마다 출력 항목을 선택해 주세요.";
    if (evidence.isError) return "원천자료 조회 오류를 해결한 뒤 생성해 주세요.";
    return "";
  };
  const handleGenerate = async () => {
    const validation = validationError();
    if (validation) { setErrorMessage(validation); toast.error(validation); return; }
    setGenerating(true); setErrorMessage(""); setResult(null);
    try {
      const generated = await generateReport({
        template: templateQuery.data!, title: title.trim(), description: documentSummary.trim(), parameters,
        outputFormat: "pdf+hwpx", userId: user!.id, authorName: profile?.name || user!.email || "",
      });
      setResult({ id: generated.id, reportNumber: generated.reportNumber, filePath: generated.filePath, hwpPath: generated.hwpPath });
      toast.success("수입관리 한글 원본과 동일한 한컴 PDF를 생성했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "수입관리 보고서 생성에 실패했습니다.";
      setErrorMessage(message); toast.error(message);
    } finally { setGenerating(false); }
  };
  const save = async (path: string | undefined, extension: "pdf" | "hwpx") => {
    if (!path) return toast.error("저장할 파일이 없습니다.");
    const saved = await downloadStoredReport(path, `${title}_${periodStart}_${periodEnd}.${extension}`);
    if (saved !== "cancelled") toast.success(saved === "saved" ? "선택한 위치에 저장했습니다." : "파일 다운로드를 시작했습니다.");
  };

  return <DashboardLayout><div className="space-y-5 pb-20">
    <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3"><Button variant="ghost" size="icon" aria-label="보고서 센터로 돌아가기" onClick={() => navigate("/reports")}><ArrowLeft className="h-4 w-4" /></Button><div><p className="text-sm text-muted-foreground">보고서/통계 · 수입관리</p><h1 className="mt-1 text-xl font-bold">수입관리 통합보고서</h1></div></div>
      <div className="flex gap-2"><Badge variant="outline">HWPX 원본</Badge><Badge variant="outline">한컴 변환 PDF</Badge><Button onClick={handleGenerate} disabled={generating || evidence.isPending || templateQuery.isError}>{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}한글·동일 PDF 생성</Button></div>
    </header>
    {(templateQuery.isError || errorMessage) && <div role="alert" className="flex gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><ShieldAlert className="h-4 w-4 shrink-0" /><span>{errorMessage || "수입관리 보고서 템플릿을 불러오지 못했습니다."}</span></div>}
    <section className="grid gap-3 border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(280px,2fr)_160px_160px]">
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-1"><Label htmlFor="revenue-title">제목 *</Label><Input id="revenue-title" value={title} onChange={event => setTitle(event.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="revenue-start">시작일 *</Label><Input id="revenue-start" type="date" value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="revenue-end">종료일 *</Label><Input id="revenue-end" type="date" value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="revenue-document">관련 공문 문서번호</Label><Input id="revenue-document" value={documentNumber} onChange={event => setDocumentNumber(event.target.value)} placeholder="제주시청-차량관리과운영팀-연도-번호" /></div>
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor="revenue-summary">작성 목적·핵심 내용</Label><Textarea id="revenue-summary" rows={2} value={documentSummary} onChange={event => setDocumentSummary(event.target.value)} /></div>
    </section>
    <section className="space-y-4 border bg-card p-4">
      <div><h2 className="font-semibold">보고서 구성</h2><p className="text-sm text-muted-foreground">프리셋을 바꿔도 사용자가 고른 출력항목은 유지됩니다.</p></div>
      <div className="grid gap-2 sm:grid-cols-3">{PRESETS.map(([key, preset]) => <Button key={key} type="button" variant="outline" className={cn(activePreset === key && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")} onClick={() => selectPreset(key)}>{preset.label}</Button>)}</div>
      <div className="flex flex-wrap items-center gap-4 border-y py-3">
        <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={allSections} onCheckedChange={checked => { setActivePreset(null); setSelectedSections(checked ? REVENUE_REPORT_SECTIONS.map(section => section.id) : []); }} />업무 전체 선택</label>
        <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={allFields} onCheckedChange={checked => setSelectedFields(Object.fromEntries(REVENUE_REPORT_SECTIONS.map(section => [section.id, checked ? section.fields.map(field => field.key) : []])))} />출력항목 전체 선택</label>
      </div>
      <div className="space-y-3">{REVENUE_REPORT_SECTIONS.map(section => {
        const selected = selectedSections.includes(section.id);
        const sectionFields = selectedFields[section.id] || [];
        return <div key={section.id} className={cn("border p-3", selected && "border-primary/60 bg-primary/[0.03]")}>
          <div className="flex items-start justify-between gap-3"><label className="flex items-start gap-2"><Checkbox checked={selected} onCheckedChange={checked => toggleSection(section.id, Boolean(checked))} /><span><strong className="block text-sm">{section.label}</strong><span className="text-xs text-muted-foreground">{section.description}</span></span></label>{section.fields.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedFields(current => ({ ...current, [section.id]: sectionFields.length === section.fields.length ? [] : section.fields.map(field => field.key) }))}>{sectionFields.length}/{section.fields.length} 전체</Button>}</div>
          {selected && section.fields.length > 0 && <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">{section.fields.map(field => <label key={field.key} className="flex min-h-9 items-center gap-2 text-sm"><Checkbox checked={sectionFields.includes(field.key)} onCheckedChange={checked => toggleField(section.id, field.key, Boolean(checked))} /><span>{field.label}{field.protected ? " (보호)" : ""}</span></label>)}</div>}
        </div>;
      })}</div>
    </section>
    <section className="grid gap-4 border bg-card p-4 md:grid-cols-3">
      <div><Label>주차장 형태 *</Label><div className="mt-2 flex flex-wrap gap-3">{REVENUE_LOT_TYPE_OPTIONS.map(item => <label key={item.value} className="flex items-center gap-2 text-sm"><Checkbox checked={lotTypes.includes(item.value)} onCheckedChange={checked => setLotTypes(current => checked ? [...current, item.value] : current.filter(value => value !== item.value))} />{item.label}</label>)}</div></div>
      <div><Label>정렬</Label><Select value={sort} onValueChange={value => setSort(value as RevenueReportSort)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="attention">확인 필요순</SelectItem><SelectItem value="date_desc">최신일순</SelectItem><SelectItem value="parking_lot">주차장명순</SelectItem><SelectItem value="amount_desc">금액 큰순</SelectItem><SelectItem value="difference_desc">대사 차이 큰순</SelectItem></SelectContent></Select></div>
      <div><Label>용지 방향</Label><div className="mt-2 grid grid-cols-2 gap-2"><Button type="button" variant="outline" className={cn(orientation === "portrait" && "border-primary bg-primary text-primary-foreground")} onClick={() => setOrientation("portrait")}>A4 세로</Button><Button type="button" variant="outline" className={cn(orientation === "landscape" && "border-primary bg-primary text-primary-foreground")} onClick={() => setOrientation("landscape")}>A4 가로</Button></div></div>
    </section>
    <section className="border bg-card p-4"><h2 className="font-semibold">원천자료 검증</h2>{evidence.isPending ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />자료 확인 중</p> : evidence.isError ? <p className="mt-3 text-sm text-destructive">{evidence.error instanceof Error ? evidence.error.message : "자료를 확인하지 못했습니다."}</p> : evidence.data && <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{Object.entries(evidence.data.sourceCounts).map(([key, count]) => <div key={key} className="border px-3 py-2"><span className="text-xs text-muted-foreground">{key}</span><strong className="block">{Number(count).toLocaleString("ko-KR")}건</strong></div>)}</div>}</section>
    {result && <section ref={resultRef} tabIndex={-1} className="border border-green-300 bg-green-50 p-4 outline-none"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><CheckCircle2 className="h-5 w-5 text-green-700" /><div><h2 className="font-semibold text-green-950">보고서 생성 완료</h2><p className="text-sm text-green-900">관리번호 {result.reportNumber}</p></div><div className="flex gap-2 sm:ml-auto"><Button variant="outline" onClick={() => openStoredReport(result.filePath)}><Printer className="mr-2 h-4 w-4" />PDF 열기</Button><Button onClick={() => save(result.filePath, "pdf")}><Download className="mr-2 h-4 w-4" />PDF 저장</Button><Button onClick={() => save(result.hwpPath, "hwpx")} disabled={!result.hwpPath}><Download className="mr-2 h-4 w-4" />한글 저장</Button></div></div></section>}
  </div></DashboardLayout>;
}
