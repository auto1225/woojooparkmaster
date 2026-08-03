import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Banknote, ClipboardCheck, FileCheck2, MessageSquare, RefreshCw, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { OPEN_COMPLAINT_STATUSES, OPEN_MAINTENANCE_STATUSES } from "@/lib/work-status";
import type { LotType } from "@/types/database";

type SnapshotRow = {
  id?: string;
  lot_id?: string | null;
  due_date?: string | null;
  status?: string | null;
  updated_at?: string | null;
  revenue_date?: string | null;
  parking_lots?: { lot_type?: LotType | null } | null;
};
type CoreLotType = "offstreet" | "multilevel" | "onstreet";
type Scope = "all" | CoreLotType | "other";

const CORE_LOT_TYPES: CoreLotType[] = ["offstreet", "multilevel", "onstreet"];
const SCOPE_LABELS: Record<Scope, string> = { all: "전체", offstreet: "노외", multilevel: "주차빌딩", onstreet: "노상", other: "기타·미지정" };

async function countPendingApprovals() {
  const requests = [
    supabase.from("surveys").select("id").in("status", ["submitted", "review"]),
    supabase.from("budget_executions").select("id").eq("status", "pending"),
    supabase.from("budget_transfers").select("id").eq("status", "pending"),
    supabase.from("bid_projects").select("id").eq("status", "review"),
    supabase.from("service_inspections").select("id").eq("status", "pending"),
    supabase.from("service_payments").select("id").in("status", ["requested", "reviewing"]),
  ];
  const settled = await Promise.allSettled(requests);
  return {
    count: settled.reduce((sum, result) => result.status === "fulfilled" && !result.value.error ? sum + (result.value.data?.length || 0) : sum, 0),
    failures: settled.filter((result) => result.status === "rejected" || result.value.error).length,
  };
}

function latestDate(rows: SnapshotRow[], keys: Array<keyof SnapshotRow>) {
  const dates = rows.flatMap((row) => keys.map((key) => row[key])).filter((value): value is string => typeof value === "string" && value.length > 0);
  return dates.length ? dates.sort().at(-1)?.slice(0, 10) : undefined;
}

