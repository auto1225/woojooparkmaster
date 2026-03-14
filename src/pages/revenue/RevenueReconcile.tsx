import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { formatWon, RECON_STATUS_LABELS, RECON_STATUS_COLORS } from "@/types/revenue";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-logger";

export default function RevenueReconcile() {
  const { profile } = useAuth();
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [createForm, setCreateForm] = useState({ lot_id: '', period_month: '' });

  const { data: lots } = useQuery({
    queryKey: ['lots-outsourced'],
    queryFn: async () => {
      const { data } = await supabase.from('parking_lots').select('id, code, name, operator_type').eq('operator_type', 'outsourced').order('code');
      return data || [];
    },
  });

  const { data: records, refetch } = useQuery({
    queryKey: ['recon-list', statusFilter],
    queryFn: async () => {
      let q = supabase.from('revenue_reconciliation').select('*, parking_lots(code, name)').order('period_start', { ascending: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data } = await q;
      return data || [];
    },
  });

  const handleCreate = async () => {
    if (!createForm.lot_id || !createForm.period_month) { toast.error('주차장과 기간을 선택해주세요'); return; }
    const [year, month] = createForm.period_month.split('-').map(Number);
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    // Get system totals
    const { data: dailyData } = await supabase.from('revenue_daily').select('cash_amount, card_amount, mobile_amount, other_amount, total_vehicles, exemption_amount')
      .eq('lot_id', createForm.lot_id).gte('revenue_date', periodStart).lte('revenue_date', periodEnd);

    const sys = (dailyData || []).reduce((s, r) => ({
      cash: s.cash + (r.cash_amount || 0), card: s.card + (r.card_amount || 0),
      mobile: s.mobile + (r.mobile_amount || 0), other: s.other + (r.other_amount || 0),
      vehicles: s.vehicles + (r.total_vehicles || 0), exemptions: s.exemptions + (r.exemption_amount || 0),
    }), { cash: 0, card: 0, mobile: 0, other: 0, vehicles: 0, exemptions: 0 });

    // Get company name from contracts
    const { data: contracts } = await supabase.from('outsourcing_contracts').select('company_name').eq('lot_id', createForm.lot_id).eq('status', 'active').limit(1);
    const companyName = contracts?.[0]?.company_name || '';

    // Generate recon number
    const count = (records?.length || 0) + 1;
    const reconNumber = `RC-${createForm.period_month.replace('-', '')}-${String(count).padStart(3, '0')}`;

    const { error } = await supabase.from('revenue_reconciliation').insert({
      lot_id: createForm.lot_id, recon_number: reconNumber, period_type: 'monthly',
      period_start: periodStart, period_end: periodEnd,
      system_cash: sys.cash, system_card: sys.card, system_mobile: sys.mobile, system_other: sys.other,
      system_vehicles: sys.vehicles, system_exemptions: sys.exemptions,
      company_name: companyName, created_by: profile?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('대사 생성 완료');
    await logActivity({ module: 'REVENUE', action: '위탁대사 생성', targetType: 'revenue_reconciliation', targetName: reconNumber });
    setCreateOpen(false);
    refetch();
  };

  // Detail editing
  const [reportedForm, setReportedForm] = useState({ cash: 0, card: 0, mobile: 0, other: 0, vehicles: 0, exemptions: 0 });
  const [analysisForm, setAnalysisForm] = useState({ diff_analysis: '', resolution_type: '', resolution_note: '' });

  const openDetail = (r: any) => {
    setDetailItem(r);
    setReportedForm({ cash: r.reported_cash || 0, card: r.reported_card || 0, mobile: r.reported_mobile || 0, other: r.reported_other || 0, vehicles: r.reported_vehicles || 0, exemptions: r.reported_exemptions || 0 });
    setAnalysisForm({ diff_analysis: r.diff_analysis || '', resolution_type: r.resolution_type || '', resolution_note: r.resolution_note || '' });
  };

  const handleSaveDetail = async (newStatus?: string) => {
    if (!detailItem) return;
    const payload: any = {
      reported_cash: reportedForm.cash, reported_card: reportedForm.card,
      reported_mobile: reportedForm.mobile, reported_other: reportedForm.other,
      reported_vehicles: reportedForm.vehicles, reported_exemptions: reportedForm.exemptions,
      diff_analysis: analysisForm.diff_analysis || null,
      resolution_type: analysisForm.resolution_type || null,
      resolution_note: analysisForm.resolution_note || null,
    };
    if (newStatus) {
      payload.status = newStatus;
      if (['matched', 'resolved', 'discrepancy'].includes(newStatus)) {
        payload.resolved_by = profile?.id;
        payload.resolved_at = new Date().toISOString();
      }
    }
    const { error } = await supabase.from('revenue_reconciliation').update(payload).eq('id', detailItem.id);
    if (error) { toast.error(error.message); return; }
    toast.success('저장 완료');
    setDetailItem(null);
    refetch();
  };

  const diffColor = (v: number) => v > 0 ? 'text-red-600' : v < 0 ? 'text-blue-600' : 'text-green-600';
  const fmtNum = (n: number) => n.toLocaleString();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">위탁수입 대사</h1>
            <p className="text-sm text-muted-foreground mt-1">위탁운영 업체가 보고한 수입과 시스템 집계 수입을 비교하여 차이를 분석합니다.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />대사 생성</Button>
        </div>

        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {Object.entries(RECON_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>대사번호</TableHead>
                  <TableHead>주차장명</TableHead>
                  <TableHead>업체명</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead className="text-right">업체보고</TableHead>
                  <TableHead className="text-right">시스템집계</TableHead>
                  <TableHead className="text-right">차이</TableHead>
                  <TableHead className="text-right">차이율(%)</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records?.map(r => {
                  const rTotal = (r.reported_cash || 0) + (r.reported_card || 0) + (r.reported_mobile || 0) + (r.reported_other || 0);
                  const sTotal = (r.system_cash || 0) + (r.system_card || 0) + (r.system_mobile || 0) + (r.system_other || 0);
                  const diff = rTotal - sTotal;
                  const highDiff = Math.abs(r.diff_rate || 0) > 5;
                  return (
                    <TableRow key={r.id} className={`cursor-pointer ${highDiff ? 'bg-red-50/50' : ''}`} onClick={() => openDetail(r)}>
                      <TableCell className="font-mono text-sm">{r.recon_number}</TableCell>
                      <TableCell>{(r.parking_lots as any)?.name || '-'}</TableCell>
                      <TableCell>{r.company_name || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.period_start} ~ {r.period_end}</TableCell>
                      <TableCell className="text-right">{fmtNum(rTotal)}</TableCell>
                      <TableCell className="text-right">{fmtNum(sTotal)}</TableCell>
                      <TableCell className={`text-right font-medium ${diffColor(diff)}`}>{diff > 0 ? '+' : ''}{fmtNum(diff)}</TableCell>
                      <TableCell className={`text-right ${diffColor(r.diff_rate || 0)}`}>{r.diff_rate || 0}%</TableCell>
                      <TableCell><Badge className={`${RECON_STATUS_COLORS[r.status] || ''} text-xs`}>{RECON_STATUS_LABELS[r.status] || r.status}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>대사 생성</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>위탁운영 주차장</Label>
                <Select value={createForm.lot_id} onValueChange={v => setCreateForm(f => ({ ...f, lot_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{lots?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>대사 기간 (월)</Label>
                <Input type="month" value={createForm.period_month} onChange={e => setCreateForm(f => ({ ...f, period_month: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
              <Button onClick={handleCreate}>생성</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>대사 상세 — {detailItem?.recon_number}</DialogTitle></DialogHeader>
            {detailItem && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {(detailItem.parking_lots as any)?.name} · {detailItem.company_name || '-'} · {detailItem.period_start} ~ {detailItem.period_end}
                </div>

                {/* Comparison table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>구분</TableHead>
                      <TableHead className="text-right">업체 보고</TableHead>
                      <TableHead className="text-right">시스템 집계</TableHead>
                      <TableHead className="text-right">차이</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { label: '현금', rKey: 'cash', sKey: 'system_cash' },
                      { label: '카드', rKey: 'card', sKey: 'system_card' },
                      { label: '모바일', rKey: 'mobile', sKey: 'system_mobile' },
                      { label: '기타', rKey: 'other', sKey: 'system_other' },
                    ].map(({ label, rKey, sKey }) => {
                      const rVal = (reportedForm as any)[rKey] || 0;
                      const sVal = detailItem[sKey] || 0;
                      const d = rVal - sVal;
                      return (
                        <TableRow key={rKey}>
                          <TableCell>{label}</TableCell>
                          <TableCell className="text-right">
                            <Input type="number" className="w-32 text-right ml-auto" value={rVal}
                              onChange={e => setReportedForm(f => ({ ...f, [rKey]: Number(e.target.value) || 0 }))} />
                          </TableCell>
                          <TableCell className="text-right">{fmtNum(sVal)}</TableCell>
                          <TableCell className={`text-right font-medium ${diffColor(d)}`}>{d > 0 ? '+' : ''}{fmtNum(d)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-bold">
                      <TableCell>합계</TableCell>
                      <TableCell className="text-right">{fmtNum(reportedForm.cash + reportedForm.card + reportedForm.mobile + reportedForm.other)}</TableCell>
                      <TableCell className="text-right">{fmtNum((detailItem.system_cash || 0) + (detailItem.system_card || 0) + (detailItem.system_mobile || 0) + (detailItem.system_other || 0))}</TableCell>
                      <TableCell className={`text-right ${diffColor((reportedForm.cash + reportedForm.card + reportedForm.mobile + reportedForm.other) - ((detailItem.system_cash || 0) + (detailItem.system_card || 0) + (detailItem.system_mobile || 0) + (detailItem.system_other || 0)))}`}>
                        {fmtNum((reportedForm.cash + reportedForm.card + reportedForm.mobile + reportedForm.other) - ((detailItem.system_cash || 0) + (detailItem.system_card || 0) + (detailItem.system_mobile || 0) + (detailItem.system_other || 0)))}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>이용차량</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" className="w-32 text-right ml-auto" value={reportedForm.vehicles}
                          onChange={e => setReportedForm(f => ({ ...f, vehicles: Number(e.target.value) || 0 }))} />
                      </TableCell>
                      <TableCell className="text-right">{fmtNum(detailItem.system_vehicles || 0)}</TableCell>
                      <TableCell className={`text-right ${diffColor(reportedForm.vehicles - (detailItem.system_vehicles || 0))}`}>
                        {fmtNum(reportedForm.vehicles - (detailItem.system_vehicles || 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <div className="space-y-3">
                  <div><Label>차이 분석</Label><Textarea value={analysisForm.diff_analysis} onChange={e => setAnalysisForm(f => ({ ...f, diff_analysis: e.target.value }))} placeholder="차이 원인 기록" /></div>
                  <div>
                    <Label>처리 방법</Label>
                    <Select value={analysisForm.resolution_type} onValueChange={v => setAnalysisForm(f => ({ ...f, resolution_type: v }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accepted">업체보고 수용</SelectItem>
                        <SelectItem value="adjusted">금액 조정</SelectItem>
                        <SelectItem value="corrected">시스템 수정</SelectItem>
                        <SelectItem value="disputed">이의제기</SelectItem>
                        <SelectItem value="written_off">대손처리</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>처리 소견</Label><Textarea value={analysisForm.resolution_note} onChange={e => setAnalysisForm(f => ({ ...f, resolution_note: e.target.value }))} /></div>
                </div>

                <DialogFooter className="flex gap-2">
                  <Button variant="outline" onClick={() => handleSaveDetail('reviewing')}>검토중</Button>
                  <Button variant="outline" className="text-green-600" onClick={() => handleSaveDetail('matched')}>일치</Button>
                  <Button variant="outline" className="text-red-600" onClick={() => handleSaveDetail('discrepancy')}>불일치</Button>
                  <Button onClick={() => handleSaveDetail('resolved')}>대사 완료</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
