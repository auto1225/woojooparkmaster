/** P6-1: 수입 심화 분석 대시보드 (전면 교체) */
import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { supabase } from "@/integrations/api/supabase-compat";
import { useQuery } from "@tanstack/react-query";
import { Banknote, TrendingUp, Car, ShieldCheck, Percent, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { CompareKPI } from "@/components/common/CompareKPI";
import { PeriodCompare } from "@/components/common/PeriodCompare";
import { DateQuickFilter } from "@/components/common/DateQuickFilter";
import { CHART_COLORS, ChartTooltipContent } from "@/lib/chart-config";
import { useTheme } from "@/hooks/useTheme";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { createExcelWorkbook } from "@/lib/excel-engine";

const PAYMENT_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#6b7280'];
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export default function RevenueAnalysis() {
  const { isDark } = useTheme();
  const { data: config } = useSystemConfig();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [dateStart, setDateStart] = useState(monthStart.toISOString().split('T')[0]);
  const [dateEnd, setDateEnd] = useState(now.toISOString().split('T')[0]);
  const [lotFilter, setLotFilter] = useState('all');
  const [compareMode, setCompareMode] = useState(false);
  const [compareStart, setCompareStart] = useState<Date | null>(null);
  const [compareEnd, setCompareEnd] = useState<Date | null>(null);

  const { data: lots = [] } = useQuery({
    queryKey: ['lots-analysis'],
    queryFn: async () => {
      const { data } = await supabase.from('parking_lots').select('id, code, name, total_spaces').order('code');
      return data || [];
    },
  });

  const { data: rawData = [] } = useQuery({
    queryKey: ['rev-analysis', dateStart, dateEnd],
    queryFn: async () => {
      const { data } = await supabase.from('revenue_daily')
        .select('*, parking_lots(code, name)')
        .gte('revenue_date', dateStart).lte('revenue_date', dateEnd)
        .order('revenue_date', { ascending: false });
      return data || [];
    },
  });

  // Previous month data for KPI comparison
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const { data: prevData = [] } = useQuery({
    queryKey: ['rev-prev', prevMonthStart.toISOString(), prevMonthEnd.toISOString()],
    queryFn: async () => {
      const { data } = await supabase.from('revenue_daily')
        .select('revenue_date, total_amount, total_vehicles, exemption_amount, verified')
        .gte('revenue_date', prevMonthStart.toISOString().split('T')[0])
        .lte('revenue_date', prevMonthEnd.toISOString().split('T')[0]);
      return data || [];
    },
  });

  // 12 months data for trend
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const { data: trendData = [] } = useQuery({
    queryKey: ['rev-trend-12m'],
    queryFn: async () => {
      const { data } = await supabase.from('revenue_daily')
        .select('revenue_date, total_amount, cash_amount, card_amount, mobile_amount, monthly_pass_amount, other_amount, total_vehicles, lot_id')
        .gte('revenue_date', yearAgo.toISOString().split('T')[0]);
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    if (lotFilter === 'all') return rawData;
    return rawData.filter((r: any) => r.lot_id === lotFilter);
  }, [rawData, lotFilter]);

  // ── KPI 계산 ──
  const totalRevenue = filtered.reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  const days = new Set(filtered.map((r: any) => r.revenue_date)).size || 1;
  const dailyAvg = totalRevenue / days;
  const totalVehicles = filtered.reduce((s: number, r: any) => s + (r.total_vehicles || 0), 0);
  const unverified = filtered.filter((r: any) => !r.verified).length;
  const totalExemption = filtered.reduce((s: number, r: any) => s + (r.exemption_amount || 0), 0);
  const exemptionRate = totalRevenue > 0 ? (totalExemption / (totalRevenue + totalExemption)) * 100 : 0;

  const prevTotal = prevData.reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  const prevDays = new Set(prevData.map((r: any) => r.revenue_date)).size || 1;
  const prevDailyAvg = prevTotal / prevDays;
  const prevVehicles = prevData.reduce((s: number, r: any) => s + (r.total_vehicles || 0), 0);

  // ── 월별 추이 (12개월) ──
  const monthlyTrend = useMemo(() => {
    const map: Record<string, number> = {};
    trendData.forEach((r: any) => {
      const m = r.revenue_date?.slice(0, 7);
      if (m) map[m] = (map[m] || 0) + (r.total_amount || 0);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([month, amount]) => ({
      month: month.slice(5) + '월', amount: Math.round(amount / 10000),
    }));
  }, [trendData]);

  // ── 주차장별 TOP 10 ──
  const lotRanking = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    filtered.forEach((r: any) => {
      const name = r.parking_lots?.name || r.lot_id;
      if (!map[r.lot_id]) map[r.lot_id] = { name, total: 0 };
      map[r.lot_id].total += r.total_amount || 0;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10).map(v => ({
      name: v.name, total: Math.round(v.total / 10000),
    }));
  }, [filtered]);

  // ── 결제수단별 ──
  const paymentBreakdown = useMemo(() => {
    const cash = filtered.reduce((s: number, r: any) => s + (r.cash_amount || 0), 0);
    const card = filtered.reduce((s: number, r: any) => s + (r.card_amount || 0), 0);
    const mobile = filtered.reduce((s: number, r: any) => s + (r.mobile_amount || 0), 0);
    const pass = filtered.reduce((s: number, r: any) => s + (r.monthly_pass_amount || 0), 0);
    const other = filtered.reduce((s: number, r: any) => s + (r.other_amount || 0), 0);
    return [
      { name: '현금', value: cash }, { name: '카드', value: card },
      { name: '모바일', value: mobile }, { name: '정기권', value: pass }, { name: '기타', value: other },
    ].filter(v => v.value > 0);
  }, [filtered]);

  // ── 요일별 평균 ──
  const dayOfWeekAvg = useMemo(() => {
    const sums: number[] = Array(7).fill(0);
    const counts: number[] = Array(7).fill(0);
    filtered.forEach((r: any) => {
      const dow = new Date(r.revenue_date).getDay();
      sums[dow] += r.total_amount || 0;
      counts[dow]++;
    });
    return DAY_NAMES.map((name, i) => ({
      name, avg: counts[i] ? Math.round(sums[i] / counts[i] / 10000) : 0, isWeekend: i === 0 || i === 6,
    }));
  }, [filtered]);

  const handleDateQuick = (s: string, e: string) => { setDateStart(s); setDateEnd(e); };

  const handleExcelExport = () => {
    createExcelWorkbook({
      fileName: '수입분석보고서',
      orgName: config?.org_name || '',
      title: '수입 분석 보고서',
      subtitle: `기간: ${dateStart} ~ ${dateEnd}`,
      sheets: [
        {
          name: '수입 요약', type: 'summary',
          headers: [
            { key: 'item', label: '항목', width: 20 },
            { key: 'value', label: '값', width: 20, format: 'currency' },
            { key: 'note', label: '비고', width: 25 },
          ],
          data: [
            { item: '당월 총수입', value: totalRevenue, note: '' },
            { item: '일평균 수입', value: Math.round(dailyAvg), note: `${days}일 기준` },
            { item: '이용차량', value: totalVehicles, note: '' },
            { item: '미검증 건수', value: unverified, note: '' },
          ],
          freezePane: { row: 1, col: 0 },
        },
        {
          name: '일별 상세', type: 'data',
          headers: [
            { key: 'date', label: '날짜', format: 'date', width: 12 },
            { key: 'lotCode', label: '주차장코드', width: 10 },
            { key: 'lotName', label: '주차장명', width: 14 },
            { key: 'cash', label: '현금', format: 'currency', subTotal: 'sum' },
            { key: 'card', label: '카드', format: 'currency', subTotal: 'sum' },
            { key: 'mobile', label: '모바일', format: 'currency', subTotal: 'sum' },
            { key: 'pass', label: '정기권', format: 'currency', subTotal: 'sum' },
            { key: 'other', label: '기타', format: 'currency', subTotal: 'sum' },
            { key: 'total', label: '합계', format: 'currency', subTotal: 'sum' },
            { key: 'vehicles', label: '이용차량', format: 'number', subTotal: 'sum' },
            { key: 'verified', label: '검증', width: 8 },
          ],
          data: filtered.map((r: any) => ({
            date: r.revenue_date, lotCode: r.parking_lots?.code || '', lotName: r.parking_lots?.name || '',
            cash: r.cash_amount || 0, card: r.card_amount || 0, mobile: r.mobile_amount || 0,
            pass: r.monthly_pass_amount || 0, other: r.other_amount || 0,
            total: r.total_amount || 0, vehicles: r.total_vehicles || 0,
            verified: r.verified ? '완료' : '미검증',
          })),
          autoFilter: true,
          freezePane: { row: 1, col: 3 },
          summaryRows: [{ type: 'total', label: '합 계', labelColumn: 0, style: 'bold_border' }],
          pageSetup: { orientation: 'landscape', paperSize: 'A4', fitToPage: true, fitToWidth: 1 },
        },
        {
          name: '주차장별 집계', type: 'pivot',
          headers: [
            { key: 'rank', label: '순위', format: 'number', width: 6 },
            { key: 'name', label: '주차장명', width: 16 },
            { key: 'total', label: '총수입', format: 'currency', subTotal: 'sum' },
            { key: 'dailyAvg', label: '일평균', format: 'currency' },
            { key: 'vehicles', label: '이용차량', format: 'number', subTotal: 'sum' },
          ],
          data: lotRanking.map((l, i) => ({
            rank: i + 1, name: l.name, total: l.total * 10000,
            dailyAvg: Math.round(l.total * 10000 / days), vehicles: 0,
          })),
          autoFilter: true, freezePane: { row: 1, col: 0 },
          summaryRows: [{ type: 'total', label: '합 계', labelColumn: 0, style: 'bold_border' }],
        },
      ],
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">수입 심화 분석</h1>
          <div className="flex flex-wrap items-center gap-2">
            <DateQuickFilter onSelect={handleDateQuick} />
            <Select value={lotFilter} onValueChange={setLotFilter}>
              <SelectTrigger className="w-36 h-7 text-xs"><SelectValue placeholder="전체 주차장" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 주차장</SelectItem>
                {lots.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <PeriodCompare
              currentStart={new Date(dateStart)} currentEnd={new Date(dateEnd)}
              onCompareChange={(s, e, t) => { setCompareMode(true); setCompareStart(s); setCompareEnd(e); }}
              onCompareOff={() => setCompareMode(false)}
            />
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleExcelExport}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> 분석 엑셀
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <CompareKPI title="당월 총수입" value={Math.round(totalRevenue / 10000)} suffix="만원" icon={Banknote} color="bg-primary/10 text-primary" prevValue={Math.round(prevTotal / 10000)} prevLabel="전월비" />
          <CompareKPI title="일평균 수입" value={Math.round(dailyAvg / 10000)} suffix="만원" icon={TrendingUp} color="bg-emerald-100 text-emerald-700" prevValue={Math.round(prevDailyAvg / 10000)} prevLabel="전월비" />
          <CompareKPI title="이용차량" value={totalVehicles} suffix="대" icon={Car} color="bg-blue-100 text-blue-700" prevValue={prevVehicles} prevLabel="전월비" />
          <CompareKPI title="징수율" value={100} suffix="%" icon={ShieldCheck} color="bg-amber-100 text-amber-700" />
          <CompareKPI title="감면율" value={Number(exemptionRate.toFixed(1))} suffix="%" icon={Percent} color="bg-violet-100 text-violet-700" />
          <CompareKPI title="미검증 수입" value={unverified} suffix="건" icon={AlertTriangle} color="bg-red-100 text-red-600" />
        </div>

        {/* Charts 2×2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 월별 추이 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">월별 수입 추이 (최근 12개월)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Area type="monotone" dataKey="amount" stroke={CHART_COLORS.primary[0]} fill={CHART_COLORS.primary[0]} fillOpacity={0.2} name="수입(만원)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 주차장별 TOP 10 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">주차장별 수입 TOP 10</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={lotRanking} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Bar dataKey="total" name="수입(만원)" radius={[0, 4, 4, 0]}>
                    {lotRanking.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS.sequential[Math.min(7, Math.max(2, 7 - i))]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 결제수단별 도넛 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">결제수단별 비율</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={paymentBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {paymentBreakdown.map((_, i) => <Cell key={i} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <p className="text-center text-lg font-bold text-foreground mt-1">{(totalRevenue / 10000).toLocaleString()}만원</p>
            </CardContent>
          </Card>

          {/* 요일별 평균 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">요일별 평균 수입</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dayOfWeekAvg}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Bar dataKey="avg" name="평균(만원)" radius={[4, 4, 0, 0]}>
                    {dayOfWeekAvg.map((d, i) => <Cell key={i} fill={d.isWeekend ? CHART_COLORS.primary[3] : CHART_COLORS.primary[0]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* 일별 수입 테이블 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">일별 수입 상세</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">날짜</TableHead>
                    <TableHead className="text-xs">주차장</TableHead>
                    <TableHead className="text-xs text-right">현금</TableHead>
                    <TableHead className="text-xs text-right">카드</TableHead>
                    <TableHead className="text-xs text-right">모바일</TableHead>
                    <TableHead className="text-xs text-right">합계</TableHead>
                    <TableHead className="text-xs text-right">차량수</TableHead>
                    <TableHead className="text-xs text-center">검증</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 50).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.revenue_date}</TableCell>
                      <TableCell className="text-xs">{r.parking_lots?.name || '-'}</TableCell>
                      <TableCell className="text-xs text-right">{(r.cash_amount || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">{(r.card_amount || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">{(r.mobile_amount || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{(r.total_amount || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">{r.total_vehicles || 0}</TableCell>
                      <TableCell className="text-xs text-center">
                        <Badge variant={r.verified ? "default" : "outline"} className="text-[9px]">
                          {r.verified ? '완료' : '미검증'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="text-xs font-bold">합계</TableCell>
                    <TableCell className="text-xs text-right font-bold">{filtered.reduce((s: number, r: any) => s + (r.cash_amount || 0), 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right font-bold">{filtered.reduce((s: number, r: any) => s + (r.card_amount || 0), 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right font-bold">{filtered.reduce((s: number, r: any) => s + (r.mobile_amount || 0), 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right font-bold">{totalRevenue.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right font-bold">{totalVehicles.toLocaleString()}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            {filtered.length > 50 && <p className="text-xs text-muted-foreground mt-2">상위 50건 표시 중 (전체 {filtered.length}건)</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
