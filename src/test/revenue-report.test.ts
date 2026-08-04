import { describe, expect, it } from "vitest";
import {
  buildRevenueReportModel,
  defaultRevenueReportFields,
  parseRevenueReportOptions,
  REVENUE_RECONCILIATION_SCOPE_NOTICE,
  revenueReportBriefRows,
  revenueReportSummaryRows,
  toOperationsCompatibleRevenueModel,
  type RevenueReportDataset,
} from "@/lib/revenue-report";

const dataset: RevenueReportDataset = {
  parkingLots: [
    { id: "lot-1", code: "JJP-001", name: "동문공설", lot_type: "offstreet" },
    { id: "lot-2", code: "JJP-002", name: "칠성골", lot_type: "multilevel" },
    { id: "lot-3", code: "JJP-003", name: "노상구간", lot_type: "onstreet" },
  ],
  dailyRevenue: [
    { id: "daily-1", lot_id: "lot-1", revenue_date: "2026-08-01", cash_amount: 10000, card_amount: 20000, mobile_amount: 3000, monthly_pass_amount: 5000, other_amount: 2000, total_amount: 40000, total_vehicles: 50, exemption_count: 2, exemption_amount: 1000, data_source: "kiosk", verified: true, verified_at: "2026-08-02", parking_lots: { id: "lot-1", name: "동문공설", lot_type: "offstreet" } },
    { id: "daily-2", lot_id: "lot-2", revenue_date: "2026-08-01", cash_amount: 5000, card_amount: 15000, mobile_amount: 0, monthly_pass_amount: 0, other_amount: 0, total_amount: 20000, total_vehicles: 20, exemption_count: 0, exemption_amount: 0, data_source: "manual", verified: true, verified_at: "2026-08-02", parking_lots: { id: "lot-2", name: "칠성골", lot_type: "multilevel" } },
    { id: "daily-3", lot_id: "lot-3", revenue_date: "2026-08-02", cash_amount: 3000, card_amount: 7000, mobile_amount: 0, monthly_pass_amount: 0, other_amount: 0, total_amount: 9999, total_vehicles: 11, exemption_count: 0, exemption_amount: 0, data_source: "manual", verified: false, discrepancy_note: "정산기 자료 확인중", parking_lots: { id: "lot-3", name: "노상구간", lot_type: "onstreet" } },
  ],
  periodCloses: [
    { id: "close-1", lot_id: "lot-1", period_month: "2026-08-01", record_count: 31, total_amount: 40000, is_closed: true, closed_at: "2026-09-01", parking_lots: { id: "lot-1", name: "동문공설", lot_type: "offstreet" } },
    { id: "close-2", lot_id: "lot-2", period_month: "2026-08-01", record_count: 31, total_amount: 20000, is_closed: false, reopened_at: "2026-09-02", reopen_reason: "카드 정산 재확인", parking_lots: { id: "lot-2", name: "칠성골", lot_type: "multilevel" } },
  ],
  reconciliations: [
    { id: "recon-1", recon_number: "RC-202608-01001", lot_id: "lot-1", period_start: "2026-08-01", period_end: "2026-08-31", company_name: "제주주차서비스", reported_cash: 10000, reported_card: 20500, reported_mobile: 3000, reported_monthly_pass: 5000, reported_other: 2000, reported_vehicles: 50, system_cash: 10000, system_card: 20000, system_mobile: 3000, system_monthly_pass: 5000, system_other: 2000, system_vehicles: 50, diff_rate: 1.25, status: "discrepancy", diff_analysis: "카드사 승인자료 확인중", parking_lots: { id: "lot-1", name: "동문공설", lot_type: "offstreet" } },
  ],
  missingDays: [
    { lot_id: "lot-3", revenue_date: "2026-08-03", parking_lots: { id: "lot-3", name: "노상구간", lot_type: "onstreet" } },
  ],
  documentNumbers: {
    "REVENUE_DAILY:daily-1": ["제주시청-차량관리과운영팀-2026-0201"],
    "REVENUE_CLOSE:close-1": ["제주시청-차량관리과운영팀-2026-0202"],
    "REVENUE_RECONCILIATION:recon-1": ["제주시청-차량관리과운영팀-2026-0203"],
  },
};

const options = parseRevenueReportOptions({
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  revenue_sections: "overview,certified,unverified,closes,reconciliation,payment_methods",
  revenue_fields: JSON.stringify(defaultRevenueReportFields()),
  revenue_lot_types: "offstreet,building,onstreet",
  revenue_sort: "attention",
  revenue_orientation: "portrait",
});

