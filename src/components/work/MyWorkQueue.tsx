import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, ListTodo, MessageSquare, RefreshCw, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isWorkDueToday, isWorkOverdue, isWorkUrgent, useMyWork, type MyWorkItem } from "@/hooks/useMyWork";

const KIND_META = {
  complaint: { label: "민원", icon: MessageSquare },
  maintenance: { label: "유지보수", icon: Wrench },
  schedule: { label: "점검", icon: CalendarClock },
  survey: { label: "현황조사", icon: ClipboardCheck },
  approval: { label: "승인", icon: CheckCircle2 },
  team_work: { label: "팀 업무", icon: ListTodo },
};

function dueLabel(dueDate?: string | null) {
  if (!dueDate) return "기한 없음";
  const diff = Math.ceil((new Date(dueDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}일 지연`;
  if (diff === 0) return "오늘 마감";
  return `${diff}일 남음`;
}

function WorkRow({ item }: { item: MyWorkItem }) {
  const navigate = useNavigate();
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const overdue = isWorkOverdue(item);

  return (
    <button
      type="button"
      onClick={() => navigate(item.route)}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{item.title}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">{meta.label}</Badge>
          {item.priority === "critical" ? <Badge variant="destructive" className="shrink-0 text-[10px]">긴급</Badge> : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.context}</span>
        {item.nextAction ? <span className="mt-0.5 block truncate text-xs font-medium text-foreground">다음: {item.nextAction}</span> : null}
      </span>
      <span className={`text-xs font-medium ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
        {overdue && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
        {dueLabel(item.dueDate)}
      </span>
    </button>
  );
}

export function MyWorkQueue() {
  const [filter, setFilter] = useState("open");
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading, isFetching, refetch } = useMyWork();
  const items = data?.items || [];
  const failedSources = data?.failedSources || [];
  const overdue = items.filter(isWorkOverdue);
  const today = items.filter(isWorkDueToday);
  const urgent = items.filter(isWorkUrgent);
  const visible = filter === "overdue" ? overdue : filter === "today" ? today : filter === "urgent" ? urgent : items;
  const displayed = showAll ? visible : visible.slice(0, 8);

  const changeFilter = (value: string) => {
    setFilter(value);
    setShowAll(false);
  };

  return (
    <section className="overflow-hidden border bg-card" aria-labelledby="my-work-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 id="my-work-title" className="text-sm font-semibold">내 업무</h2>
          <p className="text-xs text-muted-foreground">담당자, 기한, 다음 행동이 지정된 업무입니다</p>
        </div>
        <Tabs value={filter} onValueChange={changeFilter}>
          <TabsList className="h-auto flex-wrap justify-end">
            <TabsTrigger value="open" className="h-7 text-xs">전체 {items.length}</TabsTrigger>
            <TabsTrigger value="today" className="h-7 text-xs">오늘 {today.length}</TabsTrigger>
            <TabsTrigger value="overdue" className="h-7 text-xs">지연 {overdue.length}</TabsTrigger>
            <TabsTrigger value="urgent" className="h-7 text-xs">긴급 {urgent.length}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {failedSources.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <span><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{failedSources.join("·")} 자료를 불러오지 못해 아래 건수에서 제외했습니다.</span>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => void refetch()} disabled={isFetching}><RefreshCw className={`mr-1 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />다시 조회</Button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : visible.length > 0 ? (
        <div className={showAll ? "max-h-[34rem] overflow-y-auto" : undefined}>{displayed.map((item) => <WorkRow key={`${item.kind}-${item.id}`} item={item} />)}</div>
      ) : (
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" />{filter === "overdue" ? "지연된 업무가 없습니다" : filter === "today" ? "오늘 마감 업무가 없습니다" : filter === "urgent" ? "긴급 업무가 없습니다" : "현재 배정된 업무가 없습니다"}
        </div>
      )}
      {visible.length > 8 && <div className="border-t p-2 text-center"><Button variant="ghost" size="sm" onClick={() => setShowAll((current) => !current)}>{showAll ? "접기" : `전체 ${visible.length}건 보기`}</Button></div>}
    </section>
  );
}
