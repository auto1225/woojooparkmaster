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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Plus, Check, X, ArrowRight } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { TRANSFER_TYPE_LABELS, TRANSFER_TYPE_COLORS, BUDGET_STATUS_LABELS, BUDGET_STATUS_COLORS } from "@/types/budget";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-logger";

export default function BudgetTransfers() {
  const { profile } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<any>(null);

  const { data: plans } = useQuery({
    queryKey: ['budget-plans-year-t', year],
    queryFn: async () => {
      const { data } = await supabase.from('budget_plans').select('id').eq('fiscal_year', year);
      return data || [];
    },
  });

  const { data: items } = useQuery({
    queryKey: ['budget-items-for-transfer', year],
    enabled: (plans?.length || 0) > 0,
    queryFn: async () => {
      const planIds = plans!.map(p => p.id);
      const { data } = await supabase.from('budget_items').select('id, item_code, item_name, category_l1, category_l2, budget_type, allocated_amount, remaining_amount')
        .in('plan_id', planIds).eq('is_summary', false).eq('budget_type', 'expenditure').order('sort_order');
      return data || [];
    },
  });

  const { data: records, refetch } = useQuery({
    queryKey: ['budget-transfers', year, statusFilter],
    queryFn: async () => {
      let q = supabase.from('budget_transfers').select('*').eq('fiscal_year', year).order('created_at', { ascending: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data } = await q;
      return data || [];
    },
  });

  const [form, setForm] = useState({ transfer_type: 'appropriation', from_item_id: '', to_item_id: '', amount: 0, reason: '', legal_basis: '' });
  const fromItem = items?.find(i => i.id === form.from_item_id);
  const toItem = items?.find(i => i.id === form.to_item_id);

  // Validate same category_l2 for appropriation
  const sameCategory = fromItem && toItem && fromItem.category_l2 === toItem.category_l2;
  const showCategoryWarn = form.transfer_type === 'appropriation' && fromItem && toItem && !sameCategory;

  const handleCreate = async () => {
    if (!form.from_item_id || !form.to_item_id || !form.amount || !form.reason) { toast.error('필수 항목을 입력해주세요'); return; }
    const count = (records?.length || 0) + 1;
    const transferNumber = `BT-${year}-${String(count).padStart(3, '0')}`;
    const { error } = await supabase.from('budget_transfers').insert({
      transfer_number: transferNumber, fiscal_year: year, transfer_type: form.transfer_type,
      from_item_id: form.from_item_id, to_item_id: form.to_item_id, amount: form.amount,
      reason: form.reason, legal_basis: form.legal_basis || null,
      requested_by: profile?.id, created_by: profile?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('전용/이체 신청 완료');
    await logActivity({ module: 'BUDGET', action: '예산 전용/이체 신청', targetType: 'budget_transfers', targetName: transferNumber });
    setCreateOpen(false);
    refetch();
  };

  const handleApproval = async (id: string, newStatus: 'executed' | 'rejected') => {
    const payload: any = { status: newStatus };
    if (newStatus === 'executed') { payload.approved_by = profile?.id; payload.approved_at = new Date().toISOString(); }
    const { error } = await supabase.from('budget_transfers').update(payload).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(newStatus === 'executed' ? '승인/집행 완료' : '반려 완료');
    setDetailItem(null);
    refetch();
  };

  const fmtNum = (n: number) => (n || 0).toLocaleString();
  const canApprove = profile && ['admin', 'manager'].includes(profile.role);

  const getItemName = (itemId: string) => {
    const item = items?.find(i => i.id === itemId);
    return item ? `[${item.category_l1}] ${item.item_name}` : itemId;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">예산 전용/이체</h1>
            <p className="text-sm text-muted-foreground mt-1">예산 항목 간 금액을 이동합니다.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />전용/이체 신청</Button>
        </div>

        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{[currentYear + 1, currentYear, currentYear - 1].map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="pending">대기</SelectItem>
              <SelectItem value="executed">집행</SelectItem>
              <SelectItem value="rejected">반려</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이체번호</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>감액항목</TableHead>
                  <TableHead></TableHead>
                  <TableHead>증액항목</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>사유</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records?.map(r => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailItem(r)}>
                    <TableCell className="font-mono text-sm">{r.transfer_number}</TableCell>
                    <TableCell><Badge className={TRANSFER_TYPE_COLORS[r.transfer_type] || ''}>{TRANSFER_TYPE_LABELS[r.transfer_type]}</Badge></TableCell>
                    <TableCell className="text-sm">{getItemName(r.from_item_id)}</TableCell>
                    <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    <TableCell className="text-sm">{getItemName(r.to_item_id)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtNum(r.amount)}</TableCell>
                    <TableCell className="text-sm max-w-[150px] truncate">{r.reason}</TableCell>
                    <TableCell><Badge className={BUDGET_STATUS_COLORS[r.status] || ''}>{BUDGET_STATUS_LABELS[r.status] || r.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>전용/이체 신청</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>유형</Label>
                <Select value={form.transfer_type} onValueChange={v => setForm(f => ({ ...f, transfer_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TRANSFER_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.transfer_type === 'appropriation' && '동일 관(L2) 내 항목 간 금액 이동'}
                  {form.transfer_type === 'use' && '다른 관(L2) 간 금액 이동 (의회 승인 필요)'}
                  {form.transfer_type === 'transfer' && '다른 기관 간 금액 이동'}
                  {form.transfer_type === 'reserve' && '예비비에서 다른 항목으로 충당'}
                </p>
              </div>
              <div>
                <Label>감액 항목</Label>
                <Select value={form.from_item_id} onValueChange={v => setForm(f => ({ ...f, from_item_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{items?.map(i => <SelectItem key={i.id} value={i.id}>[{i.category_l1}] {i.item_name}</SelectItem>)}</SelectContent>
                </Select>
                {fromItem && <p className="text-xs text-muted-foreground mt-1">배정액: {fmtNum(fromItem.allocated_amount)}원 / 잔액: {fmtNum(fromItem.remaining_amount)}원</p>}
              </div>
              <div>
                <Label>증액 항목</Label>
                <Select value={form.to_item_id} onValueChange={v => setForm(f => ({ ...f, to_item_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{items?.map(i => <SelectItem key={i.id} value={i.id}>[{i.category_l1}] {i.item_name}</SelectItem>)}</SelectContent>
                </Select>
                {toItem && <p className="text-xs text-muted-foreground mt-1">현재 배정액: {fmtNum(toItem.allocated_amount)}원</p>}
              </div>
              {showCategoryWarn && <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded">⚠ 전용은 동일 관 내에서만 가능합니다. 이용을 선택해주세요.</p>}
              <div>
                <Label>이체 금액 *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) || 0 }))} />
                {fromItem && form.amount > fromItem.remaining_amount && <p className="text-xs text-red-500 mt-1">⚠ 잔액 초과</p>}
              </div>
              <div><Label>사유 *</Label><Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></div>
              <div><Label>근거 법령/조례</Label><Input value={form.legal_basis} onChange={e => setForm(f => ({ ...f, legal_basis: e.target.value }))} placeholder="예: 지방재정법 제47조" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
              <Button onClick={handleCreate}>신청</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>전용/이체 상세 — {detailItem?.transfer_number}</DialogTitle></DialogHeader>
            {detailItem && (
              <div className="space-y-4">
                <div className="flex gap-2 items-center">
                  <Badge className={TRANSFER_TYPE_COLORS[detailItem.transfer_type] || ''}>{TRANSFER_TYPE_LABELS[detailItem.transfer_type]}</Badge>
                  <Badge className={BUDGET_STATUS_COLORS[detailItem.status] || ''}>{BUDGET_STATUS_LABELS[detailItem.status] || detailItem.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground">감액 항목</p>
                    <p className="text-sm font-medium">{getItemName(detailItem.from_item_id)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">증액 항목</p>
                    <p className="text-sm font-medium">{getItemName(detailItem.to_item_id)}</p>
                  </div>
                </div>
                <div><p className="text-sm"><strong>금액:</strong> {fmtNum(detailItem.amount)}원</p></div>
                <div><p className="text-sm"><strong>사유:</strong> {detailItem.reason}</p></div>
                {detailItem.legal_basis && <div><p className="text-sm"><strong>근거:</strong> {detailItem.legal_basis}</p></div>}

                {canApprove && detailItem.status === 'pending' && (
                  <DialogFooter>
                    <Button variant="destructive" onClick={() => handleApproval(detailItem.id, 'rejected')}><X className="h-3.5 w-3.5 mr-1" />반려</Button>
                    <Button onClick={() => handleApproval(detailItem.id, 'executed')}><Check className="h-3.5 w-3.5 mr-1" />승인/집행</Button>
                  </DialogFooter>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
