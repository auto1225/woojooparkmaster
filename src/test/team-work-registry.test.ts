import { afterEach, describe, expect, it, vi } from "vitest";
import { getTeamWorkRecordPath, isTeamWorkOverdue, normalizeTeamWorkDueDate, sortTeamWorkRecords, TEAM_WORK_DOCUMENT_MODULE, validateTeamWorkTransition } from "@/lib/team-work-registry";
import type { TeamWorkRecord } from "@/types/team-work";

describe("team work registry", () => {
  afterEach(() => vi.useRealTimers());

  it("marks an unfinished record past its due date as overdue", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T09:00:00+09:00"));
    expect(isTeamWorkOverdue({ dueDate: "2026-07-29", status: "in_progress" })).toBe(true);
  });

  it("does not mark completed or future work as overdue", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T09:00:00+09:00"));
    expect(isTeamWorkOverdue({ dueDate: "2026-07-29", status: "completed" })).toBe(false);
    expect(isTeamWorkOverdue({ dueDate: "2026-08-01", status: "assigned" })).toBe(false);
    expect(isTeamWorkOverdue({ dueDate: null, status: "registered" })).toBe(false);
  });

  it("uses one canonical document module and detail path", () => {
    expect(TEAM_WORK_DOCUMENT_MODULE).toBe("team-work");
    expect(getTeamWorkRecordPath({ id: "record-1", recordType: "compliance" })).toBe("/team-work?tab=compliance&work=record-1");
  });

  it("normalizes valid due dates and rejects invalid calendar dates", () => {
    expect(normalizeTeamWorkDueDate(" 2026-08-10 ")).toBe("2026-08-10");
    expect(normalizeTeamWorkDueDate("")).toBeNull();
    expect(() => normalizeTeamWorkDueDate("2026-02-30")).toThrow("유효한 처리기한");
    expect(() => normalizeTeamWorkDueDate("2026/08/10")).toThrow("YYYY-MM-DD");
  });

  it("sorts officer work while keeping missing values last", () => {
    const record = (overrides: Partial<TeamWorkRecord>): TeamWorkRecord => ({
      id: "1", recordNumber: "WO-1", recordType: "work_order", team: "operations", title: "업무", category: "운영",
      parkingLotId: null, parkingLot: null, parkingLotType: null, ownerId: null, ownerName: null, priority: "normal", status: "registered", dueDate: null, amount: 0,
      documentNumber: null, reviewerName: null, nextAction: null, holdReason: null, sourceModule: null, sourceRecordId: null, sourcePath: null, rowVersion: 1, archivedAt: null, archiveReason: null, payload: {}, createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z", ...overrides,
    });
    const records = [record({ id: "missing" }), record({ id: "later", dueDate: "2026-08-10" }), record({ id: "earlier", dueDate: "2026-08-01" })];
    expect(sortTeamWorkRecords(records, "dueDate", "asc").map(({ id }) => id)).toEqual(["earlier", "later", "missing"]);
    expect(sortTeamWorkRecords(records, "dueDate", "desc").map(({ id }) => id)).toEqual(["later", "earlier", "missing"]);
  });

  it("requires an accountable assignee before work advances", () => {
    const record = {
      id: "1", recordNumber: "WO-1", recordType: "work_order", team: "operations", title: "업무", category: "운영",
      parkingLotId: null, parkingLot: null, parkingLotType: null, ownerId: null, ownerName: null, priority: "normal", status: "registered", dueDate: null, amount: 0,
      documentNumber: null, reviewerName: null, nextAction: null, holdReason: null, sourceModule: null, sourceRecordId: null, sourcePath: null, rowVersion: 1, archivedAt: null, archiveReason: null, payload: {}, createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z",
    } satisfies TeamWorkRecord;
    expect(() => validateTeamWorkTransition(record, "assigned")).toThrow("담당자");
  });

  it("requires completion evidence and a hold reason", () => {
    const record = {
      id: "1", recordNumber: "WO-1", recordType: "work_order", team: "operations", title: "업무", category: "운영",
      parkingLotId: null, parkingLot: null, parkingLotType: null, ownerId: "owner", ownerName: "담당자", priority: "normal", status: "in_progress", dueDate: "2026-08-10", amount: 0,
      documentNumber: null, reviewerName: "검토자", nextAction: null, holdReason: null, sourceModule: null, sourceRecordId: null, sourcePath: null, rowVersion: 1, archivedAt: null, archiveReason: null, payload: {}, createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z",
    } satisfies TeamWorkRecord;
    expect(() => validateTeamWorkTransition(record, "completed")).toThrow("완료 근거");
    expect(() => validateTeamWorkTransition(record, "on_hold")).toThrow("보류 사유");
    expect(() => validateTeamWorkTransition({ ...record, payload: { evidence: "현장 완료 사진" } }, "completed")).not.toThrow();
  });
});
