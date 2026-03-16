import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatFacilityDate } from "@/lib/facility-format";
import type { ChecklistItem, SafetyInspection } from "@/types/facility";
import { GRADE_COLORS, INSPECTION_TYPE_LABELS } from "@/types/facility";

interface SafetyInspectionDetailSheetProps {
  inspection: SafetyInspection | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function SafetyInspectionDetailSheet({ inspection, onOpenChange, open }: SafetyInspectionDetailSheetProps) {
  const isMobile = useIsMobile();

  if (!inspection) return null;

  const checklistItems = Array.isArray(inspection.checklist_results) ? (inspection.checklist_results as ChecklistItem[]) : [];
  const checklistByCategory = checklistItems.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{INSPECTION_TYPE_LABELS[inspection.inspection_type] || inspection.inspection_type}</Badge>
            <Badge className={GRADE_COLORS[inspection.overall_grade || ""] || ""}>{inspection.overall_grade || "-"}</Badge>
            <Badge variant={inspection.follow_up_required ? "destructive" : "secondary"}>
              {inspection.follow_up_required ? "시정 필요" : "시정 불필요"}
            </Badge>
          </div>
          <SheetTitle className="pt-3 text-xl">{inspection.inspection_number}</SheetTitle>
          <SheetDescription>
            {inspection.parking_lots?.name || "주차장 정보 없음"} · {formatFacilityDate(inspection.inspection_date)}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="grid grid-cols-2 gap-3">
            <InfoCard label="점검자" value={inspection.inspector_name || "-"} />
            <InfoCard label="소속기관" value={inspection.inspector_org || "-"} />
            <InfoCard label="합격 항목" value={`${inspection.pass_items}건`} />
            <InfoCard label="불합격 항목" value={`${inspection.fail_items}건`} />
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">시정 조치</h3>
            <div className="mt-4 space-y-3 text-sm text-foreground">
              <DetailBlock label="발견 문제" value={inspection.issues_found || "-"} />
              <DetailBlock label="시정 계획" value={inspection.corrective_actions || "-"} />
              <DetailBlock label="시정 기한" value={formatFacilityDate(inspection.correction_deadline)} />
              <DetailBlock label="후속 점검일" value={formatFacilityDate(inspection.follow_up_date)} />
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">체크리스트 결과</h3>
            <div className="mt-4 space-y-4">
              {Object.entries(checklistByCategory).map(([category, items]) => (
                <div key={category} className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-sm font-semibold text-foreground">{category}</p>
                  <ul className="mt-3 space-y-2">
                    {items.map((item, index) => (
                      <li key={`${item.item}-${index}`} className="flex items-start justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium text-foreground">{item.item}</p>
                          <p className="text-xs text-muted-foreground">{item.note || "메모 없음"}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={item.result === "fail" ? "destructive" : item.result === "pass" ? "default" : "outline"}>
                            {item.result === "pass" ? "합격" : item.result === "fail" ? "불합격" : "해당없음"}
                          </Badge>
                          {item.severity && <span className="text-xs text-muted-foreground">심각도 {item.severity}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/30 px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{value}</p>
    </div>
  );
}
