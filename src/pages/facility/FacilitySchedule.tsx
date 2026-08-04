import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, ChevronRight, Calendar, List, Plus, ClipboardPlus } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { toast } from "sonner";
import { ScheduleCalendarView } from "@/components/facility/ScheduleCalendarView";
import { ScheduleDetailSheet } from "@/components/facility/ScheduleDetailSheet";
import { ScheduleListView } from "@/components/facility/ScheduleListView";
import { SCHEDULE_TYPE_LABELS } from "@/types/facility";
import type { MaintenanceSchedule } from "@/types/facility";
import { generateDueMaintenanceWorkOrders } from "@/lib/workflow-commands";
import { OperationalListControls } from "@/components/common/OperationalListControls";
import { stableMultiSort, type NullPlacement } from "@/lib/list-sorting";
import { indexRelatedCompanyContacts, listRelatedCompanyContacts, saveRelatedCompanyContact } from "@/lib/related-company-registry";
import { useAuthorization } from "@/hooks/useAuthorization";
import { FacilityLotCombobox } from "@/components/facility/FacilityLotCombobox";
import { Badge } from "@/components/ui/badge";
import { LOT_TYPE_LABELS } from "@/types/database";
import { getParkingLotWorkProfile } from "@/lib/parking-lot-work-profile";
import { FacilityReportShortcut } from "@/components/facility/FacilityReportShortcut";

function defaultNextInspectionDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function FacilitySchedule() {
  const queryClient = useQueryClient();
  const { canCreate, canEdit } = useAuthorization("FACILITY");
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(() => Boolean(searchParams.get("schedule")));
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(() => searchParams.get("schedule"));
  const [editingSchedule, setEditingSchedule] = useState<MaintenanceSchedule | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [search, setSearch] = useState("");
  const [lotFilter, setLotFilter] = useState("all");
  const [lotTypeFilter, setLotTypeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("next_due_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [secondarySortKey, setSecondarySortKey] = useState("lot");
  const [nullPlacement, setNullPlacement] = useState<NullPlacement>("last");
  const [groupByLot, setGroupByLot] = useState(false);

  const { data: lots = [] } = useQuery({
    queryKey: ["parking-lots-select", "with-type"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name, lot_type").order("name");
      return data ?? [];
    },
  });

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["facility-schedules"],
    queryFn: async () => {
      const [{ data, error }, contacts] = await Promise.all([
        supabase.from("maintenance_schedules").select("*, parking_lots(code, name, lot_type), equipment(name, equipment_type), assignee:profiles!maintenance_schedules_assigned_to_fkey(name)").order("next_due_date"),
        listRelatedCompanyContacts("FACILITY_SCHEDULE"),
      ]);

      if (error) throw error;
      const contactMap = indexRelatedCompanyContacts(contacts);
      return ((data ?? []) as unknown as MaintenanceSchedule[]).map((item) => {
        const contact = contactMap.get(item.id);
        return contact ? { ...item, vendor_name: contact.companyName, vendor_manager: contact.managerName, vendor_phone: contact.phone, vendor_email: contact.email } : item;
      });
    },
  });

  const selectedSchedule = useMemo(
    () => schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null,
    [schedules, selectedScheduleId],
  );

  const filteredSchedules = useMemo(() => {
    const query = search.trim().toLowerCase();
    const valueFor = (schedule: MaintenanceSchedule, key: string) => {
      if (key === "name") return schedule.schedule_name;
      if (key === "lot") return schedule.parking_lots?.name || "";
      if (key === "type") return SCHEDULE_TYPE_LABELS[schedule.schedule_type] || schedule.schedule_type;
      if (key === "updated_at") return schedule.updated_at;
      return schedule.next_due_date;
    };
    const matching = schedules.filter((schedule) => {
      if (lotFilter !== "all" && schedule.lot_id !== lotFilter) return false;
      if (lotTypeFilter !== "all" && schedule.parking_lots?.lot_type !== lotTypeFilter) return false;
      if (typeFilter !== "all" && schedule.schedule_type !== typeFilter) return false;
      if (statusFilter === "active" && !schedule.is_active) return false;
      if (statusFilter === "inactive" && schedule.is_active) return false;
      return !query || [schedule.schedule_name, schedule.parking_lots?.name, schedule.equipment?.name, schedule.assignee?.name, schedule.vendor_name, schedule.vendor_manager, schedule.vendor_phone, schedule.vendor_email].some((value) => String(value || "").toLowerCase().includes(query));
    });
    return stableMultiSort(matching, [
      ...(groupByLot ? [{ value: (schedule: MaintenanceSchedule) => schedule.parking_lots?.name, direction: "asc" as const }] : []),
      { value: (schedule) => valueFor(schedule, sortKey), direction: sortDirection },
      ...(secondarySortKey !== "none" && secondarySortKey !== sortKey ? [{ value: (schedule: MaintenanceSchedule) => valueFor(schedule, secondarySortKey), direction: "asc" as const }] : []),
    ], nullPlacement);
  }, [groupByLot, lotFilter, lotTypeFilter, nullPlacement, schedules, search, secondarySortKey, sortDirection, sortKey, statusFilter, typeFilter]);

  useEffect(() => {
    const requested = searchParams.get("schedule");
    if (requested && schedules.some((schedule) => schedule.id === requested)) {
      setSelectedScheduleId(requested);
      setDetailOpen(true);
    }
  }, [schedules, searchParams]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (detailOpen && selectedScheduleId) next.set("schedule", selectedScheduleId);
    else next.delete("schedule");
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [detailOpen, searchParams, selectedScheduleId, setSearchParams]);

  useEffect(() => {
    if (selectedScheduleId && !selectedSchedule) {
      setDetailOpen(false);
      setSelectedScheduleId(null);
    }
  }, [selectedSchedule, selectedScheduleId]);

  const [form, setForm] = useState({
    schedule_name: "",
    lot_id: "",
    schedule_type: "monthly",
    next_due_date: defaultNextInspectionDate(),
    advance_notice_days: "7",
    description: "",
    vendor_name: "",
    vendor_manager: "",
    vendor_phone: "",
    vendor_email: "",
    is_active: true,
  });
  const selectedFormLot = useMemo(() => lots.find((lot: any) => lot.id === form.lot_id), [form.lot_id, lots]);
  const selectedLotProfile = useMemo(() => getParkingLotWorkProfile(selectedFormLot?.lot_type), [selectedFormLot?.lot_type]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const values = {
        schedule_name: form.schedule_name,
        lot_id: form.lot_id,
        schedule_type: form.schedule_type,
        next_due_date: form.next_due_date,
        advance_notice_days: parseInt(form.advance_notice_days, 10) || 7,
        description: form.description || null,
        vendor_name: form.vendor_name || null,
        is_active: form.is_active,
        created_by: user?.id,
        author_name: (form as any).author_name || null,
      };
      const query = editingSchedule
        ? supabase.from("maintenance_schedules").update(values).eq("id", editingSchedule.id)
        : supabase.from("maintenance_schedules").insert(values);
      const { data: saved, error } = await query.select("id").single();

      if (error) throw error;
      await saveRelatedCompanyContact({
        module: "FACILITY_SCHEDULE",
        recordId: saved.id,
        recordLabel: form.schedule_name,
        recordPath: `/facility/schedule?schedule=${saved.id}`,
        companyName: form.vendor_name,
        managerName: form.vendor_manager,
        phone: form.vendor_phone,
        email: form.vendor_email,
      });
    },
    onSuccess: () => {
      toast.success(editingSchedule ? "점검 일정을 수정했습니다" : "점검 일정을 등록했습니다");
      queryClient.invalidateQueries({ queryKey: ["facility-schedules"] });
      setDialogOpen(false);
      setEditingSchedule(null);
      setForm({
        schedule_name: "",
        lot_id: "",
        schedule_type: "monthly",
        next_due_date: defaultNextInspectionDate(),
        advance_notice_days: "7",
        description: "",
        vendor_name: "",
        vendor_manager: "",
        vendor_phone: "",
        vendor_email: "",
        is_active: true,
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (schedule: MaintenanceSchedule) => {
      const { error } = await supabase.from("maintenance_schedules").update({ is_active: !schedule.is_active }).eq("id", schedule.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["facility-schedules"] });
      toast.success("점검 일정 상태를 변경했습니다");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editSchedule = (schedule: MaintenanceSchedule) => {
    setEditingSchedule(schedule);
    setForm({
      schedule_name: schedule.schedule_name,
      lot_id: schedule.lot_id,
      schedule_type: schedule.schedule_type,
      next_due_date: schedule.next_due_date,
      advance_notice_days: String(schedule.advance_notice_days || 7),
      description: schedule.description || "",
      vendor_name: schedule.vendor_name || "",
      vendor_manager: schedule.vendor_manager || "",
      vendor_phone: schedule.vendor_phone || "",
      vendor_email: schedule.vendor_email || "",
      is_active: schedule.is_active,
    });
    setDetailOpen(false);
    setDialogOpen(true);
  };

  const materializeMutation = useMutation({
    mutationFn: () => generateDueMaintenanceWorkOrders(),
    onSuccess: (created) => {
      toast.success(created.length > 0 ? `${created.length}건의 작업지시를 생성했습니다` : "새로 생성할 작업지시가 없습니다");
      queryClient.invalidateQueries({ queryKey: ["facility-maint-logs"] });
      queryClient.invalidateQueries({ queryKey: ["my-work"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const monthLabel = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(currentMonth);

  const openScheduleDetail = (schedule: MaintenanceSchedule) => {
    setSelectedScheduleId(schedule.id);
    setDetailOpen(true);
  };

  const prevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">점검 스케줄</h1>
          <div className="flex items-center gap-2">
            <FacilityReportShortcut focus="schedules" label="보고서" />
            {canCreate && <Button variant="outline" onClick={() => materializeMutation.mutate()} disabled={materializeMutation.isPending}>
              <ClipboardPlus className="mr-1 h-4 w-4" />작업지시 생성
            </Button>}
            <Button
              variant={viewMode === "calendar" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("calendar")}
              aria-label="달력 보기"
            >
              <Calendar className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("list")}
              aria-label="목록 보기"
            >
              <List className="h-4 w-4" />
            </Button>
            {canCreate && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingSchedule(null); setForm({ schedule_name: "", lot_id: "", schedule_type: "monthly", next_due_date: defaultNextInspectionDate(), advance_notice_days: "7", description: "", vendor_name: "", vendor_manager: "", vendor_phone: "", vendor_email: "", is_active: true }); }}>
                  <Plus className="mr-1 h-4 w-4" />스케줄 등록
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[88vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>점검 스케줄 {editingSchedule ? "수정" : "등록"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>점검명 *</Label>
                    <Input
                      value={form.schedule_name}
                      onChange={(event) => setForm((prev) => ({ ...prev, schedule_name: event.target.value }))}
                      placeholder="예: 공항입구 차단기 월간점검"
                    />
                  </div>
                  <div>
                    <Label>주차장 *</Label>
                    <FacilityLotCombobox lots={lots} value={form.lot_id} onValueChange={(value) => setForm((prev) => ({ ...prev, lot_id: value }))} />
                  </div>
                  {form.lot_id && (
                    <div className="rounded-md border bg-muted/30 p-3">
                      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{selectedLotProfile.label}</Badge><span className="text-sm font-medium">권장 점검 일정</span></div>
                      <p className="mt-1 text-xs text-muted-foreground">{selectedLotProfile.workFocus}</p>
                      <div className="mt-2 grid gap-2">
                        {selectedLotProfile.scheduleRecommendations.map((recommendation) => (
                          <Button key={recommendation.name} type="button" variant="outline" className="h-auto justify-start whitespace-normal px-3 py-2 text-left" onClick={() => setForm((prev) => ({ ...prev, schedule_name: `${selectedFormLot?.name || ""} ${recommendation.name}`.trim(), schedule_type: recommendation.scheduleType, description: recommendation.description }))}>
                            <span><span className="block text-sm font-medium">{recommendation.name} · {SCHEDULE_TYPE_LABELS[recommendation.scheduleType]}</span><span className="block text-xs font-normal text-muted-foreground">{recommendation.description}</span></span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label>점검 주기</Label>
                    <Select
                      value={form.schedule_type}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, schedule_type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SCHEDULE_TYPE_LABELS).map(([key, value]) => (
                          <SelectItem key={key} value={key}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>다음 점검일 *</Label>
                    <Input
                      type="date"
                      value={form.next_due_date}
                      onChange={(event) => setForm((prev) => ({ ...prev, next_due_date: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>사전 알림 (일)</Label>
                    <Input
                      type="number"
                      value={form.advance_notice_days}
                      onChange={(event) => setForm((prev) => ({ ...prev, advance_notice_days: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>설명</Label>
                    <Textarea
                      value={form.description}
                      onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                      rows={2}
                    />
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">관련 업체 연락망</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div><Label>업체명</Label><Input value={form.vendor_name} onChange={(event) => setForm((prev) => ({ ...prev, vendor_name: event.target.value }))} /></div>
                      <div><Label>업체 담당자</Label><Input value={form.vendor_manager} onChange={(event) => setForm((prev) => ({ ...prev, vendor_manager: event.target.value }))} /></div>
                      <div><Label>담당자 연락처</Label><Input type="tel" value={form.vendor_phone} onChange={(event) => setForm((prev) => ({ ...prev, vendor_phone: event.target.value }))} /></div>
                      <div><Label>담당자 이메일</Label><Input type="email" value={form.vendor_email} onChange={(event) => setForm((prev) => ({ ...prev, vendor_email: event.target.value }))} /></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_active} onCheckedChange={(value) => setForm((prev) => ({ ...prev, is_active: value }))} />
                    <Label>활성</Label>
                  </div>
                  <AuthorField value={(form as any).author_name || ""} onChange={v => setForm(prev => ({ ...prev, author_name: v } as any))} />
                  {(!form.schedule_name || !form.lot_id || !form.next_due_date) && <p role="status" className="text-xs text-amber-700">등록하려면 일정명, 주차장, 다음 점검일을 입력해 주세요.</p>}
                  <Button
                    className="w-full"
                    disabled={!form.schedule_name || !form.lot_id || !form.next_due_date || saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                  >
                    {saveMutation.isPending ? "저장 중..." : editingSchedule ? "수정 저장" : "등록"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>}
          </div>
        </div>

        <div className="flex justify-end">
          <Select value={lotTypeFilter} onValueChange={setLotTypeFilter}>
            <SelectTrigger aria-label="주차장 형태 필터" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">전체 주차장 형태</SelectItem>{Object.entries(LOT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <OperationalListControls
          search={search} onSearchChange={setSearch} searchPlaceholder="점검명, 장비, 담당자, 업체 검색"
          lots={lots.map((lot: { id: string; name: string; code: string }) => ({ value: lot.id, label: `${lot.name} (${lot.code})` }))} lotId={lotFilter} onLotChange={setLotFilter}
          categoryLabel="전체 주기" categories={Object.entries(SCHEDULE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} category={typeFilter} onCategoryChange={setTypeFilter}
          statuses={[{ value: "active", label: "활성" }, { value: "inactive", label: "비활성" }]} status={statusFilter} onStatusChange={setStatusFilter}
          sortOptions={[{ value: "next_due_date", label: "다음 점검일순" }, { value: "name", label: "점검명순" }, { value: "lot", label: "주차장순" }, { value: "type", label: "점검주기순" }, { value: "updated_at", label: "최근수정순" }]}
          sortKey={sortKey} onSortKeyChange={setSortKey} sortDirection={sortDirection} onSortDirectionChange={setSortDirection}
          secondarySortKey={secondarySortKey} onSecondarySortKeyChange={setSecondarySortKey} nullPlacement={nullPlacement} onNullPlacementChange={setNullPlacement}
          groupByLot={groupByLot} onGroupByLotChange={setGroupByLot} resultCount={filteredSchedules.length} totalCount={schedules.length}
          onReset={() => { setSearch(""); setLotFilter("all"); setLotTypeFilter("all"); setTypeFilter("all"); setStatusFilter("all"); setSortKey("next_due_date"); setSortDirection("asc"); setSecondarySortKey("lot"); setNullPlacement("last"); setGroupByLot(false); }}
        />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="이전 달">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle>{monthLabel}</CardTitle>
              <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="다음 달">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className={viewMode === "list" ? "p-0" : undefined}>
            {viewMode === "calendar" ? (
              <ScheduleCalendarView
                currentMonth={currentMonth}
                isLoading={isLoading}
                schedules={filteredSchedules}
                selectedScheduleId={selectedScheduleId}
                onSelectSchedule={openScheduleDetail}
              />
            ) : (
              <ScheduleListView
                isLoading={isLoading}
                schedules={filteredSchedules}
                selectedScheduleId={selectedScheduleId}
                onSelectSchedule={openScheduleDetail}
                groupByLot={groupByLot}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <ScheduleDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        schedule={selectedSchedule}
        onEdit={canEdit ? editSchedule : undefined}
        onToggleActive={canEdit ? (schedule) => toggleActiveMutation.mutate(schedule) : undefined}
      />
    </DashboardLayout>
  );
}
