import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-logger";
import { CATEGORY_LABELS, CHANNEL_LABELS, PRIORITY_LABELS, type Complaint } from "@/types/complaint";
import { getComplaintRule, getParkingLotWorkProfile, getRecommendedDueDate } from "@/lib/parking-lot-work-profile";

type EditForm = {
  title: string;
  content: string;
  category: string;
  sub_category: string;
  priority: string;
  due_date: string;
  channel: string;
  lot_id: string;
  location_detail: string;
  incident_date: string;
  incident_time: string;
  vehicle_number: string;
  complainant_name: string;
  complainant_phone: string;
  complainant_email: string;
  complainant_address: string;
  is_anonymous: boolean;
  saeol_ref: string;
  saeol_status: string;
  external_ref: string;
  is_repeat: boolean;
  related_complaint_id: string;
  repeat_count: number;
  notes: string;
};

const FIELD_LABELS: Record<keyof EditForm, string> = {
  title: "제목", content: "내용", category: "유형", sub_category: "세부유형",
  priority: "우선순위", due_date: "처리기한", channel: "접수채널", lot_id: "주차장",
  location_detail: "상세위치", incident_date: "발생일", incident_time: "발생시간",
  vehicle_number: "차량번호", complainant_name: "민원인", complainant_phone: "연락처",
  complainant_email: "이메일", complainant_address: "주소", is_anonymous: "익명 여부",
  saeol_ref: "새올 연계번호", saeol_status: "새올 상태", external_ref: "외부 접수번호",
  is_repeat: "반복민원 여부", related_complaint_id: "원 민원", repeat_count: "반복횟수", notes: "관리 메모",
};

function toForm(complaint: Complaint): EditForm {
  return {
    title: complaint.title || "",
    content: complaint.content || "",
    category: complaint.category || "other",
    sub_category: complaint.sub_category || "",
    priority: complaint.priority || "normal",
    due_date: complaint.due_date?.slice(0, 10) || "",
    channel: complaint.channel || "phone",
    lot_id: complaint.lot_id || "none",
    location_detail: complaint.location_detail || "",
    incident_date: complaint.incident_date || "",
    incident_time: complaint.incident_time || "",
    vehicle_number: complaint.vehicle_number || "",
    complainant_name: complaint.complainant_name || "",
    complainant_phone: complaint.complainant_phone || "",
    complainant_email: complaint.complainant_email || "",
    complainant_address: complaint.complainant_address || "",
    is_anonymous: complaint.is_anonymous,
    saeol_ref: complaint.saeol_ref || "",
    saeol_status: complaint.saeol_status || "",
    external_ref: complaint.external_ref || "",
    is_repeat: complaint.is_repeat,
    related_complaint_id: complaint.related_complaint_id || "none",
    repeat_count: complaint.repeat_count || 0,
    notes: complaint.notes || "",
  };
}

function nullable(value: string) {
  return value && value !== "none" ? value : null;
}

