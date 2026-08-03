import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { linkOfficialDocument, DOCUMENT_RELATION_LABELS } from "@/lib/official-document-registry";
import type { DocumentRelationType, OfficialDocument } from "@/types/official-document";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BUDGET_STATUS_LABELS, PLAN_TYPE_LABELS, TRANSFER_TYPE_LABELS } from "@/types/budget";

type LinkableModule = "LOT" | "COMPLAINT" | "FACILITY_EQUIPMENT" | "FACILITY_MAINTENANCE" | "FACILITY_SCHEDULE" | "FACILITY_SAFETY" | "FACILITY_MARKING" | "REVENUE_DAILY" | "REVENUE_CLOSE" | "REVENUE_RECONCILIATION" | "BUDGET_PLAN" | "BUDGET_EXECUTION" | "BUDGET_TRANSFER";

type LinkableRecord = {
  id: string;
  label: string;
  description: string;
  path: string;
  lotType?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: OfficialDocument;
  onLinked: () => Promise<void> | void;
}

const MODULE_LABELS: Record<LinkableModule, string> = {
  LOT: "주차장",
  COMPLAINT: "민원",
  FACILITY_EQUIPMENT: "시설 장비",
  FACILITY_MAINTENANCE: "시설 유지보수",
  FACILITY_SCHEDULE: "점검 일정",
  FACILITY_SAFETY: "안전점검",
  FACILITY_MARKING: "노면표시",
  REVENUE_DAILY: "일별 수입원장",
  REVENUE_CLOSE: "월 마감",
  REVENUE_RECONCILIATION: "위탁수입 대사",
  BUDGET_PLAN: "예산안",
  BUDGET_EXECUTION: "예산 집행",
  BUDGET_TRANSFER: "예산 전용·이체",
};

