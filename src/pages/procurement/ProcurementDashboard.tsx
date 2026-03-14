import { useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Gavel, FileCheck, Banknote, TrendingDown, AlertTriangle } from "lucide-react";
import { BID_TYPE_COLORS, BID_TYPE_LABELS, BID_STATUS_LABELS, BID_STATUS_COLORS, PIPELINE_STEPS, formatOkWon } from "@/types/procurement";
import { useNavigate } from "react-router-dom";

export default function ProcurementDashboard() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  const { data: projects } = useQuery({
    queryKey: ['bid-projects-all'],
    queryFn: async () => {
      const { data } = await supabase.from('bid_projects').select('*').order('created_at', { ascending: false });
      return data || [];
    },
  });

  const { data: contracts } = useQuery({
    queryKey: ['bid-contracts-recent'],
    queryFn: async () => {
      const { data } = await supabase.from('bid_contracts').select('*, bid_projects(title, savings_rate)')
        .order('contract_date', { ascending: false }).limit(5);
      return data || [];
    },
  });

  const stats = useMemo(() => {
    if (!projects) return { active: 0, contracted: 0, totalContract: 0, avgSavings: 0, failed: 0 };
    const thisYear = projects.filter(p => p.created_at?.startsWith(String(currentYear)));
    return {
      active: projects.filter(p => ['announced', 'bidding', 'evaluation'].includes(p.status)).length,
      contracted: thisYear.filter(p => p.status === 'contracted').length,
      totalContract: thisYear.filter(p => p.contract_amount).reduce((s, p) => s + (p.contract_amount || 0), 0),
      avgSavings: (() => {
        const withRate = thisYear.filter(p => p.savings_rate && p.savings_rate > 0);
        return withRate.length > 0 ? (withRate.reduce((s, p) => s + (p.savings_rate || 0), 0) / withRate.length) : 0;
      })(),
      failed: thisYear.filter(p => ['failed', 'cancelled'].includes(p.status)).length,
    };
  }, [projects, currentYear]);

  // Pipeline
  const pipelineCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PIPELINE_STEPS.forEach(s => counts[s.key] = 0);
    projects?.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
    return counts;
  }, [projects]);

  const pipelineProjects = useMemo(() => {
    const map: Record<string, any[]> = {};
    PIPELINE_STEPS.forEach(s => map[s.key] = []);
    projects?.forEach(p => { if (map[p.status]) map[p.status].push(p); });
    Object.keys(map).forEach(k => map[k] = map[k].slice(0, 3));
    return map;
  }, [projects]);

  // Deadline soon (7 days)
  const deadlineSoon = useMemo(() => {
    if (!projects) return [];
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86400000);
    return projects
      .filter(p => p.bid_deadline && ['announced', 'bidding'].includes(p.status))
      .filter(p => { const d = new Date(p.bid_deadline!); return d >= now && d <= week; })
      .sort((a, b) => new Date(a.bid_deadline!).getTime() - new Date(b.bid_deadline!).getTime())
      .slice(0, 5);
  }, [projects]);

  const getDday = (dateStr: string) => {
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    return diff === 0 ? 'D-Day' : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">입찰 현황</h1>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: '진행중 입찰', value: stats.active, icon: Gavel, color: 'text-blue-600' },
            { label: '계약 체결', value: `${stats.contracted}건`, icon: FileCheck, color: 'text-green-600' },
            { label: '총 계약금액', value: formatOkWon(stats.totalContract), icon: Banknote, color: 'text-purple-600' },
            { label: '평균 절감율', value: `${stats.avgSavings.toFixed(1)}%`, icon: TrendingDown, color: 'text-green-600' },
            { label: '유찰/취소', value: stats.failed, icon: AlertTriangle, color: 'text-red-500' },
          ].map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-xl font-bold mt-1">{kpi.value}</p>
                  </div>
                  <kpi.icon className={`h-7 w-7 ${kpi.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pipeline */}
        <Card>
          <CardHeader><CardTitle className="text-base">입찰 파이프라인</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {PIPELINE_STEPS.map((step, idx) => (
                <div key={step.key} className="flex-1 min-w-[150px]">
                  <div className="flex items-center gap-1.5 mb-2">
                    {idx > 0 && <div className="h-px w-4 bg-border" />}
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium">{step.label}</span>
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{pipelineCounts[step.key]}</Badge>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {pipelineProjects[step.key]?.map(p => (
                      <div key={p.id} onClick={() => navigate(`/procurement/projects/${p.id}`)}
                        className="p-2 bg-muted/40 rounded border text-xs cursor-pointer hover:bg-muted/70 transition-colors">
                        <p className="font-medium truncate">{p.title}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge className={`${BID_TYPE_COLORS[p.bid_type]} text-[9px] px-1 py-0`}>{BID_TYPE_LABELS[p.bid_type]}</Badge>
                          {p.estimated_amount && <span className="text-muted-foreground">{formatOkWon(p.estimated_amount)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Deadline soon */}
          <Card>
            <CardHeader><CardTitle className="text-base">마감 임박 (7일 이내)</CardTitle></CardHeader>
            <CardContent>
              {deadlineSoon.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">마감 임박 사업 없음</p>
              ) : (
                <div className="space-y-2">
                  {deadlineSoon.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2.5 bg-yellow-50 rounded-lg border border-yellow-200 cursor-pointer hover:bg-yellow-100"
                      onClick={() => navigate(`/procurement/projects/${p.id}`)}>
                      <div>
                        <p className="text-sm font-medium">{p.title}</p>
                        <div className="flex gap-1 mt-0.5">
                          <Badge className={`${BID_TYPE_COLORS[p.bid_type]} text-[9px]`}>{BID_TYPE_LABELS[p.bid_type]}</Badge>
                          <span className="text-xs text-muted-foreground">{p.bid_deadline?.split('T')[0]}</span>
                        </div>
                      </div>
                      <Badge variant="destructive" className="text-xs">{getDday(p.bid_deadline!)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent contracts */}
          <Card>
            <CardHeader><CardTitle className="text-base">최근 계약 체결</CardTitle></CardHeader>
            <CardContent>
              {contracts?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">계약 내역 없음</p>
              ) : (
                <div className="space-y-2">
                  {contracts?.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-2.5 border rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{(c.bid_projects as any)?.title || c.contractor_name}</p>
                        <p className="text-xs text-muted-foreground">{c.contractor_name} · {c.contract_date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatOkWon(c.total_amount)}</p>
                        {(c.bid_projects as any)?.savings_rate > 0 && (
                          <p className="text-xs text-green-600">절감 {(c.bid_projects as any).savings_rate}%</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
