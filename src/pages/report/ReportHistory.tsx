import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Loader2,
  Link2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ExcelExportButton } from "@/components/common/ExcelExportButton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { stableMultiSort, type NullPlacement, type SortDirection } from "@/lib/list-sorting";
import { generateReport, openStoredReport } from "@/lib/report-engine";
import { REPORT_CATEGORY_LABELS, REPORT_STATUS_LABELS, REPORT_TYPE_LABELS, type ReportTemplate } from "@/types/report";
import { toast } from "sonner";

type SortKey = "created_at" | "report_number" | "official_document_number" | "title" | "template" | "category" | "type" | "period_start" | "period_end" | "file_size" | "page_count" | "generation_time_ms" | "status" | "format";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "created_at", label: "생성일" },
  { value: "report_number", label: "보고서번호" },
  { value: "official_document_number", label: "공문 문서번호" },
  { value: "title", label: "보고서명" },
  { value: "template", label: "템플릿명" },
  { value: "category", label: "업무분류" },
  { value: "type", label: "보고주기" },
  { value: "period_start", label: "보고 시작일" },
  { value: "period_end", label: "보고 종료일" },
  { value: "file_size", label: "파일용량" },
  { value: "page_count", label: "쪽수" },
  { value: "generation_time_ms", label: "생성시간" },
  { value: "status", label: "상태" },
  { value: "format", label: "파일형식" },
];

