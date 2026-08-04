import ConfigurableReportBuilder, { type ConfigurableReportBuilderConfig } from "@/pages/report/ConfigurableReportBuilder";
import {
  COMPLAINT_LOT_TYPE_OPTIONS,
  COMPLAINT_REPORT_PRESETS,
  COMPLAINT_REPORT_SECTIONS,
  defaultComplaintReportFields,
  getComplaintReportEvidence,
} from "@/lib/complaint-report";
import { COMPLAINT_REPORT_TEMPLATE_CODE } from "@/lib/report-catalog";

const now = new Date();

const config: ConfigurableReportBuilderConfig = {
  templateCode: COMPLAINT_REPORT_TEMPLATE_CODE,
  scope: "complaint",
  parameterPrefix: "complaint",
  moduleLabel: "민원관리",
  pageTitle: "민원 처리 종합 보고서",
  defaultTitle: `${now.getFullYear()}년 ${now.getMonth() + 1}월 공영주차장 민원 처리 종합 보고서`,
  defaultSummary: "공영주차장 민원의 접수·배정·처리·회신 전 과정을 점검하고, 처리기한 준수와 반복민원 예방 및 후속 조치가 필요한 사항을 종합함.",
  keywords: "제주시, 공영주차장, 민원관리, 처리기한, 반복민원, 공식답변",
  sections: COMPLAINT_REPORT_SECTIONS,
  presets: COMPLAINT_REPORT_PRESETS,
  defaultFields: () => defaultComplaintReportFields() as Record<string, string[]>,
  lotTypes: [...COMPLAINT_LOT_TYPE_OPTIONS],
  sortOptions: [
    { value: "attention", label: "조치 필요순" },
    { value: "date_desc", label: "최근 접수순" },
    { value: "due_asc", label: "처리기한 임박순" },
    { value: "category", label: "민원 유형순" },
    { value: "lot_type", label: "주차장 형태순" },
  ],
  defaultSort: "attention",
  getEvidence: getComplaintReportEvidence,
  extraParameters: {
    complaint_redact_personal_info: "true",
    complaint_include_timeline: "true",
  },
};

export default function ComplaintReportBuilder() {
  return <ConfigurableReportBuilder config={config} />;
}
