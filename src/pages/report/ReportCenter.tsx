import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  FileText, Search, Star, Settings, Wrench, Banknote, Calculator,
  MessageSquare, MapPin, Zap, BarChart3, Download, RefreshCw, Loader2, Clock, Files,
  ArrowDown, ArrowUp, CheckCircle2, CircleAlert, Plus, RotateCcw,
} from "lucide-react";
import {
  REPORT_TYPE_LABELS, REPORT_CATEGORY_LABELS, AUDIENCE_LABELS,
  REPORT_STATUS_LABELS, type ReportTemplate,
} from "@/types/report";
import { isModuleEnabled } from "@/lib/authorization";
import { openStoredReport, regenerateReportSamples } from "@/lib/report-engine";
import { ANNUAL_PARKING_REPORT_TEMPLATE_CODE, OPERATIONS_REPORT_TEMPLATE_CODE, reportGeneratePath } from "@/lib/report-catalog";

const CATEGORY_ICON_MAP: Record<string, any> = {
  operation: Settings, facility: Wrench, revenue: Banknote, budget: Calculator,
  complaint: MessageSquare, planning: MapPin, realtime: Zap, comprehensive: BarChart3, safety: Wrench,
};

const CATEGORIES = [
  { key: "__all__", label: "전체" },
  { key: "operation", label: "운영" },
  { key: "facility", label: "시설" },
  { key: "safety", label: "안전" },
  { key: "revenue", label: "수입" },
  { key: "budget", label: "예산" },
  { key: "complaint", label: "민원" },
  { key: "planning", label: "기획" },
  { key: "realtime", label: "실시간" },
  { key: "comprehensive", label: "종합" },
];

