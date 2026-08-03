export type ReportFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "semi_annual" | "yearly";

export interface ReportScheduleTiming {
  frequency: ReportFrequency;
  executionTime: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  monthOfYear?: number;
}
function safeDay(year: number, month: number, day: number) {
  return Math.min(Math.max(day, 1), new Date(year, month + 1, 0).getDate());
}

function withTime(date: Date, executionTime: string) {
  const [hour, minute] = executionTime.split(":").map(Number);
  date.setHours(Number.isFinite(hour) ? hour : 6, Number.isFinite(minute) ? minute : 0, 0, 0);
  return date;
}

export function calculateNextReportRun(timing: ReportScheduleTiming, from = new Date()) {
  const next = withTime(new Date(from), timing.executionTime);
  const dayOfMonth = Math.min(Math.max(timing.dayOfMonth || 1, 1), 28);

  if (timing.frequency === "daily") {
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }

  if (timing.frequency === "weekly") {
    const target = Math.min(Math.max(timing.dayOfWeek ?? 1, 0), 6);
    const offset = (target - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + offset);
    if (next <= from) next.setDate(next.getDate() + 7);
    return next;
  }

  if (timing.frequency === "monthly") {
    next.setDate(safeDay(next.getFullYear(), next.getMonth(), dayOfMonth));
    if (next <= from) {
      next.setMonth(next.getMonth() + 1, 1);
      next.setDate(safeDay(next.getFullYear(), next.getMonth(), dayOfMonth));
    }
    return next;
  }

  const months = timing.frequency === "quarterly" ? 3 : timing.frequency === "semi_annual" ? 6 : 12;
  const preferredMonth = Math.min(Math.max((timing.monthOfYear || 1) - 1, 0), 11);
  const allowedMonths = Array.from({ length: Math.ceil(12 / months) }, (_, index) => (preferredMonth + index * months) % 12)
    .sort((left, right) => left - right);
  for (const year of [from.getFullYear(), from.getFullYear() + 1, from.getFullYear() + 2]) {
    for (const month of allowedMonths) {
      const candidate = withTime(new Date(year, month, safeDay(year, month, dayOfMonth)), timing.executionTime);
      if (candidate > from) return candidate;
    }
  }
  throw new Error("다음 보고서 실행일을 계산하지 못했습니다.");
}
