import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, CircleDollarSign, Plus, LayoutGrid, List } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { toast } from "sonner";
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_COLORS } from "@/types/facility";
import type { Equipment, EquipmentStatus } from "@/types/facility";
import { EquipmentDetailSheet } from "@/components/facility/EquipmentDetailSheet";
import { OperationalListControls } from "@/components/common/OperationalListControls";
import { stableMultiSort, type NullPlacement } from "@/lib/list-sorting";
import { indexRelatedCompanyContacts, listRelatedCompanyContacts, saveRelatedCompanyContact } from "@/lib/related-company-registry";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useIsMobile } from "@/hooks/use-mobile";
import { FacilityLotCombobox } from "@/components/facility/FacilityLotCombobox";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";
import { getMissingRequiredEquipment, getParkingLotWorkProfile } from "@/lib/parking-lot-work-profile";
import { FacilityPhotoPicker } from "@/components/facility/FacilityPhotoPicker";
import { saveFacilityRecordPhotosLocally } from "@/lib/facility-local-photos";
import { FacilityReportShortcut } from "@/components/facility/FacilityReportShortcut";

type EquipmentSortKey = "equipment_code" | "name" | "lot" | "type" | "status" | "install_date" | "warranty_end" | "next_maintenance_date" | "maintenance_cost" | "updated_at";

const STATUS_ORDER: Record<EquipmentStatus, number> = { broken: 0, warning: 1, maintenance: 2, normal: 3, decommissioned: 4 };
const PAGE_SIZE = 50;

