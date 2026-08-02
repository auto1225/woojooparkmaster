import type { TeamRecordType, TeamWorkInput, TeamWorkRecord, TeamWorkStatus } from "@/types/team-work";

export interface DomainWorkflowField {
  key: string;
  label: string;
  type?: "text" | "date" | "number" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface DomainWorkflowConfig {
  key: string;
  title: string;
  description: string;
  team: "operations" | "facilities";
  recordType: TeamRecordType;
  category: string;
  itemLabel: string;
  locationLabel: string;
  module: string;
  path: string;
  stages: Array<{ status: TeamWorkStatus; label: string; action?: string }>;
  fields: DomainWorkflowField[];
  samples: TeamWorkInput[];
}

export function getWorkflowTransitionError(record: TeamWorkRecord, nextStatus: TeamWorkStatus) {
  if (nextStatus === "assigned" && (!record.ownerName || !record.dueDate)) return "담당자와 처리기한을 먼저 지정해 주세요.";
  if (nextStatus === "review" && !record.documentNumber) return "검토 단계 전 관련 문서번호를 입력해 주세요.";
  if (nextStatus === "completed" && !record.payload.completionEvidence) return "완료 근거를 입력한 뒤 종결해 주세요.";
  return null;
}

const OFFICIAL_DOCUMENT = "제주시청-차량관리과운영팀-2026-0142";

export const ABANDONED_VEHICLE_WORKFLOW: DomainWorkflowConfig = {
  key: "abandoned_vehicle",
  title: "무단방치 차량 처리",
  description: "신고 접수부터 소유자 조회·통지, 이동명령, 견인 및 종결 근거까지 관리합니다.",
  team: "operations",
  recordType: "work_order",
  category: "무단방치차량",
  itemLabel: "사건",
  locationLabel: "발견 장소",
  module: "ABANDONED_VEHICLE",
  path: "/ops/abandoned-vehicles",
  stages: [
    { status: "registered", label: "신고접수", action: "소유자 조회" },
    { status: "assigned", label: "조회·통지", action: "이동명령" },
    { status: "in_progress", label: "명령·견인", action: "처분 검토" },
    { status: "review", label: "종결검토", action: "종결" },
    { status: "completed", label: "종결" },
  ],
  fields: [
    { key: "vehicleNumber", label: "차량번호", required: true, placeholder: "12가3456" },
    { key: "reportedAt", label: "신고·발견일", type: "date", required: true },
    { key: "reporterContact", label: "신고 경로", placeholder: "현장순찰 / 국민신문고 / 전화" },
    { key: "ownerLookupResult", label: "소유자 조회 및 통지 내용", type: "textarea" },
    { key: "noticeDate", label: "이동명령 기한", type: "date" },
    { key: "towLocation", label: "견인·보관 장소" },
    { key: "disposition", label: "처분 구분", type: "select", options: ["확인중", "자진이동", "견인보관", "반환", "폐차·매각", "기타"] },
    { key: "completionEvidence", label: "종결 근거", type: "textarea", placeholder: "이동 사진, 통지서, 견인확인서 등" },
  ],
  samples: [
    { recordType: "work_order", team: "operations", title: "동문시장 북측 장기 방치차량 처리", category: "무단방치차량", parkingLot: "동문공설주차장 북측 진입로", ownerName: "운영팀 064-728-3822", priority: "high", status: "assigned", dueDate: "2026-08-05", documentNumber: OFFICIAL_DOCUMENT, payload: { workflow_key: "abandoned_vehicle", vehicleNumber: "12가3456", reportedAt: "2026-07-29", reporterContact: "현장순찰", ownerLookupResult: "자동차등록원부 조회 요청 및 소유자 연락 시도", noticeDate: "2026-08-05", towLocation: "제주시 지정 보관소", disposition: "확인중", completionEvidence: "" } },
  ],
};

export const SECURITY_INSPECTION_WORKFLOW: DomainWorkflowConfig = {
  key: "security_inspection",
  title: "관제·보안 점검",
  description: "CCTV 접근권한, 영상반출, 비상벨 및 불법촬영 점검의 조치와 증빙을 관리합니다.",
  team: "operations",
  recordType: "compliance",
  category: "관제·보안점검",
  itemLabel: "점검",
  locationLabel: "대상 시설",
  module: "SECURITY_INSPECTION",
  path: "/ops/security-inspections",
  stages: [
    { status: "registered", label: "점검예정", action: "담당배정" },
    { status: "assigned", label: "담당배정", action: "점검시작" },
    { status: "in_progress", label: "점검중", action: "시정확인" },
    { status: "review", label: "시정확인", action: "점검완료" },
    { status: "completed", label: "완료" },
  ],
  fields: [
    { key: "inspectionType", label: "점검 유형", type: "select", required: true, options: ["CCTV 접근권한", "영상반출대장", "화장실 비상벨", "불법촬영", "통합관제 장비", "기타"] },
    { key: "inspectionDate", label: "점검일", type: "date", required: true },
    { key: "assetScope", label: "대상 범위", placeholder: "CCTV 186대, 저장서버 2식" },
    { key: "finding", label: "점검 결과·지적사항", type: "textarea" },
    { key: "correctiveAction", label: "시정 조치", type: "textarea" },
    { key: "completionEvidence", label: "완료 근거", type: "textarea", placeholder: "점검표, 권한목록, 현장사진 등" },
  ],
  samples: [
    { recordType: "compliance", team: "operations", title: "7월 CCTV 접근권한 및 영상반출대장 점검", category: "관제·보안점검", parkingLot: "제주시 공영주차장 통합관제실", ownerName: "운영팀 보안담당", priority: "normal", status: "in_progress", dueDate: "2026-07-31", documentNumber: OFFICIAL_DOCUMENT, payload: { workflow_key: "security_inspection", inspectionType: "CCTV 접근권한", inspectionDate: "2026-07-30", assetScope: "CCTV 186대 및 영상저장서버 2식", finding: "퇴직자 계정 1건 비활성화 필요", correctiveAction: "계정 회수 후 권한목록 재검토", completionEvidence: "" } },
  ],
};

export const CAPITAL_PROCEDURE_WORKFLOW: DomainWorkflowConfig = {
  key: "capital_procedure",
  title: "주차장 확충사업 행정절차",
  description: "부지검토부터 공유재산·지방재정·도시계획 절차와 착공·준공 근거를 한 흐름으로 관리합니다.",
  team: "facilities",
  recordType: "capital_project",
  category: "확충사업행정절차",
  itemLabel: "사업",
  locationLabel: "사업 위치",
  module: "CAPITAL_PROCEDURE",
  path: "/planning/procedures",
  stages: [
    { status: "registered", label: "계획수립", action: "사전검토" },
    { status: "assigned", label: "사전검토", action: "행정절차" },
    { status: "in_progress", label: "절차이행", action: "착공·준공검토" },
    { status: "review", label: "준공검토", action: "사업완료" },
    { status: "completed", label: "완료" },
  ],
  fields: [
    { key: "projectType", label: "사업 유형", type: "select", required: true, options: ["신규 조성", "복층화", "부지매입", "폐가 정비", "환경개선", "유료화"] },
    { key: "estimatedSpaces", label: "계획 주차면", type: "number" },
    { key: "budget", label: "총사업비(원)", type: "number" },
    { key: "procedureGate", label: "현재 행정절차", type: "select", required: true, options: ["타당성 검토", "공유재산 심의", "지방재정 투자심사", "도시관리계획", "토지 보상·매입", "설계·인허가", "착공", "준공"] },
    { key: "consultation", label: "협의 부서·기관" },
    { key: "nextGate", label: "다음 조치", type: "textarea" },
    { key: "completionEvidence", label: "완료 근거", type: "textarea", placeholder: "심의결과, 허가서, 준공서류 등" },
  ],
  samples: [
    { recordType: "capital_project", team: "facilities", title: "동문재래시장 공영주차장 복층화 사전절차", category: "확충사업행정절차", parkingLot: "동문재래시장 공영주차장", ownerName: "시설팀 064-728-3242", priority: "high", status: "assigned", dueDate: "2026-08-21", documentNumber: OFFICIAL_DOCUMENT, amount: 4800000000, payload: { workflow_key: "capital_procedure", projectType: "복층화", estimatedSpaces: 120, budget: 4800000000, procedureGate: "타당성 검토", consultation: "공유재산·도시계획·시장부서", nextGate: "기본구상안 확정 후 공유재산 심의자료 작성", completionEvidence: "" } },
  ],
};
