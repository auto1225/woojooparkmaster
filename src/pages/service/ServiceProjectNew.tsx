import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { SERVICE_TYPE_LABELS, MILESTONE_TYPE_LABELS } from "@/types/service";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

interface MilestoneRow {
  milestone_number: number; milestone_type: string; title: string;
  target_date: string; weight_pct: number; deliverables_expected: string;
}

const defaultMilestones: MilestoneRow[] = [
  { milestone_number: 1, milestone_type: "kickoff", title: "착수보고", target_date: "", weight_pct: 10, deliverables_expected: "착수보고서" },
  { milestone_number: 2, milestone_type: "progress", title: "1차 기성", target_date: "", weight_pct: 40, deliverables_expected: "중간보고서" },
  { milestone_number: 3, milestone_type: "final", title: "준공", target_date: "", weight_pct: 50, deliverables_expected: "최종보고서" },
];

export default function ServiceProjectNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "", service_type: "facility_maintenance", service_category: "",
    lot_id: "", description: "", scope_of_work: "",
    contractor_name: "", contractor_business_number: "", contractor_representative: "",
    contractor_address: "", contractor_phone: "", contractor_email: "",
    contractor_manager: "", contractor_manager_phone: "",
    supervisor_id: "", inspector_id: "", sub_supervisor_id: "",
    contract_amount: "", vat_amount: "", contract_date: "",
    start_date: "", end_date: "", warranty_months: "12",
  });

  const [milestones, setMilestones] = useState<MilestoneRow[]>([...defaultMilestones]);

  const { data: lots } = useQuery({
    queryKey: ["parking-lots-select"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name").order("code");
      return data || [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles-select"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, name, team").order("name");
      return data || [];
    },
  });

  const totalWeight = milestones.reduce((s, m) => s + m.weight_pct, 0);
  const contractNum = Number(form.contract_amount) || 0;
  const vatNum = Number(form.vat_amount) || 0;
  const totalAmount = contractNum + vatNum;

  const addMilestone = () => {
    setMilestones(prev => [...prev, {
      milestone_number: prev.length + 1, milestone_type: "progress",
      title: "", target_date: "", weight_pct: 0, deliverables_expected: "",
    }]);
  };

  const removeMilestone = (idx: number) => {
    setMilestones(prev => prev.filter((_, i) => i !== idx).map((m, i) => ({ ...m, milestone_number: i + 1 })));
  };

  const updateMilestone = (idx: number, field: keyof MilestoneRow, value: any) => {
    setMilestones(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  const applyTemplate = () => setMilestones([...defaultMilestones]);

  const handleSave = async () => {
    if (!form.title || !form.contractor_name || !form.start_date || !form.end_date || !form.contract_amount) {
      toast({ title: "필수 항목을 입력하세요", variant: "destructive" });
      return;
    }
    if (totalWeight !== 100) {
      toast({ title: "마일스톤 비중 합계가 100%가 아닙니다", description: `현재 ${totalWeight}%`, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const year = new Date().getFullYear();
      const { count } = await supabase.from("service_projects").select("id", { count: "exact", head: true }).gte("created_at", `${year}-01-01`);
      const projectNumber = `SP-${year}-${String((count || 0) + 1).padStart(3, "0")}`;

      const workDays = Math.ceil((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000);
      const warrantyMonths = Number(form.warranty_months) || 0;
      const warrantyEnd = warrantyMonths > 0 && form.end_date
        ? new Date(new Date(form.end_date).setMonth(new Date(form.end_date).getMonth() + warrantyMonths)).toISOString().slice(0, 10)
        : undefined;

      const { data: project, error } = await supabase.from("service_projects").insert({
        project_number: projectNumber,
        title: form.title,
        service_type: form.service_type,
        service_category: form.service_category || null,
        lot_id: form.lot_id || null,
        description: form.description || null,
        scope_of_work: form.scope_of_work || null,
        contractor_name: form.contractor_name,
        contractor_business_number: form.contractor_business_number || null,
        contractor_representative: form.contractor_representative || null,
        contractor_address: form.contractor_address || null,
        contractor_phone: form.contractor_phone || null,
        contractor_email: form.contractor_email || null,
        contractor_manager: form.contractor_manager || null,
        contractor_manager_phone: form.contractor_manager_phone || null,
        supervisor_id: form.supervisor_id || null,
        inspector_id: form.inspector_id || null,
        sub_supervisor_id: form.sub_supervisor_id || null,
        contract_amount: contractNum,
        vat_amount: vatNum,
        total_amount: totalAmount,
        contract_date: form.contract_date || null,
        start_date: form.start_date,
        end_date: form.end_date,
        work_days: workDays,
        warranty_months: warrantyMonths || null,
        warranty_end: warrantyEnd || null,
        created_by: profile?.id,
      } as any).select().single();

      if (error) throw error;

      if (milestones.length > 0) {
        const msData = milestones.map(m => ({
          project_id: project.id,
          milestone_number: m.milestone_number,
          milestone_type: m.milestone_type,
          title: m.title,
          target_date: m.target_date,
          weight_pct: m.weight_pct,
          deliverables_expected: m.deliverables_expected || null,
        }));
        await supabase.from("service_milestones").insert(msData as any);
      }

      await logActivity({ module: "service", action: "create", targetType: "service_project", targetId: project.id, targetName: form.title });
      queryClient.invalidateQueries({ queryKey: ["service-projects"] });
      toast({ title: "사업이 등록되었습니다" });
      navigate(`/service/projects/${project.id}`);
    } catch (err: any) {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/service/projects")} className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> 목록
          </Button>
          <h2 className="text-xl font-bold">용역사업 등록</h2>
        </div>

        {/* Section 1: Basic Info */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">기본 정보</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><Label>사업명 *</Label><Input value={form.title} onChange={e => set("title", e.target.value)} /></div>
            <div>
              <Label>용역 유형 *</Label>
              <Select value={form.service_type} onValueChange={v => set("service_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>분류</Label><Input value={form.service_category} onChange={e => set("service_category", e.target.value)} /></div>
            <div>
              <Label>관련 주차장</Label>
              <Select value={form.lot_id} onValueChange={v => set("lot_id", v)}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>{lots?.map(l => <SelectItem key={l.id} value={l.id}>[{l.code}] {l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2"><Label>사업 개요</Label><Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} /></div>
            <div className="md:col-span-2"><Label>수행 범위</Label><Textarea value={form.scope_of_work} onChange={e => set("scope_of_work", e.target.value)} rows={2} /></div>
          </CardContent>
        </Card>

        {/* Section 2: Contractor */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">수행업체</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>업체명 *</Label><Input value={form.contractor_name} onChange={e => set("contractor_name", e.target.value)} /></div>
            <div><Label>사업자등록번호</Label><Input value={form.contractor_business_number} onChange={e => set("contractor_business_number", e.target.value)} /></div>
            <div><Label>대표자</Label><Input value={form.contractor_representative} onChange={e => set("contractor_representative", e.target.value)} /></div>
            <div><Label>주소</Label><Input value={form.contractor_address} onChange={e => set("contractor_address", e.target.value)} /></div>
            <div><Label>전화</Label><Input value={form.contractor_phone} onChange={e => set("contractor_phone", e.target.value)} /></div>
            <div><Label>이메일</Label><Input value={form.contractor_email} onChange={e => set("contractor_email", e.target.value)} /></div>
            <div><Label>담당자명</Label><Input value={form.contractor_manager} onChange={e => set("contractor_manager", e.target.value)} /></div>
            <div><Label>담당자 연락처</Label><Input value={form.contractor_manager_phone} onChange={e => set("contractor_manager_phone", e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Section 3: Supervisor */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">감독/검수</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "감독관 *", field: "supervisor_id" },
              { label: "부감독관", field: "sub_supervisor_id" },
              { label: "검수관 *", field: "inspector_id" },
            ].map(({ label, field }) => (
              <div key={field}>
                <Label>{label}</Label>
                <Select value={(form as any)[field]} onValueChange={v => set(field, v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{profiles?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.team})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Section 4: Amount / Period */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">금액 / 기간</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label>계약금액 (원) *</Label><Input type="number" value={form.contract_amount} onChange={e => set("contract_amount", e.target.value)} /></div>
            <div><Label>부가세</Label><Input type="number" value={form.vat_amount} onChange={e => set("vat_amount", e.target.value)} /></div>
            <div><Label>총액</Label><Input value={totalAmount.toLocaleString()} disabled /></div>
            <div><Label>계약일</Label><Input type="date" value={form.contract_date} onChange={e => set("contract_date", e.target.value)} /></div>
            <div><Label>착수일 *</Label><Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} /></div>
            <div><Label>완료예정일 *</Label><Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} /></div>
            <div><Label>하자보증 (개월)</Label><Input type="number" value={form.warranty_months} onChange={e => set("warranty_months", e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Section 5: Milestones */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">마일스톤 설정</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={applyTemplate}>기본 템플릿</Button>
              <Button variant="outline" size="sm" onClick={addMilestone}><Plus className="h-3.5 w-3.5 mr-1" /> 추가</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">단계</TableHead>
                  <TableHead>구분</TableHead>
                  <TableHead>단계명</TableHead>
                  <TableHead>목표일</TableHead>
                  <TableHead className="w-20">비중(%)</TableHead>
                  <TableHead>성과물</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {milestones.map((m, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-center text-sm">{m.milestone_number}</TableCell>
                    <TableCell>
                      <Select value={m.milestone_type} onValueChange={v => updateMilestone(idx, "milestone_type", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(MILESTONE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input className="h-8 text-xs" value={m.title} onChange={e => updateMilestone(idx, "title", e.target.value)} /></TableCell>
                    <TableCell><Input className="h-8 text-xs" type="date" value={m.target_date} onChange={e => updateMilestone(idx, "target_date", e.target.value)} /></TableCell>
                    <TableCell><Input className="h-8 text-xs text-center" type="number" value={m.weight_pct} onChange={e => updateMilestone(idx, "weight_pct", Number(e.target.value))} /></TableCell>
                    <TableCell><Input className="h-8 text-xs" value={m.deliverables_expected} onChange={e => updateMilestone(idx, "deliverables_expected", e.target.value)} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMilestone(idx)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className={`px-4 py-2 text-xs text-right ${totalWeight !== 100 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              비중 합계: {totalWeight}% {totalWeight !== 100 && "(⚠ 100%가 되어야 합니다)"}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate("/service/projects")}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "저장 중..." : "등록"}</Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
