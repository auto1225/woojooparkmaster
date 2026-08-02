import { supabase } from "@/integrations/supabase/client";
import { createProfessionalExcelBlob, type ExcelSheetConfig } from "@/lib/excel-engine";
import { PRIMARY_DEPARTMENT, PRIMARY_ORGANIZATION } from "@/config/organization";
import type { ReportTemplate } from "@/types/report";
import { LOT_STATUS_LABELS, LOT_TYPE_LABELS, OPERATOR_LABELS } from "@/types/database";
import { CATEGORY_LABELS as COMPLAINT_CATEGORY_LABELS, COMPLAINT_STATUS_LABELS, PRIORITY_LABELS as COMPLAINT_PRIORITY_LABELS } from "@/types/complaint";
import { MAINT_STATUS_LABELS, MAINT_TYPE_LABELS, PRIORITY_LABELS as MAINT_PRIORITY_LABELS } from "@/types/facility";
import { OPEN_COMPLAINT_STATUS_SET, OPEN_MAINTENANCE_STATUS_SET } from "@/lib/work-status";

type ReportParameters = Record<string, string>;

interface ReportDataset {
  parkingLots: any[];
  revenue: any[];
  complaints: any[];
  equipment: any[];
  maintenance: any[];
  summary: Record<string, number>;
}

const REPORT_LOT_TYPE_LABELS = { ...LOT_TYPE_LABELS, surface: "지상주차장", building: "건축물식 주차장", mechanical: "기계식 주차장" };
const REPORT_OPERATOR_LABELS = { ...OPERATOR_LABELS, public: "공공직영", private: "민간운영" };
const REPORT_LOT_STATUS_LABELS = { ...LOT_STATUS_LABELS, normal: "운영중", maintenance: "정비중" };
const REPORT_COMPLAINT_STATUS_LABELS = { ...COMPLAINT_STATUS_LABELS, processing: "처리중", pending: "대기", resolved: "처리완료", cancelled: "취소" };
const REPORT_COMPLAINT_PRIORITY_LABELS = { ...COMPLAINT_PRIORITY_LABELS, medium: "보통", critical: "긴급" };
const REPORT_MAINT_STATUS_LABELS = { ...MAINT_STATUS_LABELS, waiting: "대기", pending: "대기", closed: "종결" };
const REPORT_MAINT_PRIORITY_LABELS = { ...MAINT_PRIORITY_LABELS, normal: "보통", urgent: "긴급" };

export interface GenerateReportInput {
  template: ReportTemplate;
  title: string;
  description?: string;
  parameters: ReportParameters;
  outputFormat: "pdf" | "pdf+xlsx";
  userId: string;
  authorName?: string;
  aiSummary?: string;
  reportId?: string;
  reportNumber?: string;
}

export interface GeneratedReportResult {
  id: string;
  reportNumber: string;
  filePath: string;
  excelPath?: string;
}

export interface GenerateReportSamplesInput {
  templates: ReportTemplate[];
  userId: string;
  authorName?: string;
  onProgress?: (completed: number, total: number) => void;
}

export interface GenerateReportSamplesResult {
  completed: number;
  failed: string[];
  verifiedFiles: number;
}

function relationName(value: unknown): string {
  if (Array.isArray(value)) return String(value[0]?.name || "-");
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name?: string }).name || "-");
  }
  return "-";
}

function koreanLabel(value: unknown, labels: Record<string, string>, fallback = "미확인"): string {
  if (value == null || value === "") return fallback;
  return labels[String(value)] || fallback;
}

function localizedParkingLots(rows: any[]) {
  return rows.map((row) => ({
    ...row,
    lot_type: koreanLabel(row.lot_type, REPORT_LOT_TYPE_LABELS, "기타"),
    operator_type: koreanLabel(row.operator_type, REPORT_OPERATOR_LABELS, "운영방식 미확인"),
    status: koreanLabel(row.status, REPORT_LOT_STATUS_LABELS, "상태 미확인"),
  }));
}

function localizedComplaints(rows: any[]) {
  return rows.map((row) => ({
    ...row,
    category: koreanLabel(row.category, COMPLAINT_CATEGORY_LABELS, "기타"),
    priority: koreanLabel(row.priority, REPORT_COMPLAINT_PRIORITY_LABELS, "보통"),
    status: koreanLabel(row.status, REPORT_COMPLAINT_STATUS_LABELS, "상태 미확인"),
  }));
}

