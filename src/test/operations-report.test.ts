import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  buildOperationsReportBrief,
  buildOperationsReportModel,
  createOperationsHwpx,
  defaultOperationsReportFields,
  fitOperationsReportTable,
  isSupportedPdfFont,
  operationsReportColumnAlignment,
  operationsReportColumnWeights,
  operationsReportHwpxChunkSize,
  operationsReportHwpxFirstPageChunkSize,
  operationsReportHwpxRowHeight,
  operationsReportHwpxTableTypography,
  operationsReportKeyValueWidths,
  operationsReportTableTypography,
  parseOperationsReportOptions,
  selectOfficeDocumentFont,
  validateOperationsHwpx,
  type OperationsReportDataset,
} from "@/lib/operations-report";

const dataset: OperationsReportDataset = {
  parkingLots: [
    { id: "lot-1", code: "JJP-001", name: "동문공설주차장", lot_type: "offstreet", operator_type: "direct", total_spaces: 120, status: "active" },
    { id: "lot-2", code: "JJP-002", name: "칠성골주차빌딩", lot_type: "building", operator_type: "outsourced", total_spaces: 240, status: "active" },
  ],
  contracts: [{ id: "contract-1", company_name: "제주주차서비스", contract_number: "OPS-2026-01", contract_start: "2026-01-01", contract_end: "2026-12-31", contract_amount: 120000000, status: "active", parking_lots: { name: "칠성골주차빌딩", lot_type: "building" } }],
  staff: [{ id: "staff-1", staff_name: "홍길동", phone: "010-0000-0000", position: "주무관", staff_type: "resident", hire_date: "2025-01-01", is_active: true, parking_lots: { name: "동문공설주차장", lot_type: "offstreet" } }],
  fees: [],
  exemptions: [],
  passes: [{ pass_number: "PASS-1", pass_start: "2026-08-01", pass_end: "2026-08-31", fee_amount: 100000, fee_paid: 100000, status: "active", vehicle_number: "12가3456", parking_lots: { name: "동문공설주차장", lot_type: "offstreet" } }],
  enforcement: [{ enforcement_number: "ENF-1", violation_date: "2026-08-02T10:00:00", violation_type: "불법주차", fine_amount: 40000, payment_status: "unpaid", parking_lots: { name: "동문공설주차장", lot_type: "offstreet" } }],
  freeHours: [],
  abandoned: [{ record_number: "WO-1", title: "방치차량 처리", parking_lot_name: "동문공설주차장", owner_name: "운영팀", due_date: "2026-08-10", status: "assigned", payload: { workflow_key: "abandoned_vehicle", reportedAt: "2026-08-01", disposition: "확인중" } }],
  security: [{ record_number: "SEC-1", title: "CCTV 권한 점검", parking_lot_name: "통합관제실", owner_name: "보안담당", status: "completed", payload: { workflow_key: "security_inspection", inspectionType: "CCTV 접근권한", inspectionDate: "2026-08-02" } }],
};

