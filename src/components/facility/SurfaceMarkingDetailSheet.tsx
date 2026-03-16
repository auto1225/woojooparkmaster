import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatFacilityCurrency, formatFacilityDate, formatFacilityNumber } from "@/lib/facility-format";
import type { SurfaceMarking } from "@/types/facility";
import { CONDITION_COLORS, CONDITION_LABELS, MARKING_TYPE_LABELS } from "@/types/facility";

interface SurfaceMarkingDetailSheetProps {
  marking: SurfaceMarking | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function SurfaceMarkingDetailSheet({ marking, onOpenChange, open }: SurfaceMarkingDetailSheetProps) {
  const isMobile = useIsMobile();

  if (!marking) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{MARKING_TYPE_LABELS[marking.marking_type] || marking.marking_type}</Badge>
            <Badge className={CONDITION_COLORS[marking.condition]}>{CONDITION_LABELS[marking.condition]}</Badge>
            <Badge variant={marking.is_regulatory ? "destructive" : "secondary"}>
              {marking.is_regulatory ? "법정 표시" : "일반 표시"}
            </Badge>
          </div>
          <SheetTitle className="pt-3 text-xl">{marking.marking_name}</SheetTitle>
          <SheetDescription>{marking.parking_lots?.name || "주차장 정보 없음"}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="grid grid-cols-2 gap-3">
            <InfoCard label="수량" value={formatFacilityNumber(marking.quantity, "개")} />
            <InfoCard label="층" value={marking.floor != null ? `${marking.floor}층` : "-"} />
            <InfoCard label="재질" value={marking.material || "-"} />
            <InfoCard label="색상" value={marking.color || "-"} />
            <InfoCard label="위치" value={marking.location_detail || "-"} />
            <InfoCard label="예상 비용" value={formatFacilityCurrency(marking.estimated_cost)} />
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">도색 주기</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <DetailRow label="설치일" value={formatFacilityDate(marking.install_date)} />
              <DetailRow label="최종 시공일" value={formatFacilityDate(marking.last_repainted)} />
              <DetailRow label="재시공 주기" value={formatFacilityNumber(marking.repaint_cycle_months, "개월")} />
              <DetailRow label="재시공 예정일" value={formatFacilityDate(marking.next_due)} />
            </dl>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">관리 메모</h3>
            <div className="mt-4 space-y-3 text-sm">
              <DetailBlock label="규정 기준" value={marking.regulation_ref || "-"} />
              <DetailBlock label="상태 메모" value={marking.condition_note || "-"} />
              <DetailBlock label="비고" value={marking.notes || "-"} />
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/30 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
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
