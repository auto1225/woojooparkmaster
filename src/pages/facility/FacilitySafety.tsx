import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, MapPin } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { toast } from "sonner";
import { INSPECTION_TYPE_LABELS, GRADE_COLORS } from "@/types/facility";
import type { SafetyInspection, ChecklistItem } from "@/types/facility";
import { SafetyInspectionDetailSheet } from "@/components/facility/SafetyInspectionDetailSheet";
import { OperationalListControls } from "@/components/common/OperationalListControls";
import { stableMultiSort, type NullPlacement } from "@/lib/list-sorting";
import { createSafetyCorrectiveWorkOrder } from "@/lib/facility-field-work";
import { useAuthorization } from "@/hooks/useAuthorization";
import { FacilityLotCombobox } from "@/components/facility/FacilityLotCombobox";
import { createChecklistForLotType, getParkingLotWorkProfile } from "@/lib/parking-lot-work-profile";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";

function calculateGrade(items: ChecklistItem[]): string {
  const fails = items.filter((item) => item.result === "fail");
  if (fails.some((item) => item.severity === "high")) return "F";
  if (fails.length >= 5) return "D";
  if (fails.length >= 3 || fails.some((item) => item.severity === "medium")) return "C";
  if (fails.length >= 1) return "B";
  return "A";
}

