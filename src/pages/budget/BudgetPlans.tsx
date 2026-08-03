import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Check, ChevronDown, ChevronRight, FileText, MapPin, Plus, Search, Send, X } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthorField } from "@/components/common/AuthorField";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-logger";
import { useAuth } from "@/hooks/useAuth";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";
import { BUDGET_STATUS_COLORS, BUDGET_STATUS_LABELS, BUDGET_TYPE_LABELS, PLAN_TYPE_LABELS } from "@/types/budget";
import { toast } from "sonner";

const db = supabase as any;
const fmt = (value: number | null | undefined) => `${Number(value || 0).toLocaleString()}원`;

function PlanList() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [form, setForm] = useState({ fiscal_year: currentYear, plan_type: "original", title: "", document_number: "", author_name: "" });

  const { data: plans = [], refetch } = useQuery({
    queryKey: ["budget-plans-all"],
    queryFn: async () => {
      const { data, error } = await db.from("budget_plans").select("*").is("archived_at", null);
      if (error) throw error;
      return data || [];
    },
  });

  const years = useMemo(() => [...new Set(plans.map((plan: any) => plan.fiscal_year))].sort((a: any, b: any) => b - a), [plans]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return plans.filter((plan: any) => {
      if (year !== "all" && String(plan.fiscal_year) !== year) return false;
      if (status !== "all" && plan.status !== status) return false;
      return !query || [plan.title, plan.document_number, plan.plan_number].some((value) => String(value || "").toLowerCase().includes(query));
    }).sort((a: any, b: any) => {
      if (sort === "amount_desc") return Number(b.total_expenditure || 0) - Number(a.total_expenditure || 0);
      if (sort === "amount_asc") return Number(a.total_expenditure || 0) - Number(b.total_expenditure || 0);
      if (sort === "title") return String(a.title).localeCompare(String(b.title), "ko");
      return String(b.created_at).localeCompare(String(a.created_at));
    });
  }, [plans, search, sort, status, year]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.document_number.trim()) {
      toast.error("제목과 근거 문서번호를 입력해주세요.");
      return;
    }
    const { error } = await db.rpc("create_budget_plan", {
      p_fiscal_year: form.fiscal_year,
      p_plan_type: form.plan_type,
      p_title: form.title.trim(),
      p_document_number: form.document_number.trim(),
      p_author_name: form.author_name.trim() || null,
      p_client_mutation_id: crypto.randomUUID(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await logActivity({ module: "BUDGET", action: "예산 편성안 생성", targetType: "budget_plans", targetName: form.title });
    toast.success("편성안을 생성했습니다.");
    setCreateOpen(false);
    setForm({ fiscal_year: currentYear, plan_type: "original", title: "", document_number: "", author_name: "" });
    await refetch();
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-2xl font-bold">예산 편성</h1><p className="text-sm text-muted-foreground">근거 문서와 주차장별 예산을 편성하고 결재 상태를 관리합니다.</p></div>
          <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" />편성안 생성</Button>
        </div>

        <div className="grid gap-2 rounded-md border bg-background p-3 md:grid-cols-[minmax(220px,1fr)_150px_150px_170px]">
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="제목·문서번호 검색" /></div>
          <Select value={year} onValueChange={setYear}><SelectTrigger aria-label="회계연도 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 회계연도</SelectItem>{years.map((value: any) => <SelectItem key={value} value={String(value)}>{value}년</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="상태 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{Object.entries(BUDGET_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="정렬 방식"><ArrowUpDown className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">최근 작성순</SelectItem><SelectItem value="amount_desc">세출액 많은순</SelectItem><SelectItem value="amount_asc">세출액 적은순</SelectItem><SelectItem value="title">제목 가나다순</SelectItem></SelectContent></Select>
        </div>

        <Card className="hidden md:block"><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>회계연도·유형</TableHead><TableHead>제목·문서번호</TableHead><TableHead className="text-right">세입총액</TableHead><TableHead className="text-right">세출총액</TableHead><TableHead>상태</TableHead><TableHead>작성일</TableHead></TableRow></TableHeader><TableBody>
          {filtered.map((plan: any) => <TableRow key={plan.id} className="cursor-pointer" onClick={() => navigate(`/budget/plans/${plan.id}`)}><TableCell>{plan.fiscal_year}년 · {PLAN_TYPE_LABELS[plan.plan_type] || plan.plan_type} {plan.plan_number}차</TableCell><TableCell><p className="font-medium">{plan.title}</p><p className="text-xs text-muted-foreground">{plan.document_number || "문서번호 미등록"}</p></TableCell><TableCell className="text-right">{fmt(plan.total_revenue)}</TableCell><TableCell className="text-right">{fmt(plan.total_expenditure)}</TableCell><TableCell><Badge className={BUDGET_STATUS_COLORS[plan.status] || ""}>{BUDGET_STATUS_LABELS[plan.status] || plan.status}</Badge></TableCell><TableCell>{plan.created_at?.split("T")[0]}</TableCell></TableRow>)}
          {!filtered.length && <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">조건에 맞는 편성안이 없습니다.</TableCell></TableRow>}
        </TableBody></Table></CardContent></Card>

        <div className="space-y-2 md:hidden">{filtered.map((plan: any) => <button key={plan.id} className="w-full rounded-md border bg-background p-4 text-left" onClick={() => navigate(`/budget/plans/${plan.id}`)}><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{plan.title}</p><p className="mt-1 text-xs text-muted-foreground">{plan.fiscal_year}년 · {PLAN_TYPE_LABELS[plan.plan_type]} {plan.plan_number}차</p></div><Badge className={BUDGET_STATUS_COLORS[plan.status] || ""}>{BUDGET_STATUS_LABELS[plan.status] || plan.status}</Badge></div><p className="mt-3 flex items-center gap-1 text-xs"><FileText className="h-3.5 w-3.5" />{plan.document_number || "문서번호 미등록"}</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><span>세입 {fmt(plan.total_revenue)}</span><span>세출 {fmt(plan.total_expenditure)}</span></div></button>)}{!filtered.length && <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">조건에 맞는 편성안이 없습니다.</p>}</div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>편성안 생성</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid grid-cols-2 gap-3"><div><Label>회계연도</Label><Input type="number" min={2000} max={2200} value={form.fiscal_year} onChange={(event) => setForm((current) => ({ ...current, fiscal_year: Number(event.target.value) }))} /></div><div><Label>유형</Label><Select value={form.plan_type} onValueChange={(value) => setForm((current) => ({ ...current, plan_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PLAN_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div><div><Label>제목</Label><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="예: 2026년 제1회 추경 안전시설 보강" /></div><div><Label>근거 문서번호</Label><Input value={form.document_number} onChange={(event) => setForm((current) => ({ ...current, document_number: event.target.value }))} placeholder="예: 제주시청-차량관리과-2026-0123" /></div><AuthorField value={form.author_name} onChange={(value) => setForm((current) => ({ ...current, author_name: value }))} /></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button><Button onClick={handleCreate}>생성</Button></DialogFooter></DialogContent></Dialog>
      </div>
    </DashboardLayout>
  );
}

function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [tab, setTab] = useState<"revenue" | "expenditure">("expenditure");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [reason, setReason] = useState("");
  const [itemForm, setItemForm] = useState({ budget_type: "expenditure", category_l1: "", item_name: "", item_code: "", planned_amount: 0, depth: 0, parent_item_id: "none", lot_id: "common" });

  const { data: plan, refetch: refetchPlan } = useQuery({ queryKey: ["budget-plan", id], queryFn: async () => { const { data, error } = await db.from("budget_plans").select("*").eq("id", id).single(); if (error) throw error; return data; } });
  const { data: items = [], refetch: refetchItems } = useQuery({ queryKey: ["budget-items", id, tab], queryFn: async () => { const { data, error } = await db.from("budget_items").select("*, parking_lots(code,name,lot_type)").eq("plan_id", id).eq("budget_type", tab).is("archived_at", null).order("sort_order"); if (error) throw error; return data || []; } });
  const { data: lots = [] } = useQuery({ queryKey: ["budget-lot-options"], queryFn: async () => { const { data } = await db.from("parking_lots").select("id,code,name,lot_type").eq("status", "active").order("name"); return data || []; } });

  const editable = plan?.status === "draft" || plan?.status === "rejected";
  const canApprove = ["admin", "manager"].includes(profile?.role || "") && plan?.submitted_by !== profile?.id;
  const tree = items.filter((item: any) => !item.parent_item_id);
  const getChildren = (parentId: string) => items.filter((item: any) => item.parent_item_id === parentId);

  const handleAddItem = async () => {
    if (!itemForm.item_name.trim() || !itemForm.category_l1.trim() || itemForm.planned_amount < 0) { toast.error("항목명, 분류와 0원 이상의 편성액을 확인해주세요."); return; }
    if (itemForm.depth > 0 && itemForm.parent_item_id === "none") { toast.error("상위 예산항목을 선택해주세요."); return; }
    const maxOrder = items.reduce((max: number, item: any) => Math.max(max, item.sort_order || 0), 0);
    const { error } = await db.from("budget_items").insert({ plan_id: id, budget_type: itemForm.budget_type, category_l1: itemForm.category_l1.trim(), item_name: itemForm.item_name.trim(), item_code: itemForm.item_code.trim() || `${itemForm.budget_type === "revenue" ? "R" : "E"}-${String(maxOrder + 1).padStart(3, "0")}`, planned_amount: itemForm.planned_amount, depth: itemForm.depth, parent_item_id: itemForm.parent_item_id === "none" ? null : itemForm.parent_item_id, lot_id: itemForm.lot_id === "common" ? null : itemForm.lot_id, document_number: plan.document_number, sort_order: maxOrder + 1 });
    if (error) { toast.error(error.message); return; }
    toast.success("예산항목을 추가했습니다."); setAddOpen(false); await Promise.all([refetchItems(), refetchPlan()]);
  };

  const transition = async (target: string, transitionReason = "") => {
    const { error } = await db.rpc("transition_budget_plan", { p_plan_id: id, p_target_status: target, p_reason: transitionReason || null });
    if (error) { toast.error(error.message); return; }
    toast.success(`예산안을 ${BUDGET_STATUS_LABELS[target] || target} 처리했습니다.`);
    setDecision(null); setReason(""); await Promise.all([refetchPlan(), refetchItems()]);
  };

  const updateAmount = async (itemId: string, value: number) => {
    if (!Number.isFinite(value) || value < 0) { toast.error("편성액은 0원 이상이어야 합니다."); await refetchItems(); return; }
    const { error } = await db.from("budget_items").update({ planned_amount: value }).eq("id", itemId);
    if (error) toast.error(error.message); else await Promise.all([refetchItems(), refetchPlan()]);
  };

  const toggleExpand = (itemId: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    return next;
  });
  const renderRow = (item: any, level = 0): React.ReactNode => {
    const children = getChildren(item.id); const isOpen = expanded.has(item.id); const rate = item.allocated_amount > 0 ? Math.round(item.executed_amount / item.allocated_amount * 100) : 0;
    return <React.Fragment key={item.id}><TableRow><TableCell><div className="flex items-center" style={{ paddingLeft: `${level * 20}px` }}>{children.length ? <button className="mr-1" onClick={() => toggleExpand(item.id)}>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button> : <span className="mr-1 w-4" />}<div><p className="text-sm font-medium">{item.item_name}</p><p className="text-xs text-muted-foreground">{item.item_code}</p></div></div></TableCell><TableCell>{item.parking_lots ? <div><p className="text-sm">{item.parking_lots.name}</p><Badge variant="secondary" className="mt-1 text-[10px]">{LOT_TYPE_LABELS[item.parking_lots.lot_type as LotType] || item.parking_lots.lot_type}</Badge></div> : <span className="text-sm text-muted-foreground">공통예산</span>}</TableCell><TableCell className="text-right">{editable && !item.is_summary ? <Input className="ml-auto h-8 w-36 text-right" type="number" min={0} defaultValue={item.planned_amount} onBlur={(event) => updateAmount(item.id, Number(event.target.value))} /> : fmt(item.planned_amount)}</TableCell><TableCell className="text-right">{fmt(item.executed_amount)}</TableCell><TableCell className="text-right">{fmt(item.remaining_amount)}</TableCell><TableCell><div className="flex items-center gap-2"><Progress className="h-2 w-16" value={rate} /><span className="text-xs">{rate}%</span></div></TableCell></TableRow>{isOpen && children.map((child: any) => renderRow(child, level + 1))}</React.Fragment>;
  };

  if (!plan) return <DashboardLayout><div className="p-8 text-center">불러오는 중...</div></DashboardLayout>;
  return <DashboardLayout><div className="space-y-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{plan.title}</h1><Badge className={BUDGET_STATUS_COLORS[plan.status] || ""}>{BUDGET_STATUS_LABELS[plan.status] || plan.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{plan.fiscal_year}년 · {PLAN_TYPE_LABELS[plan.plan_type]} {plan.plan_number}차</p><p className="mt-2 flex items-center gap-1 text-sm"><FileText className="h-4 w-4" />{plan.document_number || "근거 문서번호 미등록"}</p></div><div className="flex flex-wrap gap-2">{editable && <Button onClick={() => transition("submitted")}><Send className="mr-1 h-4 w-4" />{plan.status === "rejected" ? "재제출" : "제출"}</Button>}{plan.status === "submitted" && canApprove && <><Button onClick={() => setDecision("approved")}><Check className="mr-1 h-4 w-4" />승인</Button><Button variant="destructive" onClick={() => setDecision("rejected")}><X className="mr-1 h-4 w-4" />반려</Button></>}{plan.status === "submitted" && !canApprove && <Badge variant="outline" className="px-3 py-2">본인 제출 건은 다른 결재자가 처리해야 합니다</Badge>}</div></div>

    {plan.reject_reason && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"><strong>반려 사유:</strong> {plan.reject_reason}</div>}
    <DocumentLinksPanel module="BUDGET_PLAN" recordId={plan.id} recordPath={`/budget/plans/${plan.id}`} recordTitle={plan.title} initialDocumentNumber={plan.document_number || undefined} readOnly={!editable} />

    <Tabs value={tab} onValueChange={(value) => setTab(value as any)}><div className="flex items-center justify-between gap-2"><TabsList><TabsTrigger value="expenditure">세출</TabsTrigger><TabsTrigger value="revenue">세입</TabsTrigger></TabsList>{editable && <Button size="sm" onClick={() => { setItemForm((current) => ({ ...current, budget_type: tab })); setAddOpen(true); }}><Plus className="mr-1 h-4 w-4" />항목 추가</Button>}</div><TabsContent value={tab}><Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="min-w-64">예산항목</TableHead><TableHead className="min-w-40">대상 주차장</TableHead><TableHead className="text-right">편성액</TableHead><TableHead className="text-right">집행액</TableHead><TableHead className="text-right">잔액</TableHead><TableHead>집행률</TableHead></TableRow></TableHeader><TableBody>{tree.map((item: any) => renderRow(item))}{!tree.length && <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">등록된 {tab === "expenditure" ? "세출" : "세입"} 항목이 없습니다.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card></TabsContent></Tabs>

    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>예산항목 추가</DialogTitle></DialogHeader><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><div><Label>구분</Label><Select value={itemForm.budget_type} onValueChange={(value) => setItemForm((current) => ({ ...current, budget_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(BUDGET_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label>계층</Label><Select value={String(itemForm.depth)} onValueChange={(value) => setItemForm((current) => ({ ...current, depth: Number(value), parent_item_id: "none" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">장(L1)</SelectItem><SelectItem value="1">관(L2)</SelectItem><SelectItem value="2">항(L3)</SelectItem><SelectItem value="3">목(L4)</SelectItem></SelectContent></Select></div></div>{itemForm.depth > 0 && <div><Label>상위 예산항목</Label><Select value={itemForm.parent_item_id} onValueChange={(value) => setItemForm((current) => ({ ...current, parent_item_id: value }))}><SelectTrigger><SelectValue placeholder="상위 항목 선택" /></SelectTrigger><SelectContent><SelectItem value="none">선택하세요</SelectItem>{items.filter((item: any) => item.depth === itemForm.depth - 1).map((item: any) => <SelectItem key={item.id} value={item.id}>{item.item_code} {item.item_name}</SelectItem>)}</SelectContent></Select></div>}<div><Label>분류(L1)</Label><Input value={itemForm.category_l1} onChange={(event) => setItemForm((current) => ({ ...current, category_l1: event.target.value }))} placeholder="예: 시설비, 운영비" /></div><div><Label>항목명</Label><Input value={itemForm.item_name} onChange={(event) => setItemForm((current) => ({ ...current, item_name: event.target.value }))} /></div><div><Label>항목코드</Label><Input value={itemForm.item_code} onChange={(event) => setItemForm((current) => ({ ...current, item_code: event.target.value }))} placeholder="비우면 자동 생성" /></div><div><Label>대상 주차장</Label><Select value={itemForm.lot_id} onValueChange={(value) => setItemForm((current) => ({ ...current, lot_id: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="common">공통예산</SelectItem>{lots.map((lot: any) => <SelectItem key={lot.id} value={lot.id}>{lot.name} · {LOT_TYPE_LABELS[lot.lot_type as LotType] || lot.lot_type}</SelectItem>)}</SelectContent></Select></div><div><Label>편성액</Label><Input type="number" min={0} value={itemForm.planned_amount} onChange={(event) => setItemForm((current) => ({ ...current, planned_amount: Number(event.target.value) || 0 }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>취소</Button><Button onClick={handleAddItem}>추가</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(decision)} onOpenChange={(open) => !open && setDecision(null)}><DialogContent><DialogHeader><DialogTitle>{decision === "approved" ? "예산안 승인" : "예산안 반려"}</DialogTitle></DialogHeader>{decision === "approved" ? <p className="text-sm text-muted-foreground">승인하면 편성액이 배정액으로 확정되며 이후 직접 수정할 수 없습니다.</p> : <div><Label>반려 사유</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="수정이 필요한 내용을 구체적으로 입력하세요." /></div>}<DialogFooter><Button variant="outline" onClick={() => setDecision(null)}>취소</Button><Button variant={decision === "rejected" ? "destructive" : "default"} onClick={() => decision && transition(decision, reason)} disabled={decision === "rejected" && !reason.trim()}>{decision === "approved" ? "승인 확정" : "반려 확정"}</Button></DialogFooter></DialogContent></Dialog>
  </div></DashboardLayout>;
}

export default function BudgetPlans() { const { id } = useParams<{ id: string }>(); return id ? <PlanDetail /> : <PlanList />; }
