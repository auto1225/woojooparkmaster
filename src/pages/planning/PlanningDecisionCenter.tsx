import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, FileCheck2, FileText, GitCompareArrows, Printer, Search, Target } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { stableMultiSort } from "@/lib/list-sorting";
import { decideSiteCandidate } from "@/lib/workflow-commands";
import { ACQUISITION_LABELS, formatBudgetWon, normalizeSiteScore, OWNERSHIP_LABELS, PHASE_LABELS, PHASE_ORDER, PROJECT_TYPE_LABELS, SITE_STATUS_COLORS, SITE_STATUS_LABELS, type ConstructionProject, type Permit, type SiteCandidate } from "@/types/planning";

type ProjectPortfolio = ConstructionProject & { permits: Permit[]; documents: Array<{ id: string; review_status: string; is_current: boolean }> };

function siteReadiness(site: SiteCandidate) {
  const checks = [
    Boolean(site.address_road || site.address_jibun), Boolean(site.area_sqm), Boolean(site.ownership),
    Boolean(site.estimated_spaces), Boolean(site.total_score), Boolean(site.estimated_construction_cost),
    Boolean(site.bc_ratio), Boolean(site.evaluation_date),
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

function siteRisks(site: SiteCandidate) {
  const risks: string[] = [];
  if (!site.total_score) risks.push("평가 미완료");
  if (!site.bc_ratio) risks.push("B/C 미산정");
  if (site.bc_ratio != null && site.bc_ratio < 1) risks.push("B/C 1.0 미만");
  if (site.ownership === "private" && !site.acquisition_method) risks.push("매입방식 미정");
  if (site.legal_restrictions) risks.push("법적 제한 검토");
  if (site.environmental_review || site.traffic_impact_review || site.cultural_heritage_review) risks.push("법정검토 필요");
  return risks;
}

function costPerSpace(site: SiteCandidate) {
  const total = Number(site.estimated_land_cost || 0) + Number(site.estimated_construction_cost || 0);
  return site.estimated_spaces && total ? Math.round(total / site.estimated_spaces) : null;
}

function projectBlockers(project: ProjectPortfolio) {
  const blockers: string[] = [];
  const phaseIndex = PHASE_ORDER.indexOf(project.phase);
  const approved = project.permits.filter((permit) => ["approved", "conditional_approved"].includes(permit.status)).length;
  const currentApprovedDocs = project.documents.filter((document) => document.is_current && ["approved", "final"].includes(document.review_status)).length;
  if (phaseIndex >= PHASE_ORDER.indexOf("permitting") && approved < project.permits.length) blockers.push(`인허가 ${project.permits.length - approved}건 미승인`);
  if (phaseIndex >= PHASE_ORDER.indexOf("bidding") && currentApprovedDocs === 0) blockers.push("승인 도면 없음");
  if (!project.total_budget) blockers.push("총사업비 미확정");
  if (project.delay_days && project.delay_days > 0) blockers.push(`${project.delay_days}일 지연`);
  if (project.status === "suspended") blockers.push("사업 중단");
  return blockers;
}

export default function PlanningDecisionCenter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("sites");
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState("all");
  const [minimumScore, setMinimumScore] = useState("0");
  const [sortKey, setSortKey] = useState("readiness");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [decisionTarget, setDecisionTarget] = useState<SiteCandidate | null>(null);
  const [decisionStatus, setDecisionStatus] = useState("selected");
  const [decisionNote, setDecisionNote] = useState("");

  const { data: sites = [], isLoading: sitesLoading } = useQuery({
    queryKey: ["planning-decision-sites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_candidates").select("*").is("archived_at", null);
      if (error) throw error;
      return (data || []) as unknown as SiteCandidate[];
    },
  });
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["planning-decision-projects"],
    queryFn: async () => {
      const [projectResult, permitResult, documentResult] = await Promise.all([
        supabase.from("construction_projects").select("*").is("archived_at", null),
        supabase.from("permits").select("*").is("archived_at", null),
        supabase.from("design_documents").select("id, project_id, review_status, is_current").is("archived_at", null),
      ]);
      if (projectResult.error) throw projectResult.error;
      if (permitResult.error) throw permitResult.error;
      if (documentResult.error) throw documentResult.error;
      return (projectResult.data || []).map((project) => ({
        ...project,
        permits: (permitResult.data || []).filter((permit) => permit.project_id === project.id),
        documents: (documentResult.data || []).filter((document) => document.project_id === project.id),
      })) as unknown as ProjectPortfolio[];
    },
  });

  const filteredSites = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko");
    const matching = sites.filter((site) => {
      if (ownership !== "all" && site.ownership !== ownership) return false;
      if (normalizeSiteScore(site.total_score) < Number(minimumScore)) return false;
      return !query || [site.site_number, site.name, site.address_road, site.address_jibun, site.administrative_dong].some((value) => String(value || "").toLocaleLowerCase("ko").includes(query));
    });
    return stableMultiSort(matching, [{
      value: (site) => sortKey === "score" ? normalizeSiteScore(site.total_score)
        : sortKey === "bc" ? Number(site.bc_ratio || 0)
        : sortKey === "spaces" ? Number(site.estimated_spaces || 0)
        : sortKey === "cost" ? Number(costPerSpace(site) || Number.MAX_SAFE_INTEGER)
        : sortKey === "risk" ? siteRisks(site).length
        : siteReadiness(site),
      direction: sortKey === "cost" || sortKey === "risk" ? "asc" : "desc",
    }]);
  }, [minimumScore, ownership, search, sites, sortKey]);

  const selectedSites = selectedIds.map((id) => sites.find((site) => site.id === id)).filter(Boolean) as SiteCandidate[];
  const activeProjects = projects.filter((project) => !["completed", "cancelled"].includes(project.status));
  const permitBottlenecks = activeProjects.reduce((sum, project) => sum + project.permits.filter((permit) => !["approved", "conditional_approved"].includes(permit.status)).length, 0);
  const readySites = sites.filter((site) => siteReadiness(site) >= 75 && siteRisks(site).length === 0).length;
  const atRiskProjects = activeProjects.filter((project) => projectBlockers(project).length > 0).length;

  const decisionMutation = useMutation({
    mutationFn: async () => {
      if (!decisionTarget) return;
      await decideSiteCandidate(
        decisionTarget.id,
        decisionStatus as "evaluating" | "selected" | "rejected",
        decisionNote.trim(),
        decisionTarget.row_version,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["planning-decision-sites"] });
      await queryClient.invalidateQueries({ queryKey: ["planning-sites"] });
      toast.success("후보부지 의사결정을 기록했습니다.");
      setDecisionTarget(null);
      setDecisionNote("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleCompare = (id: string) => setSelectedIds((current) => current.includes(id)
    ? current.filter((value) => value !== id)
    : current.length < 3 ? [...current, id] : current);

  return <DashboardLayout><div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-bold">신설사업 의사결정</h1><p className="mt-1 text-sm text-muted-foreground">후보지 경제성·법정검토와 사업 단계별 병목을 한곳에서 검토합니다.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" />검토표 인쇄</Button><Button asChild><Link to="/documents"><FileText className="mr-1.5 h-4 w-4" />공식 문서</Link></Button></div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">결정 준비 후보지</p><Target className="h-4 w-4 text-primary" /></div><p className="mt-1 text-2xl font-bold">{readySites}곳</p><p className="mt-1 text-xs text-muted-foreground">준비도 75% 이상·위험 없음</p></CardContent></Card>
      <Card><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">비교 선택</p><GitCompareArrows className="h-4 w-4 text-primary" /></div><p className="mt-1 text-2xl font-bold">{selectedSites.length}/3</p><p className="mt-1 text-xs text-muted-foreground">동일 기준 후보지 비교</p></CardContent></Card>
      <Card><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">사업 위험</p><AlertTriangle className="h-4 w-4 text-destructive" /></div><p className={`mt-1 text-2xl font-bold ${atRiskProjects ? "text-destructive" : ""}`}>{atRiskProjects}건</p><p className="mt-1 text-xs text-muted-foreground">단계 게이트 미충족</p></CardContent></Card>
      <Card><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">인허가 병목</p><FileCheck2 className="h-4 w-4 text-primary" /></div><p className="mt-1 text-2xl font-bold">{permitBottlenecks}건</p><p className="mt-1 text-xs text-muted-foreground">미승인·심사 중 인허가</p></CardContent></Card>
    </div>

    <Tabs value={tab} onValueChange={setTab}><TabsList className="rounded-md"><TabsTrigger value="sites">후보지 비교·선정</TabsTrigger><TabsTrigger value="projects">사업 단계·병목</TabsTrigger></TabsList>
      <TabsContent value="sites" className="space-y-4">
        <div className="grid gap-2 rounded-md border bg-card p-3 md:grid-cols-[minmax(240px,1fr)_150px_140px_170px_auto]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="후보지 검색" className="pl-9" placeholder="번호, 부지명, 주소 검색" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <Select value={ownership} onValueChange={setOwnership}><SelectTrigger aria-label="소유구분"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 소유구분</SelectItem>{Object.entries(OWNERSHIP_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={minimumScore} onValueChange={setMinimumScore}><SelectTrigger aria-label="최소 평가점수"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">전체 점수</SelectItem><SelectItem value="40">40점 이상</SelectItem><SelectItem value="60">60점 이상</SelectItem><SelectItem value="80">80점 이상</SelectItem></SelectContent></Select>
          <Select value={sortKey} onValueChange={setSortKey}><SelectTrigger aria-label="후보지 정렬"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="readiness">추진준비도 높은순</SelectItem><SelectItem value="score">평가점수 높은순</SelectItem><SelectItem value="bc">B/C 높은순</SelectItem><SelectItem value="spaces">확충면수 많은순</SelectItem><SelectItem value="cost">면당사업비 낮은순</SelectItem><SelectItem value="risk">위험 적은순</SelectItem></SelectContent></Select>
          <Button variant="outline" onClick={() => { setSearch(""); setOwnership("all"); setMinimumScore("0"); setSortKey("readiness"); }}>초기화</Button>
        </div>

        {selectedSites.length > 0 && <div className="overflow-x-auto rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead>비교 기준</TableHead>{selectedSites.map((site) => <TableHead key={site.id}>{site.name}</TableHead>)}</TableRow></TableHeader><TableBody>
          {[
            ["평가점수", (site: SiteCandidate) => site.total_score ? `${normalizeSiteScore(site.total_score).toFixed(1)}점` : "미평가"],
            ["B/C", (site: SiteCandidate) => site.bc_ratio ? Number(site.bc_ratio).toFixed(2) : "미산정"],
            ["예상 확충", (site: SiteCandidate) => `${Number(site.estimated_spaces || 0).toLocaleString()}면`],
            ["면당 사업비", (site: SiteCandidate) => formatBudgetWon(costPerSpace(site))],
            ["추진준비도", (site: SiteCandidate) => `${siteReadiness(site)}%`],
            ["핵심 위험", (site: SiteCandidate) => siteRisks(site).join(" · ") || "없음"],
          ].map(([label, render]) => <TableRow key={label as string}><TableCell className="font-medium">{label as string}</TableCell>{selectedSites.map((site) => <TableCell key={site.id}>{(render as (site: SiteCandidate) => string)(site)}</TableCell>)}</TableRow>)}
        </TableBody></Table></div>}

        <div className="overflow-x-auto rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead className="w-12" sortable={false}>비교</TableHead><TableHead>후보지</TableHead><TableHead>소유·취득</TableHead><TableHead className="text-right">점수</TableHead><TableHead className="text-right">B/C</TableHead><TableHead className="text-right">확충면</TableHead><TableHead className="text-right">면당사업비</TableHead><TableHead>추진준비도</TableHead><TableHead>위험·보완</TableHead><TableHead>상태</TableHead><TableHead sortable={false}>조치</TableHead></TableRow></TableHeader><TableBody>
          {sitesLoading ? <TableRow><TableCell colSpan={11} className="h-36 text-center">불러오는 중...</TableCell></TableRow> : filteredSites.map((site) => { const risks = siteRisks(site); const readiness = siteReadiness(site); return <TableRow key={site.id}>
            <TableCell><Checkbox aria-label={`${site.name} 비교 선택`} checked={selectedIds.includes(site.id)} disabled={!selectedIds.includes(site.id) && selectedIds.length >= 3} onCheckedChange={() => toggleCompare(site.id)} /></TableCell>
            <TableCell><div className="font-medium">{site.name}</div><div className="text-xs text-muted-foreground">{site.site_number} · {site.address_road || site.address_jibun || "주소 미입력"}</div></TableCell>
            <TableCell><div>{OWNERSHIP_LABELS[site.ownership || ""] || site.ownership || "미입력"}</div><div className="text-xs text-muted-foreground">{ACQUISITION_LABELS[site.acquisition_method || ""] || site.acquisition_method || "취득방식 미정"}</div></TableCell>
            <TableCell className="text-right font-medium">{site.total_score ? normalizeSiteScore(site.total_score).toFixed(1) : "-"}</TableCell><TableCell className="text-right">{site.bc_ratio ? Number(site.bc_ratio).toFixed(2) : "-"}</TableCell><TableCell className="text-right">{Number(site.estimated_spaces || 0).toLocaleString()}</TableCell><TableCell className="text-right">{formatBudgetWon(costPerSpace(site))}</TableCell>
            <TableCell><div className="flex min-w-28 items-center gap-2"><Progress value={readiness} className="h-2" /><span className="w-9 text-right text-xs">{readiness}%</span></div></TableCell>
            <TableCell className="max-w-64 whitespace-normal">{risks.length ? <div className="flex flex-wrap gap-1">{risks.map((risk) => <Badge key={risk} variant="outline" className="border-amber-300 text-amber-800">{risk}</Badge>)}</div> : <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />위험 없음</span>}</TableCell>
            <TableCell><Badge className={SITE_STATUS_COLORS[site.status] || ""} variant="outline">{SITE_STATUS_LABELS[site.status] || site.status}</Badge></TableCell>
            <TableCell><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => { setDecisionTarget(site); setDecisionStatus(site.status === "rejected" ? "evaluating" : "selected"); setDecisionNote(site.decision_note || ""); }}>결정 기록</Button><Button size="icon" variant="ghost" title="후보부지 관리" onClick={() => navigate("/planning/sites")}><ArrowRight className="h-4 w-4" /></Button></div></TableCell>
          </TableRow>; })}
          {!sitesLoading && filteredSites.length === 0 && <TableRow><TableCell colSpan={11} className="h-36 text-center text-muted-foreground">조건에 맞는 후보지가 없습니다.</TableCell></TableRow>}
        </TableBody></Table></div>
      </TabsContent>

      <TabsContent value="projects"><div className="overflow-x-auto rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead>사업</TableHead><TableHead>현재 단계</TableHead><TableHead>진척률</TableHead><TableHead>예산 집행</TableHead><TableHead>인허가</TableHead><TableHead>승인 도면</TableHead><TableHead>준공 목표</TableHead><TableHead>단계 게이트·병목</TableHead><TableHead sortable={false}>조치</TableHead></TableRow></TableHeader><TableBody>
        {projectsLoading ? <TableRow><TableCell colSpan={9} className="h-36 text-center">불러오는 중...</TableCell></TableRow> : activeProjects.map((project) => { const approved = project.permits.filter((permit) => ["approved", "conditional_approved"].includes(permit.status)).length; const approvedDocs = project.documents.filter((document) => document.is_current && ["approved", "final"].includes(document.review_status)).length; const blockers = projectBlockers(project); return <TableRow key={project.id}>
          <TableCell><div className="font-medium">{project.project_name}</div><div className="text-xs text-muted-foreground">{project.project_number} · {PROJECT_TYPE_LABELS[project.project_type] || project.project_type}</div></TableCell><TableCell><Badge variant="outline">{PHASE_LABELS[project.phase] || project.phase}</Badge></TableCell>
          <TableCell><div className="flex min-w-28 items-center gap-2"><Progress value={Number(project.progress_pct || 0)} className="h-2" /><span className="w-9 text-right text-xs">{Number(project.progress_pct || 0).toFixed(0)}%</span></div></TableCell><TableCell><div className="text-sm">{Number(project.budget_execution_rate || 0).toFixed(0)}%</div><div className="text-xs text-muted-foreground">{formatBudgetWon(project.spent)} / {formatBudgetWon(project.total_budget)}</div></TableCell>
          <TableCell><span className={approved < project.permits.length ? "font-semibold text-amber-700" : "text-emerald-700"}>{approved}/{project.permits.length}</span></TableCell><TableCell>{approvedDocs}건</TableCell><TableCell>{project.target_completion || "미정"}</TableCell>
          <TableCell className="max-w-72 whitespace-normal">{blockers.length ? <div className="flex flex-wrap gap-1">{blockers.map((blocker) => <Badge key={blocker} variant="destructive">{blocker}</Badge>)}</div> : <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />다음 단계 가능</span>}</TableCell>
          <TableCell><Button size="sm" variant="outline" asChild><Link to={`/planning/projects/${project.id}`}>사업 점검<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button></TableCell>
        </TableRow>; })}
        {!projectsLoading && activeProjects.length === 0 && <TableRow><TableCell colSpan={9} className="h-36 text-center text-muted-foreground">진행 중인 신설사업이 없습니다.</TableCell></TableRow>}
      </TableBody></Table></div></TabsContent>
    </Tabs>
  </div>

  {decisionTarget && <Dialog open onOpenChange={(open) => !open && setDecisionTarget(null)}><DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>후보부지 의사결정</DialogTitle><DialogDescription>{decisionTarget.site_number} · {decisionTarget.name}</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="decision-status">결정</Label><Select value={decisionStatus} onValueChange={setDecisionStatus}><SelectTrigger id="decision-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="evaluating">보완 검토</SelectItem><SelectItem value="selected">사업 후보 선정</SelectItem><SelectItem value="rejected">탈락</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>현재 추진준비도</Label><div className="flex h-10 items-center gap-3"><Progress value={siteReadiness(decisionTarget)} className="h-2" /><span className="text-sm font-semibold">{siteReadiness(decisionTarget)}%</span></div></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="decision-note">결정 사유·보완조건 *</Label><Textarea id="decision-note" className="min-h-24" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="위원회 검토결과, 선정 근거, 보완조건을 기록합니다." /></div></div>
    <DocumentLinksPanel module="PLANNING" recordId={decisionTarget.id} recordPath="/planning/decisions" recordTitle={decisionTarget.name} />
    <DialogFooter><Button variant="outline" onClick={() => setDecisionTarget(null)}>취소</Button><Button disabled={!decisionNote.trim() || decisionMutation.isPending} onClick={() => decisionMutation.mutate()}>{decisionMutation.isPending ? "저장 중..." : "결정 저장"}</Button></DialogFooter>
  </DialogContent></Dialog>}
  </DashboardLayout>;
}