describe("operations report rules", () => {
  it("rejects an HTML fallback response before registering a PDF font", () => {
    const html = new TextEncoder().encode("<!doctype html><html></html>").buffer;
    const trueType = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00]).buffer;

    expect(isSupportedPdfFont(html)).toBe(false);
    expect(isSupportedPdfFont(trueType)).toBe(true);
  });

  it("uses Malgun Gothic first and Human Gothic when it is unavailable", () => {
    expect(selectOfficeDocumentFont(true)).toBe("맑은 고딕");
    expect(selectOfficeDocumentFont(false)).toBe("휴먼고딕");
  });

  it("aligns identifiers centrally, amounts right, and descriptive text left", () => {
    expect(operationsReportColumnAlignment("status")).toBe("center");
    expect(operationsReportColumnAlignment("contract_amount")).toBe("right");
    expect(operationsReportColumnAlignment("company_name")).toBe("left");
  });

  it("keeps dense operational tables readable instead of shrinking below 8pt", () => {
    expect(operationsReportTableTypography(10, "portrait").body).toBeGreaterThanOrEqual(8);
    expect(operationsReportTableTypography(12, "portrait").header).toBeGreaterThanOrEqual(8.3);
    expect(operationsReportTableTypography(10, "landscape").body).toBeGreaterThan(
      operationsReportTableTypography(10, "portrait").body,
    );
  });

  it("uses the same typography and key-value geometry in PDF and editable HWPX", () => {
    const pdfTypography = operationsReportTableTypography(10, "portrait");
    const hwpxTypography = operationsReportHwpxTableTypography(10, "portrait");
    expect(hwpxTypography.body).toBe(pdfTypography.body);
    expect(hwpxTypography.header).toBe(pdfTypography.header);
    expect(hwpxTypography.lineHeight).toBe(pdfTypography.lineHeight);
    expect(operationsReportKeyValueWidths("portrait").reduce((sum, width) => sum + width, 0)).toBeCloseTo(100);
    expect(operationsReportKeyValueWidths("portrait")[0]).toBe(operationsReportKeyValueWidths("portrait")[2]);
  });

  it("splits editable tables before they can enter the page footer area", () => {
    expect(operationsReportHwpxChunkSize(10, "portrait")).toBe(19);
    expect(operationsReportHwpxChunkSize(10, "landscape")).toBe(14);
    expect(operationsReportHwpxFirstPageChunkSize(10, "portrait")).toBe(5);
    expect(operationsReportHwpxFirstPageChunkSize(10, "landscape")).toBe(0);
    expect(operationsReportHwpxRowHeight(10, "portrait")).toBe(3200);
  });

  it("uses a non-sensitive default preset", () => {
    const options = parseOperationsReportOptions({ period_start: "2026-08-01", period_end: "2026-08-31" });
    const model = buildOperationsReportModel(dataset, options);
    expect(options.selectedSections).toEqual(["overview", "lots", "contracts", "passes", "enforcement"]);
    expect(options.orientation).toBe("portrait");
    expect(model.sensitiveFieldCount).toBe(0);
    expect(model.summary.totalSpaces).toBe(360);
    expect(model.summary.unpaidFine).toBe(40000);
  });

  it("uses landscape only when it is explicitly selected", () => {
    const options = parseOperationsReportOptions({
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      ops_orientation: "landscape",
    });
    expect(options.orientation).toBe("landscape");
  });

  it("preserves selected section and field order", () => {
    const fields = defaultOperationsReportFields();
    fields.staff = ["lot", "position", "staff_name", "phone"];
    const options = parseOperationsReportOptions({
      period_start: "2026-08-01", period_end: "2026-08-31",
      ops_sections: "overview,staff", ops_fields: JSON.stringify(fields),
    });
    const model = buildOperationsReportModel(dataset, options);
    expect(model.tables[0].columns.map(column => column.key)).toEqual(["lot", "staff_name", "position", "phone"]);
    expect(model.sensitiveFieldCount).toBe(2);
  });

  it("keeps every selected portrait field as an independent column", () => {
    const options = parseOperationsReportOptions({ period_start: "2026-08-01", period_end: "2026-08-31" });
    const model = buildOperationsReportModel(dataset, options);
    const source = model.tables.find(table => table.id === "lots")!;
    const compact = fitOperationsReportTable(source, "portrait");

    expect(source.columns).toHaveLength(6);
    expect(compact.title).toBe("주차장 운영");
    expect(compact.columns).toHaveLength(6);
    expect(compact.columns.map(column => column.label)).toEqual(["코드", "주차장", "형태", "운영방식", "주차면", "상태"]);
    expect(compact.rows[0].operator_type).toBe("직영");
    expect(compact.rows[0].status).toBe("운영");
  });

  it("builds a public-sector report overview from report evidence", () => {
    const options = parseOperationsReportOptions({ period_start: "2026-08-01", period_end: "2026-08-31" });
    const model = buildOperationsReportModel(dataset, options);
    const brief = buildOperationsReportBrief({ model, authorName: "운영팀 주무관", documentSummary: "후속 조치 우선순위를 결정하기 위함." });

    expect(brief.map(row => row[0])).toEqual(["담당부서", "보고기간", "보고대상", "주요내용", "작성목적", "산출기준"]);
    expect(brief.find(row => row[0] === "담당부서")?.[1]).toBe("제주시청 차량관리과 운영팀");
    expect(brief.find(row => row[0] === "작성목적")?.[1]).toContain("우선순위");
    expect(brief.find(row => row[0] === "산출기준")?.[1]).toContain("등록된 업무자료");
  });

  it("allocates more table width to content-heavy columns", () => {
    const columns = [
      { key: "status", label: "상태" },
      { key: "name", label: "주차장" },
      { key: "legal_basis", label: "법적 근거" },
    ];
    const weights = operationsReportColumnWeights(columns, [
      { status: "운영", name: "제주시청 제1공영주차장", legal_basis: "제주특별자치도 주차장 설치 및 관리 조례 제12조" },
      { status: "운영", name: "동문재래시장 공영주차장", legal_basis: "주차장법 제9조" },
    ]);

    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
    expect(weights[1]).toBeGreaterThan(weights[0]);
    expect(weights[2]).toBeGreaterThan(weights[0]);
  });

  it("creates a parseable Korean HWPX document", async () => {
    const options = parseOperationsReportOptions({ period_start: "2026-08-01", period_end: "2026-08-31" });
    const model = buildOperationsReportModel(dataset, options);
    const blob = await createOperationsHwpx({
      model,
      title: "2026년 8월 운영관리 종합 현황 보고서",
      reportNumber: "RPT-OPS-TEST-001",
      officialDocumentNumber: "제주시청-차량관리과운영팀-2026-0142",
      authorName: "테스트 주무관",
      organizationName: "제주시청",
      disclosureStatus: "공개",
    });
    const validation = await validateOperationsHwpx(blob);
    const archive = await JSZip.loadAsync(await blob.arrayBuffer());
    const header = await archive.file("Contents/header.xml")!.async("string");
    const sectionText = (await Promise.all(
      Object.keys(archive.files)
        .filter(path => /^Contents\/section\d+\.xml$/.test(path))
        .map(path => archive.file(path)!.async("string")),
    )).join("\n");
    const fontRefs = header.match(/<hh:fontRef[^>]+>/g) || [];
    const fontFaces = [...header.matchAll(/<hh:font\b[^>]*face="([^"]+)"/g)].map(match => match[1]);
    const parkingLotTable = sectionText.match(/<hp:tbl\b[^>]*colCnt="6"[\s\S]*?<\/hp:tbl>/)?.[0] || "";
    const parkingLotTableWidth = Number(parkingLotTable.match(/<hp:sz\b[^>]*width="(\d+)"/)?.[1] || 0);
    const parkingLotHeaderRow = (parkingLotTable.match(/<hp:tr\b[\s\S]*?<\/hp:tr>/g) || [])[0] || "";
    const parkingLotColumnWidths = [...parkingLotHeaderRow.matchAll(/<hp:cellSz\b[^>]*width="(\d+)"/g)]
      .map(match => Number(match[1]));
    expect(blob.type).toBe("application/hwp+zip");
    expect(blob.size).toBeGreaterThan(1000);
    expect(validation.valid).toBe(true);
    expect(validation.textLength).toBeGreaterThan(20);
    expect(fontRefs.length).toBeGreaterThan(0);
    expect(fontFaces.length).toBeGreaterThan(0);
    expect(fontFaces.every(fontFace => fontFace === "맑은 고딕")).toBe(true);
    expect(fontRefs.every(fontRef => ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"]
      .every(script => new RegExp(`${script}="0"`).test(fontRef)))).toBe(true);
    expect(header).toContain('height="1500"');
    expect(header).toContain('height="1200"');
    expect(header).toContain('height="1000"');
    expect(header).toContain('height="840"');
    expect(header).toContain('height="950"');
    expect(header).not.toContain('faceColor="#E8EEF4"');
    expect(sectionText).toContain('hideFirstEmptyLine="1"');
    expect(parkingLotColumnWidths).toHaveLength(6);
    expect(new Set(parkingLotColumnWidths).size).toBeGreaterThan(1);
    expect(parkingLotColumnWidths.reduce((sum, width) => sum + width, 0)).toBe(parkingLotTableWidth);
    expect(parkingLotTable).toMatch(/<hp:outMargin\b[^>]*top="450"/);
    expect(sectionText).toContain("담당부서");
    expect(sectionText).toContain("보고기간");
    expect(sectionText).toContain("보고대상");
    expect(sectionText).toContain("산출기준");
    expect(sectionText).not.toContain(">누가<");
    expect(sectionText).not.toContain(">언제<");
  });

  it("repeats a balanced heading and header for each long HWPX table page", async () => {
    const parkingLots = Array.from({ length: 40 }, (_, index) => ({
      code: `JJP-${String(index + 1).padStart(3, "0")}`,
      name: `검증 공영주차장 ${String(index + 1).padStart(3, "0")}`,
      lot_type: ["offstreet", "building", "onstreet"][index % 3],
      operator_type: index % 4 === 0 ? "outsourced" : "direct",
      operator_name: index % 4 === 0 ? "제주주차서비스" : "-",
      total_spaces: 20 + index,
      floors: index % 3 === 1 ? 4 : 0,
      status: "active",
      document_number: `제주시청-차량관리과운영팀-2026-${String(index + 1).padStart(4, "0")}`,
      updated_at: "2026-08-04T09:00:00",
    }));
    const options = parseOperationsReportOptions({
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      ops_sections: "overview,lots",
      ops_fields: JSON.stringify({
        lots: ["code", "name", "lot_type", "operator_type", "operator_name", "total_spaces", "floors", "status", "document_number", "updated_at"],
      }),
    });
    const model = buildOperationsReportModel({ ...dataset, parkingLots }, options);
    const blob = await createOperationsHwpx({
      model,
      title: "공영주차장 운영 현황 검증 보고서",
      reportNumber: "RPT-OPS-TEST-002",
      orientation: "portrait",
    });
    const archive = await JSZip.loadAsync(await blob.arrayBuffer());
    const sectionText = (await Promise.all(
      Object.keys(archive.files)
        .filter(path => /^Contents\/section\d+\.xml$/.test(path))
        .map(path => archive.file(path)!.async("string")),
    )).join("\n");
    const detailTables = sectionText.match(/<hp:tbl\b[^>]*colCnt="10"[\s\S]*?<\/hp:tbl>/g) || [];
    const rowCounts = detailTables.map(table => Number(table.match(/\browCnt="(\d+)"/)?.[1] || 0));

    expect(detailTables).toHaveLength(3);
    expect(rowCounts.every(count => count <= 19)).toBe(true);
    expect(sectionText).toContain("(계속 2/3)");
    expect(sectionText).toContain("(계속 3/3)");
    expect(sectionText).not.toContain("__PARKMASTER_PAGE_BREAK__");
    expect((sectionText.match(/pageBreak="1"/g) || [])).toHaveLength(2);
    expect(rowCounts).toEqual([6, 19, 18]);
    expect(detailTables.every(table => !table.includes("주차장 운영"))).toBe(true);
    expect(detailTables.every(table => table.includes('height="3200"'))).toBe(true);
    expect(detailTables.every(table => /<hp:outMargin\b[^>]*top="450"/.test(table))).toBe(true);
  });
});