async function listLinkableRecords(module: LinkableModule): Promise<LinkableRecord[]> {
  if (module === "LOT") {
    const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").order("name").limit(200);
    if (error) throw error;
    return (data || []).map((item) => ({ id: item.id, label: `${item.code} ${item.name}`, description: "주차장 기본대장", path: `/lots/${item.id}`, lotType: item.lot_type }));
  }
  if (module === "COMPLAINT") {
    const { data, error } = await supabase.from("complaints").select("id, complaint_number, title, parking_lots(name, lot_type)").order("received_at", { ascending: false }).limit(200);
    if (error) throw error;
    return (data || []).map((item: any) => ({ id: item.id, label: `${item.complaint_number} ${item.title}`, description: item.parking_lots?.name || "주차장 미지정", path: `/complaints/${item.id}`, lotType: item.parking_lots?.lot_type }));
  }
  if (module === "FACILITY_EQUIPMENT") {
    const { data, error } = await supabase.from("equipment").select("id, equipment_code, name, parking_lots(name, lot_type)").order("equipment_code").limit(200);
    if (error) throw error;
    return (data || []).map((item: any) => ({ id: item.id, label: `${item.equipment_code} ${item.name}`, description: item.parking_lots?.name || "주차장 미지정", path: `/facility/equipment?equipment=${item.id}`, lotType: item.parking_lots?.lot_type }));
  }
  if (module === "FACILITY_MAINTENANCE") {
    const { data, error } = await supabase.from("maintenance_logs").select("id, log_number, title, parking_lots(name, lot_type)").order("reported_at", { ascending: false }).limit(200);
    if (error) throw error;
    return (data || []).map((item: any) => ({ id: item.id, label: `${item.log_number} ${item.title}`, description: item.parking_lots?.name || "주차장 미지정", path: `/facility/maintenance?work=${item.id}`, lotType: item.parking_lots?.lot_type }));
  }
  if (module === "FACILITY_SCHEDULE") {
    const { data, error } = await supabase.from("maintenance_schedules").select("id, schedule_name, next_due_date, parking_lots(name, lot_type)").order("next_due_date").limit(200);
    if (error) throw error;
    return (data || []).map((item: any) => ({ id: item.id, label: item.schedule_name, description: `${item.parking_lots?.name || "주차장 미지정"} · ${item.next_due_date || "일정 미정"}`, path: `/facility/schedule?schedule=${item.id}`, lotType: item.parking_lots?.lot_type }));
  }
  if (module === "FACILITY_SAFETY") {
    const { data, error } = await supabase.from("safety_inspections").select("id, inspection_number, inspection_date, parking_lots(name, lot_type)").order("inspection_date", { ascending: false }).limit(200);
    if (error) throw error;
    return (data || []).map((item: any) => ({ id: item.id, label: item.inspection_number, description: `${item.parking_lots?.name || "주차장 미지정"} · ${item.inspection_date}`, path: `/facility/safety?inspection=${item.id}`, lotType: item.parking_lots?.lot_type }));
  }
  if (module === "REVENUE_DAILY") {
    const { data, error } = await supabase.from("revenue_daily").select("id, revenue_date, total_amount, verified, parking_lots(code, name, lot_type)").order("revenue_date", { ascending: false }).limit(200);
    if (error) throw error;
    return (data || []).map((item: any) => ({ id: item.id, label: `${item.revenue_date} ${item.parking_lots?.code || ""}`, description: `${item.parking_lots?.name || "주차장 미지정"} · ${(item.total_amount || 0).toLocaleString()}원 · ${item.verified ? "검증완료" : "미검증"}`, path: `/revenue/daily?record=${item.id}`, lotType: item.parking_lots?.lot_type }));
  }
  if (module === "REVENUE_CLOSE") {
    const { data, error } = await supabase.from("revenue_period_closes").select("id, period_month, total_amount, is_closed, parking_lots(code, name, lot_type)").order("period_month", { ascending: false }).limit(200);
    if (error) throw error;
    return (data || []).map((item: any) => ({ id: item.id, label: `${String(item.period_month).slice(0, 7)} ${item.parking_lots?.code || ""}`, description: `${item.parking_lots?.name || "주차장 미지정"} · ${(item.total_amount || 0).toLocaleString()}원 · ${item.is_closed ? "마감" : "미마감"}`, path: `/revenue/daily?close=${item.id}`, lotType: item.parking_lots?.lot_type }));
  }
  if (module === "REVENUE_RECONCILIATION") {
    const { data, error } = await supabase.from("revenue_reconciliation").select("id, recon_number, period_start, status, parking_lots(name, lot_type)").order("period_start", { ascending: false }).limit(200);
    if (error) throw error;
    return (data || []).map((item: any) => ({ id: item.id, label: item.recon_number, description: `${item.parking_lots?.name || "주차장 미지정"} · ${item.period_start} · ${item.status}`, path: `/revenue/reconcile?record=${item.id}`, lotType: item.parking_lots?.lot_type }));
  }
  if (module === "BUDGET_PLAN") {
    const { data, error } = await supabase.from("budget_plans").select("id, fiscal_year, plan_type, plan_number, title, status").order("fiscal_year", { ascending: false }).order("plan_number", { ascending: false }).limit(200);
    if (error) throw error;
    return (data || []).map((item: any) => ({
      id: item.id,
      label: `${item.fiscal_year} ${item.title}`,
      description: `${PLAN_TYPE_LABELS[item.plan_type] || item.plan_type} 제${item.plan_number}차 · ${BUDGET_STATUS_LABELS[item.status] || item.status}`,
      path: `/budget/plans/${item.id}`,
    }));
  }
  if (module === "BUDGET_EXECUTION") {
    const { data, error } = await supabase.from("budget_executions").select("id, execution_number, execution_date, amount, description, status, parking_lots(name, lot_type)").order("execution_date", { ascending: false }).limit(200);
    if (error) throw error;
    return (data || []).map((item: any) => ({
      id: item.id,
      label: `${item.execution_number} ${item.description}`,
      description: `${item.execution_date} · ${(item.amount || 0).toLocaleString()}원 · ${BUDGET_STATUS_LABELS[item.status] || item.status}`,
      path: `/budget/executions?record=${item.id}`,
      lotType: item.parking_lots?.lot_type,
    }));
  }
  if (module === "BUDGET_TRANSFER") {
    const { data, error } = await supabase.from("budget_transfers").select("id, transfer_number, fiscal_year, transfer_type, amount, reason, status").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return (data || []).map((item: any) => ({
      id: item.id,
      label: `${item.transfer_number} ${item.reason}`,
      description: `${item.fiscal_year}년 · ${TRANSFER_TYPE_LABELS[item.transfer_type] || item.transfer_type} · ${(item.amount || 0).toLocaleString()}원 · ${BUDGET_STATUS_LABELS[item.status] || item.status}`,
      path: `/budget/transfers?record=${item.id}`,
    }));
  }
  const { data, error } = await supabase.from("surface_markings").select("id, marking_name, marking_type, parking_lots(name, lot_type)").order("marking_name").limit(200);
  if (error) throw error;
  return (data || []).map((item: any) => ({ id: item.id, label: item.marking_name, description: `${item.parking_lots?.name || "주차장 미지정"} · ${item.marking_type}`, path: `/facility/markings?marking=${item.id}`, lotType: item.parking_lots?.lot_type }));
}