interface ComplaintEditDialogProps {
  complaint: Complaint;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function ComplaintEditDialog({ complaint, open, onOpenChange, onSaved }: ComplaintEditDialogProps) {
  const { profile } = useAuth();
  const [form, setForm] = useState<EditForm>(() => toForm(complaint));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(toForm(complaint));
  }, [complaint, open]);

  const { data: lots = [] } = useQuery({
    queryKey: ["complaint-edit-lots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: relatedCandidates = [] } = useQuery({
    queryKey: ["complaint-related-candidates", complaint.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("complaints")
        .select("id, complaint_number, title, repeat_count, received_at")
        .neq("id", complaint.id).order("received_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: open && form.is_repeat,
  });

  const changedFields = useMemo(() => {
    const initial = toForm(complaint);
    return (Object.keys(form) as Array<keyof EditForm>).filter((key) => form[key] !== initial[key]);
  }, [complaint, form]);
  const selectedLot = useMemo(() => lots.find((lot) => lot.id === form.lot_id), [form.lot_id, lots]);
  const selectedProfile = useMemo(() => getParkingLotWorkProfile(selectedLot?.lot_type), [selectedLot?.lot_type]);
  const selectedRule = useMemo(() => getComplaintRule(selectedLot?.lot_type, form.sub_category), [form.sub_category, selectedLot?.lot_type]);

  const update = <K extends keyof EditForm>(key: K, value: EditForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const applySubtype = (value: string) => {
    const rule = getComplaintRule(selectedLot?.lot_type, value);
    setForm((current) => ({ ...current, sub_category: value, category: rule?.category || current.category, priority: rule?.priority || current.priority, due_date: rule ? getRecommendedDueDate(rule.dueDays) : current.due_date }));
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim() || !form.category) {
      toast({ title: "제목, 내용, 유형은 필수입니다", variant: "destructive" });
      return;
    }
    if (form.is_repeat && form.related_complaint_id === complaint.id) {
      toast({ title: "현재 민원을 원 민원으로 지정할 수 없습니다", variant: "destructive" });
      return;
    }
    if (!changedFields.length) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    const payload = {
      title: form.title.trim(), content: form.content.trim(), category: form.category,
      sub_category: nullable(form.sub_category), priority: form.priority, due_date: nullable(form.due_date),
      channel: form.channel, lot_id: nullable(form.lot_id), location_detail: nullable(form.location_detail),
      incident_date: nullable(form.incident_date), incident_time: nullable(form.incident_time),
      vehicle_number: nullable(form.vehicle_number), is_anonymous: form.is_anonymous,
      complainant_name: form.is_anonymous ? null : nullable(form.complainant_name),
      complainant_phone: form.is_anonymous ? null : nullable(form.complainant_phone),
      complainant_email: form.is_anonymous ? null : nullable(form.complainant_email),
      complainant_address: form.is_anonymous ? null : nullable(form.complainant_address),
      saeol_ref: nullable(form.saeol_ref), saeol_status: nullable(form.saeol_status), external_ref: nullable(form.external_ref),
      is_repeat: form.is_repeat, related_complaint_id: form.is_repeat ? nullable(form.related_complaint_id) : null,
      repeat_count: form.is_repeat ? Math.max(2, form.repeat_count || 0) : 0, notes: nullable(form.notes),
    };

    const changedPayload: Record<string, unknown> = {};
    changedFields.forEach((key) => { changedPayload[key] = payload[key]; });
    if (changedFields.includes("is_anonymous")) {
      changedPayload.complainant_name = payload.complainant_name;
      changedPayload.complainant_phone = payload.complainant_phone;
      changedPayload.complainant_email = payload.complainant_email;
      changedPayload.complainant_address = payload.complainant_address;
    }
    if (changedFields.includes("is_repeat")) {
      changedPayload.related_complaint_id = payload.related_complaint_id;
      changedPayload.repeat_count = payload.repeat_count;
    }

    let updateQuery = supabase.from("complaints").update(changedPayload as any).eq("id", complaint.id);
    if (complaint.updated_at) updateQuery = updateQuery.eq("updated_at", complaint.updated_at);
    const { data: updated, error } = await updateQuery.select("id").maybeSingle();
    if (error) {
      setSaving(false);
      toast({ title: "민원 정보 수정 실패", description: error.message, variant: "destructive" });
      return;
    }
    if (!updated) {
      setSaving(false);
      toast({ title: "다른 사용자가 먼저 수정했습니다", description: "최신 정보를 다시 불러온 뒤 수정해 주세요.", variant: "destructive" });
      onOpenChange(false);
      onSaved();
      return;
    }

    const labels = changedFields.map((key) => FIELD_LABELS[key]);
    if (profile?.id) {
      await supabase.from("complaint_comments").insert({
        complaint_id: complaint.id,
        author_id: profile.id,
        author_name: profile.name,
        content: `민원 정보 정정: ${labels.join(", ")}`,
        comment_type: "internal",
        is_system: true,
      });
    }
    await logActivity({ module: "COMPLAINT", action: "정보수정", targetType: "complaint", targetId: complaint.id, targetName: complaint.complaint_number, details: { fields: labels } });
    setSaving(false);
    toast({ title: "민원 정보를 수정했습니다", description: `${labels.length}개 항목 변경` });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>민원 정보 수정</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">민원 내용과 처리기한</h3>
            <div><Label>제목 *</Label><Input value={form.title} onChange={(event) => update("title", event.target.value)} /></div>
            <div><Label>내용 *</Label><Textarea rows={5} value={form.content} onChange={(event) => update("content", event.target.value)} /></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label>유형 *</Label><Select value={form.category} onValueChange={(value) => update("category", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>세부유형</Label>{form.lot_id !== "none" ? <Select value={form.sub_category} onValueChange={applySubtype}><SelectTrigger><SelectValue placeholder="세부유형 선택" /></SelectTrigger><SelectContent>{selectedProfile.complaintRules.map((rule) => <SelectItem key={rule.value} value={rule.value}>{rule.label}</SelectItem>)}</SelectContent></Select> : <Input value={form.sub_category} onChange={(event) => update("sub_category", event.target.value)} />}</div>
              <div><Label>우선순위</Label><Select value={form.priority} onValueChange={(value) => update("priority", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PRIORITY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>처리기한</Label><Input type="date" value={form.due_date} onChange={(event) => update("due_date", event.target.value)} /></div>
            </div>
          </section>

          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">접수와 발생 정보</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label>접수채널</Label><Select value={form.channel} onValueChange={(value) => update("channel", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CHANNEL_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>관련 주차장</Label><Select value={form.lot_id} onValueChange={(value) => setForm((current) => ({ ...current, lot_id: value, sub_category: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">미지정</SelectItem>{lots.map((lot) => <SelectItem key={lot.id} value={lot.id}>{lot.name} ({lot.code})</SelectItem>)}</SelectContent></Select></div>
              <div><Label>발생일</Label><Input type="date" value={form.incident_date} onChange={(event) => update("incident_date", event.target.value)} /></div>
              <div><Label>발생시간</Label><Input type="time" value={form.incident_time} onChange={(event) => update("incident_time", event.target.value)} /></div>
            </div>
            {form.lot_id !== "none" && <div className="rounded-md border bg-muted/30 p-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{selectedProfile.label}</Badge><span className="text-xs text-muted-foreground">권장 위치 항목: {selectedProfile.locationFields.map((field) => field.label).join(" · ")}</span></div>{selectedRule && <p className="mt-1 text-xs text-muted-foreground">표준 처리: {PRIORITY_LABELS[selectedRule.priority]} · {selectedRule.dueDays}일 이내{selectedRule.createsMaintenanceWork ? " · 시설 작업 연계 대상" : ""}</p>}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><Label>상세위치</Label><Input value={form.location_detail} onChange={(event) => update("location_detail", event.target.value)} placeholder={form.lot_id !== "none" ? selectedProfile.locationFields.map((field) => `${field.label}: ...`).join(" / ") : "상세 위치"} /></div><div><Label>관련 차량번호</Label><Input value={form.vehicle_number} onChange={(event) => update("vehicle_number", event.target.value)} /></div></div>
          </section>

          <section className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">민원인 정보</h3><div className="flex items-center gap-2"><Switch checked={form.is_anonymous} onCheckedChange={(value) => update("is_anonymous", value)} /><Label>익명</Label></div></div>
            {!form.is_anonymous && <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><div><Label>이름</Label><Input value={form.complainant_name} onChange={(event) => update("complainant_name", event.target.value)} /></div><div><Label>연락처</Label><Input value={form.complainant_phone} onChange={(event) => update("complainant_phone", event.target.value)} /></div><div><Label>이메일</Label><Input type="email" value={form.complainant_email} onChange={(event) => update("complainant_email", event.target.value)} /></div><div><Label>주소</Label><Input value={form.complainant_address} onChange={(event) => update("complainant_address", event.target.value)} /></div></div>}
          </section>

          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">외부 시스템과 반복민원 연결</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div><Label>새올 연계번호</Label><Input value={form.saeol_ref} onChange={(event) => update("saeol_ref", event.target.value)} /></div><div><Label>새올 처리상태</Label><Input value={form.saeol_status} onChange={(event) => update("saeol_status", event.target.value)} /></div><div><Label>기타 외부 접수번호</Label><Input value={form.external_ref} onChange={(event) => update("external_ref", event.target.value)} /></div></div>
            <div className="flex items-center gap-2"><Checkbox checked={form.is_repeat} onCheckedChange={(value) => update("is_repeat", !!value)} /><Label>반복민원으로 관리</Label></div>
            {form.is_repeat && <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-md border p-3"><div className="md:col-span-2"><Label>원 민원번호</Label><Select value={form.related_complaint_id} onValueChange={(value) => { update("related_complaint_id", value); const selected = relatedCandidates.find((item) => item.id === value); if (selected) update("repeat_count", Math.max(2, (selected.repeat_count || 1) + 1)); }}><SelectTrigger><SelectValue placeholder="원 민원을 선택하세요" /></SelectTrigger><SelectContent><SelectItem value="none">원 민원 미지정</SelectItem>{relatedCandidates.map((item) => <SelectItem key={item.id} value={item.id}>{item.complaint_number} · {item.title}</SelectItem>)}</SelectContent></Select></div><div><Label>누적 반복횟수</Label><Input type="number" min={2} value={form.repeat_count} onChange={(event) => update("repeat_count", Number(event.target.value))} /></div></div>}
          </section>

          <section className="space-y-2 border-t pt-4"><Label>내부 관리 메모</Label><Textarea rows={3} value={form.notes} onChange={(event) => update("notes", event.target.value)} /></section>
          {changedFields.length > 0 && <div className="flex gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 text-xs"><AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" /><span>{changedFields.map((key) => FIELD_LABELS[key]).join(", ")} 항목의 변경 이력이 타임라인에 기록됩니다.</span></div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button onClick={save} disabled={saving || !changedFields.length}><Save className="h-4 w-4 mr-1" />{saving ? "저장 중" : "변경사항 저장"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
