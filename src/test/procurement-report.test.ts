import { describe, expect, it } from "vitest";
import {
  PROCUREMENT_REPORT_SAMPLE_DATASET,
  PROCUREMENT_REPORT_SECTIONS,
  assertCompleteProcurementResult,
  buildProcurementReportModel,
  defaultProcurementReportFields,
  parseProcurementReportOptions,
  procurementReportBriefRows,
  procurementReportSummaryRows,
  toOperationsCompatibleProcurementModel,
} from "@/lib/procurement-report";

const allSections = PROCUREMENT_REPORT_SECTIONS.map(section => section.id).join(",");
const options = parseProcurementReportOptions({
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  procurement_sections: allSections,
  procurement_fields: JSON.stringify(defaultProcurementReportFields()),
  procurement_lot_types: "offstreet,building,onstreet",
  procurement_sort: "attention",
  procurement_orientation: "portrait",
});

describe("procurement report", () => {
  it("defines the full public-procurement workflow and excludes protected contacts by default", () => {
    expect(PROCUREMENT_REPORT_SECTIONS.map(section => section.id)).toEqual([
      "overview", "announcements", "openings", "submissions", "evaluations", "contracts", "bonds", "deadlines", "documents", "risks",
    ]);
    expect(options.selectedSections).toHaveLength(10);
    expect(options.selectedFields.submissions).not.toContain("business_number");
    expect(options.selectedFields.submissions).not.toContain("contact_phone");
    expect(options.selectedFields.contracts).not.toContain("contractor_business_number");
    expect(options.selectedFields.announcements).not.toContain("assigned_to");
  });

  it("keeps approved budget, estimate, design, award, contract and award rate separate", () => {
    const model = buildProcurementReportModel(PROCUREMENT_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.budgetAvailableAmount).toBe(270000000);
    expect(model.summary.estimatedAmount).toBe(240000000);
    expect(model.summary.designAmount).toBe(261000000);
    expect(model.summary.awardedAmount).toBe(149000000);
    expect(model.summary.contractAmount).toBe(110000000);
    expect(model.summary.savingsAmount).toBe(27000000);
    expect(model.summary.averageAwardRate).toBeCloseTo(85.985, 2);

    const openingRows = model.tables.filter(table => table.id === "openings").flatMap(table => table.rows);
    const opening = Object.assign({}, ...openingRows.filter(row => row.bid_number === "JJC-BID-2026-3001"));
    expect(opening.award_amount).toBe("110,000,000원");
    expect(opening.award_rate).toBe("83.33%");
    expect(opening.savings_amount).toBe("22,000,000원");
  });

  it("reports opening validity, vendors and evaluation ranking without leaking protected contacts", () => {
    const model = buildProcurementReportModel(PROCUREMENT_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.submissions).toBe(3);
    expect(model.summary.validSubmissions).toBe(2);
    expect(model.summary.invalidSubmissions).toBe(1);

    const openingRows = model.tables.filter(table => table.id === "openings").flatMap(table => table.rows);
    const opening = Object.assign({}, ...openingRows.filter(row => row.bid_number === "JJC-BID-2026-3001"));
    expect(opening.submission_count).toBe("2개사");
    expect(opening.valid_count).toBe("1개사");
    expect(opening.invalid_count).toBe("1개사");
    expect(opening.successful_bidder).toBe("제주주차시스템");

    const evaluationRows = model.tables.filter(table => table.id === "evaluations").flatMap(table => table.rows);
    expect(evaluationRows.find(row => row.company_name === "제주주차시스템")?.rank).toBe("1위");
    expect(evaluationRows.some(row => Object.hasOwn(row, "evaluator_name"))).toBe(false);
  });

  it("separates contract signing and performance, advance and defect guarantees", () => {
    const model = buildProcurementReportModel(PROCUREMENT_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.contracts).toBe(1);
    expect(model.summary.activeContracts).toBe(1);
    expect(model.summary.unsignedContracts).toBe(0);
    expect(model.summary.bondsRequired).toBe(1);
    expect(model.summary.bondsRegistered).toBe(1);
    expect(model.summary.missingBonds).toBe(0);

    const contractRows = model.tables.filter(table => table.id === "contracts").flatMap(table => table.rows);
    const contract = Object.assign({}, ...contractRows.filter(row => row.contract_number === "JJC-CON-2026-3001"));
    expect(contract.document_number).toContain("2026-0501");
    expect(contract.total_amount).toBe("110,000,000원");
    expect(contract.signed_at).toBe("2026-08-16");

    const bondRows = model.tables.filter(table => table.id === "bonds").flatMap(table => table.rows);
    const bond = Object.assign({}, ...bondRows.filter(row => row.contract_number === "JJC-CON-2026-3001"));
    expect(bond.performance_bond_amount).toBe("11,000,000원");
    expect(bond.advance_bond_amount).toBe("22,000,000원");
    expect(bond.defect_bond_amount).toBe("3,300,000원");
    expect(bond.bond_status).toBe("등록");
  });

  it("builds deadline, document-number and deterministic risk evidence", () => {
    const model = buildProcurementReportModel(PROCUREMENT_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.overdueDeadlines).toBe(2);
    expect(model.summary.linkedDocuments).toBe(3);
    expect(model.summary.missingDocuments).toBe(2);
    expect(model.riskNarrative).toContain("기한초과 2건");

    const deadlineRows = model.tables.filter(table => table.id === "deadlines").flatMap(table => table.rows);
    expect(deadlineRows.some(row => row.reference === "JJC-BID-2026-3002" && row.deadline_status === "기한초과")).toBe(true);
    const documentRows = model.tables.filter(table => table.id === "documents").flatMap(table => table.rows);
    expect(documentRows.some(row => row.record_number === "JJC-CON-2026-3001" && String(row.document_number).includes("2026-0501"))).toBe(true);
    const riskRows = model.tables.filter(table => table.id === "risks").flatMap(table => table.rows);
    expect(riskRows.some(row => row.area === "예산" && row.reference === "JJC-BID-2026-3002")).toBe(true);
    expect(riskRows.some(row => row.area === "계약" && row.reference === "JJC-BID-2026-3003")).toBe(true);
    expect(riskRows.some(row => row.area === "참여업체" && row.reference === "JJC-SUB-2026-3002")).toBe(true);
    expect(riskRows.some(row => row.area === "문서증빙")).toBe(true);
  });

  it("applies period, parking-lot type and status filters consistently", () => {
    const filteredOptions = parseProcurementReportOptions({
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      procurement_sections: allSections,
      procurement_lot_types: "building",
      procurement_statuses: "bidding",
    });
    const model = buildProcurementReportModel(PROCUREMENT_REPORT_SAMPLE_DATASET, filteredOptions);
    expect(model.summary.projects).toBe(1);
    expect(model.summary.parkingLots).toBe(1);
    expect(model.summary.estimatedAmount).toBe(80000000);
    const announcementRows = model.tables.filter(table => table.id === "announcements").flatMap(table => table.rows);
    expect(announcementRows.every(row => row.bid_number === "JJC-BID-2026-3002")).toBe(true);
  });

  it("provides public-sector brief rows, evidence metadata and the shared Operations model", () => {
    const model = buildProcurementReportModel(PROCUREMENT_REPORT_SAMPLE_DATASET, options);
    expect(procurementReportBriefRows(model).map(row => row[0])).toEqual(["담당부서", "보고기간", "보고대상", "주요내용", "작성목적", "산출기준"]);
    expect(procurementReportSummaryRows(model).flat()).toContain("평균 낙찰률");
    expect(procurementReportSummaryRows(model).flat()).toContain("이행보증 미등록");
    expect(model.evidenceMetadata.complete).toBe(true);
    expect(model.evidenceMetadata.queryLimit).toBe(5000);
    expect(model.evidenceMetadata.sourceTables).toContain("bid_contracts");
    expect(model.evidenceMetadata.sourceTables).toContain("official_documents");
    const compatible = toOperationsCompatibleProcurementModel(model);
    expect(compatible.tables).toBe(model.tables);
    expect(compatible.summary.activeContracts).toBe(1);
    expect(compatible.sensitiveFieldCount).toBe(0);
  });

  it("fails explicitly when a database result is truncated", () => {
    expect(() => assertCompleteProcurementResult("입찰사업", { data: [{ id: 1 }], count: 2 })).toThrow("보고서 생성을 중단");
    expect(() => assertCompleteProcurementResult("입찰사업", { data: Array.from({ length: 5000 }), count: 5001 })).toThrow("5001건");
    expect(() => assertCompleteProcurementResult("입찰사업", { data: [], error: { message: "permission denied" } })).toThrow("permission denied");
  });

  it("falls back safely for invalid sections, fields, sort and orientation", () => {
    const parsed = parseProcurementReportOptions({
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      procurement_sections: "unknown",
      procurement_fields: "{invalid",
      procurement_sort: "unknown",
      procurement_orientation: "unknown",
    });
    expect(parsed.selectedSections).toEqual(["overview"]);
    expect(parsed.selectedFields.contracts).toEqual(defaultProcurementReportFields().contracts);
    expect(parsed.sort).toBe("attention");
    expect(parsed.orientation).toBe("portrait");
  });
});
