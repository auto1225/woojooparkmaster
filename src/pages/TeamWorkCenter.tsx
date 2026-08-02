import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, Banknote, BriefcaseBusiness, Building2, CheckCircle2, ClipboardCheck, Eye, FileText, FileWarning, Pencil, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { archiveTeamWorkRecord, createTeamWorkRecord, getTeamWorkRecordPath, isTeamWorkOverdue, listTeamWorkRecords, normalizeTeamWorkDueDate, sortTeamWorkRecords, TEAM_WORK_DOCUMENT_MODULE, updateTeamWorkRecord, updateTeamWorkStatus, type TeamWorkSortDirection, type TeamWorkSortKey } from "@/lib/team-work-registry";
import { TEAM_RECORD_LABELS, TEAM_STATUS_LABELS, type TeamRecordType, type TeamWorkInput, type TeamWorkPriority, type TeamWorkRecord, type TeamWorkStatus } from "@/types/team-work";

const TYPES: TeamRecordType[] = ["work_order", "revenue_close", "receivable_discount", "workforce", "capital_project", "compliance"];
const TYPE_ICONS = { work_order: BriefcaseBusiness, revenue_close: Banknote, receivable_discount: FileText, workforce: Users, capital_project: Building2, compliance: ClipboardCheck };
const CATEGORY_OPTIONS: Record<TeamRecordType, string[]> = {
  work_order: ["운영총괄", "시설·보안", "시설보수", "관제장비", "환경정비", "무단방치차량", "민원조치", "기타"],
  revenue_close: ["일일마감", "현금인계", "카드·세입정산", "현금·계좌정산", "계좌입금", "정산차이"],
  receivable_discount: ["미납관리", "월정기권", "즉시감면", "반환관리", "시간할인권"],
  workforce: ["채용·복무", "근무배치", "출퇴근", "급여기초", "채용", "압류", "피복", "교육"],
  capital_project: ["확충계획", "부지매입", "복층화", "유료화", "스마트관제", "신규조성", "공유재산·지방재정"],
  compliance: ["환경·법정점검", "전기", "소방", "승강기", "영상정보", "화장실", "불법촬영", "환경"],
};
const EXTRA_FIELDS: Record<TeamRecordType, Array<{ key: string; label: string; type?: string; placeholder?: string }>> = {
  work_order: [{ key: "asset", label: "대상 시설·장비" }, { key: "symptom", label: "조치 내용" }, { key: "vendor", label: "처리 업체" }, { key: "evidence", label: "완료 근거" }],
  revenue_close: [{ key: "businessDate", label: "영업일", type: "date" }, { key: "systemAmount", label: "시스템 금액", type: "number" }, { key: "cashAmount", label: "현금", type: "number" }, { key: "cardAmount", label: "카드", type: "number" }, { key: "accountAmount", label: "계좌", type: "number" }, { key: "handoverTo", label: "현금 인수자" }, { key: "sealNumber", label: "봉인번호" }],
  receivable_discount: [{ key: "vehicleNumber", label: "차량번호" }, { key: "applicant", label: "대상자·신청인" }, { key: "requestedAmount", label: "처리 금액", type: "number" }, { key: "evidence", label: "증빙" }, { key: "action", label: "처리 결과" }],
  workforce: [{ key: "staffName", label: "대상 직원" }, { key: "periodStart", label: "시작일", type: "date" }, { key: "periodEnd", label: "종료일", type: "date" }, { key: "workHours", label: "근무시간", type: "number" }, { key: "baseAmount", label: "급여 기초액", type: "number" }, { key: "note", label: "특이사항" }],
  capital_project: [{ key: "site", label: "사업 위치" }, { key: "stage", label: "현재 절차" }, { key: "budget", label: "사업비", type: "number" }, { key: "gateOwner", label: "절차 담당" }, { key: "nextGate", label: "다음 절차" }],
  compliance: [{ key: "inspectionDate", label: "점검일", type: "date" }, { key: "result", label: "점검 결과", placeholder: "적합 / 시정필요" }, { key: "correctiveDeadline", label: "시정기한", type: "date" }, { key: "vendor", label: "점검 업체" }, { key: "evidence", label: "증빙·사진 설명" }],
};
const PRIORITY_LABELS: Record<TeamWorkPriority, string> = { urgent: "긴급", high: "높음", normal: "보통", low: "낮음" };
const NEXT_STATUS: Partial<Record<TeamWorkStatus, TeamWorkStatus>> = { registered: "assigned", assigned: "in_progress", in_progress: "review", review: "completed", on_hold: "in_progress" };
const NEXT_ACTION_LABELS: Partial<Record<TeamWorkStatus, string>> = { registered: "담당 지정", assigned: "처리 시작", in_progress: "검토 요청", review: "완료 처리", on_hold: "처리 재개" };
type WorkFilter = "all" | "overdue" | "review" | "unassigned" | "missing_document";

