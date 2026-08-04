import ConfigurableReportBuilder, { type ConfigurableReportBuilderConfig } from "@/pages/report/ConfigurableReportBuilder";
import {
  defaultServiceReportFields,
  getServiceReportEvidence,
  SERVICE_REPORT_LOT_TYPE_OPTIONS,
  SERVICE_REPORT_PRESETS,
  SERVICE_REPORT_SECTIONS,
} from "@/lib/service-report";
import { SERVICE_REPORT_TEMPLATE_CODE } from "@/lib/report-catalog";

const now = new Date();

const config: ConfigurableReportBuilderConfig = {
  templateCode: SERVICE_REPORT_TEMPLATE_CODE,
  scope: "service",
  parameterPrefix: "service",
  moduleLabel: "용역사업관리",
  pageTitle: "용역사업관리 통합보고서",
  defaultTitle: `${now.getFullYear()}년 ${now.getMonth() + 1}월 공영주차장 용역사업 종합 현황 보고서`,
  defaultSummary: "공영주차장 용역의 계약, 착수·진도, 검수, 대금, 성과물과 하자·위험을 확인하여 이행 지연과 문서 누락을 예방하기 위함.",
  keywords: "제주시, 공영주차장, 용역사업, 계약, 검수, 성과물",
  sections: SERVICE_REPORT_SECTIONS,
  presets: SERVICE_REPORT_PRESETS,
  defaultFields: () => defaultServiceReportFields() as Record<string, string[]>,
  lotTypes: [...SERVICE_REPORT_LOT_TYPE_OPTIONS],
  sortOptions: [
    { value: "attention", label: "확인 필요순" },
    { value: "date_desc", label: "최신일순" },
    { value: "project", label: "사업명순" },
    { value: "amount_desc", label: "계약금액 큰순" },
    { value: "progress_desc", label: "진도율 높은순" },
  ],
  defaultSort: "attention",
  getEvidence: getServiceReportEvidence,
  extraParameters: { service_include_closed: "true" },
};

export default function ServiceReportBuilder() {
  return <ConfigurableReportBuilder config={config} />;
}
