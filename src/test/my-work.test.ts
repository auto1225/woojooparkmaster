import { afterEach, describe, expect, it, vi } from "vitest";
import { isWorkDueToday, isWorkOverdue, isWorkUrgent, sortMyWork, type MyWorkItem } from "@/hooks/useMyWork";

function work(overrides: Partial<MyWorkItem>): MyWorkItem {
  return {
    id: overrides.id ?? "work",
    kind: overrides.kind ?? "complaint",
    title: overrides.title ?? "Work item",
    context: overrides.context ?? "Parking lot",
    status: overrides.status ?? "assigned",
    priority: overrides.priority ?? "normal",
    dueDate: overrides.dueDate ?? null,
    route: overrides.route ?? "/complaints/work",
  };
}

describe("my work ordering", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats open work before today as overdue", () => {
    vi.setSystemTime(new Date("2026-07-30T09:00:00+09:00"));

    expect(isWorkOverdue(work({ dueDate: "2026-07-29", status: "assigned" }))).toBe(true);
    expect(isWorkOverdue(work({ dueDate: "2026-07-30", status: "assigned" }))).toBe(false);
    expect(isWorkOverdue(work({ dueDate: "2026-07-29", status: "closed" }))).toBe(false);
  });

  it("sorts overdue work first, then priority, then nearest due date", () => {
    vi.setSystemTime(new Date("2026-07-30T09:00:00+09:00"));

    const sorted = sortMyWork([
      work({ id: "later-critical", priority: "critical", dueDate: "2026-08-05" }),
      work({ id: "overdue-low", priority: "low", dueDate: "2026-07-28" }),
      work({ id: "today-high", priority: "high", dueDate: "2026-07-30" }),
      work({ id: "soon-high", priority: "high", dueDate: "2026-07-31" }),
      work({ id: "no-date-critical", priority: "critical" }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      "overdue-low",
      "later-critical",
      "no-date-critical",
      "today-high",
      "soon-high",
    ]);
  });

  it("separates today and urgent work for the daily queue", () => {
    vi.setSystemTime(new Date("2026-07-30T09:00:00+09:00"));

    expect(isWorkDueToday(work({ dueDate: "2026-07-30", status: "assigned" }))).toBe(true);
    expect(isWorkDueToday(work({ dueDate: "2026-07-31", status: "assigned" }))).toBe(false);
    expect(isWorkUrgent(work({ priority: "critical", status: "assigned" }))).toBe(true);
    expect(isWorkUrgent(work({ priority: "critical", status: "closed" }))).toBe(false);
  });
});
