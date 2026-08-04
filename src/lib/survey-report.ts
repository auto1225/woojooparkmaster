import { PRIMARY_DEPARTMENT } from "@/config/organization";
import { supabase } from "@/integrations/supabase/client";
import type { OperationsReportModel, OperationsReportOrientation, OperationsReportTable } from "@/lib/operations-report";
import { PHOTO_CATEGORIES, SURVEY_STATUS_LABELS, SURVEY_TYPE_LABELS, getSurveyPhotoCategories } from "@/types/survey";

export type SurveyReportSectionId =
  | "overview"
  | "workflow"
  | "lot_types"
  | "basic"
  | "infra"
  | "operation"
  | "usage"
  | "sensor_plan"
  | "photos"
  | "documents"
  | "risks";
export type SurveyReportSort = "attention" | "date_desc" | "parking_lot" | "status" | "lot_type";
export type SurveyReportOrientation = OperationsReportOrientation;

export interface SurveyReportField {
  key: string;
  label: string;
  protected?: boolean;
  value: (row: any, dataset: SurveyReportDataset, options: SurveyReportOptions) => unknown;
}

export interface SurveyReportSection {
  id: SurveyReportSectionId;
  label: string;
  description: string;
  fields: SurveyReportField[];
  defaultFields: string[];
}

export interface SurveyReportOptions {
  periodStart: string;
  periodEnd: string;
  asOfDate: string;
  selectedSections: SurveyReportSectionId[];
  selectedFields: Partial<Record<SurveyReportSectionId, string[]>>;
  lotTypes: string[];
  statuses: string[];
  sort: SurveyReportSort;
  orientation: SurveyReportOrientation;
  includeInvalidated: boolean;
}

export interface SurveyEvidenceSource {
  expected: number;
  loaded: number;
  complete: boolean;
}

export interface SurveyReportEvidenceMetadata {
  complete: boolean;
  collectedAt: string;
  queryLimit: number;
  truncationPolicy: "fail";
  sourceTables: string[];
  filters: {
    periodStart: string;
    periodEnd: string;
    asOfDate: string;
    lotTypes: string[];
    statuses: string[];
    includeInvalidated: boolean;
  };
  sources: Record<string, SurveyEvidenceSource>;
}

export interface SurveyReportDataset {
  parkingLots: any[];
  surveys: any[];
  basicInfo: any[];
  infra: any[];
  operation: any[];
  usage: any[];
  sensorPlans: any[];
  photos: any[];
  documentNumbers: Record<string, string[]>;
  evidenceMetadata?: SurveyReportEvidenceMetadata;
}

export interface SurveyReportSummary extends Record<string, number> {
  parkingLots: number;
  surveys: number;
  draft: number;
  inProgress: number;
  submitted: number;
  review: number;
  approved: number;
  rejected: number;
  invalidated: number;
  offstreetSurveys: number;
  buildingSurveys: number;
  onstreetSurveys: number;
  totalSpaces: number;
  completeRecords: number;
  completionRate: number;
  installedSensors: number;
  plannedSensors: number;
  plannedGateways: number;
  photos: number;
  surveysWithPanorama: number;
  missingTypePhotos: number;
  linkedDocuments: number;
  surveysMissingDocuments: number;
  riskCount: number;
}

export interface SurveyReportModel {
  period: { start: string; end: string };
  asOfDate: string;
  lotTypeLabels: string[];
  summary: SurveyReportSummary;
  sourceCounts: Record<string, number>;
  tables: OperationsReportTable[];
  selectedFieldCount: number;
  protectedFieldCount: number;
  riskNarrative: string;
  evidenceMetadata: SurveyReportEvidenceMetadata;
}

const QUERY_LIMIT = 5000;
const ID_CHUNK_SIZE = 200;
const SOURCE_TABLES = [
  "parking_lots", "surveys", "survey_basic_info", "survey_infra", "survey_operation",
  "survey_usage", "survey_sensor_plan", "survey_photos", "attachments", "official_documents",
];
const LOT_TYPE_ALIASES: Record<string, string[]> = {
  offstreet: ["offstreet", "off_street", "surface", "vacant_lot"],
  building: ["building", "parking_building", "multilevel", "mechanical", "underground"],
  onstreet: ["onstreet", "on_street"],
};
const LOT_TYPE_LABELS: Record<string, string> = {
  offstreet: "노외주차장", off_street: "노외주차장", surface: "노외주차장", vacant_lot: "노외주차장",
  building: "주차빌딩", parking_building: "주차빌딩", multilevel: "주차빌딩", mechanical: "주차빌딩", underground: "주차빌딩",
  onstreet: "노상주차장", on_street: "노상주차장",
};
const STATUS_ORDER: Record<string, number> = { rejected: 0, review: 1, submitted: 2, in_progress: 3, draft: 4, approved: 5 };
const PHOTO_LABELS = new Map(PHOTO_CATEGORIES.map(item => [item.code, item.label]));

export const SURVEY_REPORT_LOT_TYPE_OPTIONS = [
  { value: "offstreet", label: "노외주차장" },
  { value: "building", label: "주차빌딩" },
  { value: "onstreet", label: "노상주차장" },
];

const relation = (row: any, key: string) => Array.isArray(row?.[key]) ? row[key][0] : row?.[key];
const text = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);
const dateOnly = (value: unknown) => value ? String(value).split("T")[0] : "-";
const dateTime = (value: unknown) => value ? String(value).replace("T", " ").replace("Z", "").slice(0, 16) : "-";
const yesNo = (value: unknown) => value === null || value === undefined ? "-" : value ? "예" : "아니오";
const countLabel = (value: unknown, suffix = "개") => `${Number(value || 0).toLocaleString("ko-KR")}${suffix}`;
const unique = (values: unknown[]) => [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
const documentKey = (surveyId: string) => `SURVEY:${surveyId}`;
const statusLabel = (value: unknown) => SURVEY_STATUS_LABELS[String(value || "") as keyof typeof SURVEY_STATUS_LABELS] || text(value);
const surveyTypeLabel = (value: unknown) => SURVEY_TYPE_LABELS[String(value || "")] || text(value);
const normalizedRate = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const match = raw.match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
};

function surveyFor(row: any, dataset: SurveyReportDataset) {
  return relation(row, "surveys") || dataset.surveys.find(survey => survey.id === row.survey_id) || row;
}

function basicFor(row: any, dataset: SurveyReportDataset) {
  const survey = row.lot_id ? row : surveyFor(row, dataset);
  return relation(survey, "survey_basic_info") || dataset.basicInfo.find(item => item.survey_id === survey.id);
}

function lotFor(row: any, dataset: SurveyReportDataset) {
  const survey = row.lot_id ? row : surveyFor(row, dataset);
  return relation(survey, "parking_lots") || dataset.parkingLots.find(lot => lot.id === survey.lot_id);
}

function lotName(row: any, dataset: SurveyReportDataset) {
  return basicFor(row, dataset)?.lot_name || lotFor(row, dataset)?.name || "주차장 미지정";
}

function lotCode(row: any, dataset: SurveyReportDataset) {
  return lotFor(row, dataset)?.code || "-";
}

function lotType(row: any, dataset: SurveyReportDataset) {
  return basicFor(row, dataset)?.lot_type || lotFor(row, dataset)?.lot_type || "";
}

function lotTypeLabel(row: any, dataset: SurveyReportDataset) {
  const value = lotType(row, dataset);
  return LOT_TYPE_LABELS[value] || value || "미지정";
}

function childFor<T = any>(rows: T[], surveyId: string) {
  return (rows as any[]).find(row => row.survey_id === surveyId);
}

function photosFor(surveyId: string, dataset: SurveyReportDataset) {
  return dataset.photos.filter(photo => photo.survey_id === surveyId);
}

function documentsFor(surveyId: string, dataset: SurveyReportDataset) {
  return unique(dataset.documentNumbers[documentKey(surveyId)] || []);
}

