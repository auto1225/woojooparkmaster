import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Printer,
  ShieldAlert,
} from "lucide-react";
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
import {
  BUDGET_LOT_TYPE_OPTIONS,
  BUDGET_REPORT_PRESETS,
  BUDGET_REPORT_SECTIONS,
  defaultBudgetReportFields,
  type BudgetReportOrientation,
  type BudgetReportSectionId,
  type BudgetReportSort,
} from "@/lib/budget-report";
import { BUDGET_REPORT_TEMPLATE_CODE } from "@/lib/report-catalog";
import { downloadStoredReport, generateReport, openStoredReport } from "@/lib/report-engine";
import { cn } from "@/lib/utils";
import type { ReportTemplate } from "@/types/report";

function localDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const INITIAL_START = `${CURRENT_YEAR}-01-01`;
const INITIAL_END = localDate(now);
type PresetKey = keyof typeof BUDGET_REPORT_PRESETS;
const PRESETS = Object.entries(BUDGET_REPORT_PRESETS) as Array<[
  PresetKey,
  (typeof BUDGET_REPORT_PRESETS)[PresetKey],
]>;
const TOTAL_FIELDS = BUDGET_REPORT_SECTIONS.reduce((sum, section) => sum + section.fields.length, 0);

const SOURCE_LABELS: Record<string, string> = {
  parkingLots: "공영주차장",
  plans: "예산편성안",
  items: "예산항목",
  executions: "집행원장",
  transfers: "전용·이체",
};

async function getBudgetEvidence(periodStart: string, periodEnd: string, fiscalYear: number) {
  const [lotsResult, plansResult, executionsResult, transfersResult] = await Promise.all([
    supabase.from("parking_lots").select("id", { count: "exact", head: true }),
    supabase.from("budget_plans").select("id").eq("fiscal_year", fiscalYear),
    supabase
      .from("budget_executions")
      .select("id", { count: "exact", head: true })
      .gte("execution_date", periodStart)
      .lte("execution_date", periodEnd),
    supabase
      .from("budget_transfers")
      .select("id", { count: "exact", head: true })
      .eq("fiscal_year", fiscalYear),
  ]);

  const failed = [lotsResult.error, plansResult.error, executionsResult.error, transfersResult.error].find(Boolean);
  if (failed) throw failed;

  const planIds = (plansResult.data || []).map((row) => row.id);
  let itemCount = 0;
  if (planIds.length) {
    const { count, error } = await supabase
      .from("budget_items")
      .select("id", { count: "exact", head: true })
      .in("plan_id", planIds);
    if (error) throw error;
    itemCount = count || 0;
  }

  return {
    sourceCounts: {
      parkingLots: lotsResult.count || 0,
      plans: planIds.length,
      items: itemCount,
      executions: executionsResult.count || 0,
      transfers: transfersResult.count || 0,
    },
  };
}