function localizedMaintenance(rows: any[]) {
  return rows.map((row) => ({
    ...row,
    maintenance_type: koreanLabel(row.maintenance_type, MAINT_TYPE_LABELS, "기타"),
    priority: koreanLabel(row.priority, REPORT_MAINT_PRIORITY_LABELS, "보통"),
    status: koreanLabel(row.status, REPORT_MAINT_STATUS_LABELS, "상태 미확인"),
  }));
}

function getPeriod(parameters: ReportParameters): { start: string; end: string } {
  if (parameters.period_start) {
    return { start: parameters.period_start, end: parameters.period_end || parameters.period_start };
  }
  if (parameters.date) return { start: parameters.date, end: parameters.date };
  if (parameters.week_start) {
    const end = new Date(`${parameters.week_start}T00:00:00`);
    end.setDate(end.getDate() + 6);
    return { start: parameters.week_start, end: end.toISOString().slice(0, 10) };
  }
  if (parameters.month) {
    const [year, month] = parameters.month.split("-").map(Number);
    const end = new Date(year, month, 0);
    return { start: `${parameters.month}-01`, end: end.toISOString().slice(0, 10) };
  }
  if (parameters.quarter_year && parameters.quarter_q) {
    const year = Number(parameters.quarter_year);
    const quarter = Number(parameters.quarter_q);
    const startMonth = (quarter - 1) * 3;
    const end = new Date(year, startMonth + 3, 0);
    return {
      start: `${year}-${String(startMonth + 1).padStart(2, "0")}-01`,
      end: end.toISOString().slice(0, 10),
    };
  }
  if (parameters.year) return { start: `${parameters.year}-01-01`, end: `${parameters.year}-12-31` };

  const today = new Date();
  const date = today.toISOString().slice(0, 10);
  return { start: date, end: date };
}

function defaultParameters(reportType: string, at = new Date()): ReportParameters {
  if (reportType === "daily") {
    const day = new Date(at);
    day.setDate(day.getDate() - 1);
    return { date: day.toISOString().slice(0, 10) };
  }
  if (reportType === "weekly") {
    const end = new Date(at);
    const diff = end.getDay() === 0 ? 7 : end.getDay();
    end.setDate(end.getDate() - diff);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return { week_start: start.toISOString().slice(0, 10) };
  }
  if (reportType === "quarterly") {
    const currentQuarter = Math.floor(at.getMonth() / 3) + 1;
    const quarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
    const year = currentQuarter === 1 ? at.getFullYear() - 1 : at.getFullYear();
    return { quarter_year: String(year), quarter_q: String(quarter) };
  }
  if (reportType === "yearly") return { year: String(at.getFullYear() - 1) };

  const previousMonth = new Date(at.getFullYear(), at.getMonth() - 1, 1);
  return { month: previousMonth.toISOString().slice(0, 7) };
}

export function getDefaultReportParameters(reportType: string, at = new Date()): ReportParameters {
  return defaultParameters(reportType, at);
}

export async function getReportEvidence(parameters: ReportParameters) {
  const period = getPeriod(parameters);
  const dataset = await collectReportData(period.start, period.end);
  return {
    period,
    summary: dataset.summary,
    sourceCounts: {
      parkingLots: dataset.parkingLots.length,
      revenueRows: dataset.revenue.length,
      complaintRows: dataset.complaints.length,
      equipmentRows: dataset.equipment.length,
      maintenanceRows: dataset.maintenance.length,
    },
  };
}

