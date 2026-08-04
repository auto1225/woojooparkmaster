import { supabase } from "@/integrations/supabase/client";
import { createProfessionalExcelBlob, type ExcelSheetConfig } from "@/lib/excel-engine";
import { PRIMARY_DEPARTMENT, PRIMARY_ORGANIZATION } from "@/config/organization";
import type { ReportTemplate } from "@/types/report";
import { LOT_STATUS_LABELS, LOT_TYPE_LABELS, OPERATOR_LABELS } from "@/types/database";
import { CATEGORY_LABELS as COMPLAINT_CATEGORY_LABELS, COMPLAINT_STATUS_LABELS, PRIORITY_LABELS as COMPLAINT_PRIORITY_LABELS } from "@/types/complaint";
import { MAINT_STATUS_LABELS, MAINT_TYPE_LABELS, PRIORITY_LABELS as MAINT_PRIORITY_LABELS } from "@/types/facility";
import { OPEN_COMPLAINT_STATUS_SET, OPEN_MAINTENANCE_STATUS_SET } from "@/lib/work-status";
import { findOfficialDocumentByNumber, linkOfficialDocument } from "@/lib/official-document-registry";
import {
  buildOperationsReportModel,
  collectOperationsReportData,
  createOperationsHwpx,
  parseOperationsReportOptions,
  validateOperationsHwpx,
} from "@/lib/operations-report";
import { convertHwpxToPdfWithHancom } from "@/lib/hancom-pdf-converter";
import {
  chooseBrowserFileDestination,
  writeBlobToBrowserDestination,
  type BrowserFileSaveResult,
} from "@/lib/browser-file-save";
import { nextAnnualReportNumber } from "@/lib/report-number";
import {
  ANNUAL_PARKING_TEMPLATE_CODE,
  buildAnnualParkingReportModel,
  createAnnualParkingHwpx,
  generateAnnualParkingTestDataset,
  parseAnnualParkingReportOptions,
  validateAnnualParkingHwpx,
} from "@/lib/annual-parking-report";
import {
  buildFacilityReportModel,
  collectFacilityReportData,
  facilityReportBriefRows,
  facilityReportSummaryRows,
  parseFacilityReportOptions,
  toOperationsCompatibleFacilityModel,
} from "@/lib/facility-report";
import {
  buildRevenueReportModel,
  collectRevenueReportData,
  parseRevenueReportOptions,
  revenueReportBriefRows,
  revenueReportSummaryRows,
  toOperationsCompatibleRevenueModel,
} from "@/lib/revenue-report";
import {
  budgetReportBriefRows,
  budgetReportSummaryRows,
  buildBudgetReportModel,
  collectBudgetReportData,
  parseBudgetReportOptions,
  toOperationsCompatibleBudgetModel,
} from "@/lib/budget-report";
import {
  buildServiceReportModel,
  collectServiceReportData,
  parseServiceReportOptions,
  serviceReportBriefRows,
  serviceReportSummaryRows,
  toOperationsCompatibleServiceModel,
} from "@/lib/service-report";
import {
  buildProcurementReportModel,
  collectProcurementReportData,
  parseProcurementReportOptions,
  procurementReportBriefRows,
  procurementReportSummaryRows,
  toOperationsCompatibleProcurementModel,
} from "@/lib/procurement-report";
import {
  buildComplaintReportModel,
  collectComplaintReportData,
  complaintReportBriefRows,
  complaintReportSummaryRows,
  parseComplaintReportOptions,
  toOperationsCompatibleComplaintModel,
} from "@/lib/complaint-report";
import {
  buildSurveyReportModel,
  collectSurveyReportData,
  parseSurveyReportOptions,
  surveyReportBriefRows,
  surveyReportSummaryRows,
  toOperationsCompatibleSurveyModel,
} from "@/lib/survey-report";
import {
  buildPlanningReportModel,
  collectPlanningReportData,
  parsePlanningReportOptions,
  planningReportBriefRows,
  planningReportSummaryRows,
  toOperationsCompatiblePlanningModel,
} from "@/lib/planning-report";

type ReportParameters = Record<string, string>;

interface ReportDataset {
  parkingLots: any[];
  revenue: any[];
  complaints: any[];
  equipment: any[];
  maintenance: any[];
  budgetExecutions: any[];
  surveys: any[];
  sensors: any[];
  summary: Record<string, number>;
}

const REPORT_LOT_TYPE_LABELS = { ...LOT_TYPE_LABELS, surface: "지상주차장", building: "건축물식 주차장", mechanical: "기계식 주차장" };
const REPORT_OPERATOR_LABELS = { ...OPERATOR_LABELS, public: "공공직영", private: "민간운영" };
const REPORT_LOT_STATUS_LABELS = { ...LOT_STATUS_LABELS, normal: "운영중", maintenance: "정비중" };
const REPORT_COMPLAINT_STATUS_LABELS = { ...COMPLAINT_STATUS_LABELS, processing: "처리중", pending: "대기", resolved: "처리완료", cancelled: "취소" };
const REPORT_COMPLAINT_PRIORITY_LABELS = { ...COMPLAINT_PRIORITY_LABELS, medium: "보통", critical: "긴급" };
const REPORT_MAINT_STATUS_LABELS = { ...MAINT_STATUS_LABELS, waiting: "대기", pending: "대기", closed: "종결" };
const REPORT_MAINT_PRIORITY_LABELS = { ...MAINT_PRIORITY_LABELS, normal: "보통", urgent: "긴급" };
const HWPX_MIME_TYPE = "application/hwp+zip";
const HWPX_STORAGE_COMPAT_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isUnsupportedStorageMime(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  return message.includes("mime type") && message.includes("not supported");
}

