import { useMemo, useState } from "react";
import { ArrowDownUp, Plus, RotateCcw, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getParkingLotTypeLabel, PARKING_LOT_TYPE_LABELS } from "@/lib/parking-lot-type-labels";
import { formatServiceAmount, PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS, SERVICE_TYPE_LABELS } from "@/types/service";

const tabs = {
  all: [] as string[], active: ["preparing","in_progress","suspended"], inspect: ["inspection","completed"],
  warranty: ["warranty"], closed: ["closed","terminated"],
};
const lotTypes = ["offstreet","multilevel","onstreet","vacant_lot","underground"];

export default function ServiceProjects() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canCreate = Boolean(profile && ["admin","manager","editor"].includes(profile.role));
  const [tab,setTab] = useState("all");
  const [search,setSearch] = useState("");
  const [typeFilter,setTypeFilter] = useState("all");
  const [lotTypeFilter,setLotTypeFilter] = useState("all");
  const [sort,setSort] = useState("deadline_asc");
  const { data:projects=[],isLoading } = useQuery({ queryKey:["service-projects"],queryFn:async()=>{
    const {data,error}=await supabase.from("service_projects").select("*,parking_lots(code,name,lot_type),supervisor:profiles!service_projects_supervisor_id_fkey(name)").is("archived_at",null).order("created_at",{ascending:false});
    if(error) throw error; return data||[];
  }});
  const filtered=useMemo(()=>{
    const keyword=search.trim().toLocaleLowerCase("ko-KR");
    return projects.filter((project:any)=>{
      if(tab!=="all"&&!tabs[tab as keyof typeof tabs].includes(project.status)) return false;
      if(typeFilter!=="all"&&project.service_type!==typeFilter) return false;
      if(lotTypeFilter!=="all"&&project.parking_lots?.lot_type!==lotTypeFilter) return false;
      return !keyword||[project.project_number,project.document_number,project.title,project.contractor_name,project.contractor_manager,project.contractor_manager_phone,project.parking_lots?.code,project.parking_lots?.name,project.supervisor?.name].some((value)=>String(value||"").toLocaleLowerCase("ko-KR").includes(keyword));
    }).sort((a:any,b:any)=>{
      if(sort==="created_desc") return String(b.created_at).localeCompare(String(a.created_at));
      if(sort==="amount_desc") return Number(b.total_amount||0)-Number(a.total_amount||0);
      if(sort==="progress_desc") return Number(b.progress_pct||0)-Number(a.progress_pct||0);
      if(sort==="title_asc") return String(a.title).localeCompare(String(b.title),"ko");
      return String(a.extended_end_date||a.end_date||"9999").localeCompare(String(b.extended_end_date||b.end_date||"9999"));
    });
  },[projects,tab,search,typeFilter,lotTypeFilter,sort]);
  const reset=()=>{setSearch("");setTypeFilter("all");setLotTypeFilter("all");setSort("deadline_asc");};
  const tabCount=(key:keyof typeof tabs)=>key==="all"?projects.length:projects.filter((project:any)=>tabs[key].includes(project.status)).length;

  return <DashboardLayout><div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold">용역사업 관리</h1><p className="text-sm text-muted-foreground">계약부터 검사·지급·하자보증까지 문서번호로 추적합니다.</p></div>{canCreate&&<Button onClick={()=>navigate("/service/projects/new")}><Plus className="mr-1 h-4 w-4" />사업 등록</Button>}</div>
    <Tabs value={tab} onValueChange={setTab}><TabsList className="w-full justify-start overflow-x-auto md:w-auto"><TabsTrigger value="all">전체 {tabCount("all")}</TabsTrigger><TabsTrigger value="active">진행 {tabCount("active")}</TabsTrigger><TabsTrigger value="inspect">검사·완료 {tabCount("inspect")}</TabsTrigger><TabsTrigger value="warranty">하자 {tabCount("warranty")}</TabsTrigger><TabsTrigger value="closed">종결 {tabCount("closed")}</TabsTrigger></TabsList></Tabs>
    <div className="grid gap-2 border bg-card p-3 md:grid-cols-[minmax(240px,1fr)_150px_140px_170px_auto]"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="사업·문서·업체·담당자·주차장 찾기" value={search} onChange={(event)=>setSearch(event.target.value)} /></div><Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 유형</SelectItem>{Object.entries(SERVICE_TYPE_LABELS).map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select><Select value={lotTypeFilter} onValueChange={setLotTypeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 형태</SelectItem>{lotTypes.map((key)=><SelectItem key={key} value={key}>{PARKING_LOT_TYPE_LABELS[key]}</SelectItem>)}</SelectContent></Select><Select value={sort} onValueChange={setSort}><SelectTrigger><ArrowDownUp className="mr-1 h-4 w-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="deadline_asc">종료 임박순</SelectItem><SelectItem value="created_desc">최근 등록순</SelectItem><SelectItem value="amount_desc">금액 높은순</SelectItem><SelectItem value="progress_desc">진척 높은순</SelectItem><SelectItem value="title_asc">사업명순</SelectItem></SelectContent></Select><Button variant="ghost" size="icon" title="조건 초기화" onClick={reset}><RotateCcw className="h-4 w-4" /></Button></div>
    <p className="text-sm text-muted-foreground">조회 {filtered.length}건{isLoading?" · 불러오는 중":""}</p>
    <div className="grid gap-3 md:hidden">{filtered.map((project:any)=><Card key={project.id} className="cursor-pointer" onClick={()=>navigate(`/service/projects/${project.id}`)}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-mono text-xs text-muted-foreground">{project.project_number}</p><p className="font-semibold">{project.title}</p></div><Badge className={PROJECT_STATUS_COLORS[project.status]}>{PROJECT_STATUS_LABELS[project.status]||project.status}</Badge></div><div className="flex flex-wrap gap-1"><Badge variant="outline">{project.parking_lots?.name||"주차장 미연결"}</Badge><Badge variant="outline">{getParkingLotTypeLabel(project.parking_lots?.lot_type)}</Badge><Badge variant="outline">{SERVICE_TYPE_LABELS[project.service_type]||project.service_type}</Badge></div><p className="truncate text-xs text-muted-foreground">문서 {project.document_number||"미연결"}</p><div><div className="mb-1 flex justify-between text-xs"><span>진척 {Number(project.progress_pct||0)}%</span><span>지급 {Number(project.payment_rate||0)}%</span></div><Progress value={Number(project.progress_pct||0)} className="h-2" /></div><div className="grid grid-cols-2 gap-2 text-sm"><span>{project.contractor_name}</span><span className="text-right">{formatServiceAmount(project.total_amount)}원</span><span>{project.contractor_manager||"담당자 미등록"}</span><span className="text-right">{project.extended_end_date||project.end_date}</span></div></CardContent></Card>)}</div>
    <Card className="hidden md:block"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>사업·문서번호</TableHead><TableHead>사업·주차장</TableHead><TableHead>업체·연락망</TableHead><TableHead className="text-right">총액</TableHead><TableHead>기간</TableHead><TableHead>진척·지급</TableHead><TableHead>상태</TableHead><TableHead>감독관</TableHead></TableRow></TableHeader><TableBody>{filtered.map((project:any)=><TableRow key={project.id} className="cursor-pointer" onClick={()=>navigate(`/service/projects/${project.id}`)}><TableCell><p className="font-mono text-sm">{project.project_number}</p><p className="max-w-52 truncate text-xs text-muted-foreground">{project.document_number||"문서 미연결"}</p></TableCell><TableCell><p className="max-w-64 truncate font-medium">{project.title}</p><p className="text-xs text-muted-foreground">{project.parking_lots?.name||"-"} · {getParkingLotTypeLabel(project.parking_lots?.lot_type)}</p></TableCell><TableCell><p>{project.contractor_name}</p><p className="text-xs text-muted-foreground">{project.contractor_manager||"담당자 미등록"} · {project.contractor_manager_phone||project.contractor_phone||"연락처 미등록"}</p></TableCell><TableCell className="text-right">{formatServiceAmount(project.total_amount)}원</TableCell><TableCell className="whitespace-nowrap text-sm">{project.start_date} ~ {project.extended_end_date||project.end_date}</TableCell><TableCell className="min-w-36"><div className="mb-1 flex justify-between text-xs"><span>{Number(project.progress_pct||0)}%</span><span>지급 {Number(project.payment_rate||0)}%</span></div><Progress value={Number(project.progress_pct||0)} className="h-2" /></TableCell><TableCell><Badge className={PROJECT_STATUS_COLORS[project.status]}>{PROJECT_STATUS_LABELS[project.status]||project.status}</Badge></TableCell><TableCell>{project.supervisor?.name||"-"}</TableCell></TableRow>)}{!filtered.length&&<TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">조건에 맞는 용역사업이 없습니다.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
  </div></DashboardLayout>;
}
