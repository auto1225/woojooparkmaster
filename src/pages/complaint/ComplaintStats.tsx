import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, CheckCircle, Clock, Star } from "lucide-react";
import { CATEGORY_LABELS, CHANNEL_LABELS, COMPLAINT_STATUS_LABELS } from "@/types/complaint";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const CATEGORY_COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6b7280"];

export default function ComplaintStats() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("year");

  const { data: complaints } = useQuery({
    queryKey: ["complaints-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("complaints").select("*").order("received_at", { ascending: false });
      return data || [];
    },
  });

  const { data: hotspots } = useQuery({
    queryKey: ["complaint-hotspots"],
    queryFn: async () => {
      const { data } = await supabase.from("complaint_hotspot").select("*");
      return data || [];
    },
  });

  const { data: staffPerf } = useQuery({
    queryKey: ["complaint-staff-perf"],
    queryFn: async () => {
      const { data } = await supabase.from("complaint_staff_performance").select("*");
      return data || [];
    },
  });

  const periodFiltered = useMemo(() => {
    if (!complaints) return [];
    const now = new Date();
    let start = new Date(now.getFullYear(), 0, 1);
    if (period === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (period === "quarter") start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return complaints.filter(c => new Date(c.received_at) >= start);
  }, [complaints, period]);

  const stats = useMemo(() => {
    const total = periodFiltered.length;
    const closed = periodFiltered.filter(c => c.status === "closed").length;
    const closedWithTime = periodFiltered.filter(c => c.closed_at);
    const avgDays = closedWithTime.length
      ? closedWithTime.reduce((s, c) => s + (new Date(c.closed_at!).getTime() - new Date(c.received_at).getTime()) / 86400000, 0) / closedWithTime.length
      : 0;
    const withScore = periodFiltered.filter(c => c.satisfaction_score);
    const avgSat = withScore.length ? withScore.reduce((s, c) => s + (c.satisfaction_score || 0), 0) / withScore.length : 0;
    return { total, closed, rate: total ? Math.round(closed / total * 100) : 0, avgDays: Math.round(avgDays * 10) / 10, avgSat: Math.round(avgSat * 10) / 10 };
  }, [periodFiltered]);

  // Category distribution
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    periodFiltered.forEach(c => { map[c.category] = (map[c.category] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: CATEGORY_LABELS[k] || k, value: v, key: k }));
  }, [periodFiltered]);

  // Monthly trend
  const monthlyData = useMemo(() => {
    const map: Record<string, { month: string; 접수: number; 완결: number }> = {};
    periodFiltered.forEach(c => {
      const m = c.received_at.slice(0, 7);
      if (!map[m]) map[m] = { month: m, 접수: 0, 완결: 0 };
      map[m].접수++;
      if (c.status === "closed") map[m].완결++;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  }, [periodFiltered]);

  // Channel distribution
  const channelData = useMemo(() => {
    const map: Record<string, number> = {};
    periodFiltered.forEach(c => { map[c.channel] = (map[c.channel] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: CHANNEL_LABELS[k] || k, value: v })).sort((a, b) => b.value - a.value);
  }, [periodFiltered]);

  // Resolution time distribution
  const resTimeData = useMemo(() => {
    const bins = [
      { label: "1일이내", max: 1, count: 0, color: "#10b981" },
      { label: "2~3일", max: 3, count: 0, color: "#3b82f6" },
      { label: "4~7일", max: 7, count: 0, color: "#f59e0b" },
      { label: "8~14일", max: 14, count: 0, color: "#f97316" },
      { label: "15일이상", max: Infinity, count: 0, color: "#ef4444" },
    ];
    periodFiltered.filter(c => c.closed_at).forEach(c => {
      const days = (new Date(c.closed_at!).getTime() - new Date(c.received_at).getTime()) / 86400000;
      const bin = bins.find((b, i) => days <= b.max || i === bins.length - 1);
      if (bin) bin.count++;
    });
    return bins.map(b => ({ name: b.label, 건수: b.count, fill: b.color }));
  }, [periodFiltered]);

  const kpis = [
    { label: "총 접수", value: stats.total, icon: MessageSquare, color: "text-blue-600" },
    { label: "처리 완료", value: `${stats.closed} (${stats.rate}%)`, icon: CheckCircle, color: "text-green-600" },
    { label: "평균 처리일", value: `${stats.avgDays}일`, icon: Clock, color: "text-purple-600" },
    { label: "평균 만족도", value: `${stats.avgSat}점`, icon: Star, color: "text-orange-600" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">민원 통계</h2>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">이번달</SelectItem>
              <SelectItem value="quarter">이번분기</SelectItem>
              <SelectItem value="year">올해</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map(k => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <k.icon className={`h-4 w-4 ${k.color}`} />
                  <span className="text-[10px] text-muted-foreground uppercase">{k.label}</span>
                </div>
                <span className="text-2xl font-bold">{k.value}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">유형별 분포</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {categoryData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">월별 접수 추이</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="접수" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="완결" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">채널별 접수</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={channelData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">처리 소요시간 분포</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={resTimeData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="건수" radius={[4, 4, 0, 0]}>
                    {resTimeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Hotspot Table */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">주차장별 민원 핫스팟</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>주차장</TableHead>
                  <TableHead className="text-right">총 민원</TableHead>
                  <TableHead className="text-right">최근30일</TableHead>
                  <TableHead className="text-right">최근90일</TableHead>
                  <TableHead className="text-right">반복민원</TableHead>
                  <TableHead>주요유형</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hotspots?.map((h: any, i: number) => (
                  <TableRow key={h.lot_id} className={`cursor-pointer hover:bg-muted/50 ${i < 3 ? "bg-destructive/5" : ""}`} onClick={() => navigate(`/lots/${h.lot_id}`)}>
                    <TableCell className="text-sm font-medium">
                      {h.lot_name} {i < 3 && <Badge variant="destructive" className="text-[9px] ml-1">핫스팟</Badge>}
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold">{h.total_complaints}</TableCell>
                    <TableCell className="text-right text-sm">{h.last_30_days}</TableCell>
                    <TableCell className="text-right text-sm">{h.last_90_days}</TableCell>
                    <TableCell className="text-right text-sm">{h.repeat_count}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[h.top_category] || h.top_category}</Badge></TableCell>
                  </TableRow>
                ))}
                {!hotspots?.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">데이터 없음</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Staff Performance */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">담당자별 처리 실적</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>팀</TableHead>
                  <TableHead className="text-right">배정건</TableHead>
                  <TableHead className="text-right">처리건</TableHead>
                  <TableHead className="text-right">미처리</TableHead>
                  <TableHead className="text-right">기한초과</TableHead>
                  <TableHead className="text-right">평균처리일</TableHead>
                  <TableHead className="text-right">만족도</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffPerf?.filter((s: any) => s.assigned_count > 0).map((s: any) => (
                  <TableRow key={s.staff_id} className={Number(s.overdue_count) > 2 ? "bg-orange-50 dark:bg-orange-950/10" : ""}>
                    <TableCell className="text-sm font-medium">{s.staff_name}</TableCell>
                    <TableCell className="text-xs">{s.team}</TableCell>
                    <TableCell className="text-right text-sm">{s.assigned_count}</TableCell>
                    <TableCell className="text-right text-sm">{s.closed_count}</TableCell>
                    <TableCell className="text-right text-sm">{s.open_count}</TableCell>
                    <TableCell className="text-right text-sm">{Number(s.overdue_count) > 0 ? <span className="text-orange-600 font-bold">{s.overdue_count}</span> : "0"}</TableCell>
                    <TableCell className="text-right text-sm">{s.avg_resolution_days || "-"}일</TableCell>
                    <TableCell className="text-right text-sm">{s.avg_satisfaction || "-"}</TableCell>
                  </TableRow>
                ))}
                {!staffPerf?.filter((s: any) => s.assigned_count > 0).length && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">데이터 없음</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
