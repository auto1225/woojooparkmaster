import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { VIOLATION_TYPE_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from "@/types/operations";
import { Plus, Search } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";

type LotType = "offstreet" | "multilevel" | "onstreet";

type ParkingLotOption = {
  id: string;
  code: string;
  name: string;
  lot_type: LotType | null;
};

type EnforcementRecord = Record<string, any> & {
  id: string;
  enforcement_number: string;
  vehicle_number: string;
  parking_lots?: Pick<ParkingLotOption, "code" | "name" | "lot_type"> | null;
};

type PaymentForm = {
  paid_amount: string;
  paid_date: string;
  receipt_number: string;
  document_number: string;
};

const LOT_TYPE_LABELS: Record<string, string> = {
  offstreet: "노외주차장",
  multilevel: "주차빌딩",
  onstreet: "노상주차장",
};

const APPEAL_STATUS_LABELS: Record<string, string> = {
  none: "이의신청 없음",
  received: "이의신청 접수",
  reviewing: "검토 중",
  completed: "처리 완료",
};

const APPEAL_RESULT_LABELS: Record<string, string> = {
  none: "결과 미정",
  upheld: "원처분 유지",
  reduced: "과태료 감경",
  cancelled: "처분 취소",
  dismissed: "각하",
};

const SORT_LABELS: Record<string, string> = {
  newest: "단속일시 최신순",
  oldest: "단속일시 오래된순",
  due: "납부기한 임박순",
  amount: "과태료 높은순",
  vehicle: "차량번호순",
  lot: "주차장순",
};

const NOTE_LABELS = {
  documentNumber: "공식문서번호",
  paidAmount: "납부액",
  receiptNumber: "영수증번호",
} as const;

function toLocalDateTimeInput(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toLocalDateInput(value: Date = new Date()) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function addDaysDateInput(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return toLocalDateInput(value);
}

function readNoteValue(notes: string | null | undefined, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return notes?.match(new RegExp(`^\\[${escaped}\\]\\s*(.+)$`, "m"))?.[1]?.trim() || "";
}

function stripNoteMetadata(notes: string | null | undefined) {
  const labels = Object.values(NOTE_LABELS).join("|");
  return (notes || "")
    .split("\n")
    .filter((line) => !new RegExp(`^\\[(?:${labels})\\]`).test(line.trim()))
    .join("\n")
    .trim();
}

function parseLocationDetail(value: string | null | undefined) {
  if (!value?.startsWith("PM_LOC:")) return { location_note: value || "" };
  try {
    const parsed = JSON.parse(value.slice(7));
    return {
      offstreet_zone: parsed.oz || "",
      building_floor: parsed.bf || "",
      building_zone: parsed.bz || "",
      road_segment: parsed.rs || "",
      road_direction: parsed.rd || "",
      location_note: parsed.n || "",
    };
  } catch {
    return { location_note: value };
  }
}

function composeLocationDetail(form: Record<string, any>) {
  const value = JSON.stringify({
    oz: form.offstreet_zone || undefined,
    bf: form.building_floor || undefined,
    bz: form.building_zone || undefined,
    rs: form.road_segment || undefined,
    rd: form.road_direction || undefined,
    n: form.location_note || undefined,
  });
  return `PM_LOC:${value}`.slice(0, 200);
}

function formatLocationDetail(record: Record<string, any>) {
  const detail = parseLocationDetail(record.location_detail);
  const lotType = record.parking_lots?.lot_type;
  if (lotType === "offstreet") return [(record.location_zone || detail.offstreet_zone) && `${record.location_zone || detail.offstreet_zone} 구역`, detail.location_note].filter(Boolean).join(" · ");
  if (lotType === "multilevel") return [(record.location_floor || detail.building_floor) && `${record.location_floor || detail.building_floor}층`, (record.location_zone || detail.building_zone) && `${record.location_zone || detail.building_zone} 존`, detail.location_note].filter(Boolean).join(" · ");
  if (lotType === "onstreet") return [record.road_segment || detail.road_segment, record.road_direction || detail.road_direction, detail.location_note].filter(Boolean).join(" · ");
  return detail.location_note || record.violation_location || "-";
}

function hydrateRecord(record: EnforcementRecord) {
  return {
    ...record,
    violation_date: toLocalDateTimeInput(record.violation_date),
    document_number: record.document_number || readNoteValue(record.notes, NOTE_LABELS.documentNumber),
    paid_amount: record.paid_amount ?? readNoteValue(record.notes, NOTE_LABELS.paidAmount),
    receipt_number: record.payment_receipt_number || readNoteValue(record.notes, NOTE_LABELS.receiptNumber),
    notes: stripNoteMetadata(record.notes),
    appeal_status: record.appeal_status || "none",
    appeal_result: record.appeal_result || "none",
    ...parseLocationDetail(record.location_detail),
    offstreet_zone: record.location_zone || parseLocationDetail(record.location_detail).offstreet_zone,
    building_floor: record.location_floor || parseLocationDetail(record.location_detail).building_floor,
    building_zone: record.location_zone || parseLocationDetail(record.location_detail).building_zone,
    road_segment: record.road_segment || parseLocationDetail(record.location_detail).road_segment,
    road_direction: record.road_direction || parseLocationDetail(record.location_detail).road_direction,
  };
}

function EnforcementFormFields({
  form,
  set,
  lots,
}: {
  form: Record<string, any>;
  set: (key: string, value: any) => void;
  lots: ParkingLotOption[];
}) {
  const selectedLot = lots.find((lot) => lot.id === form.lot_id);
  const lotType = selectedLot?.lot_type;

  const changeLot = (lotId: string) => {
    const lot = lots.find((item) => item.id === lotId);
    set("lot_id", lotId);
    set("violation_location", lot?.name || "");
    set("offstreet_zone", "");
    set("building_floor", "");
    set("building_zone", "");
    set("road_segment", "");
    set("road_direction", "");
  };

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label className="text-xs">주차장 *</Label>
        <Select value={form.lot_id || ""} onValueChange={changeLot}>
          <SelectTrigger><SelectValue placeholder="주차장 선택" /></SelectTrigger>
          <SelectContent>
            {lots.map((lot) => (
              <SelectItem key={lot.id} value={lot.id}>
                {lot.code} {lot.name} · {LOT_TYPE_LABELS[lot.lot_type || ""] || "형태 미지정"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label className="text-xs">차량번호 *</Label><Input value={form.vehicle_number || ""} onChange={(event) => set("vehicle_number", event.target.value.toUpperCase())} /></div>
        <div className="space-y-1.5">
          <Label className="text-xs">위반유형 *</Label>
          <Select value={form.violation_type || ""} onValueChange={(value) => set("violation_type", value)}>
            <SelectTrigger><SelectValue placeholder="위반유형 선택" /></SelectTrigger>
            <SelectContent>{Object.entries(VIOLATION_TYPE_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label className="text-xs">단속일시 *</Label><Input type="datetime-local" value={form.violation_date || ""} onChange={(event) => set("violation_date", event.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">단속 위치</Label><Input value={form.violation_location || ""} onChange={(event) => set("violation_location", event.target.value)} placeholder="도로명 또는 주차장 내 위치" /></div>
      </div>

      {lotType === "offstreet" && (
        <div className="space-y-1.5"><Label className="text-xs">노외주차장 구역 *</Label><Input value={form.offstreet_zone || ""} onChange={(event) => set("offstreet_zone", event.target.value)} placeholder="예: A구역 12번 면" /></div>
      )}
      {lotType === "multilevel" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">주차빌딩 층 *</Label><Input type="number" min="-10" max="100" value={form.building_floor || ""} onChange={(event) => set("building_floor", event.target.value)} placeholder="예: 3" /></div>
          <div className="space-y-1.5"><Label className="text-xs">주차빌딩 존 *</Label><Input value={form.building_zone || ""} onChange={(event) => set("building_zone", event.target.value)} placeholder="예: B존 24번 면" /></div>
        </div>
      )}
      {lotType === "onstreet" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs">노상 도로 구간 *</Label><Input value={form.road_segment || ""} onChange={(event) => set("road_segment", event.target.value)} placeholder="예: 중앙로 사거리~시청 입구" /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">진행 방향 *</Label>
            <Select value={form.road_direction || ""} onValueChange={(value) => set("road_direction", value)}>
              <SelectTrigger><SelectValue placeholder="방향 선택" /></SelectTrigger>
              <SelectContent><SelectItem value="상행">상행</SelectItem><SelectItem value="하행">하행</SelectItem><SelectItem value="동측">동측</SelectItem><SelectItem value="서측">서측</SelectItem><SelectItem value="양방향">양방향</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-1.5"><Label className="text-xs">상세 위치 메모</Label><Input value={form.location_note || ""} onChange={(event) => set("location_note", event.target.value)} placeholder="표지판, 면번호, 주변 시설 등" /></div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label className="text-xs">과태료(원)</Label><Input type="number" min="0" step="1000" value={form.fine_amount ?? ""} onChange={(event) => set("fine_amount", event.target.value === "" ? null : Number(event.target.value))} /></div>
        <div className="space-y-1.5"><Label className="text-xs">납부기한</Label><Input type="date" value={form.fine_due_date || ""} onChange={(event) => set("fine_due_date", event.target.value)} /></div>
      </div>

      <div className="space-y-1.5"><Label className="text-xs">공식 문서번호</Label><Input value={form.document_number || ""} onChange={(event) => set("document_number", event.target.value)} placeholder="예: 제주시청-차량관리과운영팀-2026-0803-01" /></div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">이의신청 상태</Label>
          <Select value={form.appeal_status || "none"} onValueChange={(value) => { set("appeal_status", value); if (value !== "none" && !form.appeal_date) set("appeal_date", toLocalDateInput()); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(APPEAL_STATUS_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">이의신청일</Label><Input type="date" disabled={form.appeal_status === "none"} value={form.appeal_date || ""} onChange={(event) => set("appeal_date", event.target.value)} /></div>
      </div>

      {form.appeal_status !== "none" && (
        <>
          <div className="space-y-1.5"><Label className="text-xs">이의신청 사유 *</Label><Textarea rows={2} value={form.appeal_reason || ""} onChange={(event) => set("appeal_reason", event.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">처리 결과</Label>
            <Select value={form.appeal_result || "none"} onValueChange={(value) => set("appeal_result", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(APPEAL_RESULT_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </>
      )}

      <div className="space-y-1.5"><Label className="text-xs">업무 메모</Label><Textarea rows={2} value={form.notes || ""} onChange={(event) => set("notes", event.target.value)} /></div>
      <AuthorField value={form.author_name || ""} onChange={(value) => set("author_name", value)} />
    </div>
  );
}

export default function OpsEnforcementPage() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editing, setEditing] = useState<EnforcementRecord | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({ paid_amount: "", paid_date: "", receipt_number: "", document_number: "" });
  const [saving, setSaving] = useState(false);

  const search = searchParams.get("q") ?? searchParams.get("vehicle") ?? "";
  const statusFilter = searchParams.get("status") || "all";
  const typeFilter = searchParams.get("type") || "all";
  const lotTypeFilter = searchParams.get("lotType") || "all";
  const sort = searchParams.get("sort") || "newest";

  const updateParam = (key: string, value: string, defaultValue = "all") => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    if (key === "q") next.delete("vehicle");
    setSearchParams(next, { replace: true });
  };

  const { data: records, error: recordsError } = useQuery({
    queryKey: ["enforcement-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enforcement_records")
        .select("*, parking_lots(code, name, lot_type)")
        .order("violation_date", { ascending: false });
      if (error) throw error;
      return (data || []) as EnforcementRecord[];
    },
  });

  const { data: lots, error: lotsError } = useQuery({
    queryKey: ["lots-for-ops"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("code");
      if (error) throw error;
      return (data || []) as ParkingLotOption[];
    },
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ko-KR");
    const result = (records || []).filter((record) => {
      if (statusFilter !== "all" && record.payment_status !== statusFilter) return false;
      if (typeFilter !== "all" && record.violation_type !== typeFilter) return false;
      if (lotTypeFilter !== "all" && record.parking_lots?.lot_type !== lotTypeFilter) return false;
      if (!needle) return true;
      const searchable = [
        record.enforcement_number,
        record.vehicle_number,
        record.violation_location,
        record.location_detail,
        record.parking_lots?.name,
        record.document_number,
        readNoteValue(record.notes, NOTE_LABELS.documentNumber),
      ].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
      return searchable.includes(needle);
    });

    return result.sort((a, b) => {
      if (sort === "oldest") return new Date(a.violation_date).getTime() - new Date(b.violation_date).getTime();
      if (sort === "due") return (a.fine_due_date || "9999-12-31").localeCompare(b.fine_due_date || "9999-12-31");
      if (sort === "amount") return Number(b.fine_amount || 0) - Number(a.fine_amount || 0);
      if (sort === "vehicle") return a.vehicle_number.localeCompare(b.vehicle_number, "ko-KR", { numeric: true });
      if (sort === "lot") return (a.parking_lots?.name || "").localeCompare(b.parking_lots?.name || "", "ko-KR", { numeric: true });
      return new Date(b.violation_date).getTime() - new Date(a.violation_date).getTime();
    });
  }, [lotTypeFilter, records, search, sort, statusFilter, typeFilter]);

  const unpaidCount = (records || []).filter((record) => record.payment_status === "unpaid").length;
  const overdueCount = (records || []).filter((record) => record.payment_status === "overdue" || (record.payment_status === "unpaid" && record.fine_due_date && record.fine_due_date < toLocalDateInput())).length;
  const unpaidTotal = (records || []).filter((record) => ["unpaid", "overdue"].includes(record.payment_status)).reduce((sum, record) => sum + (record.fine_amount || 0), 0);

  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));

  const generateNumber = () => {
    const date = toLocalDateInput().replace(/-/g, "");
    return `EN-${date}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`;
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      payment_status: "unpaid",
      enforcement_number: generateNumber(),
      violation_date: toLocalDateTimeInput(),
      fine_due_date: addDaysDateInput(30),
      vehicle_number: searchParams.get("vehicle") || "",
      officer_id: user?.id,
      officer_name: profile?.name,
      author_name: profile?.name,
      appeal_status: "none",
      appeal_result: "none",
    });
    setDialogOpen(true);
  };

  const openDetail = (record: EnforcementRecord) => {
    setEditing(record);
    setForm(hydrateRecord(record));
    setDetailOpen(true);
  };

  const validateForm = () => {
    if (!form.lot_id || !form.vehicle_number?.trim() || !form.violation_type || !form.violation_date) return "주차장, 차량번호, 위반유형, 단속일시는 필수입니다.";
    const selectedLot = (lots || []).find((lot) => lot.id === form.lot_id);
    if (selectedLot?.lot_type === "offstreet" && !form.offstreet_zone?.trim()) return "노외주차장 구역을 입력해 주세요.";
    if (selectedLot?.lot_type === "multilevel" && (!form.building_floor || !form.building_zone?.trim())) return "주차빌딩 층과 존을 입력해 주세요.";
    if (selectedLot?.lot_type === "onstreet" && (!form.road_segment?.trim() || !form.road_direction)) return "노상주차장 도로 구간과 진행 방향을 입력해 주세요.";
    if (form.appeal_status !== "none" && !form.appeal_reason?.trim()) return "이의신청 사유를 입력해 주세요.";
    if (Number(form.fine_amount || 0) < 0) return "과태료는 0원 이상이어야 합니다.";
    return "";
  };

  const handleSave = async () => {
    const validationMessage = validateForm();
    if (validationMessage) {
      toast({ title: "필수 입력 확인", description: validationMessage, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        lot_id: form.lot_id,
        enforcement_number: form.enforcement_number,
        vehicle_number: form.vehicle_number.trim(),
        vehicle_type: form.vehicle_type || null,
        violation_type: form.violation_type,
        violation_date: new Date(form.violation_date).toISOString(),
        violation_location: form.violation_location?.trim() || null,
        location_detail: composeLocationDetail(form),
        location_zone: form.offstreet_zone?.trim() || form.building_zone?.trim() || null,
        location_floor: form.building_floor?.trim() || null,
        road_segment: form.road_segment?.trim() || null,
        road_direction: form.road_direction?.trim() || null,
        fine_amount: form.fine_amount ?? null,
        fine_due_date: form.fine_due_date || null,
        payment_status: form.payment_status || "unpaid",
        appeal_status: form.appeal_status === "none" ? null : form.appeal_status,
        appeal_date: form.appeal_status === "none" ? null : form.appeal_date || null,
        appeal_reason: form.appeal_status === "none" ? null : form.appeal_reason?.trim() || null,
        appeal_result: form.appeal_result === "none" ? null : form.appeal_result,
        document_number: form.document_number?.trim() || null,
        officer_id: form.officer_id || user?.id || null,
        officer_name: form.officer_name || profile?.name || null,
        author_name: form.author_name || profile?.name || null,
        notes: form.notes?.trim() || null,
      };

      if (editing) {
        const { error } = await supabase.from("enforcement_records").update(payload).eq("id", editing.id);
        if (error) throw error;
        await logActivity({ module: "ops", action: "update", targetType: "enforcement", targetId: editing.id, targetName: form.enforcement_number });
      } else {
        const { error } = await supabase.from("enforcement_records").insert(payload);
        if (error) throw error;
        await logActivity({ module: "ops", action: "create", targetType: "enforcement", targetName: form.enforcement_number });
      }

      toast({ title: editing ? "단속기록을 수정했습니다." : "단속기록을 등록했습니다." });
      await queryClient.invalidateQueries({ queryKey: ["enforcement-records"] });
      setDialogOpen(false);
      setDetailOpen(false);
    } catch (error: any) {
      toast({ title: "저장 실패", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (record: EnforcementRecord) => {
    setEditing(record);
    setPaymentForm({
      paid_amount: String(record.fine_amount || ""),
      paid_date: toLocalDateInput(),
      receipt_number: record.payment_receipt_number || readNoteValue(record.notes, NOTE_LABELS.receiptNumber),
      document_number: record.payment_document_number || record.document_number || readNoteValue(record.notes, NOTE_LABELS.documentNumber),
    });
    setDetailOpen(false);
    setPaymentOpen(true);
  };

  const markPaid = async () => {
    if (!editing) return;
    if (!paymentForm.paid_amount || Number(paymentForm.paid_amount) <= 0 || !paymentForm.paid_date || !paymentForm.receipt_number.trim() || !paymentForm.document_number.trim()) {
      toast({ title: "수납 증빙 확인", description: "납부액, 수납일, 영수증번호, 공식 문서번호를 모두 입력해 주세요.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const rpcResult = await (supabase.rpc as any)("mark_enforcement_paid", {
        p_enforcement_id: editing.id,
        p_paid_amount: Number(paymentForm.paid_amount),
        p_paid_date: paymentForm.paid_date,
        p_payment_receipt_number: paymentForm.receipt_number.trim(),
        p_payment_document_number: paymentForm.document_number.trim(),
        p_idempotency_key: crypto.randomUUID(),
      });
      if (rpcResult.error) throw rpcResult.error;

      await logActivity({ module: "ops", action: "payment", targetType: "enforcement", targetId: editing.id, targetName: editing.enforcement_number, details: { paid_date: paymentForm.paid_date, receipt_number: paymentForm.receipt_number } });
      toast({ title: "납부 처리를 완료했습니다.", description: `${Number(paymentForm.paid_amount).toLocaleString()}원 · ${paymentForm.receipt_number}` });
      await queryClient.invalidateQueries({ queryKey: ["enforcement-records"] });
      setPaymentOpen(false);
    } catch (error: any) {
      toast({ title: "납부 처리 실패", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const queryError = recordsError || lotsError;
  if (queryError) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-10 text-center text-destructive">단속 기록을 불러오지 못했습니다. {queryError.message}</CardContent></Card>
      </DashboardLayout>
    );
  }

  const hasFilters = Boolean(search || statusFilter !== "all" || typeFilter !== "all" || lotTypeFilter !== "all" || sort !== "newest");

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-xl font-bold">단속 기록</h2><p className="text-sm text-muted-foreground">단속부터 이의신청, 수납 증빙까지 한 기록에서 관리합니다.</p></div>
          <Button size="sm" onClick={openNew}><Plus className="mr-1 h-4 w-4" />단속 등록</Button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card><CardContent className="pb-2 pt-3"><span className="text-xs text-muted-foreground">전체 건수</span><p className="text-xl font-bold">{records?.length || 0}</p></CardContent></Card>
          <Card><CardContent className="pb-2 pt-3"><span className="text-xs text-muted-foreground">미납</span><p className="text-xl font-bold text-amber-700">{unpaidCount}</p></CardContent></Card>
          <Card><CardContent className="pb-2 pt-3"><span className="text-xs text-muted-foreground">체납</span><p className="text-xl font-bold text-destructive">{overdueCount}</p></CardContent></Card>
          <Card><CardContent className="pb-2 pt-3"><span className="text-xs text-muted-foreground">미납 총액</span><p className="text-xl font-bold text-destructive">{unpaidTotal.toLocaleString()}원</p></CardContent></Card>
        </div>

        <Card>
          <CardContent className="space-y-3 pb-3 pt-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="단속기록 검색" placeholder="단속번호, 차량, 위치, 문서번호 검색" value={search} onChange={(event) => updateParam("q", event.target.value, "")} className="h-9 pl-9" /></div>
              <Select value={typeFilter} onValueChange={(value) => updateParam("type", value)}><SelectTrigger aria-label="위반유형 필터" className="h-9 w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 위반유형</SelectItem>{Object.entries(VIOLATION_TYPE_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent></Select>
              <Select value={statusFilter} onValueChange={(value) => updateParam("status", value)}><SelectTrigger aria-label="납부상태 필터" className="h-9 w-[125px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{Object.entries(PAYMENT_STATUS_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent></Select>
              <Select value={lotTypeFilter} onValueChange={(value) => updateParam("lotType", value)}><SelectTrigger aria-label="주차장 형태 필터" className="h-9 w-[145px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 주차장 형태</SelectItem>{Object.entries(LOT_TYPE_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent></Select>
              <Select value={sort} onValueChange={(value) => updateParam("sort", value, "newest")}><SelectTrigger aria-label="정렬 방식" className="h-9 w-[170px]"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SORT_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent></Select>
              {hasFilters && <Button variant="ghost" size="sm" onClick={() => setSearchParams({}, { replace: true })}>초기화</Button>}
            </div>
            <p className="text-xs text-muted-foreground">전체 {records?.length || 0}건 중 {filtered.length}건</p>
          </CardContent>
        </Card>

        <Card className="hidden md:block"><CardContent className="overflow-x-auto p-0">
          <Table className="min-w-[1080px]"><TableHeader><TableRow>
            <TableHead>단속번호</TableHead><TableHead>단속일시</TableHead><TableHead>주차장</TableHead><TableHead>형태</TableHead>
            <TableHead>차량번호</TableHead><TableHead>위반유형</TableHead><TableHead className="text-right">과태료</TableHead>
            <TableHead>납부기한</TableHead><TableHead>문서번호</TableHead><TableHead>상태</TableHead>
          </TableRow></TableHeader><TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">조건에 맞는 단속기록이 없습니다.</TableCell></TableRow> : filtered.map((record) => {
              const overdue = record.payment_status === "overdue" || (record.payment_status === "unpaid" && record.fine_due_date && record.fine_due_date < toLocalDateInput());
              const documentNumber = record.document_number || readNoteValue(record.notes, NOTE_LABELS.documentNumber);
              return (
                <TableRow key={record.id} role="button" tabIndex={0} aria-label={`${record.enforcement_number} ${record.vehicle_number} 상세 열기`} className={`cursor-pointer hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${overdue ? "bg-red-50 dark:bg-red-950/20" : ""}`} onClick={() => openDetail(record)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail(record); } }}>
                  <TableCell className="font-mono text-[11px]">{record.enforcement_number}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{new Date(record.violation_date).toLocaleString("ko-KR")}</TableCell>
                  <TableCell className="text-xs">{record.parking_lots?.name || "-"}</TableCell>
                  <TableCell><Badge variant="outline" className="whitespace-nowrap text-[10px]">{LOT_TYPE_LABELS[record.parking_lots?.lot_type || ""] || "미지정"}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-sm font-bold">{record.vehicle_number}</TableCell>
                  <TableCell><Badge variant="outline" className="whitespace-nowrap text-[10px]">{VIOLATION_TYPE_LABELS[record.violation_type] || record.violation_type}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs">{record.fine_amount?.toLocaleString() || "-"}원</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{record.fine_due_date || "-"}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs" title={documentNumber}>{documentNumber || "-"}</TableCell>
                  <TableCell><Badge variant="outline" className={`whitespace-nowrap text-[10px] ${PAYMENT_STATUS_COLORS[record.payment_status] || ""}`}>{PAYMENT_STATUS_LABELS[record.payment_status] || record.payment_status}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody></Table>
        </CardContent></Card>

        <div className="space-y-2 md:hidden">
          {filtered.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">조건에 맞는 단속기록이 없습니다.</CardContent></Card>}
          {filtered.map((record) => {
            const documentNumber = record.document_number || readNoteValue(record.notes, NOTE_LABELS.documentNumber);
            return (
              <button key={record.id} type="button" className="w-full rounded-md border bg-card p-4 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => openDetail(record)}>
                <div className="flex items-start justify-between gap-2"><div><p className="font-mono text-xs text-muted-foreground">{record.enforcement_number}</p><p className="mt-1 text-base font-bold">{record.vehicle_number}</p></div><Badge variant="outline" className={PAYMENT_STATUS_COLORS[record.payment_status] || ""}>{PAYMENT_STATUS_LABELS[record.payment_status] || record.payment_status}</Badge></div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs"><div><span className="text-muted-foreground">주차장</span><p>{record.parking_lots?.name || "-"}</p></div><div><span className="text-muted-foreground">형태</span><p>{LOT_TYPE_LABELS[record.parking_lots?.lot_type || ""] || "미지정"}</p></div><div><span className="text-muted-foreground">단속일시</span><p>{new Date(record.violation_date).toLocaleString("ko-KR")}</p></div><div><span className="text-muted-foreground">과태료</span><p>{record.fine_amount?.toLocaleString() || "-"}원</p></div></div>
                <p className="mt-3 text-xs text-muted-foreground">{formatLocationDetail(record) || record.violation_location || "위치 미입력"}</p>
                {documentNumber && <p className="mt-2 truncate text-xs" title={documentNumber}>문서 {documentNumber}</p>}
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>단속 등록</DialogTitle><DialogDescription>주차장 형태에 맞는 현장 위치와 공식 문서번호를 함께 기록합니다.</DialogDescription></DialogHeader>
          <EnforcementFormFields form={form} set={set} lots={lots || []} />
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button><Button onClick={handleSave} disabled={saving}>{saving ? "저장 중..." : "등록"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>단속 상세 및 수정</DialogTitle><DialogDescription>{editing?.enforcement_number} · 등록된 현장정보와 이의신청 내용을 수정할 수 있습니다.</DialogDescription></DialogHeader>
          {editing && (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <Badge variant="outline" className={PAYMENT_STATUS_COLORS[editing.payment_status] || ""}>{PAYMENT_STATUS_LABELS[editing.payment_status] || editing.payment_status}</Badge>
                <span>{editing.parking_lots?.name || "주차장 미지정"}</span>
                <span className="text-muted-foreground">{LOT_TYPE_LABELS[editing.parking_lots?.lot_type || ""] || "형태 미지정"}</span>
                {form.document_number && <span className="ml-auto max-w-full truncate text-xs" title={form.document_number}>문서 {form.document_number}</span>}
              </div>
              <EnforcementFormFields form={form} set={set} lots={lots || []} />
              <DialogFooter className="gap-2 sm:justify-between">
                <div>{["unpaid", "overdue"].includes(editing.payment_status) && <Button variant="secondary" onClick={() => openPayment(editing)}>납부 확인</Button>}</div>
                <div className="flex gap-2"><Button variant="outline" onClick={() => setDetailOpen(false)}>닫기</Button><Button onClick={handleSave} disabled={saving}>{saving ? "저장 중..." : "수정 저장"}</Button></div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>납부 확인</DialogTitle><DialogDescription>{editing?.enforcement_number}의 수납 근거를 확인한 뒤 납부 처리합니다. 처리 후에는 상태가 즉시 변경됩니다.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>납부액 *</Label><Input type="number" min="1" value={paymentForm.paid_amount} onChange={(event) => setPaymentForm((current) => ({ ...current, paid_amount: event.target.value }))} /></div><div className="space-y-1.5"><Label>수납일 *</Label><Input type="date" value={paymentForm.paid_date} onChange={(event) => setPaymentForm((current) => ({ ...current, paid_date: event.target.value }))} /></div></div>
            <div className="space-y-1.5"><Label>영수증번호 *</Label><Input value={paymentForm.receipt_number} onChange={(event) => setPaymentForm((current) => ({ ...current, receipt_number: event.target.value }))} placeholder="수납 영수증 또는 전자납부번호" /></div>
            <div className="space-y-1.5"><Label>공식 문서번호 *</Label><Input value={paymentForm.document_number} onChange={(event) => setPaymentForm((current) => ({ ...current, document_number: event.target.value }))} placeholder="수납 또는 종결 문서번호" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPaymentOpen(false)}>취소</Button><Button onClick={markPaid} disabled={saving}>{saving ? "처리 중..." : "증빙 확인 후 납부 처리"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
