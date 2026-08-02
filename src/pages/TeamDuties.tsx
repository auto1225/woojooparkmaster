import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowDown, ArrowUp, ArrowUpRight, ClipboardPlus, Database, Pencil, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DUTY_TEAM_LABELS, type DutyTeam, type TeamDuty } from "@/config/team-duty-catalog";
import { archiveTeamDuty, createTeamDuty, listTeamDuties, seedTeamDuties, updateTeamDuty, type TeamDutyInput } from "@/lib/team-duty-registry";
import { TEAM_RECORD_LABELS, type TeamRecordType } from "@/types/team-work";
import { useAuth } from "@/hooks/useAuth";
import { stableMultiSort, type SortDirection } from "@/lib/list-sorting";

const DESTINATIONS = [
  ["/ops/abandoned-vehicles", "방치차량 처리"], ["/ops/security-inspections", "관제·보안 점검"],
  ["/planning/procedures", "사업 행정절차"],
  ["/ops", "운영 현황"], ["/ops/staff", "인력 관리"], ["/ops/exemptions", "감면 관리"],
  ["/facility/maintenance", "유지보수"], ["/facility/safety", "안전점검"],
  ["/revenue", "수입 현황"], ["/revenue/daily", "일별 수입"], ["/revenue/reconcile", "위탁 대사"],
  ["/planning", "신설기획"], ["/planning/sites", "후보부지"], ["/planning/projects", "공사 관리"], ["/realtime", "실시간 정보"],
] as const;
const RECORD_TYPES = Object.keys(TEAM_RECORD_LABELS) as TeamRecordType[];

function emptyDuty(team: DutyTeam): TeamDutyInput {
  return { team, area: "", role: "주무관", phone: "", duties: [], recordType: "work_order", category: "", destination: "/team-work", destinationLabel: "팀 업무관리" };
}