function photoCategoryLabel(category: unknown) {
  const value = String(category || "");
  return PHOTO_LABELS.get(value) || getSurveyPhotoCategories().find(item => item.code === value)?.label || value || "미분류";
}

function paymentMethods(row: any) {
  return [row.payment_cash && "현금", row.payment_card && "카드", row.payment_mobile && "모바일", row.payment_none && "무료"].filter(Boolean).join("·") || "-";
}

function networkMethods(row: any) {
  return [row.network_wired && "유선", row.network_wifi && "Wi-Fi", row.network_lte && "LTE", row.network_etc].filter(Boolean).join("·") || "-";
}

function peakTimes(row: any) {
  return [row.peak_morning && "오전", row.peak_afternoon && "오후", row.peak_night && "야간", row.peak_free_time && "무료시간"].filter(Boolean).join("·") || "-";
}

function primaryUsers(row: any) {
  return [row.user_residents && "주민", row.user_commercial && "상가이용객", row.user_tourists && "관광객", row.user_etc].filter(Boolean).join("·") || "-";
}

function specificSiteSummary(basic: any) {
  if (!basic) return "기본시설 미입력";
  if (LOT_TYPE_ALIASES.building.includes(basic.lot_type)) {
    return `층수 ${Number(basic.lot_type_floor || 0)}층·소방 ${text(basic.fire_safety_condition)}·환기 ${text(basic.ventilation_condition)}·램프 ${text(basic.ramp_condition)}`;
  }
  if (LOT_TYPE_ALIASES.onstreet.includes(basic.lot_type)) {
    return `${text(basic.road_segment)}·${text(basic.road_side)}·교통 ${text(basic.traffic_direction)}·표지 ${text(basic.sign_condition)}`;
  }
  return `면적 ${Number(basic.site_area_sqm || 0).toLocaleString("ko-KR")}㎡·배수 ${text(basic.drainage_condition)}·보행 ${text(basic.pedestrian_route_condition)}`;
}

function requiredTypePhotoCategories(type: string) {
  if (LOT_TYPE_ALIASES.building.includes(type)) return ["ramp"];
  if (LOT_TYPE_ALIASES.onstreet.includes(type)) return ["street_segment", "road_sign"];
  if (LOT_TYPE_ALIASES.offstreet.includes(type)) return ["drainage", "pedestrian_route"];
  return [];
}

function hasTypePhoto(survey: any, dataset: SurveyReportDataset) {
  const required = requiredTypePhotoCategories(lotType(survey, dataset));
  const categories = new Set(photosFor(survey.id, dataset).map(photo => photo.category));
  return required.length === 0 || required.some(category => categories.has(category));
}

function surveyValidationIssues(survey: any, dataset: SurveyReportDataset) {
  const basic = childFor(dataset.basicInfo, survey.id);
  const operation = childFor(dataset.operation, survey.id);
  const infra = childFor(dataset.infra, survey.id);
  const usage = childFor(dataset.usage, survey.id);
  const sensor = childFor(dataset.sensorPlans, survey.id);
  const photos = photosFor(survey.id, dataset);
  const issues: string[] = [];
  if (!basic) issues.push("기본시설 미입력");
  if (!operation) issues.push("운영현황 미입력");
  if (!infra) issues.push("인프라 미입력");
  if (!usage) issues.push("이용현황 미입력");
  if (!sensor) issues.push("센서계획 미입력");
  if (basic) {
    if (!basic.lot_name || !basic.address || Number(basic.total_spaces || 0) <= 0) issues.push("주차장명·주소·면수 확인");
    if (basic.gps_lat == null || basic.gps_lng == null) issues.push("GPS 누락");
    const special = Number(basic.disabled_spaces || 0) + Number(basic.ev_spaces || 0) + Number(basic.compact_spaces || 0) + Number(basic.pregnant_spaces || 0) + Number(basic.other_spaces || 0);
    if (special > Number(basic.total_spaces || 0)) issues.push("특수면수 합계 오류");
    if (LOT_TYPE_ALIASES.building.includes(basic.lot_type) && (Number(basic.lot_type_floor || 0) <= 0 || !basic.fire_safety_condition || !basic.ventilation_condition || !basic.ramp_condition)) issues.push("주차빌딩 필수시설 누락");
    if (LOT_TYPE_ALIASES.onstreet.includes(basic.lot_type) && (!basic.road_segment || !basic.road_side || !basic.sign_condition)) issues.push("노상 필수현황 누락");
    if (LOT_TYPE_ALIASES.offstreet.includes(basic.lot_type) && (!basic.drainage_condition || !basic.pedestrian_route_condition)) issues.push("노외 필수현황 누락");
  }
  if (operation && (!operation.operating_hours || !operation.management_type)) issues.push("운영시간·관리방식 누락");
  if (infra && !infra.power_status) issues.push("전기상태 누락");
  if (usage && !usage.avg_usage_rate) issues.push("이용률 누락");
  if (!photos.some(photo => photo.category === "panorama")) issues.push("전경사진 누락");
  if (!hasTypePhoto(survey, dataset)) issues.push("형태별 현장사진 누락");
  if (!documentsFor(survey.id, dataset).length) issues.push("공식문서번호 미연계");
  return unique(issues);
}

function surveyComplete(survey: any, dataset: SurveyReportDataset) {
  return surveyValidationIssues(survey, dataset).length === 0;
}

function field(key: string, label: string, value: SurveyReportField["value"], protectedField = false): SurveyReportField {
  return { key, label, value, protected: protectedField };
}