async function collectReportData(start: string, end: string): Promise<ReportDataset> {
  const startAt = `${start}T00:00:00`;
  const endAt = `${end}T23:59:59`;
  const [lotsResult, revenueResult, complaintsResult, equipmentResult, maintenanceResult] = await Promise.all([
    supabase
      .from("parking_lots")
      .select("id, code, name, lot_type, operator_type, total_spaces, disabled_spaces, ev_spaces, status")
      .order("name"),
    supabase
      .from("revenue_daily")
      .select("revenue_date, total_amount, total_vehicles, verified, parking_lots(name)")
      .gte("revenue_date", start)
      .lte("revenue_date", end)
      .order("revenue_date", { ascending: false })
      .limit(500),
    supabase
      .from("complaints")
      .select("complaint_number, title, category, priority, status, due_date, received_at, parking_lots(name)")
      .gte("received_at", startAt)
      .lte("received_at", endAt)
      .order("received_at", { ascending: false })
      .limit(500),
    supabase
      .from("equipment")
      .select("equipment_code, name, equipment_type, status, next_maintenance_date, parking_lots(name)")
      .order("status")
      .limit(500),
    supabase
      .from("maintenance_logs")
      .select("log_number, title, maintenance_type, priority, status, total_cost, reported_at, parking_lots(name)")
      .gte("reported_at", startAt)
      .lte("reported_at", endAt)
      .order("reported_at", { ascending: false })
      .limit(500),
  ]);

  if (lotsResult.error) throw lotsResult.error;
  const parkingLots = lotsResult.data || [];
  const revenue = revenueResult.error ? [] : revenueResult.data || [];
  const complaints = complaintsResult.error ? [] : complaintsResult.data || [];
  const equipment = equipmentResult.error ? [] : equipmentResult.data || [];
  const maintenance = maintenanceResult.error ? [] : maintenanceResult.data || [];
  const today = new Date().toISOString().slice(0, 10);

  return {
    parkingLots,
    revenue,
    complaints,
    equipment,
    maintenance,
    summary: {
      parkingLotCount: parkingLots.length,
      activeParkingLots: parkingLots.filter((row: any) => row.status === "active").length,
      totalSpaces: parkingLots.reduce((sum: number, row: any) => sum + Number(row.total_spaces || 0), 0),
      revenueTotal: revenue.reduce((sum: number, row: any) => sum + Number(row.total_amount || 0), 0),
      revenueVehicles: revenue.reduce((sum: number, row: any) => sum + Number(row.total_vehicles || 0), 0),
      unverifiedRevenue: revenue.filter((row: any) => !row.verified).length,
      complaintCount: complaints.length,
      openComplaints: complaints.filter((row: any) => OPEN_COMPLAINT_STATUS_SET.has(row.status)).length,
      overdueComplaints: complaints.filter((row: any) => row.due_date && row.due_date < today && row.status !== "closed").length,
      equipmentCount: equipment.length,
      equipmentAttention: equipment.filter((row: any) => !["normal", "active"].includes(row.status)).length,
      maintenanceCount: maintenance.length,
      openMaintenance: maintenance.filter((row: any) => OPEN_MAINTENANCE_STATUS_SET.has(row.status)).length,
      maintenanceCost: maintenance.reduce((sum: number, row: any) => sum + Number(row.total_cost || 0), 0),
    },
  };
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function createPdf(
  orgName: string,
  reportNumber: string,
  officialDocumentNumber: string,
  title: string,
  description: string,
  authorName: string,
  period: { start: string; end: string },
  data: ReportDataset,
  aiSummary?: string,
): Promise<{ blob: Blob; pageCount: number }> {
  const [{ jsPDF }, fontResponse] = await Promise.all([
    import("jspdf"),
    fetch("/fonts/NanumGothic-Regular.ttf"),
  ]);
  if (!fontResponse.ok) throw new Error("PDF 한글 글꼴을 불러오지 못했습니다.");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("NanumGothic-Regular.ttf", toBase64(await fontResponse.arrayBuffer()));
  doc.addFont("NanumGothic-Regular.ttf", "NanumGothic", "normal");
  doc.setFont("NanumGothic", "normal");

  const pageWidth = 210;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const agencyName = orgName && orgName !== "ParkMaster" ? orgName : PRIMARY_ORGANIZATION;
  const departmentName = PRIMARY_DEPARTMENT.replace(`${PRIMARY_ORGANIZATION} `, "");
  const issuedDate = new Date().toLocaleDateString("ko-KR");
  let y = 14;

  const newPage = () => {
    doc.addPage();
    doc.setFont("NanumGothic", "normal");
    y = 16;
  };
  const ensure = (height: number) => {
    if (y + height > 282) newPage();
  };
  const sectionTitle = (text: string) => {
    ensure(12);
    doc.setFillColor(232, 238, 245);
    doc.setDrawColor(82, 96, 109);
    doc.setLineWidth(0.25);
    doc.rect(margin, y, contentWidth, 8, "F");
    doc.line(margin, y + 8, margin + contentWidth, y + 8);
    doc.setTextColor(24, 43, 61);
    doc.setFontSize(11);
    doc.text(text, margin + 3, y + 5.6);
    y += 11;
  };
  const table = (columns: Array<{ label: string; key: string; width: number }>, rows: any[]) => {
    const drawHeader = () => {
      ensure(8);
      let x = margin;
      doc.setDrawColor(110, 120, 130);
      doc.setLineWidth(0.18);
      doc.setFontSize(8);
      columns.forEach((column) => {
        doc.setFillColor(230, 235, 241);
        doc.setTextColor(20, 30, 40);
        doc.rect(x, y, column.width, 7, "FD");
        doc.text(column.label, x + 1.5, y + 4.8);
        x += column.width;
      });
      y += 7;
    };
    drawHeader();
    if (!rows.length) {
      doc.setFontSize(8);
      doc.text("해당 기간 데이터가 없습니다.", margin + 2, y + 5);
      y += 8;
      return;
    }
    rows.slice(0, 200).forEach((row, index) => {
      if (y + 7 > 282) {
        newPage();
        drawHeader();
      }
      let x = margin;
      columns.forEach((column) => {
        const shade = index % 2 === 0 ? 255 : 247;
        doc.setFillColor(shade, index % 2 === 0 ? 255 : 249, index % 2 === 0 ? 255 : 251);
        doc.setDrawColor(145, 152, 160);
        doc.setTextColor(20, 30, 40);
        doc.rect(x, y, column.width, 7, "FD");
        const text = String(row[column.key] ?? "-");
        const clipped = doc.splitTextToSize(text, column.width - 3)[0] || "";
        doc.text(clipped, x + 1.5, y + 4.7);
        x += column.width;
      });
      y += 7;
    });
    y += 3;
  };

  doc.setTextColor(30, 38, 46);
  doc.setFontSize(9);
  doc.text(agencyName, margin, y);
  doc.text("내부보고", margin + contentWidth, y, { align: "right" });
  doc.setDrawColor(45, 55, 65);
  doc.setLineWidth(0.5);
  doc.line(margin, y + 3, margin + contentWidth, y + 3);
  y += 13;

  doc.setFontSize(18);
  doc.setTextColor(10, 20, 30);
  const titleLines = doc.splitTextToSize(title, 126);
  doc.text(titleLines, margin, y);

  const approvalX = 146;
  const approvalY = y - 8;
  const approvalWidth = 49;
  const approvalCell = approvalWidth / 3;
  doc.setFontSize(7);
  ["담당", "팀장", "과장"].forEach((label, index) => {
    const x = approvalX + approvalCell * index;
    doc.setFillColor(242, 244, 247);
    doc.setDrawColor(90, 98, 106);
    doc.rect(x, approvalY, approvalCell, 7, "FD");
    doc.setTextColor(35, 43, 51);
    doc.text(label, x + approvalCell / 2, approvalY + 4.7, { align: "center" });
    doc.setFillColor(255, 255, 255);
    doc.rect(x, approvalY + 7, approvalCell, 15, "FD");
  });
  y += Math.max(titleLines.length * 7, 18) + 4;

  const metadata = [
    ["관리번호", reportNumber, "문서번호", officialDocumentNumber || "미지정"],
    ["담당부서", departmentName, "작성자", authorName || "-"],
    ["작성일", issuedDate, "공개구분", "내부업무용"],
    ["보고기간", `${period.start} ~ ${period.end}`, "보존기준", "업무기록 관리"],
  ];
  const metaWidths = [24, 66, 24, 66];
  metadata.forEach((row) => {
    let x = margin;
    row.forEach((value, index) => {
      const labelCell = index % 2 === 0;
      doc.setFillColor(labelCell ? 238 : 255, labelCell ? 241 : 255, labelCell ? 245 : 255);
      doc.setDrawColor(110, 120, 130);
      doc.setTextColor(25, 35, 45);
      doc.setFontSize(8);
      doc.rect(x, y, metaWidths[index], 8, "FD");
      doc.text(String(value), x + 2, y + 5.3);
      x += metaWidths[index];
    });
    y += 8;
  });
  y += 6;

  sectionTitle("1. 보고 개요");
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(145, 152, 160);
  doc.rect(margin, y, contentWidth, 18, "FD");
  doc.setTextColor(25, 35, 45);
  doc.setFontSize(8.5);
  const purpose = description || `${period.start}부터 ${period.end}까지 공영주차장 운영 실적과 주요 현안을 종합하여 보고함.`;
  doc.text(doc.splitTextToSize(`가. 보고목적: ${purpose}`, contentWidth - 6), margin + 3, y + 5);
  doc.text(`나. 자료범위: 주차장, 수입, 민원, 시설장비 및 유지보수 등록자료`, margin + 3, y + 13);
  y += 23;

  sectionTitle("2. 핵심 지표");
  const metrics = [
    ["주차장", `${data.summary.activeParkingLots}/${data.summary.parkingLotCount}개 운영`],
    ["주차면", `${data.summary.totalSpaces.toLocaleString("ko-KR")}면`],
    ["기간 수입", `${data.summary.revenueTotal.toLocaleString("ko-KR")}원`],
    ["민원", `${data.summary.complaintCount}건 (기한초과 ${data.summary.overdueComplaints}건)`],
    ["유지보수", `${data.summary.maintenanceCount}건 (미완료 ${data.summary.openMaintenance}건)`],
    ["시설 주의", `${data.summary.equipmentAttention}건`],
  ];
  metrics.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + col * 91;
    const boxY = y + row * 13;
    doc.setFillColor(252, 253, 254);
    doc.setDrawColor(135, 145, 155);
    doc.rect(x, boxY, 87, 10, "FD");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x + 2, boxY + 4);
    doc.setTextColor(30, 41, 59);
    doc.text(value, x + 25, boxY + 4);
  });
  y += 43;

  if (aiSummary) {
    sectionTitle("검토 총평");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(aiSummary, contentWidth - 4);
    lines.forEach((line: string) => {
      ensure(5);
      doc.text(line, margin + 2, y + 3);
      y += 5;
    });
    y += 3;
  }

  sectionTitle("3. 주차장 운영 현황");
  table(
    [
      { label: "코드", key: "code", width: 25 },
      { label: "주차장", key: "name", width: 72 },
      { label: "유형", key: "lot_type", width: 28 },
      { label: "주차면", key: "total_spaces", width: 25 },
      { label: "상태", key: "status", width: 30 },
    ],
    localizedParkingLots(data.parkingLots),
  );

  sectionTitle("4. 수입 현황");
  table(
    [
      { label: "일자", key: "date", width: 30 },
      { label: "주차장", key: "lot", width: 62 },
      { label: "차량", key: "vehicles", width: 25 },
      { label: "수입(원)", key: "amount", width: 38 },
      { label: "검증", key: "verified", width: 25 },
    ],
    data.revenue.map((row: any) => ({
      date: row.revenue_date,
      lot: relationName(row.parking_lots),
      vehicles: Number(row.total_vehicles || 0).toLocaleString("ko-KR"),
      amount: Number(row.total_amount || 0).toLocaleString("ko-KR"),
      verified: row.verified ? "완료" : "미검증",
    })),
  );

  sectionTitle("5. 민원 현황");
  table(
    [
      { label: "번호", key: "number", width: 36 },
      { label: "주차장", key: "lot", width: 46 },
      { label: "제목", key: "title", width: 62 },
      { label: "우선순위", key: "priority", width: 20 },
      { label: "상태", key: "status", width: 16 },
    ],
    localizedComplaints(data.complaints).map((row: any) => ({
      number: row.complaint_number,
      lot: relationName(row.parking_lots),
      title: row.title,
      priority: row.priority,
      status: row.status,
    })),
  );

  sectionTitle("6. 유지보수 현황");
  table(
    [
      { label: "번호", key: "number", width: 36 },
      { label: "주차장", key: "lot", width: 46 },
      { label: "작업", key: "title", width: 62 },
      { label: "우선", key: "priority", width: 18 },
      { label: "상태", key: "status", width: 18 },
    ],
    localizedMaintenance(data.maintenance).map((row: any) => ({
      number: row.log_number,
      lot: relationName(row.parking_lots),
      title: row.title,
      priority: row.priority,
      status: row.status,
    })),
  );

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("NanumGothic", "normal");
    doc.setFontSize(7);
    doc.setDrawColor(180, 186, 192);
    doc.line(margin, 286, margin + contentWidth, 286);
    doc.setTextColor(90, 100, 110);
    doc.text(`${departmentName} | ${reportNumber}`, margin, 291);
    doc.text(`${page}/${pageCount}`, 195, 291, { align: "right" });
  }
  return { blob: doc.output("blob"), pageCount };
}

