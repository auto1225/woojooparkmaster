import { describe, expect, it } from "vitest";
import {
  BUDGET_REPORT_SAMPLE_DATASET,
  BUDGET_REPORT_SECTIONS,
  buildBudgetReportModel,
  budgetReportBriefRows,
  budgetReportSummaryRows,
  defaultBudgetReportFields,
  parseBudgetReportOptions,
  toOperationsCompatibleBudgetModel,
} from "@/lib/budget-report";

const options = parseBudgetReportOptions({
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  budget_fiscal_years: "2026",
  budget_sections: "overview,plans,items,executions,transfers,risks,documents",
  budget_fields: JSON.stringify(defaultBudgetReportFields()),
  budget_lot_types: "offstreet,building,onstreet",
  budget_sort: "attention",
  budget_orientation: "portrait",
});

describe("budget report", () => {
  it("defines all seven budget areas and keeps protected fields out of defaults", () => {
    expect(BUDGET_REPORT_SECTIONS.map(section => section.id)).toEqual(["overview", "plans", "items", "executions", "transfers", "risks", "documents"]);
    expect(options.selectedSections).toHaveLength(7);
    expect(options.fiscalYears).toEqual([2026]);
    expect(options.orientation).toBe("portrait");
    expect(options.selectedFields.executions).not.toContain("bank_account");
    expect(options.selectedFields.executions).not.toContain("vendor_business_number");
    expect(options.selectedFields.items).not.toContain("responsible_person");
  });

  it("separates formation, allocation, execution, return, balance and execution rate", () => {
    const model = buildBudgetReportModel(BUDGET_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.plannedRevenue).toBe(400000000);
    expect(model.summary.plannedExpenditure).toBe(300000000);
    expect(model.summary.allocatedExpenditure).toBe(270000000);
    expect(model.summary.executedExpenditure).toBe(235000000);
    expect(model.summary.returnedExpenditure).toBe(5000000);
    expect(model.summary.remainingExpenditure).toBe(30000000);
    expect(model.summary.executionRate).toBeCloseTo(87.037, 2);
    const itemRows = model.tables.filter(table => table.id === "items").flatMap(table => table.rows);
    const firstItem = Object.assign({}, ...itemRows.filter(row => row.item_code === "E-001"));
    expect(firstItem?.planned_amount).toBe("100,000,000원");
    expect(firstItem?.allocated_amount).toBe("90,000,000원");
    expect(firstItem?.executed_amount).toBe("45,000,000원");
    expect(firstItem?.returned_amount).toBe("5,000,000원");
    expect(firstItem?.remaining_amount).toBe("40,000,000원");
  });

  it("keeps execution ledger and approval status separate from item balances", () => {
    const model = buildBudgetReportModel(BUDGET_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.executionRows).toBe(3);
    expect(model.summary.executedRows).toBe(2);
    expect(model.summary.executedRecordAmount).toBe(225000000);
    expect(model.summary.pendingExecutionRows).toBe(1);
    expect(model.summary.pendingExecutionAmount).toBe(10000000);
    const executionRows = model.tables.filter(table => table.id === "executions").flatMap(table => table.rows);
    expect(executionRows.find(row => row.execution_number === "BE-2026-003")?.status).toBe("승인대기");
  });

  it("reports appropriation and transfer approval amounts independently", () => {
    const model = buildBudgetReportModel(BUDGET_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.transfers).toBe(2);
    expect(model.summary.approvedTransfers).toBe(1);
    expect(model.summary.approvedTransferAmount).toBe(10000000);
    expect(model.summary.pendingTransfers).toBe(1);
    expect(model.summary.pendingTransferAmount).toBe(5000000);
    const transferRows = model.tables.filter(table => table.id === "transfers").flatMap(table => table.rows);
    expect(transferRows.find(row => row.transfer_number === "BT-2026-001")?.transfer_type).toContain("전용");
    expect(transferRows.find(row => row.transfer_number === "BT-2026-002")?.status).toBe("승인대기");
  });

  it("keeps document numbers distinct and produces deterministic risk findings", () => {
    const model = buildBudgetReportModel(BUDGET_REPORT_SAMPLE_DATASET, options);
    expect(model.summary.linkedDocuments).toBe(6);
    expect(model.summary.missingDocuments).toBe(4);
    expect(model.summary.overrunItems).toBe(1);
    expect(model.riskNarrative).toContain("승인 진행 중 편성안 1건");
    expect(model.riskNarrative).toContain("승인 대기 집행 1건");
    expect(model.riskNarrative).toContain("잔액 음수 예산항목 1건");
    const documentRows = model.tables.filter(table => table.id === "documents").flatMap(table => table.rows);
    expect(documentRows.find(row => row.record_number === "BE-2026-001")?.document_number).toContain("2026-0201");
    const riskRows = model.tables.filter(table => table.id === "risks").flatMap(table => table.rows);
    expect(riskRows.some(row => row.area === "원장정합성")).toBe(true);
    expect(riskRows.some(row => row.area === "문서번호")).toBe(true);
  });

  it("uses public-sector brief rows and converts to the shared HWPX model", () => {
    const model = buildBudgetReportModel(BUDGET_REPORT_SAMPLE_DATASET, options);
    expect(budgetReportBriefRows(model).map(row => row[0])).toEqual(["담당부서", "보고기간", "보고대상", "주요내용", "작성목적", "산출기준"]);
    expect(budgetReportBriefRows(model)[0][1]).toBe("제주시청 차량관리과 운영팀");
    expect(budgetReportSummaryRows(model).flat()).toContain("세출 집행률");
    expect(budgetReportSummaryRows(model).flat()).toContain("승인 전용·이체");
    const compatible = toOperationsCompatibleBudgetModel(model);
    expect(compatible.period).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(compatible.tables).toBe(model.tables);
    expect(compatible.selectedFieldCount).toBe(model.selectedFieldCount);
    expect(compatible.sensitiveFieldCount).toBe(0);
  });

  it("falls back safely when section, field JSON and sort values are invalid", () => {
    const parsed = parseBudgetReportOptions({
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      budget_fiscal_years: "not-a-year",
      budget_sections: "unknown",
      budget_fields: "{invalid",
      budget_sort: "unknown",
      budget_orientation: "unknown",
    });
    expect(parsed.selectedSections).toEqual(["overview"]);
    expect(parsed.selectedFields.items).toEqual(defaultBudgetReportFields().items);
    expect(parsed.fiscalYears).toEqual([2026]);
    expect(parsed.sort).toBe("attention");
    expect(parsed.orientation).toBe("portrait");
  });
});
