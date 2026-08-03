import { Fragment, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Clock,
  Inbox,
  ListTree,
  MessageSquare,
  Plus,
  Repeat2,
  RotateCcw,
  Search,
  Timer,
  UserX,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  COMPLAINT_STATUS_COLORS,
  COMPLAINT_STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  getDDay,
  isComplaintOverdue,
  type Complaint,
} from "@/types/complaint";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";

type SortKey = "risk" | "received_at" | "due_date" | "priority" | "status" | "category" | "channel" | "lot" | "lot_type" | "assignee" | "title" | "repeat_count" | "satisfaction" | "closed_at" | "updated_at";
type GroupKey = "none" | "lot" | "lot_type" | "category" | "status" | "assignee" | "priority" | "channel";
type Direction = "asc" | "desc";

const CLOSED_STATUSES = ["closed"];
const DAY = 86_400_000;
const PRIORITY_ORDER: Record<string, number> = { low: 1, normal: 2, high: 3, urgent: 4 };
const STATUS_ORDER: Record<string, number> = { received: 1, assigned: 2, in_progress: 3, pending_external: 4, reopened: 5, responded: 6, closed: 7 };

const SORT_OPTIONS: Array<[SortKey, string]> = [
  ["risk", "업무 위험도"],
  ["received_at", "접수일"],
  ["due_date", "처리기한"],
  ["priority", "우선순위"],
  ["status", "처리상태"],
  ["category", "민원유형"],
  ["channel", "접수채널"],
  ["lot", "주차장"],
  ["lot_type", "주차장 형태"],
  ["assignee", "담당자"],
  ["title", "제목"],
  ["repeat_count", "반복횟수"],
  ["satisfaction", "만족도"],
  ["closed_at", "종결일"],
  ["updated_at", "최근수정"],
];

const GROUP_OPTIONS: Array<[GroupKey, string]> = [
  ["none", "묶지 않음"],
  ["lot", "주차장별"],
  ["lot_type", "주차장 형태별"],
  ["assignee", "담당자별"],
  ["status", "처리상태별"],
  ["priority", "우선순위별"],
  ["category", "민원유형별"],
  ["channel", "접수채널별"],
];

function normalized(value: unknown) {
  return String(value ?? "").toLocaleLowerCase("ko-KR");
}

function dateValue(value?: string | null, empty = Number.MAX_SAFE_INTEGER) {
  if (!value) return empty;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? empty : parsed;
}

function riskScore(complaint: Complaint) {
  if (CLOSED_STATUSES.includes(complaint.status)) return 0;
  return (complaint.priority === "urgent" ? 50 : complaint.priority === "high" ? 25 : 0)
    + (isComplaintOverdue(complaint) ? 40 : 0)
    + (!complaint.assigned_to ? 20 : 0)
    + (complaint.is_repeat ? 15 + Math.min(complaint.repeat_count || 0, 10) : 0)
    + (complaint.status === "reopened" ? 10 : 0);
}

function sortValue(complaint: Complaint, key: SortKey): string | number {
  switch (key) {
    case "risk": return riskScore(complaint);
    case "received_at": return dateValue(complaint.received_at, 0);
    case "due_date": return dateValue(complaint.due_date);
    case "priority": return PRIORITY_ORDER[complaint.priority] || 0;
    case "status": return STATUS_ORDER[complaint.status] || 99;
    case "category": return CATEGORY_LABELS[complaint.category] || complaint.category;
    case "channel": return CHANNEL_LABELS[complaint.channel] || complaint.channel;
    case "lot": return complaint.parking_lots?.name || "미지정";
    case "lot_type": return LOT_TYPE_LABELS[complaint.parking_lots?.lot_type as LotType] || "미지정";
    case "assignee": return complaint.profiles?.name || "미배정";
    case "title": return complaint.title;
    case "repeat_count": return complaint.repeat_count || 0;
    case "satisfaction": return complaint.satisfaction_score ?? -1;
    case "closed_at": return dateValue(complaint.closed_at);
    case "updated_at": return dateValue(complaint.updated_at || complaint.created_at, 0);
  }
}

