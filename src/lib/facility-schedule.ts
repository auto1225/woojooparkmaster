import type { MaintenanceSchedule } from "@/types/facility";
import { SCHEDULE_TYPE_LABELS } from "@/types/facility";

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const SCHEDULE_TYPE_STYLES: Record<string, string> = {
  daily: "border-primary/20 bg-primary/10 text-primary",
  weekly: "border-accent/40 bg-accent/50 text-accent-foreground",
  monthly: "border-secondary bg-secondary text-secondary-foreground",
  quarterly: "border-muted-foreground/15 bg-muted text-foreground",
  semi_annual: "border-primary/15 bg-primary/5 text-foreground",
  yearly: "border-accent/30 bg-accent/30 text-foreground",
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function formatScheduleDate(value?: string | null) {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

export function formatScheduleCurrency(value?: number | null) {
  if (!value || value <= 0) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

export function formatScheduleHours(value?: number | null) {
  if (!value || value <= 0) return "-";
  return `${value}시간`;
}

export function getScheduleTypeLabel(scheduleType: string) {
  return SCHEDULE_TYPE_LABELS[scheduleType] || scheduleType;
}

export function getScheduleTypeClassName(scheduleType: string) {
  return SCHEDULE_TYPE_STYLES[scheduleType] || "border-border bg-muted text-foreground";
}

export function getDaysUntilDue(nextDueDate?: string | null, referenceDate = new Date()) {
  if (!nextDueDate) return null;

  const dueDate = new Date(nextDueDate);
  if (Number.isNaN(dueDate.getTime())) return null;

  return Math.round((startOfDay(dueDate).getTime() - startOfDay(referenceDate).getTime()) / DAY_IN_MS);
}

export function getScheduleDueMeta(
  schedule: Pick<MaintenanceSchedule, "is_active" | "next_due_date">,
  referenceDate = new Date(),
) {
  if (!schedule.is_active) {
    return { label: "비활성", variant: "secondary" as const };
  }

  const daysUntilDue = getDaysUntilDue(schedule.next_due_date, referenceDate);

  if (daysUntilDue === null) {
    return { label: "일정 미정", variant: "outline" as const };
  }

  if (daysUntilDue < 0) {
    return { label: `${Math.abs(daysUntilDue)}일 지연`, variant: "destructive" as const };
  }

  if (daysUntilDue === 0) {
    return { label: "오늘 예정", variant: "default" as const };
  }

  if (daysUntilDue <= 7) {
    return { label: `${daysUntilDue}일 후`, variant: "default" as const };
  }

  return { label: `${daysUntilDue}일 후`, variant: "outline" as const };
}

export function getScheduleMonthMap(schedules: MaintenanceSchedule[], year: number, month: number) {
  return schedules.reduce<Record<string, MaintenanceSchedule[]>>((acc, schedule) => {
    if (!schedule.next_due_date) return acc;

    const dueDate = new Date(schedule.next_due_date);
    if (Number.isNaN(dueDate.getTime())) return acc;
    if (dueDate.getFullYear() !== year || dueDate.getMonth() !== month) return acc;

    const key = dueDate.getDate().toString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(schedule);
    return acc;
  }, {});
}

export function getScheduleChecklist(schedule: MaintenanceSchedule) {
  return Array.isArray(schedule.checklist) ? schedule.checklist : [];
}
