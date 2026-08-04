import ConfigurableReportBuilder, { type ConfigurableReportBuilderConfig } from "@/pages/report/ConfigurableReportBuilder";
import {
  defaultPlanningReportFields,
  getPlanningReportEvidence,
  PLANNING_REPORT_LOT_TYPE_OPTIONS,
  PLANNING_REPORT_PRESETS,
  PLANNING_REPORT_SECTIONS,
} from "@/lib/planning-report";
import { PLANNING_REPORT_TEMPLATE_CODE } from "@/lib/report-catalog";

const now = new Date();

const config: ConfigurableReportBuilderConfig = {
  templateCode: PLANNING_REPORT_TEMPLATE_CODE,
  scope: "planning",
  parameterPrefix: "planning",
  moduleLabel: "신설기획",
  pageTitle: "공영주차장 신설사업 종합 보고서",
  defaultTitle: `${now.getFullYear()}년 공영주차장 신설사업 추진 현황 보고서`,
  defaultSummary: "공영주차장 신설 후보지의 타당성·부지확보·공유재산 사전절차·예산·공정·위험과 근거 문서를 종합하여 의사결정 사항을 보고함.",
  keywords: "제주시, 공영주차장, 신설기획, 후보지, 타당성, 부지매입, 공유재산, 사전절차",
  sections: PLANNING_REPORT_SECTIONS,
  presets: PLANNING_REPORT_PRESETS,
  defaultFields: () => defaultPlanningReportFields() as Record<string, string[]>,
  lotTypes: [...PLANNING_REPORT_LOT_TYPE_OPTIONS],
  sortOptions: [
    { value: "attention", label: "의사결정 필요순" },
    { value: "date_desc", label: "최근 등록순" },
    { value: "candidate", label: "후보지명순" },
    { value: "score_desc", label: "평가점수 높은순" },
    { value: "budget_desc", label: "사업비 높은순" },
    { value: "progress_desc", label: "공정률 높은순" },
    { value: "deadline_asc", label: "기한 임박순" },
    { value: "lot_type", label: "주차장 형태순" },
  ],
  defaultSort: "attention",
  getEvidence: getPlanningReportEvidence,
};

export default function PlanningReportBuilder() {
  return <ConfigurableReportBuilder config={config} />;
}