function currency(value: number) { return new Intl.NumberFormat("ko-KR").format(value); }

function recordToInput(record: TeamWorkRecord, documentNumber = record.documentNumber || ""): TeamWorkInput {
  return {
    recordType: record.recordType,
    team: record.team,
    title: record.title,
    category: record.category,
    parkingLot: record.parkingLot || "",
    ownerName: record.ownerName || "",
    priority: record.priority,
    dueDate: record.dueDate || "",
    amount: record.amount || 0,
    documentNumber,
    payload: record.payload,
  };
}

function RecordDetailDialog({ record, onOpenChange, onEdit, onArchive }: { record: TeamWorkRecord | null; onOpenChange: (open: boolean) => void; onEdit: (record: TeamWorkRecord) => void; onArchive: (record: TeamWorkRecord) => void }) {
  const queryClient = useQueryClient();
  if (!record) return null;
  const common = [
    ["담당 팀", record.team === "operations" ? "운영팀" : "시설팀"], ["업무 분류", record.category], ["주차장·사업장", record.parkingLot || "-"], ["담당자", record.ownerName || "미지정"], ["우선순위", PRIORITY_LABELS[record.priority]], ["상태", TEAM_STATUS_LABELS[record.status]], ["처리기한", record.dueDate || "-"], ["관련 금액", record.amount ? `${currency(record.amount)}원` : "-"], ["관련 문서번호", record.documentNumber || "-"],
  ];
  return <Dialog open onOpenChange={onOpenChange}><DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{record.title}</DialogTitle><DialogDescription>{record.recordNumber} · {TEAM_RECORD_LABELS[record.recordType]}</DialogDescription></DialogHeader><dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{common.map(([label, value]) => <div key={label} className={label === "관련 문서번호" ? "sm:col-span-2" : ""}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}{EXTRA_FIELDS[record.recordType].map((field) => <div key={field.key}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="mt-1 text-sm font-medium">{record.payload[field.key] === null || record.payload[field.key] === "" ? "-" : String(record.payload[field.key] ?? "-")}</dd></div>)}</dl><DocumentLinksPanel module={TEAM_WORK_DOCUMENT_MODULE} recordId={record.id} recordPath={getTeamWorkRecordPath(record)} recordTitle={record.title} initialDocumentNumber={record.documentNumber || ""} onLinked={async (document) => { await updateTeamWorkRecord(record, recordToInput(record, document.documentNumber)); await queryClient.invalidateQueries({ queryKey: ["team-work"] }); }} /><DialogFooter className="gap-2"><Button variant="outline" className="text-destructive" onClick={() => onArchive(record)}><Archive className="mr-1.5 h-4 w-4" />보관</Button><Button variant="outline" onClick={() => onEdit(record)}><Pencil className="mr-1.5 h-4 w-4" />수정</Button><Button onClick={() => onOpenChange(false)}>확인</Button></DialogFooter></DialogContent></Dialog>;
}

function RecordDialog({ open, onOpenChange, initialType, initialTeam = "operations", initialCategory, editing }: { open: boolean; onOpenChange: (open: boolean) => void; initialType: TeamRecordType; initialTeam?: "operations" | "facilities"; initialCategory?: string; editing?: TeamWorkRecord | null }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<TeamRecordType>(editing?.recordType || initialType);
  const [form, setForm] = useState<Record<string, string>>(() => editing ? {
    team: editing.team,
    title: editing.title,
    category: editing.category,
    parkingLot: editing.parkingLot || "",
    ownerName: editing.ownerName || "",
    priority: editing.priority,
    dueDate: editing.dueDate || "",
    amount: String(editing.amount || ""),
    documentNumber: editing.documentNumber || "",
    ...Object.fromEntries(Object.entries(editing.payload).map(([key, value]) => [key, value == null ? "" : String(value)])),
  } : { team: initialTeam, priority: "normal", category: initialCategory || CATEGORY_OPTIONS[initialType][0] });
  const [dueDateError, setDueDateError] = useState("");
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = Object.fromEntries(EXTRA_FIELDS[type].map(({ key, type: fieldType }) => [key, fieldType === "number" ? Number(form[key] || 0) : form[key] || null]));
      const dueDate = normalizeTeamWorkDueDate(form.dueDate);
      const input: TeamWorkInput = { recordType: type, team: (form.team || "operations") as "operations" | "facilities", title: form.title || "", category: form.category || CATEGORY_OPTIONS[type][0], parkingLot: form.parkingLot, ownerName: form.ownerName, priority: (form.priority || "normal") as TeamWorkPriority, dueDate: dueDate || undefined, amount: Number(form.amount || 0), documentNumber: form.documentNumber, payload };
      return editing ? updateTeamWorkRecord(editing, input) : createTeamWorkRecord(input);
    },
    onSuccess: async (record) => { await queryClient.invalidateQueries({ queryKey: ["team-work"] }); toast.success(`${record.recordNumber} ${editing ? "수정" : "등록"} 완료`); setForm({ team: "operations", priority: "normal" }); onOpenChange(false); },
    onError: (error: Error) => { setDueDateError(error.message.includes("처리기한") ? error.message : ""); toast.error(error.message); },
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
    <DialogHeader><DialogTitle>차량관리과 업무 {editing ? "수정" : "등록"}</DialogTitle><DialogDescription>업무 이력과 관련 문서를 함께 관리합니다.</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="work-type">업무 유형</Label><Select value={type} onValueChange={(value) => { setType(value as TeamRecordType); set("category", CATEGORY_OPTIONS[value as TeamRecordType][0]); }}><SelectTrigger id="work-type"><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((item) => <SelectItem key={item} value={item}>{TEAM_RECORD_LABELS[item]}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="work-team">담당 팀</Label><Select value={form.team || "operations"} onValueChange={(value) => set("team", value)}><SelectTrigger id="work-team"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="operations">운영팀</SelectItem><SelectItem value="facilities">시설팀</SelectItem></SelectContent></Select></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="work-title">업무 제목 *</Label><Input id="work-title" value={form.title || ""} onChange={(e) => set("title", e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="work-category">업무 분류</Label><Select value={form.category || CATEGORY_OPTIONS[type][0]} onValueChange={(value) => set("category", value)}><SelectTrigger id="work-category"><SelectValue /></SelectTrigger><SelectContent>{CATEGORY_OPTIONS[type].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="work-lot">주차장·사업장</Label><Input id="work-lot" value={form.parkingLot || ""} onChange={(e) => set("parkingLot", e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="work-owner">담당자</Label><Input id="work-owner" value={form.ownerName || ""} onChange={(e) => set("ownerName", e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="work-priority">우선순위</Label><Select value={form.priority || "normal"} onValueChange={(value) => set("priority", value)}><SelectTrigger id="work-priority"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="work-due">처리기한</Label><Input id="work-due" type="date" value={form.dueDate || ""} aria-invalid={Boolean(dueDateError)} onInput={(e) => { set("dueDate", e.currentTarget.value); setDueDateError(""); }} onChange={(e) => { set("dueDate", e.target.value); setDueDateError(""); }} />{dueDateError && <p className="text-xs text-destructive">{dueDateError}</p>}</div>
      <div className="space-y-2"><Label htmlFor="work-amount">관련 금액</Label><Input id="work-amount" type="number" min="0" value={form.amount || ""} onChange={(e) => set("amount", e.target.value)} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="work-document">관련 문서번호</Label><Input id="work-document" placeholder="예: 제주시청-차량관리과운영팀-2026-0142" value={form.documentNumber || ""} onChange={(e) => set("documentNumber", e.target.value)} /></div>
      {EXTRA_FIELDS[type].map((field) => <div key={field.key} className="space-y-2"><Label htmlFor={`extra-${field.key}`}>{field.label}</Label><Input id={`extra-${field.key}`} type={field.type || "text"} placeholder={field.placeholder} value={form[field.key] || ""} onChange={(e) => set(field.key, e.target.value)} /></div>)}
    </div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={mutation.isPending || !form.title?.trim()} onClick={() => mutation.mutate()}>{mutation.isPending ? "저장 중..." : editing ? "수정 저장" : "등록"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export default function TeamWorkCenter() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as TeamRecordType | null;
  const requestedTeam = searchParams.get("team") as "operations" | "facilities" | null;
  const requestedCategory = searchParams.get("category") || undefined;
  const requestedNew = searchParams.get("new") === "1";
  const requestedWork = searchParams.get("work");
  const [tab, setTab] = useState<"dashboard" | TeamRecordType>(requestedTab && TYPES.includes(requestedTab) ? requestedTab : "dashboard");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sortKey, setSortKey] = useState<TeamWorkSortKey>("dueDate");
  const [sortDirection, setSortDirection] = useState<TeamWorkSortDirection>("asc");
  const [workFilter, setWorkFilter] = useState<WorkFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<TeamWorkRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<TeamWorkRecord | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TeamWorkRecord | null>(null);
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: ["team-work"], queryFn: () => listTeamWorkRecords() });
  useEffect(() => {
    if (requestedTab && TYPES.includes(requestedTab)) setTab(requestedTab);
  }, [requestedTab]);
  useEffect(() => {
    if (requestedNew) setDialogOpen(true);
  }, [requestedNew]);
  useEffect(() => {
    if (requestedWork && data.length) setSelectedRecord(data.find((record) => record.id === requestedWork) || null);
  }, [data, requestedWork]);
  const changeTab = (value: "dashboard" | TeamRecordType) => {
    setTab(value);
    if (value === "dashboard") setSearchParams({});
    else setSearchParams({ tab: value });
  };
  const filtered = useMemo(() => data.filter((record) => (tab === "dashboard" || record.recordType === tab) && (!requestedTeam || record.team === requestedTeam) && (status === "all" || record.status === status) && `${record.recordNumber} ${record.title} ${record.ownerName || ""} ${record.documentNumber || ""}`.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko"))), [data, requestedTeam, search, status, tab]);
  const transition = useMutation({ mutationFn: ({ record, next }: { record: TeamWorkRecord; next: TeamWorkStatus }) => updateTeamWorkStatus(record, next), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["team-work"] }); toast.success("업무 상태를 변경했습니다."); }, onError: (error: Error) => toast.error(error.message) });
  const archiveMutation = useMutation({
    mutationFn: archiveTeamWorkRecord,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["team-work"] }); setArchiveTarget(null); toast.success("업무를 보관했습니다."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const openCount = data.filter((r) => r.status !== "completed").length;
  const overdueCount = data.filter(isTeamWorkOverdue).length;
  const reviewCount = data.filter((r) => r.status === "review").length;
  const unassignedCount = data.filter((r) => r.status !== "completed" && !r.ownerName).length;
  const missingDocumentCount = data.filter((r) => r.status !== "completed" && !r.documentNumber).length;
  const dashboardRecords = filtered.filter((record) => record.status !== "completed").filter((record) => {
    if (workFilter === "overdue") return isTeamWorkOverdue(record);
    if (workFilter === "review") return record.status === "review";
    if (workFilter === "unassigned") return !record.ownerName;
    if (workFilter === "missing_document") return !record.documentNumber;
    return true;
  }).sort((a, b) => Number(isTeamWorkOverdue(b)) - Number(isTeamWorkOverdue(a)) || Number(b.priority === "urgent") - Number(a.priority === "urgent") || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const visible = sortTeamWorkRecords(tab === "dashboard" ? dashboardRecords : filtered, sortKey, sortDirection);

  return <DashboardLayout><div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">차량관리과 팀 업무</h1><p className="mt-1 text-sm text-muted-foreground">운영팀·시설팀 업무를 문서번호와 함께 관리합니다.</p></div><Button onClick={() => { setEditingRecord(null); setDialogOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />업무 등록</Button></div>
    <Tabs value={tab} onValueChange={(value) => changeTab(value as typeof tab)}><TabsList className="h-auto w-full justify-start overflow-x-auto rounded-md bg-muted p-1"><TabsTrigger value="dashboard">상황판</TabsTrigger>{TYPES.map((type) => <TabsTrigger key={type} value={type}>{TEAM_RECORD_LABELS[type]}</TabsTrigger>)}</TabsList></Tabs>
    {tab === "dashboard" && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
      ["전체 진행", openCount, BriefcaseBusiness, "text-blue-600", "all"], ["기한 초과", overdueCount, AlertTriangle, "text-red-600", "overdue"], ["검토 대기", reviewCount, ClipboardCheck, "text-amber-600", "review"], ["담당 미지정", unassignedCount, Users, "text-slate-600", "unassigned"], ["문서 미연결", missingDocumentCount, FileWarning, "text-orange-600", "missing_document"],
    ].map(([label, count, Icon, color, filter]) => <button type="button" key={String(label)} onClick={() => setWorkFilter(filter as WorkFilter)} className={`border bg-card p-4 text-left hover:border-primary/50 ${workFilter === filter ? "border-primary ring-1 ring-primary/20" : ""}`}><span className="flex items-center justify-between"><span><span className="block text-sm text-muted-foreground">{String(label)}</span><span className="mt-1 block text-2xl font-bold">{String(count)}건</span></span><Icon className={`h-5 w-5 ${color}`} /></span></button>)}</div>}
    {tab === "dashboard" && <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{TYPES.map((type) => { const Icon = TYPE_ICONS[type]; const count = data.filter((r) => r.recordType === type && r.status !== "completed").length; return <button key={type} onClick={() => changeTab(type)} className="flex items-center gap-3 rounded-md border bg-card p-3 text-left hover:border-primary/40"><Icon className="h-4 w-4 text-muted-foreground" /><span className="min-w-0"><span className="block truncate text-xs text-muted-foreground">{TEAM_RECORD_LABELS[type]}</span><span className="font-semibold">{count}건</span></span></button>; })}</div>}
    <Card><CardHeader className="border-b p-4"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">{tab === "dashboard" ? ({ all: "오늘 처리할 전체 업무", overdue: "기한이 지난 업무", review: "검토가 필요한 업무", unassigned: "담당자를 지정할 업무", missing_document: "문서를 연결할 업무" } as Record<WorkFilter, string>)[workFilter] : `${TEAM_RECORD_LABELS[tab]} 목록`}</CardTitle><div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="업무 검색" className="w-64 pl-9" placeholder="번호, 제목, 담당자, 문서번호" value={search} onChange={(e) => setSearch(e.target.value)} /></div><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="상태 필터" className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{Object.entries(TEAM_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Select value={sortKey} onValueChange={(value) => setSortKey(value as TeamWorkSortKey)}><SelectTrigger aria-label="정렬 기준" className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dueDate">처리기한</SelectItem><SelectItem value="priority">우선순위</SelectItem><SelectItem value="status">처리상태</SelectItem><SelectItem value="updatedAt">최근 수정일</SelectItem><SelectItem value="documentNumber">문서번호</SelectItem></SelectContent></Select><Select value={sortDirection} onValueChange={(value) => setSortDirection(value as TeamWorkSortDirection)}><SelectTrigger aria-label="정렬 방향" className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="asc">오름차순</SelectItem><SelectItem value="desc">내림차순</SelectItem></SelectContent></Select></div></div></CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>업무번호</TableHead><TableHead>업무 내용</TableHead><TableHead>팀·담당자</TableHead><TableHead>기한</TableHead><TableHead>문서번호</TableHead><TableHead className="text-right">금액</TableHead><TableHead>상태</TableHead><TableHead className="text-right">처리</TableHead></TableRow></TableHeader><TableBody>
        {isLoading ? <TableRow><TableCell colSpan={8} className="h-32 text-center">불러오는 중...</TableCell></TableRow> : isError ? <TableRow><TableCell colSpan={8} className="h-32 text-center"><p className="mb-2 text-destructive">업무를 불러오지 못했습니다.</p><Button variant="outline" size="sm" onClick={() => refetch()}>다시 시도</Button></TableCell></TableRow> : visible.length === 0 ? <TableRow><TableCell colSpan={8} className="h-40 text-center text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 h-7 w-7" />표시할 업무가 없습니다.</TableCell></TableRow> : visible.map((record) => { const next = NEXT_STATUS[record.status]; const advance = () => { if (next === "assigned" && !record.ownerName) { setEditingRecord(record); setDialogOpen(true); return; } if (next) transition.mutate({ record, next }); }; return <TableRow key={record.id} className={isTeamWorkOverdue(record) ? "bg-destructive/5" : ""}><TableCell className="font-mono text-xs">{record.recordNumber}</TableCell><TableCell><button type="button" className="text-left hover:underline" onClick={() => setSelectedRecord(record)}><span className="block font-medium">{record.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{record.category}{record.parkingLot ? ` · ${record.parkingLot}` : ""}</span></button></TableCell><TableCell><div>{record.team === "operations" ? "운영팀" : "시설팀"}</div><div className="text-xs text-muted-foreground">{record.ownerName || "미지정"}</div></TableCell><TableCell className={isTeamWorkOverdue(record) ? "font-semibold text-destructive" : ""}>{record.dueDate || "-"}</TableCell><TableCell className="max-w-48 truncate" title={record.documentNumber || undefined}>{record.documentNumber || <button type="button" className="text-xs font-medium text-orange-700 hover:underline" onClick={() => setSelectedRecord(record)}>문서 연결 필요</button>}</TableCell><TableCell className="text-right tabular-nums">{record.amount ? `${currency(record.amount)}원` : "-"}</TableCell><TableCell><Badge variant={record.status === "completed" ? "secondary" : isTeamWorkOverdue(record) ? "destructive" : "outline"}>{TEAM_STATUS_LABELS[record.status]}</Badge></TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="상세 보기" onClick={() => setSelectedRecord(record)}><Eye className="h-4 w-4" /></Button>{next && <Button size="sm" variant="outline" disabled={transition.isPending} onClick={advance}>{NEXT_ACTION_LABELS[record.status]}</Button>}</div></TableCell></TableRow>; })}
      </TableBody></Table></div></CardContent></Card>
    {tab !== "dashboard" && visible.length > 0 && <div className="flex flex-wrap justify-end gap-2">{visible.map((record) => <Button key={record.id} size="sm" variant="ghost" onClick={() => setSelectedRecord(record)}><Eye className="mr-1.5 h-4 w-4" />{record.recordNumber} 상세</Button>)}</div>}
  </div><RecordDetailDialog record={selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)} onEdit={(record) => { setSelectedRecord(null); setEditingRecord(record); setDialogOpen(true); }} onArchive={(record) => { setSelectedRecord(null); setArchiveTarget(record); }} /><RecordDialog key={`${dialogOpen}-${editingRecord?.id || "new"}-${tab}-${requestedTeam}-${requestedCategory}`} open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingRecord(null); }} initialType={tab === "dashboard" ? "work_order" : tab} initialTeam={requestedTeam || "operations"} initialCategory={requestedCategory} editing={editingRecord} /><AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>업무를 보관하시겠습니까?</AlertDialogTitle><AlertDialogDescription>{archiveTarget?.recordNumber} · {archiveTarget?.title}은 활성 목록에서 제외되며 변경 이력은 유지됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction disabled={archiveMutation.isPending} onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget)}>보관</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DashboardLayout>;
}
