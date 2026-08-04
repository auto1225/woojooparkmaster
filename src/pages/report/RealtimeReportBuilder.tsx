import ConfigurableReportBuilder, { type ConfigurableReportBuilderConfig } from "@/pages/report/ConfigurableReportBuilder";
import { defaultRealtimeReportFields, getRealtimeReportEvidence, REALTIME_REPORT_LOT_TYPE_OPTIONS, REALTIME_REPORT_PRESETS, REALTIME_REPORT_SECTIONS } from "@/lib/realtime-report";
import { REALTIME_REPORT_TEMPLATE_CODE } from "@/lib/report-catalog";

const config: ConfigurableReportBuilderConfig = {
  templateCode: REALTIME_REPORT_TEMPLATE_CODE, scope: "realtime", parameterPrefix: "realtime", moduleLabel: "실시간정보",
  pageTitle: "공영주차장 실시간 운영상태 보고서", defaultTitle: "공영주차장 실시간 운영·장비상태 보고서",
  defaultSummary: "주차장별 점유상태와 센서·게이트 불일치, 통신장애, 장비건강 및 경보·조치 현황을 종합함.",
  keywords: "제주시, 공영주차장, 실시간정보, 점유율, 센서, 통신장애, 경보",
  sections: REALTIME_REPORT_SECTIONS, presets: REALTIME_REPORT_PRESETS,
  defaultFields: () => defaultRealtimeReportFields() as Record<string, string[]>, lotTypes: [...REALTIME_REPORT_LOT_TYPE_OPTIONS],
  sortOptions: [{ value: "attention", label: "이상상태 우선" }, { value: "occupancy_desc", label: "점유율 높은순" }, { value: "parking_lot", label: "주차장명순" }, { value: "last_updated", label: "최근수신순" }, { value: "status", label: "운영상태순" }, { value: "lot_type", label: "주차장 형태순" }],
  defaultSort: "attention", getEvidence: getRealtimeReportEvidence,
};

export default function RealtimeReportBuilder() { return <ConfigurableReportBuilder config={config} />; }
