import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Plus, Check, X } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { EXECUTION_TYPE_LABELS, BUDGET_STATUS_LABELS, BUDGET_STATUS_COLORS } from "@/types/budget";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-logger";

export default function BudgetExecutions() {
  const { profile } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: plans } = useQuery({
    queryKey: ['budget-plans-year', year],
    queryFn: async () => {
      const { data } = await supabase.from('budget_plans').select('id').eq('fiscal_year', year).eq('status', 'approved');
      return data || [];
    },
  });

  const { data: items } = useQuery({
    queryKey: ['budget-items-for-exec', year],
    enabled: (plans?.length || 0) > 0,
    queryFn: async () => {
      const planIds = plans!.map(p => p.id);
      const { data } = await supabase.from('budget_items').select('id, item_code, item_name, category_l1, budget_type, allocated_amount, executed_amount, remaining_amount')
        .in('plan_id', planIds).eq('is_summary', false).order('sort_order');
      return data || [];
    },
  });

  const { data: records, refetch } = useQuery({
    queryKey: ['budget-executions', year, typeFilter, statusFilter],
    queryFn: async () => {
      let q = supabase.from('budget_executions').select('*, budget_items(item_code, item_name, category_l1), parking_lots(code, name)')
        .gte('execution_date', `${year}-01-01`).lte('execution_date', `${year}-12-31`)
        .order('execution_date', { ascending: false });
      if (typeFilter !== 'all') q = q.eq('execution_type', typeFilter);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data } = await q;
      return data || [];
    },
  });

  const totalAmount = records?.reduce((s, r) => s + (r.amount || 0), 0) || 0;
  const pendingCount = records?.filter(r => r.status === 'pending').length || 0;

  const [form, setForm] = useState({
    item_id: '', execution_type: 'expenditure', execution_date: new Date().toISOString().split('T')[0],
    amount: 0, vendor_name: '', description: '', document_number: '', payment_method: 'bank_transfer', notes: '',
  });

  const selectedItem = items?.find(i => i.id === form.item_id);

  const handleCreate = async () => {
    if (!form.item_id || !form.description || !form.amount) { toast.error('필수 항목을 입력해주세요'); return; }
    const count = (records?.length || 0) + 1;
    const execNumber = `BE-${year}-${String(count).padStart(5, '0')}`;
    const { error } = await supabase.from('budget_executions').insert({
      execution_number: execNumber, item_id: form.item_id, execution_type: form.execution_type,
      execution_date: form.execution_date, amount: form.amount, vendor_name: form.vendor_name || null,
      description: form.description, document_number: form.document_number || null,
      payment_method: form.payment_method, requested_by: profile?.id, created_by: profile?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('집행 등록 완료');
    await logActivity({ module: 'BUDGET', action: '예산 집행 등록', targetType: 'budget_executions', targetName: execNumber });
    setCreateOpen(false);
    refetch();
  };

  const handleApproval = async (execId: string, newStatus: 'executed' | 'rejected') => {
    const payload: any = { status: newStatus };
    if (newStatus === 'executed') { payload.approved_by = profile?.id; payload.approved_at = new Date().toISOString(); }
    const { error } = await supabase.from('budget_executions').update(payload).eq('id', execId);
    if (error) { toast.error(error.message); return; }
    toast.success(newStatus === 'executed' ? '승인/집행 완료' : '반려 완료');
    refetch();
  };

  const fmtNum = (n: number) => (n || 0).toLocaleString();
  const canApprove = profile && ['admin', 'manager'].includes(profile.role);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">예산 집행</h1>
          <div className="flex gap-2">
            <div className="flex gap-4 text-sm">
              <span>총 집행액: <strong className="text-primary">{fmtNum(totalAmount)}원</strong></span>
              <span>건수: <strong>{records?.length || 0}</strong></span>
              {pendingCount > 0 && <span className="text-orange-600">미승인: <strong>{pendingCount}</strong></span>}
            </div>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />집행 등록</Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{[currentYear + 1, currentYear, currentYear - 1].map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}</SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체유형</SelectItem>
              {Object.entries(EXECUTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체상태</SelectItem>
              <SelectItem value="pending">대기</SelectItem>
              <SelectItem value="executed">집행</SelectItem>
              <SelectItem value="rejected">반려</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>집행번호</TableHead>
                    <TableHead>일자</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>예산항목</TableHead>
                    <TableHead>거래처</TableHead>
                    <TableHead>내용</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead>상태</TableHead>
                    {canApprove && <TableHead>처리</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records?.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.execution_number}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{r.execution_date}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{EXECUTION_TYPE_LABELS[r.execution_type] || r.execution_type}</Badge></TableCell>
                      <TableCell className="text-sm">{(r.budget_items as any)?.category_l1} &gt; {(r.budget_items as any)?.item_name}</TableCell>
                      <TableCell className="text-sm">{r.vendor_name || '-'}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{r.description}</TableCell>
                      <TableCell className="text-right font-medium">{fmtNum(r.amount)}</TableCell>
                      <TableCell><Badge className={BUDGET_STATUS_COLORS[r.status] || ''}>{BUDGET_STATUS_LABELS[r.status] || r.status}</Badge></TableCell>
                      {canApprove && (
                        <TableCell>
                          {r.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleApproval(r.id, 'executed')}><Check className="h-3.5 w-3.5 text-green-600" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleApproval(r.id, 'rejected')}><X className="h-3.5 w-3.5 text-red-600" /></Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold">
                    <TableCell colSpan={6}>합계</TableCell>
                    <TableCell className="text-right text-primary">{fmtNum(totalAmount)}</TableCell>
                    <TableCell colSpan={canApprove ? 2 : 1} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>집행 등록</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>예산항목 *</Label>
                <Select value={form.item_id} onValueChange={v => setForm(f => ({ ...f, item_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{items?.map(i => <SelectItem key={i.id} value={i.id}>[{i.category_l1}] {i.item_name}</SelectItem>)}</SelectContent>
                </Select>
                {selectedItem && (
                  <p className="text-xs text-muted-foreground mt-1">배정액: {fmtNum(selectedItem.allocated_amount)}원 / 잔액: {fmtNum(selectedItem.remaining_amount)}원</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>집행유형</Label>
                  <Select value={form.execution_type} onValueChange={v => setForm(f => ({ ...f, execution_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(EXECUTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>집행일 *</Label><Input type="date" value={form.execution_date} onChange={e => setForm(f => ({ ...f, execution_date: e.target.value }))} /></div>
              </div>
              <div>
                <Label>금액 *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) || 0 }))} />
                {selectedItem && form.amount > selectedItem.remaining_amount && (
                  <p className="text-xs text-red-500 mt-1">⚠ 잔액({fmtNum(selectedItem.remaining_amount)}원)을 초과합니다</p>
                )}
              </div>
              <div><Label>거래처/업체명</Label><Input value={form.vendor_name} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))} /></div>
              <div><Label>내용 *</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div><Label>지출결의서 번호</Label><Input value={form.document_number} onChange={e => setForm(f => ({ ...f, document_number: e.target.value }))} /></div>
              <div><Label>비고</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
              <Button onClick={handleCreate}>등록</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