export const SURVEY_REPORT_SECTIONS: SurveyReportSection[] = [
  { id: "overview", label: "현황조사 종합", description: "조사 진행·검토·승인과 자료 완전성 핵심지표", fields: [], defaultFields: [] },
  {
    id: "workflow", label: "조사 진행·검토·승인", description: "조사 유형, 상태, 제출·검토·승인, 문서번호",
    fields: [
      field("lot_code", "주차장코드", (row, dataset) => lotCode(row, dataset)), field("lot", "주차장", (row, dataset) => lotName(row, dataset)),
      field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)), field("survey_type", "조사유형", row => surveyTypeLabel(row.survey_type)),
      field("survey_date", "조사일", row => dateOnly(row.survey_date)), field("status", "진행상태", row => statusLabel(row.status)),
      field("submitted_at", "제출일", row => dateTime(row.submitted_at)), field("reviewed_at", "검토일", row => dateTime(row.reviewed_at)),
      field("approved_at", "승인일", row => dateTime(row.approved_at)), field("reject_reason", "반려사유", row => row.reject_reason),
      field("completeness", "자료검증", (row, dataset) => surveyComplete(row, dataset) ? "완료" : surveyValidationIssues(row, dataset).join("·")),
      field("document_numbers", "공식 문서번호", (row, dataset) => documentsFor(row.id, dataset).join(", ") || "-"),
      field("author_name", "조사자", row => row.author_name || relation(row, "surveyor")?.name, true),
      field("reviewer_id", "검토자 식별값", row => row.reviewer_id, true), field("approver_id", "승인자 식별값", row => row.approver_id, true),
    ],
    defaultFields: ["lot_code", "lot", "lot_type", "survey_type", "survey_date", "status", "submitted_at", "reviewed_at", "approved_at", "reject_reason", "completeness", "document_numbers"],
  },
  {
    id: "lot_types", label: "주차장 형태별 현황", description: "노외·주차빌딩·노상별 조사·면수·승인·증빙 현황",
    fields: [
      field("lot_type", "주차장 형태", row => row.lot_type_label), field("parking_lots", "주차장", row => countLabel(row.parking_lots, "개소")),
      field("surveys", "조사", row => countLabel(row.surveys, "건")), field("total_spaces", "주차면", row => countLabel(row.total_spaces, "면")),
      field("in_progress", "진행·검토", row => countLabel(row.in_progress, "건")), field("approved", "승인", row => countLabel(row.approved, "건")),
      field("complete_records", "검증완료", row => countLabel(row.complete_records, "건")), field("photos", "사진", row => countLabel(row.photos, "장")),
      field("planned_sensors", "계획센서", row => countLabel(row.planned_sensors, "대")), field("documents", "공식문서", row => countLabel(row.documents, "건")),
    ],
    defaultFields: ["lot_type", "parking_lots", "surveys", "total_spaces", "in_progress", "approved", "complete_records", "photos", "planned_sensors", "documents"],
  },
  {
    id: "basic", label: "기본시설 현황", description: "주소·면수·출입구·GPS와 주차장 형태별 필수시설",
    fields: [
      field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)),
      field("address", "주소", row => row.address), field("operator_type", "운영주체", row => row.operator_type),
      field("total_spaces", "총 주차면", row => countLabel(row.total_spaces, "면")), field("disabled_spaces", "장애인면", row => countLabel(row.disabled_spaces, "면")),
      field("ev_spaces", "전기차면", row => countLabel(row.ev_spaces, "면")), field("compact_spaces", "경차면", row => countLabel(row.compact_spaces, "면")),
      field("pregnant_spaces", "임산부면", row => countLabel(row.pregnant_spaces, "면")), field("entry_exit", "입·출구", row => `${Number(row.entry_count || 0)}/${Number(row.exit_count || 0)}개소${row.entry_exit_same ? "(공용)" : ""}`),
      field("surface_type", "포장형태", row => row.surface_type), field("type_specific", "형태별 시설현황", row => specificSiteSummary(row)),
      field("gps", "GPS", row => row.gps_lat != null && row.gps_lng != null ? `${row.gps_lat}, ${row.gps_lng}` : "-", true),
    ],
    defaultFields: ["lot", "lot_type", "address", "operator_type", "total_spaces", "disabled_spaces", "ev_spaces", "compact_spaces", "pregnant_spaces", "entry_exit", "surface_type", "type_specific"],
  },
  {
    id: "infra", label: "기본 인프라", description: "전기·통신·전광판·센서·관제장비 설치 현황",
    fields: [
      field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)),
      field("power_status", "전기상태", row => row.power_status), field("power_note", "전기 특이사항", row => row.power_note),
      field("network", "통신망", row => networkMethods(row)), field("display_installed", "전광판 설치", row => yesNo(row.display_installed)),
      field("display_in_use", "전광판 사용", row => yesNo(row.display_in_use)), field("display_company", "전광판 업체", row => row.display_company),
      field("sensor_installed", "센서 설치", row => yesNo(row.sensor_installed)), field("sensor_count", "기존 센서", row => countLabel(row.sensor_count, "대")),
      field("sensor_in_use", "센서 사용", row => yesNo(row.sensor_in_use)), field("sensor_company", "센서 업체", row => row.sensor_company),
      field("equipment", "관제장비", row => [row.has_barrier && "차단기", row.has_lpr && "LPR", row.has_kiosk && "무인정산기", row.has_cctv && "CCTV"].filter(Boolean).join("·") || "-"),
      field("equipment_company", "관제업체", row => row.equipment_company),
    ],
    defaultFields: ["lot", "lot_type", "power_status", "power_note", "network", "display_installed", "display_in_use", "display_company", "sensor_installed", "sensor_count", "sensor_in_use", "sensor_company", "equipment", "equipment_company"],
  },
  {
    id: "operation", label: "운영 현황", description: "운영시간·결제·근무·관리방식·시스템 연계",
    fields: [
      field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)),
      field("operating_hours", "운영시간", row => row.operating_hours === "custom" ? row.operating_hours_custom : row.operating_hours),
      field("payment_methods", "결제수단", row => paymentMethods(row)), field("staff_type", "근무형태", row => row.staff_type),
      field("staff_count", "근무인원", row => countLabel(row.staff_count, "명")), field("management_type", "관리방식", row => row.management_type),
      field("management_etc", "관리 특이사항", row => row.management_etc), field("control_linked", "관제연계", row => yesNo(row.control_linked)),
      field("portal_linked", "포털연계", row => yesNo(row.portal_linked)), field("author_name", "입력자", row => row.author_name, true),
    ],
    defaultFields: ["lot", "lot_type", "operating_hours", "payment_methods", "staff_type", "staff_count", "management_type", "management_etc", "control_linked", "portal_linked"],
  },
  {
    id: "usage", label: "이용 현황", description: "평균 이용률·혼잡시간·주 이용자",
    fields: [
      field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)),
      field("avg_usage_rate", "평균 이용률", row => row.avg_usage_rate), field("usage_numeric", "이용률 환산", row => `${normalizedRate(row.avg_usage_rate)}%`),
      field("peak_times", "혼잡시간", row => peakTimes(row)), field("primary_users", "주 이용자", row => primaryUsers(row)),
      field("author_name", "입력자", row => row.author_name, true),
    ],
    defaultFields: ["lot", "lot_type", "avg_usage_rate", "usage_numeric", "peak_times", "primary_users"],
  },
  {
    id: "sensor_plan", label: "센서 설치계획", description: "신규 센서·게이트웨이와 전광판·포털 연계 가능성",
    fields: [
      field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)),
      field("planned_sensors", "계획 센서", row => countLabel(row.planned_sensors, "대")), field("planned_gateways", "게이트웨이", row => countLabel(row.planned_gateways, "대")),
      field("gateway_location", "설치위치", row => row.gateway_location), field("display_sw_feasibility", "전광판SW", row => row.display_sw_feasibility),
      field("display_sw_note", "전광판 검토", row => row.display_sw_note), field("portal_feasibility", "포털연계", row => row.portal_feasibility),
      field("portal_note", "포털 검토", row => row.portal_note), field("author_name", "입력자", row => row.author_name, true),
    ],
    defaultFields: ["lot", "lot_type", "planned_sensors", "planned_gateways", "gateway_location", "display_sw_feasibility", "display_sw_note", "portal_feasibility", "portal_note"],
  },
  {
    id: "photos", label: "사진 증빙", description: "사진 분류·촬영일·설명·GPS와 형태별 필수사진",
    fields: [
      field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)),
      field("category", "사진분류", row => photoCategoryLabel(row.category)), field("caption", "설명", row => row.caption),
      field("taken_at", "촬영일시", row => dateTime(row.taken_at || row.created_at)), field("file_evidence", "원본파일", row => row.file_path ? "등록" : "누락"),
      field("thumbnail", "미리보기", row => row.thumbnail_path ? "등록" : "미등록"), field("gps", "촬영 GPS", row => row.gps_lat != null && row.gps_lng != null ? `${row.gps_lat}, ${row.gps_lng}` : "-", true),
    ],
    defaultFields: ["lot", "lot_type", "category", "caption", "taken_at", "file_evidence", "thumbnail"],
  },
  {
    id: "documents", label: "공식 문서번호", description: "조사별 문서대장 연계와 승인 근거",
    fields: [
      field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("survey_date", "조사일", row => dateOnly(row.survey_date)),
      field("status", "상태", row => statusLabel(row.status)), field("document_numbers", "공식 문서번호", (row, dataset) => documentsFor(row.id, dataset).join(", ") || "-"),
      field("document_count", "연계건수", (row, dataset) => countLabel(documentsFor(row.id, dataset).length, "건")), field("approved_at", "승인일", row => dateTime(row.approved_at)),
    ],
    defaultFields: ["lot", "survey_date", "status", "document_numbers", "document_count", "approved_at"],
  },
  {
    id: "risks", label: "검증·보완사항", description: "필수 세부자료·유형별 시설·사진·공식문서 누락",
    fields: [
      field("risk_level", "위험도", row => row.risk_level), field("lot", "주차장", row => row.lot), field("lot_type", "형태", row => row.lot_type),
      field("survey_date", "조사일", row => row.survey_date), field("status", "상태", row => row.status), field("finding", "확인사항", row => row.finding),
      field("next_action", "조치사항", row => row.next_action), field("document_number", "문서번호", row => row.document_number),
    ],
    defaultFields: ["risk_level", "lot", "lot_type", "survey_date", "status", "finding", "next_action", "document_number"],
  },
];

