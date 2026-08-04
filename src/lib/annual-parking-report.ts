import { HwpxReader, htmlToHwpx } from "hwp-convert";
import {
  applyOfficeFontToHwpx,
  OPERATIONS_REPORT_LAYOUT,
  type OperationsReportOrientation,
} from "@/lib/operations-report";
import { PRIMARY_DEPARTMENT, PRIMARY_ORGANIZATION } from "@/config/organization";
import jejuParkingSurvey2025 from "../../supabase/seed_data/jeju_paid_parking_2025.json";

export type AnnualParkingReportSectionId =
  | "overview"
  | "comparison"
  | "type_summary"
  | "monthly_trend"
  | "service_facility"
  | "risk_lots"
  | "analysis"
  | "appendix";

export interface AnnualParkingReportOptions {
  year: number;
  comparisonYear: number;
  selectedSections: AnnualParkingReportSectionId[];
  orientation: OperationsReportOrientation;
  lotTypes: AnnualParkingLotType[];
  includeAppendix: boolean;
}

export type AnnualParkingLotType = "offstreet" | "building" | "onstreet";

export interface AnnualParkingLotSeed {
  id: string;
  code: string;
  name: string;
  lotType: AnnualParkingLotType;
  spaces: number;
  operatorType: "direct" | "outsourced";
}

export interface AnnualParkingMonthlyMetric {
  year: number;
  month: number;
  lotId: string;
  lotCode: string;
  lotName: string;
  lotType: AnnualParkingLotType;
  spaces: number;
  vehicles: number;
  revenue: number;
  utilizationRate: number;
  complaints: number;
  resolvedComplaints: number;
  averageResolutionHours: number;
  maintenanceCount: number;
  maintenanceCost: number;
  safetyInspections: number;
  safetyFindings: number;
  completedSafetyActions: number;
  downtimeHours: number;
}

export interface AnnualParkingTestDataset {
  generatedAt: string;
  sourceLabel: string;
  lots: AnnualParkingLotSeed[];
  monthlyMetrics: AnnualParkingMonthlyMetric[];
}

export interface AnnualParkingYearSummary {
  year: number;
  lotCount: number;
  spaces: number;
  vehicles: number;
  revenue: number;
  averageUtilizationRate: number;
  complaints: number;
  resolvedComplaints: number;
  complaintResolutionRate: number;
  averageResolutionHours: number;
  maintenanceCount: number;
  maintenanceCost: number;
  safetyInspections: number;
  safetyFindings: number;
  completedSafetyActions: number;
  safetyActionCompletionRate: number;
  downtimeHours: number;
}

export interface AnnualParkingReportModel {
  options: AnnualParkingReportOptions;
  sourceLabel: string;
  current: AnnualParkingYearSummary;
  previous: AnnualParkingYearSummary;
  typeSummary: Array<AnnualParkingYearSummary & { lotType: AnnualParkingLotType }>;
  monthlyTrend: Array<{
    month: number;
    vehicles: number;
    revenue: number;
    utilizationRate: number;
    complaints: number;
    maintenanceCount: number;
    downtimeHours: number;
  }>;
  riskLots: Array<{
    rank: number;
    code: string;
    name: string;
    lotType: AnnualParkingLotType;
    spaces: number;
    complaints: number;
    safetyFindings: number;
    downtimeHours: number;
    riskScore: number;
    managementFocus: string;
  }>;
  analysis: string[];
  recommendations: string[];
  sourceCounts: { lots: number; months: number; monthlyFacts: number };
}

export const ANNUAL_PARKING_TEMPLATE_CODE = "RPT-JEJU-ANNUAL";

export const ANNUAL_PARKING_REPORT_SECTIONS: Array<{
  id: AnnualParkingReportSectionId;
  label: string;
  description: string;
  required?: boolean;
}> = [
  { id: "overview", label: "종합 현황", description: "연간 핵심 운영지표", required: true },
  { id: "comparison", label: "전년 대비", description: "주요 지표의 전년 증감과 판단", required: true },
  { id: "type_summary", label: "유형별 현황", description: "노외·주차빌딩·노상 비교" },
  { id: "monthly_trend", label: "월별 추이", description: "이용·수입·민원·시설 추세" },
  { id: "service_facility", label: "민원·시설·안전", description: "서비스와 시설 위험의 통합 분석" },
  { id: "risk_lots", label: "중점관리 대상", description: "위험도 상위 주차장과 관리 초점" },
  { id: "analysis", label: "종합 분석·조치계획", description: "정책 판단과 차년도 우선과제", required: true },
  { id: "appendix", label: "자료기준 부록", description: "산출 범위와 검증 기준" },
];