function groupValue(complaint: Complaint, key: GroupKey) {
  switch (key) {
    case "lot": return complaint.parking_lots?.name || "주차장 미지정";
    case "lot_type": return LOT_TYPE_LABELS[complaint.parking_lots?.lot_type as LotType] || "주차장 형태 미지정";
    case "assignee": return complaint.profiles?.name || "미배정";
    case "status": return COMPLAINT_STATUS_LABELS[complaint.status] || complaint.status;
    case "priority": return PRIORITY_LABELS[complaint.priority] || complaint.priority;
    case "category": return CATEGORY_LABELS[complaint.category] || complaint.category;
    case "channel": return CHANNEL_LABELS[complaint.channel] || complaint.channel;
    default: return "전체 민원";
  }
}

export default function ComplaintDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState(() => searchParams.get("status") === "open" ? "open" : "all");
  const [lotFilter, setLotFilter] = useState("all");
  const [lotTypeFilter, setLotTypeFilter] = useState(() => searchParams.get("lotType") || "all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [queueFilter, setQueueFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [direction, setDirection] = useState<Direction>("desc");
  const [groupBy, setGroupBy] = useState<GroupKey>("none");

  const { data: complaints = [], isLoading, isError } = useQuery({
    queryKey: ["complaints"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("id, lot_id, complaint_number, channel, received_at, category, sub_category, title, content, location_detail, vehicle_number, is_anonymous, priority, due_date, is_overdue, assigned_team, assigned_to, response, status, is_repeat, repeat_count, satisfaction_score, closed_at, updated_at, created_at, saeol_ref, external_ref, parking_lots(code, name, lot_type), profiles!complaints_assigned_to_fkey(name, team)")
        .order("received_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Complaint[];
    },
  });

  const { data: lots = [] } = useQuery({
    queryKey: ["complaint-filter-lots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["complaint-filter-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, name, team").eq("is_active", true).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const open = complaints.filter((item) => !CLOSED_STATUSES.includes(item.status));
    const recentClosed = complaints.filter((item) => item.closed_at && dateValue(item.received_at) >= Date.now() - 30 * DAY);
    const avgDays = recentClosed.length
      ? recentClosed.reduce((sum, item) => sum + (dateValue(item.closed_at) - dateValue(item.received_at)) / DAY, 0) / recentClosed.length
      : 0;
    return {
      open: open.length,
      urgent: open.filter((item) => item.priority === "urgent").length,
      overdue: open.filter(isComplaintOverdue).length,
      unassigned: open.filter((item) => !item.assigned_to).length,
      repeat: complaints.filter((item) => item.is_repeat).length,
      today: complaints.filter((item) => item.received_at?.slice(0, 10) === today).length,
      avgDays: Math.round(avgDays * 10) / 10,
    };
  }, [complaints]);

  const filtered = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const query = normalized(search).trim();
    const list = complaints.filter((item) => {
      if (statusTab === "open" && CLOSED_STATUSES.includes(item.status)) return false;
      if (statusTab === "responded" && item.status !== "responded") return false;
      if (statusTab === "closed" && item.status !== "closed") return false;
      if (lotFilter !== "all" && item.lot_id !== lotFilter) return false;
      if (lotTypeFilter === "other" && ["offstreet", "multilevel", "onstreet"].includes(item.parking_lots?.lot_type || "")) return false;
      if (lotTypeFilter !== "all" && lotTypeFilter !== "other" && item.parking_lots?.lot_type !== lotTypeFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
      if (channelFilter !== "all" && item.channel !== channelFilter) return false;
      if (assigneeFilter === "unassigned" && item.assigned_to) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && item.assigned_to !== assigneeFilter) return false;
      if (periodFilter !== "all") {
        const days = Number(periodFilter);
        if (dateValue(item.received_at, 0) < today.getTime() - (days - 1) * DAY) return false;
      }
      if (queueFilter === "overdue" && !isComplaintOverdue(item)) return false;
      if (queueFilter === "due_today" && (!item.due_date || item.due_date.slice(0, 10) !== today.toISOString().slice(0, 10) || CLOSED_STATUSES.includes(item.status))) return false;
      if (queueFilter === "due_3") {
        const due = dateValue(item.due_date);
        if (CLOSED_STATUSES.includes(item.status) || due < today.getTime() || due > today.getTime() + 3 * DAY) return false;
      }
      if (queueFilter === "unassigned" && (item.assigned_to || CLOSED_STATUSES.includes(item.status))) return false;
      if (queueFilter === "repeat" && !item.is_repeat) return false;
      if (queueFilter === "urgent" && (item.priority !== "urgent" || CLOSED_STATUSES.includes(item.status))) return false;
      if (!query) return true;
      return [item.complaint_number, item.title, item.content, item.vehicle_number, item.location_detail, item.saeol_ref, item.external_ref, item.parking_lots?.name, item.profiles?.name]
        .some((value) => normalized(value).includes(query));
    });

    return [...list].sort((a, b) => {
      const left = sortValue(a, sortKey);
      const right = sortValue(b, sortKey);
      const comparison = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "ko-KR", { numeric: true });
      return direction === "asc" ? comparison : -comparison;
    });
  }, [assigneeFilter, categoryFilter, channelFilter, complaints, direction, lotFilter, lotTypeFilter, periodFilter, priorityFilter, queueFilter, search, sortKey, statusTab]);

  const groups = useMemo(() => {
    const grouped = new Map<string, Complaint[]>();
    filtered.forEach((item) => {
      const key = groupValue(item, groupBy);
      grouped.set(key, [...(grouped.get(key) || []), item]);
    });
    return [...grouped.entries()];
  }, [filtered, groupBy]);

  const resetFilters = () => {
    setSearch("");
    setStatusTab("all");
    setLotFilter("all");
    setLotTypeFilter("all");
    setCategoryFilter("all");
    setPriorityFilter("all");
    setChannelFilter("all");
    setAssigneeFilter("all");
    setPeriodFilter("all");
    setQueueFilter("all");
    setSortKey("risk");
    setDirection("desc");
    setGroupBy("none");
  };

  const kpis = [
    { label: "미처리 민원", value: stats.open, icon: MessageSquare, color: "text-blue-600", action: () => setStatusTab("open") },
    { label: "긴급 민원", value: stats.urgent, icon: AlertOctagon, color: "text-red-600", action: () => setQueueFilter("urgent") },
    { label: "기한 초과", value: stats.overdue, icon: Clock, color: "text-orange-600", action: () => setQueueFilter("overdue") },
    { label: "미배정", value: stats.unassigned, icon: UserX, color: "text-violet-600", action: () => setQueueFilter("unassigned") },
    { label: "반복 민원", value: stats.repeat, icon: Repeat2, color: "text-rose-600", action: () => setQueueFilter("repeat") },
    { label: "오늘 접수", value: stats.today, icon: Inbox, color: "text-green-600", action: () => setPeriodFilter("1") },
    { label: "평균 처리일", value: `${stats.avgDays}일`, icon: Timer, color: "text-slate-600" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold">민원 관리</h2>
            <p className="text-xs text-muted-foreground mt-1">접수부터 배정, 기한 관리, 회신과 종결까지 한 곳에서 처리합니다.</p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button variant="outline" size="sm" onClick={() => navigate("/complaints/stats")}>통계 분석</Button>
            <Button size="sm" onClick={() => navigate("/complaints/new")}><Plus className="h-4 w-4 mr-1" />민원 접수</Button>
          </div>
        </div>

        {(stats.urgent > 0 || stats.overdue > 0 || stats.unassigned > 0) && (
          <div className="border border-destructive/20 bg-destructive/5 rounded-md px-4 py-3 flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-sm font-medium mr-auto">즉시 확인: 긴급 {stats.urgent}건 · 기한 초과 {stats.overdue}건 · 미배정 {stats.unassigned}건</span>
            <Button variant="outline" size="sm" className="h-7" onClick={() => setQueueFilter("urgent")}>긴급</Button>
            <Button variant="outline" size="sm" className="h-7" onClick={() => setQueueFilter("overdue")}>기한 초과</Button>
            <Button variant="outline" size="sm" className="h-7" onClick={() => setQueueFilter("unassigned")}>미배정</Button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
          {kpis.map((item) => (
            <Card key={item.label} className={item.action ? "cursor-pointer hover:border-primary/40" : ""} onClick={item.action}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
                <div className="text-xl font-bold mt-1">{item.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[260px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input aria-label="민원 통합검색" placeholder="민원번호, 새올번호, 제목, 내용, 차량번호, 주차장, 담당자" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8 h-9 text-sm" />
              </div>
              <Select value={lotFilter} onValueChange={setLotFilter}>
                <SelectTrigger aria-label="주차장 필터" className="w-40 h-9 text-sm"><SelectValue placeholder="주차장" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 주차장</SelectItem>{lots.map((lot) => <SelectItem key={lot.id} value={lot.id}>{lot.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={lotTypeFilter} onValueChange={setLotTypeFilter}>
                <SelectTrigger aria-label="주차장 형태 필터" className="w-36 h-9 text-sm"><SelectValue placeholder="주차장 형태" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 주차장 형태</SelectItem>{Object.entries(LOT_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}<SelectItem value="other">기타·미지정</SelectItem></SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger aria-label="민원유형 필터" className="w-32 h-9 text-sm"><SelectValue placeholder="유형" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 유형</SelectItem>{Object.entries(CATEGORY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger aria-label="우선순위 필터" className="w-28 h-9 text-sm"><SelectValue placeholder="우선순위" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 우선순위</SelectItem>{Object.entries(PRIORITY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger aria-label="접수채널 필터" className="w-28 h-9 text-sm"><SelectValue placeholder="채널" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 채널</SelectItem>{Object.entries(CHANNEL_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger aria-label="담당자 필터" className="w-36 h-9 text-sm"><SelectValue placeholder="담당자" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 담당자</SelectItem><SelectItem value="unassigned">미배정</SelectItem>{staff.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger aria-label="접수기간 필터" className="w-32 h-9 text-sm"><SelectValue placeholder="접수기간" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 기간</SelectItem><SelectItem value="1">오늘</SelectItem><SelectItem value="7">최근 7일</SelectItem><SelectItem value="30">최근 30일</SelectItem><SelectItem value="90">최근 90일</SelectItem></SelectContent>
              </Select>
              <Select value={queueFilter} onValueChange={setQueueFilter}>
                <SelectTrigger aria-label="처리대상 필터" className="w-36 h-9 text-sm"><SelectValue placeholder="처리대상" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 처리대상</SelectItem><SelectItem value="urgent">긴급 민원</SelectItem><SelectItem value="overdue">기한 초과</SelectItem><SelectItem value="due_today">오늘 마감</SelectItem><SelectItem value="due_3">3일 이내 마감</SelectItem><SelectItem value="unassigned">미배정</SelectItem><SelectItem value="repeat">반복 민원</SelectItem></SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                <SelectTrigger aria-label="정렬 기준" className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{SORT_OPTIONS.map(([key, label]) => <SelectItem key={key} value={key}>{label}순</SelectItem>)}</SelectContent>
              </Select>
              <Button aria-label={direction === "asc" ? "오름차순" : "내림차순"} title={direction === "asc" ? "오름차순" : "내림차순"} variant="outline" size="icon" className="h-9 w-9" onClick={() => setDirection((value) => value === "asc" ? "desc" : "asc")}>
                {direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
              <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupKey)}>
                <SelectTrigger aria-label="그룹 기준" className="w-36 h-9 text-sm"><ListTree className="h-4 w-4 mr-1" /><SelectValue /></SelectTrigger>
                <SelectContent>{GROUP_OPTIONS.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-9" onClick={resetFilters}><RotateCcw className="h-4 w-4 mr-1" />초기화</Button>
              <span className="text-xs text-muted-foreground ml-auto">총 {complaints.length}건 중 <strong className="text-foreground">{filtered.length}건</strong></span>
            </div>
          </CardContent>
        </Card>

        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="all">전체 ({complaints.length})</TabsTrigger>
            <TabsTrigger value="open">미처리 ({stats.open})</TabsTrigger>
            <TabsTrigger value="responded">회신완료</TabsTrigger>
            <TabsTrigger value="closed">종결</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-2 md:hidden">
          {isLoading ? <><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /></> : isError ? (
            <div className="rounded border p-6 text-center text-sm text-destructive">민원 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>
          ) : groups.map(([group, items]) => (
            <div key={group} className="space-y-2">
              {groupBy !== "none" && <div className="sticky top-0 z-10 bg-background py-1 text-xs font-semibold">{group} <span className="font-normal text-muted-foreground">{items.length}건</span></div>}
              {items.map((item) => {
                const dday = getDDay(item.due_date);
                return (
                  <button key={item.id} type="button" aria-label={`${item.complaint_number} 민원 처리`} className={`w-full rounded-md border bg-card p-3 text-left ${isComplaintOverdue(item) ? "border-destructive/40" : ""}`} onClick={() => navigate(`/complaints/${item.id}`)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="font-mono text-[11px] text-muted-foreground">{item.complaint_number}</p><p className="mt-1 line-clamp-2 text-sm font-semibold">{item.title}</p></div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge className={`text-[10px] ${COMPLAINT_STATUS_COLORS[item.status] || ""}`}>{COMPLAINT_STATUS_LABELS[item.status] || item.status}</Badge>
                      <Badge className={`text-[10px] ${PRIORITY_COLORS[item.priority] || ""}`}>{PRIORITY_LABELS[item.priority] || item.priority}</Badge>
                      <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[item.category] || item.category}</Badge>
                      {item.parking_lots?.lot_type && <Badge variant="secondary" className="text-[10px]">{LOT_TYPE_LABELS[item.parking_lots.lot_type as LotType]}</Badge>}
                      {item.is_repeat && <Badge variant="destructive" className="text-[10px]">반복 {item.repeat_count || 1}</Badge>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2 text-xs">
                      <span className="text-muted-foreground">주차장</span><span className="truncate text-right">{item.parking_lots?.name || "미지정"}</span>
                      <span className="text-muted-foreground">담당자</span><span className={`text-right ${!item.assigned_to ? "font-medium text-destructive" : ""}`}>{item.profiles?.name || "미배정"}</span>
                      <span className="text-muted-foreground">처리기한</span><span className={`text-right ${dday.isOverdue ? "font-semibold text-destructive" : ""}`}>{item.due_date?.slice(0, 10) || "미지정"} · {dday.text}</span>
                    </div>
                    <div className="mt-2 rounded bg-muted/60 px-2 py-1.5 text-xs"><span className="mr-1 text-muted-foreground">다음</span>{item.status === "received" ? "담당자 배정" : item.status === "assigned" ? "처리 시작 또는 현장 확인" : item.status === "in_progress" ? "처리 결과·회신 등록" : item.status === "pending_external" ? "외부기관 회신일 확인" : item.status === "responded" ? "종결 근거 확인" : item.status === "reopened" ? "재처리" : "처리 이력 확인"}</div>
                  </button>
                );
              })}
            </div>
          ))}
          {!isLoading && !isError && !filtered.length && <div className="rounded border py-10 text-center text-sm text-muted-foreground">조건에 맞는 민원이 없습니다.</div>}
        </div>

        <Card className="hidden md:block">
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? <div className="p-4 space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : isError ? (
              <div className="py-12 text-center text-sm text-destructive">민원 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>
            ) : (
              <Table className="min-w-[1320px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">민원번호</TableHead><TableHead>유형</TableHead><TableHead className="min-w-[240px]">민원 내용</TableHead><TableHead>주차장</TableHead><TableHead>민원인</TableHead><TableHead>채널</TableHead><TableHead>접수일</TableHead><TableHead>처리기한</TableHead><TableHead>담당자</TableHead><TableHead>상태</TableHead><TableHead>우선순위</TableHead><TableHead className="w-20 text-right">처리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map(([group, items]) => (
                    <Fragment key={group}>
                      {groupBy !== "none" && (
                        <TableRow className="bg-muted/60 hover:bg-muted/60">
                          <TableCell colSpan={12} className="py-2 text-xs font-semibold">{group} <span className="ml-2 text-muted-foreground font-normal">{items.length}건 · 기한 초과 {items.filter(isComplaintOverdue).length}건</span></TableCell>
                        </TableRow>
                      )}
                      {items.map((item) => {
                        const dday = getDDay(item.due_date);
                        return (
                          <TableRow key={item.id} className={`cursor-pointer ${isComplaintOverdue(item) ? "bg-destructive/5" : ""} ${item.priority === "urgent" ? "border-l-2 border-l-destructive" : ""}`} onClick={() => navigate(`/complaints/${item.id}`)}>
                            <TableCell className="text-xs font-mono font-medium">{item.complaint_number}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[item.category] || item.category}</Badge></TableCell>
                            <TableCell><div className="flex items-center gap-1.5"><span className="text-sm truncate max-w-[260px]">{item.title}</span>{item.is_repeat && <Badge variant="destructive" className="text-[9px] shrink-0">반복 {item.repeat_count || 1}</Badge>}</div><div className="text-[10px] text-muted-foreground truncate max-w-[280px]">{item.content}</div></TableCell>
                            <TableCell className="text-xs"><div>{item.parking_lots?.name || "-"}</div>{item.parking_lots?.lot_type && <Badge variant="secondary" className="mt-1 text-[9px]">{LOT_TYPE_LABELS[item.parking_lots.lot_type as LotType]}</Badge>}</TableCell>
                            <TableCell className="text-xs">{item.is_anonymous ? "익명" : "보호정보"}</TableCell>
                            <TableCell><Badge variant="secondary" className="text-[10px]">{CHANNEL_LABELS[item.channel] || item.channel}</Badge></TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{item.received_at?.slice(0, 10)}</TableCell>
                            <TableCell className={`text-xs whitespace-nowrap ${dday.isOverdue ? "text-destructive font-semibold" : ""}`}><div>{item.due_date?.slice(0, 10) || "-"}</div><div className="text-[10px]">{dday.text}</div></TableCell>
                            <TableCell className={`text-xs ${!item.assigned_to && !CLOSED_STATUSES.includes(item.status) ? "text-destructive font-medium" : ""}`}>{item.profiles?.name || "미배정"}</TableCell>
                            <TableCell><Badge className={`text-[10px] ${COMPLAINT_STATUS_COLORS[item.status] || ""}`}>{COMPLAINT_STATUS_LABELS[item.status] || item.status}</Badge></TableCell>
                            <TableCell><Badge className={`text-[10px] ${PRIORITY_COLORS[item.priority] || ""}`}>{PRIORITY_LABELS[item.priority] || item.priority}</Badge></TableCell>
                            <TableCell className="text-right"><Button variant={item.assigned_to ? "ghost" : "outline"} size="sm" className="h-7 text-xs" aria-label={item.assigned_to ? `${item.complaint_number} 민원 처리` : `${item.complaint_number} 담당자 배정`} title={item.assigned_to ? "민원 처리" : "담당자 배정"} onClick={(event) => { event.stopPropagation(); navigate(`/complaints/${item.id}${item.assigned_to ? "" : "?action=assign"}`); }}>{item.assigned_to ? <ChevronRight className="h-4 w-4" /> : "배정"}</Button></TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                  {!filtered.length && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-12">조건에 맞는 민원이 없습니다. 필터를 초기화하거나 검색어를 확인해 주세요.</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
