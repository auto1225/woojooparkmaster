import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BarChart3, Briefcase, ClipboardCheck, DollarSign, FileText, Gavel, LayoutGrid, Link2, ListTodo, Lock, MapPin, Megaphone, Radio, RefreshCw, Search, Users, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { isModuleEnabled } from "@/lib/authorization";
import { OPEN_COMPLAINT_STATUSES } from "@/lib/work-status";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const MODULES = [
  { code: "SURVEY", label: "현황조사", icon: ClipboardCheck, url: "/master/surveys", countKey: "surveys" },
  { code: "OPS", label: "운영관리", icon: Users, url: "/master/ops", countKey: "ops" },
  { code: "FACILITY", label: "시설관리", icon: Wrench, url: "/master/facility", countKey: "facility" },
  { code: "REVENUE", label: "수입관리", icon: DollarSign, url: "/master/revenue", countKey: "revenue" },
  { code: "BUDGET", label: "예산관리", icon: BarChart3, url: "/master/budget", countKey: "budget" },
  { code: "PROCUREMENT", label: "입찰관리", icon: Gavel, url: "/master/procurement", countKey: "procurement" },
  { code: "SERVICE", label: "용역사업", icon: Briefcase, url: "/master/service", countKey: "service" },
  { code: "COMPLAINT", label: "민원관리", icon: Megaphone, url: "/master/complaints", countKey: "complaint" },
  { code: "PLANNING", label: "신설기획", icon: MapPin, url: "/master/planning", countKey: "planning" },
  { code: "REALTIME", label: "실시간정보", icon: Radio, url: "/master/realtime", countKey: "realtime" },
  { code: "REPORT", label: "보고서", icon: FileText, url: "/master/reports", countKey: "report" },
] as const;

type CountSummary = { primary: string; detail: string; attention?: boolean };

