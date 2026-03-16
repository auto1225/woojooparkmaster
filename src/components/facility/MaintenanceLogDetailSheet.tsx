import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatFacilityCurrency, formatFacilityDateTime, formatFacilityNumber } from "@/lib/facility-format";
import type { MaintenanceLog } from "@/types/facility";
import { MAINT_STATUS_LABELS, MAINT_TYPE_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from "@/types/facility";

interface MaintenanceLogDetailSheetProps {
  log: MaintenanceLog | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function MaintenanceLogDetailSheet({ log, onOpenChange, open }: MaintenanceLogDetailSheetProps) {
  const isMobile = useIsMobile();

  if (!log) return null;

  const parts = Array.isArray(log.parts_used) ? log.parts_used : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={PRIORITY_COLORS[log.priority]}>{PRIORITY_LABELS[log.priority]}</Badge>
            <Badge variant="outline">{MAINT_TYPE_LABELS[log.maintenance_type] || log.maintenance_type}</Badge>
            <Badge variant="secondary">{MAINT_STATUS_LABELS[log.status]}</Badge>
          </div>
          <SheetTitle className="pt-3 text-xl">{log.title}</SheetTitle>
          <SheetDescription>
            {log.log_number} · {log.parking_lots?.name || "주차장 정보 없음"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="grid grid-cols-2 gap-3">
            <InfoCard label="장비" value={log.equipment?.name || "-"} />
            <InfoCard label="우선순위" value={PRIORITY_LABELS[log.priority]} />
            <InfoCard label="신고일" value={formatFacilityDateTime(log.reported_at)} />
            <InfoCard label="완료일" value={formatFacilityDateTime(log.completed_at)} />
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">작업 내용</h3>
            <div className="mt-4 space-y-3 text-sm text-foreground">
              <DetailBlock label="설명" value={log.description || "-"} />
              <DetailBlock label="증상" value={log.symptom || "-"} />
              <DetailBlock label="원인" value={log.cause || "-"} />
              <DetailBlock label="조치 내용" value={log.resolution || "-"} />
              <DetailBlock label="비고" value={log.notes || "-"} />
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">비용 정보</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <DetailRow label="부품비" value={formatFacilityCurrency(log.parts_cost)} />
              <DetailRow label="인건비" value={formatFacilityCurrency(log.labor_cost)} />
              <DetailRow label="기타비" value={formatFacilityCurrency(log.other_cost)} />
              <DetailRow label="총 비용" value={formatFacilityCurrency(log.total_cost)} />
              <DetailRow label="작업 시간" value={formatFacilityNumber(log.labor_hours, "시간")} />
              <DetailRow label="다운타임" value={formatFacilityNumber(log.downtime_hours, "시간")} />
            </dl>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">사용 부품</h3>
              <span className="text-xs text-muted-foreground">총 {parts.length}건</span>
            </div>
            {parts.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {parts.map((part, index) => (
                  <li key={`${part.name}-${index}`} className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{part.name}</p>
                      <p className="text-xs text-muted-foreground">수량 {part.qty}</p>
                    </div>
                    <span className="font-medium text-foreground">{formatFacilityCurrency(part.unit_cost)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">등록된 부품 내역이 없습니다.</p>
            )}
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
