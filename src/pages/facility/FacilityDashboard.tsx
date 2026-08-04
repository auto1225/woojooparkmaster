import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { KpiCard } from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, CheckCircle, AlertTriangle, XCircle, Wrench, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, MAINT_STATUS_LABELS } from "@/types/facility";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatFacilityRelativeDay } from "@/lib/facility-format";
import { getMissingRequiredEquipment, getParkingLotWorkProfile } from "@/lib/parking-lot-work-profile";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";
import { FacilityReportShortcut } from "@/components/facility/FacilityReportShortcut";

const STATUS_CHART_COLORS = { normal: '#22c55e', warning: '#eab308', broken: '#ef4444', maintenance: '#3b82f6', decommissioned: '#9ca3af' };

export default function FacilityDashboard() {
  const navigate = useNavigate();

  const { data: equipment = [] } = useQuery({
    queryKey: ["facility-equipment-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipment").select("id, lot_id, equipment_type, status, warranty_end, name, parking_lots(code, name, lot_type)");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: lots = [] } = useQuery({
    queryKey: ["facility-lot-standards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pendingWork = { items: [] as any[], count: 0 } } = useQuery({
    queryKey: ["facility-pending-logs"],
    queryFn: async () => {
      const [{ data, error }, { count, error: countError }] = await Promise.all([
        supabase.from("maintenance_logs")
          .select("id, title, priority, status, reported_at, parking_lots(name), equipment(name, equipment_type)")
          .in("status", ["reported", "assigned", "in_progress", "pending_parts"])
          .order("priority", { ascending: true }).order("reported_at", { ascending: true }).limit(20),
        supabase.from("maintenance_logs")
          .select("id", { count: "exact", head: true })
          .in("status", ["reported", "assigned", "in_progress", "pending_parts"]),
      ]);
      if (error) throw error;
      if (countError) throw countError;
      return { items: (data ?? []) as any[], count: count ?? 0 };
    },
  });

  const pendingLogs = pendingWork.items;

  const active = equipment.filter((e: any) => e.status !== 'decommissioned');
  const normal = equipment.filter((e: any) => e.status === 'normal').length;
  const warning = equipment.filter((e: any) => e.status === 'warning').length;
  const brokenMaint = equipment.filter((e: any) => e.status === 'broken' || e.status === 'maintenance').length;
  const pendingCount = pendingWork.count;
  const standardGaps = lots.map((lot: any) => {
    const equipmentTypes = active.filter((item: any) => item.lot_id === lot.id).map((item: any) => item.equipment_type);
    return { ...lot, missing: getMissingRequiredEquipment(lot.lot_type, equipmentTypes) };
  }).filter((lot: any) => lot.missing.length > 0).sort((a: any, b: any) => b.missing.length - a.missing.length);

  // Status donut data
  const statusCounts: Record<string, number> = {};
  equipment.forEach((e: any) => { statusCounts[e.status] = (statusCounts[e.status] || 0) + 1; });
  const donutData = Object.entries(statusCounts).map(([k, v]) => ({ name: EQUIPMENT_STATUS_LABELS[k as keyof typeof EQUIPMENT_STATUS_LABELS] || k, value: v, color: STATUS_CHART_COLORS[k as keyof typeof STATUS_CHART_COLORS] || '#999' }));

  // Type bar data
  const typeCounts: Record<string, number> = {};
  active.forEach((e: any) => { typeCounts[e.equipment_type] = (typeCounts[e.equipment_type] || 0) + 1; });
  const barData = Object.entries(typeCounts).map(([k, v]) => ({ name: EQUIPMENT_TYPE_LABELS[k] || k, count: v })).sort((a, b) => b.count - a.count);

  // Warranty expiring within 60 days
  const today = new Date();
  const in60 = new Date(today.getTime() + 60 * 86400000);
  const warrantyExpiring = equipment.filter((e: any) => {
    if (!e.warranty_end) return false;
    const d = new Date(e.warranty_end);
    return d >= today && d <= in60;
  }).sort((a: any, b: any) => new Date(a.warranty_end).getTime() - new Date(b.warranty_end).getTime()).slice(0, 5);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold text-foreground">시설 현황</h1><FacilityReportShortcut focus="overview" /></div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard label="총 장비 수" value={String(active.length)} icon={Building2} />
          <KpiCard label="정상 가동" value={String(normal)} icon={CheckCircle} />
          <KpiCard label="점검 필요" value={String(warning)} icon={AlertTriangle} />
          <div className="cursor-pointer" onClick={() => navigate('/facility/equipment?status=attention')}>
            <KpiCard label="고장/수리중" value={String(brokenMaint)} icon={XCircle} />
          </div>
          <div className="cursor-pointer" onClick={() => navigate('/facility/maintenance?status=pending')}>
            <KpiCard label="미완료 유지보수" value={String(pendingCount)} icon={Wrench} />
          </div>
          <div className="cursor-pointer" onClick={() => document.getElementById("lot-standard-gaps")?.scrollIntoView({ behavior: "smooth" })}>
            <KpiCard label="기준장비 보완" value={String(standardGaps.length)} icon={ShieldCheck} />
          </div>
        </div>

        <Card id="lot-standard-gaps">
          <CardHeader><CardTitle className="text-sm font-medium">주차장 형태별 운영 기준장비</CardTitle></CardHeader>
          <CardContent>
            {standardGaps.length > 0 ? (
              <div className="divide-y rounded-md border">
                {standardGaps.slice(0, 10).map((lot: any) => {
                  const profile = getParkingLotWorkProfile(lot.lot_type);
                  return (
                    <button key={lot.id} type="button" className="flex w-full flex-col gap-2 p-3 text-left hover:bg-muted/40 md:flex-row md:items-center" onClick={() => navigate(`/facility/equipment?lot=${lot.id}`)}>
                      <div className="min-w-0 md:w-64"><p className="truncate text-sm font-medium">{lot.name}</p><p className="text-xs text-muted-foreground">{lot.code}</p></div>
                      <Badge variant="outline">{LOT_TYPE_LABELS[lot.lot_type as LotType] || profile.label}</Badge>
                      <div className="flex flex-1 flex-wrap gap-1">{lot.missing.map((type: string) => <Badge key={type} variant="secondary">{EQUIPMENT_TYPE_LABELS[type] || type} 미등록</Badge>)}</div>
                      <span className="text-xs font-medium text-destructive">{lot.missing.length}종 보완</span>
                    </button>
                  );
                })}
              </div>
            ) : <p className="py-6 text-center text-sm text-muted-foreground">모든 주차장이 현재 운영 기준장비 구성을 충족합니다.</p>}
            <p className="mt-2 text-[10px] text-muted-foreground">운영 관리 기준에 따른 점검 보조 지표이며 법정 의무 여부는 시설별 인허가·설계도서로 확인합니다.</p>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">장비 상태 분포</CardTitle></CardHeader>
            <CardContent>
              {donutData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name} ${value}`}>
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-muted-foreground text-sm text-center py-10">등록된 장비가 없습니다</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">장비 유형별 수량</CardTitle></CardHeader>
            <CardContent>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 80 }}>
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-muted-foreground text-sm text-center py-10">데이터 없음</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">긴급 유지보수</CardTitle></CardHeader>
            <CardContent>
              {pendingLogs.filter((l: any) => l.priority === 'critical' || l.priority === 'high').length > 0 ? (
                <div className="space-y-3">
                  {pendingLogs.filter((l: any) => l.priority === 'critical' || l.priority === 'high').slice(0, 5).map((log: any) => (
                    <div key={log.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/facility/maintenance?work=${log.id}`)}>
                      <Badge className={PRIORITY_COLORS[log.priority]}>{PRIORITY_LABELS[log.priority]}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{log.title}</p>
                        <p className="text-xs text-muted-foreground">{log.parking_lots?.name} · {log.equipment?.name || '-'}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{MAINT_STATUS_LABELS[log.status as keyof typeof MAINT_STATUS_LABELS]}</Badge>
                    </div>
                  ))}
                </div>
              ) : <p className="text-muted-foreground text-sm text-center py-6">긴급 유지보수 건이 없습니다</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">보증만료 임박 장비</CardTitle></CardHeader>
            <CardContent>
              {warrantyExpiring.length > 0 ? (
                <div className="space-y-3">
                  {warrantyExpiring.map((e: any) => (
                    <button key={e.id} type="button" className="flex w-full items-center justify-between p-2 rounded-md text-left hover:bg-muted/50" onClick={() => navigate(`/facility/equipment?equipment=${e.id}`)}>
                      <div>
                        <p className="text-sm font-medium">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.parking_lots?.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{e.warranty_end}</p>
                        <Badge variant="destructive" className="text-xs">{formatFacilityRelativeDay(e.warranty_end, today)}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : <p className="text-muted-foreground text-sm text-center py-6">보증만료 임박 장비가 없습니다</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