export default function FacilitySafety() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const { canCreate } = useAuthorization("FACILITY");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(() => Boolean(searchParams.get("inspection")));
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(() => searchParams.get("inspection"));
  const [creatingItemKey, setCreatingItemKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [lotFilter, setLotFilter] = useState("all");
  const [lotTypeFilter, setLotTypeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const [sortKey, setSortKey] = useState("inspection_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [secondarySortKey, setSecondarySortKey] = useState("grade");
  const [nullPlacement, setNullPlacement] = useState<NullPlacement>("last");
  const [groupByLot, setGroupByLot] = useState(false);
  const [checklistConfirmed, setChecklistConfirmed] = useState(false);

  const defaultCorrectionDeadline = () => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return date.toISOString().slice(0, 10);
  };

  const { data: lots = [] } = useQuery({
    queryKey: ["parking-lots-select", "with-type"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name, lot_type").order("name");
      return data ?? [];
    },
  });

  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ["facility-safety"],
    queryFn: async () => {
      const { data } = await supabase
        .from("safety_inspections")
        .select("*, parking_lots(code, name, lot_type)")
        .order("inspection_date", { ascending: false });
      return (data ?? []) as unknown as SafetyInspection[];
    },
  });

  const selectedInspection = useMemo(
    () => inspections.find((inspection) => inspection.id === selectedInspectionId) ?? null,
    [inspections, selectedInspectionId],
  );

  useEffect(() => {
    const requested = searchParams.get("inspection");
    if (requested && inspections.some((inspection) => inspection.id === requested)) {
      setSelectedInspectionId(requested);
      setDetailOpen(true);
    }
  }, [inspections, searchParams]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (detailOpen && selectedInspectionId) next.set("inspection", selectedInspectionId);
    else next.delete("inspection");
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [detailOpen, searchParams, selectedInspectionId, setSearchParams]);

  const filteredInspections = useMemo(() => {
    const query = search.trim().toLowerCase();
    const valueFor = (inspection: SafetyInspection, key: string): string | number | null => {
      if (key === "lot") return inspection.parking_lots?.name || "";
      if (key === "type") return INSPECTION_TYPE_LABELS[inspection.inspection_type] || inspection.inspection_type;
      if (key === "grade") return inspection.overall_grade;
      if (key === "fail_items") return inspection.fail_items || 0;
      if (key === "correction_deadline") return inspection.correction_deadline;
      return inspection.inspection_date || "";
    };
    const matching = inspections.filter((inspection) => {
      if (lotFilter !== "all" && inspection.lot_id !== lotFilter) return false;
      if (lotTypeFilter !== "all" && inspection.parking_lots?.lot_type !== lotTypeFilter) return false;
      if (typeFilter !== "all" && inspection.inspection_type !== typeFilter) return false;
      if (followUpFilter === "required" && !inspection.follow_up_required) return false;
      if (followUpFilter === "clear" && inspection.follow_up_required) return false;
      return !query || [inspection.inspection_number, inspection.parking_lots?.name, inspection.inspector_name, inspection.issues_found].some((value) => String(value || "").toLowerCase().includes(query));
    });
    return stableMultiSort(matching, [
      ...(groupByLot ? [{ value: (inspection: SafetyInspection) => inspection.parking_lots?.name, direction: "asc" as const }] : []),
      { value: (inspection) => valueFor(inspection, sortKey), direction: sortDirection },
      ...(secondarySortKey !== "none" && secondarySortKey !== sortKey ? [{ value: (inspection: SafetyInspection) => valueFor(inspection, secondarySortKey), direction: "asc" as const }] : []),
    ], nullPlacement);
  }, [followUpFilter, groupByLot, inspections, lotFilter, lotTypeFilter, nullPlacement, search, secondarySortKey, sortDirection, sortKey, typeFilter]);

  const inspectionGroups = useMemo(() => groupByLot
    ? Array.from(filteredInspections.reduce((groups, inspection) => {
        const key = inspection.lot_id || "unassigned";
        const current = groups.get(key) || { key, label: inspection.parking_lots?.name || "주차장 미지정", items: [] as SafetyInspection[] };
        current.items.push(inspection);
        groups.set(key, current);
        return groups;
      }, new Map<string, { key: string; label: string; items: SafetyInspection[] }>()).values())
    : [{ key: "all", label: "", items: filteredInspections }], [filteredInspections, groupByLot]);

  const [form, setForm] = useState({
    lot_id: "",
    inspection_type: "monthly",
    inspection_date: new Date().toISOString().split("T")[0],
    inspector_name: "",
    inspector_org: "",
    issues_found: "",
    corrective_actions: "",
    correction_deadline: "",
  });
  const [checklist, setChecklist] = useState<ChecklistItem[]>(createChecklistForLotType("offstreet"));
  const selectedLot = useMemo(() => lots.find((lot: any) => lot.id === form.lot_id), [form.lot_id, lots]);
  const selectedProfile = useMemo(() => getParkingLotWorkProfile(selectedLot?.lot_type), [selectedLot?.lot_type]);

  const updateCheckItem = (index: number, field: keyof ChecklistItem, value: string) => {
    setChecklist((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
    if (field === "result" && value === "fail") {
      setForm((prev) => ({ ...prev, correction_deadline: prev.correction_deadline || defaultCorrectionDeadline() }));
    }
  };

  const markAllPassed = () => {
    setChecklist((current) => current.map((item) => ({ ...item, result: "pass", severity: undefined })));
    setChecklistConfirmed(true);
  };

  useEffect(() => {
    if (!dialogOpen) return;
    setForm((current) => ({
      ...current,
      inspector_name: current.inspector_name || profile?.name || "",
      inspector_org: current.inspector_org || "제주시청 차량관리과 운영팀",
    }));
  }, [dialogOpen, profile?.name]);

  const passCount = checklist.filter((item) => item.result === "pass").length;
  const failCount = checklist.filter((item) => item.result === "fail").length;
  const naCount = checklist.filter((item) => item.result === "na").length;
  const grade = calculateGrade(checklist);
  const failedItemsComplete = failCount === 0 || (
    checklist.filter((item) => item.result === "fail").every((item) => Boolean(item.severity))
    && Boolean(form.issues_found.trim())
    && Boolean(form.corrective_actions.trim())
    && Boolean(form.correction_deadline)
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const number = `SI-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`;
      const payload: any = {
        inspection_number: number,
        lot_id: form.lot_id,
        inspection_type: form.inspection_type,
        inspection_date: form.inspection_date,
        inspector_name: form.inspector_name || null,
        inspector_org: form.inspector_org || null,
        checklist_results: checklist,
        total_items: checklist.length,
        pass_items: passCount,
        fail_items: failCount,
        na_items: naCount,
        overall_grade: grade,
        issues_found: form.issues_found || null,
        corrective_actions: form.corrective_actions || null,
        correction_deadline: form.correction_deadline || null,
        follow_up_required: failCount > 0,
        status: "completed",
        created_by: user?.id,
        author_name: (form as any).author_name || null,
      };

      const { error } = await supabase.from("safety_inspections").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("안전점검이 등록되었습니다");
      queryClient.invalidateQueries({ queryKey: ["facility-safety"] });
      setDialogOpen(false);
      setForm({
        lot_id: "",
        inspection_type: "monthly",
        inspection_date: new Date().toISOString().split("T")[0],
        inspector_name: "",
        inspector_org: "",
        issues_found: "",
        corrective_actions: "",
        correction_deadline: "",
      });
      setChecklist(createChecklistForLotType("offstreet"));
      setChecklistConfirmed(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const correctiveWorkMutation = useMutation({
    mutationFn: async ({ item, itemIndex }: { item: ChecklistItem; itemIndex: number }) => {
      if (!selectedInspection || !user?.id) throw new Error("점검 또는 사용자 정보를 확인할 수 없습니다");
      return createSafetyCorrectiveWorkOrder(selectedInspection, item, itemIndex, user.id);
    },
    onMutate: ({ item }) => setCreatingItemKey(`${item.category}:${item.item}`),
    onSuccess: async (work) => {
      await queryClient.invalidateQueries({ queryKey: ["facility-maint-logs"] });
      toast.success("불합격 항목에서 시정 작업을 생성했습니다");
      navigate(`/facility/maintenance?work=${work.id}`);
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setCreatingItemKey(null),
  });

  const openInspectionDetail = (inspection: SafetyInspection) => {
    setSelectedInspectionId(inspection.id);
    setDetailOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">안전점검</h1>
          {canCreate && <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setChecklistConfirmed(false); }}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />점검 등록</Button></DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
              <DialogHeader><DialogTitle>안전점검 실시</DialogTitle><DialogDescription>전체 합격으로 시작한 뒤 이상이 있는 항목만 불합격 또는 해당없음으로 변경합니다.</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>주차장 *</Label>
                    <FacilityLotCombobox lots={lots} value={form.lot_id} onValueChange={(value) => {
                      const lot = lots.find((item: any) => item.id === value);
                       setForm((prev) => ({ ...prev, lot_id: value }));
                       setChecklist(createChecklistForLotType(lot?.lot_type));
                       setChecklistConfirmed(false);
                    }} />
                  </div>
                  <div>
                    <Label>점검 유형</Label>
                    <Select value={form.inspection_type} onValueChange={(value) => setForm((prev) => ({ ...prev, inspection_type: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(INSPECTION_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>점검일</Label><Input type="date" value={form.inspection_date} onChange={(event) => setForm((prev) => ({ ...prev, inspection_date: event.target.value }))} /></div>
                  <div><Label>점검자</Label><Input value={form.inspector_name} onChange={(event) => setForm((prev) => ({ ...prev, inspector_name: event.target.value }))} /></div>
                  <div><Label>소속기관</Label><Input value={form.inspector_org} onChange={(event) => setForm((prev) => ({ ...prev, inspector_org: event.target.value }))} /></div>
                </div>

                {form.lot_id ? <>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{selectedProfile.label}</Badge>
                      <span className="text-sm font-medium">유형별 현장점검 {checklist.length}개 항목</span>
                      <Button type="button" size="sm" className="ml-auto" variant={checklistConfirmed && failCount === 0 && naCount === 0 ? "secondary" : "default"} onClick={markAllPassed}>
                        <CheckCircle2 className="mr-1 h-4 w-4" />전체 합격
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{selectedProfile.workFocus}</p>
                    {!checklistConfirmed && <p className="mt-2 text-xs font-medium text-amber-700">현장 확인 후 전체 합격을 누르거나 이상 항목의 판정을 변경하세요.</p>}
                  </div>

                <Accordion key={selectedProfile.type} type="multiple" className="w-full">
                  {selectedProfile.checklist.map((category) => (
                    <AccordionItem key={category.category} value={category.category}>
                      <AccordionTrigger className="text-sm font-medium">{category.category} ({category.items.length}개)</AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {category.items.map((itemName) => {
                            const index = checklist.findIndex((item) => item.category === category.category && item.item === itemName);
                            const item = checklist[index];
                            return (
                              <div key={itemName} className="rounded-md bg-muted/30 p-2">
                                <div className="mb-1 flex items-center gap-3">
                                  <span className="flex-1 text-sm">{itemName}</span>
                                  <RadioGroup value={item.result} onValueChange={(value) => updateCheckItem(index, "result", value)} className="flex gap-3">
                                    <div className="flex items-center gap-1"><RadioGroupItem value="pass" id={`p-${index}`} /><Label htmlFor={`p-${index}`} className="text-xs">합격</Label></div>
                                    <div className="flex items-center gap-1"><RadioGroupItem value="fail" id={`f-${index}`} /><Label htmlFor={`f-${index}`} className="text-xs">불합격</Label></div>
                                    <div className="flex items-center gap-1"><RadioGroupItem value="na" id={`n-${index}`} /><Label htmlFor={`n-${index}`} className="text-xs">해당없음</Label></div>
                                  </RadioGroup>
                                </div>
                                {item.result === "fail" && (
                                  <div className="mt-1">
                                    <Select value={item.severity || ""} onValueChange={(value) => updateCheckItem(index, "severity", value)}>
                                      <SelectTrigger className="h-7 w-24 text-xs"><SelectValue placeholder="심각도" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="low">낮음</SelectItem>
                                        <SelectItem value="medium">중간</SelectItem>
                                        <SelectItem value="high">높음</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-4 text-sm">
                      <span>합격: <strong>{passCount}</strong></span>
                      <span>불합격: <strong>{failCount}</strong></span>
                      <span>해당없음: <strong>{naCount}</strong></span>
                      <span className="ml-auto">종합등급: <Badge className={GRADE_COLORS[grade] || ""}>{grade}</Badge></span>
                    </div>
                  </CardContent>
                </Card>
                </> : <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">주차장을 선택하면 형태에 맞는 현장점검표가 표시됩니다.</div>}

                {failCount > 0 && (
                  <>
                    <div><Label>발견 문제사항 *</Label><Textarea value={form.issues_found} onChange={(event) => setForm((prev) => ({ ...prev, issues_found: event.target.value }))} rows={2} /></div>
                    <div><Label>시정조치 계획 *</Label><Textarea value={form.corrective_actions} onChange={(event) => setForm((prev) => ({ ...prev, corrective_actions: event.target.value }))} rows={2} /></div>
                    <div><Label>시정 기한 *</Label><Input type="date" value={form.correction_deadline} onChange={(event) => setForm((prev) => ({ ...prev, correction_deadline: event.target.value }))} /></div>
                  </>
                )}

                <AuthorField value={(form as any).author_name || ""} onChange={v => setForm(prev => ({ ...prev, author_name: v } as any))} />
                <Button className="w-full" disabled={!form.lot_id || !checklistConfirmed || !failedItemsComplete || createMutation.isPending} onClick={() => createMutation.mutate()}>
                  {createMutation.isPending ? "등록 중..." : "점검 결과 저장"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>}
        </div>

        <div className="flex justify-end">
          <Select value={lotTypeFilter} onValueChange={setLotTypeFilter}>
            <SelectTrigger aria-label="주차장 형태 필터" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 주차장 형태</SelectItem>
              {Object.entries(LOT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <OperationalListControls
          search={search} onSearchChange={setSearch} searchPlaceholder="점검번호, 점검자, 문제사항 검색"
          lots={lots.map((lot: { id: string; name: string; code: string }) => ({ value: lot.id, label: `${lot.name} (${lot.code})` }))} lotId={lotFilter} onLotChange={setLotFilter}
          categoryLabel="전체 점검유형" categories={Object.entries(INSPECTION_TYPE_LABELS).map(([value, label]) => ({ value, label }))} category={typeFilter} onCategoryChange={setTypeFilter}
          statusLabel="전체 시정상태" statuses={[{ value: "required", label: "시정 필요" }, { value: "clear", label: "시정 없음" }]} status={followUpFilter} onStatusChange={setFollowUpFilter}
          sortOptions={[{ value: "inspection_date", label: "점검일순" }, { value: "lot", label: "주차장순" }, { value: "type", label: "점검유형순" }, { value: "grade", label: "등급순" }, { value: "fail_items", label: "불합격수순" }, { value: "correction_deadline", label: "시정기한순" }]}
          sortKey={sortKey} onSortKeyChange={setSortKey} sortDirection={sortDirection} onSortDirectionChange={setSortDirection}
          secondarySortKey={secondarySortKey} onSecondarySortKeyChange={setSecondarySortKey} nullPlacement={nullPlacement} onNullPlacementChange={setNullPlacement}
          groupByLot={groupByLot} onGroupByLotChange={setGroupByLot} resultCount={filteredInspections.length} totalCount={inspections.length}
          onReset={() => { setSearch(""); setLotFilter("all"); setLotTypeFilter("all"); setTypeFilter("all"); setFollowUpFilter("all"); setSortKey("inspection_date"); setSortDirection("desc"); setSecondarySortKey("grade"); setNullPlacement("last"); setGroupByLot(false); }}
        />

        <div className="space-y-2 md:hidden">
          {filteredInspections.map((inspection) => (
            <Card key={inspection.id} className="cursor-pointer" onClick={() => openInspectionDetail(inspection)}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-muted-foreground">{inspection.inspection_number}</p>
                    <p className="mt-1 truncate text-sm font-semibold">{inspection.parking_lots?.name || "주차장 미지정"}</p>
                    {inspection.parking_lots?.lot_type && <Badge variant="secondary" className="mt-1 text-[10px]">{LOT_TYPE_LABELS[inspection.parking_lots.lot_type as LotType]}</Badge>}
                  </div>
                  <Badge className={GRADE_COLORS[inspection.overall_grade || ""] || ""}>{inspection.overall_grade || "-"}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{INSPECTION_TYPE_LABELS[inspection.inspection_type] || inspection.inspection_type}</span>
                  <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{inspection.inspection_date}</span>
                  <span className="flex items-center gap-1"><ClipboardCheck className="h-3.5 w-3.5" />불합격 {inspection.fail_items || 0}건</span>
                  <span><Badge variant={inspection.follow_up_required ? "destructive" : "secondary"}>{inspection.follow_up_required ? "시정 필요" : "이상 없음"}</Badge></span>
                </div>
                <div className="flex justify-end border-t pt-2"><Button size="icon" variant="ghost" title="점검 상세"><ChevronRight className="h-4 w-4" /></Button></div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="hidden md:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>점검번호</TableHead><TableHead>주차장</TableHead><TableHead>유형</TableHead>
                  <TableHead>점검일</TableHead><TableHead>점검자</TableHead>
                  <TableHead className="text-center">합격</TableHead><TableHead className="text-center">불합격</TableHead>
                  <TableHead>등급</TableHead><TableHead>시정필요</TableHead><TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspectionGroups.map((group) => <Fragment key={group.key}>
                  {groupByLot && <TableRow className="bg-muted/60 hover:bg-muted/60"><TableCell colSpan={10} className="py-2 font-semibold">{group.label}<Badge variant="secondary" className="ml-2">{group.items.length}건</Badge></TableCell></TableRow>}
                  {group.items.map((inspection) => (
                  <TableRow key={inspection.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openInspectionDetail(inspection)}>
                    <TableCell className="font-mono text-xs">{inspection.inspection_number}</TableCell>
                    <TableCell><div>{inspection.parking_lots?.name || "-"}</div>{inspection.parking_lots?.lot_type && <Badge variant="secondary" className="mt-1 text-[10px]">{LOT_TYPE_LABELS[inspection.parking_lots.lot_type as LotType]}</Badge>}</TableCell>
                    <TableCell><Badge variant="outline">{INSPECTION_TYPE_LABELS[inspection.inspection_type] || inspection.inspection_type}</Badge></TableCell>
                    <TableCell>{inspection.inspection_date}</TableCell>
                    <TableCell>{inspection.inspector_name || "-"}</TableCell>
                    <TableCell className="text-center font-medium">{inspection.pass_items}</TableCell>
                    <TableCell className="text-center font-medium">{inspection.fail_items}</TableCell>
                    <TableCell><Badge className={GRADE_COLORS[inspection.overall_grade || ""] || ""}>{inspection.overall_grade || "-"}</Badge></TableCell>
                    <TableCell>{inspection.follow_up_required ? <AlertTriangle className="h-4 w-4" /> : "-"}</TableCell>
                    <TableCell><Badge variant="outline">{inspection.follow_up_required ? "시정조치 필요" : "점검완료"}</Badge></TableCell>
                  </TableRow>
                  ))}
                </Fragment>)}
                {filteredInspections.length === 0 && <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">{isLoading ? "로딩 중..." : "조건에 맞는 안전점검 기록이 없습니다"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <SafetyInspectionDetailSheet
        inspection={selectedInspection}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        creatingItemKey={creatingItemKey}
        onCreateCorrectiveWork={canCreate ? (item, itemIndex) => correctiveWorkMutation.mutate({ item, itemIndex }) : undefined}
      />
    </DashboardLayout>
  );
}
