/** P6-3: 민원 심화 분석 (업그레이드) */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, CheckCircle, Clock, Star, AlertTriangle, Repeat, FileSpreadsheet } from "lucide-react";
import { CompareKPI } from "@/components/common/CompareKPI";
import { CATEGORY_LABELS, CHANNEL_LABELS } from "@/types/complaint";
import { PieChart, Pie, Cell, BarChart, Bar, ComposedChart, Line, Area, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine, Treemap } from "recharts";
import { CHART_COLORS, ChartTooltipContent } from "@/lib/chart-config";
import { useTheme } from "@/hooks/useTheme";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { createExcelWorkbook } from "@/lib/excel-engine";

const CATEGORY_COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6b7280"];

export default function ComplaintStats() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { data: config } = useSystemConfig();
  const [period, setPeriod] = useState("year");
  const [tab, setTab] = useState("overview");

  const { data: complaints = [] } = useQuery({
    queryKey: ["complaints-stats-all"],
    queryFn: async () => {
      const { data } = await supabase.from("complaints").select("*, parking_lots(name)").order("received_at", { ascending: false });
      return data || [];
    },
  });

  const { data: hotspots = [] } = useQuery({
    queryKey: ["complaint-hotspots"],
    queryFn: async () => { const { data } = await supabase.from("complaint_hotspot").select("*"); return data || []; },
  });

  const { data: staffPerf = [] } = useQuery({
    queryKey: ["complaint-staff-perf"],
    queryFn: async () => { const { data } = await supabase.from("complaint_staff_performance").select("*"); return data || []; },
  });

  const now = new Date();
  const periodFiltered = useMemo(() => {
    let start = new Date(now.getFullYear(), 0, 1);
    if (period === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (period === "quarter") start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return complaints.filter((c: any) => new Date(c.received_at) >= start);
  }, [complaints, period]);

  // Previous period for comparison
  const prevFiltered = useMemo(() => {
    if (period === "month") {
      const ps = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const pe = new Date(now.getFullYear(), now.getMonth(), 0);
      return complaints.filter((c: any) => { const d = new Date(c.received_at); return d >= ps && d <= pe; });
    }
    return [];
  }, [complaints, period]);

  // KPIs
  const total = periodFiltered.length;
  const closed = periodFiltered.filter((c: any) => c.status === "closed").length;
  const closeRate = total > 0 ? Math.round((closed / total) * 100) : 0;
  const closedWithTime = periodFiltered.filter((c: any) => c.closed_at);
  const avgDays = closedWithTime.length
    ? closedWithTime.reduce((s: number, c: any) => s + (new Date(c.closed_at).getTime() - new Date(c.received_at).getTime()) / 86400000, 0) / closedWithTime.length
    : 0;
  const slaCount = closedWithTime.filter((c: any) => {
    const d = (new Date(c.closed_at).getTime() - new Date(c.received_at).getTime()) / 86400000;
    return d <= 7;
  }).length;
  const slaRate = closedWithTime.length > 0 ? (slaCount / closedWithTime.length) * 100 : 0;
  const withScore = periodFiltered.filter((c: any) => c.satisfaction_score);
  const avgSat = withScore.length ? withScore.reduce((s: number, c: any) => s + c.satisfaction_score, 0) / withScore.length : 0;

  // Repeat complaints
  const repeatComplaints = useMemo(() => {
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const recent = complaints.filter((c: any) => new Date(c.received_at) >= sixMonthsAgo);
    const map: Record<string, any[]> = {};
    recent.forEach((c: any) => {
      const key = `${c.lot_id}_${c.category}`;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    });
    return Object.entries(map)
      .filter(([_, items]) => items.length >= 2)
      .map(([key, items]) => {
        const avgProcDays = items.filter((c: any) => c.closed_at).length > 0
          ? items.filter((c: any) => c.closed_at).reduce((s: number, c: any) => s + (new Date(c.closed_at).getTime() - new Date(c.received_at).getTime()) / 86400000, 0) / items.filter((c: any) => c.closed_at).length
          : 0;
        return {
          lotName: items[0].parking_lots?.name || '-',
          category: CATEGORY_LABELS[items[0].category] || items[0].category,
          count: items.length,
          lastDate: items[0].received_at.split('T')[0],
          avgDays: Math.round(avgProcDays * 10) / 10,
          lotId: items[0].lot_id,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [complaints]);

  const prevTotal = prevFiltered.length;

  // Category distribution
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    periodFiltered.forEach((c: any) => { map[c.category] = (map[c.category] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: CATEGORY_LABELS[k] || k, value: v })).sort((a, b) => b.value - a.value);
  }, [periodFiltered]);

  // Monthly trend
  const monthlyData = useMemo(() => {
    const map: Record<string, { 접수: number; 처리: number }> = {};
    periodFiltered.forEach((c: any) => {
      const m = c.received_at.slice(0, 7);
      if (!map[m]) map[m] = { 접수: 0, 처리: 0 };
      map[m].접수++;
      if (c.status === "closed") map[m].처리++;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([month, d]) => ({
      month: month.slice(5) + '월', ...d, 미처리: d.접수 - d.처리,
    }));
  }, [periodFiltered]);

  // Channel distribution
  const channelData = useMemo(() => {
    const map: Record<string, number> = {};
    periodFiltered.forEach((c: any) => { map[c.channel] = (map[c.channel] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: CHANNEL_LABELS[k] || k, value: v })).sort((a, b) => b.value - a.value);
  }, [periodFiltered]);

  // Resolution time distribution
  const resTimeData = useMemo(() => {
    const bins = [
      { label: "1일이내", max: 1, count: 0, color: "#10b981" },
      { label: "2~3일", max: 3, count: 0, color: "#3b82f6" },
      { label: "4~7일", max: 7, count: 0, color: "#f59e0b" },
      { label: "8~14일", max: 14, count: 0, color: "#f97316" },
      { label: "15일+", max: Infinity, count: 0, color: "#ef4444" },
    ];
    closedWithTime.forEach((c: any) => {
      const days = (new Date(c.closed_at).getTime() - new Date(c.received_at).getTime()) / 86400000;
      const bin = bins.find((b, i) => days <= b.max || i === bins.length - 1);
      if (bin) bin.count++;
    });
    return bins.map(b => ({ name: b.label, 건수: b.count, fill: b.color }));
  }, [closedWithTime]);

  // Lot heatmap (treemap data)
  const lotTreemap = useMemo(() => {
    const map: Record<string, { name: string; size: number }> = {};
    periodFiltered.forEach((c: any) => {
      const name = c.parking_lots?.name || '기타';
      if (!map[name]) map[name] = { name, size: 0 };
      map[name].size++;
    });
    return Object.values(map).sort((a, b) => b.size - a.size);
  }, [periodFiltered]);

  // Monthly satisfaction trend
  const satTrend = useMemo(() => {
    const map: Record<string, { sum: number; count: number }> = {};
    periodFiltered.filter((c: any) => c.satisfaction_score).forEach((c: any) => {
      const m = c.received_at.slice(0, 7);
      if (!map[m]) map[m] = { sum: 0, count: 0 };
      map[m].sum += c.satisfaction_score;
      map[m].count++;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([month, d]) => ({
      month: month.slice(5) + '월', satisfaction: Number((d.sum / d.count).toFixed(1)),
    }));
  }, [periodFiltered]);

  // SLA monthly
  const slaTrend = useMemo(() => {
    const map: Record<string, { total: number; met: number }> = {};
    closedWithTime.forEach((c: any) => {
      const m = c.received_at.slice(0, 7);
      if (!map[m]) map[m] = { total: 0, met: 0 };
      map[m].total++;
      const days = (new Date(c.closed_at).getTime() - new Date(c.received_at).getTime()) / 86400000;
      if (days <= 7) map[m].met++;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([month, d]) => ({
      month: month.slice(5) + '월', rate: Number(((d.met / d.total) * 100).toFixed(1)),
    }));
  }, [closedWithTime]);

  const handleExcelExport = () => {
    createExcelWorkbook({
      fileName: '민원분석보고서',
      orgName: config?.org_name || '',
      title: '민원 분석 보고서',
      sheets: [
        {
          name: '민원 요약', type: 'summary',
          headers: [
            { key: 'item', label: '항목', width: 20 },
            { key: 'value', label: '값', width: 15 },
          ],
          data: [
            { item: '총 접수', value: total },
            { item: '처리완료', value: `${closed} (${closeRate}%)` },
            { item: '평균 처리일', value: `${avgDays.toFixed(1)}일` },
            { item: 'SLA 달성률', value: `${slaRate.toFixed(1)}%` },
            { item: '평균 만족도', value: `${avgSat.toFixed(1)}점` },
            { item: '반복민원', value: `${repeatComplaints.length}건` },
          ],
          freezePane: { row: 1, col: 0 },
        },
        {
          name: '민원 전체목록', type: 'data',
          headers: [
            { key: 'date', label: '접수일', format: 'date' as const, width: 12 },
            { key: 'lot', label: '주차장', width: 14 },
            { key: 'category', label: '유형', width: 10 },
            { key: 'channel', label: '채널', width: 8 },
            { key: 'status', label: '상태', width: 8 },
            { key: 'days', label: '처리일수', format: 'number' as const },
            { key: 'satisfaction', label: '만족도', format: 'number' as const },
          ],
          data: periodFiltered.map((c: any) => ({
            date: c.received_at?.split('T')[0],
            lot: c.parking_lots?.name || '-',
            category: CATEGORY_LABELS[c.category] || c.category,
            channel: CHANNEL_LABELS[c.channel] || c.channel,
            status: c.status,
            days: c.closed_at ? Math.round((new Date(c.closed_at).getTime() - new Date(c.received_at).getTime()) / 86400000) : '-',
            satisfaction: c.satisfaction_score || '-',
          })),
          autoFilter: true, freezePane: { row: 1, col: 0 },
        },
        {
          name: '반복민원 현황', type: 'data',
          headers: [
            { key: 'lotName', label: '주차장', width: 14 },
            { key: 'category', label: '유형', width: 10 },
            { key: 'count', label: '건수', format: 'number' as const },
            { key: 'lastDate', label: '최근발생', format: 'date' as const },
            { key: 'avgDays', label: '평균처리일', format: 'number' as const },
          ],
          data: repeatComplaints,
          autoFilter: true, freezePane: { row: 1, col: 0 },
        },
      ],
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">민원 심화 분석</h2>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">이번달</SelectItem>
                <SelectItem value="quarter">이번분기</SelectItem>
                <SelectItem value="year">올해</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleExcelExport}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> 분석 엑셀
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <CompareKPI title="당월 접수" value={total} icon={MessageSquare} color="bg-primary/10 text-primary" prevValue={prevTotal} prevLabel="전월비" />
          <CompareKPI title="처리완료" value={closed} suffix={`건 (${closeRate}%)`} icon={CheckCircle} color="bg-emerald-100 text-emerald-700" />
          <CompareKPI title="평균 처리시간" value={Number(avgDays.toFixed(1))} suffix="일" icon={Clock} color="bg-violet-100 text-violet-700" />
          <CompareKPI title="SLA 달성률" value={Number(slaRate.toFixed(1))} suffix="%" icon={AlertTriangle} color={slaRate >= 90 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"} />
          <CompareKPI title="만족도 평균" value={Number(avgSat.toFixed(1))} suffix="점" icon={Star} color="bg-amber-100 text-amber-700" />
          <CompareKPI title="반복민원" value={repeatComplaints.length} suffix="건" icon={Repeat} color="bg-red-100 text-red-600" />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview" className="text-xs">분석 차트</TabsTrigger>
            <TabsTrigger value="sla" className="text-xs">SLA 현황</TabsTrigger>
            <TabsTrigger value="repeat" className="text-xs">반복민원</TabsTrigger>
            <TabsTrigger value="staff" className="text-xs">담당자 실적</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {/* 월별 접수·처리 추이 */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">월별 접수·처리 추이</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                      <Legend />
                      <Bar dataKey="접수" fill={CHART_COLORS.primary[0]} radius={[4, 4, 0, 0]} />
                      <Line dataKey="처리" stroke={CHART_COLORS.status.active} strokeWidth={2} dot={{ r: 3 }} />
                      <Area dataKey="미처리" fill={CHART_COLORS.status.danger} fillOpacity={0.1} stroke={CHART_COLORS.status.danger} strokeDasharray="3 3" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* 유형별 도넛 */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">유형별 분포</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
                        {categoryData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <p className="text-center font-bold text-lg">{total}건</p>
                </CardContent>
              </Card>

              {/* 채널별 */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">채널별 접수</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={channelData} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                      <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                      <Bar dataKey="value" name="건수" fill={CHART_COLORS.primary[0]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* 처리시간 분포 */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">처리시간 분포</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={resTimeData}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                      <ReferenceLine x="4~7일" stroke="#DC2626" strokeDasharray="3 3" label={{ value: "SLA 7일", fontSize: 9 }} />
                      <Bar dataKey="건수" radius={[4, 4, 0, 0]}>
                        {resTimeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* 주차장별 민원 집중도 */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">주차장별 민원 집중도</CardTitle></CardHeader>
                <CardContent>
                  {lotTreemap.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <Treemap data={lotTreemap} dataKey="size" nameKey="name" stroke="#fff" fill={CHART_COLORS.primary[0]}>
                        <Tooltip formatter={(v: any) => `${v}건`} />
                      </Treemap>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
                  )}
                </CardContent>
              </Card>

              {/* 만족도 추이 */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">만족도 추이</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={satTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 5]} />
                      <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                      <ReferenceLine y={4.0} stroke={CHART_COLORS.status.active} strokeDasharray="3 3" label={{ value: "목표 4.0", fontSize: 9 }} />
                      <Line dataKey="satisfaction" name="만족도" stroke={CHART_COLORS.primary[0]} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sla" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">월별 SLA 달성률 추이</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={slaTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                    <ReferenceLine y={90} stroke="#DC2626" strokeDasharray="3 3" label={{ value: "목표 90%", fontSize: 10 }} />
                    <Line dataKey="rate" name="SLA 달성률(%)" stroke={CHART_COLORS.primary[0]} strokeWidth={2} dot={{ r: 4, fill: '#fff', stroke: CHART_COLORS.primary[0] }}>
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* SLA 초과 임박 건 */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">SLA 초과 임박 (5일 이상 미처리)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">접수일</TableHead>
                      <TableHead className="text-xs">주차장</TableHead>
                      <TableHead className="text-xs">유형</TableHead>
                      <TableHead className="text-xs text-right">경과일</TableHead>
                      <TableHead className="text-xs">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodFiltered
                      .filter((c: any) => c.status !== 'closed' && (now.getTime() - new Date(c.received_at).getTime()) / 86400000 >= 5)
                      .slice(0, 15)
                      .map((c: any) => {
                        const elapsed = Math.round((now.getTime() - new Date(c.received_at).getTime()) / 86400000);
                        return (
                          <TableRow key={c.id} className={elapsed > 7 ? 'bg-destructive/5' : 'bg-amber-50/50 dark:bg-amber-950/10'}>
                            <TableCell className="text-xs">{c.received_at.split('T')[0]}</TableCell>
                            <TableCell className="text-xs">{c.parking_lots?.name || '-'}</TableCell>
                            <TableCell className="text-xs">{CATEGORY_LABELS[c.category] || c.category}</TableCell>
                            <TableCell className="text-xs text-right font-bold">{elapsed}일</TableCell>
                            <TableCell><Badge variant={elapsed > 7 ? 'destructive' : 'outline'} className="text-[9px]">{elapsed > 7 ? 'SLA 초과' : '임박'}</Badge></TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="repeat" className="mt-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">반복민원 현황 (최근 6개월, 동일 주차장+유형 2건 이상)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">주차장</TableHead>
                      <TableHead className="text-xs">민원유형</TableHead>
                      <TableHead className="text-xs text-right">발생건수</TableHead>
                      <TableHead className="text-xs">최근발생</TableHead>
                      <TableHead className="text-xs text-right">평균처리일</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repeatComplaints.map((r, i) => (
                      <TableRow key={i} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/complaints?lot=${r.lotId}&category=${r.category}`)}>
                        <TableCell className="text-xs font-medium">{r.lotName}</TableCell>
                        <TableCell className="text-xs">{r.category}</TableCell>
                        <TableCell className="text-xs text-right font-bold text-destructive">{r.count}건</TableCell>
                        <TableCell className="text-xs">{r.lastDate}</TableCell>
                        <TableCell className="text-xs text-right">{r.avgDays}일</TableCell>
                      </TableRow>
                    ))}
                    {repeatComplaints.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">반복민원 없음</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">담당자별 처리 실적</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">이름</TableHead>
                      <TableHead className="text-xs">팀</TableHead>
                      <TableHead className="text-xs text-right">배정</TableHead>
                      <TableHead className="text-xs text-right">처리</TableHead>
                      <TableHead className="text-xs text-right">미처리</TableHead>
                      <TableHead className="text-xs text-right">기한초과</TableHead>
                      <TableHead className="text-xs text-right">평균처리일</TableHead>
                      <TableHead className="text-xs text-right">만족도</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffPerf.filter((s: any) => s.assigned_count > 0).map((s: any) => (
                      <TableRow key={s.staff_id}>
                        <TableCell className="text-xs font-medium">{s.staff_name}</TableCell>
                        <TableCell className="text-xs">{s.team}</TableCell>
                        <TableCell className="text-xs text-right">{s.assigned_count}</TableCell>
                        <TableCell className="text-xs text-right">{s.closed_count}</TableCell>
                        <TableCell className="text-xs text-right">{s.open_count}</TableCell>
                        <TableCell className="text-xs text-right">{Number(s.overdue_count) > 0 ? <span className="text-destructive font-bold">{s.overdue_count}</span> : "0"}</TableCell>
                        <TableCell className="text-xs text-right">{s.avg_resolution_days || "-"}일</TableCell>
                        <TableCell className="text-xs text-right">{s.avg_satisfaction || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
