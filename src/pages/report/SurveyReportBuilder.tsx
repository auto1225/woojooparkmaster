import ConfigurableReportBuilder, { type ConfigurableReportBuilderConfig } from "@/pages/report/ConfigurableReportBuilder";
import {
  defaultSurveyReportFields,
  getSurveyReportEvidence,
  SURVEY_REPORT_LOT_TYPE_OPTIONS,
  SURVEY_REPORT_PRESETS,
  SURVEY_REPORT_SECTIONS,
} from "@/lib/survey-report";
import { SURVEY_REPORT_TEMPLATE_CODE } from "@/lib/report-catalog";

const now = new Date();

const config: ConfigurableReportBuilderConfig = {
  templateCode: SURVEY_REPORT_TEMPLATE_CODE,
  scope: "survey",
  parameterPrefix: "survey",
  moduleLabel: "현황조사",
  pageTitle: "공영주차장 현황조사 결과 보고서",
  defaultTitle: `${now.getFullYear()}년 ${now.getMonth() + 1}월 공영주차장 현황조사 결과 보고서`,
  defaultSummary: "공영주차장의 기본현황·기반시설·운영·이용실태와 센서 구축계획을 조사하고 검토·승인 결과 및 사진증빙을 종합함.",
  keywords: "제주시, 공영주차장, 현황조사, 기반시설, 이용실태, 센서계획, 사진증빙",
  sections: SURVEY_REPORT_SECTIONS,
  presets: SURVEY_REPORT_PRESETS,
  defaultFields: () => defaultSurveyReportFields() as Record<string, string[]>,
  lotTypes: [...SURVEY_REPORT_LOT_TYPE_OPTIONS],
  sortOptions: [
    { value: "attention", label: "검토 필요순" },
    { value: "date_desc", label: "최근 조사순" },
    { value: "parking_lot", label: "주차장명순" },
    { value: "status", label: "진행 상태순" },
    { value: "lot_type", label: "주차장 형태순" },
  ],
  defaultSort: "attention",
  getEvidence: getSurveyReportEvidence,
  extraParameters: { survey_include_photos: "true" },
};

export default function SurveyReportBuilder() {
  return <ConfigurableReportBuilder config={config} />;
}