async function uploadHwpx(path: string, blob: Blob) {
  const reports = supabase.storage.from("reports");
  const primary = await reports.upload(path, blob, {
    contentType: HWPX_MIME_TYPE,
    upsert: true,
  });
  if (!primary.error || !isUnsupportedStorageMime(primary.error)) return primary.error;

  // Older report buckets only allow PDF/XLSX MIME values. The object remains
  // a valid HWPX ZIP package and keeps its .hwpx path and download filename.
  const compatibleBlob = new Blob([await blob.arrayBuffer()], { type: HWPX_STORAGE_COMPAT_MIME_TYPE });
  const compatible = await reports.upload(path, compatibleBlob, {
    contentType: HWPX_STORAGE_COMPAT_MIME_TYPE,
    upsert: true,
  });
  return compatible.error;
}

export interface GenerateReportInput {
  template: ReportTemplate;
  title: string;
  description?: string;
  parameters: ReportParameters;
  outputFormat: "pdf" | "pdf+xlsx" | "pdf+hwpx";
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
  hwpPath?: string;
  documentLinked: boolean;
  documentNumber?: string;
}

function localDateString(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function endOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
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

export function getReportPeriod(parameters: ReportParameters): { start: string; end: string } {
  if (parameters.period_start) {
    return { start: parameters.period_start, end: parameters.period_end || parameters.period_start };
  }
  if (parameters.date) return { start: parameters.date, end: parameters.date };
  if (parameters.week_start) {
    const end = new Date(`${parameters.week_start}T00:00:00`);
    end.setDate(end.getDate() + 6);
    return { start: parameters.week_start, end: localDateString(end) };
  }
  if (parameters.month) {
    const [year, month] = parameters.month.split("-").map(Number);
    return { start: `${parameters.month}-01`, end: endOfMonth(year, month) };
  }
  if (parameters.quarter_year && parameters.quarter_q) {
    const year = Number(parameters.quarter_year);
    const quarter = Number(parameters.quarter_q);
    const startMonth = (quarter - 1) * 3;
    const endMonth = startMonth + 3;
    return {
      start: `${year}-${String(startMonth + 1).padStart(2, "0")}-01`,
      end: endOfMonth(year, endMonth),
    };
  }
  if (parameters.year) return { start: `${parameters.year}-01-01`, end: `${parameters.year}-12-31` };

  const today = new Date();
  const date = localDateString(today);
  return { start: date, end: date };
}

function defaultParameters(reportType: string, at = new Date()): ReportParameters {
  if (reportType === "daily") {
    const day = new Date(at);
    day.setDate(day.getDate() - 1);
    return { date: localDateString(day) };
  }
  if (reportType === "weekly") {
    const end = new Date(at);
    const diff = end.getDay() === 0 ? 7 : end.getDay();
    end.setDate(end.getDate() - diff);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return { week_start: localDateString(start) };
  }
  if (reportType === "quarterly") {
    const currentQuarter = Math.floor(at.getMonth() / 3) + 1;
    const quarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
    const year = currentQuarter === 1 ? at.getFullYear() - 1 : at.getFullYear();
    return { quarter_year: String(year), quarter_q: String(quarter) };
  }
  if (reportType === "yearly" || reportType === "annual") return { year: String(at.getFullYear() - 1) };

  const previousMonth = new Date(at.getFullYear(), at.getMonth() - 1, 1);
  return { month: localDateString(previousMonth).slice(0, 7) };
}

export function getDefaultReportParameters(reportType: string, at = new Date()): ReportParameters {
  return defaultParameters(reportType, at);
}

export async function getReportEvidence(parameters: ReportParameters) {
  const period = getReportPeriod(parameters);
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
      budgetRows: dataset.budgetExecutions.length,
      surveyRows: dataset.surveys.length,
      sensorRows: dataset.sensors.length,
    },
  };
}

