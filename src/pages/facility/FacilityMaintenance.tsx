import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, List, Columns3, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, MapPin, UserRound } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { toast } from "sonner";
import { PRIORITY_LABELS, PRIORITY_COLORS, MAINT_STATUS_LABELS, MAINT_TYPE_LABELS } from "@/types/facility";
import type { MaintenanceLog, MaintenanceLogStatus } from "@/types/facility";
import { MaintenanceLogDetailSheet } from "@/components/facility/MaintenanceLogDetailSheet";
import { advanceMaintenanceWork } from "@/lib/workflow-commands";
import { OperationalListControls } from "@/components/common/OperationalListControls";
import { stableMultiSort, type NullPlacement } from "@/lib/list-sorting";
import { indexRelatedCompanyContacts, listRelatedCompanyContacts, saveRelatedCompanyContact } from "@/lib/related-company-registry";
import { saveFacilityRecordPhotosLocally } from "@/lib/facility-local-photos";
import { useAuthorization } from "@/hooks/useAuthorization";
import { FacilityLotCombobox } from "@/components/facility/FacilityLotCombobox";
import { FacilityPhotoPicker } from "@/components/facility/FacilityPhotoPicker";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";
import { OPEN_MAINTENANCE_STATUS_SET } from "@/lib/work-status";

const KANBAN_COLS: MaintenanceLogStatus[] = ["reported", "assigned", "in_progress", "pending_parts", "completed", "verified"];
const PAGE_SIZE = 50;
const MAINTENANCE_PRESETS = [
  { label: "차단기·정산기", title: "차단기·정산기 작동 오류", maintenance_type: "repair", priority: "high" },
  { label: "조명", title: "조명 점등 불량", maintenance_type: "repair", priority: "medium" },
  { label: "CCTV·통신", title: "CCTV·통신 상태 이상", maintenance_type: "repair", priority: "high" },
  { label: "파손·안전", title: "시설물 파손 및 안전 조치", maintenance_type: "repair", priority: "urgent" },
] as const;

function defaultMaintenanceDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return date.toISOString().slice(0, 10);
}

async function createEvidenceVerificationFile() {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("검증 이미지를 생성할 수 없습니다");

  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1e3a5f";
  context.fillRect(0, 0, canvas.width, 96);
  context.fillStyle = "#ffffff";
  context.font = "bold 32px sans-serif";
  context.fillText("ParkMaster field evidence verification", 36, 60);
  context.fillStyle = "#172033";
  context.font = "26px sans-serif";
  context.fillText(new Date().toISOString(), 36, 170);
  context.fillText("Binary upload / attachment / signed URL", 36, 225);
  context.strokeStyle = "#2563eb";
  context.lineWidth = 8;
  context.strokeRect(36, 275, 888, 210);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("검증 이미지를 인코딩할 수 없습니다")), "image/png");
  });
  return new File([blob], `facility-evidence-${Date.now()}.png`, { type: "image/png", lastModified: Date.now() });
}

