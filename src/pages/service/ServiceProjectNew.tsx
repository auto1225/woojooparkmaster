import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthorField } from "@/components/common/AuthorField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-logger";
import { getParkingLotTypeLabel } from "@/lib/parking-lot-type-labels";
import { MILESTONE_TYPE_LABELS, SERVICE_TYPE_LABELS } from "@/types/service";

type Milestone = { milestone_type: string; title: string; target_date: string; weight_pct: number; deliverables_expected: string };
const defaultMilestones: Milestone[] = [
  { milestone_type: "kickoff", title: "착수보고", target_date: "", weight_pct: 10, deliverables_expected: "착수보고서" },
  { milestone_type: "progress", title: "중간 기성", target_date: "", weight_pct: 40, deliverables_expected: "중간보고서" },
  { milestone_type: "final", title: "준공", target_date: "", weight_pct: 50, deliverables_expected: "최종보고서" },
];
const empty = {
  title: "", document_number: "", service_type: "facility_maintenance", service_category: "", lot_id: "", budget_item_id: "",
  description: "", scope_of_work: "", contractor_name: "", contractor_business_number: "", contractor_representative: "",
  contractor_address: "", contractor_phone: "", contractor_email: "", contractor_manager: "", contractor_manager_phone: "",
  supervisor_id: "", inspector_id: "", sub_supervisor_id: "", contract_amount: 0, vat_amount: 0, contract_date: "",
  start_date: "", end_date: "", warranty_months: 12, author_name: "",
};