export const SURVEY_REPORT_PRESETS = {
  summary: { label: "간부 요약", sections: ["overview", "workflow", "lot_types", "risks"] as SurveyReportSectionId[] },
  standard: { label: "실무 종합", sections: SURVEY_REPORT_SECTIONS.map(section => section.id) },
  audit: { label: "감사 대응", sections: ["overview", "workflow", "lot_types", "basic", "infra", "operation", "usage", "sensor_plan", "photos", "documents", "risks"] as SurveyReportSectionId[] },
  approval: { label: "검토·승인", sections: ["overview", "workflow", "basic", "photos", "documents", "risks"] as SurveyReportSectionId[] },
};

export function defaultSurveyReportFields(): Partial<Record<SurveyReportSectionId, string[]>> {
  return Object.fromEntries(SURVEY_REPORT_SECTIONS.map(section => [section.id, [...section.defaultFields]]));
}

export function parseSurveyReportOptions(parameters: Record<string, string>): SurveyReportOptions {
  const today = new Date().toISOString().slice(0, 10);
  const periodStart = parameters.period_start || `${today.slice(0, 4)}-01-01`;
  const periodEnd = parameters.period_end || periodStart;
  const knownSections = new Set(SURVEY_REPORT_SECTIONS.map(section => section.id));
  const selectedSections = (parameters.survey_sections || SURVEY_REPORT_PRESETS.summary.sections.join(","))
    .split(",").filter((id): id is SurveyReportSectionId => knownSections.has(id as SurveyReportSectionId));
  let selectedFields = defaultSurveyReportFields();
  try {
    const parsed = JSON.parse(parameters.survey_fields || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) selectedFields = { ...selectedFields, ...parsed };
  } catch {
    selectedFields = defaultSurveyReportFields();
  }
  return {
    periodStart,
    periodEnd,
    asOfDate: parameters.survey_as_of_date || periodEnd,
    selectedSections: selectedSections.length ? selectedSections : ["overview"],
    selectedFields,
    lotTypes: (parameters.survey_lot_types || "offstreet,building,onstreet").split(",").filter(Boolean),
    statuses: (parameters.survey_statuses || "").split(",").filter(Boolean),
    sort: (["attention", "date_desc", "parking_lot", "status", "lot_type"].includes(parameters.survey_sort) ? parameters.survey_sort : "attention") as SurveyReportSort,
    orientation: parameters.survey_orientation === "landscape" ? "landscape" : "portrait",
    includeInvalidated: parameters.survey_include_invalidated === "true",
  };
}

export function assertCompleteSurveyResult(
  label: string,
  result: { data?: unknown[] | null; error?: { message: string } | null; count?: number | null },
  limit = QUERY_LIMIT,
) {
  if (result.error) throw new Error(`${label} 자료 조회에 실패했습니다: ${result.error.message}`);
  const rows = result.data || [];
  if (typeof result.count === "number" && (result.count > limit || result.count > rows.length)) {
    throw new Error(`${label} 자료 ${result.count}건 중 ${rows.length}건만 조회되어 보고서 생성을 중단했습니다.`);
  }
  if (rows.length > limit) throw new Error(`${label} 자료가 ${limit}건을 초과하여 보고서 생성을 중단했습니다.`);
  return rows;
}

async function checkedQuery(label: string, promise: PromiseLike<any>, limit = QUERY_LIMIT) {
  return assertCompleteSurveyResult(label, await promise, limit) as any[];
}

