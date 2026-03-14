import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Car, LayoutGrid, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { LOT_TYPE_LABELS, LOT_STATUS_LABELS } from "@/types/database";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { KakaoMap, type MapMarker } from "@/components/common/KakaoMap";
import { useNavigate } from "react-router-dom";
import type { LotType, LotStatus } from "@/types/database";

const COLORS = ["hsl(211,65%,45%)", "hsl(152,55%,38%)", "hsl(38,92%,50%)", "hsl(280,60%,50%)", "hsl(0,72%,51%)"];

function KpiCard({ title, value, sub, icon: Icon, color }: { title: string; value: string | number; sub?: string; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">{title}</span>
          <div className={`h-8 w-8 rounded-md flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function Index() {
  const { data: config } = useSystemConfig();

  const { data: lots, isLoading } = useQuery({
    queryKey: ["dashboard-lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parking_lots")
        .select("id, lot_type, total_spaces, status");
      if (error) throw error;
      return data;
    },
  });

  const { data: recentLogs } = useQuery({
    queryKey: ["dashboard-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const activeLots = lots?.filter((l) => l.status === "active") || [];
  const totalSpaces = lots?.reduce((s, l) => s + (l.total_spaces || 0), 0) || 0;

  // Type breakdown
  const typeCount: Record<string, number> = {};
  lots?.forEach((l) => { typeCount[l.lot_type] = (typeCount[l.lot_type] || 0) + 1; });
  const typeSub = Object.entries(typeCount)
    .map(([k, v]) => `${LOT_TYPE_LABELS[k as LotType]?.replace("주차장", "")} ${v}`)
    .join(" | ");

  // Status breakdown
  const statusCount: Record<string, number> = {};
  lots?.forEach((l) => { statusCount[l.status] = (statusCount[l.status] || 0) + 1; });
  const statusSub = Object.entries(statusCount)
    .map(([k, v]) => `${LOT_STATUS_LABELS[k as LotStatus]} ${v}`)
    .join(" | ");

  // Pie data
  const pieData = Object.entries(typeCount).map(([k, v]) => ({
    name: LOT_TYPE_LABELS[k as LotType] || k,
    value: v,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="총 주차장" value={activeLots.length.toLocaleString()} icon={Building2} color="bg-accent/10 text-accent" />
            <KpiCard title="총 주차면" value={totalSpaces.toLocaleString()} sub="전체 주차장 합계" icon={Car} color="bg-success/10 text-success" />
            <KpiCard title="유형별" value={lots?.length || 0} sub={typeSub} icon={LayoutGrid} color="bg-chart-4/10 text-chart-4" />
            <KpiCard title="운영 현황" value={activeLots.length} sub={statusSub} icon={Activity} color="bg-warning/10 text-warning" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map placeholder */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">주차장 위치 지도</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80 bg-muted rounded-md flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <p className="text-sm font-medium">지도 영역</p>
                  <p className="text-xs mt-1">Kakao Maps 연동 예정</p>
                  {config && (
                    <p className="text-[10px] font-mono mt-2">
                      {config.map_center_lat}, {config.map_center_lng}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pie chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">유형별 현황</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value}개`, ""]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-[10px] text-muted-foreground">{d.name} {d.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity log */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">최근 활동</CardTitle>
          </CardHeader>
          <CardContent>
            {(!recentLogs || recentLogs.length === 0) ? (
              <div className="py-8 text-center text-xs text-muted-foreground">아직 활동 기록이 없습니다</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 font-medium">시간</th>
                      <th className="text-left py-2 font-medium">사용자</th>
                      <th className="text-left py-2 font-medium">모듈</th>
                      <th className="text-left py-2 font-medium">액션</th>
                      <th className="text-left py-2 font-medium">대상</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.map((log) => (
                      <tr key={log.id} className="border-b last:border-0">
                        <td className="py-2 font-mono text-muted-foreground">
                          {log.created_at ? new Date(log.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                        </td>
                        <td className="py-2">{log.user_name || "-"}</td>
                        <td className="py-2">{log.module}</td>
                        <td className="py-2">{log.action}</td>
                        <td className="py-2">{log.target_name || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