function formatRevenue(amount: number) {
  if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(1)}억원`;
  if (amount >= 10_000) return `${Math.round(amount / 10_000).toLocaleString()}만원`;
  return `${amount.toLocaleString()}원`;
}

export default function MasterHub() {
  const navigate = useNavigate();
  const { data: licenses } = useModuleLicenses();
  const [search, setSearch] = useState("");
  const activeSet = new Set(MODULES.filter((module) => isModuleEnabled(licenses, module.code)).map((module) => module.code));

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["master-hub-counts-v2"],
    queryFn: async () => {
      const since30Days = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const results = await Promise.all([
        supabase.from("parking_lots").select("status"),
        supabase.from("surveys").select("id, status"),
        supabase.from("equipment").select("id, status"),
        supabase.from("complaints").select("id, status, priority"),
        supabase.from("bid_projects").select("id, status"),
        supabase.from("service_projects").select("id, status"),
        supabase.from("revenue_daily").select("total_amount, verified, revenue_date"),
        supabase.from("budget_items").select("id"),
        supabase.from("site_candidates").select("id, status"),
        supabase.from("lot_realtime_status").select("lot_id, last_updated"),
        supabase.from("report_generated").select("id, status"),
        supabase.from("code_master").select("id").eq("group_code", "OFFICIAL_DOCUMENT").eq("is_active", true),
        (supabase.from("team_work_records" as never) as any).select("id, status").is("archived_at", null).neq("status", "completed"),
        supabase.from("attachments").select("id").eq("ref_type", "official_document_link"),
      ]);
      const sourceLabels = ["주차장", "현황조사", "시설장비", "민원", "입찰", "용역", "수입", "예산", "신설기획", "실시간", "보고서", "공식 문서", "팀 업무", "문서 연결"];
      const failedSources = results.flatMap((result, index) => result.error ? [sourceLabels[index]] : []);
      const failures = failedSources.length;
      const [lots, surveys, equipment, complaints, bids, services, revenue, budgetItems, sites, realtime, reports, documents, teamWork, documentLinks] = results.map((result) => result.data || []);
      const openComplaints = (complaints as any[]).filter((item) => (OPEN_COMPLAINT_STATUSES as readonly string[]).includes(item.status));
      const recentRevenue = (revenue as any[]).filter((item) => item.revenue_date >= since30Days);
      const revenueTotal = recentRevenue.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
      const realtimeStale = (realtime as any[]).filter((item) => !item.last_updated || Date.now() - new Date(item.last_updated).getTime() > 15 * 60_000).length;
      const counts: Record<string, CountSummary> = {
        surveys: { primary: `${surveys.length}건`, detail: `승인 대기 ${(surveys as any[]).filter((item) => ["submitted", "review"].includes(item.status)).length}건` },
        ops: { primary: `${lots.length}개소`, detail: `운영 ${(lots as any[]).filter((item) => item.status === "active").length}개소` },
        facility: { primary: `장비 ${equipment.length}대`, detail: `조치 필요 ${(equipment as any[]).filter((item) => ["warning", "broken", "maintenance"].includes(item.status)).length}대`, attention: true },
        complaint: { primary: `전체 ${complaints.length}건`, detail: `미종결 ${openComplaints.length}건 · 긴급 ${openComplaints.filter((item) => item.priority === "urgent").length}건`, attention: true },
        procurement: { primary: `${bids.length}건`, detail: `진행 ${(bids as any[]).filter((item) => !["contracted", "cancelled", "failed"].includes(item.status)).length}건` },
        service: { primary: `${services.length}건`, detail: `진행 ${(services as any[]).filter((item) => item.status === "in_progress").length}건` },
        revenue: { primary: `전체 ${revenue.length}건`, detail: `최근 30일 ${formatRevenue(revenueTotal)} · 미검증 ${(revenue as any[]).filter((item) => !item.verified).length}건`, attention: true },
        budget: { primary: `${budgetItems.length}개 항목`, detail: "편성·배정·집행 비교" },
        planning: { primary: `${sites.length}개 후보지`, detail: `평가 중 ${(sites as any[]).filter((item) => item.status === "evaluation").length}건` },
        realtime: { primary: `연동 ${realtime.length}개소`, detail: `15분 초과 ${realtimeStale}개소`, attention: realtimeStale > 0 },
        report: { primary: `${reports.length}건`, detail: `완료 ${(reports as any[]).filter((item) => item.status === "completed").length}건` },
      };
      return {
        counts,
        failures,
        failedSources,
        documents: documents.length,
        teamWork: teamWork.length,
        documentLinks: documentLinks.length,
        fetchedAt: new Date().toISOString(),
      };
    },
    refetchInterval: 60_000,
  });

  const filteredModules = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ko");
    return term ? MODULES.filter((module) => module.label.toLocaleLowerCase("ko").includes(term)) : MODULES;
  }, [search]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="flex items-center gap-2 text-xl font-bold"><LayoutGrid className="h-5 w-5" />종합 현황 센터</h1><p className="mt-1 text-sm text-muted-foreground">모듈별 전체 원장을 비교·검색·정렬하고 업무 화면으로 이동합니다</p></div>
          <div className="flex items-center gap-2">{data?.failures ? <Badge variant="outline" className="text-amber-700">{data.failedSources.join(", ")} 조회 실패</Badge> : null}<span className="text-xs text-muted-foreground">{data?.fetchedAt ? `${new Date(data.fetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 조회` : "조회 중"}</span><Button size="icon" variant="outline" title="종합 현황 새로고침" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></Button></div>
        </div>

        <section className="grid border sm:grid-cols-3" aria-label="업무 연결 현황">
          <button type="button" className="flex items-center gap-3 p-4 text-left hover:bg-muted/40" onClick={() => navigate("/documents")}><FileText className="h-4 w-4" /><span><span className="block text-xs text-muted-foreground">공식 문서</span><strong className="tabular-nums">{data?.documents || 0}건</strong></span></button>
          <button type="button" className="flex items-center gap-3 border-t p-4 text-left hover:bg-muted/40 sm:border-l sm:border-t-0" onClick={() => navigate("/team-work")}><ListTodo className="h-4 w-4" /><span><span className="block text-xs text-muted-foreground">미종결 팀 업무</span><strong className="tabular-nums">{data?.teamWork || 0}건</strong></span></button>
          <button type="button" className="flex items-center gap-3 border-t p-4 text-left hover:bg-muted/40 sm:border-l sm:border-t-0" onClick={() => navigate("/documents")}><Link2 className="h-4 w-4" /><span><span className="block text-xs text-muted-foreground">공식 문서 연결</span><strong className="tabular-nums">{data?.documentLinks || 0}건</strong></span></button>
        </section>

        <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" aria-label="종합 현황 모듈 찾기" placeholder="현황 모듈 찾기" value={search} onChange={(event) => setSearch(event.target.value)} /></div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredModules.map((module) => {
            const active = activeSet.has(module.code) || module.code === "SURVEY";
            const Icon = module.icon;
            const summary = data?.counts[module.countKey];
            return (
              <Card key={module.code} className={!active ? "opacity-50" : "transition-shadow hover:shadow-sm"}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${active ? "bg-muted" : "bg-muted/60"}`}>{active ? <Icon className="h-4 w-4" /> : <Lock className="h-4 w-4 text-muted-foreground" />}</div>
                    <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{module.label}</h2>{summary?.attention ? <Badge variant="outline" className="text-[10px] text-amber-700">확인 필요</Badge> : null}</div><p className="mt-1 text-lg font-semibold tabular-nums">{isLoading ? "-" : summary?.primary || "자료 없음"}</p><p className="text-xs text-muted-foreground">{summary?.detail || "집계 기준 확인 필요"}</p></div>
                  </div>
                  <Button size="sm" className="mt-3 w-full" disabled={!active} onClick={() => navigate(module.url)}>원장 열기</Button>
                  {!active ? <Badge variant="outline" className="mt-2 text-[10px]">모듈 비활성</Badge> : null}
                </CardContent>
              </Card>
            );
          })}
          {!isLoading && filteredModules.length === 0 ? (
            <div className="col-span-full border py-12 text-center text-sm text-muted-foreground">검색 조건에 맞는 현황 모듈이 없습니다.</div>
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  );
}
