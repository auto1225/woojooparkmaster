import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Receipt, Wallet, AlertCircle } from "lucide-react";
import { formatManWon } from "@/types/revenue";
import { PLAN_TYPE_LABELS, BUDGET_STATUS_LABELS, BUDGET_STATUS_COLORS } from "@/types/budget";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useModuleLicenses } from "@/hooks/useSystemConfig";

export default function BudgetDashboard() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const { data: licenses } = useModuleLicenses();
  const revenueActive = (licenses ?? []).some(m => m.module_code === 'REVENUE' && m.is_active);

  const { data: plans } = useQuery({
    queryKey: ['budget-plans', year],
    queryFn: async () => {
      const { data } = await supabase.from('budget_plans').select('*').eq('fiscal_year', year).order('plan_type').order('plan_number');
      return data || [];
    },
  });

  const activePlan = plans?.find(p => p.id === selectedPlanId) || plans?.[0];

  const { data: items } = useQuery({
    queryKey: ['budget-items-dashboard', activePlan?.id],
    enabled: !!activePlan?.id,
    queryFn: async () => {
      const { data } = await supabase.from('budget_items').select('*').eq('plan_id', activePlan!.id).eq('is_summary', false);
      return data || [];
    },
  });

  const { data: revenueTotal } = useQuery({
    queryKey: ['revenue-year-total', year],
    enabled: revenueActive,
    queryFn: async () => {
      const { data } = await supabase.from('revenue_daily').select('cash_amount, card_amount, mobile_amount, monthly_pass_amount, other_amount')
        .gte('revenue_date', `${year}-01-01`).lte('revenue_date', `${year}-12-31`);
      return (data || []).reduce((s, r) => s + (r.cash_amount || 0) + (r.card_amount || 0) + (r.mobile_amount || 0) + (r.monthly_pass_amount || 0) + (r.other_amount || 0), 0);
    },
  });

  const stats = useMemo(() => {
    if (!items) return { revAllocated: 0, revExecuted: 0, expAllocated: 0, expExecuted: 0, expReturned: 0 };
    const rev = items.filter(i => i.budget_type === 'revenue');
    const exp = items.filter(i => i.budget_type === 'expenditure');
    return {
      revAllocated: rev.reduce((s, i) => s + (i.allocated_amount || 0), 0),
      revExecuted: rev.reduce((s, i) => s + (i.executed_amount || 0), 0),
      expAllocated: exp.reduce((s, i) => s + (i.allocated_amount || 0), 0),
      expExecuted: exp.reduce((s, i) => s + (i.executed_amount || 0), 0),
      expReturned: exp.reduce((s, i) => s + (i.returned_amount || 0), 0),
    };
  }, [items]);

  const expRate = stats.expAllocated > 0 ? Math.round(stats.expExecuted / stats.expAllocated * 100) : 0;
  const revRate = stats.revAllocated > 0 ? Math.round(stats.revExecuted / stats.revAllocated * 100) : 0;
  const unused = stats.expAllocated - stats.expExecuted - stats.expReturned;

  // Category chart data
  const categoryData = useMemo(() => {
    if (!items) return [];
    const byL1: Record<string, { allocated: number; executed: number }> = {};
    items.filter(i => i.budget_type === 'expenditure').forEach(i => {
      if (!byL1[i.category_l1]) byL1[i.category_l1] = { allocated: 0, executed: 0 };
      byL1[i.category_l1].allocated += i.allocated_amount || 0;
      byL1[i.category_l1].executed += i.executed_amount || 0;
    });
    return Object.entries(byL1).map(([name, v]) => ({
      name, 배정액: Math.round(v.allocated / 10000), 집행액: Math.round(v.executed / 10000),
      rate: v.allocated > 0 ? Math.round(v.executed / v.allocated * 100) : 0,
    }));
  }, [items]);

  // Low execution items
  const lowExecItems = useMemo(() => {
    if (!items) return [];
    return items.filter(i => i.budget_type === 'expenditure' && i.allocated_amount > 0 && (i.executed_amount / i.allocated_amount) < 0.3)
      .sort((a, b) => (a.executed_amount / a.allocated_amount) - (b.executed_amount / b.allocated_amount))
      .slice(0, 5);
  }, [items]);

  const gaugeColor = expRate < 30 ? 'text-red-500' : expRate < 70 ? 'text-yellow-500' : 'text-green-500';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">예산 현황</h1>
          <div className="flex gap-2 items-center">
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}</SelectContent>
            </Select>
            {plans && plans.length > 0 && (
              <Select value={selectedPlanId || activePlan?.id || ''} onValueChange={setSelectedPlanId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="편성안 선택" /></SelectTrigger>
                <SelectContent>{plans.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {activePlan && <Badge className={BUDGET_STATUS_COLORS[activePlan.status] || ''}>{BUDGET_STATUS_LABELS[activePlan.status]}</Badge>}
          </div>
        </div>

        {!activePlan ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">해당 연도의 예산 편성안이 없습니다. 예산 편성 메뉴에서 생성해주세요.</CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">세입 예산</p>
                      <p className="text-2xl font-bold mt-1">{formatManWon(activePlan.total_revenue)}</p>
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">징수액 {formatManWon(stats.revExecuted)}</p>
                        <Progress value={revRate} className="h-1.5 mt-1" />
                      </div>
                    </div>
                    <Banknote className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">세출 예산</p>
                      <p className="text-2xl font-bold mt-1">{formatManWon(activePlan.total_expenditure)}</p>
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">집행액 {formatManWon(stats.expExecuted)}</p>
                        <Progress value={expRate} className="h-1.5 mt-1" />
                      </div>
                    </div>
                    <Receipt className="h-8 w-8 text-red-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">잔액</p>
                      <p className="text-2xl font-bold mt-1">{formatManWon(activePlan.balance)}</p>
                    </div>
                    <Wallet className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">불용액</p>
                      <p className="text-2xl font-bold mt-1">{formatManWon(unused)}</p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-orange-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Execution gauge */}
            <Card>
              <CardContent className="pt-6 flex items-center justify-center">
                <div className="text-center">
                  <div className={`text-6xl font-bold ${gaugeColor}`}>{expRate}%</div>
                  <p className="text-sm text-muted-foreground mt-2">세출 집행률</p>
                  <Progress value={expRate} className="w-48 h-3 mt-3" />
                </div>
              </CardContent>
            </Card>

            {revenueActive && revenueTotal !== undefined && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">주차수입 실적 (REVENUE 모듈)</p>
                      <p className="text-xl font-bold mt-1">{formatManWon(revenueTotal)}</p>
                      {stats.revAllocated > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground">세입 예산 대비 징수율 {Math.round(revenueTotal / stats.revAllocated * 100)}%</p>
                          <Progress value={Math.min(100, Math.round(revenueTotal / stats.revAllocated * 100))} className="h-1.5 mt-1" />
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">REVENUE 연동</Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">세출 분류별 집행 현황 (만원)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={categoryData} layout="vertical" margin={{ left: 70 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={65} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="배정액" fill="#d1d5db" />
                      <Bar dataKey="집행액" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">주의 항목 (집행률 30% 미만)</CardTitle></CardHeader>
                <CardContent>
                  {lowExecItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">주의 항목 없음</p>
                  ) : (
                    <div className="space-y-3">
                      {lowExecItems.map(item => {
                        const rate = item.allocated_amount > 0 ? Math.round(item.executed_amount / item.allocated_amount * 100) : 0;
                        return (
                          <div key={item.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
                            <div>
                              <p className="text-sm font-medium">{item.item_name}</p>
                              <p className="text-xs text-muted-foreground">{item.category_l1} · 배정 {formatManWon(item.allocated_amount)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-orange-600">{rate}%</p>
                              <Progress value={rate} className="w-16 h-1.5" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
