import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/api/supabase-compat";
import { useQuery } from "@tanstack/react-query";
import { Banknote, TrendingUp, Car, AlertCircle, CheckCircle } from "lucide-react";
import { formatWon, formatManWon } from "@/types/revenue";
import { AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type PeriodType = 'today' | 'week' | 'month' | 'year';

function getPeriodRange(period: PeriodType) {
  const now = new Date();
  let start: Date;
  switch (period) {
    case 'today': start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case 'week': { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); start = d; break; }
    case 'month': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case 'year': start = new Date(now.getFullYear(), 0, 1); break;
  }
  return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] };
}

function getPrevPeriodRange(period: PeriodType) {
  const now = new Date();
  let start: Date, end: Date;
  switch (period) {
    case 'today': { const d = new Date(now); d.setDate(d.getDate() - 1); start = end = d; break; }
    case 'week': { const d = new Date(now); d.setDate(d.getDate() - d.getDay() - 7); start = new Date(d); end = new Date(d); end.setDate(end.getDate() + 6); break; }
    case 'month': { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); break; }
    case 'year': { start = new Date(now.getFullYear() - 1, 0, 1); end = new Date(now.getFullYear() - 1, 11, 31); break; }
  }
  return { start: start!.toISOString().split('T')[0], end: end!.toISOString().split('T')[0] };
}

const PERIOD_LABELS: Record<PeriodType, string> = { today: '오늘', week: '이번주', month: '이번달', year: '올해' };
const PIE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#6b7280'];

