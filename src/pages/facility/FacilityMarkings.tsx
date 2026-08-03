import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Star } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { toast } from "sonner";
import { MARKING_TYPE_LABELS, CONDITION_LABELS, CONDITION_COLORS } from "@/types/facility";
import type { SurfaceMarking, MarkingCondition } from "@/types/facility";
import { SurfaceMarkingDetailSheet } from "@/components/facility/SurfaceMarkingDetailSheet";
import { OperationalListControls } from "@/components/common/OperationalListControls";
import { stableMultiSort, type NullPlacement } from "@/lib/list-sorting";
import { formatFacilityRelativeDay } from "@/lib/facility-format";
import { useAuthorization } from "@/hooks/useAuthorization";
import { FacilityLotCombobox } from "@/components/facility/FacilityLotCombobox";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";
import { getParkingLotWorkProfile } from "@/lib/parking-lot-work-profile";

const todayIso = () => new Date().toISOString().slice(0, 10);

function addMonthsClamped(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export default function FacilityMarkings() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canCreate, canEdit } = useAuthorization("FACILITY");
  const [selectedLot, setSelectedLot] = useState<string>("");
  const [lotTypeFilter, setLotTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(() => Boolean(searchParams.get("marking")));
  const [selectedMarkingId, setSelectedMarkingId] = useState<string | null>(() => searchParams.get("marking"));
  const [editingMarking, setEditingMarking] = useState<SurfaceMarking | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [sortKey, setSortKey] = useState("next_due");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [secondarySortKey, setSecondarySortKey] = useState("condition");
  const [nullPlacement, setNullPlacement] = useState<NullPlacement>("last");
  const [groupByLot, setGroupByLot] = useState(false);

  const { data: lots = [] } = useQuery({
    queryKey: ["parking-lots-select", "with-type"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name, lot_type").order("name");
      return data ?? [];
    },
  });

  const { data: markings = [], isLoading } = useQuery({
    queryKey: ["facility-markings"],
    queryFn: async () => {
      const { data } = await supabase.from("surface_markings").select("*, parking_lots(code, name, lot_type)").order("marking_type");
      return (data ?? []) as unknown as SurfaceMarking[];
    },
  });

  const selectedMarking = useMemo(
    () => markings.find((marking) => marking.id === selectedMarkingId) ?? null,
    [markings, selectedMarkingId],
  );

  useEffect(() => {
    const requested = searchParams.get("marking");
    if (requested && markings.some((marking) => marking.id === requested)) {
      setSelectedMarkingId(requested);
      setDetailOpen(true);
    }
  }, [markings, searchParams]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (detailOpen && selectedMarkingId) next.set("marking", selectedMarkingId);
    else next.delete("marking");
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [detailOpen, searchParams, selectedMarkingId, setSearchParams]);

  const [form, setForm] = useState({
    lot_id: "",
    marking_type: "",
    marking_name: "",
    location_detail: "",
    floor: "",
    quantity: "1",
    material: "",
    color: "",
    condition: "good" as MarkingCondition,
    install_date: todayIso(),
    last_repainted: todayIso(),
    repaint_cycle_months: "",
    is_regulatory: false,
    regulation_ref: "",
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const nextDue =
        form.last_repainted && form.repaint_cycle_months
          ? addMonthsClamped(form.last_repainted, parseInt(form.repaint_cycle_months, 10))
          : null;

      const values = {
        lot_id: form.lot_id,
        marking_type: form.marking_type,
        marking_name: form.marking_name,
        location_detail: form.location_detail || null,
        floor: form.floor ? parseInt(form.floor, 10) : null,
        quantity: parseInt(form.quantity, 10) || 1,
        material: form.material || null,
        color: form.color || null,
        condition: form.condition,
        install_date: form.install_date || null,
        last_repainted: form.last_repainted || null,
        repaint_cycle_months: form.repaint_cycle_months ? parseInt(form.repaint_cycle_months, 10) : null,
        next_due: nextDue,
        is_regulatory: form.is_regulatory,
        regulation_ref: form.regulation_ref || null,
        author_name: (form as any).author_name || null,
      };
      const query = editingMarking
        ? supabase.from("surface_markings").update(values).eq("id", editingMarking.id)
        : supabase.from("surface_markings").insert(values);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingMarking ? "노면표시 정보를 수정했습니다" : "노면표시가 등록되었습니다");
      queryClient.invalidateQueries({ queryKey: ["facility-markings"] });
      setDialogOpen(false);
      setEditingMarking(null);
      setForm({
        lot_id: "",
        marking_type: "",
        marking_name: "",
        location_detail: "",
        floor: "",
        quantity: "1",
        material: "",
        color: "",
        condition: "good",
        install_date: todayIso(),
        last_repainted: todayIso(),
        repaint_cycle_months: "",
        is_regulatory: false,
        regulation_ref: "",
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const selectedFormLot = useMemo(() => lots.find((lot: any) => lot.id === form.lot_id), [form.lot_id, lots]);
  const selectedLotProfile = useMemo(() => getParkingLotWorkProfile(selectedFormLot?.lot_type), [selectedFormLot?.lot_type]);

  const retireMutation = useMutation({
    mutationFn: async (marking: SurfaceMarking) => {
      const { error } = await supabase.from("surface_markings").update({ condition: "missing", condition_note: "철거 처리" }).eq("id", marking.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["facility-markings"] });
      setDetailOpen(false);
      toast.success("노면표시를 철거 상태로 변경했습니다");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editMarking = (marking: SurfaceMarking) => {
    setEditingMarking(marking);
    setSelectedLot(marking.lot_id);
    setForm({
      lot_id: marking.lot_id,
      marking_type: marking.marking_type,
      marking_name: marking.marking_name,
      location_detail: marking.location_detail || "",
      floor: marking.floor == null ? "" : String(marking.floor),
      quantity: String(marking.quantity || 1),
      material: marking.material || "",
      color: marking.color || "",
      condition: marking.condition,
      install_date: marking.install_date || "",
      last_repainted: marking.last_repainted || "",
      repaint_cycle_months: marking.repaint_cycle_months == null ? "" : String(marking.repaint_cycle_months),
      is_regulatory: marking.is_regulatory,
      regulation_ref: marking.regulation_ref || "",
    });
    setDetailOpen(false);
    setDialogOpen(true);
  };

  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * 86400000);
  const filteredMarkings = useMemo(() => {
    const conditionOrder: Record<MarkingCondition, number> = { missing: 0, damaged: 1, poor: 2, faded: 3, fair: 4, good: 5 };
    const query = search.trim().toLowerCase();
    const valueFor = (marking: SurfaceMarking, key: string): string | number | null => {
      if (key === "name") return marking.marking_name;
      if (key === "lot") return marking.parking_lots?.name || "";
      if (key === "type") return MARKING_TYPE_LABELS[marking.marking_type] || marking.marking_type;
      if (key === "condition") return conditionOrder[marking.condition];
      if (key === "last_repainted") return marking.last_repainted;
      if (key === "quantity") return marking.quantity || 0;
      return marking.next_due;
    };
    const matching = markings.filter((marking) => {
      if (selectedLot && marking.lot_id !== selectedLot) return false;
      if (lotTypeFilter !== "all" && marking.parking_lots?.lot_type !== lotTypeFilter) return false;
      if (typeFilter !== "all" && marking.marking_type !== typeFilter) return false;
      if (conditionFilter !== "all" && marking.condition !== conditionFilter) return false;
      return !query || [marking.marking_name, marking.location_detail, marking.parking_lots?.name, marking.regulation_ref].some((value) => String(value || "").toLowerCase().includes(query));
    });
    return stableMultiSort(matching, [
      ...(groupByLot ? [{ value: (marking: SurfaceMarking) => marking.parking_lots?.name, direction: "asc" as const }] : []),
      { value: (marking) => valueFor(marking, sortKey), direction: sortDirection },
      ...(secondarySortKey !== "none" && secondarySortKey !== sortKey ? [{ value: (marking: SurfaceMarking) => valueFor(marking, secondarySortKey), direction: "asc" as const }] : []),
    ], nullPlacement);
  }, [conditionFilter, groupByLot, lotTypeFilter, markings, nullPlacement, search, secondarySortKey, selectedLot, sortDirection, sortKey, typeFilter]);

  const markingGroups = useMemo(() => groupByLot
    ? Array.from(filteredMarkings.reduce((groups, marking) => {
        const key = marking.lot_id || "unassigned";
        const current = groups.get(key) || { key, label: marking.parking_lots?.name || "주차장 미지정", items: [] as SurfaceMarking[] };
        current.items.push(marking);
        groups.set(key, current);
        return groups;
      }, new Map<string, { key: string; label: string; items: SurfaceMarking[] }>()).values())
    : [{ key: "all", label: "", items: filteredMarkings }], [filteredMarkings, groupByLot]);

  const openMarkingDetail = (marking: SurfaceMarking) => {
    setSelectedMarkingId(marking.id);
    setDetailOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">노면표시/안내표지판</h1>
            {canCreate && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button onClick={() => { setEditingMarking(null); setForm({ lot_id: selectedLot, marking_type: "", marking_name: "", location_detail: "", floor: "", quantity: "1", material: "", color: "", condition: "good", install_date: todayIso(), last_repainted: todayIso(), repaint_cycle_months: "", is_regulatory: false, regulation_ref: "" }); }}><Plus className="mr-1 h-4 w-4" />등록</Button></DialogTrigger>
              <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
                <DialogHeader><DialogTitle>노면표시 {editingMarking ? "수정" : "등록"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>주차장 *</Label><FacilityLotCombobox lots={lots} value={form.lot_id} onValueChange={(value) => setForm((prev) => ({ ...prev, lot_id: value }))} /></div>
                  {form.lot_id && <div className="rounded-md border bg-muted/30 p-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{selectedLotProfile.label}</Badge><span className="text-xs text-muted-foreground">위치 기준: {selectedLotProfile.locationFields.map((field) => field.label).join(" · ")}</span></div></div>}
                  <div>
                    <Label>유형 *</Label>
                    <Select value={form.marking_type} onValueChange={(value) => setForm((prev) => ({ ...prev, marking_type: value }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>{Object.entries(MARKING_TYPE_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>명칭 *</Label><Input value={form.marking_name} onChange={(event) => setForm((prev) => ({ ...prev, marking_name: event.target.value }))} /></div>
                  <div className={selectedFormLot?.lot_type === "onstreet" ? "" : "grid grid-cols-2 gap-2"}>
                    <div><Label>위치 상세</Label><Input value={form.location_detail} onChange={(event) => setForm((prev) => ({ ...prev, location_detail: event.target.value }))} /></div>
                    {selectedFormLot?.lot_type !== "onstreet" && <div><Label>층</Label><Input type="number" value={form.floor} onChange={(event) => setForm((prev) => ({ ...prev, floor: event.target.value }))} /></div>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label>수량</Label><Input type="number" value={form.quantity} onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))} /></div>
                    <div><Label>재질</Label><Input value={form.material} onChange={(event) => setForm((prev) => ({ ...prev, material: event.target.value }))} /></div>
                    <div><Label>색상</Label><Input value={form.color} onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))} /></div>
                  </div>
                  <div>
                    <Label>상태</Label>
                    <Select value={form.condition} onValueChange={(value: MarkingCondition) => setForm((prev) => ({ ...prev, condition: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(CONDITION_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>설치일</Label><Input type="date" value={form.install_date} onChange={(event) => setForm((prev) => ({ ...prev, install_date: event.target.value }))} /></div>
                    <div><Label>최종 시공일</Label><Input type="date" value={form.last_repainted} onChange={(event) => setForm((prev) => ({ ...prev, last_repainted: event.target.value }))} /></div>
                  </div>
                  <div><Label>재시공 주기 (개월)</Label><Input type="number" value={form.repaint_cycle_months} onChange={(event) => setForm((prev) => ({ ...prev, repaint_cycle_months: event.target.value }))} /></div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_regulatory} onCheckedChange={(value) => setForm((prev) => ({ ...prev, is_regulatory: value }))} />
                    <Label>법적 의무 표시</Label>
                  </div>
                  {form.is_regulatory && <div><Label>관련 규정 *</Label><Input value={form.regulation_ref} onChange={(event) => setForm((prev) => ({ ...prev, regulation_ref: event.target.value }))} /></div>}
                  <AuthorField value={(form as any).author_name || ""} onChange={v => setForm(prev => ({ ...prev, author_name: v } as any))} />
                  <Button className="w-full" disabled={!form.lot_id || !form.marking_type || !form.marking_name || (form.is_regulatory && !form.regulation_ref.trim()) || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                    {saveMutation.isPending ? "저장 중..." : editingMarking ? "수정 저장" : "등록"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>}
        </div>

        <div className="flex justify-end"><Select value={lotTypeFilter} onValueChange={setLotTypeFilter}><SelectTrigger aria-label="주차장 형태 필터" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 주차장 형태</SelectItem>{Object.entries(LOT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>

        <OperationalListControls
          search={search} onSearchChange={setSearch} searchPlaceholder="명칭, 위치, 규정 검색"
          lots={lots.map((lot: { id: string; name: string; code: string }) => ({ value: lot.id, label: `${lot.name} (${lot.code})` }))} lotId={selectedLot || "all"} onLotChange={(value) => setSelectedLot(value === "all" ? "" : value)}
          categoryLabel="전체 유형" categories={Object.entries(MARKING_TYPE_LABELS).map(([value, label]) => ({ value, label }))} category={typeFilter} onCategoryChange={setTypeFilter}
          statuses={Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label }))} status={conditionFilter} onStatusChange={setConditionFilter}
          sortOptions={[{ value: "next_due", label: "재시공예정일순" }, { value: "last_repainted", label: "최종시공일순" }, { value: "condition", label: "상태 위험순" }, { value: "lot", label: "주차장순" }, { value: "type", label: "유형순" }, { value: "name", label: "명칭순" }, { value: "quantity", label: "수량순" }]}
          sortKey={sortKey} onSortKeyChange={setSortKey} sortDirection={sortDirection} onSortDirectionChange={setSortDirection}
          secondarySortKey={secondarySortKey} onSecondarySortKeyChange={setSecondarySortKey} nullPlacement={nullPlacement} onNullPlacementChange={setNullPlacement}
          groupByLot={groupByLot} onGroupByLotChange={setGroupByLot} resultCount={filteredMarkings.length} totalCount={markings.length}
          onReset={() => { setSearch(""); setSelectedLot(""); setLotTypeFilter("all"); setTypeFilter("all"); setConditionFilter("all"); setSortKey("next_due"); setSortDirection("asc"); setSecondarySortKey("condition"); setNullPlacement("last"); setGroupByLot(false); }}
        />

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>주차장</TableHead><TableHead>유형</TableHead><TableHead>명칭</TableHead><TableHead>위치</TableHead>
                    <TableHead>상태</TableHead><TableHead>최종시공</TableHead><TableHead>재시공예정</TableHead><TableHead>법적</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {markingGroups.map((group) => <Fragment key={group.key}>
                    {groupByLot && <TableRow className="bg-muted/60 hover:bg-muted/60"><TableCell colSpan={8} className="py-2 font-semibold">{group.label}<Badge variant="secondary" className="ml-2">{group.items.length}건</Badge></TableCell></TableRow>}
                    {group.items.map((marking) => {
                    const isDueSoon = !!(marking.next_due && new Date(marking.next_due) <= in30);
                    return (
                      <TableRow key={marking.id} className={`cursor-pointer hover:bg-muted/40 ${isDueSoon ? "border-l-2 border-l-amber-400" : ""}`} onClick={() => openMarkingDetail(marking)}>
                        <TableCell><div>{marking.parking_lots?.name || "-"}</div>{marking.parking_lots?.lot_type && <Badge variant="secondary" className="mt-1 text-[9px]">{LOT_TYPE_LABELS[marking.parking_lots.lot_type as LotType]}</Badge>}</TableCell>
                        <TableCell><Badge variant="outline">{MARKING_TYPE_LABELS[marking.marking_type] || marking.marking_type}</Badge></TableCell>
                        <TableCell className="font-medium">{marking.marking_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{marking.location_detail || "-"}</TableCell>
                        <TableCell><Badge className={CONDITION_COLORS[marking.condition]}>{CONDITION_LABELS[marking.condition]}</Badge></TableCell>
                        <TableCell className="text-sm">{marking.last_repainted || "-"}</TableCell>
                        <TableCell className={isDueSoon ? "text-sm font-medium text-amber-700" : "text-sm"}>
                          {marking.next_due || "-"}
                          {isDueSoon && marking.next_due && <Badge variant="destructive" className="ml-1 text-xs">{formatFacilityRelativeDay(marking.next_due, today)}</Badge>}
                        </TableCell>
                        <TableCell>{marking.is_regulatory ? <Star className="h-4 w-4" /> : "-"}</TableCell>
                      </TableRow>
                    );
                    })}
                  </Fragment>)}
                  {filteredMarkings.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">{isLoading ? "로딩 중..." : "조건에 맞는 노면표시가 없습니다"}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
      </div>

      <SurfaceMarkingDetailSheet marking={selectedMarking} open={detailOpen} onOpenChange={setDetailOpen} onEdit={canEdit ? editMarking : undefined} onRetire={canEdit ? (marking) => retireMutation.mutate(marking) : undefined} />
    </DashboardLayout>
  );
}
