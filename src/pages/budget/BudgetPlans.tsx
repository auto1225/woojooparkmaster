import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Plus, ChevronRight, ChevronDown, Send, Check, X } from "lucide-react";
import { PLAN_TYPE_LABELS, BUDGET_STATUS_LABELS, BUDGET_STATUS_COLORS, BUDGET_TYPE_LABELS } from "@/types/budget";
import { formatManWon } from "@/types/revenue";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-logger";
import { useNavigate, useParams } from "react-router-dom";

// Plan List Component
function PlanList() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const currentYear = new Date().getFullYear();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ fiscal_year: currentYear, plan_type: 'original', title: '' });

  const { data: plans, refetch } = useQuery({
    queryKey: ['budget-plans-all'],
    queryFn: async () => {
      const { data } = await supabase.from('budget_plans').select('*').order('fiscal_year', { ascending: false }).order('plan_type').order('plan_number');
      return data || [];
    },
  });

  const handleCreate = async () => {
    if (!form.title) { toast.error('제목을 입력해주세요'); return; }
    const existing = plans?.filter(p => p.fiscal_year === form.fiscal_year && p.plan_type === form.plan_type) || [];
    const nextNum = existing.length + 1;
    const { error } = await supabase.from('budget_plans').insert({
      fiscal_year: form.fiscal_year, plan_type: form.plan_type, plan_number: nextNum,
      title: form.title, created_by: profile?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('편성안 생성 완료');
    await logActivity({ module: 'BUDGET', action: '예산 편성안 생성', targetType: 'budget_plans', targetName: form.title });
    setCreateOpen(false);
    refetch();
  };

  const fmtNum = (n: number) => n?.toLocaleString() || '0';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">예산 편성</h1>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />편성안 생성</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>회계연도</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>차수</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead className="text-right">세입총액</TableHead>
                  <TableHead className="text-right">세출총액</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>작성일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans?.map(p => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/budget/plans/${p.id}`)}>
                    <TableCell>{p.fiscal_year}년</TableCell>
                    <TableCell><Badge variant="outline">{PLAN_TYPE_LABELS[p.plan_type] || p.plan_type}</Badge></TableCell>
                    <TableCell>{p.plan_number}차</TableCell>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell className="text-right">{fmtNum(p.total_revenue)}</TableCell>
                    <TableCell className="text-right">{fmtNum(p.total_expenditure)}</TableCell>
                    <TableCell><Badge className={BUDGET_STATUS_COLORS[p.status] || ''}>{BUDGET_STATUS_LABELS[p.status]}</Badge></TableCell>
                    <TableCell className="text-sm">{p.created_at?.split('T')[0]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>편성안 생성</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>회계연도</Label><Input type="number" value={form.fiscal_year} onChange={e => setForm(f => ({ ...f, fiscal_year: Number(e.target.value) }))} /></div>
                <div>
                  <Label>유형</Label>
                  <Select value={form.plan_type} onValueChange={v => setForm(f => ({ ...f, plan_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLAN_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>제목</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: 2026년 본예산" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
              <Button onClick={handleCreate}>생성</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

// Plan Detail Component
function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [tab, setTab] = useState<'revenue' | 'expenditure'>('expenditure');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ budget_type: 'expenditure', category_l1: '', item_name: '', item_code: '', planned_amount: 0, depth: 0 });

  const { data: plan, refetch: refetchPlan } = useQuery({
    queryKey: ['budget-plan', id],
    queryFn: async () => {
      const { data } = await supabase.from('budget_plans').select('*').eq('id', id!).single();
      return data;
    },
  });

  const { data: items, refetch: refetchItems } = useQuery({
    queryKey: ['budget-items', id, tab],
    queryFn: async () => {
      const { data } = await supabase.from('budget_items').select('*, parking_lots(code, name)')
        .eq('plan_id', id!).eq('budget_type', tab).order('sort_order');
      return data || [];
    },
  });

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  // Build tree
  const tree = items?.filter(i => !i.parent_item_id) || [];
  const getChildren = (parentId: string) => items?.filter(i => i.parent_item_id === parentId) || [];

  const handleAddItem = async () => {
    if (!itemForm.item_name || !itemForm.category_l1) { toast.error('필수 항목을 입력해주세요'); return; }
    const maxOrder = items?.reduce((m, i) => Math.max(m, i.sort_order || 0), 0) || 0;
    const { error } = await supabase.from('budget_items').insert({
      plan_id: id!, budget_type: itemForm.budget_type, category_l1: itemForm.category_l1,
      item_name: itemForm.item_name, item_code: itemForm.item_code || `${itemForm.budget_type.charAt(0).toUpperCase()}-${String(maxOrder + 1).padStart(3, '0')}`,
      planned_amount: itemForm.planned_amount, depth: itemForm.depth, sort_order: maxOrder + 1,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('항목 추가 완료');
    setAddOpen(false);
    refetchItems();
    refetchPlan();
  };

  const handleStatusChange = async (newStatus: string) => {
    const payload: any = { status: newStatus };
    if (newStatus === 'submitted') { payload.submitted_by = profile?.id; payload.submitted_at = new Date().toISOString(); }
    if (newStatus === 'approved') {
      payload.approved_by = profile?.id; payload.approved_at = new Date().toISOString();
      // Copy planned to allocated
      if (items) {
        for (const item of items) {
          await supabase.from('budget_items').update({ allocated_amount: item.planned_amount }).eq('id', item.id);
        }
      }
    }
    const { error } = await supabase.from('budget_plans').update(payload).eq('id', id!);
    if (error) { toast.error(error.message); return; }
    toast.success(`상태 변경: ${BUDGET_STATUS_LABELS[newStatus]}`);
    refetchPlan();
    refetchItems();
  };

  const handleUpdateAmount = async (itemId: string, field: string, value: number) => {
    const { error } = await supabase.from('budget_items').update({ [field]: value }).eq('id', itemId);
    if (error) toast.error(error.message);
    else refetchItems();
  };

  const fmtNum = (n: number) => (n || 0).toLocaleString();
  const isAdmin = profile?.role === 'admin';

  const renderRow = (item: any, level: number = 0) => {
    const children = getChildren(item.id);
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(item.id);
    const rate = item.allocated_amount > 0 ? Math.round(item.executed_amount / item.allocated_amount * 100) : 0;
    const editable = plan?.status === 'draft' || plan?.status === 'rejected';

    return (
      <React.Fragment key={item.id}>
        <TableRow className={item.is_summary ? 'font-bold bg-muted/30' : ''}>
          <TableCell>
            <div className="flex items-center" style={{ paddingLeft: `${level * 20}px` }}>
              {hasChildren ? (
                <button onClick={() => toggleExpand(item.id)} className="mr-1">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              ) : <span className="w-4 mr-1" />}
              <span className="text-xs text-muted-foreground mr-2">{item.item_code}</span>
              <span className="text-sm">{item.item_name}</span>
              {item.is_mandatory && <Badge variant="outline" className="ml-1 text-[10px]">의무</Badge>}
            </div>
          </TableCell>
          <TableCell className="text-right text-sm">{fmtNum(item.previous_year_amount)}</TableCell>
          <TableCell className="text-right text-sm">{fmtNum(item.requested_amount)}</TableCell>
          <TableCell className="text-right">
            {editable && !item.is_summary ? (
              <Input type="number" className="w-28 text-right text-sm h-7 ml-auto" defaultValue={item.planned_amount}
                onBlur={e => handleUpdateAmount(item.id, 'planned_amount', Number(e.target.value) || 0)} />
            ) : <span className="text-sm font-medium">{fmtNum(item.planned_amount)}</span>}
          </TableCell>
          <TableCell className="text-right text-sm">{fmtNum(item.allocated_amount)}</TableCell>
          <TableCell className="text-right text-sm">{fmtNum(item.executed_amount)}</TableCell>
          <TableCell className="text-right text-sm">{fmtNum(item.remaining_amount)}</TableCell>
          <TableCell>
            <div className="flex items-center gap-1">
              <Progress value={rate} className="w-12 h-1.5" />
              <span className="text-xs">{rate}%</span>
            </div>
          </TableCell>
        </TableRow>
        {isOpen && children.map(c => renderRow(c, level + 1))}
      </React.Fragment>
    );
  };

  if (!plan) return <DashboardLayout><div className="p-8 text-center">로딩중...</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{plan.title}</h1>
            <p className="text-sm text-muted-foreground">{plan.fiscal_year}년 · {PLAN_TYPE_LABELS[plan.plan_type]} · {plan.plan_number}차</p>
          </div>
          <div className="flex gap-2 items-center">
            <Badge className={BUDGET_STATUS_COLORS[plan.status] || ''}>{BUDGET_STATUS_LABELS[plan.status]}</Badge>
            {plan.status === 'draft' && <Button size="sm" onClick={() => handleStatusChange('submitted')}><Send className="h-3.5 w-3.5 mr-1" />제출</Button>}
            {plan.status === 'submitted' && isAdmin && (
              <>
                <Button size="sm" variant="default" onClick={() => handleStatusChange('approved')}><Check className="h-3.5 w-3.5 mr-1" />승인</Button>
                <Button size="sm" variant="destructive" onClick={() => handleStatusChange('rejected')}><X className="h-3.5 w-3.5 mr-1" />반려</Button>
              </>
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as any)}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="revenue">세입</TabsTrigger>
              <TabsTrigger value="expenditure">세출</TabsTrigger>
            </TabsList>
            {(plan.status === 'draft' || plan.status === 'rejected') && (
              <Button size="sm" variant="outline" onClick={() => { setItemForm(f => ({ ...f, budget_type: tab })); setAddOpen(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" />항목 추가
              </Button>
            )}
          </div>

          <TabsContent value={tab}>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[250px]">항목</TableHead>
                        <TableHead className="text-right">전년실적</TableHead>
                        <TableHead className="text-right">요구액</TableHead>
                        <TableHead className="text-right">편성액</TableHead>
                        <TableHead className="text-right">배정액</TableHead>
                        <TableHead className="text-right">집행액</TableHead>
                        <TableHead className="text-right">잔액</TableHead>
                        <TableHead>집행률</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tree.map(item => renderRow(item))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>예산 항목 추가</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>구분</Label>
                  <Select value={itemForm.budget_type} onValueChange={v => setItemForm(f => ({ ...f, budget_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(BUDGET_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>계층</Label>
                  <Select value={String(itemForm.depth)} onValueChange={v => setItemForm(f => ({ ...f, depth: Number(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">장(L1)</SelectItem>
                      <SelectItem value="1">관(L2)</SelectItem>
                      <SelectItem value="2">항(L3)</SelectItem>
                      <SelectItem value="3">목(L4)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>분류(L1)</Label><Input value={itemForm.category_l1} onChange={e => setItemForm(f => ({ ...f, category_l1: e.target.value }))} placeholder="예: 인건비, 운영비" /></div>
              <div><Label>항목명</Label><Input value={itemForm.item_name} onChange={e => setItemForm(f => ({ ...f, item_name: e.target.value }))} /></div>
              <div><Label>항목코드</Label><Input value={itemForm.item_code} onChange={e => setItemForm(f => ({ ...f, item_code: e.target.value }))} placeholder="자동생성" /></div>
              <div><Label>편성액</Label><Input type="number" value={itemForm.planned_amount} onChange={e => setItemForm(f => ({ ...f, planned_amount: Number(e.target.value) || 0 }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>취소</Button>
              <Button onClick={handleAddItem}>추가</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

import React from "react";

export default function BudgetPlans() {
  const { id } = useParams<{ id: string }>();
  return id ? <PlanDetail /> : <PlanList />;
}