export const ANNUAL_LOT_TYPE_OPTIONS: Array<{ value: AnnualParkingLotType; label: string }> = [
  { value: "offstreet", label: "노외주차장" },
  { value: "building", label: "주차빌딩" },
  { value: "onstreet", label: "노상주차장" },
];

const LOT_TYPE_LABELS: Record<AnnualParkingLotType, string> = {
  offstreet: "노외주차장",
  building: "주차빌딩",
  onstreet: "노상주차장",
};

const ALL_SECTIONS = ANNUAL_PARKING_REPORT_SECTIONS.map(section => section.id);
const PAGE_BREAK_MARKER = "__PARKMASTER_PAGE_BREAK__";

const escape = (value: unknown) => String(value ?? "-")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const number = (value: number) => Math.round(value).toLocaleString("ko-KR");
const won = (value: number) => `${number(value)}원`;
const percent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

function hashNumber(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function bounded(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createAnnualParkingTestLots(count = 112): AnnualParkingLotSeed[] {
  const canonicalLots = (jejuParkingSurvey2025 as any).lots as Array<{
    code: string;
    name: string;
    lot_type: string;
    total_spaces: number;
  }>;
  return canonicalLots.slice(0, Math.min(count, canonicalLots.length)).map((lot, index) => ({
    id: `annual-test-lot-${lot.code}`,
    code: lot.code,
    name: lot.name,
    lotType: lot.lot_type === "multilevel" || lot.lot_type === "building" ? "building" : lot.lot_type === "onstreet" ? "onstreet" : "offstreet",
    spaces: Number(lot.total_spaces || 0),
    // The source survey does not state the operator. This deterministic value is test-only.
    operatorType: index % 5 === 0 || lot.lot_type === "multilevel" ? "outsourced" : "direct",
  }));
}

export function generateAnnualParkingTestDataset(
  lots = createAnnualParkingTestLots(),
  startYear = 2024,
  endYear = 2025,
): AnnualParkingTestDataset {
  const monthlyMetrics: AnnualParkingMonthlyMetric[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const season = [0.84, 0.87, 0.94, 1.01, 1.06, 1.12, 1.20, 1.18, 1.08, 1.03, 0.96, 0.92][month - 1];
      lots.forEach((lot, lotIndex) => {
        const random = hashNumber(`${year}-${month}-${lot.code}`);
        const typeFactor = lot.lotType === "building" ? 1.22 : lot.lotType === "onstreet" ? 0.78 : 1;
        const yearFactor = year === 2025 ? 1.045 : 1;
        const days = new Date(year, month, 0).getDate();
        const vehicles = Math.round(lot.spaces * days * season * typeFactor * yearFactor * (2.15 + random * 0.9));
        const utilizationRate = bounded(vehicles / Math.max(1, lot.spaces * days * 3.25) * 100, 18, 96);
        const averageFee = lot.lotType === "building" ? 1720 : lot.lotType === "onstreet" ? 1180 : 1460;
        const revenue = Math.round(vehicles * averageFee * (year === 2025 ? 1.018 : 1));
        const complaintBase = utilizationRate > 78 ? 2 : utilizationRate > 60 ? 1 : 0;
        const complaints = Math.max(0, Math.round(complaintBase + random * 3 + (lotIndex % 29 === 0 ? 4 : 0) - (year === 2025 ? 0.35 : 0)));
        const resolvedComplaints = Math.min(complaints, Math.max(0, Math.round(complaints * (year === 2025 ? 0.91 : 0.86))));
        const maintenanceCount = Math.max(0, Math.round(random * 2.4 + (lot.lotType === "building" ? 1.2 : 0.25)));
        const safetyInspections = lot.lotType === "building" ? 2 : 1;
        const safetyFindings = Math.max(0, Math.round(random * (lot.lotType === "building" ? 2.5 : 1.7)));
        monthlyMetrics.push({
          year,
          month,
          lotId: lot.id,
          lotCode: lot.code,
          lotName: lot.name,
          lotType: lot.lotType,
          spaces: lot.spaces,
          vehicles,
          revenue,
          utilizationRate,
          complaints,
          resolvedComplaints,
          averageResolutionHours: bounded((year === 2025 ? 31 : 39) + random * 18 + complaints * 1.4, 12, 96),
          maintenanceCount,
          maintenanceCost: Math.round(maintenanceCount * (230000 + random * 890000) * (lot.lotType === "building" ? 1.45 : 1)),
          safetyInspections,
          safetyFindings,
          completedSafetyActions: Math.min(safetyFindings, Math.round(safetyFindings * (year === 2025 ? 0.94 : 0.87))),
          downtimeHours: Math.round((maintenanceCount * 1.8 + safetyFindings * 1.2 + random * 2.5) * 10) / 10,
        });
      });
    }
  }
  return {
    generatedAt: `${endYear}-12-31T18:00:00+09:00`,
    sourceLabel: `[TEST:JEJU-ANNUAL-2025-v1] 2025.12 제주시 현황조사 기준정보(${lots.length}개소)와 ${startYear}~${endYear}년 검증용 월별지표`,
    lots,
    monthlyMetrics,
  };
}

function summarizeYear(dataset: AnnualParkingTestDataset, year: number, lotType?: AnnualParkingLotType): AnnualParkingYearSummary {
  const rows = dataset.monthlyMetrics.filter(row => row.year === year && (!lotType || row.lotType === lotType));
  const lots = dataset.lots.filter(lot => !lotType || lot.lotType === lotType);
  const complaints = rows.reduce((sum, row) => sum + row.complaints, 0);
  const resolvedComplaints = rows.reduce((sum, row) => sum + row.resolvedComplaints, 0);
  const safetyFindings = rows.reduce((sum, row) => sum + row.safetyFindings, 0);
  const completedSafetyActions = rows.reduce((sum, row) => sum + row.completedSafetyActions, 0);
  return {
    year,
    lotCount: lots.length,
    spaces: lots.reduce((sum, lot) => sum + lot.spaces, 0),
    vehicles: rows.reduce((sum, row) => sum + row.vehicles, 0),
    revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    averageUtilizationRate: rows.length ? rows.reduce((sum, row) => sum + row.utilizationRate, 0) / rows.length : 0,
    complaints,
    resolvedComplaints,
    complaintResolutionRate: complaints ? resolvedComplaints / complaints * 100 : 100,
    averageResolutionHours: rows.length ? rows.reduce((sum, row) => sum + row.averageResolutionHours, 0) / rows.length : 0,
    maintenanceCount: rows.reduce((sum, row) => sum + row.maintenanceCount, 0),
    maintenanceCost: rows.reduce((sum, row) => sum + row.maintenanceCost, 0),
    safetyInspections: rows.reduce((sum, row) => sum + row.safetyInspections, 0),
    safetyFindings,
    completedSafetyActions,
    safetyActionCompletionRate: safetyFindings ? completedSafetyActions / safetyFindings * 100 : 100,
    downtimeHours: rows.reduce((sum, row) => sum + row.downtimeHours, 0),
  };
}

function changeRate(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return (current - previous) / previous * 100;
}

function managementFocus(complaints: number, findings: number, downtime: number) {
  if (findings >= complaints && findings * 3 >= downtime) return "안전 지적사항 시정 및 재점검";
  if (downtime >= 24) return "장비 예방정비와 장애시간 단축";
  if (complaints >= 20) return "반복민원 원인 제거와 처리기한 관리";
  return "이용률·시설상태 정기 모니터링";
}

export function buildAnnualParkingReportModel(
  dataset: AnnualParkingTestDataset,
  options: AnnualParkingReportOptions,
): AnnualParkingReportModel {
  const selectedTypes = new Set(options.lotTypes);
  const filtered: AnnualParkingTestDataset = {
    ...dataset,
    lots: dataset.lots.filter(lot => selectedTypes.has(lot.lotType)),
    monthlyMetrics: dataset.monthlyMetrics.filter(row => selectedTypes.has(row.lotType)),
  };
  const current = summarizeYear(filtered, options.year);
  const previous = summarizeYear(filtered, options.comparisonYear);
  const typeSummary = options.lotTypes.map(lotType => ({ ...summarizeYear(filtered, options.year, lotType), lotType }));
  const monthlyTrend = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const rows = filtered.monthlyMetrics.filter(row => row.year === options.year && row.month === month);
    return {
      month,
      vehicles: rows.reduce((sum, row) => sum + row.vehicles, 0),
      revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      utilizationRate: rows.length ? rows.reduce((sum, row) => sum + row.utilizationRate, 0) / rows.length : 0,
      complaints: rows.reduce((sum, row) => sum + row.complaints, 0),
      maintenanceCount: rows.reduce((sum, row) => sum + row.maintenanceCount, 0),
      downtimeHours: rows.reduce((sum, row) => sum + row.downtimeHours, 0),
    };
  });
  const riskLots = filtered.lots.map(lot => {
    const rows = filtered.monthlyMetrics.filter(row => row.year === options.year && row.lotId === lot.id);
    const complaints = rows.reduce((sum, row) => sum + row.complaints, 0);
    const safetyFindings = rows.reduce((sum, row) => sum + row.safetyFindings, 0);
    const downtimeHours = rows.reduce((sum, row) => sum + row.downtimeHours, 0);
    const riskScore = complaints * 2.5 + safetyFindings * 4 + downtimeHours * 1.2;
    return { code: lot.code, name: lot.name, lotType: lot.lotType, spaces: lot.spaces, complaints, safetyFindings, downtimeHours, riskScore, managementFocus: managementFocus(complaints, safetyFindings, downtimeHours) };
  }).sort((left, right) => right.riskScore - left.riskScore).slice(0, 12).map((row, index) => ({ ...row, rank: index + 1 }));

  const revenueGrowth = changeRate(current.revenue, previous.revenue);
  const vehicleGrowth = changeRate(current.vehicles, previous.vehicles);
  const complaintGrowth = changeRate(current.complaints, previous.complaints);
  const resolutionDelta = current.complaintResolutionRate - previous.complaintResolutionRate;
  const downtimeGrowth = changeRate(current.downtimeHours, previous.downtimeHours);
  const peakMonth = monthlyTrend.reduce((best, row) => row.utilizationRate > best.utilizationRate ? row : best, monthlyTrend[0]);
  const analysis = [
    `${options.year}년 공영주차장 이용차량은 전년 대비 ${Math.abs(vehicleGrowth).toFixed(1)}% ${vehicleGrowth >= 0 ? "증가" : "감소"}하였고, 수입은 ${Math.abs(revenueGrowth).toFixed(1)}% ${revenueGrowth >= 0 ? "증가" : "감소"}하였다. 이용량과 수입 변동을 함께 보면 요금수입 변화는 이용량 변화와 ${Math.abs(revenueGrowth - vehicleGrowth) < 3 ? "대체로 일치" : "차이"}한다.`,
    `월평균 이용률은 ${percent(current.averageUtilizationRate)}이며 ${peakMonth.month}월이 ${percent(peakMonth.utilizationRate)}로 가장 높았다. 성수기 혼잡 주차장은 현장 안내와 입·출차 동선 점검을 우선한다.`,
    `민원은 ${number(current.complaints)}건으로 전년 대비 ${Math.abs(complaintGrowth).toFixed(1)}% ${complaintGrowth <= 0 ? "감소" : "증가"}했고, 처리완료율은 ${percent(current.complaintResolutionRate)}로 전년보다 ${Math.abs(resolutionDelta).toFixed(1)}%p ${resolutionDelta >= 0 ? "개선" : "하락"}하였다.`,
    `시설 장애시간은 ${number(current.downtimeHours)}시간으로 전년 대비 ${Math.abs(downtimeGrowth).toFixed(1)}% ${downtimeGrowth <= 0 ? "감소" : "증가"}하였다. 중점관리 대상은 민원, 안전 지적, 장비 장애를 합산한 위험도 기준으로 선정하였다.`,
    `본 분석은 24개월 시범자료를 동일한 산식으로 비교한 검증 결과이며, 실제 행정 보고 전 원천자료 확정일·결측·중복·검증 상태를 담당자가 확인해야 한다.`,
  ];
  const recommendations = [
    `위험도 상위 ${Math.min(12, riskLots.length)}개소를 다음 연도 1분기 합동점검 대상으로 지정하고 주차장별 조치기한과 담당자를 확정한다.`,
    `이용률 상위 주차장은 혼잡시간대 안내, 회전율, 출입구 병목을 월별로 점검하고 노외·주차빌딩·노상 유형별 개선과제를 분리한다.`,
    `반복민원은 주차장·유형·원인·처리기간 기준으로 재분류해 시설보수 또는 운영정책 변경으로 연결하고 완료 근거를 문서번호와 연계한다.`,
    `예방정비 이행률과 장비 장애시간을 월별 관리지표로 운영하며, 주차빌딩은 소방·승강기·환기·비상설비 점검을 별도 추적한다.`,
    `연간보고서 확정 전 수입 검증, 민원 종결, 안전 시정조치, 시설 작업완료 자료의 마감 상태를 확인하는 부서 공동 검증 절차를 시행한다.`,
  ];
  return {
    options,
    sourceLabel: filtered.sourceLabel,
    current,
    previous,
    typeSummary,
    monthlyTrend,
    riskLots,
    analysis,
    recommendations,
    sourceCounts: {
      lots: filtered.lots.length,
      months: new Set(filtered.monthlyMetrics.map(row => `${row.year}-${row.month}`)).size,
      monthlyFacts: filtered.monthlyMetrics.length,
    },
  };
}

