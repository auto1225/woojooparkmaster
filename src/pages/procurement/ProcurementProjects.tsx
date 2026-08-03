import { useMemo, useState } from "react";
import { ArrowDownUp, Plus, RotateCcw, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getParkingLotTypeLabel, PARKING_LOT_TYPE_LABELS } from "@/lib/parking-lot-type-labels";
import { BID_STATUS_COLORS, BID_STATUS_LABELS, BID_TYPE_COLORS, BID_TYPE_LABELS, CONTRACT_TYPE_LABELS, formatOkWon } from "@/types/procurement";

const lotTypeFilters = ["offstreet", "multilevel", "onstreet", "vacant_lot", "underground"];
const active = ["draft", "rejected", "review", "announced", "bidding", "closed", "evaluation", "awarded"];
const ended = ["contracted"];
const stopped = ["cancelled", "failed", "rebid"];

export default function ProcurementProjects() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [bidType, setBidType] = useState("all");
  const [contractType, setContractType] = useState("all");
  const [lotType, setLotType] = useState("all");
  const [sort, setSort] = useState("created_desc");
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["bid-projects-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bid_projects").select("*,parking_lots(code,name,lot_type)").is("archived_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const { data: counts = {} } = useQuery({
    queryKey: ["bid-submission-counts"],
    queryFn: async () => {
      const rows = (await supabase.from("bid_submissions").select("bid_project_id")).data || [];
      return rows.reduce<Record<string, number>>((result, row) => ({ ...result, [row.bid_project_id]: (result[row.bid_project_id] || 0) + 1 }), {});
    },
  });
  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("ko-KR");
    return projects.filter((project: any) => {
      if (tab === "active" && !active.includes(project.status)) return false;
      if (tab === "ended" && !ended.includes(project.status)) return false;
      if (tab === "stopped" && !stopped.includes(project.status)) return false;
      if (bidType !== "all" && project.bid_type !== bidType) return false;
      if (contractType !== "all" && project.contract_type !== contractType) return false;
      if (lotType !== "all" && project.parking_lots?.lot_type !== lotType) return false;
      return !keyword || [project.bid_number, project.document_number, project.title, project.nara_ref, project.category, project.parking_lots?.code, project.parking_lots?.name].some((value) => String(value || "").toLocaleLowerCase("ko-KR").includes(keyword));
    }).sort((a: any, b: any) => {
      if (sort === "amount_desc") return Number(b.estimated_amount || 0) - Number(a.estimated_amount || 0);
      if (sort === "amount_asc") return Number(a.estimated_amount || 0) - Number(b.estimated_amount || 0);
      if (sort === "deadline_asc") return String(a.bid_deadline || "9999").localeCompare(String(b.bid_deadline || "9999"));
      if (sort === "title_asc") return String(a.title).localeCompare(String(b.title), "ko");
      return String(b.created_at).localeCompare(String(a.created_at));
    });
  }, [projects, tab, bidType, contractType, lotType, sort, search]);
  const reset = () => { setSearch(""); setBidType("all"); setContractType("all"); setLotType("all"); setSort("created_desc"); };

  return <DashboardLayout><div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">입찰 사업</h1><p className="text-sm text-muted-foreground">문서·예산·주차장을 연결한 입찰 진행 현황</p></div><Button onClick={() => navigate("/procurement/projects/new")}><Plus className="mr-1 h-4 w-4" />사업 등록</Button></div>
    <Tabs value={tab} onValueChange={setTab}><TabsList className="w-full justify-start overflow-x-auto md:w-auto"><TabsTrigger value="all">전체 {projects.length}</TabsTrigger><TabsTrigger value="active">진행 {projects.filter((p: any) => active.includes(p.status)).length}</TabsTrigger><TabsTrigger value="ended">계약 {projects.filter((p: any) => ended.includes(p.status)).length}</TabsTrigger><TabsTrigger value="stopped">중단 {projects.filter((p: any) => stopped.includes(p.status)).length}</TabsTrigger></TabsList></Tabs>
    <div className="grid gap-2 border bg-card p-3 md:grid-cols-[minmax(240px,1fr)_150px_150px_130px_170px_auto]">
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="사업·입찰·문서·나라장터·주차장 찾기" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <Select value={bidType} onValueChange={setBidType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 입찰방식</SelectItem>{Object.entries(BID_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
      <Select value={contractType} onValueChange={setContractType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 계약유형</SelectItem>{Object.entries(CONTRACT_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
      <Select value={lotType} onValueChange={setLotType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 형태</SelectItem>{lotTypeFilters.map((key) => <SelectItem key={key} value={key}>{PARKING_LOT_TYPE_LABELS[key]}</SelectItem>)}</SelectContent></Select>
      <Select value={sort} onValueChange={setSort}><SelectTrigger><ArrowDownUp className="mr-1 h-4 w-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="created_desc">최근 등록순</SelectItem><SelectItem value="deadline_asc">마감 임박순</SelectItem><SelectItem value="amount_desc">금액 높은순</SelectItem><SelectItem value="amount_asc">금액 낮은순</SelectItem><SelectItem value="title_asc">사업명순</SelectItem></SelectContent></Select>
      <Button variant="ghost" size="icon" title="조건 초기화" onClick={reset}><RotateCcw className="h-4 w-4" /></Button>
    </div>
    <p className="text-sm text-muted-foreground">조회 {filtered.length}건{isLoading ? " · 불러오는 중" : ""}</p>
    <div className="grid gap-3 md:hidden">{filtered.map((project: any) => <Card key={project.id} className="cursor-pointer" onClick={() => navigate(`/procurement/projects/${project.id}`)}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-mono text-xs text-muted-foreground">{project.bid_number}</p><p className="font-semibold">{project.title}</p></div><Badge className={BID_STATUS_COLORS[project.status]}>{BID_STATUS_LABELS[project.status] || project.status}</Badge></div><div className="flex flex-wrap gap-1"><Badge variant="outline">{project.parking_lots?.name || "주차장 미연결"}</Badge><Badge variant="outline">{getParkingLotTypeLabel(project.parking_lots?.lot_type)}</Badge><Badge variant="outline">{CONTRACT_TYPE_LABELS[project.contract_type] || project.contract_type}</Badge></div><div className="grid grid-cols-2 gap-2 text-sm"><span>추정 {formatOkWon(project.estimated_amount)}</span><span>참여 {counts[project.id] || 0}개사</span><span className="col-span-2 truncate text-muted-foreground">문서 {project.document_number || "미연결"}</span></div></CardContent></Card>)}</div>
    <Card className="hidden md:block"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>입찰번호 / 문서번호</TableHead><TableHead>사업·주차장</TableHead><TableHead>방식·유형</TableHead><TableHead className="text-right">추정가격</TableHead><TableHead>마감</TableHead><TableHead className="text-center">참여</TableHead><TableHead>상태</TableHead></TableRow></TableHeader><TableBody>{filtered.map((project: any) => <TableRow key={project.id} className="cursor-pointer" onClick={() => navigate(`/procurement/projects/${project.id}`)}><TableCell><p className="font-mono text-sm">{project.bid_number}</p><p className="max-w-52 truncate text-xs text-muted-foreground">{project.document_number || "문서 미연결"}</p></TableCell><TableCell><p className="max-w-64 truncate font-medium">{project.title}</p><p className="text-xs text-muted-foreground">{project.parking_lots?.name || "-"} · {getParkingLotTypeLabel(project.parking_lots?.lot_type)}</p></TableCell><TableCell><div className="flex gap-1"><Badge className={`${BID_TYPE_COLORS[project.bid_type]} text-[10px]`}>{BID_TYPE_LABELS[project.bid_type]}</Badge><Badge variant="outline" className="text-[10px]">{CONTRACT_TYPE_LABELS[project.contract_type] || project.contract_type}</Badge></div></TableCell><TableCell className="text-right">{formatOkWon(project.estimated_amount)}</TableCell><TableCell className="whitespace-nowrap text-sm">{project.bid_deadline ? new Date(project.bid_deadline).toLocaleDateString("ko-KR") : "-"}</TableCell><TableCell className="text-center">{counts[project.id] || 0}</TableCell><TableCell><Badge className={BID_STATUS_COLORS[project.status]}>{BID_STATUS_LABELS[project.status] || project.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div>{!filtered.length && <p className="py-14 text-center text-muted-foreground">조건에 맞는 입찰사업이 없습니다.</p>}</CardContent></Card>
  </div></DashboardLayout>;
}
