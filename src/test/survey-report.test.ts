import { describe, expect, it } from "vitest";
import {
  SURVEY_REPORT_PRESETS,
  SURVEY_REPORT_SAMPLE_DATASET,
  SURVEY_REPORT_SECTIONS,
  assertCompleteSurveyResult,
  buildSurveyReportModel,
  defaultSurveyReportFields,
  parseSurveyReportOptions,
  surveyReportBriefRows,
  surveyReportSummaryRows,
  toOperationsCompatibleSurveyModel,
  type SurveyReportDataset,
} from "@/lib/survey-report";

const allSections = SURVEY_REPORT_SECTIONS.map(section => section.id).join(",");
const allOptions = (overrides: Record<string, string> = {}) => parseSurveyReportOptions({
  period_start: "2026-07-01",
  period_end: "2026-08-31",
  survey_as_of_date: "2026-08-31",
  survey_sections: allSections,
  survey_fields: JSON.stringify(defaultSurveyReportFields()),
  survey_lot_types: "offstreet,building,onstreet",
  survey_sort: "attention",
  survey_orientation: "landscape",
  ...overrides,
});

describe("survey report", () => {
  it("defines selectable public-sector survey sections, fields and presets", () => {
    expect(SURVEY_REPORT_SECTIONS.map(section => section.id)).toEqual([
      "overview", "workflow", "lot_types", "basic", "infra", "operation", "usage", "sensor_plan", "photos", "documents", "risks",
    ]);
    expect(SURVEY_REPORT_PRESETS.standard.sections).toHaveLength(11);
    expect(SURVEY_REPORT_PRESETS.audit.sections).toContain("documents");
    expect(SURVEY_REPORT_PRESETS.approval.sections).toContain("workflow");
    const fields = defaultSurveyReportFields();
    expect(fields.workflow).toContain("document_numbers");
    expect(fields.basic).toContain("type_specific");
    expect(fields.photos).toContain("file_evidence");
    expect(fields.workflow).not.toContain("reviewer_id");
    expect(fields.basic).not.toContain("gps");
  });

  it("summarizes progress, review, approval and all three parking-lot types deterministically", () => {
    const model = buildSurveyReportModel(SURVEY_REPORT_SAMPLE_DATASET, allOptions());
    expect(model.summary).toMatchObject({
      parkingLots: 3,
      surveys: 4,
      inProgress: 1,
      review: 1,
      approved: 1,
      rejected: 1,
      offstreetSurveys: 2,
      buildingSurveys: 1,
      onstreetSurveys: 1,
      totalSpaces: 478,
      completeRecords: 2,
      completionRate: 50,
    });
    expect(model.lotTypeLabels).toEqual(["노외주차장", "주차빌딩", "노상주차장"]);
    const workflow = model.tables.find(table => table.id === "workflow")!;
    expect(workflow.rows.flatMap(row => Object.values(row))).toEqual(expect.arrayContaining(["승인", "검토중", "조사중", "반려"]));
  });

  it("reports basic facilities, operation, infrastructure, usage and sensor plans without mixing sources", () => {
    const model = buildSurveyReportModel(SURVEY_REPORT_SAMPLE_DATASET, allOptions());
    const basicText = model.tables.filter(table => table.id === "basic").flatMap(table => table.rows.flatMap(row => Object.values(row))).join(" ");
    const operationText = model.tables.filter(table => table.id === "operation").flatMap(table => table.rows.flatMap(row => Object.values(row))).join(" ");
    const infraText = model.tables.filter(table => table.id === "infra").flatMap(table => table.rows.flatMap(row => Object.values(row))).join(" ");
    const usageText = model.tables.filter(table => table.id === "usage").flatMap(table => table.rows.flatMap(row => Object.values(row))).join(" ");
    const sensorText = model.tables.filter(table => table.id === "sensor_plan").flatMap(table => table.rows.flatMap(row => Object.values(row))).join(" ");
    expect(basicText).toContain("배수 양호·보행 양호");
    expect(basicText).toContain("층수 5층·소방 양호");
    expect(basicText).toContain("중앙사거리~시민회관");
    expect(operationText).toContain("카드·모바일");
    expect(infraText).toContain("차단기·LPR·무인정산기·CCTV");
    expect(usageText).toContain("상가이용객·관광객");
    expect(sensorText).toContain("구간별 가로등");
    expect(model.summary).toMatchObject({ installedSensors: 280, plannedSensors: 128, plannedGateways: 7 });
  });

  it("checks photo evidence, official document numbers and deterministic validation risks", () => {
    const model = buildSurveyReportModel(SURVEY_REPORT_SAMPLE_DATASET, allOptions());
    expect(model.summary).toMatchObject({
      photos: 7,
      surveysWithPanorama: 4,
      missingTypePhotos: 2,
      linkedDocuments: 2,
      surveysMissingDocuments: 2,
      riskCount: 5,
    });
    const riskText = model.tables.find(table => table.id === "risks")!.rows.flatMap(row => Object.values(row)).join(" ");
    expect(riskText).toContain("노상 필수현황 누락");
    expect(riskText).toContain("형태별 현장사진 누락");
    expect(riskText).toContain("공식문서번호 미연계");
    const documentText = model.tables.find(table => table.id === "documents")!.rows.flatMap(row => Object.values(row)).join(" ");
    expect(documentText).toContain("제주시청-차량관리과운영팀-2026-0701");
    expect(model.riskNarrative).toContain("자료 보완 조사 2건");
  });

  it("builds a dedicated parking-lot-type status table", () => {
    const model = buildSurveyReportModel(SURVEY_REPORT_SAMPLE_DATASET, allOptions());
    const table = model.tables.find(item => item.id === "lot_types")!;
    expect(table.rows).toHaveLength(3);
    expect(table.rows.map(row => row.lot_type)).toEqual(["노외주차장", "주차빌딩", "노상주차장"]);
    expect(table.rows[0]).toMatchObject({ surveys: "2건", total_spaces: "200면", approved: "1건" });
    expect(table.rows[1]).toMatchObject({ surveys: "1건", total_spaces: "210면", complete_records: "1건" });
    expect(table.rows[2]).toMatchObject({ surveys: "1건", total_spaces: "68면", complete_records: "0건" });
  });

  it("applies period, lot type and workflow status filters consistently", () => {
    const building = buildSurveyReportModel(SURVEY_REPORT_SAMPLE_DATASET, allOptions({
      survey_lot_types: "building",
      survey_statuses: "review",
    }));
    expect(building.summary).toMatchObject({ parkingLots: 1, surveys: 1, buildingSurveys: 1, review: 1, totalSpaces: 210 });
    expect(building.lotTypeLabels).toEqual(["주차빌딩"]);
    expect(building.tables.find(table => table.id === "workflow")!.rows).toHaveLength(1);

    const early = buildSurveyReportModel(SURVEY_REPORT_SAMPLE_DATASET, allOptions({ period_end: "2026-07-31", survey_as_of_date: "2026-07-31" }));
    expect(early.summary.surveys).toBe(2);
    expect(early.summary.inProgress).toBe(0);
    expect(early.summary.rejected).toBe(0);
  });

  it("supports field selection, protected-field counting and deterministic sorting", () => {
    const fields = defaultSurveyReportFields();
    fields.workflow = ["lot", "status", "author_name", "document_numbers"];
    fields.basic = ["lot", "gps"];
    const model = buildSurveyReportModel(SURVEY_REPORT_SAMPLE_DATASET, allOptions({
      survey_fields: JSON.stringify(fields),
      survey_sort: "date_desc",
    }));
    expect(model.protectedFieldCount).toBe(2);
    expect(model.tables.find(table => table.id === "workflow")!.columns.map(column => column.key)).toEqual(["lot", "status", "document_numbers", "author_name"]);
    expect(model.tables.find(table => table.id === "workflow")!.rows[0].lot).toBe("동문 공영주차장");
    expect(model.tables.find(table => table.id === "basic")!.columns.map(column => column.key)).toEqual(["lot", "gps"]);
  });

  it("provides public-sector brief, summary, evidence and Operations-compatible output", () => {
    const model = buildSurveyReportModel(SURVEY_REPORT_SAMPLE_DATASET, allOptions());
    expect(surveyReportBriefRows(model).map(row => row[0])).toEqual(["담당부서", "보고기간", "보고대상", "주요내용", "작성목적", "산출기준"]);
    expect(surveyReportBriefRows(model).flat()).toContain("제주시청 차량관리과 운영팀");
    expect(surveyReportSummaryRows(model).flat()).toContain("자료 검증완료");
    expect(surveyReportSummaryRows(model).flat()).toContain("노외·빌딩·노상");
    const compatible = toOperationsCompatibleSurveyModel(model);
    expect(compatible.summary).toMatchObject({ parkingLots: 3, totalSpaces: 478 });
    expect(compatible.tables).toBe(model.tables);
    expect(model.evidenceMetadata).toMatchObject({ complete: true, queryLimit: 5000, truncationPolicy: "fail" });
    expect(model.evidenceMetadata.sourceTables).toEqual(expect.arrayContaining(["surveys", "survey_photos", "parking_lots", "official_documents"]));
    expect(Object.values(model.evidenceMetadata.sources).every(source => source.complete && source.loaded === source.expected)).toBe(true);
  });

  it("fails explicitly for truncated, over-limit and database-error results", () => {
    expect(() => assertCompleteSurveyResult("현황조사", { data: [{ id: 1 }], count: 2, error: null })).toThrow("2건 중 1건만 조회");
    expect(() => assertCompleteSurveyResult("조사사진", { data: [], count: 5001, error: null })).toThrow("보고서 생성을 중단");
    expect(() => assertCompleteSurveyResult("기본시설", { data: null, count: null, error: { message: "권한 없음" } })).toThrow("권한 없음");
  });

  it("refuses to build from incomplete evidence metadata", () => {
    const dataset: SurveyReportDataset = structuredClone(SURVEY_REPORT_SAMPLE_DATASET);
    dataset.evidenceMetadata = {
      complete: false,
      collectedAt: "2026-08-04T00:00:00.000Z",
      queryLimit: 5000,
      truncationPolicy: "fail",
      sourceTables: ["surveys"],
      filters: { periodStart: "2026-07-01", periodEnd: "2026-08-31", asOfDate: "2026-08-31", lotTypes: ["offstreet", "building", "onstreet"], statuses: [], includeInvalidated: false },
      sources: { surveys: { expected: 4, loaded: 3, complete: false } },
    };
    expect(() => buildSurveyReportModel(dataset, allOptions())).toThrow("원천자료가 완전하지 않아");
  });

  it("falls back safely for invalid option values", () => {
    const options = parseSurveyReportOptions({
      period_start: "2026-01-01",
      period_end: "2026-12-31",
      survey_sections: "unknown",
      survey_fields: "{invalid",
      survey_sort: "unknown",
      survey_orientation: "unknown",
    });
    expect(options.selectedSections).toEqual(["overview"]);
    expect(options.selectedFields.workflow).toEqual(defaultSurveyReportFields().workflow);
    expect(options.sort).toBe("attention");
    expect(options.orientation).toBe("portrait");
    expect(options.lotTypes).toEqual(["offstreet", "building", "onstreet"]);
  });
});