export function LinkBusinessRecordDialog({ open, onOpenChange, document, onLinked }: Props) {
  const [module, setModule] = useState<LinkableModule>("LOT");
  const [relationType, setRelationType] = useState<DocumentRelationType>("reference");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ["official-document-linkable-records", module], queryFn: () => listLinkableRecords(module), enabled: open });
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ko");
    return term ? data.filter((item) => `${item.label} ${item.description}`.toLocaleLowerCase("ko").includes(term)) : data;
  }, [data, search]);
  const selected = data.find((item) => item.id === selectedId);

  const changeModule = (value: string) => {
    setModule(value as LinkableModule);
    setSelectedId("");
    setSearch("");
  };

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await linkOfficialDocument({ document, module, recordId: selected.id, relationType, recordPath: selected.path, recordLabel: selected.label });
      await onLinked();
      toast.success("문서와 업무자료를 연결했습니다.", { description: selected.label });
      onOpenChange(false);
      setSelectedId("");
    } catch (error: any) {
      toast.error("업무자료 연결에 실패했습니다.", { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>업무자료 연결 추가</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>업무 구분</Label><Select value={module} onValueChange={changeModule}><SelectTrigger aria-label="연결 업무 구분"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(MODULE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>문서 관계</Label><Select value={relationType} onValueChange={(value) => setRelationType(value as DocumentRelationType)}><SelectTrigger aria-label="문서 관계"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DOCUMENT_RELATION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`${MODULE_LABELS[module]} 번호 또는 명칭 검색`} /></div>
          <div className="max-h-80 overflow-y-auto rounded-md border">
            {isLoading ? <p className="p-8 text-center text-sm text-muted-foreground">불러오는 중...</p> : rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p> : rows.map((item) => (
              <button key={item.id} type="button" className={cn("flex w-full items-center gap-3 border-b p-3 text-left last:border-b-0", selectedId === item.id ? "bg-accent" : "hover:bg-muted/50")} onClick={() => setSelectedId(item.id)}>
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.label}</span><span className="block truncate text-xs text-muted-foreground">{item.description}</span></span>
                {item.lotType && <Badge variant="secondary" className="shrink-0 text-[10px]">{LOT_TYPE_LABELS[item.lotType as LotType] || item.lotType}</Badge>}
                <Check className={cn("h-4 w-4 shrink-0 text-primary", selectedId === item.id ? "opacity-100" : "opacity-0")} />
              </button>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button onClick={submit} disabled={!selected || saving}>{saving ? "연결 중..." : "선택 업무 연결"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
