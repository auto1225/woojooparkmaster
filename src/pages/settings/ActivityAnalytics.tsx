import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KPICard } from "@/components/common/KPICard";
import { Users, UserCheck, Activity, UserX } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { CHART_COLORS, ChartTooltipContent } from "@/lib/chart-config";
import { useTheme } from "@/hooks/useTheme";

export default function ActivityAnalytics() {
  const { user } = useAuth();
  const { isDark } = useTheme();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  // Active users (7 days)
  const { data: weeklyLogs = [] } = useQuery({
    queryKey: ["analytics-weekly"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("user_id, user_name, module, action, created_at")
        .gte("created_at", sevenDaysAgo);
      return data || [];
    },
  });

  const { data: monthlyLogs = [] } = useQuery({
    queryKey: ["analytics-monthly"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("user_id, user_name, module, action, created_at")
        .gte("created_at", thirtyDaysAgo);
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["analytics-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, name, team, role");
      return data || [];
    },
  });

  const activeUsers7d = new Set(weeklyLogs.map((l) => l.user_id)).size;
  const todayLogs = monthlyLogs.filter((l) => l.created_at && new Date(l.created_at) >= todayStart);
  const todayActiveUsers = new Set(todayLogs.map((l) => l.user_id)).size;
  const todayActions = todayLogs.length;

  // Daily active users (bar chart)
  const dailyMap: Record<string, Set<string>> = {};
  monthlyLogs.forEach((l) => {
    if (!l.created_at) return;
    const day = l.created_at.slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = new Set();
    dailyMap[day].add(l.user_id || "");
  });
  const dailyData = Object.entries(dailyMap)
    .map(([date, users]) => ({ date: date.slice(5), users: users.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Module usage (donut)
  const moduleCount: Record<string, number> = {};
  monthlyLogs.forEach((l) => { moduleCount[l.module] = (moduleCount[l.module] || 0) + 1; });
  const moduleData = Object.entries(moduleCount)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Hourly activity
  const hourCount: Record<number, number> = {};
  monthlyLogs.forEach((l) => {
    if (!l.created_at) return;
    const h = new Date(l.created_at).getHours();
    hourCount[h] = (hourCount[h] || 0) + 1;
  });
  const hourData = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}시`, count: hourCount[h] || 0 }));

  // Action types
  const actionCount: Record<string, number> = {};
  monthlyLogs.forEach((l) => { actionCount[l.action] = (actionCount[l.action] || 0) + 1; });
  const actionData = Object.entries(actionCount)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // User activity table
  const userActivity = profiles.map((p) => {
    const userLogs = monthlyLogs.filter((l) => l.user_id === p.id);
    const todayCount = userLogs.filter((l) => l.created_at && new Date(l.created_at) >= todayStart).length;
    const weekCount = userLogs.filter((l) => l.created_at && new Date(l.created_at) >= new Date(sevenDaysAgo)).length;
    const topModule = Object.entries(
      userLogs.reduce((acc: Record<string, number>, l) => { acc[l.module] = (acc[l.module] || 0) + 1; return acc; }, {})
    ).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
    return { ...p, todayCount, weekCount, totalCount: userLogs.length, topModule };
  }).sort((a, b) => b.totalCount - a.totalCount);

  // Top pages
  const pageCount: Record<string, number> = {};
  monthlyLogs.forEach((l) => {
    const key = `${l.module}/${l.action}`;
    pageCount[key] = (pageCount[key] || 0) + 1;
  });
  const topPages = Object.entries(pageCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">사용자 활동 분석</h1>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="활성 사용자 (7일)" value={activeUsers7d} icon={Users} color="bg-primary/10 text-primary" />
          <KPICard title="오늘 접속" value={todayActiveUsers} icon={UserCheck} color="bg-success/10 text-success" />
          <KPICard title="오늘 활동" value={todayActions} icon={Activity} color="bg-accent/10 text-accent" />
          <KPICard title="총 사용자" value={profiles.length} icon={UserX} color="bg-warning/10 text-warning" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">일별 활성 사용자 (30일)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Bar dataKey="users" fill={CHART_COLORS.primary[0]} radius={[3, 3, 0, 0]} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">모듈별 이용 빈도</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={moduleData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {moduleData.map((_, i) => <Cell key={i} fill={CHART_COLORS.categorical[i % CHART_COLORS.categorical.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {moduleData.slice(0, 6).map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS.categorical[i % CHART_COLORS.categorical.length] }} />
                    <span className="text-[10px] text-muted-foreground">{d.name} {d.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">시간대별 활동</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourData}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Bar dataKey="count" fill={CHART_COLORS.primary[1]} radius={[3, 3, 0, 0]} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">액션 유형별 TOP 10</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={actionData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Bar dataKey="value" fill={CHART_COLORS.categorical[0]} radius={[0, 3, 3, 0]} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* User table */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">사용자별 활동</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 font-medium">이름</th>
                    <th className="text-left py-2 font-medium">팀</th>
                    <th className="text-left py-2 font-medium">역할</th>
                    <th className="text-right py-2 font-medium">오늘</th>
                    <th className="text-right py-2 font-medium">이번 주</th>
                    <th className="text-right py-2 font-medium">30일</th>
                    <th className="text-left py-2 font-medium">주 이용 모듈</th>
                  </tr>
                </thead>
                <tbody>
                  {userActivity.map((u) => (
                    <tr key={u.id} className={`border-b last:border-0 ${u.totalCount === 0 ? "opacity-50" : ""}`}>
                      <td className="py-2 font-medium">{u.name}</td>
                      <td className="py-2"><Badge variant="outline" className="text-[10px]">{(u as any).team || "-"}</Badge></td>
                      <td className="py-2"><Badge variant="secondary" className="text-[10px]">{u.role}</Badge></td>
                      <td className="py-2 text-right">{u.todayCount}</td>
                      <td className="py-2 text-right">{u.weekCount}</td>
                      <td className="py-2 text-right">{u.totalCount}</td>
                      <td className="py-2">{u.topModule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground mt-4">활동 로그는 1년간 보관됩니다</p>
          </CardContent>
        </Card>

        {/* Top pages */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">페이지별 접근 순위 TOP 10</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topPages.map(([key, count], i) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}</span>
                  <span className="text-sm flex-1">{key}</span>
                  <span className="text-xs font-semibold">{count.toLocaleString()}회</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