export function defaultAnnualParkingReportOptions(year = 2025): AnnualParkingReportOptions {
  return {
    year,
    comparisonYear: year - 1,
    selectedSections: [...ALL_SECTIONS],
    orientation: "portrait",
    lotTypes: ANNUAL_LOT_TYPE_OPTIONS.map(option => option.value),
    includeAppendix: true,
  };
}

export function parseAnnualParkingReportOptions(parameters: Record<string, string>): AnnualParkingReportOptions {
  const year = Number(parameters.year) || 2025;
  const knownSections = new Set(ALL_SECTIONS);
  const required = ANNUAL_PARKING_REPORT_SECTIONS.filter(section => section.required).map(section => section.id);
  const selected = (parameters.annual_sections || ALL_SECTIONS.join(","))
    .split(",")
    .filter((id): id is AnnualParkingReportSectionId => knownSections.has(id as AnnualParkingReportSectionId));
  const selectedSections = Array.from(new Set([...required, ...selected]));
  const knownTypes = new Set(ANNUAL_LOT_TYPE_OPTIONS.map(option => option.value));
  const lotTypes = (parameters.annual_lot_types || "offstreet,building,onstreet")
    .split(",")
    .filter((type): type is AnnualParkingLotType => knownTypes.has(type as AnnualParkingLotType));
  return {
    year,
    comparisonYear: Number(parameters.comparison_year) || year - 1,
    selectedSections,
    orientation: parameters.annual_orientation === "landscape" ? "landscape" : "portrait",
    lotTypes: lotTypes.length ? lotTypes : ANNUAL_LOT_TYPE_OPTIONS.map(option => option.value),
    includeAppendix: parameters.annual_include_appendix !== "false",
  };
}