function DutyDialog({ open, duty, team, onOpenChange }: { open: boolean; duty: TeamDuty | null; team: DutyTeam; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TeamDutyInput>(() => duty ? { ...duty } : emptyDuty(team));
  const [dutyText, setDutyText] = useState(() => duty?.duties.join("\n") || "");
  useEffect(() => {
    setForm(duty ? { ...duty } : emptyDuty(team));
    setDutyText(duty?.duties.join("\n") || "");
  }, [duty, open, team]);
  const mutation = useMutation({
    mutationFn: () => {
      const input = { ...form, duties: dutyText.split("\n").map((item) => item.trim()).filter(Boolean) };
      return duty ? updateTeamDuty(duty.id, input) : createTeamDuty(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-duties"] });
      toast.success(duty ? "업무분장을 수정했습니다." : "업무분장을 추가했습니다.");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const set = <K extends keyof TeamDutyInput>(key: K, value: TeamDutyInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const chooseDestination = (path: string) => {
    const destination = DESTINATIONS.find(([value]) => value === path);
    set("destination", path);
    if (destination) set("destinationLabel", destination[1]);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
    <DialogHeader><DialogTitle>{duty ? "업무분장 수정" : "업무분장 추가"}</DialogTitle><DialogDescription>담당업무와 실제 처리 화면을 관리합니다. 저장한 변경은 활동 이력에 남습니다.</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="duty-team">담당 팀</Label><Select value={form.team} onValueChange={(value) => set("team", value as DutyTeam)}><SelectTrigger id="duty-team"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="operations">운영팀</SelectItem><SelectItem value="facilities">시설팀</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="duty-area">업무영역 *</Label><Input id="duty-area" value={form.area} onChange={(event) => set("area", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="duty-role">담당 역할</Label><Input id="duty-role" value={form.role} onChange={(event) => set("role", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="duty-phone">전화번호</Label><Input id="duty-phone" placeholder="064-728-0000" value={form.phone} onChange={(event) => set("phone", event.target.value)} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="duty-items">세부 담당업무 * (한 줄에 한 건)</Label><Textarea id="duty-items" className="min-h-36" value={dutyText} onChange={(event) => setDutyText(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="duty-record-type">처리 유형</Label><Select value={form.recordType} onValueChange={(value) => set("recordType", value as TeamRecordType)}><SelectTrigger id="duty-record-type"><SelectValue /></SelectTrigger><SelectContent>{RECORD_TYPES.map((type) => <SelectItem key={type} value={type}>{TEAM_RECORD_LABELS[type]}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="duty-category">업무 분류</Label><Input id="duty-category" value={form.category} onChange={(event) => set("category", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="duty-destination">연결 메뉴</Label><Select value={form.destination} onValueChange={chooseDestination}><SelectTrigger id="duty-destination"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="/team-work">팀 업무관리</SelectItem>{DESTINATIONS.map(([path, label]) => <SelectItem key={path} value={path}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="duty-destination-label">메뉴 표시명</Label><Input id="duty-destination-label" value={form.destinationLabel} onChange={(event) => set("destinationLabel", event.target.value)} /></div>
    </div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={mutation.isPending || !form.area.trim() || !dutyText.trim()} onClick={() => mutation.mutate()}>{mutation.isPending ? "저장 중..." : "저장"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export default function TeamDuties() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [team, setTeam] = useState<DutyTeam>("operations");
  const [search, setSearch] = useState("");
  const [recordFilter, setRecordFilter] = useState("all");
  const [sortKey, setSortKey] = useState("area");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [secondarySortKey, setSecondarySortKey] = useState("role");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeamDuty | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TeamDuty | null>(null);
  const canManage = profile?.role === "admin";
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["team-duties"], queryFn: () => listTeamDuties() });
  const rows = useMemo(() => {
    const duties = data?.duties || [];
    const valueFor = (duty: TeamDuty, key: string): string | number => {
      if (key === "taskCount") return duty.duties.length;
      if (key === "destination") return duty.destinationLabel;
      if (key === "recordType") return TEAM_RECORD_LABELS[duty.recordType];
      return String(duty[key as keyof TeamDuty] ?? "");
    };
    const filtered = duties.filter((duty) => duty.team === team
      && (recordFilter === "all" || duty.recordType === recordFilter)
      && [duty.area, duty.role, duty.phone, duty.category, duty.destinationLabel, ...duty.duties].join(" ").toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko")));
    return stableMultiSort(filtered, [
      { value: (duty) => valueFor(duty, sortKey), direction: sortDirection },
      ...(secondarySortKey !== "none" && secondarySortKey !== sortKey ? [{ value: (duty: TeamDuty) => valueFor(duty, secondarySortKey), direction: "asc" as const }] : []),
    ]);
  }, [data?.duties, recordFilter, search, secondarySortKey, sortDirection, sortKey, team]);
  const taskCount = rows.reduce((sum, duty) => sum + duty.duties.length, 0);
  const seedMutation = useMutation({ mutationFn: seedTeamDuties, onSuccess: async (count) => { await queryClient.invalidateQueries({ queryKey: ["team-duties"] }); toast.success("기준 업무분장 " + count + "건을 관리대장에 저장했습니다."); }, onError: (error: Error) => toast.error(error.message) });
  const archiveMutation = useMutation({ mutationFn: archiveTeamDuty, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["team-duties"] }); toast.success("업무분장을 보관했습니다."); setArchiveTarget(null); }, onError: (error: Error) => toast.error(error.message) });

  return <DashboardLayout><div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">차량관리과 업무분장 관리</h1><p className="mt-1 text-sm text-muted-foreground">담당업무를 추가·수정·보관하고 실제 처리 화면과 연결합니다.</p></div>{canManage && <div className="flex gap-2">{data && !data.persisted && <Button variant="outline" disabled={seedMutation.isPending} onClick={() => seedMutation.mutate()}><Database className="mr-1.5 h-4 w-4" />기준업무 DB 저장</Button>}<Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />업무 추가</Button></div>}</div>
    {!data?.persisted && !isLoading && <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">현재 기준자료 미리보기입니다. <strong>기준업무 DB 저장</strong>을 실행하면 수정·추가·보관이 가능한 관리대장으로 전환됩니다.</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-y bg-card px-4 py-3"><Tabs value={team} onValueChange={(value) => setTeam(value as DutyTeam)}><TabsList className="rounded-md"><TabsTrigger value="operations">운영팀</TabsTrigger><TabsTrigger value="facilities">시설팀</TabsTrigger></TabsList></Tabs><div className="flex items-center gap-4 text-sm"><span className="flex items-center gap-1.5 text-muted-foreground"><Users className="h-4 w-4" />담당 {rows.length}개</span><span className="font-medium">세부업무 {taskCount}건</span></div></div>
    <div className="grid gap-2 rounded-md border bg-card p-3 md:grid-cols-[minmax(240px,1fr)_150px_150px_auto_150px]">
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="업무분장 검색" className="pl-9" placeholder="업무, 담당 역할, 전화번호 검색" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <Select value={recordFilter} onValueChange={setRecordFilter}><SelectTrigger aria-label="처리 유형 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 처리유형</SelectItem>{RECORD_TYPES.map((type) => <SelectItem key={type} value={type}>{TEAM_RECORD_LABELS[type]}</SelectItem>)}</SelectContent></Select>
      <Select value={sortKey} onValueChange={setSortKey}><SelectTrigger aria-label="1차 정렬 기준"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="area">업무영역순</SelectItem><SelectItem value="role">담당역할순</SelectItem><SelectItem value="phone">전화번호순</SelectItem><SelectItem value="recordType">처리유형순</SelectItem><SelectItem value="destination">연결메뉴순</SelectItem><SelectItem value="taskCount">세부업무수순</SelectItem></SelectContent></Select>
      <Button type="button" variant="outline" size="icon" aria-label="1차 정렬 방향" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")}>{sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</Button>
      <Select value={secondarySortKey} onValueChange={setSecondarySortKey}><SelectTrigger aria-label="2차 정렬 기준"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">2차 정렬 없음</SelectItem><SelectItem value="area">업무영역순</SelectItem><SelectItem value="role">담당역할순</SelectItem><SelectItem value="phone">전화번호순</SelectItem><SelectItem value="recordType">처리유형순</SelectItem><SelectItem value="destination">연결메뉴순</SelectItem><SelectItem value="taskCount">세부업무수순</SelectItem></SelectContent></Select>
    </div>
    <div className="overflow-hidden rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead className="w-36">업무영역</TableHead><TableHead>실제 담당업무</TableHead><TableHead className="w-36">담당</TableHead><TableHead className="w-32">연결 기능</TableHead><TableHead className="w-52 text-right">관리</TableHead></TableRow></TableHeader><TableBody>
      {isLoading ? <TableRow><TableCell colSpan={5} className="h-32 text-center">불러오는 중...</TableCell></TableRow> : isError ? <TableRow><TableCell colSpan={5} className="h-32 text-center"><Button variant="outline" onClick={() => refetch()}>다시 시도</Button></TableCell></TableRow> : rows.map((duty) => <TableRow key={duty.id}><TableCell className="align-top"><div className="font-semibold">{duty.area}</div><Badge variant="outline" className="mt-2">{TEAM_RECORD_LABELS[duty.recordType]}</Badge></TableCell><TableCell className="align-top"><ul className="space-y-1.5">{duty.duties.map((item) => <li key={item} className="text-sm before:mr-2 before:text-muted-foreground before:content-['•']">{item}</li>)}</ul></TableCell><TableCell className="align-top"><div className="text-sm font-medium">{duty.role}</div><a className="mt-1 block text-xs text-primary hover:underline" href={"tel:" + duty.phone}>{duty.phone}</a><div className="mt-1 text-xs text-muted-foreground">{DUTY_TEAM_LABELS[duty.team]}</div></TableCell><TableCell className="align-top"><Button variant="outline" size="sm" asChild><Link to={duty.destination}>{duty.destinationLabel}<ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button></TableCell><TableCell className="align-top"><div className="flex justify-end gap-1"><Button size="sm" asChild><Link to={"/team-work?tab=" + duty.recordType + "&team=" + duty.team + "&category=" + encodeURIComponent(duty.category) + "&new=1"}><ClipboardPlus className="mr-1.5 h-4 w-4" />등록</Link></Button>{canManage && data?.persisted && <><Button size="icon" variant="ghost" title="업무분장 수정" aria-label={duty.area + " 수정"} onClick={() => { setEditing(duty); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" title="업무분장 보관" aria-label={duty.area + " 보관"} onClick={() => setArchiveTarget(duty)}><Archive className="h-4 w-4" /></Button></>}</div></TableCell></TableRow>)}
      {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">검색 결과가 없습니다.</TableCell></TableRow>}
    </TableBody></Table></div>
  </div><DutyDialog open={dialogOpen} duty={editing} team={team} onOpenChange={setDialogOpen} /><AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>업무분장을 보관하시겠습니까?</AlertDialogTitle><AlertDialogDescription>{archiveTarget?.area} 항목은 목록에서 숨겨지며 변경 이력은 유지됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget)}>보관</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DashboardLayout>;
}