function createExcelSheets(data: ReportDataset): ExcelSheetConfig[] {
  return [
    {
      name: "요약",
      columns: [
        { key: "metric", label: "지표", width: 180 },
        { key: "value", label: "값", width: 120, format: "number" },
      ],
      data: [
        { metric: "운영 주차장", value: data.summary.activeParkingLots },
        { metric: "전체 주차면", value: data.summary.totalSpaces },
        { metric: "기간 수입", value: data.summary.revenueTotal },
        { metric: "기간 이용 차량", value: data.summary.revenueVehicles },
        { metric: "미검증 수입 자료", value: data.summary.unverifiedRevenue },
        { metric: "민원", value: data.summary.complaintCount },
        { metric: "기한초과 민원", value: data.summary.overdueComplaints },
        { metric: "유지보수", value: data.summary.maintenanceCount },
        { metric: "미완료 유지보수", value: data.summary.openMaintenance },
      ],
    },
    {
      name: "주차장",
      columns: [
        { key: "code", label: "코드", width: 100 },
        { key: "name", label: "주차장", width: 220 },
        { key: "lot_type", label: "유형", width: 100 },
        { key: "operator_type", label: "운영방식", width: 100 },
        { key: "total_spaces", label: "주차면", width: 90, format: "number", aggregation: "sum" },
        { key: "status", label: "상태", width: 90 },
      ],
      data: localizedParkingLots(data.parkingLots),
      totalRow: { label: "합계" },
    },
    {
      name: "수입",
      columns: [
        { key: "revenue_date", label: "일자", width: 110, format: "date" },
        { key: "lot", label: "주차장", width: 200 },
        { key: "total_vehicles", label: "차량", width: 90, format: "number", aggregation: "sum" },
        { key: "total_amount", label: "수입", width: 120, format: "currency", aggregation: "sum" },
        { key: "verified_label", label: "검증", width: 90 },
      ],
      data: data.revenue.map((row: any) => ({
        ...row,
        lot: relationName(row.parking_lots),
        verified_label: row.verified ? "완료" : "미검증",
      })),
      totalRow: { label: "합계" },
    },
    {
      name: "민원",
      columns: [
        { key: "complaint_number", label: "민원번호", width: 130 },
        { key: "lot", label: "주차장", width: 180 },
        { key: "title", label: "제목", width: 260 },
        { key: "category", label: "분류", width: 100 },
        { key: "priority", label: "우선순위", width: 90 },
        { key: "status", label: "상태", width: 90 },
        { key: "due_date", label: "처리기한", width: 110, format: "date" },
      ],
      data: localizedComplaints(data.complaints).map((row: any) => ({ ...row, lot: relationName(row.parking_lots) })),
    },
    {
      name: "유지보수",
      columns: [
        { key: "log_number", label: "작업번호", width: 130 },
        { key: "lot", label: "주차장", width: 180 },
        { key: "title", label: "작업명", width: 260 },
        { key: "maintenance_type", label: "유형", width: 100 },
        { key: "priority", label: "우선순위", width: 90 },
        { key: "status", label: "상태", width: 90 },
        { key: "total_cost", label: "비용", width: 120, format: "currency", aggregation: "sum" },
      ],
      data: localizedMaintenance(data.maintenance).map((row: any) => ({ ...row, lot: relationName(row.parking_lots) })),
      totalRow: { label: "합계" },
    },
  ];
}

