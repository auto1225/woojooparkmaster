import { useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CONTRACT_STATUS_LABELS, CONTRACT_TYPE_LABELS, formatOkWon } from "@/types/procurement";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

export default function ProcurementContracts() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  const { data: contracts } = useQuery({
    queryKey: ['all-bid-contracts'],
    queryFn: async () => {
      const { data } = await supabase.from('bid_contracts')
        .select('*, bid_projects(title, bid_type, contract_type, bid_number)')
        .order('contract_date', { ascending: false });
      return data || [];
    },
  });

  const stats = useMemo(() => {
    if (!contracts) return { active: 0, activeAmount: 0, thisYear: 0, thisYearAmount: 0, expiringSoon: 0, warranty: 0 };
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 86400000);
    const thisYear = contracts.filter(c => c.contract_date?.startsWith(String(currentYear)));
    return {
      active: contracts.filter(c => c.status === 'active').length,
      activeAmount: contracts.filter(c => c.status === 'active').reduce((s, c) => s + (c.total_amount || 0), 0),
      thisYear: thisYear.length,
      thisYearAmount: thisYear.reduce((s, c) => s + (c.total_amount || 0), 0),
      expiringSoon: contracts.filter(c => c.status === 'active' && c.contract_end && new Date(c.contract_end) <= soon && new Date(c.contract_end) >= now).length,
      warranty: contracts.filter(c => c.warranty_end && new Date(c.warranty_end) >= now).length,
    };
  }, [contracts, currentYear]);

  // Pie chart by contract type
  const typeData = useMemo(() => {
    if (!contracts) return [];
    const byType: Record<string, number> = {};
    contracts.forEach(c => {
      const type = (c.bid_projects as any)?.contract_type || 'other';
      byType[type] = (byType[type] || 0) + (c.total_amount || 0);
    });
    return Object.entries(byType).map(([k, v]) => ({ name: CONTRACT_TYPE_LABELS[k] || k, value: Math.round(v / 10000) }));
  }, [contracts]);

  const getDday = (dateStr: string) => {
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    return diff >= 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">계약 관리</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">활성 계약</p><p className="text-xl font-bold">{stats.active}건</p><p className="text-xs text-muted-foreground">{formatOkWon(stats.activeAmount)}</p></CardContent></Card>
          <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">올해 체결</p><p className="text-xl font-bold">{stats.thisYear}건</p><p className="text-xs text-muted-foreground">{formatOkWon(stats.thisYearAmount)}</p></CardContent></Card>
          <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">만료 임박 (30일)</p><p className="text-xl font-bold text-orange-600">{stats.expiringSoon}건</p></CardContent></Card>
          <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">하자보증 진행</p><p className="text-xl font-bold">{stats.warranty}건</p></CardContent></Card>
        </div>

        {typeData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">계약유형별 금액 분포 (만원)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>계약번호</TableHead>
                    <TableHead>사업명</TableHead>
                    <TableHead>계약업체</TableHead>
                    <TableHead className="text-right">계약금액</TableHead>
                    <TableHead>계약기간</TableHead>
                    <TableHead>하자보증 종료</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts?.map(c => {
                    const now = new Date();
                    const endSoon = c.status === 'active' && c.contract_end && new Date(c.contract_end) <= new Date(now.getTime() + 30 * 86400000) && new Date(c.contract_end) >= now;
                    return (
                      <TableRow key={c.id} className={`cursor-pointer ${endSoon ? 'bg-yellow-50' : ''}`}
                        onClick={() => navigate(`/procurement/projects/${c.bid_project_id}`)}>
                        <TableCell className="font-mono text-sm">{c.contract_number}</TableCell>
                        <TableCell className="font-medium text-sm">{(c.bid_projects as any)?.title}</TableCell>
                        <TableCell className="text-sm">{c.contractor_name}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatOkWon(c.total_amount)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {c.contract_start} ~ {c.contract_end}
                          {endSoon && <Badge variant="outline" className="ml-1 text-[9px] text-orange-600">{getDday(c.contract_end)}</Badge>}
                        </TableCell>
                        <TableCell className="text-sm">{c.warranty_end || '-'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{CONTRACT_STATUS_LABELS[c.status] || c.status}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