describe("revenue report", () => {
  it("parses all revenue areas with a non-protected portrait default", () => {
    expect(options.selectedSections).toHaveLength(6);
    expect(options.orientation).toBe("portrait");
    expect(options.selectedFields.certified).not.toContain("verified_by");
    expect(options.selectedFields.closes).not.toContain("closed_by");
    expect(options.selectedFields.reconciliation).not.toContain("resolved_by");
  });

  it("counts only verified and monthly-closed rows as finalized revenue", () => {
    const model = buildRevenueReportModel(dataset, options);
    expect(model.summary.verifiedRows).toBe(2);
    expect(model.summary.certifiedRows).toBe(1);
    expect(model.summary.verifiedPendingClose).toBe(1);
    expect(model.summary.unverifiedRows).toBe(1);
    expect(model.summary.missingDays).toBe(1);
    expect(model.summary.finalizedRevenue).toBe(40000);
    expect(model.summary.unverifiedRevenue).toBe(10000);
    expect(model.summary.integrityMismatchRows).toBe(1);
    const certifiedRows = model.tables.filter(table => table.id === ("certified" as any)).flatMap(table => table.rows);
    expect(certifiedRows.every(row => row.lot === "동문공설")).toBe(true);
    expect(certifiedRows.some(row => row.lot === "칠성골")).toBe(false);
  });

  it("separates payment methods and keeps official document numbers", () => {
    const model = buildRevenueReportModel(dataset, options);
    expect(model.summary.cashAmount).toBe(10000);
    expect(model.summary.cardAmount).toBe(20000);
    expect(model.summary.mobileAmount).toBe(3000);
    expect(model.summary.monthlyPassAmount).toBe(5000);
    expect(model.summary.otherAmount).toBe(2000);
    expect(model.summary.linkedDocuments).toBe(3);
    const paymentTable = model.tables.find(table => table.id === ("payment_methods" as any));
    expect(paymentTable?.rows).toHaveLength(5);
    expect(paymentTable?.rows.find(row => row.payment_method === "카드")?.finalized_amount).toBe("20,000원");
    const documentTable = model.tables.find(table => table.id === ("certified" as any) && table.columns.some(column => column.key === "document_numbers"));
    expect(documentTable?.rows[0].document_numbers).toContain("2026-0201");
  });

  it("reports outsourced reconciliation without claiming external revenue settlement", () => {
    const model = buildRevenueReportModel(dataset, options);
    expect(model.summary.openReconciliations).toBe(1);
    expect(model.summary.reconciliationNetDifference).toBe(500);
    expect(model.summary.reconciliationAbsoluteDifference).toBe(500);
    const briefText = revenueReportBriefRows(model).flat().join(" ");
    const summaryText = revenueReportSummaryRows(model).flat().join(" ");
    expect(REVENUE_RECONCILIATION_SCOPE_NOTICE).toContain("은행 입금자료");
    expect(briefText).toContain("업체 보고자료와 ParkMaster 시스템 집계자료 간 비교");
    expect(`${briefText} ${summaryText}`).not.toContain("세입대사 완료");
    expect(summaryText).toContain("외부 수납자료");
    expect(summaryText).toContain("미연계");
  });

  it("uses public-sector brief labels and converts to the shared HWPX model", () => {
    const model = buildRevenueReportModel(dataset, options);
    expect(revenueReportBriefRows(model).map(row => row[0])).toEqual(["담당부서", "보고기간", "보고대상", "주요내용", "작성목적", "산출기준"]);
    expect(revenueReportBriefRows(model)[0][1]).toBe("제주시청 차량관리과 운영팀");
    const compatible = toOperationsCompatibleRevenueModel(model);
    expect(compatible.period).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(compatible.tables).toBe(model.tables);
    expect(compatible.selectedFieldCount).toBe(model.selectedFieldCount);
    expect(compatible.sensitiveFieldCount).toBe(0);
  });

  it("falls back safely when field JSON and sort values are invalid", () => {
    const parsed = parseRevenueReportOptions({
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      revenue_sections: "unknown",
      revenue_fields: "{invalid",
      revenue_sort: "unknown",
      revenue_orientation: "unknown",
    });
    expect(parsed.selectedSections).toEqual(["overview"]);
    expect(parsed.selectedFields.certified).toEqual(defaultRevenueReportFields().certified);
    expect(parsed.sort).toBe("attention");
    expect(parsed.orientation).toBe("portrait");
  });
});
