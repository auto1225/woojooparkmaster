import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CONTRACT_STATUS_LABELS, CONTRACT_TYPE_LABELS, formatOkWon } from "@/types/procurement";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { handoffContractToService } from "@/lib/workflow-commands";
import { getParkingLotTypeLabel } from "@/lib/parking-lot-type-labels";
import { ArrowDownUp, Search } from "lucide-react";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
const ACTIVE_STATUSES = ['active', 'signed', 'in_progress'];

export default function ProcurementContracts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('date_desc');
  const currentYear = new Date().getFullYear();

  const { data: contracts } = useQuery({
    queryKey: ['all-bid-contracts'],
    queryFn: async () => {
      const { data } = await supabase.from('bid_contracts')
        .select('*, bid_projects(title, bid_type, contract_type, bid_number, document_number, parking_lots(code, name, lot_type))')
        .is('archived_at', null)
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
      active: contracts.filter(c => ACTIVE_STATUSES.includes(c.status)).length,
      activeAmount: contracts.filter(c => ACTIVE_STATUSES.includes(c.status)).reduce((s, c) => s + (c.total_amount || 0), 0),
      thisYear: thisYear.length,
      thisYearAmount: thisYear.reduce((s, c) => s + (c.total_amount || 0), 0),
      expiringSoon: contracts.filter(c => ACTIVE_STATUSES.includes(c.status) && c.contract_end && new Date(c.contract_end) <= soon && new Date(c.contract_end) >= now).length,
      warranty: contracts.filter(c => c.warranty_end && new Date(c.warranty_end) >= now).length,
    };
  }, [contracts, currentYear]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('ko-KR');
    return (contracts || []).filter((contract: any) => {
      const project = contract.bid_projects;
      if (typeFilter !== 'all' && project?.contract_type !== typeFilter) return false;
      if (statusFilter === 'active' && !ACTIVE_STATUSES.includes(contract.status)) return false;
      if (statusFilter !== 'all' && statusFilter !== 'active' && contract.status !== statusFilter) return false;
      return !keyword || [contract.contract_number, contract.document_number, contract.contractor_name, contract.contractor_contact_person, contract.contractor_phone, project?.title, project?.bid_number, project?.document_number, project?.parking_lots?.name].some((value) => String(value || '').toLocaleLowerCase('ko-KR').includes(keyword));
    }).sort((a: any, b: any) => {
      if (sort === 'amount_desc') return Number(b.total_amount || 0) - Number(a.total_amount || 0);
      if (sort === 'amount_asc') return Number(a.total_amount || 0) - Number(b.total_amount || 0);
      if (sort === 'end_asc') return String(a.contract_end || '9999').localeCompare(String(b.contract_end || '9999'));
      if (sort === 'company_asc') return String(a.contractor_name).localeCompare(String(b.contractor_name), 'ko');
      return String(b.contract_date || '').localeCompare(String(a.contract_date || ''));
    });
  }, [contracts, search, typeFilter, statusFilter, sort]);

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

  const signContract = async (contractId: string, documentNumber: string | null) => {
    setProcessingId(contractId);
    const { error } = await (supabase as any).rpc('sign_bid_contract', { p_contract_id: contractId, p_document_number: documentNumber });
    setProcessingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('계약 서명 완료로 기록했습니다');
    queryClient.invalidateQueries({ queryKey: ['all-bid-contracts'] });
  };

  const handoffContract = async (contractId: string) => {
    setProcessingId(contractId);
    try {
      const service: any = await handoffContractToService(contractId);
      toast.success('용역사업으로 인계했습니다');
      queryClient.invalidateQueries({ queryKey: ['all-bid-contracts'] });
      navigate(`/service/projects/${service.id}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setProcessingId(null);
    }
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

        <div className="grid gap-2 border bg-card p-3 md:grid-cols-[minmax(240px,1fr)_150px_150px_180px]">
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="계약·문서·업체·담당자·주차장 찾기" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 계약유형</SelectItem>{Object.entries(CONTRACT_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem><SelectItem value="active">진행 중</SelectItem><SelectItem value="completed">완료</SelectItem><SelectItem value="terminated">해지</SelectItem></SelectContent></Select>
          <Select value={sort} onValueChange={setSort}><SelectTrigger><ArrowDownUp className="mr-1 h-4 w-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="date_desc">최근 계약순</SelectItem><SelectItem value="end_asc">종료 임박순</SelectItem><SelectItem value="amount_desc">금액 높은순</SelectItem><SelectItem value="amount_asc">금액 낮은순</SelectItem><SelectItem value="company_asc">업체명순</SelectItem></SelectContent></Select>
        </div>

        <div className="grid gap-3 md:hidden">{filtered.map((c: any) => { const project = c.bid_projects; return <Card key={c.id} onClick={() => navigate(`/procurement/projects/${c.bid_project_id}?tab=contract`)}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-mono text-xs text-muted-foreground">{c.contract_number}</p><p className="font-semibold">{project?.title}</p></div><Badge variant="outline">{CONTRACT_STATUS_LABELS[c.status] || c.status}</Badge></div><p className="text-sm">{c.contractor_name} · {c.contractor_contact_person || '담당자 미등록'} {c.contractor_phone || ''}</p><div className="flex flex-wrap gap-1"><Badge variant="outline">{project?.parking_lots?.name || '주차장 미연결'}</Badge><Badge variant="outline">{getParkingLotTypeLabel(project?.parking_lots?.lot_type)}</Badge><Badge variant="outline">{CONTRACT_TYPE_LABELS[project?.contract_type] || project?.contract_type}</Badge></div><p className="font-medium">{formatOkWon(c.total_amount)} · {c.contract_end || '-'}</p></CardContent></Card>; })}</div>

        <Card className="hidden md:block">
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
                    <TableHead>실행</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c: any) => {
                    const now = new Date();
                    const endSoon = ACTIVE_STATUSES.includes(c.status) && c.contract_end && new Date(c.contract_end) <= new Date(now.getTime() + 30 * 86400000) && new Date(c.contract_end) >= now;
                    return (
                      <TableRow key={c.id} className={`cursor-pointer ${endSoon ? 'bg-yellow-50' : ''}`}
                        onClick={() => navigate(`/procurement/projects/${c.bid_project_id}?tab=contract`)}>
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
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          {c.service_project_id ? (
                            <Button size="sm" variant="outline" onClick={() => navigate(`/service/projects/${c.service_project_id}`)}>용역 보기</Button>
                          ) : ['admin', 'manager'].includes(profile?.role || '') && ACTIVE_STATUSES.includes(c.status) ? (
                            c.signed_at ? (
                              (c.bid_projects as any)?.contract_type === 'service' || (c.bid_projects as any)?.contract_type === 'outsourcing' ? <Button size="sm" onClick={() => handoffContract(c.id)} disabled={processingId === c.id}>용역 인계</Button> : <span className="text-xs text-muted-foreground">{(c.bid_projects as any)?.contract_type === 'construction' ? '시설공사 연계' : '장비·운영 연계'}</span>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => signContract(c.id, c.document_number)} disabled={processingId === c.id}>서명 확정</Button>
                            )
                          ) : <span className="text-xs text-muted-foreground">-</span>}
                        </TableCell>
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