function formatSize(bytes?: number | null) {
  if (!bytes) return "-";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDuration(milliseconds?: number | null) {
  if (milliseconds == null) return "-";
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${(milliseconds / 1000).toFixed(1)}초`;
}

function sortValue(report: any, key: SortKey) {
  switch (key) {
    case "template": return report.template?.name;
    case "category": return REPORT_CATEGORY_LABELS[report.template?.report_category] || report.template?.report_category;
    case "type": return REPORT_TYPE_LABELS[report.template?.report_type] || report.template?.report_type;
    case "format": return report.file_format;
    case "official_document_number": return report.parameters_used?.official_document_number;
    case "period_start":
    case "period_end":
    case "created_at": return report[key] ? new Date(report[key]).getTime() : null;
    default: return report[key];
  }
}

export default function ReportHistory() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [secondarySortKey, setSecondarySortKey] = useState<SortKey | "none">("report_number");
  const [nullPlacement, setNullPlacement] = useState<NullPlacement>("last");
  const [documentReport, setDocumentReport] = useState<any | null>(null);

  const { data: reports, isLoading, isError, refetch } = useQuery({
    queryKey: ["report-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_generated")
        .select("*, template:report_templates(*)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const categoryOptions = useMemo(() => Array.from(new Set((reports || []).map((report: any) => report.template?.report_category).filter(Boolean))).sort(), [reports]);
  const typeOptions = useMemo(() => Array.from(new Set((reports || []).map((report: any) => report.template?.report_type).filter(Boolean))).sort(), [reports]);

  const filteredReports = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("ko-KR");
    const filtered = (reports || []).filter((report: any) => {
      if (!showArchived && report.status === "archived") return false;
      if (statusFilter !== "all" && report.status !== statusFilter) return false;
      if (categoryFilter !== "all" && report.template?.report_category !== categoryFilter) return false;
      if (typeFilter !== "all" && report.template?.report_type !== typeFilter) return false;
      if (formatFilter !== "all" && report.file_format !== formatFilter) return false;
      if (createdFrom && report.created_at?.slice(0, 10) < createdFrom) return false;
      if (createdTo && report.created_at?.slice(0, 10) > createdTo) return false;
      if (periodFrom && (!report.period_end || report.period_end < periodFrom)) return false;
      if (periodTo && (!report.period_start || report.period_start > periodTo)) return false;
      if (keyword) {
        const haystack = [report.report_number, report.parameters_used?.official_document_number, report.title, report.description, report.template?.name, report.template?.template_code]
          .filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });

    const descriptors = [{ value: (report: any) => sortValue(report, sortKey), direction: sortDirection }];
    if (secondarySortKey !== "none" && secondarySortKey !== sortKey) {
      descriptors.push({ value: (report: any) => sortValue(report, secondarySortKey), direction: sortDirection });
    }
    return stableMultiSort(filtered, descriptors, nullPlacement);
  }, [reports, search, showArchived, statusFilter, categoryFilter, typeFilter, formatFilter, createdFrom, createdTo, periodFrom, periodTo, sortKey, sortDirection, secondarySortKey, nullPlacement]);

  const deleteMutation = useMutation({
    mutationFn: async (report: any) => {
      if (profile?.role !== "admin") throw new Error("보고서 영구 삭제는 관리자만 수행할 수 있습니다.");
      if (report.status !== "archived") throw new Error("보고서를 먼저 보관 처리한 뒤 삭제해 주세요.");
      const paths = [report.file_path, report.excel_path].filter(Boolean) as string[];
      const { error } = await supabase.from("report_generated").delete().eq("id", report.id);
      if (error) throw error;
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from("reports").remove(paths);
        if (storageError) return { storageWarning: storageError.message };
      }
      return { storageWarning: null };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["report-history"] });
      queryClient.invalidateQueries({ queryKey: ["recent-reports"] });
      if (result.storageWarning) toast.warning("보고서 이력은 삭제했지만 저장 파일 정리가 필요합니다.", { description: result.storageWarning });
      else toast.success("보관 보고서와 저장 파일을 삭제했습니다");
    },
    onError: (error: Error) => toast.error(error.message || "삭제에 실패했습니다"),
  });

  const retryMutation = useMutation({
    mutationFn: async (report: any) => {
      if (!user || !report.template) throw new Error("보고서 템플릿 정보를 찾을 수 없습니다.");
      return generateReport({
        template: report.template as ReportTemplate,
        title: report.title,
        description: report.description || "",
        parameters: (report.parameters_used || {}) as Record<string, string>,
        outputFormat: report.file_format === "pdf+xlsx" ? "pdf+xlsx" : "pdf",
        userId: user.id,
        authorName: profile?.name || user.email || "",
        aiSummary: report.summary_data?.aiSummary || "",
        reportId: report.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-history"] });
      queryClient.invalidateQueries({ queryKey: ["recent-reports"] });
      toast.success("보고서를 다시 생성했습니다");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleDownload = async (path?: string | null) => {
    if (!path) return toast.error("저장된 파일이 없습니다.");
    try {
      await openStoredReport(path, "_self");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일을 열지 못했습니다.");
    }
  };

  const handleArchive = async (report: any) => {
    const nextStatus = report.status === "archived" ? "completed" : "archived";
    const { error } = await supabase.from("report_generated").update({ status: nextStatus, archive_reason: nextStatus === "archived" ? "사용자 보관 처리" : null }).eq("id", report.id);
    if (error) return toast.error(nextStatus === "archived" ? "보관 처리에 실패했습니다" : "복원에 실패했습니다");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["report-history"] }),
      queryClient.invalidateQueries({ queryKey: ["recent-reports"] }),
    ]);
    toast.success(nextStatus === "archived" ? "보고서를 보관했습니다" : "보고서를 복원했습니다");
  };

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setTypeFilter("all");
    setFormatFilter("all");
    setCreatedFrom("");
    setCreatedTo("");
    setPeriodFrom("");
    setPeriodTo("");
    setShowArchived(false);
    setSortKey("created_at");
    setSortDirection("desc");
    setSecondarySortKey("report_number");
    setNullPlacement("last");
  };

  const visibleReports = (reports || []).filter((report: any) => report.status !== "archived");
  const actualReports = visibleReports.filter((report: any) => !report.report_number?.startsWith("RG-DEMO-"));
  const sampleReports = visibleReports.filter((report: any) => report.report_number?.startsWith("RG-DEMO-"));
  const completedCount = actualReports.filter((report: any) => report.status === "completed").length;
  const thisMonth = actualReports.filter((report: any) => {
    const date = new Date(report.created_at);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;
  const totalSize = actualReports.reduce((sum: number, report: any) => sum + (report.file_size || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">보고서 이력</h1>
            <p className="mt-1 text-sm text-muted-foreground">작성된 보고서를 검색하고 파일, 기간, 상태, 재작성 이력을 관리합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExcelExportButton
              fileName="보고서이력"
              title="보고서 이력"
              headers={[
                { key: "report_number", label: "보고서번호", width: 22 },
                { key: "official_document_number", label: "관련 공문 문서번호", width: 34 },
                { key: "title", label: "보고서명", width: 30 },
                { key: "template_name", label: "템플릿", width: 22 },
                { key: "category", label: "업무분류", width: 12 },
                { key: "type", label: "보고주기", width: 12 },
                { key: "period", label: "보고기간", width: 22 },
                { key: "file_format", label: "형식", width: 10 },
                { key: "file_size", label: "크기", width: 12 },
                { key: "page_count", label: "쪽수", width: 8 },
                { key: "created_at", label: "생성일", format: "date", width: 14 },
                { key: "status", label: "상태", width: 10 },
              ]}
              getData={() => filteredReports.map((report: any) => ({
                report_number: report.report_number,
                official_document_number: report.parameters_used?.official_document_number || "-",
                title: report.title,
                template_name: report.template?.name || "-",
                category: REPORT_CATEGORY_LABELS[report.template?.report_category] || report.template?.report_category || "-",
                type: REPORT_TYPE_LABELS[report.template?.report_type] || report.template?.report_type || "-",
                period: report.period_start ? `${report.period_start}~${report.period_end || ""}` : "-",
                file_format: (report.file_format || "pdf").toUpperCase(),
                file_size: formatSize(report.file_size),
                page_count: report.page_count || "-",
                created_at: report.created_at,
                status: REPORT_STATUS_LABELS[report.status]?.label || report.status,
              }))}
            />
            <Button asChild><Link to="/reports/generate"><Plus className="mr-1.5 h-4 w-4" />새 보고서 작성</Link></Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card><CardContent className="flex items-center gap-3 p-4"><FileText className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">실제 작성 보고서</p><p className="text-xl font-bold">{actualReports.length}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><CalendarCheck className="h-5 w-5 text-emerald-600" /><div><p className="text-xs text-muted-foreground">이번 달 생성</p><p className="text-xl font-bold">{thisMonth}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><RefreshCw className="h-5 w-5 text-sky-600" /><div><p className="text-xs text-muted-foreground">완료 / 샘플</p><p className="text-xl font-bold">{completedCount}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {sampleReports.length}</span></p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><HardDrive className="h-5 w-5 text-violet-600" /><div><p className="text-xs text-muted-foreground">총 용량</p><p className="text-xl font-bold">{formatSize(totalSize)}</p></div></CardContent></Card>
        </div>

        <div className="space-y-3 rounded-md border bg-card p-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_150px_150px_150px_140px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="관리번호, 공문번호, 제목, 템플릿 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{Object.entries(REPORT_STATUS_LABELS).map(([value, item]) => <SelectItem key={value} value={value}>{item.label}</SelectItem>)}</SelectContent></Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 업무분류</SelectItem>{categoryOptions.map((value) => <SelectItem key={value} value={value}>{REPORT_CATEGORY_LABELS[value] || value}</SelectItem>)}</SelectContent></Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 보고주기</SelectItem>{typeOptions.map((value) => <SelectItem key={value} value={value}>{REPORT_TYPE_LABELS[value] || value}</SelectItem>)}</SelectContent></Select>
            <Select value={formatFilter} onValueChange={setFormatFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 파일형식</SelectItem><SelectItem value="pdf">PDF</SelectItem><SelectItem value="pdf+xlsx">PDF + 엑셀</SelectItem></SelectContent></Select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="grid grid-cols-[72px_1fr_1fr] items-center gap-2"><Label className="text-xs">생성일</Label><Input aria-label="생성일 시작" type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} /><Input aria-label="생성일 종료" type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} /></div>
            <div className="grid grid-cols-[72px_1fr_1fr] items-center gap-2"><Label className="text-xs">보고기간</Label><Input aria-label="보고기간 시작" type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} /><Input aria-label="보고기간 종료" type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} /></div>
            <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}><SelectTrigger aria-label="1차 정렬"><SelectValue /></SelectTrigger><SelectContent>{SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}순</SelectItem>)}</SelectContent></Select>
            <div className="grid grid-cols-[40px_1fr_120px] gap-2">
              <Button type="button" variant="outline" size="icon" title={sortDirection === "asc" ? "오름차순" : "내림차순"} onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}>{sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</Button>
              <Select value={secondarySortKey} onValueChange={(value) => setSecondarySortKey(value as SortKey | "none")}><SelectTrigger aria-label="2차 정렬"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">2차 정렬 없음</SelectItem>{SORT_OPTIONS.filter((option) => option.value !== sortKey).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
              <Select value={nullPlacement} onValueChange={(value) => setNullPlacement(value as NullPlacement)}><SelectTrigger aria-label="빈값 정렬"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="last">빈값 뒤로</SelectItem><SelectItem value="first">빈값 앞으로</SelectItem></SelectContent></Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>총 {(reports || []).length.toLocaleString()}건 중 {filteredReports.length.toLocaleString()}건 표시</span>
            <div className="flex gap-1">
              <Button type="button" variant={showArchived ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setShowArchived(!showArchived)}><ArchiveRestore className="mr-1 h-3.5 w-3.5" />{showArchived ? "보관 포함" : "보관 제외"}</Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={resetFilters}><RotateCcw className="mr-1 h-3.5 w-3.5" />초기화</Button>
            </div>
          </div>
        </div>

        <div className="space-y-3 md:hidden">
          {isLoading ? <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
            : isError ? <div className="rounded-md border p-4 text-center"><p className="mb-2 text-sm text-destructive">보고서 이력을 불러오지 못했습니다.</p><Button variant="outline" size="sm" onClick={() => refetch()}>다시 시도</Button></div>
            : !filteredReports.length ? <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">조건에 맞는 보고서가 없습니다.</div>
            : filteredReports.map((report: any) => {
              const status = REPORT_STATUS_LABELS[report.status] || { label: report.status, color: "bg-muted" };
              return (
                <Card key={report.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="break-words text-sm font-semibold">{report.title}</p><p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{report.report_number}</p></div>
                      <Badge className={`shrink-0 text-[10px] ${status.color}`}>{status.label}</Badge>
                    </div>
                    <dl className="grid grid-cols-[76px_1fr] gap-x-2 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">공문번호</dt><dd className="break-all">{report.parameters_used?.official_document_number || "미연계"}</dd>
                      <dt className="text-muted-foreground">분류</dt><dd>{REPORT_CATEGORY_LABELS[report.template?.report_category] || report.template?.report_category || "-"} · {REPORT_TYPE_LABELS[report.template?.report_type] || report.template?.report_type || "-"}</dd>
                      <dt className="text-muted-foreground">보고기간</dt><dd>{report.period_start ? `${report.period_start} ~ ${report.period_end || "-"}` : "-"}</dd>
                      <dt className="text-muted-foreground">파일</dt><dd>{(report.file_format || "pdf").toUpperCase()} · {formatSize(report.file_size)} · {report.page_count ? `${report.page_count}쪽` : "쪽수 미확인"}</dd>
                    </dl>
                    <div className="flex flex-wrap justify-end gap-1 border-t pt-2">
                      {report.status === "completed" && <Button variant="outline" size="icon" className="h-9 w-9" title="PDF 열기" onClick={() => handleDownload(report.file_path)}><Download className="h-4 w-4" /></Button>}
                      {report.status === "completed" && report.excel_path && <Button variant="outline" size="icon" className="h-9 w-9" title="엑셀 열기" onClick={() => handleDownload(report.excel_path)}><FileSpreadsheet className="h-4 w-4" /></Button>}
                      {report.template && <Button variant="outline" size="icon" className="h-9 w-9" title="조건 복사 작성" onClick={() => navigate(`/reports/generate?template=${encodeURIComponent(report.template.template_code)}&source=${report.id}`)}><Copy className="h-4 w-4" /></Button>}
                      <Button variant="outline" size="icon" className="h-9 w-9" title="공식 문서 연결" onClick={() => setDocumentReport(report)}><Link2 className="h-4 w-4" /></Button>
                      {(report.status === "completed" || report.status === "archived") && <Button variant="outline" size="icon" className="h-9 w-9" title={report.status === "archived" ? "복원" : "보관"} onClick={() => handleArchive(report)}><ArchiveRestore className="h-4 w-4" /></Button>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>

        <Card className="hidden overflow-hidden md:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader><TableRow>
                  <TableHead>관리번호 / 공문번호</TableHead><TableHead>보고서명 / 템플릿</TableHead><TableHead>분류 / 주기</TableHead><TableHead>보고기간</TableHead><TableHead>생성일</TableHead><TableHead>파일</TableHead><TableHead>쪽수 / 처리시간</TableHead><TableHead>상태</TableHead><TableHead className="text-right">관리</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {isLoading ? <TableRow><TableCell colSpan={9} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                    : isError ? <TableRow><TableCell colSpan={9} className="py-10 text-center"><p className="mb-2 text-sm text-destructive">보고서 이력을 불러오지 못했습니다.</p><Button variant="outline" size="sm" onClick={() => refetch()}>다시 시도</Button></TableCell></TableRow>
                    : !filteredReports.length ? <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">조건에 맞는 보고서가 없습니다. 필터를 초기화하거나 새 보고서를 작성하세요.</TableCell></TableRow>
                    : filteredReports.map((report: any) => {
                      const status = REPORT_STATUS_LABELS[report.status] || { label: report.status, color: "bg-muted" };
                      return <TableRow key={report.id}>
                        <TableCell className="max-w-[250px] text-xs"><span className="block font-mono font-medium">{report.report_number}{report.report_number?.startsWith("RG-DEMO-") && <Badge variant="outline" className="ml-2 text-[9px] font-sans">샘플</Badge>}</span><span className="mt-1 block truncate text-muted-foreground" title={report.parameters_used?.official_document_number}>{report.parameters_used?.official_document_number || "공문번호 미연계"}</span></TableCell>
                        <TableCell className="max-w-[300px]"><span className="block truncate text-sm font-medium" title={report.title}>{report.title}</span><span className="block truncate text-xs text-muted-foreground">{report.template?.name || "템플릿 없음"}</span>{report.status === "failed" && report.error_message && <span className="mt-1 block truncate text-xs text-destructive" title={report.error_message}>{report.error_message}</span>}</TableCell>
                        <TableCell><span className="block text-xs">{REPORT_CATEGORY_LABELS[report.template?.report_category] || report.template?.report_category || "-"}</span><span className="text-xs text-muted-foreground">{REPORT_TYPE_LABELS[report.template?.report_type] || report.template?.report_type || "-"}</span></TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{report.period_start ? <>{report.period_start}<br />~ {report.period_end || "-"}</> : "-"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{new Date(report.created_at).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</TableCell>
                        <TableCell><span className="block text-xs font-medium uppercase">{report.file_format || "pdf"}</span><span className="text-xs text-muted-foreground">{formatSize(report.file_size)}</span></TableCell>
                        <TableCell><span className="block text-xs">{report.page_count ? `${report.page_count}쪽` : "-"}</span><span className="text-xs text-muted-foreground">{formatDuration(report.generation_time_ms)}</span></TableCell>
                        <TableCell><Badge className={`text-[10px] ${status.color}`} title={report.error_message || undefined}>{status.label}</Badge></TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {report.status === "completed" && <Button variant="ghost" size="icon" className="h-8 w-8" title="PDF 열기" onClick={() => handleDownload(report.file_path)}><Download className="h-3.5 w-3.5" /></Button>}
                            {report.status === "completed" && report.excel_path && <Button variant="ghost" size="icon" className="h-8 w-8" title="엑셀 열기" onClick={() => handleDownload(report.excel_path)}><FileSpreadsheet className="h-3.5 w-3.5" /></Button>}
                            {report.template && <Button variant="ghost" size="icon" className="h-8 w-8" title="조건 복사 작성" onClick={() => navigate(`/reports/generate?template=${encodeURIComponent(report.template.template_code)}&source=${report.id}`)}><Copy className="h-3.5 w-3.5" /></Button>}
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="공식 문서 연결" onClick={() => setDocumentReport(report)}><Link2 className="h-3.5 w-3.5" /></Button>
                            {report.status === "failed" && <Button variant="ghost" size="icon" className="h-8 w-8" title="같은 보고서 재생성" disabled={retryMutation.isPending} onClick={() => retryMutation.mutate(report)}><RefreshCw className={`h-3.5 w-3.5 ${retryMutation.isPending && retryMutation.variables?.id === report.id ? "animate-spin" : ""}`} /></Button>}
                            {(report.status === "completed" || report.status === "archived") && <Button variant="ghost" size="icon" className="h-8 w-8" title={report.status === "archived" ? "복원" : "보관"} onClick={() => handleArchive(report)}><ArchiveRestore className="h-3.5 w-3.5" /></Button>}
                            {profile?.role === "admin" && report.status === "archived" && <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="영구 삭제"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>보관 보고서 영구 삭제</AlertDialogTitle><AlertDialogDescription>“{report.title}” 보고서 이력과 저장 파일을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(report)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">영구 삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
                          </div>
                        </TableCell>
                      </TableRow>;
                    })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Dialog open={Boolean(documentReport)} onOpenChange={(open) => { if (!open) setDocumentReport(null); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>보고서 공식 문서 연결</DialogTitle></DialogHeader>
            {documentReport && (
              <DocumentLinksPanel
                module="REPORT"
                recordId={documentReport.id}
                recordPath={`/reports/history?report=${documentReport.id}`}
                recordTitle={`${documentReport.report_number} ${documentReport.title}`}
                initialDocumentNumber={documentReport.parameters_used?.official_document_number || ""}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
