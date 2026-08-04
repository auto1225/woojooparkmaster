import { describe, expect, it } from "vitest";
import {
  SERVICE_REPORT_PRESETS,
  SERVICE_REPORT_SAMPLE_DATASET,
  SERVICE_REPORT_SECTIONS,
  assertServiceReportTableComplete,
  buildServiceReportModel,
  defaultServiceReportFields,
  parseServiceReportOptions,
  serviceReportBriefRows,
  serviceReportSummaryRows,
  toOperationsCompatibleServiceModel,
} from "@/lib/service-report";

const options = parseServiceReportOptions({
  period_start: "2026-07-01",
  period_end: "2026-08-31",
  service_sections: SERVICE_REPORT_SECTIONS.map((section) => section.id).join(","),
  service_fields: JSON.stringify(defaultServiceReportFields()),
  service_lot_types: "offstreet,building,onstreet",
  service_sort: "attention",
  service_orientation: "portrait",
  service_include_closed: "true",
});

describe("service report", () => {
  it("defines the public-service workflow and excludes protected contacts from unrelated sections", () => {
    expect(SERVICE_REPORT_SECTIONS.map((section) => section.id)).toEqual([
      "overview", "projects", "contracts", "contacts", "milestones", "inspections", "payments", "deliverables", "risks", "documents",
    ]);
    expect(SERVICE_REPORT_PRESETS.summary.sections).toEqual(["overview", "projects", "contracts", "risks"]);
    expect(options.selectedFields.contracts).not.toContain("business_number");
    expect(options.selectedFields.payments).not.toContain("bank_account");
    expect(options.selectedFields.contacts).toContain("site_manager_phone");
  });

  it("summarizes contract, progress, inspection, payment and performance independently", () => {
    const model = buildServiceReportModel(SERVICE_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.projects).toBe(2);
    expect(model.summary.activeProjects).toBe(1);
    expect(model.summary.warrantyProjects).toBe(1);
    expect(model.summary.contractAmount).toBe(187000000);
    expect(model.summary.paidAmount).toBe(107800000);
    expect(model.summary.remainingAmount).toBe(79200000);
    expect(model.summary.averageProgress).toBe(82.5);
    expect(model.summary.delayedMilestones).toBe(1);
    expect(model.summary.correctionInspections).toBe(1);
    expect(model.summary.pendingPayments).toBe(1);
    expect(model.summary.pendingPaymentAmount).toBe(38600000);
    expect(model.summary.acceptedDeliverables).toBe(2);
    expect(model.summary.revisionDeliverables).toBe(1);
  });

  it("prints contractor and field contacts as protected evidence", () => {
    const model = buildServiceReportModel(SERVICE_REPORT_SAMPLE_DATASET, options);
    expect(model.protectedFieldCount).toBeGreaterThan(0);
    const rows = model.tables.filter((table) => table.id === "contacts").flatMap((table) => table.rows);
    const contact = Object.assign({}, ...rows.filter((row) => row.project_number === "SVC-2026-001"));
    expect(contact.contractor_name).toBe("제주스마트파킹");
    expect(contact.site_manager).toBe("이현장");
    expect(contact.site_manager_phone).toBe("010-1111-2222");
    expect(contact.supervisor).toBe("운영팀 주무관");
  });

  it("derives defect, delay and correction risks with official document numbers", () => {
    const model = buildServiceReportModel(SERVICE_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.openIssues).toBe(1);
    expect(model.summary.criticalIssues).toBe(1);
    expect(model.riskNarrative).toContain("지연 단계 1건");
    expect(model.riskNarrative).toContain("검수 보완·반려 1건");
    const riskRows = model.tables.filter((table) => table.id === "risks").flatMap((table) => table.rows);
    expect(riskRows.some((row) => row.area === "하자" && row.document_numbers.includes("2026-0501"))).toBe(true);
    expect(riskRows.some((row) => row.area === "공정지연")).toBe(true);
    expect(riskRows.some((row) => row.area === "검수·시정")).toBe(true);
    const documentRows = model.tables.filter((table) => table.id === "documents").flatMap((table) => table.rows);
    expect(documentRows.find((row) => row.record_number === "SPAY-2026-001")?.document_number).toContain("2026-0301");
  });

  it("keeps every source row and fails explicitly instead of accepting a truncated table", () => {
    expect(() => assertServiceReportTableComplete("용역 대금", 5001, 5000)).toThrow("테이블 절단을 방지");
    expect(() => assertServiceReportTableComplete("용역 검수", 3, 2)).toThrow("3건 중 2건만 조회");
    expect(() => assertServiceReportTableComplete("용역 검수", 2, 2)).not.toThrow();
    const model = buildServiceReportModel(SERVICE_REPORT_SAMPLE_DATASET, options);
    expect(model.evidenceMetadata.truncationPolicy).toBe("fail");
    expect(Object.values(model.evidenceMetadata.sources).every((source) => source.complete && source.expected === source.loaded)).toBe(true);
    const milestoneTables = model.tables.filter((table) => table.id === "milestones");
    expect(milestoneTables[0].rows).toHaveLength(3);
  });

  it("uses public-sector brief rows and the Operations-compatible HWPX contract", () => {
    const model = buildServiceReportModel(SERVICE_REPORT_SAMPLE_DATASET, options);
    expect(serviceReportBriefRows(model).map((row) => row[0])).toEqual([
      "담당부서", "보고기간", "보고대상", "주요내용", "작성목적", "산출기준",
    ]);
    expect(serviceReportBriefRows(model)[0][1]).toBe("제주시청 차량관리과 운영팀");
    expect(serviceReportBriefRows(model)[5][1]).toContain("테이블 절단 없이 완전 조회");
    expect(serviceReportSummaryRows(model).flat()).toContain("계약총액");
    expect(serviceReportSummaryRows(model).flat()).toContain("검수 보완·반려");
    const compatible = toOperationsCompatibleServiceModel(model);
    expect(compatible.period).toEqual({ start: "2026-07-01", end: "2026-08-31" });
    expect(compatible.tables).toBe(model.tables);
    expect(compatible.selectedFieldCount).toBe(model.selectedFieldCount);
    expect(compatible.sensitiveFieldCount).toBe(model.protectedFieldCount);
  });

  it("falls back safely when parameters are invalid", () => {
    const parsed = parseServiceReportOptions({
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      service_sections: "unknown",
      service_fields: "{invalid",
      service_sort: "unknown",
      service_orientation: "unknown",
    });
    expect(parsed.selectedSections).toEqual(["overview"]);
    expect(parsed.selectedFields.projects).toEqual(defaultServiceReportFields().projects);
    expect(parsed.sort).toBe("attention");
    expect(parsed.orientation).toBe("portrait");
  });
});