function comparisonRows(model: AnnualParkingReportModel) {
  const values = [
    ["이용차량", model.current.vehicles, model.previous.vehicles, "대"],
    ["주차수입", model.current.revenue, model.previous.revenue, "원"],
    ["평균 이용률", model.current.averageUtilizationRate, model.previous.averageUtilizationRate, "%"],
    ["민원 접수", model.current.complaints, model.previous.complaints, "건"],
    ["민원 처리완료율", model.current.complaintResolutionRate, model.previous.complaintResolutionRate, "%"],
    ["유지보수비", model.current.maintenanceCost, model.previous.maintenanceCost, "원"],
    ["안전 시정완료율", model.current.safetyActionCompletionRate, model.previous.safetyActionCompletionRate, "%"],
    ["장비 장애시간", model.current.downtimeHours, model.previous.downtimeHours, "시간"],
  ] as const;
  return values.map(([label, current, previous, unit]) => {
    const delta = changeRate(current, previous);
    const formatter = unit === "원" ? won : unit === "%" ? (value: number) => percent(value) : (value: number) => `${number(value)}${unit}`;
    return [label, formatter(previous), formatter(current), `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`, delta > 3 ? "증가" : delta < -3 ? "감소" : "유사"];
  });
}

function tableHtml(headers: string[], rows: Array<Array<string | number>>, widths: number[], alignments?: Array<"left" | "center" | "right">) {
  const header = headers.map((label, index) => `<th style="width:${widths[index]}%;border:1px solid #7c8795;background:#e9eef4;padding:5px 4px;text-align:center;vertical-align:middle;font-size:8.6pt;white-space:nowrap">${escape(label)}</th>`).join("");
  const body = rows.length ? rows.map((row, rowIndex) => `<tr>${row.map((value, index) => `<td style="border:1px solid #9aa5b1;background:${rowIndex % 2 ? "#fafbfd" : "#ffffff"};padding:5px 4px;text-align:${alignments?.[index] || (index === 0 ? "left" : "right")};vertical-align:middle;font-size:8.5pt;line-height:1.35;word-break:keep-all">${escape(value)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}" style="border:1px solid #9aa5b1;padding:8px;text-align:center">해당 조건의 자료가 없습니다.</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 12px 0"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function keyValueHtml(rows: string[][]) {
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 12px 0"><tbody>${rows.map(row => `<tr>${row.map((value, index) => `<${index % 2 === 0 ? "th" : "td"} style="width:${index % 2 === 0 ? 15 : 35}%;border:1px solid #87919c;background:${index % 2 === 0 ? "#edf1f5" : "#ffffff"};padding:5px;vertical-align:middle;text-align:${index % 2 === 0 ? "center" : "left"};font-size:8.7pt;line-height:1.35;${index % 2 === 0 ? "white-space:nowrap;font-weight:normal" : ""}">${escape(value)}</${index % 2 === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function sectionTitle(value: string, pageBreak = false) {
  return `<p style="font-size:12pt;line-height:1.45;margin:0;padding:0;text-align:left;page-break-after:avoid">${pageBreak ? PAGE_BREAK_MARKER : ""}<br><span style="font-size:4pt">&#160;</span><strong>${escape(value)}</strong></p>`;
}

export async function createAnnualParkingHwpx(input: {
  model: AnnualParkingReportModel;
  title: string;
  reportNumber: string;
  officialDocumentNumber?: string;
  authorName?: string;
  organizationName?: string;
  disclosureStatus?: string;
  disclosureBasis?: string;
  documentSummary?: string;
  keywords?: string;
}): Promise<Blob> {
  const { model } = input;
  const selected = new Set(model.options.selectedSections);
  const orientation = model.options.orientation;
  const layouts: number[][] = [[50, 50], [70, 10, 10, 10], [15, 35, 15, 35], [15, 35, 15, 35]];
  const rowHeights: number[] = [0, 0, 0, 0];
  const addTable = (headers: string[], rows: Array<Array<string | number>>, widths: number[], alignments?: Array<"left" | "center" | "right">) => {
    layouts.push(widths);
    rowHeights.push(headers.length >= 7 ? 2600 : 2300);
    return tableHtml(headers, rows, widths, alignments);
  };
  const parts: string[] = [];
  if (selected.has("overview")) {
    parts.push(sectionTitle("1. 종합 현황"));
    parts.push(addTable(
      ["항목", "현황", "항목", "현황"],
      [
        ["관리 주차장", `${number(model.current.lotCount)}개소`, "총 주차면", `${number(model.current.spaces)}면`],
        ["연간 이용차량", `${number(model.current.vehicles)}대`, "연간 주차수입", won(model.current.revenue)],
        ["평균 이용률", percent(model.current.averageUtilizationRate), "민원 처리완료율", percent(model.current.complaintResolutionRate)],
        ["유지보수", `${number(model.current.maintenanceCount)}건`, "유지보수비", won(model.current.maintenanceCost)],
        ["안전점검", `${number(model.current.safetyInspections)}건`, "안전 시정완료율", percent(model.current.safetyActionCompletionRate)],
      ],
      [25, 25, 25, 25],
      ["center", "right", "center", "right"],
    ));
  }
  if (selected.has("comparison")) {
    parts.push(sectionTitle("2. 전년 대비 분석", true));
    parts.push(addTable(
      ["지표", `${model.previous.year}년`, `${model.current.year}년`, "증감률", "판단"],
      comparisonRows(model),
      [24, 21, 21, 17, 17],
      ["left", "right", "right", "right", "center"],
    ));
  }
  if (selected.has("type_summary")) {
    parts.push(sectionTitle("3. 주차장 유형별 현황"));
    parts.push(addTable(
      ["구분", "개소", "주차면", "이용차량", "수입", "이용률", "민원", "유지보수비"],
      model.typeSummary.map(row => [LOT_TYPE_LABELS[row.lotType], `${number(row.lotCount)}개소`, `${number(row.spaces)}면`, `${number(row.vehicles)}대`, won(row.revenue), percent(row.averageUtilizationRate), `${number(row.complaints)}건`, won(row.maintenanceCost)]),
      [14, 9, 10, 14, 17, 10, 9, 17],
      ["center", "right", "right", "right", "right", "right", "right", "right"],
    ));
  }
  if (selected.has("monthly_trend")) {
    parts.push(sectionTitle("4. 월별 운영 추이", true));
    parts.push(addTable(
      ["월", "이용차량", "주차수입", "평균 이용률", "민원", "유지보수", "장애시간"],
      model.monthlyTrend.map(row => [`${row.month}월`, `${number(row.vehicles)}대`, won(row.revenue), percent(row.utilizationRate), `${number(row.complaints)}건`, `${number(row.maintenanceCount)}건`, `${number(row.downtimeHours)}시간`]),
      [9, 17, 22, 15, 11, 13, 13],
      ["center", "right", "right", "right", "right", "right", "right"],
    ));
  }
  if (selected.has("service_facility")) {
    parts.push(sectionTitle("5. 민원·시설·안전 통합 분석"));
    parts.push(addTable(
      ["관리영역", "연간 현황", "전년 현황", "검토사항"],
      [
        ["민원", `${number(model.current.complaints)}건 / 완료율 ${percent(model.current.complaintResolutionRate)}`, `${number(model.previous.complaints)}건 / 완료율 ${percent(model.previous.complaintResolutionRate)}`, "반복민원 원인과 처리기한 초과 여부 확인"],
        ["시설", `${number(model.current.maintenanceCount)}건 / ${won(model.current.maintenanceCost)}`, `${number(model.previous.maintenanceCount)}건 / ${won(model.previous.maintenanceCost)}`, "예방정비 이행과 장비별 장애시간 확인"],
        ["안전", `${number(model.current.safetyFindings)}건 / 시정 ${percent(model.current.safetyActionCompletionRate)}`, `${number(model.previous.safetyFindings)}건 / 시정 ${percent(model.previous.safetyActionCompletionRate)}`, "미완료 시정조치의 담당자·완료기한 확정"],
      ],
      [14, 25, 25, 36],
      ["center", "left", "left", "left"],
    ));
  }
  if (selected.has("risk_lots")) {
    parts.push(sectionTitle("6. 중점관리 대상", true));
    parts.push(addTable(
      ["순위", "코드", "주차장", "형태", "주차면", "민원", "안전지적", "장애시간", "관리 초점"],
      model.riskLots.map(row => [row.rank, row.code, row.name, LOT_TYPE_LABELS[row.lotType], row.spaces, row.complaints, row.safetyFindings, row.downtimeHours.toFixed(1), row.managementFocus]),
      [6, 10, 20, 11, 8, 7, 8, 9, 21],
      ["center", "center", "left", "center", "right", "right", "right", "right", "left"],
    ));
  }
  if (selected.has("analysis")) {
    parts.push(sectionTitle("7. 종합 분석 및 차년도 조치계획", true));
    parts.push(`<p style="margin:0 0 6px 0;font-size:9pt;line-height:1.55"><strong>가. 종합 분석</strong></p>${model.analysis.map((item, index) => `<p style="margin:0 0 7px 0;padding-left:5mm;text-indent:-5mm;font-size:9pt;line-height:1.55">${index + 1}) ${escape(item)}</p>`).join("")}`);
    parts.push(`<p style="margin:10px 0 6px 0;font-size:9pt;line-height:1.55"><strong>나. 차년도 우선 조치계획</strong></p>${model.recommendations.map((item, index) => `<p style="margin:0 0 7px 0;padding-left:5mm;text-indent:-5mm;font-size:9pt;line-height:1.55">${index + 1}) ${escape(item)}</p>`).join("")}`);
  }
  if (selected.has("appendix") && model.options.includeAppendix) {
    parts.push(sectionTitle("붙임. 자료 산출 및 검증 기준"));
    parts.push(addTable(
      ["구분", "내용"],
      [
        ["자료기간", `${model.options.comparisonYear}. 1. 1. ~ ${model.options.year}. 12. 31. (24개월)`],
        ["대상시설", `${model.sourceCounts.lots}개소 / ${model.options.lotTypes.map(type => LOT_TYPE_LABELS[type]).join(", ")}`],
        ["자료건수", `월별 주차장 지표 ${number(model.sourceCounts.monthlyFacts)}건`],
        ["산출기준", "동일 주차장·동일 월 단위 집계, 전년 대비 증감률과 유형별 비교"],
        ["검증상태", "기능·서식 검증용 시범자료이며 실제 행정통계 확정 전 원천자료 대조 필요"],
      ],
      [20, 80],
      ["center", "left"],
    ));
  }

  const titleWidth = 70;
  const approvalWidth = 10;
  const metadata = [
    ["관리번호", input.reportNumber, "관련 문서번호", input.officialDocumentNumber || "미지정"],
    ["담당부서", PRIMARY_DEPARTMENT, "작성자", input.authorName || "-"],
    ["보고기간", `${model.options.year}. 1. 1. ~ ${model.options.year}. 12. 31.`, "공개구분", input.disclosureStatus || "공개"],
  ];
  const overview = [
    ["보고대상", `제주시 공영주차장 ${model.current.lotCount}개소`, "비교기준", `${model.options.comparisonYear}년 대비 ${model.options.year}년`],
    ["작성목적", "주차장 운영성과와 서비스·시설·안전 위험을 종합 분석", "주요내용", "현황, 전년 비교, 유형별·월별 분석, 중점관리 대상, 조치계획"],
    ["자료범위", `${model.sourceCounts.months}개월·월별지표 ${number(model.sourceCounts.monthlyFacts)}건`, "산출기준", "주차장·월 단위 집계 후 동일 산식으로 비교"],
  ];
  const privacy = input.disclosureStatus && input.disclosureStatus !== "공개"
    ? `<p style="margin:0 0 8px 0;color:#9f1239;font-size:8.5pt"><strong>비공개 근거:</strong> ${escape(input.disclosureBasis || "근거 미입력")}</p>` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div style="font-family:'맑은 고딕','휴먼고딕';font-size:10pt;line-height:1.45;padding:0;color:#111827">
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 10px 0"><tbody><tr><td style="width:50%;border:0;border-bottom:1px solid #1f2937;padding:0 0 5px 0;font-size:9pt">${escape(input.organizationName || PRIMARY_ORGANIZATION)}</td><td style="width:50%;border:0;border-bottom:1px solid #1f2937;padding:0 0 5px 0;font-size:9pt;text-align:right">내부보고</td></tr></tbody></table>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 12px 0"><tbody><tr><td rowspan="2" style="width:${titleWidth}%;border:0;padding:0 10px 0 0;vertical-align:middle;text-align:left;font-size:${OPERATIONS_REPORT_LAYOUT.titleFontPt[orientation]}pt;font-weight:bold;line-height:1.3"><strong>${escape(input.title)}</strong></td>${["담당", "팀장", "과장"].map(label => `<th style="width:${approvalWidth}%;height:7mm;border:1px solid #646c74;background:#f2f4f7;padding:2px;text-align:center;font-size:7pt">${label}</th>`).join("")}</tr><tr>${["", "", ""].map(() => `<td style="height:14mm;border:1px solid #646c74;padding:2px"></td>`).join("")}</tr></tbody></table>
    ${keyValueHtml(metadata)}
    ${sectionTitle("보고 개요")}
    ${keyValueHtml(overview)}
    <p style="font-size:8.5pt;line-height:1.35;margin:5px 0 8px 0;color:#475569"><strong>자료구분:</strong> ${escape(model.sourceLabel)}</p>
    <p style="font-size:8.5pt;line-height:1.35;margin:0 0 9px 0;color:#475569"><strong>키워드:</strong> ${escape(input.keywords || "제주시, 공영주차장, 연간현황, 운영분석, 시설안전, 민원")}</p>${privacy}
    ${parts.join("")}
    <p style="font-size:8pt;line-height:1.35;color:#64748b;border-top:1px solid #94a3b8;padding-top:6px">자료기준: ${escape(model.sourceLabel)} | ${escape(input.reportNumber)}</p>
  </div></body></html>`;
  const bytes = await htmlToHwpx(html, {
    title: input.title,
    creator: input.authorName || PRIMARY_DEPARTMENT,
    page: { size: "A4", orientation, margins: { left: 14, right: 14, top: 10, bottom: 18, header: 5, footer: 8 } },
  });
  const patched = await applyOfficeFontToHwpx(Uint8Array.from(bytes), "맑은 고딕", layouts, rowHeights, layouts.map((_, index) => index >= 4 ? 450 : 0));
  const buffer = patched.buffer.slice(patched.byteOffset, patched.byteOffset + patched.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type: "application/hwp+zip" });
}

export async function validateAnnualParkingHwpx(blob: Blob) {
  const reader = new HwpxReader();
  await reader.loadFromArrayBuffer(await blob.arrayBuffer());
  const [info, text] = await Promise.all([reader.getDocumentInfo(), reader.extractText()]);
  const required = ["공영주차장", "종합 현황", "전년 대비", "종합 분석", "차년도"];
  const missing = required.filter(value => !text.includes(value));
  if (!info.summary.contentsFiles.length || missing.length) throw new Error(`연간 통합보고서 HWPX 검증에 실패했습니다: ${missing.join(", ")}`);
  return { valid: true as const, textLength: text.length, pageSections: info.summary.contentsFiles.length };
}
