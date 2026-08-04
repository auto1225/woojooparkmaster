import { describe, expect, it } from "vitest";
import {
  PLANNING_REPORT_PRESETS,
  PLANNING_REPORT_SAMPLE_DATASET,
  PLANNING_REPORT_SECTIONS,
  assertCompletePlanningResult,
  assertPlanningReportTableComplete,
  buildPlanningReportModel,
  defaultPlanningReportFields,
  parsePlanningReportOptions,
  planningReportBriefRows,
  planningReportSummaryRows,
  toOperationsCompatiblePlanningModel,
  type PlanningReportDataset,
} from "@/lib/planning-report";

const options = parsePlanningReportOptions({
  period_start: "2026-01-01",
  period_end: "2026-08-31",
  planning_sections: PLANNING_REPORT_SECTIONS.map((section) => section.id).join(","),
  planning_fields: JSON.stringify(defaultPlanningReportFields()),
  planning_lot_types: "offstreet,building,onstreet",
  planning_sort: "attention",
  planning_orientation: "portrait",
  planning_include_completed: "true",
});

describe("planning report", () => {
  it("models the full public-sector planning workflow with presets and selectable fields", () => {
    expect(PLANNING_REPORT_SECTIONS.map((section) => section.id)).toEqual([
      "overview", "candidates", "feasibility", "acquisition", "property", "procedures",
      "projects", "budget", "progress", "risks", "documents",
    ]);
    expect(PLANNING_REPORT_PRESETS.summary.sections).toEqual(["overview", "candidates", "feasibility", "projects", "risks"]);
    expect(PLANNING_REPORT_PRESETS.standard.sections).toHaveLength(11);
    expect(PLANNING_REPORT_PRESETS.audit.sections).toContain("documents");
    expect(options.selectedFields.acquisition).toContain("owner_name");
    expect(options.selectedFields.property).toContain("completion_evidence");
    expect(options.selectedFields.procedures).toContain("document_numbers");
  });

  it("summarizes candidates, feasibility, acquisition, budget and workflow independently", () => {
    const model = buildPlanningReportModel(PLANNING_REPORT_SAMPLE_DATASET, options);
    expect(model.lotTypeLabels).toEqual(["노외주차장", "주차빌딩", "노상주차장"]);
    expect(model.summary.sites).toBe(3);
    expect(model.summary.selectedSites).toBe(2);
    expect(model.summary.acquisitionSites).toBe(1);
    expect(model.summary.expectedSpaces).toBe(317);
    expect(model.summary.averageScore).toBeCloseTo(77.6);
    expect(model.summary.estimatedLandCost).toBe(3_200_000_000);
    expect(model.summary.estimatedConstructionCost).toBe(10_900_000_000);
    expect(model.summary.projects).toBe(3);
    expect(model.summary.activeProjects).toBe(3);
    expect(model.summary.totalBudget).toBe(14_100_000_000);
    expect(model.summary.spent).toBe(3_860_000_000);
    expect(model.summary.remaining).toBe(10_240_000_000);
    expect(model.summary.budgetExecutionRate).toBeCloseTo(27.3759, 3);
  });

  it("separates public-property procedure evidence from land acquisition facts", () => {
    const model = buildPlanningReportModel(PLANNING_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.procedures).toBe(8);
    expect(model.summary.propertyProcedures).toBe(2);
    expect(model.summary.completedProcedures).toBe(4);
    expect(model.summary.overdueProcedures).toBe(4);
    const acquisitionRows = model.tables.filter((table) => table.id === "acquisition").flatMap((table) => table.rows);
    const privateSite = Object.assign({}, ...acquisitionRows.filter((row) => row.site_number === "SC-2026-001"));
    expect(privateSite.ownership).toBe("사유지");
    expect(privateSite.acquisition_method).toBe("매입");
    expect(privateSite.estimated_land_cost).toBe("3,200,000,000원");
    const propertyRows = model.tables.filter((table) => table.id === "property" && !table.continuation).flatMap((table) => table.rows);
    expect(propertyRows).toHaveLength(2);
    expect(propertyRows.every((row) => row.procedure_gate === "공유재산 심의")).toBe(true);
    expect(propertyRows.map((row) => row.completion_evidence)).toEqual(expect.arrayContaining(["공유재산심의 의결서", "관리계획 의결서"]));
  });

  it("keeps all three parking-lot types through candidate and project tables", () => {
    const model = buildPlanningReportModel(PLANNING_REPORT_SAMPLE_DATASET, options);
    const candidateRows = model.tables.filter((table) => table.id === "candidates" && table.columns.some((column) => column.key === "lot_type")).flatMap((table) => table.rows);
    const projectRows = model.tables.filter((table) => table.id === "projects" && table.columns.some((column) => column.key === "lot_type")).flatMap((table) => table.rows);
    expect(new Set(candidateRows.map((row) => row.lot_type))).toEqual(new Set(["노외주차장", "주차빌딩", "노상주차장"]));
    expect(new Set(projectRows.map((row) => row.lot_type))).toEqual(new Set(["노외주차장", "주차빌딩", "노상주차장"]));

    const buildingOnly = buildPlanningReportModel(PLANNING_REPORT_SAMPLE_DATASET, {
      ...options,
      lotTypes: ["building"],
    });
    expect(buildingOnly.summary.sites).toBe(1);
    expect(buildingOnly.summary.projects).toBe(1);
    expect(buildingOnly.lotTypeLabels).toEqual(["주차빌딩"]);
  });

  it("derives budget, progress and next-action facts without inventing completion", () => {
    const model = buildPlanningReportModel(PLANNING_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.permits).toBe(4);
    expect(model.summary.approvedPermits).toBe(2);
    expect(model.summary.pendingPermits).toBe(2);
    expect(model.summary.currentDocuments).toBe(3);
    expect(model.summary.approvedDocuments).toBe(2);
    expect(model.summary.completionChecks).toBe(2);
    expect(model.summary.completedChecks).toBe(0);
    const progressRows = model.tables.filter((table) => table.id === "progress").flatMap((table) => table.rows);
    const onstreet = Object.assign({}, ...progressRows.filter((row) => row.project_number === "CP-2026-003"));
    expect(onstreet.next_action).toBe("승인 예산항목 연결");
    const offstreet = Object.assign({}, ...progressRows.filter((row) => row.project_number === "CP-2026-001"));
    expect(offstreet.next_action).toBe("미승인 인허가 보완");
  });

  it("reports economic, schedule, permit and document risks with official evidence", () => {
    const model = buildPlanningReportModel(PLANNING_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.riskCount).toBe(15);
    expect(model.summary.highRisks).toBe(9);
    expect(model.summary.linkedDocuments).toBe(10);
    expect(model.summary.missingDocuments).toBe(7);
    expect(model.riskNarrative).toContain("기한초과 절차 4건");
    expect(model.riskNarrative).toContain("미승인 인허가 2건");
    const riskRows = model.tables.filter((table) => table.id === "risks").flatMap((table) => table.rows);
    expect(riskRows.some((row) => row.source_type === "타당성" && row.reference === "SC-2026-003" && row.finding.includes("B/C 0.82"))).toBe(true);
    expect(riskRows.some((row) => row.source_type === "예산" && row.reference === "CP-2026-003")).toBe(true);
    expect(riskRows.some((row) => row.source_type === "공정" && row.reference === "CP-2026-001" && row.finding.includes("12일 지연"))).toBe(true);
    const documentRows = model.tables.filter((table) => table.id === "documents").flatMap((table) => table.rows);
    expect(documentRows.find((row) => row.record_number === "SC-2026-001")?.document_number).toContain("2026-1001");
    expect(documentRows.find((row) => row.record_number === "JJP-BLD-2026-101")?.document_number).toContain("2026-2101");
  });

  it("fails explicitly on query errors, count truncation and incomplete evidence", () => {
    expect(() => assertPlanningReportTableComplete("후보지", 5001, 5000)).toThrow("테이블 절단을 방지");
    expect(() => assertPlanningReportTableComplete("신설사업", 3, 2)).toThrow("3건 중 2건만 조회");
    expect(() => assertPlanningReportTableComplete("신설사업", 3, 3)).not.toThrow();
    expect(() => assertCompletePlanningResult("인허가", { data: [], error: { message: "권한 없음" } })).toThrow("권한 없음");
    expect(() => assertCompletePlanningResult("설계도서", { data: [{ id: 1 }], count: 2 })).toThrow("2건 중 1건만 조회");

    const incomplete = structuredClone(PLANNING_REPORT_SAMPLE_DATASET) as PlanningReportDataset;
    incomplete.evidenceMetadata = {
      collectedAt: "2026-08-31T23:59:59.000Z",
      queryLimit: 5000,
      truncationPolicy: "fail",
      sources: { sites: { expected: 3, loaded: 2, complete: false } },
    };
    expect(() => buildPlanningReportModel(incomplete, options)).toThrow("3건 중 2건만 조회");
  });

  it("exposes source counts, protected data and Operations-compatible report rows", () => {
    const model = buildPlanningReportModel(PLANNING_REPORT_SAMPLE_DATASET, options);
    expect(model.evidenceMetadata.truncationPolicy).toBe("fail");
    expect(Object.values(model.evidenceMetadata.sources).every((source) => source.complete && source.expected === source.loaded)).toBe(true);
    expect(model.sourceCounts).toMatchObject({
      sites: 3,
      projects: 3,
      permits: 4,
      designDocuments: 3,
      procedures: 4,
      propertyProcedures: 2,
      completionChecks: 2,
      budgetItems: 2,
      documents: 17,
    });
    expect(model.protectedFieldCount).toBeGreaterThan(0);
    expect(planningReportBriefRows(model).map((row) => row[0])).toEqual([
      "담당부서", "보고기간", "보고대상", "주요내용", "작성목적", "산출기준",
    ]);
    expect(planningReportBriefRows(model)[0][1]).toBe("제주시청 차량관리과 운영팀");
    expect(planningReportBriefRows(model)[5][1]).toContain("테이블 절단 없이 완전 조회");
    expect(planningReportSummaryRows(model).flat()).toContain("공유재산 절차");
    const compatible = toOperationsCompatiblePlanningModel(model);
    expect(compatible.period).toEqual({ start: "2026-01-01", end: "2026-08-31" });
    expect(compatible.summary.parkingLots).toBe(3);
    expect(compatible.summary.totalSpaces).toBe(317);
    expect(compatible.tables).toBe(model.tables);
    expect(compatible.selectedFieldCount).toBe(model.selectedFieldCount);
    expect(compatible.sensitiveFieldCount).toBe(model.protectedFieldCount);
  });

  it("parses sorting and orientation safely while preserving selected fields", () => {
    const selectedFields = { ...defaultPlanningReportFields(), projects: ["project_number", "project_name", "status"] };
    const parsed = parsePlanningReportOptions({
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      planning_sections: "projects,risks",
      planning_fields: JSON.stringify(selectedFields),
      planning_lot_types: "offstreet,onstreet",
      planning_sort: "deadline_asc",
      planning_orientation: "landscape",
      planning_include_completed: "false",
    });
    expect(parsed.selectedSections).toEqual(["projects", "risks"]);
    expect(parsed.selectedFields.projects).toEqual(["project_number", "project_name", "status"]);
    expect(parsed.lotTypes).toEqual(["offstreet", "onstreet"]);
    expect(parsed.sort).toBe("deadline_asc");
    expect(parsed.orientation).toBe("landscape");
    expect(parsed.includeCompleted).toBe(false);

    const fallback = parsePlanningReportOptions({
      period_start: "2026-08-01",
      planning_sections: "unknown",
      planning_fields: "{invalid",
      planning_sort: "unknown",
      planning_orientation: "unknown",
    });
    expect(fallback.selectedSections).toEqual(["overview"]);
    expect(fallback.selectedFields.candidates).toEqual(defaultPlanningReportFields().candidates);
    expect(fallback.sort).toBe("attention");
    expect(fallback.orientation).toBe("portrait");
  });
});