export default function ReportCenter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const { data: licenses } = useModuleLicenses();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("__all__");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [sortKey, setSortKey] = useState("sort_order");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [bulkProgress, setBulkProgress] = useState({ completed: 0, total: 0 });

  const activeModules = new Set([
    "CORE",
    ...["OPS", "FACILITY", "REVENUE", "BUDGET", "COMPLAINT", "PLANNING", "REALTIME", "REPORT", "SURVEY"]
      .filter((code) => isModuleEnabled(licenses, code)),
  ]);

  const { data: templates, isLoading } = useQuery({
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

  const { data: recentReports } = useQuery({
    queryKey: ["recent-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_generated")
        .select("id, report_number, title, period_start, period_end, file_path, status, created_at, parameters_used, template:report_templates(name, template_code)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: nextSchedule } = useQuery({
    queryKey: ["next-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_schedules")
        .select("*, template:report_templates(name)")
        .eq("is_active", true)
        .not("next_run", "is", null)
        .order("next_run")
        .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase.from("report_templates").update({ is_favorite }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["report-templates"] }),
  });

  const isTemplateAvailable = (t: ReportTemplate) => {
    const required = Array.isArray(t.required_modules) ? t.required_modules : [];
    return required.every((m: string) => activeModules.has(m));
  };

  const filtered = (() => {
    const keyword = search.trim().toLocaleLowerCase("ko-KR");
    const result = (templates ?? []).filter((t) => {
      const haystack = [t.name, t.description, t.template_code, REPORT_TYPE_LABELS[t.report_type], AUDIENCE_LABELS[t.target_audience || ""]]
        .filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
      if (keyword && !haystack.includes(keyword)) return false;
      if (category !== "__all__" && t.report_category !== category) return false;
      if (templateFilter === "favorite" && !t.is_favorite) return false;
      if (templateFilter === "available" && !isTemplateAvailable(t)) return false;
      if (templateFilter === "unavailable" && isTemplateAvailable(t)) return false;
      return true;
    });
    return result.sort((left, right) => {
      const leftValue = sortKey === "name" ? left.name : sortKey === "type" ? REPORT_TYPE_LABELS[left.report_type] || left.report_type : sortKey === "category" ? REPORT_CATEGORY_LABELS[left.report_category] || left.report_category : sortKey === "favorite" ? Number(left.is_favorite) : left.sort_order;
      const rightValue = sortKey === "name" ? right.name : sortKey === "type" ? REPORT_TYPE_LABELS[right.report_type] || right.report_type : sortKey === "category" ? REPORT_CATEGORY_LABELS[right.report_category] || right.report_category : sortKey === "favorite" ? Number(right.is_favorite) : right.sort_order;
      const compared = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue), "ko", { numeric: true });
      return sortDirection === "asc" ? compared : -compared;
    });
  })();

  const activeReports = (recentReports || []).filter((report: any) => report.status !== "archived");
  const actualReports = activeReports.filter((report: any) => !report.report_number?.startsWith("RG-DEMO-"));
  const completedReports = actualReports.filter((report: any) => report.status === "completed").length;
  const attentionReports = actualReports.filter((report: any) => report.status === "failed" || report.status === "generating").length;
  const operationsTemplate = templates?.find((template) => template.template_code === OPERATIONS_REPORT_TEMPLATE_CODE)
    ?? templates?.find((template) => template.template_code === "RPT-MONTHLY");
  const operationsAvailable = Boolean(operationsTemplate && isTemplateAvailable(operationsTemplate));
  const annualTemplate = templates?.find((template) => template.template_code === ANNUAL_PARKING_REPORT_TEMPLATE_CODE)
    ?? templates?.find((template) => template.template_code === "RPT-YEARLY")
    ?? templates?.find((template) => template.template_code === "RPT-DEMO-ANNUAL");
  const annualAvailable = Boolean(annualTemplate && isTemplateAvailable(annualTemplate));

  const bulkGenerateMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("로그인이 필요합니다.");
      const available = (templates ?? []).filter(isTemplateAvailable);
      if (!available.length) throw new Error("생성 가능한 보고서 템플릿이 없습니다.");

      setBulkProgress({ completed: 0, total: available.length });
      return regenerateReportSamples({
        templates: available,
        userId: user.id,
        authorName: profile?.name || user.email || "",
        onProgress: (completed, total) => setBulkProgress({ completed, total }),
      });
    },
    onSuccess: async ({ completed, failed, verifiedFiles }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recent-reports"] }),
        queryClient.invalidateQueries({ queryKey: ["report-history"] }),
      ]);
      if (completed) toast.success(`샘플 보고서 ${completed}건과 파일 ${verifiedFiles}개를 생성·검증했습니다.`);
      if (failed.length) toast.error(`${failed.length}건 생성 실패`, { description: failed.join(", ") });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setBulkProgress({ completed: 0, total: 0 }),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">보고서 센터</h1>
            <p className="mt-1 text-sm text-muted-foreground">작성된 보고서를 찾고, 업무별 템플릿으로 새 보고서를 생성합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild><Link to="/reports/generate"><Plus className="mr-1.5 h-4 w-4" />새 보고서 작성</Link></Button>
            <Button size="sm" disabled={bulkGenerateMutation.isPending || !templates?.length} onClick={() => bulkGenerateMutation.mutate()}>
              {bulkGenerateMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Files className="mr-1.5 h-4 w-4" />}
              {bulkGenerateMutation.isPending ? `샘플 교체 ${bulkProgress.completed}/${bulkProgress.total}` : "전체 샘플 새 양식으로 교체"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/reports/history">보고서 이력</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card><CardContent className="flex items-center gap-3 p-4"><FileText className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">실제 작성 보고서</p><p className="text-xl font-bold">{actualReports.length}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="text-xs text-muted-foreground">생성 완료</p><p className="text-xl font-bold">{completedReports}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><CircleAlert className="h-5 w-5 text-amber-600" /><div><p className="text-xs text-muted-foreground">확인 필요</p><p className="text-xl font-bold">{attentionReports}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><Files className="h-5 w-5 text-violet-600" /><div><p className="text-xs text-muted-foreground">사용 템플릿</p><p className="text-xl font-bold">{templates?.length || 0}</p></div></CardContent></Card>
        </div>

        <section aria-labelledby="business-report-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="business-report-heading" className="text-base font-semibold">업무별 보고서 작성</h2>
              <p className="mt-1 text-sm text-muted-foreground">업무 자료를 다시 입력하지 않고 기간과 출력 항목을 선택해 공식 보고서를 만듭니다.</p>
            </div>
            <Badge variant="secondary">운영관리·연간 통합 적용</Badge>
          </div>
          <div className="overflow-hidden rounded-md border bg-card">
            <div className="grid gap-3 p-4 md:grid-cols-[minmax(180px,0.8fr)_minmax(280px,1.5fr)_160px_auto] md:items-center">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10"><Settings className="h-4 w-4 text-primary" /></span>
                <div><p className="font-medium">운영관리</p><p className="text-xs text-muted-foreground">월간·수시 현황</p></div>
              </div>
              <p className="text-sm text-muted-foreground">주차장, 계약, 인력, 요금, 감면, 정기권, 단속, 무료개방, 방치차량, 보안점검</p>
              <div className="flex flex-wrap gap-1"><Badge variant="outline">PDF</Badge><Badge variant="outline">HWPX</Badge><Badge variant="outline">A4 세로·가로</Badge></div>
              <Button size="sm" disabled={!operationsAvailable} onClick={() => navigate(reportGeneratePath(OPERATIONS_REPORT_TEMPLATE_CODE))}>
                {operationsAvailable ? "운영 보고서 작성" : "운영 템플릿 확인 필요"}
              </Button>
            </div>
            <div className="grid gap-3 border-t p-4 md:grid-cols-[minmax(180px,0.8fr)_minmax(280px,1.5fr)_160px_auto] md:items-center">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-emerald-50"><BarChart3 className="h-4 w-4 text-emerald-700" /></span>
                <div><p className="font-medium">제주시 주차장 연간 통합</p><p className="text-xs text-muted-foreground">현황·분석·조치계획</p></div>
              </div>
              <p className="text-sm text-muted-foreground">112개소·6,380면 기준, 2024~2025년 24개월 비교, 유형별·월별 추이, 민원·시설·안전 및 중점관리 대상</p>
              <div className="flex flex-wrap gap-1"><Badge variant="outline">PDF</Badge><Badge variant="outline">HWPX</Badge><Badge variant="outline">전년 비교</Badge></div>
              <Button size="sm" disabled={!annualAvailable} onClick={() => navigate(reportGeneratePath(ANNUAL_PARKING_REPORT_TEMPLATE_CODE))}>
                {annualAvailable ? "2025 연간보고서 작성" : "연간 템플릿 확인 필요"}
              </Button>
            </div>
          </div>
        </section>

        {nextSchedule && (
          <div className="bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 flex items-center gap-3">
            <Clock className="h-4 w-4 text-accent shrink-0" />
            <span className="text-sm">
              다음 정기 보고서: <strong>{(nextSchedule as any).template?.name}</strong>
              {nextSchedule.next_run && ` — ${new Date(nextSchedule.next_run).toLocaleDateString("ko-KR")} 자동 생성 예정`}
            </span>
          </div>
        )}

        <div className="space-y-2 rounded-md border bg-card p-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_170px_170px_44px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="템플릿명, 코드, 주기, 대상 검색" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={templateFilter} onValueChange={setTemplateFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 템플릿</SelectItem><SelectItem value="favorite">즐겨찾기</SelectItem><SelectItem value="available">생성 가능</SelectItem><SelectItem value="unavailable">모듈 확인 필요</SelectItem></SelectContent></Select>
          <Select value={sortKey} onValueChange={setSortKey}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sort_order">기본순</SelectItem><SelectItem value="favorite">즐겨찾기순</SelectItem><SelectItem value="name">템플릿명순</SelectItem><SelectItem value="category">업무분류순</SelectItem><SelectItem value="type">보고주기순</SelectItem></SelectContent></Select>
          <Button type="button" variant="outline" size="icon" title={sortDirection === "asc" ? "오름차순" : "내림차순"} onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}>{sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setSearch(""); setCategory("__all__"); setTemplateFilter("all"); setSortKey("sort_order"); setSortDirection("asc"); }}><RotateCcw className="mr-1 h-3.5 w-3.5" />초기화</Button>
          </div>
          <p className="text-xs text-muted-foreground">총 {templates?.length || 0}개 중 {filtered.length}개 템플릿</p>
        </div>

        <Tabs value={category} onValueChange={setCategory}>
          <TabsList className="flex-wrap h-auto gap-1">
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c.key} value={c.key} className="text-xs">{c.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((t) => {
              const available = isTemplateAvailable(t);
              const Icon = CATEGORY_ICON_MAP[t.report_category] || FileText;
              return (
                <Card key={t.id} className={`relative ${!available ? "opacity-50" : "hover:shadow-md transition-shadow"}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <button
                        onClick={() => favoriteMutation.mutate({ id: t.id, is_favorite: !t.is_favorite })}
                        className="text-muted-foreground hover:text-warning transition-colors"
                      >
                        <Star className={`h-4 w-4 ${t.is_favorite ? "fill-warning text-warning" : ""}`} />
                      </button>
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{t.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{t.description}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      <Badge variant="outline" className="text-[10px]">{REPORT_TYPE_LABELS[t.report_type] || t.report_type}</Badge>
                      {t.target_audience && (
                        <Badge variant="secondary" className="text-[10px]">{AUDIENCE_LABELS[t.target_audience] || t.target_audience}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mb-4">
                      {(Array.isArray(t.required_modules) ? t.required_modules : []).map((m: string) => (
                        <Badge key={m} variant="outline" className={`text-[9px] ${activeModules.has(m) ? "border-green-300 text-green-700" : "border-muted text-muted-foreground"}`}>
                          {m}
                        </Badge>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!available}
                      onClick={() => navigate(reportGeneratePath(t.template_code))}
                    >
                      {available ? "생성" : "필요 모듈 비활성"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && <div className="col-span-full py-12 text-center text-sm text-muted-foreground">조건에 맞는 보고서 템플릿이 없습니다.</div>}
          </div>
        )}

        {recentReports && recentReports.length > 0 && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">최근 보고서</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link to="/reports/history">전체 보기</Link></Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentReports.slice(0, 5).map((r: any) => {
                  const st = REPORT_STATUS_LABELS[r.status] || { label: r.status, color: "bg-muted" };
                  return (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.period_start && `${r.period_start} ~ ${r.period_end}`}
                          {" · "}
                          {new Date(r.created_at).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                        {r.report_number?.startsWith("RG-DEMO-") && <Badge variant="outline" className="text-[9px]">샘플</Badge>}
                        {r.status === "completed" && <Button variant="ghost" size="icon" className="h-7 w-7" title="PDF 열기" onClick={async () => { try { await openStoredReport(r.file_path); } catch (error) { toast.error(error instanceof Error ? error.message : "파일을 열지 못했습니다"); } }}><Download className="h-3.5 w-3.5" /></Button>}
                        {r.status === "failed" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="조건 복사 작성" onClick={() => navigate(reportGeneratePath(r.template?.template_code, r.id, r.parameters_used?.report_scope))}><RefreshCw className="h-3.5 w-3.5" /></Button>
                        )}
                        {r.status === "generating" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