export default function FacilityMaintenance() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const { canCreate, canEdit } = useAuthorization("FACILITY");
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "all");
  const [lotFilter, setLotFilter] = useState(() => searchParams.get("lot") || "all");
  const [lotTypeFilter, setLotTypeFilter] = useState(() => searchParams.get("lotType") || "all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState("reported_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [secondarySortKey, setSecondarySortKey] = useState("priority");
  const [nullPlacement, setNullPlacement] = useState<NullPlacement>("last");
  const [groupByLot, setGroupByLot] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showIntakeDetails, setShowIntakeDetails] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [detailOpen, setDetailOpen] = useState(() => Boolean(searchParams.get("work")));
  const [selectedLogId, setSelectedLogId] = useState<string | null>(() => searchParams.get("work"));
  const [page, setPage] = useState(1);

  const { data: lots = [] } = useQuery({
    queryKey: ["parking-lots-select", "with-type"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name, lot_type").order("name");
      return data ?? [];
    },
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["facility-maint-logs"],
    queryFn: async () => {
      const [{ data, error }, contacts] = await Promise.all([
        supabase.from("maintenance_logs").select("*, parking_lots(code, name, lot_type), equipment(name, equipment_type), assignee:profiles!maintenance_logs_assigned_to_fkey(name)").order("reported_at", { ascending: false }),
        listRelatedCompanyContacts("FACILITY_MAINTENANCE"),
      ]);
      if (error) throw error;
      const contactMap = indexRelatedCompanyContacts(contacts);
      return ((data ?? []) as unknown as MaintenanceLog[]).map((item) => {
        const contact = contactMap.get(item.id);
        return contact ? { ...item, vendor_name: contact.companyName, vendor_manager: contact.managerName, vendor_phone: contact.phone, vendor_email: contact.email } : item;
      });
    },
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["facility-maintenance-staff"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, name, team").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const selectedLog = useMemo(() => logs.find((log) => log.id === selectedLogId) ?? null, [logs, selectedLogId]);

  useEffect(() => {
    const requested = searchParams.get("work");
    if (requested && logs.some((log) => log.id === requested)) {
      setSelectedLogId(requested);
      setDetailOpen(true);
    }
  }, [logs, searchParams]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (detailOpen && selectedLogId) next.set("work", selectedLogId);
    else next.delete("work");
    if (statusFilter !== "all") next.set("status", statusFilter);
    else next.delete("status");
    if (lotTypeFilter !== "all") next.set("lotType", lotTypeFilter);
    else next.delete("lotType");
    if (lotFilter !== "all") next.set("lot", lotFilter);
    else next.delete("lot");
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [detailOpen, lotFilter, lotTypeFilter, searchParams, selectedLogId, setSearchParams, statusFilter]);

  const [selectedLot, setSelectedLot] = useState("");
  const { data: lotEquipment = [] } = useQuery({
    queryKey: ["lot-equipment", selectedLot],
    queryFn: async () => {
      if (!selectedLot) return [];
      const { data } = await supabase.from("equipment").select("id, name, equipment_type").eq("lot_id", selectedLot);
      return data ?? [];
    },
    enabled: !!selectedLot,
  });

  const [form, setForm] = useState({
    lot_id: "",
    equipment_id: "",
    maintenance_type: "repair",
    priority: "medium",
    title: "",
    symptom: "",
    assigned_to: "",
    due_date: defaultMaintenanceDueDate(),
    vendor_name: "",
    vendor_manager: "",
    vendor_phone: "",
    vendor_email: "",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const logNumber = `MR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`;
      const { data: saved, error } = await (supabase.from("maintenance_logs") as any).insert({
        log_number: logNumber,
        lot_id: form.lot_id,
        equipment_id: form.equipment_id || null,
        maintenance_type: form.maintenance_type,
        priority: form.priority,
        title: form.title,
        symptom: form.symptom || null,
        reported_by: user?.id,
        assigned_to: form.assigned_to || null,
        assigned_at: form.assigned_to ? new Date().toISOString() : null,
        due_date: form.due_date || null,
        vendor_name: form.vendor_name || null,
        vendor_contact: form.vendor_phone || null,
        status: form.assigned_to ? "assigned" : "reported",
        parts_cost: 0,
        labor_cost: 0,
        other_cost: 0,
        author_name: (form as any).author_name || null,
      }).select("id, log_number").single();
      if (error) throw error;
      await saveRelatedCompanyContact({
        module: "FACILITY_MAINTENANCE",
        recordId: saved.id,
        recordLabel: `${saved.log_number} ${form.title}`,
        recordPath: `/facility/maintenance?work=${saved.id}`,
        companyName: form.vendor_name,
        managerName: form.vendor_manager,
        phone: form.vendor_phone,
        email: form.vendor_email,
      });
      return photoFiles.length
        ? saveFacilityRecordPhotosLocally("maintenance_log", saved.id, photoFiles)
        : { savedPaths: [], saveErrors: [] };
    },
    onSuccess: (photoResult) => {
      toast.success("유지보수가 접수되었습니다");
      if (photoResult.saveErrors.length) toast.error(`접수는 완료됐지만 사진 ${photoResult.saveErrors.length}장을 PC 폴더에 저장하지 못했습니다.`, { description: photoResult.saveErrors.join("\n") });
      queryClient.invalidateQueries({ queryKey: ["facility-maint-logs"] });
      queryClient.invalidateQueries({ queryKey: ["facility-record-photos", "maintenance_log"] });
      setDialogOpen(false);
      setShowIntakeDetails(false);
      setPhotoFiles([]);
      setForm({ lot_id: "", equipment_id: "", maintenance_type: "repair", priority: "medium", title: "", symptom: "", assigned_to: "", due_date: defaultMaintenanceDueDate(), vendor_name: "", vendor_manager: "", vendor_phone: "", vendor_email: "" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ log, action, assigneeId, resolution, evidencePath }: {
      log: MaintenanceLog;
      action: "assign" | "start" | "wait_parts" | "resume" | "complete" | "verify" | "cancel";
      assigneeId?: string;
      resolution?: string;
      evidencePath?: string;
    }) => {
      await advanceMaintenanceWork(log.id, action, {
        assigneeId,
        resolution,
        evidencePath,
        expectedUpdatedAt: log.updated_at,
      });
    },
    onSuccess: () => {
      toast.success("상태가 변경되었습니다");
      queryClient.invalidateQueries({ queryKey: ["facility-maint-logs"] });
    },
  });

  const [actionDialog, setActionDialog] = useState<{ mode: "assign" | "complete"; log: MaintenanceLog } | null>(null);
  const [actionAssignee, setActionAssignee] = useState("");
  const [completionResolution, setCompletionResolution] = useState("");
  const [completionFile, setCompletionFile] = useState<File | null>(null);
  const [evidenceUploading, setEvidenceUploading] = useState(false);

  const submitActionDialog = async () => {
    if (!actionDialog) return;
    if (actionDialog.mode === "assign") {
      updateStatusMutation.mutate({ log: actionDialog.log, action: "assign", assigneeId: actionAssignee }, {
        onSuccess: () => setActionDialog(null),
      });
      return;
    }
    if (!completionFile) return;
    setEvidenceUploading(true);
    try {
      const photoResult = await saveFacilityRecordPhotosLocally("maintenance_log", actionDialog.log.id, [completionFile], "completion_photo");
      if (photoResult.saveErrors.length || !photoResult.savedPaths[0]) throw new Error(photoResult.saveErrors[0] || "완료 사진을 PC에 저장하지 못했습니다.");
      const evidencePath = `local://${photoResult.savedPaths[0]}`;
      updateStatusMutation.mutate({
        log: actionDialog.log,
        action: "complete",
        resolution: completionResolution,
        evidencePath,
      }, {
        onSuccess: () => {
          setActionDialog(null);
          setCompletionResolution("");
          setCompletionFile(null);
        },
        onSettled: () => setEvidenceUploading(false),
      });
    } catch (error) {
      setEvidenceUploading(false);
      toast.error(error instanceof Error ? error.message : "완료 사진을 PC에 저장하지 못했습니다");
    }
  };

  const nextActionLabel = (log: MaintenanceLog) => {
    if (log.status === "reported") return "담당자 배정";
    if (log.status === "assigned") return "작업 시작";
    if (log.status === "in_progress") return "완료 제출";
    if (log.status === "pending_parts") return "작업 재개";
    if (log.status === "completed" && ["admin", "manager"].includes(profile?.role || "")) return "검증 완료";
    return null;
  };

  const runNextAction = (log: MaintenanceLog) => {
    if (log.status === "reported") {
      setActionAssignee(log.assigned_to || "");
      setActionDialog({ mode: "assign", log });
    } else if (log.status === "assigned") {
      updateStatusMutation.mutate({ log, action: "start" });
    } else if (log.status === "in_progress") {
      setCompletionResolution("");
      setCompletionFile(null);
      setActionDialog({ mode: "complete", log });
    } else if (log.status === "pending_parts") {
      updateStatusMutation.mutate({ log, action: "resume" });
    } else if (log.status === "completed" && ["admin", "manager"].includes(profile?.role || "")) {
      updateStatusMutation.mutate({ log, action: "verify" });
    }
  };

  const filtered = useMemo(() => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const query = search.trim().toLowerCase();
    const valueFor = (log: MaintenanceLog, key: string): string | number | null => {
      if (key === "due_date") return log.due_date;
      if (key === "priority") return priorityOrder[log.priority];
      if (key === "total_cost") return log.total_cost || 0;
      if (key === "lot") return log.parking_lots?.name || "";
      if (key === "type") return MAINT_TYPE_LABELS[log.maintenance_type] || log.maintenance_type;
      if (key === "title") return log.title;
      return log.reported_at || log.created_at || "";
    };
    const matching = logs.filter((log) => {
      const statusMatch = statusFilter === "all"
        || (statusFilter === "active" && OPEN_MAINTENANCE_STATUS_SET.has(log.status))
        || (statusFilter === "pending" && !["completed", "verified", "cancelled"].includes(log.status))
        || (statusFilter === "done" && ["completed", "verified"].includes(log.status));
      const lotTypeMatch = lotTypeFilter === "all"
        || (lotTypeFilter === "other" && !["offstreet", "multilevel", "onstreet"].includes(log.parking_lots?.lot_type || ""))
        || log.parking_lots?.lot_type === lotTypeFilter;
      if (!statusMatch || (lotFilter !== "all" && log.lot_id !== lotFilter) || !lotTypeMatch || (typeFilter !== "all" && log.maintenance_type !== typeFilter)) return false;
      return !query || [log.title, log.log_number, log.parking_lots?.name, log.equipment?.name, log.assignee?.name, log.vendor_name, log.vendor_manager, log.vendor_phone, log.vendor_email].some((value) => String(value || "").toLowerCase().includes(query));
    });
    return stableMultiSort(matching, [
      ...(groupByLot ? [{ value: (log: MaintenanceLog) => log.parking_lots?.name, direction: "asc" as const }] : []),
      { value: (log) => valueFor(log, sortKey), direction: sortDirection },
      ...(secondarySortKey !== "none" && secondarySortKey !== sortKey ? [{ value: (log: MaintenanceLog) => valueFor(log, secondarySortKey), direction: "asc" as const }] : []),
    ], nullPlacement);
  }, [groupByLot, logs, lotFilter, lotTypeFilter, nullPlacement, search, secondarySortKey, sortDirection, sortKey, statusFilter, typeFilter]);

  useEffect(() => {
    setPage(1);
  }, [groupByLot, lotFilter, lotTypeFilter, nullPlacement, search, secondarySortKey, sortDirection, sortKey, statusFilter, typeFilter, viewMode]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedFiltered = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, filtered],
  );

  const groupedLogs = useMemo(() => {
    if (!groupByLot) return [{ key: "all", label: "", items: pagedFiltered }];
    return Array.from(pagedFiltered.reduce((groups, log) => {
      const key = log.lot_id || "unassigned";
      const current = groups.get(key) || { key, label: log.parking_lots?.name || "주차장 미지정", items: [] as MaintenanceLog[] };
      current.items.push(log);
      groups.set(key, current);
      return groups;
    }, new Map<string, { key: string; label: string; items: MaintenanceLog[] }>()).values());
  }, [groupByLot, pagedFiltered]);

  const formatCost = (value: number) => (value > 0 ? `${value.toLocaleString()}원` : "-");

  const openLogDetail = (log: MaintenanceLog) => {
    setSelectedLogId(log.id);
    setDetailOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">유지보수 관리</h1>
          <div className="flex items-center gap-2">
            <Button variant={viewMode === "table" ? "default" : "outline"} size="icon" aria-label="표 보기" title="표 보기" onClick={() => setViewMode("table")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "kanban" ? "default" : "outline"} size="icon" aria-label="칸반 보기" title="칸반 보기" onClick={() => setViewMode("kanban")}>
              <Columns3 className="h-4 w-4" />
            </Button>
            {canCreate && <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setShowIntakeDetails(false); setPhotoFiles([]); } }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1 h-4 w-4" />유지보수 접수
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
                <DialogHeader><DialogTitle>유지보수 접수</DialogTitle><DialogDescription>주차장과 장비, 담당자, 처리기한 및 관련 업체 정보를 등록합니다.</DialogDescription></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>주차장 *</Label>
                    <FacilityLotCombobox
                      lots={lots}
                      value={form.lot_id}
                      onValueChange={(value) => {
                        setForm((prev) => ({ ...prev, lot_id: value, equipment_id: "" }));
                        setSelectedLot(value);
                      }}
                    />
                  </div>
                  {form.lot_id && (
                    <div>
                      <Label>장비 (선택사항)</Label>
                      <Select value={form.equipment_id} onValueChange={(value) => setForm((prev) => ({ ...prev, equipment_id: value }))}>
                        <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>{lotEquipment.map((item: { id: string; name: string }) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>빠른 고장 유형</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {MAINTENANCE_PRESETS.map((preset) => <Button key={preset.label} type="button" variant="outline" size="sm" className="justify-start" onClick={() => setForm((prev) => ({ ...prev, title: preset.title, maintenance_type: preset.maintenance_type, priority: preset.priority }))}>{preset.label}</Button>)}
                    </div>
                  </div>
                  <div><Label>제목 *</Label><Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} /></div>
                  <div><Label>증상/설명</Label><Textarea value={form.symptom} onChange={(event) => setForm((prev) => ({ ...prev, symptom: event.target.value }))} rows={3} /></div>
                  <FacilityPhotoPicker files={photoFiles} onFilesChange={setPhotoFiles} label="고장 현장 사진 (선택)" description="전체 위치와 고장 부위를 함께 촬영하면 담당자가 현장을 다시 확인하는 시간을 줄일 수 있습니다." />
                  <Button type="button" variant="outline" className="w-full justify-between" onClick={() => setShowIntakeDetails((value) => !value)} aria-expanded={showIntakeDetails}>
                    담당자·기한·업체 추가
                    {showIntakeDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  {showIntakeDetails && <div className="space-y-3 rounded-md border p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label>유형</Label>
                        <Select value={form.maintenance_type} onValueChange={(value) => setForm((prev) => ({ ...prev, maintenance_type: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(MAINT_TYPE_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>우선순위</Label>
                        <Select value={form.priority} onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(PRIORITY_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>담당자</Label>
                        <Select value={form.assigned_to} onValueChange={(value) => setForm((prev) => ({ ...prev, assigned_to: value }))}>
                          <SelectTrigger><SelectValue placeholder="접수 후 배정" /></SelectTrigger>
                          <SelectContent>{staffList.map((staff) => <SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label>처리 기한</Label><Input type="date" value={form.due_date} onChange={(event) => setForm((prev) => ({ ...prev, due_date: event.target.value }))} /></div>
                    </div>
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-sm font-medium">관련 업체 연락망</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div><Label>업체명</Label><Input value={form.vendor_name} onChange={(event) => setForm((prev) => ({ ...prev, vendor_name: event.target.value }))} /></div>
                        <div><Label>업체 담당자</Label><Input value={form.vendor_manager} onChange={(event) => setForm((prev) => ({ ...prev, vendor_manager: event.target.value }))} /></div>
                        <div><Label>담당자 연락처</Label><Input type="tel" value={form.vendor_phone} onChange={(event) => setForm((prev) => ({ ...prev, vendor_phone: event.target.value }))} /></div>
                        <div><Label>담당자 이메일</Label><Input type="email" value={form.vendor_email} onChange={(event) => setForm((prev) => ({ ...prev, vendor_email: event.target.value }))} /></div>
                      </div>
                    </div>
                    <AuthorField value={(form as any).author_name || ""} onChange={v => setForm(prev => ({ ...prev, author_name: v } as any))} />
                  </div>}
                  {(!form.lot_id || !form.title) && <p role="status" className="text-xs text-amber-700">접수하려면 주차장과 제목을 입력해 주세요.</p>}
                  <Button className="w-full" disabled={!form.lot_id || !form.title || createMutation.isPending} onClick={() => createMutation.mutate()}>
                    {createMutation.isPending ? "접수 중..." : "접수"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>}
          </div>
        </div>

        <div className="flex justify-end"><Select value={lotTypeFilter} onValueChange={setLotTypeFilter}><SelectTrigger aria-label="주차장 형태 필터" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 주차장 형태</SelectItem>{Object.entries(LOT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}<SelectItem value="other">기타·미지정</SelectItem></SelectContent></Select></div>

        <OperationalListControls
          search={search} onSearchChange={setSearch} searchPlaceholder="제목, 접수번호, 장비, 담당자, 업체 검색"
          lots={lots.map((lot: { id: string; name: string; code: string }) => ({ value: lot.id, label: `${lot.name} (${lot.code})` }))} lotId={lotFilter} onLotChange={setLotFilter}
          categoryLabel="전체 유형" categories={Object.entries(MAINT_TYPE_LABELS).map(([value, label]) => ({ value, label }))} category={typeFilter} onCategoryChange={setTypeFilter}
          statuses={[{ value: "active", label: "진행·검증대기" }, { value: "pending", label: "미완료" }, { value: "done", label: "완료" }]} status={statusFilter} onStatusChange={setStatusFilter}
          sortOptions={[{ value: "reported_at", label: "접수일순" }, { value: "due_date", label: "처리기한순" }, { value: "priority", label: "우선순위순" }, { value: "total_cost", label: "비용순" }, { value: "lot", label: "주차장순" }, { value: "type", label: "유형순" }, { value: "title", label: "제목순" }]}
          sortKey={sortKey} onSortKeyChange={setSortKey} sortDirection={sortDirection} onSortDirectionChange={setSortDirection}
          secondarySortKey={secondarySortKey} onSecondarySortKeyChange={setSecondarySortKey} nullPlacement={nullPlacement} onNullPlacementChange={setNullPlacement}
          groupByLot={groupByLot} onGroupByLotChange={setGroupByLot} resultCount={filtered.length} totalCount={logs.length}
          onReset={() => { setSearch(""); setLotFilter("all"); setLotTypeFilter("all"); setTypeFilter("all"); setStatusFilter("all"); setSortKey("reported_at"); setSortDirection("desc"); setSecondarySortKey("priority"); setNullPlacement("last"); setGroupByLot(false); }}
        />

        {viewMode === "table" ? (
          <>
          <div className="space-y-2 md:hidden">
            {pagedFiltered.map((log) => {
              const actionLabel = canEdit ? nextActionLabel(log) : null;
              return (
                <Card key={log.id} className="cursor-pointer" onClick={() => openLogDetail(log)}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-muted-foreground">{log.log_number}</p>
                        <p className="mt-1 line-clamp-2 text-sm font-semibold">{log.title}</p>
                      </div>
                      <Badge className={PRIORITY_COLORS[log.priority]}>{PRIORITY_LABELS[log.priority]}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{log.parking_lots?.name || "주차장 미지정"}{log.parking_lots?.lot_type && <Badge variant="secondary" className="text-[9px]">{LOT_TYPE_LABELS[log.parking_lots.lot_type as LotType]}</Badge>}</span>
                      <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{log.assignee?.name || "미배정"}</span>
                      <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{log.due_date || "기한 미지정"}</span>
                      <span><Badge variant="outline">{MAINT_STATUS_LABELS[log.status]}</Badge></span>
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t pt-3">
                      {actionLabel && <Button size="sm" onClick={(event) => { event.stopPropagation(); runNextAction(log); }}>{actionLabel}</Button>}
                      <Button size="icon" variant="ghost" title="상세 보기"><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">{isLoading ? "로딩 중..." : "유지보수 기록이 없습니다"}</div>}
          </div>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>번호</TableHead><TableHead>우선순위</TableHead><TableHead>제목</TableHead>
                    <TableHead>주차장</TableHead><TableHead>장비</TableHead><TableHead>유형</TableHead>
                    <TableHead>담당자</TableHead><TableHead>기한</TableHead><TableHead>상태</TableHead><TableHead className="text-right">비용</TableHead><TableHead className="text-right">다음 작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedLogs.map((group) => <Fragment key={group.key}>
                    {groupByLot && <TableRow className="bg-muted/60 hover:bg-muted/60"><TableCell colSpan={11} className="py-2 font-semibold">{group.label}<Badge variant="secondary" className="ml-2">{group.items.length}건</Badge></TableCell></TableRow>}
                    {group.items.map((log) => (
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openLogDetail(log)}>
                      <TableCell className="font-mono text-xs">{log.log_number}</TableCell>
                      <TableCell><Badge className={PRIORITY_COLORS[log.priority]}>{PRIORITY_LABELS[log.priority]}</Badge></TableCell>
                      <TableCell className="font-medium">{log.title}</TableCell>
                      <TableCell><div>{log.parking_lots?.name || "-"}</div>{log.parking_lots?.lot_type && <Badge variant="secondary" className="mt-1 text-[9px]">{LOT_TYPE_LABELS[log.parking_lots.lot_type as LotType]}</Badge>}</TableCell>
                      <TableCell>{log.equipment?.name || "-"}</TableCell>
                      <TableCell>{MAINT_TYPE_LABELS[log.maintenance_type] || log.maintenance_type}</TableCell>
                      <TableCell className="text-sm">{log.assignee?.name || "미배정"}</TableCell>
                      <TableCell className={`text-sm ${log.due_date && log.due_date < new Date().toISOString().slice(0, 10) ? "font-semibold text-destructive" : ""}`}>{log.due_date || "-"}</TableCell>
                      <TableCell><Badge variant="outline">{MAINT_STATUS_LABELS[log.status]}</Badge></TableCell>
                      <TableCell className="text-right text-sm">{formatCost(log.total_cost)}</TableCell>
                      <TableCell className="text-right">
                        {canEdit && nextActionLabel(log) ? (
                          <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); runNextAction(log); }}>
                            {nextActionLabel(log)}
                          </Button>
                        ) : <span className="text-xs text-muted-foreground">-</span>}
                      </TableCell>
                    </TableRow>
                    ))}
                  </Fragment>)}
                  {filtered.length === 0 && <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">{isLoading ? "로딩 중..." : "유지보수 기록이 없습니다"}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </>
        ) : (
          <div className="grid grid-cols-6 gap-3 overflow-x-auto">
            {KANBAN_COLS.map((column) => (
              <div key={column} className="min-w-[180px]">
                <div className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                  {MAINT_STATUS_LABELS[column]}
                  <Badge variant="secondary" className="ml-auto text-xs">{filtered.filter((log) => log.status === column).length}</Badge>
                </div>
                <div className="space-y-2">
                  {pagedFiltered.filter((log) => log.status === column).map((log) => (
                    <Card key={log.id} className="cursor-pointer" onClick={() => openLogDetail(log)}>
                      <CardContent className="p-3">
                        <p className="mb-1 line-clamp-2 text-sm font-medium">{log.title}</p>
                        <p className="text-xs text-muted-foreground">{log.parking_lots?.name}</p>
                        {log.equipment?.name && <p className="text-xs text-muted-foreground">{log.equipment.name}</p>}
                        {canEdit && nextActionLabel(log) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 w-full text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              runNextAction(log);
                            }}
                          >
                            {nextActionLabel(log)}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {filtered.length > PAGE_SIZE && (
          <div className="flex flex-col items-center justify-between gap-2 border-t pt-3 pr-16 text-xs text-muted-foreground sm:flex-row">
            <span>페이지당 {PAGE_SIZE}건 · {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} / {filtered.length}건</span>
            <div className="flex items-center gap-2">
              <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="이전 페이지" title="이전 페이지" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-16 text-center font-medium text-foreground">{currentPage} / {pageCount}</span>
              <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="다음 페이지" title="다음 페이지" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={Boolean(actionDialog)} onOpenChange={(open) => { if (!open) setActionDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{actionDialog?.mode === "assign" ? "작업 담당자 배정" : "작업 완료 증빙"}</DialogTitle><DialogDescription>{actionDialog?.mode === "assign" ? "유지보수 작업을 처리할 담당자를 지정합니다." : "조치 내용과 현장 사진을 등록해 작업 완료를 제출합니다."}</DialogDescription></DialogHeader>
          {actionDialog?.mode === "assign" ? (
            <div className="space-y-3">
              <Label>담당자 *</Label>
              <Select value={actionAssignee} onValueChange={setActionAssignee}>
                <SelectTrigger><SelectValue placeholder="담당자 선택" /></SelectTrigger>
                <SelectContent>{staffList.map((staff) => <SelectItem key={staff.id} value={staff.id}>{staff.name} · {staff.team}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <div><Label>조치 내용 *</Label><Textarea value={completionResolution} onChange={(event) => setCompletionResolution(event.target.value)} rows={4} /></div>
              <div className="space-y-2">
                <FacilityPhotoPicker
                  files={completionFile ? [completionFile] : []}
                  onFilesChange={(files) => setCompletionFile(files[0] || null)}
                  label="완료 사진 *"
                  description="완료 상태가 보이는 사진 1장을 지정한 PC 폴더에 저장합니다."
                />
                {import.meta.env.DEV && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => setCompletionFile(await createEvidenceVerificationFile())}
                  >
                    업로드 검증용 PNG 생성
                  </Button>
                )}
              </div>
            </div>
          )}
          {actionDialog?.mode === "assign" && !actionAssignee && <p role="status" className="text-xs text-amber-700">배정할 담당자를 선택해 주세요.</p>}
          {actionDialog?.mode === "complete" && (!completionResolution.trim() || !completionFile) && <p role="status" className="text-xs text-amber-700">완료 제출에는 조치 내용과 완료 사진 1장이 필요합니다.</p>}
          <Button
            onClick={submitActionDialog}
            disabled={updateStatusMutation.isPending || evidenceUploading || (actionDialog?.mode === "assign" ? !actionAssignee : !completionResolution.trim() || !completionFile)}
          >
            {evidenceUploading ? "사진 PC 저장 중..." : updateStatusMutation.isPending ? "처리 중..." : actionDialog?.mode === "assign" ? "배정" : "완료 제출"}
          </Button>
        </DialogContent>
      </Dialog>

      <MaintenanceLogDetailSheet log={selectedLog} open={detailOpen} onOpenChange={setDetailOpen} />
    </DashboardLayout>
  );
}
