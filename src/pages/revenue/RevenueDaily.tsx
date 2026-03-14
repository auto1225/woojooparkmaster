import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle, Download } from "lucide-react";
import { formatWon, DATA_SOURCE_LABELS } from "@/types/revenue";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-logger";

export default function RevenueDaily() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [lotFilter, setLotFilter] = useState('all');
  const [verifiedFilter, setVerifiedFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<any>(null);

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const defaultEnd = now.toISOString().split('T')[0];
  const [dateStart, setDateStart] = useState(defaultStart);
  const [dateEnd, setDateEnd] = useState(defaultEnd);

  const { data: lots } = useQuery({
    queryKey: ['parking-lots-select'],
    queryFn: async () => {
      const { data } = await supabase.from('parking_lots').select('id, code, name').order('code');
      return data || [];
    },
  });

  const { data: records, refetch } = useQuery({
    queryKey: ['revenue-daily', lotFilter, dateStart, dateEnd, verifiedFilter, sourceFilter],
    queryFn: async () => {
      let q = supabase.from('revenue_daily').select('*, parking_lots(code, name)')
        .gte('revenue_date', dateStart).lte('revenue_date', dateEnd)
        .order('revenue_date', { ascending: false });
      if (lotFilter !== 'all') q = q.eq('lot_id', lotFilter);
      if (verifiedFilter === 'verified') q = q.eq('verified', true);
      if (verifiedFilter === 'unverified') q = q.eq('verified', false);
      if (sourceFilter !== 'all') q = q.eq('data_source', sourceFilter);
      const { data } = await q;
      return data || [];
    },
  });

  const totals = useMemo(() => {
    if (!records) return { cash: 0, card: 0, mobile: 0, pass: 0, other: 0, total: 0, vehicles: 0, exCount: 0, exAmount: 0 };
    return records.reduce((s, r) => ({
      cash: s.cash + (r.cash_amount || 0),
      card: s.card + (r.card_amount || 0),
      mobile: s.mobile + (r.mobile_amount || 0),
      pass: s.pass + (r.monthly_pass_amount || 0),
      other: s.other + (r.other_amount || 0),
      total: s.total + (r.cash_amount || 0) + (r.card_amount || 0) + (r.mobile_amount || 0) + (r.monthly_pass_amount || 0) + (r.other_amount || 0),
      vehicles: s.vehicles + (r.total_vehicles || 0),
      exCount: s.exCount + (r.exemption_count || 0),
      exAmount: s.exAmount + (r.exemption_amount || 0),
    }), { cash: 0, card: 0, mobile: 0, pass: 0, other: 0, total: 0, vehicles: 0, exCount: 0, exAmount: 0 });
  }, [records]);

  // Form state
  const [form, setForm] = useState({
    lot_id: '', revenue_date: defaultEnd, data_source: 'manual',
    cash_amount: 0, card_amount: 0, mobile_amount: 0, monthly_pass_amount: 0, other_amount: 0,
    total_vehicles: 0, peak_hour: '', avg_parking_minutes: 0,
    exemption_count: 0, exemption_amount: 0, discrepancy_note: '',
  });

  const formTotal = form.cash_amount + form.card_amount + form.mobile_amount + form.monthly_pass_amount + form.other_amount;

  const openNew = () => {
    setEditItem(null);
    setForm({ lot_id: '', revenue_date: defaultEnd, data_source: 'manual', cash_amount: 0, card_amount: 0, mobile_amount: 0, monthly_pass_amount: 0, other_amount: 0, total_vehicles: 0, peak_hour: '', avg_parking_minutes: 0, exemption_count: 0, exemption_amount: 0, discrepancy_note: '' });
    setDialogOpen(true);
  };

  const openEdit = (r: any) => {
    setEditItem(r);
    setForm({
      lot_id: r.lot_id, revenue_date: r.revenue_date, data_source: r.data_source || 'manual',
      cash_amount: r.cash_amount || 0, card_amount: r.card_amount || 0, mobile_amount: r.mobile_amount || 0,
      monthly_pass_amount: r.monthly_pass_amount || 0, other_amount: r.other_amount || 0,
      total_vehicles: r.total_vehicles || 0, peak_hour: r.peak_hour || '', avg_parking_minutes: r.avg_parking_minutes || 0,
      exemption_count: r.exemption_count || 0, exemption_amount: r.exemption_amount || 0, discrepancy_note: r.discrepancy_note || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.lot_id || !form.revenue_date) { toast.error('주차장과 날짜를 선택해주세요'); return; }
    const payload = {
      lot_id: form.lot_id, revenue_date: form.revenue_date, data_source: form.data_source,
      cash_amount: form.cash_amount, card_amount: form.card_amount, mobile_amount: form.mobile_amount,
      monthly_pass_amount: form.monthly_pass_amount, other_amount: form.other_amount,
      total_vehicles: form.total_vehicles, peak_hour: form.peak_hour || null,
      avg_parking_minutes: form.avg_parking_minutes || null,
      exemption_count: form.exemption_count, exemption_amount: form.exemption_amount,
      discrepancy_note: form.discrepancy_note || null,
      input_by: profile?.id,
    };

    let error;
    if (editItem) {
      ({ error } = await supabase.from('revenue_daily').update(payload).eq('id', editItem.id));
    } else {
      ({ error } = await supabase.from('revenue_daily').insert(payload));
    }
    if (error) { toast.error(error.message); return; }
    toast.success(editItem ? '수정 완료' : '입력 완료');
    await logActivity({ module: 'REVENUE', action: editItem ? '수입 수정' : '수입 입력', target_type: 'revenue_daily', target_name: form.revenue_date });
    setDialogOpen(false);
    refetch();
  };

  const handleBulkVerify = async () => {
    if (selectedIds.size === 0) return;
    if (!profile || !['admin', 'manager'].includes(profile.role)) { toast.error('검증 권한이 없습니다'); return; }
    const { error } = await supabase.from('revenue_daily')
      .update({ verified: true, verified_by: profile.id, verified_at: new Date().toISOString() })
      .in('id', Array.from(selectedIds));
    if (error) { toast.error(error.message); return; }
    toast.success(`${selectedIds.size}건 검증 완료`);
    await logActivity({ module: 'REVENUE', action: `수입 일괄 검증 ${selectedIds.size}건`, target_type: 'revenue_daily' });
    setSelectedIds(new Set());
    refetch();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const canVerify = profile && ['admin', 'manager'].includes(profile.role);
  const fmtNum = (n: number) => n.toLocaleString();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">일별 수입</h1>
          <div className="flex gap-2">
            {canVerify && selectedIds.size > 0 && (
              <Button variant="outline" onClick={handleBulkVerify}>
                <CheckCircle className="h-4 w-4 mr-1" />선택 검증 ({selectedIds.size}건)
              </Button>
            )}
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />수입 입력</Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-48">
                <Label className="text-xs">주차장</Label>
                <Select value={lotFilter} onValueChange={setLotFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {lots?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">시작일</Label>
                <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-36" />
              </div>
              <div>
                <Label className="text-xs">종료일</Label>
                <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-36" />
              </div>
              <div className="w-32">
                <Label className="text-xs">검증 상태</Label>
                <Select value={verifiedFilter} onValueChange={setVerifiedFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="unverified">미검증</SelectItem>
                    <SelectItem value="verified">검증완료</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32">
                <Label className="text-xs">데이터출처</Label>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {Object.entries(DATA_SOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canVerify && <TableHead className="w-10"><Checkbox checked={records?.length ? selectedIds.size === records.length : false} onCheckedChange={(c) => { if (c) setSelectedIds(new Set(records?.map(r => r.id))); else setSelectedIds(new Set()); }} /></TableHead>}
                    <TableHead>날짜</TableHead>
                    <TableHead>주차장명</TableHead>
                    <TableHead className="text-right">현금</TableHead>
                    <TableHead className="text-right">카드</TableHead>
                    <TableHead className="text-right">모바일</TableHead>
                    <TableHead className="text-right">월정기</TableHead>
                    <TableHead className="text-right font-bold text-primary">합계</TableHead>
                    <TableHead className="text-right">차량수</TableHead>
                    <TableHead className="text-right">감면건수</TableHead>
                    <TableHead className="text-right">감면액</TableHead>
                    <TableHead>출처</TableHead>
                    <TableHead>검증</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records?.map(r => {
                    const total = (r.cash_amount || 0) + (r.card_amount || 0) + (r.mobile_amount || 0) + (r.monthly_pass_amount || 0) + (r.other_amount || 0);
                    return (
                      <TableRow key={r.id} className={`cursor-pointer ${!r.verified ? 'bg-yellow-50/50' : ''}`} onClick={() => openEdit(r)}>
                        {canVerify && <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} /></TableCell>}
                        <TableCell className="whitespace-nowrap">{r.revenue_date}</TableCell>
                        <TableCell>{(r.parking_lots as any)?.name || '-'}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.cash_amount || 0)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.card_amount || 0)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.mobile_amount || 0)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.monthly_pass_amount || 0)}</TableCell>
                        <TableCell className="text-right font-bold text-primary">{fmtNum(total)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.total_vehicles || 0)}</TableCell>
                        <TableCell className="text-right">{r.exemption_count || 0}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.exemption_amount || 0)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{DATA_SOURCE_LABELS[r.data_source] || r.data_source}</Badge></TableCell>
                        <TableCell>{r.verified ? <CheckCircle className="h-4 w-4 text-green-500" /> : <span className="text-xs text-muted-foreground">미검증</span>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold bg-muted/50">
                    {canVerify && <TableCell />}
                    <TableCell colSpan={2}>합계</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.cash)}</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.card)}</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.mobile)}</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.pass)}</TableCell>
                    <TableCell className="text-right text-primary">{fmtNum(totals.total)}</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.vehicles)}</TableCell>
                    <TableCell className="text-right">{totals.exCount}</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.exAmount)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Input Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editItem ? '수입 수정' : '수입 입력'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>주차장 *</Label>
                  <Select value={form.lot_id} onValueChange={v => setForm(f => ({ ...f, lot_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>{lots?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>날짜 *</Label>
                  <Input type="date" value={form.revenue_date} onChange={e => setForm(f => ({ ...f, revenue_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>데이터 출처</Label>
                <Select value={form.data_source} onValueChange={v => setForm(f => ({ ...f, data_source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(DATA_SOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">결제수단별 수입</p>
                {[
                  ['cash_amount', '현금'], ['card_amount', '카드'], ['mobile_amount', '모바일결제'],
                  ['monthly_pass_amount', '월정기권'], ['other_amount', '기타']
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Label className="w-24 text-xs">{label}</Label>
                    <Input type="number" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) || 0 }))} className="text-right" />
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1 border-t">
                  <Label className="w-24 text-xs font-bold">합계</Label>
                  <p className="text-right flex-1 font-bold text-primary text-lg">{formatWon(formTotal)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">이용 차량수</Label><Input type="number" value={form.total_vehicles} onChange={e => setForm(f => ({ ...f, total_vehicles: Number(e.target.value) || 0 }))} /></div>
                <div>
                  <Label className="text-xs">최대 혼잡 시간</Label>
                  <Select value={form.peak_hour} onValueChange={v => setForm(f => ({ ...f, peak_hour: v }))}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>{Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00').map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">평균주차(분)</Label><Input type="number" value={form.avg_parking_minutes} onChange={e => setForm(f => ({ ...f, avg_parking_minutes: Number(e.target.value) || 0 }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">감면 건수</Label><Input type="number" value={form.exemption_count} onChange={e => setForm(f => ({ ...f, exemption_count: Number(e.target.value) || 0 }))} /></div>
                <div><Label className="text-xs">감면 금액</Label><Input type="number" value={form.exemption_amount} onChange={e => setForm(f => ({ ...f, exemption_amount: Number(e.target.value) || 0 }))} /></div>
              </div>
              <div><Label className="text-xs">비고</Label><Input value={form.discrepancy_note} onChange={e => setForm(f => ({ ...f, discrepancy_note: e.target.value }))} placeholder="특이사항" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button onClick={handleSave}>저장</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
