import ConfigurableReportBuilder, { type ConfigurableReportBuilderConfig } from "@/pages/report/ConfigurableReportBuilder";
import {
  defaultProcurementReportFields,
  getProcurementReportEvidence,
  PROCUREMENT_LOT_TYPE_OPTIONS,
  PROCUREMENT_REPORT_PRESETS,
  PROCUREMENT_REPORT_SECTIONS,
} from "@/lib/procurement-report";
import { PROCUREMENT_REPORT_TEMPLATE_CODE } from "@/lib/report-catalog";

const now = new Date();

const config: ConfigurableReportBuilderConfig = {
  templateCode: PROCUREMENT_REPORT_TEMPLATE_CODE,
  scope: "procurement",
  parameterPrefix: "procurement",
  moduleLabel: "입찰관리",
  pageTitle: "입찰관리 통합보고서",
  defaultTitle: `${now.getFullYear()}년 ${now.getMonth() + 1}월 공영주차장 입찰·계약 종합 현황 보고서`,
  defaultSummary: "공영주차장 관련 입찰의 공고, 개찰·평가, 계약, 보증과 기한을 확인하여 절차 지연과 공식 문서 누락을 예방하기 위함.",
  keywords: "제주시, 공영주차장, 입찰, 개찰, 계약, 보증",
  sections: PROCUREMENT_REPORT_SECTIONS,
  presets: PROCUREMENT_REPORT_PRESETS,
  defaultFields: () => defaultProcurementReportFields() as Record<string, string[]>,
  lotTypes: [...PROCUREMENT_LOT_TYPE_OPTIONS],
  sortOptions: [
    { value: "attention", label: "확인 필요순" },
    { value: "date_desc", label: "최신일순" },
    { value: "deadline_asc", label: "기한 임박순" },
    { value: "amount_desc", label: "금액 큰순" },
    { value: "status", label: "진행상태순" },
    { value: "vendor", label: "업체명순" },
  ],
  defaultSort: "attention",
  getEvidence: getProcurementReportEvidence,
};

export default function ProcurementReportBuilder() {
  return <ConfigurableReportBuilder config={config} />;
}