export default function ServiceProjectNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(empty);
  const [milestones, setMilestones] = useState<Milestone[]>(defaultMilestones);
  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  const { data: lots = [] } = useQuery({ queryKey: ["service-lots"], queryFn: async () => {
    const { data, error } = await supabase.from("parking_lots").select("id,code,name,lot_type").eq("status", "active").order("code");
    if (error) throw error; return data || [];
  }});
  const { data: profiles = [] } = useQuery({ queryKey: ["service-profiles"], queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("id,name,team").eq("is_active", true).order("name");
    if (error) throw error; return data || [];
  }});
  const { data: budgetItems = [] } = useQuery({ queryKey: ["service-budget-items"], queryFn: async () => {
    const plans = (await supabase.from("budget_plans").select("id,fiscal_year").in("status", ["approved", "executed"]).is("archived_at", null)).data || [];
    if (!plans.length) return [];
    const { data, error } = await supabase.from("budget_items").select("id,item_code,item_name,lot_id,allocated_amount,executed_amount,returned_amount,plan_id").in("plan_id", plans.map((plan) => plan.id)).eq("budget_type", "expenditure").is("archived_at", null).order("item_code");
    if (error) throw error;
    const years = new Map(plans.map((plan) => [plan.id, plan.fiscal_year]));
    return (data || []).map((item) => ({ ...item, fiscal_year: years.get(item.plan_id), remaining: Number(item.allocated_amount)-Number(item.executed_amount)-Number(item.returned_amount) })).filter((item) => item.remaining>0);
  }});

  const availableBudget = useMemo(() => budgetItems.filter((item) => !item.lot_id || !form.lot_id || item.lot_id===form.lot_id), [budgetItems, form.lot_id]);
  const selectedBudget = budgetItems.find((item) => item.id===form.budget_item_id);
  const selectedLot = lots.find((lot) => lot.id===form.lot_id);
  const totalAmount = Number(form.contract_amount||0)+Number(form.vat_amount||0);
  const totalWeight = milestones.reduce((sum, milestone) => sum+Number(milestone.weight_pct||0),0);

  useEffect(() => {
    if (!form.start_date || !form.end_date) return;
    const start = new Date(form.start_date).getTime(); const end = new Date(form.end_date).getTime();
    if (start>end) return;
    const dates = [0,0.5,1].map((ratio) => new Date(start+(end-start)*ratio).toISOString().slice(0,10));
    setMilestones((current) => current.map((milestone,index) => milestone.target_date ? milestone : { ...milestone, target_date: dates[Math.min(index,2)] }));
  }, [form.start_date, form.end_date]);

  const validateStep1 = () => {
    if (!form.title.trim() || !form.document_number.trim() || !form.lot_id || !form.budget_item_id) { toast.error("사업명, 문서번호, 주차장, 승인 예산항목을 입력하세요."); return false; }
    if (!form.contractor_name.trim() || !form.contractor_business_number.trim() || !form.contractor_manager.trim() || !form.contractor_manager_phone.trim()) { toast.error("업체명, 사업자번호, 현장 담당자와 연락처를 입력하세요."); return false; }
    return true;
  };
  const validateStep2 = () => {
    if (!form.supervisor_id || !form.inspector_id || form.supervisor_id===form.inspector_id) { toast.error("감독관과 검수관을 서로 다르게 지정하세요."); return false; }
    if (totalAmount<=0 || !form.start_date || !form.end_date || form.start_date>form.end_date) { toast.error("계약금액과 수행기간을 확인하세요."); return false; }
    if (selectedBudget && totalAmount>selectedBudget.remaining) { toast.error("계약 총액이 예산 잔액을 초과합니다."); return false; }
    if (totalWeight!==100 || milestones.some((milestone) => !milestone.title.trim() || !milestone.target_date)) { toast.error("마일스톤 제목·목표일과 비중 합계 100%를 확인하세요."); return false; }
    return true;
  };

  const submit = async () => {
    if (!validateStep1() || !validateStep2()) return;
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("create_service_project", {
      p_title: form.title, p_document_number: form.document_number, p_service_type: form.service_type, p_service_category: form.service_category||null,
      p_lot_id: form.lot_id, p_budget_item_id: form.budget_item_id, p_description: form.description||null, p_scope_of_work: form.scope_of_work||null,
      p_contractor_name: form.contractor_name, p_business_number: form.contractor_business_number, p_representative: form.contractor_representative||null,
      p_address: form.contractor_address||null, p_phone: form.contractor_phone||null, p_email: form.contractor_email||null,
      p_manager: form.contractor_manager, p_manager_phone: form.contractor_manager_phone, p_supervisor_id: form.supervisor_id,
      p_inspector_id: form.inspector_id, p_sub_supervisor_id: form.sub_supervisor_id||null, p_contract_amount: form.contract_amount,
      p_vat_amount: form.vat_amount||0, p_contract_date: form.contract_date||null, p_start_date: form.start_date, p_end_date: form.end_date,
      p_warranty_months: form.warranty_months||0, p_author_name: form.author_name||profile?.name||null, p_milestones: milestones,
      p_client_mutation_id: crypto.randomUUID(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const project = Array.isArray(data) ? data[0] : data;
    await logActivity({ module:"SERVICE", action:"용역사업 등록", targetType:"service_projects", targetId:project?.id, targetName:form.title });
    queryClient.invalidateQueries({ queryKey:["service-projects"] });
    toast.success(`${project?.project_number||"용역사업"} 등록 완료`);
    navigate(project?.id ? `/service/projects/${project.id}` : "/service/projects");
  };
  const updateMilestone = (index:number,key:keyof Milestone,value:unknown) => setMilestones((current) => current.map((item,itemIndex) => itemIndex===index ? { ...item,[key]:value } : item));
  const addMilestone = () => setMilestones((current) => [...current,{milestone_type:"progress",title:"",target_date:"",weight_pct:0,deliverables_expected:""}]);
  const removeMilestone = (index:number) => setMilestones((current) => current.filter((_,itemIndex) => itemIndex!==index));

  return <DashboardLayout><div className="mx-auto max-w-5xl space-y-4 pb-24 md:pb-6">
    <div className="flex items-center gap-3"><Button variant="ghost" size="icon" title="목록" onClick={() => navigate("/service/projects")}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-xl font-bold">용역사업 등록</h1><p className="text-sm text-muted-foreground">문서·예산·주차장·업체를 연결하고 감독·검수 일정을 등록합니다.</p></div></div>
    <div className="grid grid-cols-2 gap-1 text-center text-sm"><div className={`border-b-2 py-2 ${step===1?"border-primary font-semibold":"border-muted text-muted-foreground"}`}>1. 사업·업체</div><div className={`border-b-2 py-2 ${step===2?"border-primary font-semibold":"border-muted text-muted-foreground"}`}>2. 감독·계약</div></div>
    <Card><CardContent className="space-y-5 pt-6">{step===1 ? <>
      <div className="grid gap-4 md:grid-cols-2"><div className="md:col-span-2"><Label>사업명 *</Label><Input value={form.title} onChange={(event)=>update("title",event.target.value)} /></div><div><Label>근거 문서번호 *</Label><Input value={form.document_number} onChange={(event)=>update("document_number",event.target.value)} placeholder="제주시청-차량관리과-2026-0000" /></div><div><Label>분류</Label><Input value={form.service_category} onChange={(event)=>update("service_category",event.target.value)} /></div><div><Label>용역유형 *</Label><Select value={form.service_type} onValueChange={(value)=>update("service_type",value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SERVICE_TYPE_LABELS).filter(([key])=>!["maintenance","construction"].includes(key)).map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label>관련 주차장 *</Label><Select value={form.lot_id} onValueChange={(value)=>{update("lot_id",value); if(selectedBudget?.lot_id && selectedBudget.lot_id!==value) update("budget_item_id","");}}><SelectTrigger><SelectValue placeholder="주차장 선택" /></SelectTrigger><SelectContent>{lots.map((lot)=><SelectItem key={lot.id} value={lot.id}>[{lot.code}] {lot.name} · {getParkingLotTypeLabel(lot.lot_type)}</SelectItem>)}</SelectContent></Select>{selectedLot&&<Badge variant="outline" className="mt-2">{getParkingLotTypeLabel(selectedLot.lot_type)}</Badge>}</div><div><Label>승인 예산항목 *</Label><Select value={form.budget_item_id} onValueChange={(value)=>update("budget_item_id",value)}><SelectTrigger><SelectValue placeholder="예산 선택" /></SelectTrigger><SelectContent>{availableBudget.map((item)=><SelectItem key={item.id} value={item.id}>{item.fiscal_year} [{item.item_code}] {item.item_name} · {item.remaining.toLocaleString()}원</SelectItem>)}</SelectContent></Select>{selectedBudget&&<p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><WalletCards className="h-3.5 w-3.5" />잔액 {selectedBudget.remaining.toLocaleString()}원</p>}</div></div>
      <div><Label>사업 개요</Label><Textarea rows={2} value={form.description} onChange={(event)=>update("description",event.target.value)} /></div><div><Label>수행 범위</Label><Textarea rows={2} value={form.scope_of_work} onChange={(event)=>update("scope_of_work",event.target.value)} /></div>
      <div className="border-t pt-4"><h2 className="mb-3 text-sm font-semibold">수행업체 연락망</h2><div className="grid gap-4 md:grid-cols-2"><div><Label>업체명 *</Label><Input value={form.contractor_name} onChange={(event)=>update("contractor_name",event.target.value)} /></div><div><Label>사업자등록번호 *</Label><Input value={form.contractor_business_number} onChange={(event)=>update("contractor_business_number",event.target.value)} /></div><div><Label>대표자</Label><Input value={form.contractor_representative} onChange={(event)=>update("contractor_representative",event.target.value)} /></div><div><Label>현장 담당자 *</Label><Input value={form.contractor_manager} onChange={(event)=>update("contractor_manager",event.target.value)} /></div><div><Label>담당자 연락처 *</Label><Input value={form.contractor_manager_phone} onChange={(event)=>update("contractor_manager_phone",event.target.value)} /></div><div><Label>업체 대표전화</Label><Input value={form.contractor_phone} onChange={(event)=>update("contractor_phone",event.target.value)} /></div><div><Label>이메일</Label><Input type="email" value={form.contractor_email} onChange={(event)=>update("contractor_email",event.target.value)} /></div><div><Label>주소</Label><Input value={form.contractor_address} onChange={(event)=>update("contractor_address",event.target.value)} /></div></div></div>
    </> : <>
      <div className="grid gap-4 md:grid-cols-3">{[{label:"감독관 *",key:"supervisor_id"},{label:"검수관 *",key:"inspector_id"},{label:"부감독관",key:"sub_supervisor_id"}].map((field)=><div key={field.key}><Label>{field.label}</Label><Select value={(form as any)[field.key]} onValueChange={(value)=>update(field.key,value)}><SelectTrigger><SelectValue placeholder="담당자 선택" /></SelectTrigger><SelectContent>{profiles.map((person)=><SelectItem key={person.id} value={person.id}>{person.name} · {person.team}</SelectItem>)}</SelectContent></Select></div>)}</div>
      <div className="grid gap-4 md:grid-cols-3"><div><Label>계약금액 *</Label><Input type="number" value={form.contract_amount||""} onChange={(event)=>update("contract_amount",Number(event.target.value))} /></div><div><Label>부가세</Label><Input type="number" value={form.vat_amount||""} onChange={(event)=>update("vat_amount",Number(event.target.value))} /></div><div><Label>총 계약액</Label><Input value={totalAmount.toLocaleString()} disabled /></div><div><Label>계약일</Label><Input type="date" value={form.contract_date} onChange={(event)=>update("contract_date",event.target.value)} /></div><div><Label>착수일 *</Label><Input type="date" value={form.start_date} onChange={(event)=>update("start_date",event.target.value)} /></div><div><Label>완료예정일 *</Label><Input type="date" value={form.end_date} onChange={(event)=>update("end_date",event.target.value)} /></div><div><Label>하자보증 개월</Label><Input type="number" value={form.warranty_months} onChange={(event)=>update("warranty_months",Number(event.target.value))} /></div></div>
      <div className="border-t pt-4"><div className="mb-3 flex items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">마일스톤</h2><p className={`text-xs ${totalWeight===100?"text-muted-foreground":"text-destructive"}`}>비중 합계 {totalWeight}%</p></div><Button variant="outline" size="sm" onClick={addMilestone}><Plus className="mr-1 h-4 w-4" />추가</Button></div>
        <div className="grid gap-3 md:hidden">{milestones.map((milestone,index)=><div key={index} className="space-y-2 border p-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">단계 {index+1}</span><Button variant="ghost" size="icon" title="삭제" onClick={()=>removeMilestone(index)}><Trash2 className="h-4 w-4" /></Button></div><Select value={milestone.milestone_type} onValueChange={(value)=>updateMilestone(index,"milestone_type",value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(MILESTONE_TYPE_LABELS).map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select><Input value={milestone.title} onChange={(event)=>updateMilestone(index,"title",event.target.value)} placeholder="단계명" /><Input type="date" value={milestone.target_date} onChange={(event)=>updateMilestone(index,"target_date",event.target.value)} /><div className="grid grid-cols-[90px_1fr] gap-2"><Input type="number" value={milestone.weight_pct} onChange={(event)=>updateMilestone(index,"weight_pct",Number(event.target.value))} /><Input value={milestone.deliverables_expected} onChange={(event)=>updateMilestone(index,"deliverables_expected",event.target.value)} placeholder="성과물" /></div></div>)}</div>
        <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>단계</TableHead><TableHead>구분</TableHead><TableHead>단계명</TableHead><TableHead>목표일</TableHead><TableHead>비중</TableHead><TableHead>성과물</TableHead><TableHead /></TableRow></TableHeader><TableBody>{milestones.map((milestone,index)=><TableRow key={index}><TableCell>{index+1}</TableCell><TableCell><Select value={milestone.milestone_type} onValueChange={(value)=>updateMilestone(index,"milestone_type",value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(MILESTONE_TYPE_LABELS).map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><Input value={milestone.title} onChange={(event)=>updateMilestone(index,"title",event.target.value)} /></TableCell><TableCell><Input type="date" value={milestone.target_date} onChange={(event)=>updateMilestone(index,"target_date",event.target.value)} /></TableCell><TableCell><Input className="w-20" type="number" value={milestone.weight_pct} onChange={(event)=>updateMilestone(index,"weight_pct",Number(event.target.value))} /></TableCell><TableCell><Input value={milestone.deliverables_expected} onChange={(event)=>updateMilestone(index,"deliverables_expected",event.target.value)} /></TableCell><TableCell><Button variant="ghost" size="icon" title="삭제" onClick={()=>removeMilestone(index)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div>
      </div><AuthorField value={form.author_name} onChange={(value)=>update("author_name",value)} />
    </>}</CardContent></Card>
    <div className="fixed inset-x-0 bottom-0 z-20 flex justify-between border-t bg-background p-3 md:static md:border-0 md:p-0"><Button variant="outline" onClick={()=>step===1?navigate("/service/projects"):setStep(1)}><ArrowLeft className="mr-1 h-4 w-4" />{step===1?"취소":"이전"}</Button>{step===1?<Button onClick={()=>validateStep1()&&setStep(2)}>감독·계약 입력<ArrowRight className="ml-1 h-4 w-4" /></Button>:<Button onClick={submit} disabled={saving}><Check className="mr-1 h-4 w-4" />{saving?"등록 중":"등록"}</Button>}</div>
  </div></DashboardLayout>;
}
