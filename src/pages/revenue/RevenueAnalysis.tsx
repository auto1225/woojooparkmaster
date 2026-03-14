import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Download, Sparkles, TrendingUp, TrendingDown, Minus, ChevronDown } from "lucide-react";
import { formatWon, formatManWon } from "@/types/revenue";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { callAI } from "@/lib/ai-service";
import { logActivity } from "@/lib/activity-logger";
type AggUnit = 'daily' | 'weekly' | 'monthly' | 'quarterly';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export default function RevenueAnalysis() {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const [dateStart, setDateStart] = useState(sixMonthsAgo.toISOString().split('T')[0]);
  const [dateEnd, setDateEnd] = useState(now.toISOString().split('T')[0]);
  const [aggUnit, setAggUnit] = useState<AggUnit>('monthly');
  const [showPrevYear, setShowPrevYear] = useState(false);
  const [aiInsight, setAiInsight] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [insightOpen, setInsightOpen] = useState(true);
  const { data: config } = useSystemConfig();
  const aiEnabled = config?.ai_enabled === 'true';

  const { data: lots } = useQuery({
    queryKey: ['lots-all'],
    queryFn: async () => {
      const { data } = await supabase.from('parking_lots').select('id, code, name').order('code');
      return data || [];
    },
  });

  const { data: rawData } = useQuery({
    queryKey: ['revenue-analysis', dateStart, dateEnd],
    queryFn: async () => {
      const { data } = await supabase.from('revenue_daily')
        .select('revenue_date, lot_id, cash_amount, card_amount, mobile_amount, monthly_pass_amount, other_amount, total_vehicles, parking_lots(code, name)')
        .gte('revenue_date', dateStart).lte('revenue_date', dateEnd)
        .order('revenue_date');
      return data || [];
    },
  });

  // Trend chart data (aggregated by unit)
  const trendData = useMemo(() => {
    if (!rawData) return [];
    const grouped: Record<string, { cash: number; card: number; mobile: number; pass: number; other: number }> = {};
    rawData.forEach(r => {
      let key: string;
      const d = new Date(r.revenue_date);
      switch (aggUnit) {
        case 'daily': key = r.revenue_date; break;
        case 'weekly': { const w = new Date(d); w.setDate(w.getDate() - w.getDay()); key = w.toISOString().split('T')[0]; break; }
        case 'monthly': key = r.revenue_date.slice(0, 7); break;
        case 'quarterly': key = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`; break;
      }
      if (!grouped[key]) grouped[key] = { cash: 0, card: 0, mobile: 0, pass: 0, other: 0 };
      grouped[key].cash += r.cash_amount || 0;
      grouped[key].card += r.card_amount || 0;
      grouped[key].mobile += r.mobile_amount || 0;
      grouped[key].pass += r.monthly_pass_amount || 0;
      grouped[key].other += r.other_amount || 0;
    });
    return Object.entries(grouped).sort().map(([period, v]) => ({
      period: period.length > 7 ? period.slice(5) : period,
      현금: Math.round(v.cash / 10000),
      카드: Math.round(v.card / 10000),
      모바일: Math.round(v.mobile / 10000),
      월정기: Math.round(v.pass / 10000),
      기타: Math.round(v.other / 10000),
    }));
  }, [rawData, aggUnit]);

  // Per-lot comparison
  const lotComparison = useMemo(() => {
    if (!rawData) return [];
    const byLot: Record<string, { name: string; total: number; cash: number; card: number; mobile: number; pass: number; other: number; days: Set<string> }> = {};
    rawData.forEach(r => {
      const key = r.lot_id;
      if (!byLot[key]) byLot[key] = { name: (r.parking_lots as any)?.name || key, total: 0, cash: 0, card: 0, mobile: 0, pass: 0, other: 0, days: new Set() };
      const t = (r.cash_amount || 0) + (r.card_amount || 0) + (r.mobile_amount || 0) + (r.monthly_pass_amount || 0) + (r.other_amount || 0);
      byLot[key].total += t;
      byLot[key].cash += r.cash_amount || 0;
      byLot[key].card += r.card_amount || 0;
      byLot[key].mobile += r.mobile_amount || 0;
      byLot[key].pass += r.monthly_pass_amount || 0;
      byLot[key].other += r.other_amount || 0;
      byLot[key].days.add(r.revenue_date);
    });
    return Object.values(byLot).sort((a, b) => b.total - a.total).slice(0, 20);
  }, [rawData]);

  const grandTotal = lotComparison.reduce((s, l) => ({
    total: s.total + l.total, cash: s.cash + l.cash, card: s.card + l.card,
    mobile: s.mobile + l.mobile, pass: s.pass + l.pass, other: s.other + l.other,
  }), { total: 0, cash: 0, card: 0, mobile: 0, pass: 0, other: 0 });

  const barData = lotComparison.slice(0, 20).map(l => ({ name: l.name.length > 8 ? l.name.slice(0, 8) + '…' : l.name, amount: Math.round(l.total / 10000) }));

  const fmtNum = (n: number) => n.toLocaleString();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">수입 분석</h1>

        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div><Label className="text-xs">시작일</Label><Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-36" /></div>
              <div><Label className="text-xs">종료일</Label><Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-36" /></div>
              <div className="w-28">
                <Label className="text-xs">집계 단위</Label>
                <Select value={aggUnit} onValueChange={v => setAggUnit(v as AggUnit)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">일별</SelectItem>
                    <SelectItem value="weekly">주별</SelectItem>
                    <SelectItem value="monthly">월별</SelectItem>
                    <SelectItem value="quarterly">분기별</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Checkbox id="prevYear" checked={showPrevYear} onCheckedChange={c => setShowPrevYear(!!c)} />
                <Label htmlFor="prevYear" className="text-xs">전년 동기</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">수입 추이 (만원)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trendData}>
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="현금" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="카드" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="모바일" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="월정기" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="기타" stackId="1" stroke="#6b7280" fill="#6b7280" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">주차장별 비교 TOP 20 (만원)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData} layout="vertical" margin={{ left: 70 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={65} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString() + '만원', '수입']} />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* AI Insight Section */}
        {aiEnabled && (
          <Card className={aiInsight ? 'border-blue-300 dark:border-blue-700' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-500" />AI 인사이트
                  {aiInsight && <Badge variant="outline" className="text-[10px] text-blue-600">AI 분석</Badge>}
                </CardTitle>
                <Button size="sm" variant={aiInsight ? 'outline' : 'default'} disabled={aiLoading}
                  onClick={async () => {
                    setAiLoading(true);
                    try {
                      const result = await callAI({
                        task: 'analyze_revenue',
                        input: {
                          period: { start: dateStart, end: dateEnd },
                          monthly_totals: trendData.slice(-6),
                          by_payment_method: { cash: grandTotal.cash, card: grandTotal.card, mobile: grandTotal.mobile },
                          top_lots: lotComparison.slice(0, 5).map(l => ({ name: l.name, total: l.total })),
                          bottom_lots: lotComparison.slice(-3).map(l => ({ name: l.name, total: l.total })),
                        },
                      });
                      setAiInsight(result);
                      await logActivity({ module: 'ai', action: 'analyze_revenue' });
                    } catch (e: any) {
                      setAiInsight(null);
                    } finally { setAiLoading(false); }
                  }}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />{aiLoading ? '분석 중...' : aiInsight ? '재분석' : 'AI 분석 실행'}
                </Button>
              </div>
            </CardHeader>
            {aiInsight && (
              <Collapsible open={insightOpen} onOpenChange={setInsightOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
                    <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${insightOpen ? 'rotate-180' : ''}`} />
                    {insightOpen ? '접기' : '펼치기'}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">추세:</span>
                      {aiInsight.trend === 'increasing' ? <><TrendingUp className="h-4 w-4 text-emerald-500" /><span className="text-emerald-600 text-sm">증가세</span></> :
                       aiInsight.trend === 'decreasing' ? <><TrendingDown className="h-4 w-4 text-red-500" /><span className="text-red-600 text-sm">감소세</span></> :
                       <><Minus className="h-4 w-4 text-muted-foreground" /><span className="text-sm">안정</span></>}
                    </div>
                    {aiInsight.summary && <p className="text-sm text-muted-foreground">{aiInsight.summary}</p>}
                    {aiInsight.anomalies?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1">이상치</p>
                        {aiInsight.anomalies.map((a: any, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground">• {a.date}: {a.reason}</p>
                        ))}
                      </div>
                    )}
                    {aiInsight.recommendations?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1">제언</p>
                        {aiInsight.recommendations.map((r: string, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground">• {r}</p>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground italic">※ AI가 생성한 분석입니다. 참고용으로 활용하세요.</p>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            )}
          </Card>
        )}

        {/* Summary table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">수입 통계 요약</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>주차장명</TableHead>
                    <TableHead className="text-right">현금</TableHead>
                    <TableHead className="text-right">카드</TableHead>
                    <TableHead className="text-right">모바일</TableHead>
                    <TableHead className="text-right">월정기권</TableHead>
                    <TableHead className="text-right">기타</TableHead>
                    <TableHead className="text-right font-bold text-primary">합계</TableHead>
                    <TableHead className="text-right">일평균</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lotComparison.map(l => (
                    <TableRow key={l.name}>
                      <TableCell>{l.name}</TableCell>
                      <TableCell className="text-right">{fmtNum(l.cash)}</TableCell>
                      <TableCell className="text-right">{fmtNum(l.card)}</TableCell>
                      <TableCell className="text-right">{fmtNum(l.mobile)}</TableCell>
                      <TableCell className="text-right">{fmtNum(l.pass)}</TableCell>
                      <TableCell className="text-right">{fmtNum(l.other)}</TableCell>
                      <TableCell className="text-right font-bold text-primary">{fmtNum(l.total)}</TableCell>
                      <TableCell className="text-right">{fmtNum(Math.round(l.total / (l.days.size || 1)))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold">
                    <TableCell>합계</TableCell>
                    <TableCell className="text-right">{fmtNum(grandTotal.cash)}</TableCell>
                    <TableCell className="text-right">{fmtNum(grandTotal.card)}</TableCell>
                    <TableCell className="text-right">{fmtNum(grandTotal.mobile)}</TableCell>
                    <TableCell className="text-right">{fmtNum(grandTotal.pass)}</TableCell>
                    <TableCell className="text-right">{fmtNum(grandTotal.other)}</TableCell>
                    <TableCell className="text-right text-primary">{fmtNum(grandTotal.total)}</TableCell>
                    <TableCell className="text-right">-</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
