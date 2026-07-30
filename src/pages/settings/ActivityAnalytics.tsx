import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KPICard } from "@/components/common/KPICard";
import { Users, UserCheck, Activity, UserX } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { CHART_COLORS, ChartTooltipContent } from "@/lib/chart-config";
import { useTheme } from "@/hooks/useTheme";

type ActivityLog = {
  user_id?: string | null;
  user_name?: string | null;
  module: string;
  action: string;
  created_at?: string | null;
};

type AnalyticsProfile = {
  id: string;
  name?: string | null;
  team?: string | null;
  role?: string | null;
};

export default function ActivityAnalytics() {
  const { isDark } = useTheme();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: weeklyLogs = [] } = useQuery<ActivityLog[]>({
    queryKey: ["analytics-weekly"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("user_id, user_name, module, action, created_at")
        .gte("created_at", sevenDaysAgo);
      return (data || []) as ActivityLog[];
    },
  });

  const { data: monthlyLogs = [] } = useQuery<ActivityLog[]>({
    queryKey: ["analytics-monthly"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("user_id, user_name, module, action, created_at")
        .gte("created_at", thirtyDaysAgo);
      return (data || []) as ActivityLog[];
    },
  });

  const { data: profiles = [] } = useQuery<AnalyticsProfile[]>({
    queryKey: ["analytics-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, team, role");
      return (data || []) as AnalyticsProfile[];
    },
  });

  const activeUsers7d = new Set(
    weeklyLogs
      .map((log) => log.user_id)
      .filter((userId): userId is string => Boolean(userId)),
  ).size;
  const todayLogs = monthlyLogs.filter(
    (log) => log.created_at && new Date(log.created_at) >= todayStart,
  );
  const todayActiveUsers = new Set(
    todayLogs
      .map((log) => log.user_id)
      .filter((userId): userId is string => Boolean(userId)),
  ).size;
  const todayActions = todayLogs.length;

  const dailyMap: Record<string, Set<string>> = {};
  monthlyLogs.forEach((log) => {
    if (!log.created_at || !log.user_id) return;
    const day = log.created_at.slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = new Set();
    dailyMap[day].add(log.user_id);
  });
  const dailyData = Object.entries(dailyMap)
    .map(([date, userIds]) => ({ date: date.slice(5), users: userIds.size }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const moduleCount: Record<string, number> = {};
  monthlyLogs.forEach((log) => {
    const moduleName = log.module || "기타";
    moduleCount[moduleName] = (moduleCount[moduleName] || 0) + 1;
  });
  const moduleData = Object.entries(moduleCount)
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value);

  const hourCount: Record<number, number> = {};
  monthlyLogs.forEach((log) => {
    if (!log.created_at) return;
    const hour = new Date(log.created_at).getHours();
    hourCount[hour] = (hourCount[hour] || 0) + 1;
  });
  const hourData = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${hour}시`,
    count: hourCount[hour] || 0,
  }));

  const actionCount: Record<string, number> = {};
  monthlyLogs.forEach((log) => {
    actionCount[log.action] = (actionCount[log.action] || 0) + 1;
  });
  const actionData = Object.entries(actionCount)
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 10);

  const userActivity = profiles
    .map((profile) => {
      const userLogs = monthlyLogs.filter(
        (log) => log.user_id === profile.id,
      );
      const todayCount = userLogs.filter(
        (log) => log.created_at && new Date(log.created_at) >= todayStart,
      ).length;
      const weekCount = userLogs.filter(
        (log) =>
          log.created_at && new Date(log.created_at) >= new Date(sevenDaysAgo),
      ).length;
      const moduleCounts = userLogs.reduce<Record<string, number>>(
        (counts, log) => {
          counts[log.module] = (counts[log.module] || 0) + 1;
          return counts;
        },
        {},
      );
      const topModule =
        Object.entries(moduleCounts).sort(
          ([, countA], [, countB]) => countB - countA,
        )[0]?.[0] || "-";

      return {
        ...profile,
        todayCount,
        weekCount,
        totalCount: userLogs.length,
        topModule,
      };
    })
    .sort((left, right) => right.totalCount - left.totalCount);

  const pageCount: Record<string, number> = {};
  monthlyLogs.forEach((log) => {
    const key = `${log.module}/${log.action}`;
    pageCount[key] = (pageCount[key] || 0) + 1;
  });
  const topPages = Object.entries(pageCount)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 10);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">사용자 활동 분석</h1>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="활성 사용자 (7일)"
            value={activeUsers7d}
            icon={Users}
            color="bg-primary/10 text-primary"
          />
          <KPICard
            title="오늘 접속"
            value={todayActiveUsers}
            icon={UserCheck}
            color="bg-success/10 text-success"
          />
          <KPICard
            title="오늘 활동"
            value={todayActions}
            icon={Activity}
            color="bg-accent/10 text-accent"
          />
          <KPICard
            title="총 사용자"
            value={profiles.length}
            icon={UserX}
            color="bg-warning/10 text-warning"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">
                일별 활성 사용자 (30일)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Bar
                    dataKey="users"
                    fill={CHART_COLORS.primary[0]}
                    radius={[3, 3, 0, 0]}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">
                모듈별 이용 빈도
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={moduleData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {moduleData.map((_, index) => (
                      <Cell
                        key={index}
                        fill={
                          CHART_COLORS.categorical[
                            index % CHART_COLORS.categorical.length
                          ]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {moduleData.slice(0, 6).map((item, index) => (
                  <div key={item.name} className="flex items-center gap-1">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{
                        background:
                          CHART_COLORS.categorical[
                            index % CHART_COLORS.categorical.length
                          ],
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {item.name} {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">
                시간대별 활동
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourData}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Bar
                    dataKey="count"
                    fill={CHART_COLORS.primary[1]}
                    radius={[3, 3, 0, 0]}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">
                액션 유형별 TOP 10
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={actionData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    width={80}
                  />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Bar
                    dataKey="value"
                    fill={CHART_COLORS.categorical[0]}
                    radius={[0, 3, 3, 0]}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              사용자별 활동
            </CardTitle>
          </CardHeader>
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
                    <th className="text-left py-2 font-medium">
                      주 이용 모듈
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {userActivity.map((activityItem) => (
                    <tr
                      key={activityItem.id}
                      className={`border-b last:border-0 ${
                        activityItem.totalCount === 0 ? "opacity-50" : ""
                      }`}
                    >
                      <td className="py-2 font-medium">
                        {activityItem.name || "-"}
                      </td>
                      <td className="py-2">
                        <Badge variant="outline" className="text-[10px]">
                          {activityItem.team || "-"}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {activityItem.role || "-"}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        {activityItem.todayCount}
                      </td>
                      <td className="py-2 text-right">
                        {activityItem.weekCount}
                      </td>
                      <td className="py-2 text-right">
                        {activityItem.totalCount}
                      </td>
                      <td className="py-2">{activityItem.topModule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground mt-4">
              활동 로그는 1년간 보관됩니다
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              페이지별 접근 순위 TOP 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topPages.map(([key, count], index) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-5">
                    {index + 1}
                  </span>
                  <span className="text-sm flex-1">{key}</span>
                  <span className="text-xs font-semibold">
                    {count.toLocaleString()}회
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
