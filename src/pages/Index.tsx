import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Car, LayoutGrid, Activity } from "lucide-react";
import { LOT_TYPE_LABELS, LOT_STATUS_LABELS } from "@/types/database";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { KakaoMap } from "@/components/common/KakaoMap";
import { KPICard } from "@/components/common/KPICard";
import { AnimatedPage, StaggerContainer, StaggerItem } from "@/components/common/AnimatedPage";
import { useNavigate } from "react-router-dom";
import type { LotType, LotStatus } from "@/types/database";

const COLORS = ["hsl(221,83%,53%)", "hsl(160,84%,39%)", "hsl(37,92%,50%)", "hsl(271,65%,57%)", "hsl(0,72%,51%)"];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "좋은 아침이에요";
  if (h < 18) return "좋은 오후에요";
  return "좋은 저녁이에요";
}

export default function Index() {
  const { data: config } = useSystemConfig();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data: lots, isLoading } = useQuery({
    queryKey: ["dashboard-lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parking_lots")
        .select("id, name, lot_type, total_spaces, status, address_road, latitude, longitude");
      if (error) throw error;
      return data;
    },
  });

  const { data: recentLogs } = useQuery({
    queryKey: ["dashboard-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs").select("*")
        .order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data;
    },
  });

  const activeLots = lots?.filter((l) => l.status === "active") || [];
  const totalSpaces = lots?.reduce((s, l) => s + (l.total_spaces || 0), 0) || 0;

  const typeCount: Record<string, number> = {};
  lots?.forEach((l) => { typeCount[l.lot_type] = (typeCount[l.lot_type] || 0) + 1; });
  const typeSub = Object.entries(typeCount)
    .map(([k, v]) => `${LOT_TYPE_LABELS[k as LotType]?.replace("주차장", "")} ${v}`)
    .join(" · ");

  const statusCount: Record<string, number> = {};
  lots?.forEach((l) => { statusCount[l.status] = (statusCount[l.status] || 0) + 1; });
  const statusSub = Object.entries(statusCount)
    .map(([k, v]) => `${LOT_STATUS_LABELS[k as LotStatus]} ${v}`)
    .join(" · ");

  const pieData = Object.entries(typeCount).map(([k, v]) => ({
    name: LOT_TYPE_LABELS[k as LotType] || k, value: v,
  }));

  const today = new Date();
  const dateStr = today.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  return (
    <DashboardLayout>
      <AnimatedPage>
        <div className="space-y-8">
          {/* Welcome header */}
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-h1 font-display text-foreground">{getGreeting()}, {profile?.name || "관리자"}님</h1>
              <p className="text-sm text-muted-foreground mt-1">오늘의 주차장 운영 현황입니다</p>
            </div>
            <span className="text-caption text-muted-foreground hidden sm:block">{dateStr}</span>
          </div>

          {/* KPI Cards */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-[120px] rounded-xl shimmer" />)}
            </div>
          ) : (
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StaggerItem>
                <KPICard title="총 주차장" value={activeLots.length} icon={Building2} color="bg-primary/10 text-primary" />
              </StaggerItem>
              <StaggerItem>
                <KPICard title="총 주차면" value={totalSpaces} sub="전체 주차장 합계" icon={Car} color="bg-success/10 text-success" />
              </StaggerItem>
              <StaggerItem>
                <KPICard title="유형별" value={lots?.length || 0} sub={typeSub} icon={LayoutGrid} color="bg-chart-4/10 text-chart-4" />
              </StaggerItem>
              <StaggerItem>
                <KPICard title="운영 현황" value={activeLots.length} sub={statusSub} icon={Activity} color="bg-warning/10 text-warning" />
              </StaggerItem>
            </StaggerContainer>
          )}

          {/* Map + Pie */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-7 border border-border/60 shadow-xs overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-[13px] font-medium text-muted-foreground">주차장 위치 현황</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <KakaoMap
                  height="380px"
                  enableCluster
                  markers={
                    lots?.filter((l) => l.latitude && l.longitude && l.status === "active").map((l) => ({
                      id: l.id, lat: Number(l.latitude), lng: Number(l.longitude), name: l.name,
                      color: "blue" as const,
                      onClick: (id: string) => navigate(`/lots/${id}`),
                    })) || []
                  }
                />
              </CardContent>
            </Card>

            <Card className="lg:col-span-5 border border-border/60 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-[13px] font-medium text-muted-foreground">유형별 현황</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" dataKey="value" paddingAngle={2}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value}개`, ""]}
                      contentStyle={{
                        background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
                        borderRadius: "12px", boxShadow: "var(--shadow-xl)", padding: "12px 16px",
                        fontFamily: "var(--font-display)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-4 justify-center mt-3">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-[13px] text-muted-foreground">{d.name} <span className="font-medium text-foreground">{d.value}</span></span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent activity - timeline style */}
          <Card className="border border-border/60 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-[13px] font-medium text-muted-foreground">최근 활동</CardTitle>
            </CardHeader>
            <CardContent>
              {(!recentLogs || recentLogs.length === 0) ? (
                <div className="py-12 text-center">
                  <Activity className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">아직 활동 기록이 없습니다</p>
                </div>
              ) : (
                <div className="relative pl-6">
                  <div className="absolute left-[9px] top-2 bottom-2 w-[2px] bg-border" />
                  <div className="space-y-4">
                    {recentLogs.map((log, i) => (
                      <div key={log.id} className="relative flex gap-3 group">
                        <div className={`absolute left-[-18px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card ${i === 0 ? "bg-primary" : "bg-muted-foreground/30"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium">{log.user_name || "시스템"}</span>
                            <span className="text-caption text-muted-foreground">—</span>
                            <span className="text-caption text-muted-foreground">{log.action}</span>
                            {log.target_name && <span className="text-caption text-foreground font-medium">"{log.target_name}"</span>}
                          </div>
                          <span className="text-[11px] font-mono text-muted-foreground/60">
                            {log.created_at ? new Date(log.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AnimatedPage>
    </DashboardLayout>
  );
}