export default function RevenueDashboard() {
  const [period, setPeriod] = useState<PeriodType>('month');
  const { profile } = useAuth();
  const range = getPeriodRange(period);
  const prevRange = getPrevPeriodRange(period);

  const { data: currentData } = useQuery({
    queryKey: ['revenue-dashboard', range],
    queryFn: async () => {
      const { data } = await supabase
        .from('revenue_daily')
        .select('*, parking_lots(code, name)')
        .gte('revenue_date', range.start)
        .lte('revenue_date', range.end)
        .order('revenue_date', { ascending: true });
      return data || [];
    },
  });

  const { data: prevData } = useQuery({
    queryKey: ['revenue-dashboard-prev', prevRange],
    queryFn: async () => {
      const { data } = await supabase
        .from('revenue_daily')
        .select('cash_amount, card_amount, mobile_amount, monthly_pass_amount, other_amount, total_vehicles')
        .gte('revenue_date', prevRange.start)
        .lte('revenue_date', prevRange.end);
      return data || [];
    },
  });

  const { data: unverifiedList, refetch: refetchUnverified } = useQuery({
    queryKey: ['revenue-unverified'],
    queryFn: async () => {
      const { data } = await supabase
        .from('revenue_daily')
        .select('id, revenue_date, cash_amount, card_amount, mobile_amount, monthly_pass_amount, other_amount, data_source, parking_lots(code, name)')
        .eq('verified', false)
        .order('revenue_date', { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const stats = useMemo(() => {
    if (!currentData) return { total: 0, avg: 0, vehicles: 0, unverified: 0 };
    const total = currentData.reduce((s, r) => s + (r.cash_amount + r.card_amount + r.mobile_amount + r.monthly_pass_amount + r.other_amount), 0);
    const days = new Set(currentData.map(r => r.revenue_date)).size || 1;
    const vehicles = currentData.reduce((s, r) => s + (r.total_vehicles || 0), 0);
    const unverified = currentData.filter(r => !r.verified).length;
    return { total, avg: Math.round(total / days), vehicles, unverified };
  }, [currentData]);

  const prevTotal = useMemo(() => {
    if (!prevData) return 0;
    return prevData.reduce((s, r: any) => s + (r.cash_amount + r.card_amount + r.mobile_amount + r.monthly_pass_amount + r.other_amount), 0);
  }, [prevData]);

  const changeRate = prevTotal > 0 ? ((stats.total - prevTotal) / prevTotal * 100).toFixed(1) : null;

  // Daily trend chart data
  const trendData = useMemo(() => {
    if (!currentData) return [];
    const byDate: Record<string, number> = {};
    currentData.forEach(r => {
      const d = r.revenue_date;
      byDate[d] = (byDate[d] || 0) + (r.cash_amount + r.card_amount + r.mobile_amount + r.monthly_pass_amount + r.other_amount);
    });
    return Object.entries(byDate).sort().map(([date, amount]) => ({ date: date.slice(5), amount: Math.round(amount / 10000) }));
  }, [currentData]);

  // Payment method pie data
  const pieData = useMemo(() => {
    if (!currentData) return [];
    const sums = { 현금: 0, 카드: 0, 모바일: 0, 월정기권: 0, 기타: 0 };
    currentData.forEach(r => {
      sums['현금'] += r.cash_amount || 0;
      sums['카드'] += r.card_amount || 0;
      sums['모바일'] += r.mobile_amount || 0;
      sums['월정기권'] += r.monthly_pass_amount || 0;
      sums['기타'] += r.other_amount || 0;
    });
    return Object.entries(sums).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [currentData]);

  // Top 10 lots
  const topLots = useMemo(() => {
    if (!currentData) return [];
    const byLot: Record<string, { name: string; amount: number }> = {};
    currentData.forEach(r => {
      const key = r.lot_id;
      if (!byLot[key]) byLot[key] = { name: (r.parking_lots as any)?.name || key, amount: 0 };
      byLot[key].amount += (r.cash_amount + r.card_amount + r.mobile_amount + r.monthly_pass_amount + r.other_amount);
    });
    return Object.values(byLot).sort((a, b) => b.amount - a.amount).slice(0, 10).map(d => ({ ...d, amount: Math.round(d.amount / 10000) }));
  }, [currentData]);

  const handleVerify = async (id: string) => {
    if (!profile) return;
    const { error } = await supabase.from('revenue_daily').update({ verified: true, verified_by: profile.id, verified_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error('검증 실패'); return; }
    toast.success('검증 완료');
    refetchUnverified();
  };

  const kpis = [
    { label: '총 수입', value: formatManWon(stats.total), icon: Banknote, color: 'text-blue-600', change: changeRate },
    { label: '일평균 수입', value: formatManWon(stats.avg), icon: TrendingUp, color: 'text-green-600' },
    { label: '총 이용차량', value: stats.vehicles.toLocaleString() + '대', icon: Car, color: 'text-purple-600' },
    { label: '미검증 건수', value: stats.unverified + '건', icon: AlertCircle, color: 'text-orange-500' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">수입 현황</h1>
          <div className="flex gap-1">
            {(Object.keys(PERIOD_LABELS) as PeriodType[]).map(p => (
              <Button key={p} size="sm" variant={period === p ? 'default' : 'outline'} onClick={() => setPeriod(p)}>
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {kpis.map(k => (
            <Card key={k.label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{k.label}</p>
                    <p className="text-2xl font-bold mt-1">{k.value}</p>
                    {k.change && (
                      <p className={`text-xs mt-1 ${Number(k.change) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {Number(k.change) >= 0 ? '▲' : '▼'} {Math.abs(Number(k.change))}% 전기 대비
                      </p>
                    )}
                  </div>
                  <k.icon className={`h-8 w-8 ${k.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">일별 수입 추이 (만원)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString() + '만원', '수입']} />
                  <Area type="monotone" dataKey="amount" stroke="#3b82f6" fill="url(#revGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">결제수단별 구성</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatWon(v)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">주차장별 수입 TOP 10 (만원)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topLots} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString() + '만원', '수입']} />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">최근 미검증 수입</CardTitle></CardHeader>
            <CardContent>
              {(!unverifiedList || unverifiedList.length === 0) ? (
                <p className="text-sm text-muted-foreground py-8 text-center">미검증 항목이 없습니다</p>
              ) : (
                <div className="space-y-3">
                  {unverifiedList.map((item: any) => {
                    const total = (item.cash_amount || 0) + (item.card_amount || 0) + (item.mobile_amount || 0) + (item.monthly_pass_amount || 0) + (item.other_amount || 0);
                    return (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <div>
                          <p className="text-sm font-medium">{item.parking_lots?.name || '-'}</p>
                          <p className="text-xs text-muted-foreground">{item.revenue_date} · {formatWon(total)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{item.data_source}</Badge>
                          <Button size="sm" variant="outline" onClick={() => handleVerify(item.id)}>
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />검증
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