export default function FacilityEquipment() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { canCreate, canEdit } = useAuthorization("FACILITY");
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [filterLot, setFilterLot] = useState(() => searchParams.get("lot") || "all");
  const [filterLotType, setFilterLotType] = useState(() => searchParams.get("lotType") || "all");
  const [filterType, setFilterType] = useState(() => searchParams.get("type") || "all");
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get("status") || "all");
  const [sortKey, setSortKey] = useState<EquipmentSortKey>(() => (searchParams.get("sort") as EquipmentSortKey) || "equipment_code");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(() => searchParams.get("dir") === "desc" ? "desc" : "asc");
  const [secondarySortKey, setSecondarySortKey] = useState<EquipmentSortKey | "none">("name");
  const [nullPlacement, setNullPlacement] = useState<NullPlacement>("last");
  const [groupByLot, setGroupByLot] = useState(() => searchParams.get("group") === "lot");
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const filtersInitialized = useRef(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(() => Boolean(searchParams.get("equipment")));
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(() => searchParams.get("equipment"));
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  useEffect(() => {
    if (isMobile) setViewMode("card");
  }, [isMobile]);

  const { data: lots = [] } = useQuery({
    queryKey: ["parking-lots-select", "with-type"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name, lot_type").order("name");
      return data ?? [];
    },
  });

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ["facility-equipment"],
    queryFn: async () => {
      const [{ data, error }, contacts] = await Promise.all([
        supabase.from("equipment").select("*, parking_lots(code, name, lot_type)").order("equipment_code"),
        listRelatedCompanyContacts("FACILITY_EQUIPMENT"),
      ]);
      if (error) throw error;
      const contactMap = indexRelatedCompanyContacts(contacts);
      return ((data ?? []) as unknown as Equipment[]).map((item) => {
        const contact = contactMap.get(item.id);
        return contact ? { ...item, vendor_name: contact.companyName, vendor_manager: contact.managerName, vendor_phone: contact.phone, vendor_email: contact.email } : item;
      });
    },
  });

  const selectedEquipment = useMemo(
    () => equipment.find((item) => item.id === selectedEquipmentId) ?? null,
    [equipment, selectedEquipmentId],
  );
  useEffect(() => {
    const requestedEquipment = searchParams.get("equipment");
    if (requestedEquipment && equipment.some((item) => item.id === requestedEquipment)) {
      setSelectedEquipmentId(requestedEquipment);
      setDetailOpen(true);
    }
  }, [equipment, searchParams]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (filterLot !== "all") next.set("lot", filterLot);
    if (filterLotType !== "all") next.set("lotType", filterLotType);
    if (filterType !== "all") next.set("type", filterType);
    if (filterStatus !== "all") next.set("status", filterStatus);
    if (sortKey !== "equipment_code") next.set("sort", sortKey);
    if (sortDirection !== "asc") next.set("dir", sortDirection);
    if (groupByLot) next.set("group", "lot");
    if (page > 1) next.set("page", String(page));
    if (selectedEquipmentId && detailOpen) next.set("equipment", selectedEquipmentId);
    setSearchParams(next, { replace: true });
  }, [detailOpen, filterLot, filterLotType, filterStatus, filterType, groupByLot, page, search, selectedEquipmentId, setSearchParams, sortDirection, sortKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const valueFor = (item: Equipment, key: EquipmentSortKey): string | number | null => {
      switch (key) {
        case "name": return item.name;
        case "lot": return item.parking_lots?.name || "";
        case "type": return EQUIPMENT_TYPE_LABELS[item.equipment_type] || item.equipment_type;
        case "status": return STATUS_ORDER[item.status] ?? 9;
        case "install_date": return item.install_date;
        case "warranty_end": return item.warranty_end;
        case "next_maintenance_date": return item.next_maintenance_date;
        case "maintenance_cost": return item.total_maintenance_cost || 0;
        case "updated_at": return item.updated_at || "";
        default: return item.equipment_code;
      }
    };
    const matching = equipment.filter((item) => {
        if (filterLot !== "all" && item.lot_id !== filterLot) return false;
        if (filterLotType === "other" && ["offstreet", "multilevel", "onstreet"].includes(item.parking_lots?.lot_type || "")) return false;
        if (filterLotType !== "all" && filterLotType !== "other" && item.parking_lots?.lot_type !== filterLotType) return false;
        if (filterType !== "all" && item.equipment_type !== filterType) return false;
        if (filterStatus === "attention" && !["warning", "broken", "maintenance"].includes(item.status)) return false;
        if (filterStatus !== "all" && filterStatus !== "attention" && item.status !== filterStatus) return false;
        if (!query) return true;
        return [item.name, item.equipment_code, item.serial_number, item.manufacturer, item.model, item.parking_lots?.name, item.vendor_name, item.vendor_manager, item.vendor_phone, item.vendor_email]
          .some((value) => String(value || "").toLowerCase().includes(query));
      });
    return stableMultiSort(matching, [
      ...(groupByLot ? [{ value: (item: Equipment) => item.parking_lots?.name, direction: "asc" as const }] : []),
      { value: (item) => valueFor(item, sortKey), direction: sortDirection },
      ...(secondarySortKey !== "none" && secondarySortKey !== sortKey ? [{ value: (item: Equipment) => valueFor(item, secondarySortKey), direction: "asc" as const }] : []),
    ], nullPlacement);
  }, [equipment, filterLot, filterLotType, filterStatus, filterType, groupByLot, nullPlacement, search, secondarySortKey, sortDirection, sortKey]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedEquipment = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  useEffect(() => {
    if (!filtersInitialized.current) {
      filtersInitialized.current = true;
      return;
    }
    setPage(1);
  }, [filterLot, filterLotType, filterStatus, filterType, groupByLot, nullPlacement, search, secondarySortKey, sortDirection, sortKey]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const groupedEquipment = useMemo(() => {
    if (!groupByLot) return [{ key: "all", label: "", items: pagedEquipment }];
    return Array.from(pagedEquipment.reduce((groups, item) => {
      const key = item.lot_id || "unassigned";
      const current = groups.get(key) || { key, label: item.parking_lots?.name || "주차장 미지정", items: [] as Equipment[] };
      current.items.push(item);
      groups.set(key, current);
      return groups;
    }, new Map<string, { key: string; label: string; items: Equipment[] }>()).values());
  }, [groupByLot, pagedEquipment]);

  const today = new Date();
  const warrantyThreshold = new Date(today.getTime() + 90 * 86400000);
  const exceptionCount = equipment.filter((item) => ["warning", "broken", "maintenance"].includes(item.status)).length;
  const warrantyRiskCount = equipment.filter((item) => item.warranty_end && new Date(item.warranty_end) <= warrantyThreshold && new Date(item.warranty_end) >= today).length;
  const maintenanceCost = filtered.reduce((sum, item) => sum + (item.total_maintenance_cost || 0), 0);

  const [form, setForm] = useState({
    equipment_type: "",
    name: "",
    lot_id: "",
    location_detail: "",
    floor: "",
    manufacturer: "",
    vendor_name: "",
    vendor_manager: "",
    vendor_phone: "",
    vendor_email: "",
    model: "",
    serial_number: "",
    install_date: "",
    warranty_end: "",
    purchase_cost: "",
    notes: "",
    status: "normal" as EquipmentStatus,
  });
  const selectedFormLot = useMemo(() => lots.find((lot: any) => lot.id === form.lot_id), [form.lot_id, lots]);
  const selectedLotProfile = useMemo(() => getParkingLotWorkProfile(selectedFormLot?.lot_type), [selectedFormLot?.lot_type]);
  const selectedLotEquipmentTypes = useMemo(() => equipment.filter((item) => item.lot_id === form.lot_id && item.status !== "decommissioned").map((item) => item.equipment_type), [equipment, form.lot_id]);
  const missingStandardEquipment = useMemo(() => getMissingRequiredEquipment(selectedFormLot?.lot_type, selectedLotEquipmentTypes), [selectedFormLot?.lot_type, selectedLotEquipmentTypes]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const typeAbbr = form.equipment_type.substring(0, 3).toUpperCase();
      const count = equipment.filter((item) => item.equipment_type === form.equipment_type).length + 1;
      const code = `EQ-${typeAbbr}-${String(count).padStart(3, "0")}`;

      const values = {
        equipment_type: form.equipment_type,
        name: form.name,
        lot_id: form.lot_id,
        location_detail: form.location_detail || null,
        floor: form.floor ? parseInt(form.floor, 10) : null,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        serial_number: form.serial_number || null,
        install_date: form.install_date || null,
        warranty_end: form.warranty_end || null,
        purchase_cost: form.purchase_cost ? parseInt(form.purchase_cost, 10) : null,
        notes: form.notes || null,
        status: form.status,
        quantity: 1,
        author_name: (form as any).author_name || null,
      };
      const query = editingEquipment
        ? supabase.from("equipment").update(values).eq("id", editingEquipment.id)
        : supabase.from("equipment").insert({ ...values, equipment_code: code });
      const { data: saved, error } = await query.select("id").single();

      if (error) throw error;
      await saveRelatedCompanyContact({
        module: "FACILITY_EQUIPMENT",
        recordId: saved.id,
        recordLabel: `${editingEquipment?.equipment_code || code} ${form.name}`,
        recordPath: `/facility/equipment?equipment=${saved.id}`,
        companyName: form.vendor_name,
        managerName: form.vendor_manager,
        phone: form.vendor_phone,
        email: form.vendor_email,
      });
      return photoFiles.length
        ? saveFacilityRecordPhotosLocally("equipment", saved.id, photoFiles)
        : { savedPaths: [], saveErrors: [] };
    },
    onSuccess: (photoResult) => {
      toast.success(editingEquipment ? "장비 정보를 수정했습니다" : "장비가 등록되었습니다");
      if (photoResult.saveErrors.length) toast.error(`장비는 저장됐지만 사진 ${photoResult.saveErrors.length}장을 PC 폴더에 저장하지 못했습니다.`, { description: photoResult.saveErrors.join("\n") });
      queryClient.invalidateQueries({ queryKey: ["facility-equipment"] });
      queryClient.invalidateQueries({ queryKey: ["facility-record-photos", "equipment"] });
      setDialogOpen(false);
      setEditingEquipment(null);
      setPhotoFiles([]);
      setForm({
        equipment_type: "",
        name: "",
        lot_id: "",
        location_detail: "",
        floor: "",
        manufacturer: "",
        vendor_name: "",
        vendor_manager: "",
        vendor_phone: "",
        vendor_email: "",
        model: "",
        serial_number: "",
        install_date: "",
        warranty_end: "",
        purchase_cost: "",
        notes: "",
        status: "normal",
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const decommissionMutation = useMutation({
    mutationFn: async (item: Equipment) => {
      const { error } = await supabase.from("equipment").update({ status: "decommissioned", status_changed_at: new Date().toISOString() }).eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["facility-equipment"] });
      setDetailOpen(false);
      toast.success("장비를 폐기 상태로 변경했습니다");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editEquipment = (item: Equipment) => {
    setEditingEquipment(item);
    setPhotoFiles([]);
    setForm({
      equipment_type: item.equipment_type,
      name: item.name,
      lot_id: item.lot_id,
      location_detail: item.location_detail || "",
      floor: item.floor == null ? "" : String(item.floor),
      manufacturer: item.manufacturer || "",
      vendor_name: item.vendor_name || "",
      vendor_manager: item.vendor_manager || "",
      vendor_phone: item.vendor_phone || "",
      vendor_email: item.vendor_email || "",
      model: item.model || "",
      serial_number: item.serial_number || "",
      install_date: item.install_date || "",
      warranty_end: item.warranty_end || "",
      purchase_cost: item.purchase_cost == null ? "" : String(item.purchase_cost),
      notes: item.notes || "",
      status: item.status,
    });
    setDetailOpen(false);
    setDialogOpen(true);
  };

  const formatCost = (value?: number | null) => (value != null ? `${value.toLocaleString()}원` : "-");

  const openEquipmentDetail = (equipmentItem: Equipment) => {
    setSelectedEquipmentId(equipmentItem.id);
    setDetailOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">장비 관리</h1>
          <div className="flex items-center gap-2">
            <FacilityReportShortcut focus="equipment" label="보고서" />
            <Button variant={viewMode === "table" ? "default" : "outline"} size="icon" aria-label="목록 보기" title="목록 보기" onClick={() => setViewMode("table")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "card" ? "default" : "outline"} size="icon" aria-label="카드 보기" title="카드 보기" onClick={() => setViewMode("card")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            {canCreate && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingEquipment(null); setPhotoFiles([]); setForm({ equipment_type: "", name: "", lot_id: "", location_detail: "", floor: "", manufacturer: "", vendor_name: "", vendor_manager: "", vendor_phone: "", vendor_email: "", model: "", serial_number: "", install_date: "", warranty_end: "", purchase_cost: "", notes: "", status: "normal" }); }}>
                  <Plus className="mr-1 h-4 w-4" />장비 등록
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>장비 {editingEquipment ? "수정" : "등록"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>장비 유형 *</Label>
                    <Select value={form.equipment_type} onValueChange={(value) => setForm((prev) => ({ ...prev, equipment_type: value }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(EQUIPMENT_TYPE_LABELS).map(([key, value]) => (
                          <SelectItem key={key} value={key}>{value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>장비명 *</Label><Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></div>
                  <div>
                    <Label>주차장 *</Label>
                    <FacilityLotCombobox lots={lots} value={form.lot_id} onValueChange={(value) => setForm((prev) => ({ ...prev, lot_id: value }))} />
                  </div>
                  {form.lot_id && (
                    <div className="rounded-md border bg-muted/30 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{selectedLotProfile.label}</Badge>
                        <span className="text-sm font-medium">운영 기준장비</span>
                        <span className="text-xs text-muted-foreground">미등록 {missingStandardEquipment.length}종</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{selectedLotProfile.workFocus}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedLotProfile.requiredEquipment.map((type) => {
                          const missing = missingStandardEquipment.includes(type);
                          return <Button key={type} type="button" size="sm" variant={missing ? "outline" : "secondary"} className="h-7 text-xs" onClick={() => setForm((prev) => ({ ...prev, equipment_type: type }))}>{EQUIPMENT_TYPE_LABELS[type] || type}{missing ? " 등록 필요" : " 등록됨"}</Button>;
                        })}
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground">운영 관리 기준이며 법정 의무 여부는 시설별 인허가·설계도서로 별도 확인합니다.</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>위치 상세</Label><Input value={form.location_detail} onChange={(event) => setForm((prev) => ({ ...prev, location_detail: event.target.value }))} placeholder="예: B1층 입구 좌측" /></div>
                    <div><Label>층</Label><Input type="number" value={form.floor} onChange={(event) => setForm((prev) => ({ ...prev, floor: event.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>제조사</Label><Input value={form.manufacturer} onChange={(event) => setForm((prev) => ({ ...prev, manufacturer: event.target.value }))} /></div>
                    <div><Label>모델명</Label><Input value={form.model} onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))} /></div>
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">관련 업체 연락망</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>업체명</Label><Input value={form.vendor_name} onChange={(event) => setForm((prev) => ({ ...prev, vendor_name: event.target.value }))} placeholder="설치·유지관리 업체" /></div>
                      <div><Label>업체 담당자</Label><Input value={form.vendor_manager} onChange={(event) => setForm((prev) => ({ ...prev, vendor_manager: event.target.value }))} /></div>
                      <div><Label>담당자 연락처</Label><Input type="tel" value={form.vendor_phone} onChange={(event) => setForm((prev) => ({ ...prev, vendor_phone: event.target.value }))} placeholder="064-000-0000" /></div>
                      <div><Label>담당자 이메일</Label><Input type="email" value={form.vendor_email} onChange={(event) => setForm((prev) => ({ ...prev, vendor_email: event.target.value }))} /></div>
                    </div>
                  </div>
                  <div><Label>시리얼번호</Label><Input value={form.serial_number} onChange={(event) => setForm((prev) => ({ ...prev, serial_number: event.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label htmlFor="equipment-install-date">설치일</Label><Input id="equipment-install-date" type="date" value={form.install_date} onInput={(event) => setForm((prev) => ({ ...prev, install_date: event.currentTarget.value }))} onChange={(event) => setForm((prev) => ({ ...prev, install_date: event.target.value }))} /></div>
                    <div><Label htmlFor="equipment-warranty-end">보증만료</Label><Input id="equipment-warranty-end" type="date" value={form.warranty_end} onInput={(event) => setForm((prev) => ({ ...prev, warranty_end: event.currentTarget.value }))} onChange={(event) => setForm((prev) => ({ ...prev, warranty_end: event.target.value }))} /></div>
                  </div>
                  <div><Label>취득원가 (원)</Label><Input type="number" value={form.purchase_cost} onChange={(event) => setForm((prev) => ({ ...prev, purchase_cost: event.target.value }))} /></div>
                  <div><Label>운영 상태</Label><Select value={form.status} onValueChange={(value: EquipmentStatus) => setForm((prev) => ({ ...prev, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(EQUIPMENT_STATUS_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>비고</Label><Textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={2} /></div>
                  <FacilityPhotoPicker files={photoFiles} onFilesChange={setPhotoFiles} label="장비·설치 위치 사진 (선택)" description="장비 외관, 명판, 설치 위치를 촬영하면 이후 점검과 유지보수 때 바로 확인할 수 있습니다." />
                  <AuthorField value={(form as any).author_name || ""} onChange={v => setForm(prev => ({ ...prev, author_name: v } as any))} />
                  {(!form.equipment_type || !form.name || !form.lot_id) && <p role="status" className="text-xs text-amber-700">등록하려면 장비 유형, 장비명, 주차장을 입력해 주세요.</p>}
                  <Button className="w-full" disabled={!form.equipment_type || !form.name || !form.lot_id || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                    {saveMutation.isPending ? "저장 중..." : editingEquipment ? "수정 저장" : "등록"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border lg:grid-cols-4">
          <div className="bg-card p-3"><p className="text-xs text-muted-foreground">등록 장비</p><p className="mt-1 text-xl font-semibold tabular-nums">{equipment.length.toLocaleString()}대</p></div>
          <div className="bg-card p-3"><p className="flex items-center gap-1 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" />조치 필요</p><p className="mt-1 text-xl font-semibold tabular-nums text-destructive">{exceptionCount.toLocaleString()}대</p></div>
          <div className="bg-card p-3"><p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />90일 내 보증만료</p><p className="mt-1 text-xl font-semibold tabular-nums">{warrantyRiskCount.toLocaleString()}대</p></div>
          <div className="bg-card p-3"><p className="flex items-center gap-1 text-xs text-muted-foreground"><CircleDollarSign className="h-3.5 w-3.5" />조회 장비 누적수리비</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatCost(maintenanceCost)}</p></div>
        </div>

        <div className="flex justify-end">
          <Select value={filterLotType} onValueChange={setFilterLotType}>
            <SelectTrigger aria-label="주차장 형태 필터" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 주차장 형태</SelectItem>
              {Object.entries(LOT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              <SelectItem value="other">기타·미지정</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <OperationalListControls
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="장비명, 코드, 시리얼, 제조사 검색"
          lots={lots.map((lot: { id: string; name: string; code: string }) => ({ value: lot.id, label: `${lot.name} (${lot.code})` }))}
          lotId={filterLot}
          onLotChange={setFilterLot}
          categoryLabel="전체 유형"
          categories={Object.entries(EQUIPMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          category={filterType}
          onCategoryChange={setFilterType}
          statuses={[{ value: "attention", label: "조치 필요" }, ...Object.entries(EQUIPMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))]}
          status={filterStatus}
          onStatusChange={setFilterStatus}
          sortOptions={[
            { value: "equipment_code", label: "장비코드순" }, { value: "name", label: "장비명순" },
            { value: "lot", label: "주차장순" }, { value: "type", label: "장비유형순" },
            { value: "status", label: "상태 위험순" }, { value: "install_date", label: "설치일순" },
            { value: "warranty_end", label: "보증만료일순" }, { value: "next_maintenance_date", label: "다음점검일순" },
            { value: "maintenance_cost", label: "누적수리비순" }, { value: "updated_at", label: "최근수정순" },
          ]}
          sortKey={sortKey}
          onSortKeyChange={(value) => setSortKey(value as EquipmentSortKey)}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
          secondarySortKey={secondarySortKey}
          onSecondarySortKeyChange={(value) => setSecondarySortKey(value as EquipmentSortKey | "none")}
          nullPlacement={nullPlacement}
          onNullPlacementChange={setNullPlacement}
          groupByLot={groupByLot}
          onGroupByLotChange={setGroupByLot}
          resultCount={filtered.length}
          totalCount={equipment.length}
          onReset={() => { setSearch(""); setFilterLot("all"); setFilterLotType("all"); setFilterType("all"); setFilterStatus("all"); setSortKey("equipment_code"); setSortDirection("asc"); setSecondarySortKey("name"); setNullPlacement("last"); setGroupByLot(false); }}
        />

        {viewMode === "table" ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead sortable={false}>코드</TableHead><TableHead sortable={false}>장비명</TableHead><TableHead sortable={false}>유형</TableHead>
                    <TableHead sortable={false}>주차장</TableHead><TableHead sortable={false}>제조사/모델</TableHead><TableHead sortable={false}>설치일</TableHead>
                    <TableHead sortable={false}>보증만료</TableHead><TableHead sortable={false}>상태</TableHead><TableHead sortable={false} className="text-right">누적수리비</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedEquipment.map((group) => (
                    <Fragment key={group.key}>
                      {groupByLot && <TableRow className="bg-muted/60 hover:bg-muted/60"><TableCell colSpan={9} className="py-2 font-semibold">{group.label}<Badge variant="secondary" className="ml-2">{group.items.length}대</Badge></TableCell></TableRow>}
                      {group.items.map((item) => (
                        <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEquipmentDetail(item)}>
                          <TableCell><button type="button" className="font-mono text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(event) => { event.stopPropagation(); openEquipmentDetail(item); }}>{item.equipment_code}</button></TableCell>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell><Badge variant="outline">{EQUIPMENT_TYPE_LABELS[item.equipment_type] || item.equipment_type}</Badge></TableCell>
                          <TableCell><div>{item.parking_lots?.name || "-"}</div>{item.parking_lots?.lot_type && <Badge variant="secondary" className="mt-1 text-[10px]">{LOT_TYPE_LABELS[item.parking_lots.lot_type as LotType]}</Badge>}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{[item.manufacturer, item.model].filter(Boolean).join(" / ") || "-"}</TableCell>
                          <TableCell className="text-sm">{item.install_date || "-"}</TableCell>
                          <TableCell className="text-sm">{item.warranty_end || "-"}</TableCell>
                          <TableCell><Badge className={EQUIPMENT_STATUS_COLORS[item.status]}>{EQUIPMENT_STATUS_LABELS[item.status]}</Badge></TableCell>
                          <TableCell className="text-right text-sm">{formatCost(item.total_maintenance_cost)}</TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">{isLoading ? "로딩 중..." : "등록된 장비가 없습니다"}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {groupedEquipment.map((group) => <section key={group.key} className="space-y-2">
              {groupByLot && <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{group.label}</h2><Badge variant="secondary">{group.items.length}대</Badge></div>}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((item) => (
                  <Card key={item.id} role="button" tabIndex={0} className="cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => openEquipmentDetail(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openEquipmentDetail(item); } }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <p className="font-mono text-xs text-muted-foreground">{item.equipment_code}</p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{EQUIPMENT_TYPE_LABELS[item.equipment_type] || item.equipment_type}</Badge>
                        <Badge className={EQUIPMENT_STATUS_COLORS[item.status]}>{EQUIPMENT_STATUS_LABELS[item.status]}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted-foreground">{item.parking_lots?.name || "-"}</p>{item.parking_lots?.lot_type && <Badge variant="secondary" className="text-[10px]">{LOT_TYPE_LABELS[item.parking_lots.lot_type as LotType]}</Badge>}</div>
                      <div className="flex justify-between text-xs text-muted-foreground"><span>설치 {item.install_date || "-"}</span><span>수리비 {formatCost(item.total_maintenance_cost)}</span></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>)}
            {filtered.length === 0 && <p className="col-span-3 py-8 text-center text-muted-foreground">등록된 장비가 없습니다</p>}
          </div>
        )}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm text-muted-foreground">
            <span>{filtered.length.toLocaleString()}건 중 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)}건</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="mr-1 h-4 w-4" />이전</Button>
              <span className="min-w-16 text-center tabular-nums">{page} / {pageCount}</span>
              <Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>다음<ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      <EquipmentDetailSheet equipment={selectedEquipment} open={detailOpen} onOpenChange={(open) => setDetailOpen(open)} onEdit={canEdit ? editEquipment : undefined} onDecommission={canEdit ? (item) => decommissionMutation.mutate(item) : undefined} />
    </DashboardLayout>
  );
}