async function collectReportData(start: string, end: string): Promise<ReportDataset> {
  const startAt = `${start}T00:00:00`;
  const endAt = `${end}T23:59:59`;
  const [lotsResult, revenueResult, complaintsResult, equipmentResult, maintenanceResult, budgetResult, surveyResult, sensorResult] = await Promise.all([
    supabase
      .from("parking_lots")
      .select("id, code, name, lot_type, operator_type, total_spaces, disabled_spaces, ev_spaces, status")
      .order("name"),
    supabase
      .from("revenue_daily")
      .select("revenue_date, total_amount, total_vehicles, verified, parking_lots(name)", { count: "exact" })
      .gte("revenue_date", start)
      .lte("revenue_date", end)
      .order("revenue_date", { ascending: false })
      .limit(5000),
    supabase
      .from("complaints")
      .select("complaint_number, title, category, priority, status, due_date, received_at, parking_lots(name)", { count: "exact" })
      .gte("received_at", startAt)
      .lte("received_at", endAt)
      .order("received_at", { ascending: false })
      .limit(500),
    supabase
      .from("equipment")
      .select("equipment_code, name, equipment_type, status, next_maintenance_date, parking_lots(name)", { count: "exact" })
      .order("status")
      .limit(500),
    supabase
      .from("maintenance_logs")
      .select("log_number, title, maintenance_type, priority, status, total_cost, reported_at, parking_lots(name)", { count: "exact" })
      .gte("reported_at", startAt)
      .lte("reported_at", endAt)
      .order("reported_at", { ascending: false })
      .limit(500),
    supabase
      .from("budget_executions")
      .select("execution_number, description, execution_type, execution_date, amount, status, vendor_name, document_number", { count: "exact" })
      .gte("execution_date", start)
      .lte("execution_date", end)
      .order("execution_date", { ascending: false })
      .limit(1000),
    supabase
      .from("surveys")
      .select("id, survey_date, survey_type, status, author_name, parking_lots(name)", { count: "exact" })
      .gte("survey_date", start)
      .lte("survey_date", end)
      .order("survey_date", { ascending: false })
      .limit(1000),
    supabase
      .from("sensor_devices")
      .select("device_id, device_name, device_type, status, battery_level, last_heartbeat, location_detail, parking_lots(name)", { count: "exact" })
      .order("device_id")
      .limit(2000),
  ]);

  const failedSource = [
    ["주차장", lotsResult.error],
    ["수입", revenueResult.error],
    ["민원", complaintsResult.error],
    ["장비", equipmentResult.error],
    ["유지보수", maintenanceResult.error],
    ["예산집행", budgetResult.error],
    ["현황조사", surveyResult.error],
    ["실시간 센서", sensorResult.error],
  ].find(([, error]) => Boolean(error));
  if (failedSource) throw new Error(`${failedSource[0]} 자료 조회에 실패했습니다: ${(failedSource[1] as Error).message}`);

  const parkingLots = lotsResult.data || [];
  const revenue = revenueResult.data || [];
  const complaints = complaintsResult.data || [];
  const equipment = equipmentResult.data || [];
  const maintenance = maintenanceResult.data || [];
  const budgetExecutions = budgetResult.data || [];
  const surveys = surveyResult.data || [];
  const sensors = sensorResult.data || [];
  const truncatedSource = [
    ["수입", revenueResult.count, revenue.length],
    ["민원", complaintsResult.count, complaints.length],
    ["장비", equipmentResult.count, equipment.length],
    ["유지보수", maintenanceResult.count, maintenance.length],
    ["예산집행", budgetResult.count, budgetExecutions.length],
    ["현황조사", surveyResult.count, surveys.length],
    ["실시간 센서", sensorResult.count, sensors.length],
  ].find(([, count, loaded]) => typeof count === "number" && count > Number(loaded));
  if (truncatedSource) {
    throw new Error(`${truncatedSource[0]} 자료 ${truncatedSource[1]}건 중 ${truncatedSource[2]}건만 조회되어 보고서 생성을 중단했습니다.`);
  }
  const today = localDateString(new Date());

  return {
    parkingLots,
    revenue,
    complaints,
    equipment,
    maintenance,
    budgetExecutions,
    surveys,
    sensors,
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
      budgetExecutionCount: budgetExecutions.length,
      budgetExecutionAmount: budgetExecutions.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0),
      surveyCount: surveys.length,
      approvedSurveyCount: surveys.filter((row: any) => row.status === "approved").length,
      sensorCount: sensors.length,
      sensorAttention: sensors.filter((row: any) => !["online", "active", "normal"].includes(row.status)).length,
      offstreetLots: parkingLots.filter((row: any) => ["offstreet", "surface"].includes(row.lot_type)).length,
      buildingLots: parkingLots.filter((row: any) => ["building", "parking_building", "multilevel"].includes(row.lot_type)).length,
      onstreetLots: parkingLots.filter((row: any) => row.lot_type === "onstreet").length,
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
  template: ReportTemplate,
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
  const category = template.report_category;
  const code = template.template_code;
  const comprehensive = category === "comprehensive";
  const includeRevenue = comprehensive || category === "revenue" || category === "operation";
  const includeComplaint = comprehensive || category === "complaint" || category === "operation";
  const includeFacility = comprehensive || category === "facility" || category === "safety" || category === "operation";
  const includeBudget = comprehensive || category === "budget" || code === "RPT-BUDGET";
  const includeSurvey = code === "RPT-SURVEY";
  const includeRealtime = code === "RPT-REALTIME" || category === "realtime";
  const includeLotDetail = !["RPT-BUDGET", "RPT-SURVEY", "RPT-REALTIME"].includes(code);
  const scopeLabels = [
    "주차장",
    includeRevenue && "수입",
    includeComplaint && "민원",
    includeFacility && "시설장비·유지보수",
    includeBudget && "예산집행",
    includeSurvey && "현황조사",
    includeRealtime && "실시간 센서",
  ].filter(Boolean).join(", ");
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
    rows.forEach((row, index) => {
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
  doc.text(`나. 자료범위: ${scopeLabels} 등록자료`, margin + 3, y + 13);
  y += 23;

  sectionTitle("2. 핵심 지표");
  const metrics = [
    ["주차장", `${data.summary.activeParkingLots}/${data.summary.parkingLotCount}개 운영`],
    ["주차면", `${data.summary.totalSpaces.toLocaleString("ko-KR")}면`],
    includeRevenue && ["기간 수입", `${data.summary.revenueTotal.toLocaleString("ko-KR")}원`],
    includeComplaint && ["민원", `${data.summary.complaintCount}건 (기한초과 ${data.summary.overdueComplaints}건)`],
    includeFacility && ["유지보수", `${data.summary.maintenanceCount}건 (미완료 ${data.summary.openMaintenance}건)`],
    includeFacility && ["시설 주의", `${data.summary.equipmentAttention}건`],
    includeBudget && ["예산 집행", `${data.summary.budgetExecutionAmount.toLocaleString("ko-KR")}원`],
    includeSurvey && ["현황조사", `${data.summary.surveyCount}건 (승인 ${data.summary.approvedSurveyCount}건)`],
    includeRealtime && ["센서", `${data.summary.sensorCount}대 (확인필요 ${data.summary.sensorAttention}대)`],
  ].filter(Boolean) as string[][];
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
  y += Math.ceil(metrics.length / 2) * 13 + 4;

  sectionTitle("주차장 유형별 현황");
  table(
    [
      { label: "구분", key: "type", width: 70 },
      { label: "주차장 수", key: "count", width: 45 },
      { label: "관리 중점", key: "focus", width: 65 },
    ],
    [
      { type: "노외주차장", count: `${data.summary.offstreetLots}개`, focus: "노면·조명·배수·출입설비" },
      { type: "주차빌딩", count: `${data.summary.buildingLots}개`, focus: "소방·승강기·환기·구조안전" },
      { type: "노상주차장", count: `${data.summary.onstreetLots}개`, focus: "노면표시·표지·도로점용·안전" },
    ],
  );

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

  if (includeLotDetail) {
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
  }

  if (includeRevenue) {
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
  }

  if (includeComplaint) {
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
  }

  if (includeFacility) {
    sectionTitle("6. 시설장비 현황");
    table(
      [
        { label: "장비코드", key: "equipment_code", width: 35 },
        { label: "주차장", key: "lot", width: 48 },
        { label: "장비명", key: "name", width: 50 },
        { label: "종류", key: "equipment_type", width: 27 },
        { label: "상태", key: "status", width: 20 },
      ],
      data.equipment.map((row: any) => ({ ...row, lot: relationName(row.parking_lots) })),
    );
    sectionTitle("7. 유지보수 현황");
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
  }

  if (includeBudget) {
    sectionTitle("8. 예산 집행 현황");
    table(
      [
        { label: "집행번호", key: "execution_number", width: 35 },
        { label: "집행일", key: "execution_date", width: 25 },
        { label: "내용", key: "description", width: 62 },
        { label: "거래처", key: "vendor_name", width: 34 },
        { label: "금액(원)", key: "amount_label", width: 24 },
      ],
      data.budgetExecutions.map((row: any) => ({ ...row, amount_label: Number(row.amount || 0).toLocaleString("ko-KR") })),
    );
  }

  if (includeSurvey) {
    sectionTitle("현황조사 결과");
    table(
      [
        { label: "조사일", key: "survey_date", width: 30 },
        { label: "주차장", key: "lot", width: 70 },
        { label: "조사유형", key: "survey_type", width: 35 },
        { label: "상태", key: "status", width: 25 },
        { label: "조사자", key: "author_name", width: 20 },
      ],
      data.surveys.map((row: any) => ({ ...row, lot: relationName(row.parking_lots) })),
    );
  }

  if (includeRealtime) {
    sectionTitle("실시간 센서 상태");
    table(
      [
        { label: "장치ID", key: "device_id", width: 38 },
        { label: "주차장", key: "lot", width: 55 },
        { label: "종류", key: "device_type", width: 28 },
        { label: "상태", key: "status", width: 24 },
        { label: "배터리", key: "battery", width: 18 },
        { label: "최근신호", key: "last_heartbeat", width: 17 },
      ],
      data.sensors.map((row: any) => ({ ...row, lot: relationName(row.parking_lots), battery: row.battery_level == null ? "-" : `${row.battery_level}%` })),
    );
  }

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

function createExcelSheets(template: ReportTemplate, data: ReportDataset): ExcelSheetConfig[] {
  const sheets: ExcelSheetConfig[] = [
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
        { metric: "예산 집행 건수", value: data.summary.budgetExecutionCount },
        { metric: "예산 집행 금액", value: data.summary.budgetExecutionAmount },
        { metric: "현황조사", value: data.summary.surveyCount },
        { metric: "등록 센서", value: data.summary.sensorCount },
        { metric: "확인 필요 센서", value: data.summary.sensorAttention },
        { metric: "노외주차장", value: data.summary.offstreetLots },
        { metric: "주차빌딩", value: data.summary.buildingLots },
        { metric: "노상주차장", value: data.summary.onstreetLots },
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

  sheets.push(
    {
      name: "시설장비",
      columns: [
        { key: "equipment_code", label: "장비코드", width: 130 },
        { key: "lot", label: "주차장", width: 180 },
        { key: "name", label: "장비명", width: 200 },
        { key: "equipment_type", label: "장비종류", width: 110 },
        { key: "status", label: "상태", width: 90 },
        { key: "next_maintenance_date", label: "차기 정비일", width: 110, format: "date" },
      ],
      data: data.equipment.map((row: any) => ({ ...row, lot: relationName(row.parking_lots) })),
    },
    {
      name: "예산집행",
      columns: [
        { key: "execution_number", label: "집행번호", width: 130 },
        { key: "execution_date", label: "집행일", width: 110, format: "date" },
        { key: "description", label: "집행내용", width: 260 },
        { key: "vendor_name", label: "거래처", width: 160 },
        { key: "amount", label: "금액", width: 130, format: "currency", aggregation: "sum" },
        { key: "document_number", label: "문서번호", width: 180 },
        { key: "status", label: "상태", width: 90 },
      ],
      data: data.budgetExecutions,
      totalRow: { label: "합계" },
    },
    {
      name: "현황조사",
      columns: [
        { key: "survey_date", label: "조사일", width: 110, format: "date" },
        { key: "lot", label: "주차장", width: 200 },
        { key: "survey_type", label: "조사유형", width: 110 },
        { key: "status", label: "상태", width: 90 },
        { key: "author_name", label: "조사자", width: 100 },
      ],
      data: data.surveys.map((row: any) => ({ ...row, lot: relationName(row.parking_lots) })),
    },
    {
      name: "실시간센서",
      columns: [
        { key: "device_id", label: "장치ID", width: 150 },
        { key: "lot", label: "주차장", width: 190 },
        { key: "device_type", label: "종류", width: 110 },
        { key: "status", label: "상태", width: 90 },
        { key: "battery_level", label: "배터리", width: 90, format: "number" },
        { key: "last_heartbeat", label: "최근 신호", width: 180 },
        { key: "location_detail", label: "설치 위치", width: 180 },
      ],
      data: data.sensors.map((row: any) => ({ ...row, lot: relationName(row.parking_lots) })),
    },
  );

  const excelCategory = template.report_category;
  const excelComprehensive = excelCategory === "comprehensive";
  const allowed = new Set(["요약"]);
  if (!["RPT-BUDGET", "RPT-SURVEY", "RPT-REALTIME"].includes(template.template_code)) allowed.add("주차장");
  if (excelComprehensive || excelCategory === "operation" || excelCategory === "revenue") allowed.add("수입");
  if (excelComprehensive || excelCategory === "operation" || excelCategory === "complaint") allowed.add("민원");
  if (excelComprehensive || excelCategory === "operation" || excelCategory === "facility" || excelCategory === "safety") {
    allowed.add("시설장비");
    allowed.add("유지보수");
  }
  if (excelComprehensive || excelCategory === "budget" || template.template_code === "RPT-BUDGET") allowed.add("예산집행");
  if (template.template_code === "RPT-SURVEY") allowed.add("현황조사");
  if (excelCategory === "realtime" || template.template_code === "RPT-REALTIME") allowed.add("실시간센서");
  return sheets.filter((sheet) => allowed.has(sheet.name));
}

async function reportNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase
    .from("report_generated")
    .select("report_number")
    .like("report_number", `RPT-${year}-%`)
    .limit(10000);
  if (error) throw error;

  return nextAnnualReportNumber(data?.map((row) => row.report_number) || [], year);
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_").slice(0, 80) || "report";
}

export async function generateReport(input: GenerateReportInput): Promise<GeneratedReportResult> {
  const startedAt = Date.now();
  const period = getReportPeriod(input.parameters);
  let number = input.reportNumber || "";
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
        .select("report_number, file_path, excel_path, hwp_path")
        .single();
      if (error) throw error;
      if (existing?.report_number) number = existing.report_number;
      replacedPaths = [existing?.file_path, existing?.excel_path, existing?.hwp_path].filter(Boolean) as string[];
    } else {
      const maximumAttempts = input.reportNumber ? 1 : 5;
      let insertError: unknown;

      for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
        if (!input.reportNumber) number = await reportNumber();
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

        if (!error) {
          id = data.id;
          insertError = undefined;
          break;
        }

        insertError = error;
        if (error.code !== "23505" || input.reportNumber) break;
      }

      if (!id) throw insertError || new Error("보고서 관리번호를 발급하지 못했습니다.");
    }

    const { data: configRows } = await supabase.from("system_config").select("config_key, config_value").in("config_key", ["org_name"]);
    const orgName = configRows?.find((row) => row.config_key === "org_name")?.config_value || "ParkMaster";
    const isOperationsReport = input.parameters.report_scope === "operations";
    const isFacilityReport = input.parameters.report_scope === "facility" || input.template.template_code === "RPT-FACILITY";
    const isRevenueReport = input.parameters.report_scope === "revenue" || input.template.template_code === "RPT-REVENUE";
    const isBudgetReport = input.parameters.report_scope === "budget" || input.template.template_code === "RPT-BUDGET";
    const isServiceReport = input.parameters.report_scope === "service" || input.template.template_code === "RPT-SERVICE";
    const isProcurementReport = input.parameters.report_scope === "procurement" || input.template.template_code === "RPT-PROCUREMENT";
    const isComplaintReport = input.parameters.report_scope === "complaint" || input.template.template_code === "RPT-COMPLAINT";
    const isSurveyReport = input.parameters.report_scope === "survey" || input.template.template_code === "RPT-SURVEY";
    const isPlanningReport = input.parameters.report_scope === "planning" || input.template.template_code === "RPT-PLANNING";
    const isAnnualParkingReport = input.parameters.report_scope === "annual_parking"
      || input.template.template_code === ANNUAL_PARKING_TEMPLATE_CODE;
    let dataset: ReportDataset | null = null;
    let dataSnapshot: any;
    let summaryData: Record<string, unknown>;
    let hwpBlob: Blob | undefined;
    let pdf: { blob: Blob; pageCount: number };

    if (isAnnualParkingReport) {
      const options = parseAnnualParkingReportOptions(input.parameters);
      const annualDataset = generateAnnualParkingTestDataset(undefined, options.comparisonYear, options.year);
      const model = buildAnnualParkingReportModel(annualDataset, options);
      const canonicalHwpx = await createAnnualParkingHwpx({
        model,
        title: input.title,
        reportNumber: number,
        officialDocumentNumber: input.parameters.official_document_number,
        authorName: input.authorName,
        organizationName: orgName,
        disclosureStatus: input.parameters.disclosure_status,
        disclosureBasis: input.parameters.disclosure_basis,
        documentSummary: input.parameters.document_summary,
        keywords: input.parameters.keywords,
      });
      await validateAnnualParkingHwpx(canonicalHwpx);
      pdf = await convertHwpxToPdfWithHancom(canonicalHwpx);
      hwpBlob = input.outputFormat === "pdf+hwpx" ? canonicalHwpx : undefined;
      dataSnapshot = { ...annualDataset, reportModel: model };
      summaryData = {
        ...model.current,
        comparisonYear: model.previous,
        sourceCounts: model.sourceCounts,
        fixtureVersion: "JEJU-ANNUAL-2025-v1",
        canonicalDocument: "HWPX",
        pdfEngine: "Hancom Office",
      };
    } else if (isOperationsReport) {
      const options = parseOperationsReportOptions(input.parameters);
      const operationsDataset = await collectOperationsReportData(options);
      const model = buildOperationsReportModel(operationsDataset, options);
      const canonicalHwpx = await createOperationsHwpx({
        model, title: input.title, reportNumber: number,
        orientation: options.orientation,
        officialDocumentNumber: input.parameters.official_document_number,
        authorName: input.authorName, organizationName: orgName,
        disclosureStatus: input.parameters.disclosure_status,
        disclosureBasis: input.parameters.disclosure_basis,
        documentSummary: input.parameters.document_summary,
        keywords: input.parameters.keywords,
      });
      await validateOperationsHwpx(canonicalHwpx);
      pdf = await convertHwpxToPdfWithHancom(canonicalHwpx);
      hwpBlob = input.outputFormat === "pdf+hwpx" ? canonicalHwpx : undefined;
      dataSnapshot = { ...operationsDataset, reportModel: model };
      summaryData = {
        ...model.summary,
        sourceCounts: model.sourceCounts,
        selectedFieldCount: model.selectedFieldCount,
        sensitiveFieldCount: model.sensitiveFieldCount,
        canonicalDocument: "HWPX",
        pdfEngine: "Hancom Office",
      };
    } else if (isFacilityReport) {
      const options = parseFacilityReportOptions(input.parameters);
      const facilityDataset = await collectFacilityReportData(options);
      const facilityModel = buildFacilityReportModel(facilityDataset, options);
      const compatibleModel = toOperationsCompatibleFacilityModel(facilityModel);
      const canonicalHwpx = await createOperationsHwpx({
        model: compatibleModel,
        title: input.title,
        reportNumber: number,
        orientation: options.orientation,
        officialDocumentNumber: input.parameters.official_document_number,
        authorName: input.authorName,
        organizationName: orgName,
        disclosureStatus: input.parameters.disclosure_status,
        disclosureBasis: input.parameters.disclosure_basis,
        documentSummary: input.parameters.document_summary,
        keywords: input.parameters.keywords,
        documentOverrides: {
          briefRows: facilityReportBriefRows(facilityModel, input.parameters.document_summary),
          summaryRows: facilityReportSummaryRows(facilityModel),
          footerLabel: "시설관리",
          flowDetailTablesAcrossPages: true,
        },
      });
      await validateOperationsHwpx(canonicalHwpx, "시설관리");
      pdf = await convertHwpxToPdfWithHancom(canonicalHwpx);
      hwpBlob = input.outputFormat === "pdf+hwpx" ? canonicalHwpx : undefined;
      dataSnapshot = {
        reportModel: facilityModel,
        sourceCounts: facilityModel.sourceCounts,
        selection: options,
      };
      summaryData = {
        ...facilityModel.summary,
        sourceCounts: facilityModel.sourceCounts,
        selectedFieldCount: facilityModel.selectedFieldCount,
        protectedFieldCount: facilityModel.protectedFieldCount,
        attentionNarrative: facilityModel.attentionNarrative,
        canonicalDocument: "HWPX",
        pdfEngine: "Hancom Office",
      };
    } else if (isRevenueReport) {
      const options = parseRevenueReportOptions(input.parameters);
      const revenueDataset = await collectRevenueReportData(options);
      const revenueModel = buildRevenueReportModel(revenueDataset, options);
      const compatibleModel = toOperationsCompatibleRevenueModel(revenueModel);
      const canonicalHwpx = await createOperationsHwpx({
        model: compatibleModel,
        title: input.title,
        reportNumber: number,
        orientation: options.orientation,
        officialDocumentNumber: input.parameters.official_document_number,
        authorName: input.authorName,
        organizationName: orgName,
        disclosureStatus: input.parameters.disclosure_status,
        disclosureBasis: input.parameters.disclosure_basis,
        documentSummary: input.parameters.document_summary,
        keywords: input.parameters.keywords,
        documentOverrides: {
          briefRows: revenueReportBriefRows(revenueModel, input.parameters.document_summary),
          summaryRows: revenueReportSummaryRows(revenueModel),
          footerLabel: "수입관리",
          flowDetailTablesAcrossPages: true,
        },
      });
      await validateOperationsHwpx(canonicalHwpx, "수입관리");
      pdf = await convertHwpxToPdfWithHancom(canonicalHwpx);
      hwpBlob = input.outputFormat === "pdf+hwpx" ? canonicalHwpx : undefined;
      dataSnapshot = { reportModel: revenueModel, sourceCounts: revenueModel.sourceCounts, selection: options };
      summaryData = {
        ...revenueModel.summary,
        sourceCounts: revenueModel.sourceCounts,
        selectedFieldCount: revenueModel.selectedFieldCount,
        protectedFieldCount: revenueModel.protectedFieldCount,
        attentionNarrative: revenueModel.attentionNarrative,
        canonicalDocument: "HWPX",
        pdfEngine: "Hancom Office",
      };
    } else if (isBudgetReport) {
      const options = parseBudgetReportOptions(input.parameters);
      const budgetDataset = await collectBudgetReportData(options);
      const budgetModel = buildBudgetReportModel(budgetDataset, options);
      const compatibleModel = toOperationsCompatibleBudgetModel(budgetModel);
      const canonicalHwpx = await createOperationsHwpx({
        model: compatibleModel,
        title: input.title,
        reportNumber: number,
        orientation: options.orientation,
        officialDocumentNumber: input.parameters.official_document_number,
        authorName: input.authorName,
        organizationName: orgName,
        disclosureStatus: input.parameters.disclosure_status,
        disclosureBasis: input.parameters.disclosure_basis,
        documentSummary: input.parameters.document_summary,
        keywords: input.parameters.keywords,
        documentOverrides: {
          briefRows: budgetReportBriefRows(budgetModel, input.parameters.document_summary),
          summaryRows: budgetReportSummaryRows(budgetModel),
          footerLabel: "예산관리",
          flowDetailTablesAcrossPages: true,
        },
      });
      await validateOperationsHwpx(canonicalHwpx, "예산관리");
      pdf = await convertHwpxToPdfWithHancom(canonicalHwpx);
      hwpBlob = input.outputFormat === "pdf+hwpx" ? canonicalHwpx : undefined;
      dataSnapshot = { reportModel: budgetModel, sourceCounts: budgetModel.sourceCounts, selection: options };
      summaryData = {
        ...budgetModel.summary,
        sourceCounts: budgetModel.sourceCounts,
        selectedFieldCount: budgetModel.selectedFieldCount,
        protectedFieldCount: budgetModel.protectedFieldCount,
        riskNarrative: budgetModel.riskNarrative,
        canonicalDocument: "HWPX",
        pdfEngine: "Hancom Office",
      };
    } else if (isServiceReport) {
      const options = parseServiceReportOptions(input.parameters);
      const serviceDataset = await collectServiceReportData(options);
      const serviceModel = buildServiceReportModel(serviceDataset, options);
      const compatibleModel = toOperationsCompatibleServiceModel(serviceModel);
      const canonicalHwpx = await createOperationsHwpx({
        model: compatibleModel,
        title: input.title,
        reportNumber: number,
        orientation: options.orientation,
        officialDocumentNumber: input.parameters.official_document_number,
        authorName: input.authorName,
        organizationName: orgName,
        disclosureStatus: input.parameters.disclosure_status,
        disclosureBasis: input.parameters.disclosure_basis,
        documentSummary: input.parameters.document_summary,
        keywords: input.parameters.keywords,
        documentOverrides: {
          briefRows: serviceReportBriefRows(serviceModel, input.parameters.document_summary),
          summaryRows: serviceReportSummaryRows(serviceModel),
          footerLabel: "용역사업관리",
          flowDetailTablesAcrossPages: true,
        },
      });
      await validateOperationsHwpx(canonicalHwpx, "용역사업관리");
      pdf = await convertHwpxToPdfWithHancom(canonicalHwpx);
      hwpBlob = input.outputFormat === "pdf+hwpx" ? canonicalHwpx : undefined;
      dataSnapshot = { reportModel: serviceModel, sourceCounts: serviceModel.sourceCounts, selection: options };
      summaryData = {
        ...serviceModel.summary,
        sourceCounts: serviceModel.sourceCounts,
        selectedFieldCount: serviceModel.selectedFieldCount,
        protectedFieldCount: serviceModel.protectedFieldCount,
        riskNarrative: serviceModel.riskNarrative,
        canonicalDocument: "HWPX",
        pdfEngine: "Hancom Office",
      };
    } else if (isProcurementReport) {
      const options = parseProcurementReportOptions(input.parameters);
      const procurementDataset = await collectProcurementReportData(options);
      const procurementModel = buildProcurementReportModel(procurementDataset, options);
      const compatibleModel = toOperationsCompatibleProcurementModel(procurementModel);
      const canonicalHwpx = await createOperationsHwpx({
        model: compatibleModel,
        title: input.title,
        reportNumber: number,
        orientation: options.orientation,
        officialDocumentNumber: input.parameters.official_document_number,
        authorName: input.authorName,
        organizationName: orgName,
        disclosureStatus: input.parameters.disclosure_status,
        disclosureBasis: input.parameters.disclosure_basis,
        documentSummary: input.parameters.document_summary,
        keywords: input.parameters.keywords,
        documentOverrides: {
          briefRows: procurementReportBriefRows(procurementModel, input.parameters.document_summary),
          summaryRows: procurementReportSummaryRows(procurementModel),
          footerLabel: "입찰관리",
          flowDetailTablesAcrossPages: true,
        },
      });
      await validateOperationsHwpx(canonicalHwpx, "입찰관리");
      pdf = await convertHwpxToPdfWithHancom(canonicalHwpx);
      hwpBlob = input.outputFormat === "pdf+hwpx" ? canonicalHwpx : undefined;
      dataSnapshot = { reportModel: procurementModel, sourceCounts: procurementModel.sourceCounts, selection: options };
      summaryData = {
        ...procurementModel.summary,
        sourceCounts: procurementModel.sourceCounts,
        selectedFieldCount: procurementModel.selectedFieldCount,
        protectedFieldCount: procurementModel.protectedFieldCount,
        riskNarrative: procurementModel.riskNarrative,
        canonicalDocument: "HWPX",
        pdfEngine: "Hancom Office",
      };
    } else if (isComplaintReport) {
      const options = parseComplaintReportOptions(input.parameters);
      const complaintDataset = await collectComplaintReportData(options);
      const complaintModel = buildComplaintReportModel(complaintDataset, options);
      const compatibleModel = toOperationsCompatibleComplaintModel(complaintModel);
      const canonicalHwpx = await createOperationsHwpx({
        model: compatibleModel,
        title: input.title,
        reportNumber: number,
        orientation: options.orientation,
        officialDocumentNumber: input.parameters.official_document_number,
        authorName: input.authorName,
        organizationName: orgName,
        disclosureStatus: input.parameters.disclosure_status,
        disclosureBasis: input.parameters.disclosure_basis,
        documentSummary: input.parameters.document_summary,
        keywords: input.parameters.keywords,
        documentOverrides: {
          briefRows: complaintReportBriefRows(complaintModel, input.parameters.document_summary),
          summaryRows: complaintReportSummaryRows(complaintModel),
          footerLabel: "민원관리",
          flowDetailTablesAcrossPages: true,
        },
      });
      await validateOperationsHwpx(canonicalHwpx, "민원관리");
      pdf = await convertHwpxToPdfWithHancom(canonicalHwpx);
      hwpBlob = input.outputFormat === "pdf+hwpx" ? canonicalHwpx : undefined;
      dataSnapshot = { reportModel: complaintModel, sourceCounts: complaintModel.sourceCounts, selection: options };
      summaryData = {
        ...complaintModel.summary,
        sourceCounts: complaintModel.sourceCounts,
        selectedFieldCount: complaintModel.selectedFieldCount,
        protectedFieldCount: complaintModel.protectedFieldCount,
        riskNarrative: complaintModel.riskNarrative,
        canonicalDocument: "HWPX",
        pdfEngine: "Hancom Office",
      };
    } else if (isSurveyReport) {
      const options = parseSurveyReportOptions(input.parameters);
      const surveyDataset = await collectSurveyReportData(options);
      const surveyModel = buildSurveyReportModel(surveyDataset, options);
      const canonicalHwpx = await createOperationsHwpx({
        model: toOperationsCompatibleSurveyModel(surveyModel),
        title: input.title,
        reportNumber: number,
        orientation: options.orientation,
        officialDocumentNumber: input.parameters.official_document_number,
        authorName: input.authorName,
        organizationName: orgName,
        disclosureStatus: input.parameters.disclosure_status,
        disclosureBasis: input.parameters.disclosure_basis,
        documentSummary: input.parameters.document_summary,
        keywords: input.parameters.keywords,
        documentOverrides: {
          briefRows: surveyReportBriefRows(surveyModel, input.parameters.document_summary),
          summaryRows: surveyReportSummaryRows(surveyModel),
          footerLabel: "현황조사",
          flowDetailTablesAcrossPages: true,
        },
      });
      await validateOperationsHwpx(canonicalHwpx, "현황조사");
      pdf = await convertHwpxToPdfWithHancom(canonicalHwpx);
      hwpBlob = input.outputFormat === "pdf+hwpx" ? canonicalHwpx : undefined;
      dataSnapshot = { reportModel: surveyModel, sourceCounts: surveyModel.sourceCounts, selection: options };
      summaryData = {
        ...surveyModel.summary,
        sourceCounts: surveyModel.sourceCounts,
        selectedFieldCount: surveyModel.selectedFieldCount,
        protectedFieldCount: surveyModel.protectedFieldCount,
        riskNarrative: surveyModel.riskNarrative,
        canonicalDocument: "HWPX",
        pdfEngine: "Hancom Office",
      };
    } else if (isPlanningReport) {
      const options = parsePlanningReportOptions(input.parameters);
      const planningDataset = await collectPlanningReportData(options);
      const planningModel = buildPlanningReportModel(planningDataset, options);
      const canonicalHwpx = await createOperationsHwpx({
        model: toOperationsCompatiblePlanningModel(planningModel),
        title: input.title,
        reportNumber: number,
        orientation: options.orientation,
        officialDocumentNumber: input.parameters.official_document_number,
        authorName: input.authorName,
        organizationName: orgName,
        disclosureStatus: input.parameters.disclosure_status,
        disclosureBasis: input.parameters.disclosure_basis,
        documentSummary: input.parameters.document_summary,
        keywords: input.parameters.keywords,
        documentOverrides: {
          briefRows: planningReportBriefRows(planningModel, input.parameters.document_summary),
          summaryRows: planningReportSummaryRows(planningModel),
          footerLabel: "신설기획",
          flowDetailTablesAcrossPages: true,
        },
      });
      await validateOperationsHwpx(canonicalHwpx, "신설기획");
      pdf = await convertHwpxToPdfWithHancom(canonicalHwpx);
      hwpBlob = input.outputFormat === "pdf+hwpx" ? canonicalHwpx : undefined;
      dataSnapshot = { reportModel: planningModel, sourceCounts: planningModel.sourceCounts, selection: options };
      summaryData = {
        ...planningModel.summary,
        sourceCounts: planningModel.sourceCounts,
        selectedFieldCount: planningModel.selectedFieldCount,
        protectedFieldCount: planningModel.protectedFieldCount,
        riskNarrative: planningModel.riskNarrative,
        canonicalDocument: "HWPX",
        pdfEngine: "Hancom Office",
      };
    } else {
      dataset = await collectReportData(period.start, period.end);
      pdf = await createPdf(input.template, orgName, number, input.parameters.official_document_number || "", input.title, input.description || "", input.authorName || "", period, dataset, input.aiSummary);
      dataSnapshot = dataset;
      summaryData = { ...dataset.summary, aiSummary: input.aiSummary || null };
    }
    const basePath = `${input.userId}/${id}/attempts/${crypto.randomUUID()}`;
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
      if (!dataset) throw new Error("선택형 통합보고서는 PDF와 HWPX 형식으로 생성해 주세요.");
      const excel = await createProfessionalExcelBlob({
        fileName: fileBase,
        orgName,
        title: input.title,
        subtitle: `${period.start} ~ ${period.end}`,
        creator: input.authorName,
        sheets: createExcelSheets(input.template, dataset),
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

    let hwpPath: string | undefined;
    let hwpSize = 0;
    if (hwpBlob) {
      hwpPath = `${basePath}/${fileBase}.hwpx`;
      const hwpError = await uploadHwpx(hwpPath, hwpBlob);
      if (hwpError) throw hwpError;
      uploadedPaths.push(hwpPath);
      hwpSize = hwpBlob.size;
    }

    const { error: updateError } = await supabase
      .from("report_generated")
      .update({
        file_path: pdfPath,
        excel_path: excelPath || null,
        hwp_path: hwpPath || null,
        file_format: input.outputFormat,
        file_size: pdf.blob.size + excelSize + hwpSize,
        page_count: pdf.pageCount,
        data_snapshot: dataSnapshot as any,
        summary_data: summaryData as any,
        status: "completed",
        generation_time_ms: Date.now() - startedAt,
        error_message: null,
      })
      .eq("id", id);
    if (updateError) throw updateError;

    const obsoletePaths = replacedPaths.filter((path) => !uploadedPaths.includes(path));
    if (obsoletePaths.length) await supabase.storage.from("reports").remove(obsoletePaths);

    const documentNumber = input.parameters.official_document_number?.trim();
    let documentLinked = false;
    if (documentNumber) {
      try {
        const document = await findOfficialDocumentByNumber(documentNumber);
        if (document) {
          await linkOfficialDocument({
            document,
            module: "REPORT",
            recordId: id,
            relationType: "reference",
            recordPath: `/reports/history?report=${id}`,
            recordLabel: `${number} ${input.title}`,
          });
          documentLinked = true;
        }
      } catch {
        documentLinked = false;
      }
    }

    return { id, reportNumber: number, filePath: pdfPath, excelPath, hwpPath, documentLinked, documentNumber };
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

function safeDownloadFileName(fileName: string): string {
  return fileName
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "ParkMaster-보고서";
}

export async function downloadStoredReport(path: string, fileName?: string): Promise<BrowserFileSaveResult> {
  const normalizedPath = path.replace(/^\/+/, "");
  const fallbackName = decodeURIComponent(normalizedPath.split("/").pop() || "ParkMaster-보고서");
  const downloadName = safeDownloadFileName(fileName || fallbackName);
  const destination = await chooseBrowserFileDestination(downloadName);
  if (destination.kind === "cancelled") return "cancelled";

  await verifyStoredReport(normalizedPath);
  const { data, error } = await supabase.storage.from("reports").download(normalizedPath);
  if (error) throw error;
  return writeBlobToBrowserDestination(data, downloadName, destination);
}