export function DailyOperationsSnapshot() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>("all");
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["daily-operations-snapshot-v2", user?.id],
    queryFn: async () => {
      const [complaints, maintenance, equipment, unverifiedRevenue, missingRevenue, reconciliation, lots, approvals] = await Promise.all([
        supabase.from("complaints").select("id, due_date, priority, updated_at, parking_lots(lot_type)").in("status", OPEN_COMPLAINT_STATUSES),
        supabase.from("maintenance_logs").select("id, due_date, priority, updated_at, parking_lots(lot_type)").in("status", OPEN_MAINTENANCE_STATUSES),
        supabase.from("equipment").select("id, status, updated_at, parking_lots(lot_type)").in("status", ["warning", "broken", "maintenance"]),
        supabase.from("revenue_daily").select("id, lot_id, revenue_date, updated_at, parking_lots(lot_type)").eq("verified", false),
        (supabase.from("revenue_missing_days" as never) as any).select("lot_id, revenue_date"),
        supabase.from("revenue_reconciliation").select("id, lot_id, status, updated_at, parking_lots(lot_type)").in("status", ["pending", "reviewing", "discrepancy", "disputed"]),
        supabase.from("parking_lots").select("id, lot_type"),
        countPendingApprovals(),
      ]);
      const lotTypes = new Map((lots.data || []).map((lot: any) => [lot.id, lot.lot_type as LotType]));
      const missingRows = ((missingRevenue.data || []) as SnapshotRow[]).map((row) => ({
        ...row,
        parking_lots: { lot_type: row.lot_id ? lotTypes.get(row.lot_id) : null },
      }));
      const queryResults = [complaints, maintenance, equipment, unverifiedRevenue, missingRevenue, reconciliation, lots];
      return {
        complaints: (complaints.data || []) as SnapshotRow[],
        maintenance: (maintenance.data || []) as SnapshotRow[],
        equipment: (equipment.data || []) as SnapshotRow[],
        unverifiedRevenue: (unverifiedRevenue.data || []) as SnapshotRow[],
        missingRevenue: missingRows,
        reconciliation: (reconciliation.data || []) as SnapshotRow[],
        approvals: approvals.count,
        partialFailures: queryResults.filter((result) => result.error).length + approvals.failures,
        fetchedAt: new Date().toISOString(),
      };
    },
    refetchInterval: 60_000,
  });

  const summary = useMemo(() => {
    const rows = {
      complaints: data?.complaints || [],
      maintenance: data?.maintenance || [],
      equipment: data?.equipment || [],
      unverifiedRevenue: data?.unverifiedRevenue || [],
      missingRevenue: data?.missingRevenue || [],
      reconciliation: data?.reconciliation || [],
      approvals: data?.approvals || 0,
    };
    const applies = (row: SnapshotRow) => {
      const lotType = row.parking_lots?.lot_type;
      if (scope === "all") return true;
      if (scope === "other") return !lotType || !CORE_LOT_TYPES.includes(lotType as CoreLotType);
      return lotType === scope;
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = (row: SnapshotRow) => Boolean(row.due_date) && new Date(row.due_date!).setHours(0, 0, 0, 0) < today.getTime();
    const complaints = rows.complaints.filter(applies);
    const maintenance = rows.maintenance.filter(applies);
    const equipment = rows.equipment.filter(applies);
    const unverifiedRevenue = rows.unverifiedRevenue.filter(applies);
    const missingRevenue = rows.missingRevenue.filter(applies);
    const reconciliation = rows.reconciliation.filter(applies);
    return {
      complaints: complaints.length,
      complaintOverdue: complaints.filter(overdue).length,
      complaintDate: latestDate(complaints, ["updated_at"]),
      maintenance: maintenance.length,
      maintenanceOverdue: maintenance.filter(overdue).length,
      maintenanceDate: latestDate(maintenance, ["updated_at"]),
      equipment: equipment.length,
      equipmentBroken: equipment.filter((row) => row.status === "broken").length,
      equipmentDate: latestDate(equipment, ["updated_at"]),
      revenue: unverifiedRevenue.length + missingRevenue.length + reconciliation.length,
      revenueDetail: `미검증 ${unverifiedRevenue.length} · 누락 ${missingRevenue.length} · 대사 ${reconciliation.length}`,
      revenueDate: latestDate([...unverifiedRevenue, ...missingRevenue, ...reconciliation], ["updated_at", "revenue_date"]),
      approvals: rows.approvals,
    };
  }, [data, scope]);

  const scopeQuery = scope === "all" ? "" : `&lotType=${scope}`;
  const items = [
    { label: "처리 중 민원", value: summary.complaints, detail: summary.complaintOverdue ? `기한 초과 ${summary.complaintOverdue}건` : "기한 초과 없음", date: summary.complaintDate, icon: MessageSquare, route: `/complaints?status=open${scopeQuery}`, danger: summary.complaintOverdue > 0, attention: summary.complaints > 0 },
    { label: "시설 작업", value: summary.maintenance, detail: summary.maintenanceOverdue ? `기한 초과 ${summary.maintenanceOverdue}건` : "기한 초과 없음", date: summary.maintenanceDate, icon: Wrench, route: `/facility/maintenance?status=active${scopeQuery}`, danger: summary.maintenanceOverdue > 0, attention: summary.maintenance > 0 },
    { label: "이상 장비", value: summary.equipment, detail: summary.equipmentBroken ? `고장 ${summary.equipmentBroken}건 포함` : "경고·정비 상태", date: summary.equipmentDate, icon: AlertTriangle, route: `/facility/equipment?status=attention${scopeQuery}`, danger: summary.equipmentBroken > 0, attention: summary.equipment > 0 },
    { label: "수입 확인 필요", value: summary.revenue, detail: summary.revenueDetail, date: summary.revenueDate, icon: Banknote, route: `/revenue/reconcile?status=attention${scopeQuery}`, danger: false, attention: summary.revenue > 0 },
    { label: "전체 결재 대기", value: summary.approvals, detail: "주차장 형태 필터 미적용", date: undefined, icon: FileCheck2, route: "/approvals?status=pending", danger: false, attention: summary.approvals > 0 },
  ];

  return <section className="border bg-background" aria-labelledby="daily-snapshot-title">
    <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /><h2 id="daily-snapshot-title" className="text-sm font-semibold">운영 업무 점검</h2>{data?.partialFailures ? <Badge variant="outline" className="text-amber-700">일부 자료 조회 실패</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">미종결 누적 기준 · {data?.fetchedAt ? `${new Date(data.fetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 조회` : "최신 업무자료 조회 중"}</p></div>
      <div className="flex flex-wrap items-center gap-2"><div className="flex flex-wrap border" role="group" aria-label="주차장 형태 필터">{(Object.keys(SCOPE_LABELS) as Scope[]).map((value) => <Button className="rounded-none border-0" key={value} size="sm" variant={scope === value ? "secondary" : "ghost"} aria-pressed={scope === value} onClick={() => setScope(value)}>{SCOPE_LABELS[value]}</Button>)}</div><Button size="icon" variant="outline" title="운영 현황 새로고침" onClick={() => void refetch()} disabled={isFetching}><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></Button></div>
    </div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-5">{items.map((item, index) => <button type="button" disabled={isLoading} onClick={() => navigate(item.route)} className={`${index ? "border-t sm:border-l sm:border-t-0" : ""} min-h-28 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`} key={item.label}>
      <span className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{item.label}</span><item.icon className={`h-4 w-4 ${item.danger ? "text-destructive" : item.attention ? "text-amber-600" : "text-muted-foreground"}`} /></span><span className={`mt-2 block text-2xl font-bold tabular-nums ${item.danger ? "text-destructive" : item.attention ? "text-amber-700" : ""}`}>{isLoading ? "-" : `${item.value}건`}</span><span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span>{item.date ? <span className="mt-1 block text-[11px] text-muted-foreground">최근 자료 {item.date}</span> : null}
    </button>)}</div>
  </section>;
}
