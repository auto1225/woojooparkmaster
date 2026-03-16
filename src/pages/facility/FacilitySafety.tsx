import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, AlertTriangle } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { toast } from "sonner";
import { INSPECTION_TYPE_LABELS, GRADE_COLORS } from "@/types/facility";
import type { SafetyInspection, ChecklistItem } from "@/types/facility";
import { SafetyInspectionDetailSheet } from "@/components/facility/SafetyInspectionDetailSheet";

const CHECKLIST_TEMPLATE: { category: string; items: string[] }[] = [
  { category: "구조안전", items: ["바닥 균열/파손", "벽체 균열", "기둥 상태", "천장(복층화)", "배수시설"] },
  { category: "전기안전", items: ["조명 작동", "배전반", "접지", "누전차단기"] },
  { category: "소방안전", items: ["소화기 비치/유효기한", "소방통로", "화재감지기", "비상등"] },
  { category: "교통안전", items: ["차단기 작동", "과속방지턱", "높이제한", "안내표지", "노면표시 가시성"] },
  { category: "이용편의", items: ["장애인 시설", "보행자 안전", "안내판 가독성"] },
];

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
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);

  const { data: lots = [] } = useQuery({
    queryKey: ["parking-lots-select"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name").order("name");
      return data ?? [];
    },
  });

  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ["facility-safety"],
    queryFn: async () => {
      const { data } = await supabase
        .from("safety_inspections")
        .select("*, parking_lots(code, name)")
        .order("inspection_date", { ascending: false });
      return (data ?? []) as unknown as SafetyInspection[];
    },
  });

  const selectedInspection = useMemo(
    () => inspections.find((inspection) => inspection.id === selectedInspectionId) ?? null,
    [inspections, selectedInspectionId],
  );

  const initChecklist = (): ChecklistItem[] =>
    CHECKLIST_TEMPLATE.flatMap((category) =>
      category.items.map((item) => ({ category: category.category, item, result: "pass" as const, severity: undefined, note: "" })),
    );

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
  const [checklist, setChecklist] = useState<ChecklistItem[]>(initChecklist());

  const updateCheckItem = (index: number, field: keyof ChecklistItem, value: string) => {
    setChecklist((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  };

  const passCount = checklist.filter((item) => item.result === "pass").length;
  const failCount = checklist.filter((item) => item.result === "fail").length;
  const naCount = checklist.filter((item) => item.result === "na").length;
  const grade = calculateGrade(checklist);

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
      setChecklist(initChecklist());
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openInspectionDetail = (inspection: SafetyInspection) => {
    setSelectedInspectionId(inspection.id);
    setDetailOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">안전점검</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />점검 등록</Button></DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
              <DialogHeader><DialogTitle>안전점검 실시</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>주차장 *</Label>
                    <Select value={form.lot_id} onValueChange={(value) => setForm((prev) => ({ ...prev, lot_id: value }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>{lots.map((lot: { id: string; name: string }) => <SelectItem key={lot.id} value={lot.id}>{lot.name}</SelectItem>)}</SelectContent>
                    </Select>
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

                <Accordion type="multiple" defaultValue={CHECKLIST_TEMPLATE.map((category) => category.category)} className="w-full">
                  {CHECKLIST_TEMPLATE.map((category) => (
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

                {failCount > 0 && (
                  <>
                    <div><Label>발견 문제사항</Label><Textarea value={form.issues_found} onChange={(event) => setForm((prev) => ({ ...prev, issues_found: event.target.value }))} rows={2} /></div>
                    <div><Label>시정조치 계획</Label><Textarea value={form.corrective_actions} onChange={(event) => setForm((prev) => ({ ...prev, corrective_actions: event.target.value }))} rows={2} /></div>
                    <div><Label>시정 기한</Label><Input type="date" value={form.correction_deadline} onChange={(event) => setForm((prev) => ({ ...prev, correction_deadline: event.target.value }))} /></div>
                  </>
                )}

                <Button className="w-full" disabled={!form.lot_id || createMutation.isPending} onClick={() => createMutation.mutate()}>
                  {createMutation.isPending ? "등록 중..." : "점검 결과 저장"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
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
                {inspections.map((inspection) => (
                  <TableRow key={inspection.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openInspectionDetail(inspection)}>
                    <TableCell className="font-mono text-xs">{inspection.inspection_number}</TableCell>
                    <TableCell>{inspection.parking_lots?.name || "-"}</TableCell>
                    <TableCell><Badge variant="outline">{INSPECTION_TYPE_LABELS[inspection.inspection_type] || inspection.inspection_type}</Badge></TableCell>
                    <TableCell>{inspection.inspection_date}</TableCell>
                    <TableCell>{inspection.inspector_name || "-"}</TableCell>
                    <TableCell className="text-center font-medium">{inspection.pass_items}</TableCell>
                    <TableCell className="text-center font-medium">{inspection.fail_items}</TableCell>
                    <TableCell><Badge className={GRADE_COLORS[inspection.overall_grade || ""] || ""}>{inspection.overall_grade || "-"}</Badge></TableCell>
                    <TableCell>{inspection.follow_up_required ? <AlertTriangle className="h-4 w-4" /> : "-"}</TableCell>
                    <TableCell><Badge variant="outline">{inspection.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {inspections.length === 0 && <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">{isLoading ? "로딩 중..." : "안전점검 기록이 없습니다"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <SafetyInspectionDetailSheet inspection={selectedInspection} open={detailOpen} onOpenChange={setDetailOpen} />
    </DashboardLayout>
  );
}
