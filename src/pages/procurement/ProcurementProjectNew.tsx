import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthorField } from "@/components/common/AuthorField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-logger";
import { getParkingLotTypeLabel } from "@/lib/parking-lot-type-labels";
import { BID_TYPE_LABELS, CONTRACT_TYPE_LABELS, EVAL_METHOD_LABELS } from "@/types/procurement";

const bidDescriptions: Record<string, string> = {
  open: "2인 이상 일반경쟁", limited: "자격을 제한한 경쟁",
  private: "지명 업체 경쟁", negotiation: "수의계약 사유 필수",
};
const empty = {
  title: "", document_number: "", bid_type: "open", contract_type: "service", category: "", lot_id: "", budget_item_id: "",
  estimated_amount: 0, design_amount: 0, vat_included: true, description: "", scope_of_work: "", location: "",
  work_period_days: 0, work_start_date: "", work_end_date: "", qualification: "", evaluation_method: "qualification",
  lowest_price_rate: 87.745, nara_ref: "", announce_date: "", bid_start_date: "", bid_deadline: "", bid_open_date: "",
  bid_open_location: "", assigned_to: "", author_name: "",
};

export default function ProcurementProjectNew() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(empty);
  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  const { data: lots = [] } = useQuery({
    queryKey: ["procurement-lots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parking_lots").select("id,code,name,lot_type").eq("status", "active").order("code");
      if (error) throw error;
      return data || [];
    },
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["procurement-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,name").eq("is_active", true).order("name")).data || [],
  });
  const { data: budgetItems = [] } = useQuery({
    queryKey: ["procurement-approved-budget-items"],
    queryFn: async () => {
      const plans = (await supabase.from("budget_plans").select("id,fiscal_year,status").in("status", ["approved", "executed"]).is("archived_at", null)).data || [];
      if (!plans.length) return [];
      const { data, error } = await supabase.from("budget_items")
        .select("id,item_code,item_name,lot_id,allocated_amount,executed_amount,returned_amount,plan_id")
        .in("plan_id", plans.map((plan) => plan.id)).eq("budget_type", "expenditure").is("archived_at", null).order("item_code");
      if (error) throw error;
      const years = new Map(plans.map((plan) => [plan.id, plan.fiscal_year]));
      return (data || []).map((item) => ({ ...item, fiscal_year: years.get(item.plan_id), remaining: Number(item.allocated_amount) - Number(item.executed_amount) - Number(item.returned_amount) })).filter((item) => item.remaining > 0);
    },
  });
  const availableBudgetItems = useMemo(() => budgetItems.filter((item) => !item.lot_id || !form.lot_id || item.lot_id === form.lot_id), [budgetItems, form.lot_id]);
  const selectedLot = lots.find((lot) => lot.id === form.lot_id);
  const selectedBudget = budgetItems.find((item) => item.id === form.budget_item_id);

  const validateStep = () => {
    if (!form.title.trim() || !form.document_number.trim() || !form.lot_id || !form.budget_item_id) {
      toast.error("사업명, 근거 문서번호, 주차장, 승인 예산항목을 입력하세요"); return false;
    }
    if (form.estimated_amount <= 0 || form.design_amount < form.estimated_amount) {
      toast.error("설계금액은 추정가격 이상이어야 합니다"); return false;
    }
    if (selectedBudget && form.estimated_amount > selectedBudget.remaining) {
      toast.error("추정가격이 선택한 예산 잔액을 초과합니다"); return false;
    }
    return true;
  };
  const submit = async () => {
    if (!validateStep()) return;
    if (!form.work_start_date || !form.work_end_date || !form.announce_date || !form.bid_start_date || !form.bid_deadline || !form.bid_open_date) {
      toast.error("수행기간과 입찰 일정을 모두 입력하세요"); return;
    }
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("create_bid_project", {
      p_title: form.title, p_document_number: form.document_number, p_bid_type: form.bid_type, p_contract_type: form.contract_type,
      p_category: form.category || null, p_lot_id: form.lot_id, p_budget_item_id: form.budget_item_id,
      p_estimated_amount: form.estimated_amount, p_design_amount: form.design_amount, p_vat_included: form.vat_included,
      p_description: form.description || null, p_scope_of_work: form.scope_of_work || null, p_location: form.location || null,
      p_work_period_days: form.work_period_days || null, p_work_start_date: form.work_start_date, p_work_end_date: form.work_end_date,
      p_qualification: form.qualification || null, p_evaluation_method: form.evaluation_method,
      p_lowest_price_rate: form.evaluation_method === "lowest_price" ? form.lowest_price_rate : null, p_nara_ref: form.nara_ref || null,
      p_announce_date: form.announce_date, p_bid_start_date: form.bid_start_date, p_bid_deadline: new Date(form.bid_deadline).toISOString(),
      p_bid_open_date: form.bid_open_date, p_bid_open_location: form.bid_open_location || null, p_assigned_to: form.assigned_to || null,
      p_author_name: form.author_name || profile?.name || null, p_client_mutation_id: crypto.randomUUID(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const project = Array.isArray(data) ? data[0] : data;
    await logActivity({ module: "PROCUREMENT", action: "입찰사업 등록", targetType: "bid_projects", targetId: project?.id, targetName: form.title });
    toast.success(`${project?.bid_number || "입찰사업"} 등록 완료`);
    navigate(project?.id ? `/procurement/projects/${project.id}` : "/procurement/projects");
  };

  return <DashboardLayout>
    <div className="mx-auto max-w-4xl space-y-4 pb-24 md:pb-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" title="목록" onClick={() => navigate("/procurement/projects")}><ArrowLeft className="h-4 w-4" /></Button>
        <div><h1 className="text-xl font-bold">입찰 사업 등록</h1><p className="text-sm text-muted-foreground">문서번호·예산·주차장을 먼저 연결한 뒤 일정을 등록합니다.</p></div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-center text-sm">
        <div className={`border-b-2 py-2 ${step === 1 ? "border-primary font-semibold text-foreground" : "border-muted text-muted-foreground"}`}>1. 사업·예산</div>
        <div className={`border-b-2 py-2 ${step === 2 ? "border-primary font-semibold text-foreground" : "border-muted text-muted-foreground"}`}>2. 조건·일정</div>
      </div>
      <Card><CardContent className="space-y-5 pt-6">
        {step === 1 ? <>
          <div className="grid gap-4 md:grid-cols-2"><div className="md:col-span-2"><Label>사업명 *</Label><Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="예: 주차빌딩 비상조명 안전설비 보강" /></div>
          <div><Label>근거 문서번호 *</Label><Input value={form.document_number} onChange={(e) => update("document_number", e.target.value)} placeholder="제주시청-차량관리과-2026-0000" /></div>
          <div><Label>분류</Label><Input value={form.category} onChange={(e) => update("category", e.target.value)} placeholder="시설보수, 장비구매 등" /></div></div>
          <div><Label>입찰 방식 *</Label><RadioGroup value={form.bid_type} onValueChange={(value) => update("bid_type", value)} className="mt-2 grid gap-2 md:grid-cols-2">{Object.entries(BID_TYPE_LABELS).map(([key, label]) => <label key={key} className="flex cursor-pointer items-start gap-2 border p-3"><RadioGroupItem value={key} className="mt-0.5" /><span><b className="block text-sm">{label}</b><span className="text-xs text-muted-foreground">{bidDescriptions[key]}</span></span></label>)}</RadioGroup></div>
          <div><Label>계약 유형 *</Label><RadioGroup value={form.contract_type} onValueChange={(value) => update("contract_type", value)} className="mt-2 flex flex-wrap gap-3">{Object.entries(CONTRACT_TYPE_LABELS).map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-2"><RadioGroupItem value={key} />{label}</label>)}</RadioGroup></div>
          <div className="grid gap-4 md:grid-cols-2"><div><Label>관련 주차장 *</Label><Select value={form.lot_id} onValueChange={(value) => { update("lot_id", value); if (budgetItems.find((item) => item.id === form.budget_item_id)?.lot_id && budgetItems.find((item) => item.id === form.budget_item_id)?.lot_id !== value) update("budget_item_id", ""); }}><SelectTrigger><SelectValue placeholder="주차장 선택" /></SelectTrigger><SelectContent>{lots.map((lot) => <SelectItem key={lot.id} value={lot.id}>[{lot.code}] {lot.name} · {getParkingLotTypeLabel(lot.lot_type)}</SelectItem>)}</SelectContent></Select>{selectedLot && <Badge variant="outline" className="mt-2">{getParkingLotTypeLabel(selectedLot.lot_type)}</Badge>}</div>
          <div><Label>승인 예산항목 *</Label><Select value={form.budget_item_id} onValueChange={(value) => update("budget_item_id", value)}><SelectTrigger><SelectValue placeholder="가용 예산 선택" /></SelectTrigger><SelectContent>{availableBudgetItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.fiscal_year} [{item.item_code}] {item.item_name} · {item.remaining.toLocaleString()}원</SelectItem>)}</SelectContent></Select>{selectedBudget && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><WalletCards className="h-3.5 w-3.5" />가용 {selectedBudget.remaining.toLocaleString()}원</p>}</div></div>
          <div className="grid gap-4 md:grid-cols-2"><div><Label>추정가격 *</Label><Input type="number" value={form.estimated_amount || ""} onChange={(e) => update("estimated_amount", Number(e.target.value))} /></div><div><Label>설계금액 *</Label><Input type="number" value={form.design_amount || ""} onChange={(e) => update("design_amount", Number(e.target.value))} /></div></div>
          <div className="flex items-center gap-2"><Switch checked={form.vat_included} onCheckedChange={(value) => update("vat_included", value)} /><Label>부가가치세 포함</Label></div>
          <div><Label>사업 개요</Label><Textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} /></div>
          <div><Label>수행 범위</Label><Textarea rows={3} value={form.scope_of_work} onChange={(e) => update("scope_of_work", e.target.value)} /></div>
        </> : <>
          <div className="grid gap-4 md:grid-cols-3"><div><Label>수행 장소</Label><Input value={form.location} onChange={(e) => update("location", e.target.value)} /></div><div><Label>시작 예정일 *</Label><Input type="date" value={form.work_start_date} onChange={(e) => update("work_start_date", e.target.value)} /></div><div><Label>종료 예정일 *</Label><Input type="date" value={form.work_end_date} onChange={(e) => update("work_end_date", e.target.value)} /></div></div>
          <div><Label>참가 자격</Label><Textarea rows={3} value={form.qualification} onChange={(e) => update("qualification", e.target.value)} placeholder="등록업종, 유사실적, 지역제한 등" /></div>
          <div className="grid gap-4 md:grid-cols-2"><div><Label>평가 방법</Label><Select value={form.evaluation_method} onValueChange={(value) => update("evaluation_method", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(EVAL_METHOD_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label>나라장터 공고번호</Label><Input value={form.nara_ref} onChange={(e) => update("nara_ref", e.target.value)} /></div></div>
          <div className="grid gap-4 md:grid-cols-2"><div><Label>공고일 *</Label><Input type="date" value={form.announce_date} onChange={(e) => update("announce_date", e.target.value)} /></div><div><Label>입찰 시작일 *</Label><Input type="date" value={form.bid_start_date} onChange={(e) => update("bid_start_date", e.target.value)} /></div><div><Label>입찰 마감일시 *</Label><Input type="datetime-local" value={form.bid_deadline} onChange={(e) => update("bid_deadline", e.target.value)} /></div><div><Label>개찰일 *</Label><Input type="date" value={form.bid_open_date} onChange={(e) => update("bid_open_date", e.target.value)} /></div></div>
          <div className="grid gap-4 md:grid-cols-2"><div><Label>개찰 장소</Label><Input value={form.bid_open_location} onChange={(e) => update("bid_open_location", e.target.value)} /></div><div><Label>담당자</Label><Select value={form.assigned_to} onValueChange={(value) => update("assigned_to", value)}><SelectTrigger><SelectValue placeholder="담당자 선택" /></SelectTrigger><SelectContent>{profiles.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select></div></div>
          <AuthorField value={form.author_name} onChange={(value) => update("author_name", value)} />
        </>}
      </CardContent></Card>
      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-between border-t bg-background p-3 md:static md:border-0 md:p-0">
        <Button variant="outline" onClick={() => step === 1 ? navigate("/procurement/projects") : setStep(1)}><ArrowLeft className="mr-1 h-4 w-4" />{step === 1 ? "취소" : "이전"}</Button>
        {step === 1 ? <Button onClick={() => validateStep() && setStep(2)}>조건·일정 입력<ArrowRight className="ml-1 h-4 w-4" /></Button> : <Button onClick={submit} disabled={saving}><Check className="mr-1 h-4 w-4" />{saving ? "등록 중" : "등록"}</Button>}
      </div>
    </div>
  </DashboardLayout>;
}