function reportNumber(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `RPT-${stamp}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_").slice(0, 80) || "report";
}

export async function generateReport(input: GenerateReportInput): Promise<GeneratedReportResult> {
  const startedAt = Date.now();
  const period = getPeriod(input.parameters);
  let number = input.reportNumber || reportNumber();
  let id = input.reportId;
  const uploadedPaths: string[] = [];
  let replacedPaths: string[] = [];

  try {
    if (id) {
      const { data: existing, error } = await supabase
        .from("report_generated")
        .update({
          title: input.title,
          description: input.description || null,
          parameters_used: input.parameters,
          period_start: period.start,
          period_end: period.end,
          status: "generating",
          error_message: null,
        })
        .eq("id", id)
        .select("report_number, file_path, excel_path")
        .single();
      if (error) throw error;
      if (existing?.report_number) number = existing.report_number;
      replacedPaths = [existing?.file_path, existing?.excel_path].filter(Boolean) as string[];
    } else {
      const { data, error } = await supabase
        .from("report_generated")
        .insert({
          report_number: number,
          template_id: input.template.id,
          title: input.title,
          description: input.description || null,
          parameters_used: input.parameters,
          period_start: period.start,
          period_end: period.end,
          file_format: input.outputFormat,
          status: "generating",
          generated_by: input.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id;
    }

    const [{ data: configRows }, dataset] = await Promise.all([
      supabase.from("system_config").select("config_key, config_value").in("config_key", ["org_name"]),
      collectReportData(period.start, period.end),
    ]);
    const orgName = configRows?.find((row) => row.config_key === "org_name")?.config_value || "ParkMaster";
    const pdf = await createPdf(orgName, number, input.parameters.official_document_number || "", input.title, input.description || "", input.authorName || "", period, dataset, input.aiSummary);
    const basePath = `${input.userId}/${id}`;
    const fileBase = `${safeFileName(input.template.template_code || number)}_${period.start}_${period.end}`;
    const pdfPath = `${basePath}/${fileBase}.pdf`;
    const { error: pdfError } = await supabase.storage.from("reports").upload(pdfPath, pdf.blob, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (pdfError) throw pdfError;
    uploadedPaths.push(pdfPath);

    let excelPath: string | undefined;
    let excelSize = 0;
    if (input.outputFormat === "pdf+xlsx") {
      const excel = await createProfessionalExcelBlob({
        fileName: fileBase,
        orgName,
        title: input.title,
        subtitle: `${period.start} ~ ${period.end}`,
        creator: input.authorName,
        sheets: createExcelSheets(dataset),
      });
      excelPath = `${basePath}/${fileBase}.xlsx`;
      const { error: excelError } = await supabase.storage.from("reports").upload(excelPath, excel, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
      if (excelError) throw excelError;
      uploadedPaths.push(excelPath);
      excelSize = excel.size;
    }

    const { error: updateError } = await supabase
      .from("report_generated")
      .update({
        file_path: pdfPath,
        excel_path: excelPath || null,
        file_format: input.outputFormat,
        file_size: pdf.blob.size + excelSize,
        page_count: pdf.pageCount,
        data_snapshot: dataset as any,
        summary_data: { ...dataset.summary, aiSummary: input.aiSummary || null } as any,
        status: "completed",
        generation_time_ms: Date.now() - startedAt,
        error_message: null,
      })
      .eq("id", id);
    if (updateError) throw updateError;

    const obsoletePaths = replacedPaths.filter((path) => !uploadedPaths.includes(path));
    if (obsoletePaths.length) await supabase.storage.from("reports").remove(obsoletePaths);

    return { id, reportNumber: number, filePath: pdfPath, excelPath };
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from("reports").remove(uploadedPaths);
    const message = error instanceof Error ? error.message : "보고서 생성 중 오류가 발생했습니다.";
    if (id) {
      await supabase
        .from("report_generated")
        .update({ status: "failed", error_message: message, generation_time_ms: Date.now() - startedAt })
        .eq("id", id);
    }
    throw error;
  }
}

export async function verifyStoredReport(path: string): Promise<{ path: string; size: number }> {
  const normalizedPath = path.replace(/^\/+/, "");
  if (!normalizedPath) throw new Error("저장된 파일 경로가 없습니다.");
  const { data, error } = await supabase.storage.from("reports").download(normalizedPath);
  if (error) throw new Error(`저장 파일을 확인하지 못했습니다: ${error.message}`);
  if (!data?.size) throw new Error("저장 파일의 크기가 0바이트입니다.");
  return { path: normalizedPath, size: data.size };
}

export async function regenerateReportSamples(input: GenerateReportSamplesInput): Promise<GenerateReportSamplesResult> {
  const availableTemplates = input.templates.filter((template) => template.id);
  const { data: sampleRows, error: sampleError } = await supabase
    .from("report_generated")
    .select("id, template_id, report_number, file_path, excel_path, created_at")
    .like("report_number", "RG-DEMO-%")
    .order("created_at", { ascending: false });
  if (sampleError) throw sampleError;

  const samples = sampleRows || [];
  const retainedIds = new Set<string>();
  const failed: string[] = [];
  let completed = 0;
  let verifiedFiles = 0;

  for (const [index, template] of availableTemplates.entries()) {
    const existing = samples.find((row) => row.template_id === template.id && !retainedIds.has(row.id));
    const parameters = {
      ...defaultParameters(template.report_type),
      official_document_number: `${PRIMARY_ORGANIZATION}-차량관리과운영팀-샘플-${String(index + 1).padStart(3, "0")}`,
    };
    try {
      const result = await generateReport({
        template,
        title: `[샘플] ${template.name}`,
        description: `${PRIMARY_DEPARTMENT} 업무 검증용 보고서입니다. 등록된 운영 자료를 기준으로 자동 작성했습니다.`,
        parameters,
        outputFormat: "pdf+xlsx",
        userId: input.userId,
        authorName: input.authorName || "업무담당자",
        reportId: existing?.id,
        reportNumber: existing ? undefined : `RG-DEMO-${template.template_code.replace(/[^A-Z0-9]+/gi, "-").slice(0, 40)}`,
      });
      retainedIds.add(result.id);
      await verifyStoredReport(result.filePath);
      verifiedFiles += 1;
      if (result.excelPath) {
        await verifyStoredReport(result.excelPath);
        verifiedFiles += 1;
      }
      completed += 1;
    } catch {
      failed.push(template.name);
    }
    input.onProgress?.(completed + failed.length, availableTemplates.length);
  }

  if (!failed.length) {
    const templateIds = new Set(availableTemplates.map((template) => template.id));
    const obsoleteRows = samples.filter((row) => templateIds.has(row.template_id) && !retainedIds.has(row.id));
    const obsoletePaths = obsoleteRows.flatMap((row) => [row.file_path, row.excel_path]).filter(Boolean) as string[];
    if (obsoletePaths.length) await supabase.storage.from("reports").remove(obsoletePaths);
    if (obsoleteRows.length) {
      const { error } = await supabase.from("report_generated").delete().in("id", obsoleteRows.map((row) => row.id));
      if (error) throw error;
    }
  }

  return { completed, failed, verifiedFiles };
}

export async function runReportSchedule(schedule: any, userId: string, advanceNext: boolean): Promise<GeneratedReportResult> {
  const { data: template, error } = await supabase
    .from("report_templates")
    .select("*")
    .eq("id", schedule.template_id)
    .single();
  if (error) throw error;

  const parameters = schedule.parameters && Object.keys(schedule.parameters).length
    ? schedule.parameters as ReportParameters
    : defaultParameters(template.report_type);

  try {
    const report = await generateReport({
      template: template as any as ReportTemplate,
      title: schedule.schedule_name,
      parameters,
      outputFormat: schedule.include_excel ? "pdf+xlsx" : "pdf",
      userId,
      authorName: schedule.author_name || "정기 보고서",
    });
    await (supabase.rpc as any)("record_report_schedule_result", {
      p_schedule_id: schedule.id,
      p_report_id: report.id,
      p_success: true,
      p_error: null,
      p_advance_next: advanceNext,
    });
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : "보고서 생성 실패";
    await (supabase.rpc as any)("record_report_schedule_result", {
      p_schedule_id: schedule.id,
      p_report_id: null,
      p_success: false,
      p_error: message,
      p_advance_next: advanceNext,
    });
    throw error;
  }
}

export async function openStoredReport(path: string, target: "_blank" | "_self" = "_blank"): Promise<void> {
  const normalizedPath = path.replace(/^\/+/, "");
  const popup = target === "_blank" ? window.open("about:blank", "_blank") : null;
  try {
    await verifyStoredReport(normalizedPath);
  } catch (error) {
    popup?.close();
    throw error;
  }
  const { data, error } = await supabase.storage.from("reports").createSignedUrl(normalizedPath, 60);
  if (error) {
    popup?.close();
    throw error;
  }
  if (target === "_self") {
    window.location.assign(data.signedUrl);
    return;
  }
  if (!popup) throw new Error("브라우저에서 새 창 열기가 차단되었습니다.");
  popup.opener = null;
  popup.location.replace(data.signedUrl);
}
