/** P6-2: 예산 집행 분석 대시보드 */
import { useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Calculator, TrendingUp, Wallet, Gauge, FileSpreadsheet } from "lucide-react";
import { ComposedChart, Bar, Line, BarChart, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { CompareKPI } from "@/components/common/CompareKPI";
import { CHART_COLORS, ChartTooltipContent } from "@/lib/chart-config";
import { useTheme } from "@/hooks/useTheme";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { createExcelWorkbook } from "@/lib/excel-engine";

export default function BudgetAnalysis() {
  const { isDark } = useTheme();
  const { data: config } = useSystemConfig();
  const currentYear = new Date().getFullYear();

  const { data: plans = [] } = useQuery({
    queryKey: ['budget-plans-analysis'],
    queryFn: async () => {
      const { data } = await supabase.from('budget_plans').select('*').eq('fiscal_year', currentYear).eq('status', 'approved');
      return data || [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ['budget-items-analysis'],
    queryFn: async () => {
      const { data } = await supabase.from('budget_items').select('*');
      return data || [];
    },
  });

  const { data: executions = [] } = useQuery({
    queryKey: ['budget-exec-analysis'],
    queryFn: async () => {
      const { data } = await supabase.from('budget_executions').select('*').eq('status', 'approved');
      return data || [];
    },
  });

  // KPI
  const totalBudget = plans.reduce((s: number, p: any) => s + (p.total_revenue || 0) + (p.total_expenditure || 0), 0);
  const totalExecuted = items.reduce((s: number, i: any) => s + (i.executed_amount || 0), 0);
  const executionRate = totalBudget > 0 ? (totalExecuted / totalBudget) * 100 : 0;
  const remaining = totalBudget - totalExecuted;

  // 월별 집행 추이
  const monthlyExec = useMemo(() => {
    const map: Record<string, number> = {};
    executions.forEach((e: any) => {
      const m = e.execution_date?.slice(0, 7);
      if (m) map[m] = (map[m] || 0) + (e.amount || 0);
    });
    let cumulative = 0;
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
      const amount = map[m] || 0;
      cumulative += amount;
      return { month: `${i + 1}월`, amount: Math.round(amount / 10000), cumRate: totalBudget > 0 ? Number(((cumulative / totalBudget) * 100).toFixed(1)) : 0 };
    });
    return months;
  }, [executions, currentYear, totalBudget]);

  // 항목별 집행
  const itemExec = useMemo(() => {
    return items
      .filter((i: any) => i.category_l1 && !i.parent_item_id)
      .map((i: any) => ({
        name: i.item_name,
        allocated: Math.round((i.allocated_amount || i.planned_amount || 0) / 10000),
        executed: Math.round((i.executed_amount || 0) / 10000),
        rate: (i.allocated_amount || i.planned_amount) ? Number((((i.executed_amount || 0) / (i.allocated_amount || i.planned_amount || 1)) * 100).toFixed(1)) : 0,
      }))
      .sort((a: any, b: any) => b.allocated - a.allocated)
      .slice(0, 10);
  }, [items]);

  // 예산 소진 예측
  const burnDown = useMemo(() => {
    let balance = totalBudget;
    const currentMonth = new Date().getMonth();
    return Array.from({ length: 12 }, (_, i) => {
      const exec = monthlyExec[i]?.amount || 0;
      if (i <= currentMonth) balance -= exec * 10000;
      else balance -= (totalExecuted / Math.max(currentMonth + 1, 1)); // avg burn
      return { month: `${i + 1}월`, balance: Math.round(Math.max(0, balance) / 10000), type: i <= currentMonth ? '실제' : '예측' };
    });
  }, [monthlyExec, totalBudget, totalExecuted]);

  const handleExcelExport = () => {
    createExcelWorkbook({
      fileName: '예산집행분석',
      orgName: config?.org_name || '',
      title: `${currentYear}년 예산 집행 분석 보고서`,
      sheets: [
        {
          name: '예산 총괄', type: 'summary',
          headers: [
            { key: 'item', label: '항목', width: 20 },
            { key: 'value', label: '금액', format: 'currency', width: 18 },
            { key: 'note', label: '비고', width: 20 },
          ],
          data: [
            { item: '총 예산', value: totalBudget, note: '' },
            { item: '집행액', value: totalExecuted, note: '' },
            { item: '집행률', value: `${executionRate.toFixed(1)}%`, note: '' },
            { item: '잔액', value: remaining, note: '' },
          ],
          freezePane: { row: 1, col: 0 },
        },
        {
          name: '항목별 집행현황', type: 'data',
          headers: [
            { key: 'name', label: '항목명', width: 20 },
            { key: 'allocated', label: '배정(만원)', format: 'number', subTotal: 'sum' },
            { key: 'executed', label: '집행(만원)', format: 'number', subTotal: 'sum' },
            { key: 'rate', label: '집행률(%)', format: 'percent' },
          ],
          data: itemExec,
          autoFilter: true, freezePane: { row: 1, col: 0 },
          summaryRows: [{ type: 'total', label: '합 계', labelColumn: 0, style: 'bold_border' }],
        },
      ],
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">예산 집행 분석</h1>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleExcelExport}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> 분석 엑셀
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CompareKPI title="총 예산" value={Math.round(totalBudget / 10000)} suffix="만원" icon={Calculator} color="bg-primary/10 text-primary" />
          <CompareKPI title="집행액" value={Math.round(totalExecuted / 10000)} suffix="만원" icon={TrendingUp} color="bg-emerald-100 text-emerald-700" />
          <CompareKPI title="집행률" value={Number(executionRate.toFixed(1))} suffix="%" icon={Gauge} color={executionRate >= 50 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"} />
          <CompareKPI title="잔액" value={Math.round(remaining / 10000)} suffix="만원" icon={Wallet} color="bg-violet-100 text-violet-700" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 월별 집행 추이 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">월별 집행 추이</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={monthlyExec}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="amount" name="집행(만원)" fill={CHART_COLORS.primary[0]} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" dataKey="cumRate" name="누적집행률(%)" stroke={CHART_COLORS.status.active} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 항목별 집행 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">항목별 집행 현황</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {itemExec.map((item: any) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="truncate max-w-[180px]">{item.name}</span>
                      <span className="font-semibold">{item.rate}%</span>
                    </div>
                    <Progress value={item.rate} className="h-2" />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>집행 {item.executed.toLocaleString()}만</span>
                      <span>배정 {item.allocated.toLocaleString()}만</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 소진 예측 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">예산 소진 예측</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={burnDown}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Area type="monotone" dataKey="balance" name="잔액(만원)" stroke={CHART_COLORS.primary[1]} fill={CHART_COLORS.primary[1]} fillOpacity={0.15} />
                  <ReferenceLine y={0} stroke="#DC2626" strokeDasharray="3 3" label="예산 소진" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 집행 상세 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">최근 집행 내역</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">일자</TableHead>
                      <TableHead className="text-xs">설명</TableHead>
                      <TableHead className="text-xs text-right">금액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executions.slice(0, 8).map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{e.execution_date}</TableCell>
                        <TableCell className="text-xs truncate max-w-[150px]">{e.description}</TableCell>
                        <TableCell className="text-xs text-right">{(e.amount || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
