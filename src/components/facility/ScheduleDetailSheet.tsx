import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { MaintenanceSchedule } from "@/types/facility";
import {
  formatScheduleCurrency,
  formatScheduleDate,
  formatScheduleHours,
  getScheduleChecklist,
  getScheduleDueMeta,
  getScheduleTypeClassName,
  getScheduleTypeLabel,
} from "@/lib/facility-schedule";

interface ScheduleDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: MaintenanceSchedule | null;
}

export function ScheduleDetailSheet({ open, onOpenChange, schedule }: ScheduleDetailSheetProps) {
  const isMobile = useIsMobile();

  if (!schedule) return null;

  const dueMeta = getScheduleDueMeta(schedule);
  const checklistItems = getScheduleChecklist(schedule);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("border", getScheduleTypeClassName(schedule.schedule_type))}>
              {getScheduleTypeLabel(schedule.schedule_type)}
            </Badge>
            <Badge variant={dueMeta.variant}>{dueMeta.label}</Badge>
            <Badge variant={schedule.is_active ? "default" : "secondary"}>
              {schedule.is_active ? "활성" : "비활성"}
            </Badge>
          </div>
          <SheetTitle className="pt-3 text-xl">{schedule.schedule_name}</SheetTitle>
          <SheetDescription>
            {schedule.description || "등록된 점검 설명이 없습니다."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="grid grid-cols-2 gap-3">
            <InfoCard label="주차장" value={schedule.parking_lots?.name || "-"} />
            <InfoCard label="장비" value={schedule.equipment?.name || "-"} />
            <InfoCard label="담당자" value={schedule.assignee?.name || "-"} />
            <InfoCard label="다음 점검일" value={formatScheduleDate(schedule.next_due_date)} />
            <InfoCard label="예상 비용" value={formatScheduleCurrency(schedule.estimated_cost)} />
            <InfoCard label="예상 소요" value={formatScheduleHours(schedule.estimated_hours)} />
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">점검 정보</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <DetailRow label="점검 주기" value={getScheduleTypeLabel(schedule.schedule_type)} />
              <DetailRow label="사전 알림" value={`${schedule.advance_notice_days}일 전`} />
              <DetailRow label="최근 완료일" value={formatScheduleDate(schedule.last_completed)} />
              <DetailRow label="협력업체" value={schedule.vendor_name || "-"} />
              <DetailRow label="담당 팀" value={schedule.assigned_team || "-"} />
            </dl>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">체크리스트</h3>
              <span className="text-xs text-muted-foreground">총 {checklistItems.length}개</span>
            </div>
            {checklistItems.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {checklistItems.map((item, index) => (
                  <li key={`${item.item}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.item}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.required ? "필수 점검 항목" : "선택 점검 항목"}
                      </p>
                    </div>
                    <Badge variant={item.required ? "default" : "outline"}>
                      {item.required ? "필수" : "선택"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">등록된 체크리스트가 없습니다.</p>
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