function chunks<T>(values: T[], size = ID_CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function collectSurveyChildren(table: "survey_basic_info" | "survey_infra" | "survey_operation" | "survey_usage" | "survey_sensor_plan" | "survey_photos", label: string, surveyIds: string[]) {
  const rows: any[] = [];
  for (const ids of chunks(surveyIds)) {
    const found = await checkedQuery(label, (supabase as any).from(table).select("*", { count: "exact" }).in("survey_id", ids).limit(QUERY_LIMIT));
    rows.push(...found);
    if (rows.length > QUERY_LIMIT) throw new Error(`${label} 자료가 ${QUERY_LIMIT}건을 초과하여 보고서 생성을 중단했습니다.`);
  }
  return rows;
}

async function collectSurveyDocuments(surveyIds: string[]) {
  const links: any[] = [];
  for (const ids of chunks(surveyIds)) {
    const found = await checkedQuery("현황조사 공식문서 첨부", supabase.from("attachments")
      .select("module, ref_id, file_path", { count: "exact" })
      .eq("module", "SURVEY").eq("ref_type", "official_document_link").in("ref_id", ids).limit(QUERY_LIMIT));
    links.push(...found);
    if (links.length > QUERY_LIMIT) throw new Error(`현황조사 공식문서 첨부가 ${QUERY_LIMIT}건을 초과하여 보고서 생성을 중단했습니다.`);
  }
  const documentIds = unique(links.map(link => String(link.file_path || "").replace("parkmaster-document://", "")));
  const documents: any[] = [];
  for (const ids of chunks(documentIds)) {
    const found = await checkedQuery("공식문서대장", supabase.from("official_documents").select("id, document_number", { count: "exact" }).in("id", ids).limit(QUERY_LIMIT));
    documents.push(...found);
    if (documents.length > QUERY_LIMIT) throw new Error(`공식문서가 ${QUERY_LIMIT}건을 초과하여 보고서 생성을 중단했습니다.`);
  }
  const numberById = new Map(documents.map(document => [document.id, document.document_number]));
  const documentNumbers = links.reduce<Record<string, string[]>>((result, link) => {
    const id = String(link.file_path || "").replace("parkmaster-document://", "");
    const number = numberById.get(id);
    if (!number) return result;
    const key = documentKey(link.ref_id);
    result[key] = unique([...(result[key] || []), number]);
    return result;
  }, {});
  return { documentNumbers, links, documents };
}

function matchesLotType(survey: any, dataset: SurveyReportDataset, selected: string[]) {
  if (!selected.length || selected.length === SURVEY_REPORT_LOT_TYPE_OPTIONS.length) return true;
  const actual = lotType(survey, dataset);
  return selected.some(group => (LOT_TYPE_ALIASES[group] || [group]).includes(actual));
}

function surveyInPeriod(survey: any, options: SurveyReportOptions) {
  const date = dateOnly(survey.survey_date || survey.created_at);
  return date !== "-" && date >= options.periodStart && date <= options.periodEnd;
}

export async function collectSurveyReportData(options: SurveyReportOptions): Promise<SurveyReportDataset> {
  const [parkingLots, surveyRows] = await Promise.all([
    checkedQuery("주차장", supabase.from("parking_lots").select("id, code, name, lot_type, total_spaces, status", { count: "exact" }).limit(QUERY_LIMIT)),
    checkedQuery("현황조사", supabase.from("surveys").select("*", { count: "exact" }).limit(QUERY_LIMIT)),
  ]);
  const provisional: SurveyReportDataset = { parkingLots, surveys: surveyRows, basicInfo: [], infra: [], operation: [], usage: [], sensorPlans: [], photos: [], documentNumbers: {} };
  const surveys = surveyRows.filter(row => surveyInPeriod(row, options)
    && (options.includeInvalidated || !row.invalidated_at)
    && (!options.statuses.length || options.statuses.includes(row.status)));
  const surveyIds = surveys.map(row => row.id);
  const [basicInfo, infra, operation, usage, sensorPlans, photos] = surveyIds.length ? await Promise.all([
    collectSurveyChildren("survey_basic_info", "조사 기본시설", surveyIds),
    collectSurveyChildren("survey_infra", "조사 인프라", surveyIds),
    collectSurveyChildren("survey_operation", "조사 운영현황", surveyIds),
    collectSurveyChildren("survey_usage", "조사 이용현황", surveyIds),
    collectSurveyChildren("survey_sensor_plan", "조사 센서계획", surveyIds),
    collectSurveyChildren("survey_photos", "조사 사진", surveyIds),
  ]) : [[], [], [], [], [], []];
  const withChildren: SurveyReportDataset = { parkingLots, surveys, basicInfo, infra, operation, usage, sensorPlans, photos, documentNumbers: {} };
  const lotFilteredSurveys = surveys.filter(row => matchesLotType(row, withChildren, options.lotTypes));
  const filteredIds = new Set(lotFilteredSurveys.map(row => row.id));
  const documents = await collectSurveyDocuments([...filteredIds]);
  const filteredLots = parkingLots.filter(lot => lotFilteredSurveys.some(survey => survey.lot_id === lot.id));
  const dataset: SurveyReportDataset = {
    parkingLots: filteredLots,
    surveys: lotFilteredSurveys,
    basicInfo: basicInfo.filter(row => filteredIds.has(row.survey_id)),
    infra: infra.filter(row => filteredIds.has(row.survey_id)),
    operation: operation.filter(row => filteredIds.has(row.survey_id)),
    usage: usage.filter(row => filteredIds.has(row.survey_id)),
    sensorPlans: sensorPlans.filter(row => filteredIds.has(row.survey_id)),
    photos: photos.filter(row => filteredIds.has(row.survey_id)),
    documentNumbers: documents.documentNumbers,
  };
  dataset.evidenceMetadata = {
    complete: true,
    collectedAt: new Date().toISOString(),
    queryLimit: QUERY_LIMIT,
    truncationPolicy: "fail",
    sourceTables: [...SOURCE_TABLES],
    filters: { periodStart: options.periodStart, periodEnd: options.periodEnd, asOfDate: options.asOfDate, lotTypes: [...options.lotTypes], statuses: [...options.statuses], includeInvalidated: options.includeInvalidated },
    sources: {
      parking_lots: { expected: parkingLots.length, loaded: parkingLots.length, complete: true },
      surveys: { expected: surveyRows.length, loaded: surveyRows.length, complete: true },
      survey_basic_info: { expected: basicInfo.length, loaded: basicInfo.length, complete: true },
      survey_infra: { expected: infra.length, loaded: infra.length, complete: true },
      survey_operation: { expected: operation.length, loaded: operation.length, complete: true },
      survey_usage: { expected: usage.length, loaded: usage.length, complete: true },
      survey_sensor_plan: { expected: sensorPlans.length, loaded: sensorPlans.length, complete: true },
      survey_photos: { expected: photos.length, loaded: photos.length, complete: true },
      attachments: { expected: documents.links.length, loaded: documents.links.length, complete: true },
      official_documents: { expected: documents.documents.length, loaded: documents.documents.length, complete: true },
    },
  };
  return dataset;
}

function filteredDataset(dataset: SurveyReportDataset, options: SurveyReportOptions): SurveyReportDataset {
  const surveys = dataset.surveys.filter(row => surveyInPeriod(row, options)
    && (options.includeInvalidated || !row.invalidated_at)
    && (!options.statuses.length || options.statuses.includes(row.status))
    && matchesLotType(row, dataset, options.lotTypes));
  const ids = new Set(surveys.map(row => row.id));
  return {
    ...dataset,
    parkingLots: dataset.parkingLots.filter(lot => surveys.some(survey => survey.lot_id === lot.id)),
    surveys,
    basicInfo: dataset.basicInfo.filter(row => ids.has(row.survey_id)),
    infra: dataset.infra.filter(row => ids.has(row.survey_id)),
    operation: dataset.operation.filter(row => ids.has(row.survey_id)),
    usage: dataset.usage.filter(row => ids.has(row.survey_id)),
    sensorPlans: dataset.sensorPlans.filter(row => ids.has(row.survey_id)),
    photos: dataset.photos.filter(row => ids.has(row.survey_id)),
    documentNumbers: Object.fromEntries(Object.entries(dataset.documentNumbers).filter(([key]) => ids.has(key.replace("SURVEY:", "")))),
  };
}

function completeSampleEvidence(dataset: SurveyReportDataset, options: SurveyReportOptions): SurveyReportEvidenceMetadata {
  const sources: Record<string, SurveyEvidenceSource> = {
    parking_lots: { expected: dataset.parkingLots.length, loaded: dataset.parkingLots.length, complete: true },
    surveys: { expected: dataset.surveys.length, loaded: dataset.surveys.length, complete: true },
    survey_basic_info: { expected: dataset.basicInfo.length, loaded: dataset.basicInfo.length, complete: true },
    survey_infra: { expected: dataset.infra.length, loaded: dataset.infra.length, complete: true },
    survey_operation: { expected: dataset.operation.length, loaded: dataset.operation.length, complete: true },
    survey_usage: { expected: dataset.usage.length, loaded: dataset.usage.length, complete: true },
    survey_sensor_plan: { expected: dataset.sensorPlans.length, loaded: dataset.sensorPlans.length, complete: true },
    survey_photos: { expected: dataset.photos.length, loaded: dataset.photos.length, complete: true },
    attachments: { expected: Object.values(dataset.documentNumbers).flat().length, loaded: Object.values(dataset.documentNumbers).flat().length, complete: true },
    official_documents: { expected: unique(Object.values(dataset.documentNumbers).flat()).length, loaded: unique(Object.values(dataset.documentNumbers).flat()).length, complete: true },
  };
  return {
    complete: true, collectedAt: "2026-08-04T00:00:00.000Z", queryLimit: QUERY_LIMIT, truncationPolicy: "fail", sourceTables: [...SOURCE_TABLES],
    filters: { periodStart: options.periodStart, periodEnd: options.periodEnd, asOfDate: options.asOfDate, lotTypes: [...options.lotTypes], statuses: [...options.statuses], includeInvalidated: options.includeInvalidated }, sources,
  };
}

function assertEvidenceComplete(metadata: SurveyReportEvidenceMetadata) {
  const incomplete = Object.entries(metadata.sources).filter(([, source]) => !source.complete || source.loaded !== source.expected);
  if (!metadata.complete || incomplete.length) throw new Error(`현황조사 원천자료가 완전하지 않아 보고서 생성을 중단했습니다: ${incomplete.map(([name]) => name).join(", ") || "수집상태 확인 필요"}`);
}

function lotTypeRows(dataset: SurveyReportDataset) {
  return SURVEY_REPORT_LOT_TYPE_OPTIONS.map(option => {
    const surveys = dataset.surveys.filter(row => (LOT_TYPE_ALIASES[option.value] || [option.value]).includes(lotType(row, dataset)));
    const ids = new Set(surveys.map(row => row.id));
    return {
      lot_type: option.value,
      lot_type_label: option.label,
      parking_lots: new Set(surveys.map(row => row.lot_id)).size,
      surveys: surveys.length,
      total_spaces: dataset.basicInfo.filter(row => ids.has(row.survey_id)).reduce((sum, row) => sum + Number(row.total_spaces || 0), 0),
      in_progress: surveys.filter(row => ["draft", "in_progress", "submitted", "review"].includes(row.status)).length,
      approved: surveys.filter(row => row.status === "approved").length,
      complete_records: surveys.filter(row => surveyComplete(row, dataset)).length,
      photos: dataset.photos.filter(row => ids.has(row.survey_id)).length,
      planned_sensors: dataset.sensorPlans.filter(row => ids.has(row.survey_id)).reduce((sum, row) => sum + Number(row.planned_sensors || 0), 0),
      documents: unique(surveys.flatMap(row => documentsFor(row.id, dataset))).length,
    };
  }).filter(row => row.surveys > 0);
}

function documentRows(dataset: SurveyReportDataset) {
  return dataset.surveys;
}

function riskRows(dataset: SurveyReportDataset) {
  return dataset.surveys.flatMap(survey => surveyValidationIssues(survey, dataset).map(finding => ({
    risk_level: ["특수면수 합계 오류", "주차빌딩 필수시설 누락", "노상 필수현황 누락", "노외 필수현황 누락"].includes(finding) ? "높음" : "주의",
    lot: lotName(survey, dataset),
    lot_type: lotTypeLabel(survey, dataset),
    survey_date: dateOnly(survey.survey_date),
    status: statusLabel(survey.status),
    finding,
    next_action: finding.includes("공식문서") ? "문서대장 연결" : finding.includes("사진") ? "현장사진 보완" : "조사내용 확인·보완",
    document_number: documentsFor(survey.id, dataset).join(", ") || "-",
  })));
}

function sortRows(rows: any[], sort: SurveyReportSort, dataset: SurveyReportDataset) {
  const rowSurvey = (row: any) => row.lot_id ? row : surveyFor(row, dataset);
  const rowDate = (row: any) => row.survey_date || row.taken_at || row.created_at || rowSurvey(row)?.survey_date || "";
  const riskRank: Record<string, number> = { 높음: 0, 주의: 1 };
  return [...rows].sort((a, b) => {
    if (sort === "date_desc") return String(rowDate(b)).localeCompare(String(rowDate(a)));
    if (sort === "parking_lot") return lotName(a, dataset).localeCompare(lotName(b, dataset), "ko", { numeric: true }) || String(rowDate(b)).localeCompare(String(rowDate(a)));
    if (sort === "status") return (STATUS_ORDER[rowSurvey(a)?.status] ?? 50) - (STATUS_ORDER[rowSurvey(b)?.status] ?? 50);
    if (sort === "lot_type") return lotTypeLabel(a, dataset).localeCompare(lotTypeLabel(b, dataset), "ko") || lotName(a, dataset).localeCompare(lotName(b, dataset), "ko");
    return (riskRank[a.risk_level] ?? (surveyComplete(rowSurvey(a), dataset) ? 10 : 2)) - (riskRank[b.risk_level] ?? (surveyComplete(rowSurvey(b), dataset) ? 10 : 2)) || String(rowDate(b)).localeCompare(String(rowDate(a)));
  });
}

const SECTION_ROWS: Record<Exclude<SurveyReportSectionId, "overview">, (dataset: SurveyReportDataset) => any[]> = {
  workflow: dataset => dataset.surveys,
  lot_types: lotTypeRows,
  basic: dataset => dataset.basicInfo,
  infra: dataset => dataset.infra,
  operation: dataset => dataset.operation,
  usage: dataset => dataset.usage,
  sensor_plan: dataset => dataset.sensorPlans,
  photos: dataset => dataset.photos,
  documents: documentRows,
  risks: riskRows,
};

const IDENTITY_FIELDS: Record<Exclude<SurveyReportSectionId, "overview">, string[]> = {
  workflow: ["lot_code", "lot"], lot_types: ["lot_type"], basic: ["lot", "lot_type"], infra: ["lot", "lot_type"],
  operation: ["lot", "lot_type"], usage: ["lot", "lot_type"], sensor_plan: ["lot", "lot_type"], photos: ["lot", "category"],
  documents: ["lot", "survey_date"], risks: ["risk_level", "lot"],
};

function splitFields(id: Exclude<SurveyReportSectionId, "overview">, fields: SurveyReportField[], orientation: SurveyReportOrientation) {
  const maximum = orientation === "portrait" ? 10 : 14;
  if (fields.length <= maximum) return [fields];
  const identity = fields.filter(item => IDENTITY_FIELDS[id].includes(item.key));
  const details = fields.filter(item => !IDENTITY_FIELDS[id].includes(item.key));
  const limit = Math.max(1, maximum - identity.length);
  const groups: SurveyReportField[][] = [];
  for (let index = 0; index < details.length; index += limit) groups.push([...identity, ...details.slice(index, index + limit)]);
  return groups;
}

export function buildSurveyReportModel(input: SurveyReportDataset, options: SurveyReportOptions): SurveyReportModel {
  const dataset = filteredDataset(input, options);
  const evidenceMetadata = input.evidenceMetadata || completeSampleEvidence(input, options);
  assertEvidenceComplete(evidenceMetadata);
  const risks = riskRows(dataset);
  const completeRecords = dataset.surveys.filter(survey => surveyComplete(survey, dataset)).length;
  const summary: SurveyReportSummary = {
    parkingLots: new Set(dataset.surveys.map(row => row.lot_id)).size,
    surveys: dataset.surveys.length,
    draft: dataset.surveys.filter(row => row.status === "draft").length,
    inProgress: dataset.surveys.filter(row => row.status === "in_progress").length,
    submitted: dataset.surveys.filter(row => row.status === "submitted").length,
    review: dataset.surveys.filter(row => row.status === "review").length,
    approved: dataset.surveys.filter(row => row.status === "approved").length,
    rejected: dataset.surveys.filter(row => row.status === "rejected").length,
    invalidated: dataset.surveys.filter(row => Boolean(row.invalidated_at)).length,
    offstreetSurveys: dataset.surveys.filter(row => LOT_TYPE_ALIASES.offstreet.includes(lotType(row, dataset))).length,
    buildingSurveys: dataset.surveys.filter(row => LOT_TYPE_ALIASES.building.includes(lotType(row, dataset))).length,
    onstreetSurveys: dataset.surveys.filter(row => LOT_TYPE_ALIASES.onstreet.includes(lotType(row, dataset))).length,
    totalSpaces: dataset.basicInfo.reduce((sum, row) => sum + Number(row.total_spaces || 0), 0),
    completeRecords,
    completionRate: dataset.surveys.length ? completeRecords / dataset.surveys.length * 100 : 0,
    installedSensors: dataset.infra.reduce((sum, row) => sum + Number(row.sensor_count || 0), 0),
    plannedSensors: dataset.sensorPlans.reduce((sum, row) => sum + Number(row.planned_sensors || 0), 0),
    plannedGateways: dataset.sensorPlans.reduce((sum, row) => sum + Number(row.planned_gateways || 0), 0),
    photos: dataset.photos.length,
    surveysWithPanorama: dataset.surveys.filter(row => photosFor(row.id, dataset).some(photo => photo.category === "panorama")).length,
    missingTypePhotos: dataset.surveys.filter(row => !hasTypePhoto(row, dataset)).length,
    linkedDocuments: unique(Object.values(dataset.documentNumbers).flat()).length,
    surveysMissingDocuments: dataset.surveys.filter(row => !documentsFor(row.id, dataset).length).length,
    riskCount: risks.length,
  };
  const tables = options.selectedSections.filter((id): id is Exclude<SurveyReportSectionId, "overview"> => id !== "overview").flatMap(id => {
    const section = SURVEY_REPORT_SECTIONS.find(item => item.id === id)!;
    const requested = options.selectedFields[id] || section.defaultFields;
    const fields = section.fields.filter(item => requested.includes(item.key));
    const groups = splitFields(id, fields, options.orientation);
    const sourceRows = sortRows(SECTION_ROWS[id](dataset), options.sort, dataset);
    return groups.map((group, groupIndex) => ({
      id,
      title: section.label,
      subtitle: groups.length > 1 ? `${section.label} 세부정보 ${groupIndex + 1}` : undefined,
      subtitleNumber: groups.length > 1 ? groupIndex + 1 : undefined,
      continuation: groupIndex > 0,
      columns: group.map(item => ({ key: item.key, label: item.label })),
      rows: sourceRows.map(row => Object.fromEntries(group.map(item => [item.key, text(item.value(row, dataset, options))]))),
    } as OperationsReportTable));
  });
  const selectedFields = options.selectedSections.flatMap(id => {
    const section = SURVEY_REPORT_SECTIONS.find(item => item.id === id)!;
    return section.fields.filter(item => (options.selectedFields[id] || section.defaultFields).includes(item.key));
  });
  const riskNarrative = [
    summary.surveys - summary.completeRecords ? `자료 보완 조사 ${summary.surveys - summary.completeRecords}건` : "자료 보완 조사 없음",
    summary.missingTypePhotos ? `형태별 필수사진 누락 ${summary.missingTypePhotos}건` : "형태별 필수사진 누락 없음",
    summary.surveysMissingDocuments ? `공식 문서번호 미연계 ${summary.surveysMissingDocuments}건` : "공식 문서번호 미연계 없음",
    summary.rejected ? `반려 조사 ${summary.rejected}건` : "반려 조사 없음",
  ].join("; ");
  return {
    period: { start: options.periodStart, end: options.periodEnd },
    asOfDate: options.asOfDate,
    lotTypeLabels: SURVEY_REPORT_LOT_TYPE_OPTIONS.filter(item => options.lotTypes.includes(item.value)).map(item => item.label),
    summary,
    sourceCounts: {
      lots: summary.parkingLots, surveys: summary.surveys, basicInfo: dataset.basicInfo.length, infra: dataset.infra.length,
      operation: dataset.operation.length, usage: dataset.usage.length, sensorPlans: dataset.sensorPlans.length,
      photos: dataset.photos.length, documents: summary.linkedDocuments, risks: risks.length,
    },
    tables,
    selectedFieldCount: selectedFields.length,
    protectedFieldCount: selectedFields.filter(item => item.protected).length,
    riskNarrative,
    evidenceMetadata,
  };
}

export function surveyReportBriefRows(model: SurveyReportModel, documentSummary?: string): string[][] {
  return [
    ["담당부서", PRIMARY_DEPARTMENT],
    ["보고기간", `${model.period.start} ~ ${model.period.end}`],
    ["보고대상", `${model.lotTypeLabels.join("·") || "전체 주차장"} 현황조사 ${model.summary.surveys.toLocaleString("ko-KR")}건`],
    ["주요내용", "조사 진행·검토·승인, 기본시설·운영·인프라·이용·센서계획·사진·공식문서"],
    ["작성목적", documentSummary || "공영주차장의 유형별 현장 상태와 운영·이용·스마트주차 기반을 확인하고 조사 검토·승인 및 후속 보완의 근거를 명확히 하기 위함."],
    ["산출기준", `조사일과 주차장 형태 조건에 해당하는 조사 원천자료를 절단 없이 조회하고 유형별 필수시설·사진·공식문서 연결을 재검증함. ${model.riskNarrative}`],
  ];
}

export function surveyReportSummaryRows(model: SurveyReportModel): string[][] {
  return [
    ["대상 주차장", `${model.summary.parkingLots.toLocaleString("ko-KR")}개소`, "현황조사", `${model.summary.surveys.toLocaleString("ko-KR")}건`],
    ["승인", `${model.summary.approved.toLocaleString("ko-KR")}건`, "검토중", `${model.summary.review.toLocaleString("ko-KR")}건`],
    ["조사중", `${model.summary.inProgress.toLocaleString("ko-KR")}건`, "반려", `${model.summary.rejected.toLocaleString("ko-KR")}건`],
    ["자료 검증완료", `${model.summary.completeRecords.toLocaleString("ko-KR")}건`, "완성도", `${model.summary.completionRate.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`],
    ["노외·빌딩·노상", `${model.summary.offstreetSurveys}/${model.summary.buildingSurveys}/${model.summary.onstreetSurveys}건`, "총 주차면", `${model.summary.totalSpaces.toLocaleString("ko-KR")}면`],
    ["기존·계획 센서", `${model.summary.installedSensors.toLocaleString("ko-KR")}/${model.summary.plannedSensors.toLocaleString("ko-KR")}대`, "게이트웨이 계획", `${model.summary.plannedGateways.toLocaleString("ko-KR")}대`],
    ["사진 증빙", `${model.summary.photos.toLocaleString("ko-KR")}장`, "형태별 사진 누락", `${model.summary.missingTypePhotos.toLocaleString("ko-KR")}건`],
    ["공식 문서번호", `${model.summary.linkedDocuments.toLocaleString("ko-KR")}건`, "문서 미연계", `${model.summary.surveysMissingDocuments.toLocaleString("ko-KR")}건`],
    ["검증·보완사항", `${model.summary.riskCount.toLocaleString("ko-KR")}건`, "기준일", model.asOfDate],
  ];
}

export function toOperationsCompatibleSurveyModel(model: SurveyReportModel): OperationsReportModel {
  return {
    period: model.period,
    lotTypeLabels: model.lotTypeLabels,
    summary: { parkingLots: model.summary.parkingLots, totalSpaces: model.summary.totalSpaces, activeContracts: 0, activeStaff: 0, activePasses: 0, enforcementCount: 0, totalFine: 0, unpaidFine: 0, openAbandoned: 0, openSecurity: 0 },
    sourceCounts: model.sourceCounts,
    tables: model.tables,
    selectedFieldCount: model.selectedFieldCount,
    sensitiveFieldCount: model.protectedFieldCount,
  };
}

export async function getSurveyReportEvidence(parameters: Record<string, string>) {
  const options = parseSurveyReportOptions(parameters);
  const dataset = await collectSurveyReportData(options);
  const model = buildSurveyReportModel(dataset, options);
  return {
    period: model.period,
    asOfDate: model.asOfDate,
    sourceCounts: model.sourceCounts,
    summary: model.summary,
    selectedFieldCount: model.selectedFieldCount,
    protectedFieldCount: model.protectedFieldCount,
    riskNarrative: model.riskNarrative,
    evidenceMetadata: model.evidenceMetadata,
  };
}

export const SURVEY_REPORT_SAMPLE_DATASET: SurveyReportDataset = {
  parkingLots: [
    { id: "lot-offstreet", code: "JJP-001", name: "동문 공영주차장", lot_type: "offstreet", total_spaces: 120, status: "active" },
    { id: "lot-building", code: "JJP-002", name: "칠성골 주차빌딩", lot_type: "multilevel", total_spaces: 210, status: "active" },
    { id: "lot-onstreet", code: "JJP-003", name: "중앙로 노상주차장", lot_type: "onstreet", total_spaces: 68, status: "active" },
  ],
  surveys: [
    { id: "survey-1", lot_id: "lot-offstreet", survey_type: "regular", status: "approved", survey_date: "2026-07-10", submitted_at: "2026-07-11T09:00:00", reviewed_at: "2026-07-12T10:00:00", approved_at: "2026-07-12T15:00:00", author_name: "운영팀 조사담당", parking_lots: { id: "lot-offstreet", code: "JJP-001", name: "동문 공영주차장", lot_type: "offstreet" } },
    { id: "survey-2", lot_id: "lot-building", survey_type: "special", status: "review", survey_date: "2026-07-20", submitted_at: "2026-07-21T09:30:00", reviewed_at: "2026-07-22T11:00:00", author_name: "시설팀 조사담당", parking_lots: { id: "lot-building", code: "JJP-002", name: "칠성골 주차빌딩", lot_type: "multilevel" } },
    { id: "survey-3", lot_id: "lot-onstreet", survey_type: "initial", status: "in_progress", survey_date: "2026-08-01", author_name: "운영팀 조사담당", parking_lots: { id: "lot-onstreet", code: "JJP-003", name: "중앙로 노상주차장", lot_type: "onstreet" } },
    { id: "survey-4", lot_id: "lot-offstreet", survey_type: "special", status: "rejected", survey_date: "2026-08-05", submitted_at: "2026-08-06T09:00:00", reviewed_at: "2026-08-07T10:00:00", reject_reason: "배수시설 사진과 공식문서 연결 보완", author_name: "운영팀 조사담당", parking_lots: { id: "lot-offstreet", code: "JJP-001", name: "동문 공영주차장", lot_type: "offstreet" } },
  ],
  basicInfo: [
    { id: "basic-1", survey_id: "survey-1", lot_name: "동문 공영주차장", address: "제주시 동문로 1", lot_type: "offstreet", operator_type: "direct", total_spaces: 120, disabled_spaces: 4, ev_spaces: 6, compact_spaces: 10, pregnant_spaces: 2, other_spaces: 0, entry_count: 1, exit_count: 1, entry_exit_same: false, surface_type: "asphalt", gps_lat: 33.51, gps_lng: 126.52, site_area_sqm: 3800, drainage_condition: "양호", pedestrian_route_condition: "양호" },
    { id: "basic-2", survey_id: "survey-2", lot_name: "칠성골 주차빌딩", address: "제주시 중앙로 2", lot_type: "multilevel", operator_type: "outsourced", total_spaces: 210, disabled_spaces: 7, ev_spaces: 8, compact_spaces: 12, pregnant_spaces: 3, other_spaces: 0, entry_count: 2, exit_count: 2, entry_exit_same: false, surface_type: "concrete", gps_lat: 33.52, gps_lng: 126.53, lot_type_floor: 5, fire_safety_condition: "양호", ventilation_condition: "점검필요", elevator_condition: "양호", ramp_condition: "양호", height_limit_m: 2.1 },
    { id: "basic-3", survey_id: "survey-3", lot_name: "중앙로 노상주차장", address: "제주시 중앙로 구간", lot_type: "onstreet", operator_type: "direct", total_spaces: 68, disabled_spaces: 2, ev_spaces: 0, compact_spaces: 0, pregnant_spaces: 0, other_spaces: 0, entry_count: 0, exit_count: 0, surface_type: "asphalt", gps_lat: 33.53, gps_lng: 126.54, road_segment: "중앙사거리~시민회관", road_side: "양측", traffic_direction: "양방향", space_start_no: 1, space_end_no: 68, sign_condition: null },
    { id: "basic-4", survey_id: "survey-4", lot_name: "동문 공영주차장", address: "제주시 동문로 1", lot_type: "offstreet", operator_type: "direct", total_spaces: 80, disabled_spaces: 3, ev_spaces: 4, compact_spaces: 5, pregnant_spaces: 1, other_spaces: 0, entry_count: 1, exit_count: 1, surface_type: "asphalt", gps_lat: 33.51, gps_lng: 126.52, site_area_sqm: 2500, drainage_condition: "보완필요", pedestrian_route_condition: "양호" },
  ],
  infra: [
    { id: "infra-1", survey_id: "survey-1", power_status: "양호", network_wired: true, display_installed: true, display_in_use: true, display_company: "제주전광", sensor_installed: true, sensor_count: 100, sensor_in_use: true, sensor_company: "제주센서", has_barrier: true, has_lpr: true, has_kiosk: true, has_cctv: true, equipment_company: "제주관제" },
    { id: "infra-2", survey_id: "survey-2", power_status: "점검필요", power_note: "지하 1층 분전반 점검", network_wired: true, network_lte: true, display_installed: true, display_in_use: true, display_company: "한라정보", sensor_installed: true, sensor_count: 180, sensor_in_use: true, sensor_company: "한라센서", has_barrier: true, has_lpr: true, has_kiosk: true, has_cctv: true, equipment_company: "한라정보" },
    { id: "infra-3", survey_id: "survey-3", power_status: "부분공급", network_lte: true, display_installed: false, sensor_installed: false, sensor_count: 0, sensor_in_use: false, has_cctv: true },
    { id: "infra-4", survey_id: "survey-4", power_status: "양호", network_wifi: true, display_installed: false, sensor_installed: false, sensor_count: 0, sensor_in_use: false, has_cctv: true },
  ],
  operation: [
    { id: "operation-1", survey_id: "survey-1", operating_hours: "24시간", payment_card: true, payment_mobile: true, staff_type: "상주", staff_count: 2, management_type: "직영", control_linked: true, portal_linked: true },
    { id: "operation-2", survey_id: "survey-2", operating_hours: "06:00~24:00", payment_card: true, payment_mobile: true, staff_type: "상주", staff_count: 3, management_type: "위탁", management_etc: "야간 무인", control_linked: true, portal_linked: true },
    { id: "operation-3", survey_id: "survey-3", operating_hours: "09:00~18:00", payment_none: true, staff_type: "순회", staff_count: 1, management_type: "직영", control_linked: false, portal_linked: false },
    { id: "operation-4", survey_id: "survey-4", operating_hours: "24시간", payment_card: true, staff_type: "무인", staff_count: 0, management_type: "직영", control_linked: true, portal_linked: false },
  ],
  usage: [
    { id: "usage-1", survey_id: "survey-1", avg_usage_rate: "78%", peak_afternoon: true, user_commercial: true, user_tourists: true },
    { id: "usage-2", survey_id: "survey-2", avg_usage_rate: "85%", peak_afternoon: true, peak_night: true, user_commercial: true, user_tourists: true },
    { id: "usage-3", survey_id: "survey-3", avg_usage_rate: "62%", peak_morning: true, user_residents: true, user_commercial: true },
    { id: "usage-4", survey_id: "survey-4", avg_usage_rate: "70%", peak_afternoon: true, user_commercial: true },
  ],
  sensorPlans: [
    { id: "sensor-1", survey_id: "survey-1", planned_sensors: 20, planned_gateways: 1, gateway_location: "관리동", display_sw_feasibility: "가능", portal_feasibility: "가능" },
    { id: "sensor-2", survey_id: "survey-2", planned_sensors: 30, planned_gateways: 2, gateway_location: "3층 통신실", display_sw_feasibility: "보완필요", display_sw_note: "API 연계 개발", portal_feasibility: "가능" },
    { id: "sensor-3", survey_id: "survey-3", planned_sensors: 68, planned_gateways: 3, gateway_location: "구간별 가로등", display_sw_feasibility: "검토", portal_feasibility: "가능", portal_note: "노상 구간 좌표 연계" },
    { id: "sensor-4", survey_id: "survey-4", planned_sensors: 10, planned_gateways: 1, gateway_location: "관리부스", display_sw_feasibility: "가능", portal_feasibility: "검토" },
  ],
  photos: [
    { id: "photo-1", survey_id: "survey-1", category: "panorama", file_path: "survey/survey-1/panorama.jpg", thumbnail_path: "survey/survey-1/thumb.jpg", caption: "노외주차장 전경", taken_at: "2026-07-10T10:00:00" },
    { id: "photo-2", survey_id: "survey-1", category: "drainage", file_path: "survey/survey-1/drainage.jpg", caption: "배수시설", taken_at: "2026-07-10T10:10:00" },
    { id: "photo-3", survey_id: "survey-2", category: "panorama", file_path: "survey/survey-2/panorama.jpg", caption: "주차빌딩 전경", taken_at: "2026-07-20T09:00:00" },
    { id: "photo-4", survey_id: "survey-2", category: "ramp", file_path: "survey/survey-2/ramp.jpg", caption: "램프와 높이제한", taken_at: "2026-07-20T09:10:00" },
    { id: "photo-5", survey_id: "survey-2", category: "fire_safety", file_path: "survey/survey-2/fire.jpg", caption: "소방시설", taken_at: "2026-07-20T09:20:00" },
    { id: "photo-6", survey_id: "survey-3", category: "panorama", file_path: "survey/survey-3/panorama.jpg", caption: "노상 구간 전경", taken_at: "2026-08-01T11:00:00" },
    { id: "photo-7", survey_id: "survey-4", category: "panorama", file_path: "survey/survey-4/panorama.jpg", caption: "보완조사 전경", taken_at: "2026-08-05T14:00:00" },
  ],
  documentNumbers: {
    "SURVEY:survey-1": ["제주시청-차량관리과운영팀-2026-0701"],
    "SURVEY:survey-2": ["제주시청-차량관리과운영팀-2026-0702"],
  },
};
