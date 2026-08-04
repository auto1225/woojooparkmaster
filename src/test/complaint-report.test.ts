import { describe, expect, it } from "vitest";
import {
  COMPLAINT_REPORT_SAMPLE_DATASET,
  COMPLAINT_REPORT_SECTIONS,
  assertCompleteComplaintResult,
  buildComplaintReportModel,
  complaintReportBriefRows,
  complaintReportSummaryRows,
  defaultComplaintReportFields,
  parseComplaintReportOptions,
  redactComplaintFreeText,
  toOperationsCompatibleComplaintModel,
} from "@/lib/complaint-report";

const options = parseComplaintReportOptions({
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  complaint_as_of_date: "2026-08-31",
  complaint_sections: "overview,intake,sla,assignments,timeline,repeats,prevention,lot_types,documents",
  complaint_fields: JSON.stringify(defaultComplaintReportFields()),
  complaint_lot_types: "offstreet,building,onstreet",
  complaint_sort: "attention",
  complaint_orientation: "portrait",
});

describe("complaint report", () => {
  it("defines the public-service workflow sections and excludes personal data from every default", () => {
    expect(COMPLAINT_REPORT_SECTIONS.map(section => section.id)).toEqual([
      "overview", "intake", "sla", "assignments", "timeline", "repeats", "prevention", "lot_types", "documents",
    ]);
    expect(options.selectedSections).toHaveLength(9);
    const defaults = Object.values(defaultComplaintReportFields()).flat();
    expect(defaults).not.toEqual(expect.arrayContaining([
      "complainant_name", "complainant_phone", "complainant_email", "complainant_address", "vehicle_number", "satisfaction_feedback", "assignee_name", "author_name",
    ]));
  });

  it("calculates intake, assignment, SLA and official-response controls deterministically", () => {
    const model = buildComplaintReportModel(COMPLAINT_REPORT_SAMPLE_DATASET, options);
    expect(model.summary).toMatchObject({
      parkingLots: 3,
      totalComplaints: 5,
      openComplaints: 2,
      respondedComplaints: 1,
      closedComplaints: 2,
      unassignedComplaints: 1,
      overdueComplaints: 1,
      dueSoonComplaints: 1,
      completedWithinSla: 2,
      completedLate: 1,
      repeatComplaints: 1,
      preventionRequired: 1,
      preventionCompleted: 1,
      fieldVisits: 2,
      linkedFacilityWork: 2,
      officialResponses: 2,
      missingOfficialResponses: 1,
    });
    expect(model.summary.slaComplianceRate).toBeCloseTo(66.667, 2);
    expect(model.summary.averageResolutionDays).toBeCloseTo(7.333, 2);
    expect(model.riskNarrative).toContain("처리기한 초과 1건");
    expect(model.riskNarrative).toContain("공식 답변문서 미연계 1건");
  });

  it("builds a privacy-minimized timeline and masks identifiers in free text", () => {
    const model = buildComplaintReportModel(COMPLAINT_REPORT_SAMPLE_DATASET, options);
    const timelineRows = model.tables.filter(table => table.id === "timeline").flatMap(table => table.rows);
    const serialized = JSON.stringify(timelineRows);
    expect(serialized).toContain("[전화번호 비공개]");
    expect(serialized).toContain("[차량번호 비공개]");
    expect(serialized).not.toContain("010-1234-5678");
    expect(serialized).not.toContain("12가3456");
    expect(redactComplaintFreeText("010-9876-5432 user@example.com 34나5678")).toBe("[전화번호 비공개] [이메일 비공개] [차량번호 비공개]");
    expect(model.protectedFieldCount).toBe(0);
  });

  it("links repeat complaints to prevention evidence, facility work and official documents", () => {
    const model = buildComplaintReportModel(COMPLAINT_REPORT_SAMPLE_DATASET, options);
    const repeatRows = model.tables.filter(table => table.id === "repeats").flatMap(table => table.rows);
    expect(repeatRows).toHaveLength(1);
    expect(repeatRows[0]).toMatchObject({
      complaint_number: "CMP-202608-003",
      related_number: "CMP-202607-019",
      prevention_state: "조치완료",
      document_number: "미등록",
    });
    const preventionRows = model.tables.filter(table => table.id === "prevention").flatMap(table => table.rows);
    expect(preventionRows[0].facility_work).toContain("MW-202608-022");
    expect(preventionRows[0].prevention_action).toContain("월 1회");
  });

  it("compares off-street, parking-building and on-street complaint outcomes", () => {
    const model = buildComplaintReportModel(COMPLAINT_REPORT_SAMPLE_DATASET, options);
    const rows = model.tables.filter(table => table.id === "lot_types").flatMap(table => table.rows);
    expect(rows.map(row => row.lot_type)).toEqual(["노외주차장", "주차빌딩", "노상주차장"]);
    expect(rows.find(row => row.lot_type === "노외주차장")).toMatchObject({ total: "2건", open: "1건", overdue: "0건" });
    expect(rows.find(row => row.lot_type === "주차빌딩")).toMatchObject({ total: "2건", open: "1건", overdue: "1건" });
    expect(rows.find(row => row.lot_type === "노상주차장")).toMatchObject({ total: "1건", repeat: "1건", sla_rate: "0%" });
  });

  it("provides evidence metadata, public brief rows and the shared Operations model", () => {
    const model = buildComplaintReportModel(COMPLAINT_REPORT_SAMPLE_DATASET, options);
    expect(model.evidenceMetadata).toMatchObject({ complete: true, queryLimit: 5000, truncationPolicy: "fail" });
    expect(model.evidenceMetadata.privacy).toMatchObject({ mode: "minimum", redactedFreeText: true });
    expect(model.evidenceMetadata.sources.comments).toEqual({ expected: 5, loaded: 5, complete: true });
    expect(complaintReportBriefRows(model).map(row => row[0])).toEqual(["담당부서", "보고기간", "보고대상", "주요내용", "작성목적", "산출기준"]);
    expect(complaintReportBriefRows(model)[0][1]).toBe("제주시청 차량관리과 운영팀");
    expect(complaintReportSummaryRows(model).flat()).toContain("SLA 준수율");
    const compatible = toOperationsCompatibleComplaintModel(model);
    expect(compatible.period).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(compatible.tables).toBe(model.tables);
    expect(compatible.sensitiveFieldCount).toBe(0);
  });

  it("fails instead of silently accepting truncated or unverifiable query results", () => {
    expect(() => assertCompleteComplaintResult("민원", { data: [{ id: "1" }], count: 2, error: null })).toThrow("2건 중 1건만 조회");
    expect(() => assertCompleteComplaintResult("민원", { data: [{ id: "1" }], count: null, error: null })).toThrow("전체 건수를 확인할 수 없어");
    expect(() => assertCompleteComplaintResult("민원", { data: [], count: 5001, error: null })).toThrow("조회 한도 5000건을 초과");
    expect(() => assertCompleteComplaintResult("민원", { data: null, count: 0, error: null })).not.toThrow();
  });

  it("rejects incomplete evidence and falls back safely from invalid controls", () => {
    const incomplete = {
      ...COMPLAINT_REPORT_SAMPLE_DATASET,
      evidenceMetadata: {
        complete: false,
        collectedAt: "2026-08-31T23:59:59.000Z",
        queryLimit: 5000,
        truncationPolicy: "fail" as const,
        sourceTables: ["complaints"],
        filters: { periodStart: "2026-08-01", periodEnd: "2026-08-31", asOfDate: "2026-08-31", lotTypes: ["offstreet", "building", "onstreet"], statuses: [], includeArchived: false },
        privacy: { mode: "minimum" as const, excludedFields: [], redactedFreeText: true as const },
        sources: { complaints: { expected: 5, loaded: 4, complete: false } },
      },
    };
    expect(() => buildComplaintReportModel(incomplete, options)).toThrow("증거자료가 불완전");
    const parsed = parseComplaintReportOptions({
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      complaint_sections: "unknown",
      complaint_fields: "{invalid",
      complaint_sort: "unknown",
      complaint_orientation: "unknown",
    });
    expect(parsed.selectedSections).toEqual(["overview"]);
    expect(parsed.selectedFields.sla).toEqual(defaultComplaintReportFields().sla);
    expect(parsed.sort).toBe("attention");
    expect(parsed.orientation).toBe("portrait");
  });
});