export default function BudgetReportBuilder() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState(`${CURRENT_YEAR}년 공영주차장 예산관리 통합보고서`);
  const [periodStart, setPeriodStart] = useState(INITIAL_START);
  const [periodEnd, setPeriodEnd] = useState(INITIAL_END);
  const [fiscalYear, setFiscalYear] = useState(String(CURRENT_YEAR));
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentSummary, setDocumentSummary] = useState(
    "공영주차장 예산의 편성·배정·집행·잔액과 승인 대기 및 근거 문서 누락을 확인하여 적정한 예산 집행과 후속 조치에 활용하기 위함.",
  );
  const [selectedSections, setSelectedSections] = useState<BudgetReportSectionId[]>(
    BUDGET_REPORT_PRESETS.summary.sections,
  );
  const [selectedFields, setSelectedFields] = useState(defaultBudgetReportFields());
  const [lotTypes, setLotTypes] = useState(BUDGET_LOT_TYPE_OPTIONS.map((item) => item.value));
  const [sort, setSort] = useState<BudgetReportSort>("attention");
  const [orientation, setOrientation] = useState<BudgetReportOrientation>("portrait");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeSummaryItems, setIncludeSummaryItems] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetKey | null>("summary");
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<{
    id: string;
    reportNumber: string;
    filePath: string;
    hwpPath?: string;
  } | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  const parsedFiscalYear = Number(fiscalYear);

  const templateQuery = useQuery({
    queryKey: ["budget-report-template"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates")
        .select("*")
        .eq("template_code", BUDGET_REPORT_TEMPLATE_CODE)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("예산관리 보고서 템플릿이 없습니다.");
      return data as unknown as ReportTemplate;
    },
  });

  const parameters = useMemo(
    () => ({
      period_start: periodStart,
      period_end: periodEnd,
      report_scope: "budget",
      official_document_number: documentNumber.trim(),
      document_summary: documentSummary.trim(),
      disclosure_status: "공개",
      keywords: "제주시, 공영주차장, 예산관리, 예산집행, 전용이체",
      budget_fiscal_years: fiscalYear,
      budget_sections: selectedSections.join(","),
      budget_fields: JSON.stringify(selectedFields),
      budget_lot_types: lotTypes.join(","),
      budget_sort: sort,
      budget_orientation: orientation,
      budget_include_archived: String(includeArchived),
      budget_include_summary_items: String(includeSummaryItems),
    }),
    [
      periodStart,
      periodEnd,
      documentNumber,
      documentSummary,
      fiscalYear,
      selectedSections,
      selectedFields,
      lotTypes,
      sort,
      orientation,
      includeArchived,
      includeSummaryItems,
    ],
  );

  const evidence = useQuery({
    queryKey: ["budget-report-evidence", periodStart, periodEnd, parsedFiscalYear],
    queryFn: () => getBudgetEvidence(periodStart, periodEnd, parsedFiscalYear),
    enabled: Boolean(
      templateQuery.data &&
        periodStart &&
        periodEnd &&
        periodStart <= periodEnd &&
        Number.isInteger(parsedFiscalYear) &&
        parsedFiscalYear >= 2000 &&
        parsedFiscalYear <= 2200,
    ),
    retry: 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!result) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    resultRef.current?.focus({ preventScroll: true });
  }, [result]);

  const configuredFields = Object.values(selectedFields).reduce(
    (sum, fields) => sum + (fields?.length || 0),
    0,
  );
  const selectedFieldCount = selectedSections.reduce(
    (sum, sectionId) => sum + (selectedFields[sectionId]?.length || 0),
    0,
  );
  const protectedFieldCount = selectedSections.reduce((sum, sectionId) => {
    const section = BUDGET_REPORT_SECTIONS.find((item) => item.id === sectionId);
    const chosen = selectedFields[sectionId] || [];
    return sum + (section?.fields.filter((field) => field.protected && chosen.includes(field.key)).length || 0);
  }, 0);
  const allSections = selectedSections.length === BUDGET_REPORT_SECTIONS.length;
  const allFields = configuredFields === TOTAL_FIELDS;

  const selectPreset = (key: PresetKey) => {
    setSelectedSections([...BUDGET_REPORT_PRESETS[key].sections]);
    setActivePreset(key);
  };

  const toggleSection = (id: BudgetReportSectionId, checked: boolean) => {
    setActivePreset(null);
    setSelectedSections((current) =>
      checked ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id),
    );
  };

  const toggleField = (sectionId: BudgetReportSectionId, key: string, checked: boolean) => {
    setSelectedFields((current) => ({
      ...current,
      [sectionId]: checked
        ? Array.from(new Set([...(current[sectionId] || []), key]))
        : (current[sectionId] || []).filter((value) => value !== key),
    }));
  };

  const toggleSectionFields = (sectionId: BudgetReportSectionId, checked: boolean) => {
    const section = BUDGET_REPORT_SECTIONS.find((item) => item.id === sectionId);
    if (!section) return;
    setSelectedFields((current) => ({
      ...current,
      [sectionId]: checked ? section.fields.map((field) => field.key) : [],
    }));
  };

  const validationError = () => {
    if (!user || !templateQuery.data) return "로그인과 예산관리 보고서 템플릿을 확인해 주세요.";
    if (!title.trim()) return "보고서 제목을 입력해 주세요.";
    if (!periodStart || !periodEnd || periodStart > periodEnd) return "보고기간을 확인해 주세요.";
    if (!Number.isInteger(parsedFiscalYear) || parsedFiscalYear < 2000 || parsedFiscalYear > 2200) {
      return "회계연도를 2000년부터 2200년 사이로 입력해 주세요.";
    }
    if (!documentNumber.trim()) return "관련 공문 문서번호를 입력해 주세요.";
    if (!documentSummary.trim()) return "작성 목적을 입력해 주세요.";
    if (!selectedSections.length) return "한 개 이상의 예산관리 업무를 선택해 주세요.";
    if (!lotTypes.length) return "한 개 이상의 주차장 형태를 선택해 주세요.";
    if (selectedSections.some((id) => id !== "overview" && !(selectedFields[id] || []).length)) {
      return "선택한 업무마다 한 개 이상의 출력 항목을 선택해 주세요.";
    }
    if (evidence.isError) return "원천자료 조회 오류를 해결한 뒤 다시 생성해 주세요.";
    return "";
  };

  const handleGenerate = async () => {
    const validation = validationError();
    if (validation) {
      setErrorMessage(validation);
      toast.error(validation);
      return;
    }

    setGenerating(true);
    setErrorMessage("");
    setResult(null);
    try {
      const generated = await generateReport({
        template: templateQuery.data!,
        title: title.trim(),
        description: documentSummary.trim(),
        parameters,
        outputFormat: "pdf+hwpx",
        userId: user!.id,
        authorName: profile?.name || user!.email || "",
      });
      setResult({
        id: generated.id,
        reportNumber: generated.reportNumber,
        filePath: generated.filePath,
        hwpPath: generated.hwpPath,
      });
      toast.success("예산관리 HWPX 원본과 동일한 한컴 PDF를 생성했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "예산관리 보고서 생성에 실패했습니다.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const saveFile = async (path: string | undefined, extension: "pdf" | "hwpx") => {
    if (!path) {
      toast.error("저장할 파일이 없습니다.");
      return;
    }
    try {
      const saved = await downloadStoredReport(path, `${title}_${periodStart}_${periodEnd}.${extension}`);
      if (saved !== "cancelled") {
        toast.success(saved === "saved" ? "선택한 위치에 저장했습니다." : "파일 다운로드를 시작했습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일을 저장하지 못했습니다.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-20">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" aria-label="보고서 센터로 돌아가기" onClick={() => navigate("/reports")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <p className="text-sm text-muted-foreground">보고서/통계 · 예산관리</p>
              <h1 className="mt-1 text-xl font-bold">예산관리 통합보고서</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">HWPX 원본</Badge>
            <Badge variant="outline">한컴 변환 PDF</Badge>
            <Button onClick={handleGenerate} disabled={generating || evidence.isPending || templateQuery.isError}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              HWPX·동일 PDF 생성
            </Button>
          </div>
        </header>

        {(templateQuery.isError || errorMessage) && (
          <div role="alert" className="flex gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage || "예산관리 보고서 템플릿을 불러오지 못했습니다."}</span>
          </div>
        )}

        <section className="grid gap-3 border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(280px,2fr)_160px_160px_130px]">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="budget-title">제목 *</Label>
            <Input id="budget-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-start">시작일 *</Label>
            <Input id="budget-start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-end">종료일 *</Label>
            <Input id="budget-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-fiscal-year">회계연도 *</Label>
            <Input
              id="budget-fiscal-year"
              type="number"
              min={2000}
              max={2200}
              value={fiscalYear}
              onChange={(event) => setFiscalYear(event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="budget-document">관련 공문 문서번호 *</Label>
            <Input
              id="budget-document"
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
              placeholder="제주시청-차량관리과운영팀-연도-번호"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="budget-purpose">작성 목적 *</Label>
            <Textarea
              id="budget-purpose"
              rows={2}
              value={documentSummary}
              onChange={(event) => setDocumentSummary(event.target.value)}
            />
          </div>
        </section>

        <section className="space-y-4 border bg-card p-4">
          <div>
            <h2 className="font-semibold">보고서 구성</h2>
            <p className="text-sm text-muted-foreground">프리셋을 바꿔도 사용자가 선택한 출력항목은 유지됩니다.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="보고서 구성">
            {PRESETS.map(([key, preset]) => {
              const selected = activePreset === key;
              return (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  aria-pressed={selected}
                  className={cn(selected && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}
                  onClick={() => selectPreset(key)}
                >
                  {selected && <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {preset.label}
                </Button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-y py-3">
            <label className={cn("flex min-h-9 cursor-pointer items-center gap-2 border px-3 text-sm font-medium", allSections && "border-primary bg-primary/10 text-primary")}>
              <Checkbox
                checked={allSections ? true : selectedSections.length ? "indeterminate" : false}
                onCheckedChange={(checked) => {
                  setActivePreset(null);
                  setSelectedSections(checked ? BUDGET_REPORT_SECTIONS.map((section) => section.id) : []);
                }}
              />
              업무 전체 선택
            </label>
            <label className={cn("flex min-h-9 cursor-pointer items-center gap-2 border px-3 text-sm font-medium", allFields && "border-primary bg-primary/10 text-primary")}>
              <Checkbox
                checked={allFields ? true : configuredFields ? "indeterminate" : false}
                onCheckedChange={(checked) =>
                  setSelectedFields(
                    Object.fromEntries(
                      BUDGET_REPORT_SECTIONS.map((section) => [
                        section.id,
                        checked ? section.fields.map((field) => field.key) : [],
                      ]),
                    ),
                  )
                }
              />
              출력항목 전체 선택
            </label>
            <div className="ml-auto flex gap-2">
              <Badge variant="secondary">{selectedSections.length}개 업무</Badge>
              <Badge variant="outline">{selectedFieldCount}개 항목</Badge>
            </div>
          </div>
          <div className="space-y-3">
            {BUDGET_REPORT_SECTIONS.map((section) => {
              const selected = selectedSections.includes(section.id);
              const sectionFields = selectedFields[section.id] || [];
              const allSectionFields = section.fields.length > 0 && sectionFields.length === section.fields.length;
              return (
                <div key={section.id} className={cn("border p-3", selected && "border-primary/60 bg-primary/[0.03]")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label className="flex cursor-pointer items-start gap-2">
                      <Checkbox checked={selected} onCheckedChange={(checked) => toggleSection(section.id, Boolean(checked))} />
                      <span>
                        <strong className="block text-sm">{section.label}</strong>
                        <span className="text-xs text-muted-foreground">{section.description}</span>
                      </span>
                    </label>
                    {section.fields.length > 0 && (
                      <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={allSectionFields ? true : sectionFields.length ? "indeterminate" : false}
                          onCheckedChange={(checked) => toggleSectionFields(section.id, Boolean(checked))}
                        />
                        업무별 전체 선택
                        <Badge variant="secondary">{sectionFields.length}/{section.fields.length}</Badge>
                      </label>
                    )}
                  </div>
                  {selected && section.fields.length > 0 && (
                    <div className="mt-3 grid gap-x-3 gap-y-1 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
                      {section.fields.map((field) => (
                        <label key={field.key} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={sectionFields.includes(field.key)}
                            onCheckedChange={(checked) => toggleField(section.id, field.key, Boolean(checked))}
                          />
                          <span>{field.label}{field.protected ? " (보호)" : ""}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 border bg-card p-4 md:grid-cols-3">
          <div>
            <Label>주차장 형태 *</Label>
            <div className="mt-2 flex flex-wrap gap-3">
              {BUDGET_LOT_TYPE_OPTIONS.map((item) => {
                const selected = lotTypes.includes(item.value);
                return (
                  <label key={item.value} className={cn("flex min-h-9 cursor-pointer items-center gap-2 border px-3 text-sm", selected && "border-primary bg-primary/10 font-medium text-primary")}>
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) =>
                        setLotTypes((current) =>
                          checked
                            ? Array.from(new Set([...current, item.value]))
                            : current.filter((value) => value !== item.value),
                        )
                      }
                    />
                    {item.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <Label>정렬</Label>
            <Select value={sort} onValueChange={(value) => setSort(value as BudgetReportSort)}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="attention">확인·조치 필요순</SelectItem>
                <SelectItem value="date_desc">최신일순</SelectItem>
                <SelectItem value="amount_desc">금액 큰순</SelectItem>
                <SelectItem value="status">승인상태순</SelectItem>
                <SelectItem value="category">예산분류순</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>용지 방향</Label>
            <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="용지 방향">
              <Button
                type="button"
                variant="outline"
                aria-pressed={orientation === "portrait"}
                className={cn(orientation === "portrait" && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}
                onClick={() => setOrientation("portrait")}
              >
                A4 세로
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-pressed={orientation === "landscape"}
                className={cn(orientation === "landscape" && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}
                onClick={() => setOrientation("landscape")}
              >
                A4 가로
              </Button>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={includeSummaryItems} onCheckedChange={(checked) => setIncludeSummaryItems(Boolean(checked))} />
                합계·요약 예산항목 포함
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={includeArchived} onCheckedChange={(checked) => setIncludeArchived(Boolean(checked))} />
                보관 자료 포함
              </label>
            </div>
          </div>
        </section>

        {protectedFieldCount > 0 && (
          <div className="flex gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>보호정보 {protectedFieldCount}개 항목이 포함됩니다. 공개 범위와 배포 대상을 확인해 주세요.</span>
          </div>
        )}

        <section className="border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">원천자료 검증</h2>
              <p className="text-xs text-muted-foreground">회계연도 편성자료와 보고기간 집행자료의 조회 가능 여부를 확인합니다.</p>
            </div>
            {evidence.isError && <Button variant="outline" size="sm" onClick={() => evidence.refetch()}>다시 확인</Button>}
          </div>
          {evidence.isPending ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />자료 확인 중
            </p>
          ) : evidence.isError ? (
            <p className="mt-3 text-sm text-destructive">
              {evidence.error instanceof Error ? evidence.error.message : "원천자료를 확인하지 못했습니다."}
            </p>
          ) : evidence.data ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {Object.entries(evidence.data.sourceCounts).map(([key, count]) => (
                <div key={key} className="border px-3 py-2">
                  <span className="text-xs text-muted-foreground">{SOURCE_LABELS[key] || key}</span>
                  <strong className="block">{Number(count).toLocaleString("ko-KR")}건</strong>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {result && (
          <section
            ref={resultRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            className="scroll-mt-4 border border-emerald-400 bg-emerald-50 p-4 outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              <div>
                <h2 className="font-semibold text-emerald-950">예산관리 보고서 생성 완료</h2>
                <p className="font-mono text-xs text-emerald-800">관리번호 {result.reportNumber}</p>
              </div>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <Button variant="outline" size="sm" onClick={() => openStoredReport(result.filePath)}>
                  <Printer className="mr-1.5 h-4 w-4" />PDF 보기·인쇄
                </Button>
                {result.hwpPath && (
                  <Button variant="outline" size="sm" onClick={() => openStoredReport(result.hwpPath!)}>
                    <FileText className="mr-1.5 h-4 w-4" />HWPX 열기
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => saveFile(result.filePath, "pdf")}>
                  <Download className="mr-1.5 h-4 w-4" />PDF 저장 위치 선택
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!result.hwpPath}
                  onClick={() => saveFile(result.hwpPath, "hwpx")}
                >
                  <Download className="mr-1.5 h-4 w-4" />HWPX 저장 위치 선택
                </Button>
              </div>
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
