import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MaintenanceSchedule } from "@/types/facility";
import { getScheduleMonthMap, getScheduleTypeClassName } from "@/lib/facility-schedule";

interface ScheduleCalendarViewProps {
  currentMonth: Date;
  isLoading: boolean;
  schedules: MaintenanceSchedule[];
  selectedScheduleId: string | null;
  onSelectSchedule: (schedule: MaintenanceSchedule) => void;
}

const WEEK_DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function ScheduleCalendarView({
  currentMonth,
  isLoading,
  schedules,
  selectedScheduleId,
  onSelectSchedule,
}: ScheduleCalendarViewProps) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const schedulesMap = getScheduleMonthMap(schedules, year, month);
  const hasSchedules = Object.keys(schedulesMap).length > 0;

  return (
    <div className="space-y-4">
      {!isLoading && !hasSchedules && (
        <div className="rounded-2xl border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          이 달에 예정된 점검 스케줄이 없습니다.
        </div>
      )}

      <div className="grid grid-cols-7 gap-px bg-border">
        {WEEK_DAYS.map((day) => (
          <div key={day} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}

        {Array.from({ length: firstDay }).map((_, index) => (
          <div key={`empty-${index}`} className="min-h-[132px] bg-background p-2" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const isToday =
            today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === day;
          const daySchedules = schedulesMap[day.toString()] || [];

          return (
            <div
              key={day}
              className={cn(
                "min-h-[132px] bg-background p-2 align-top",
                isToday && "ring-2 ring-primary ring-inset",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("text-sm", isToday && "font-bold text-primary")}>
                  {day}
                </span>
                {daySchedules.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {daySchedules.length}건
                  </Badge>
                )}
              </div>

              <div className="mt-2 space-y-1.5">
                {daySchedules.slice(0, 3).map((schedule) => (
                  <button
                    key={schedule.id}
                    type="button"
                    onClick={() => onSelectSchedule(schedule)}
                    className={cn(
                      "w-full rounded-md border px-2 py-1 text-left text-[11px] leading-tight transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      getScheduleTypeClassName(schedule.schedule_type),
                      selectedScheduleId === schedule.id && "ring-2 ring-primary/40 ring-offset-1",
                    )}
                    title={schedule.schedule_name}
                  >
                    <span className="block truncate font-medium">{schedule.schedule_name}</span>
                    <span className="block truncate opacity-80">{schedule.parking_lots?.name || schedule.equipment?.name || "상세 보기"}</span>
                  </button>
                ))}

                {daySchedules.length > 3 && (
                  <p className="px-1 text-[11px] text-muted-foreground">
                    +{daySchedules.length - 3}건 더 있음
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
