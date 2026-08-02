import type { TeamRecordType } from "@/types/team-work";

export type DutyTeam = "operations" | "facilities";

export interface TeamDuty {
  id: string;
  team: DutyTeam;
  area: string;
  role: string;
  phone: string;
  duties: string[];
  recordType: TeamRecordType;
  category: string;
  destination: string;
  destinationLabel: string;
}

export const TEAM_DUTIES: TeamDuty[] = [
  { id: "fac-lead", team: "facilities", area: "계획 총괄", role: "주차시설팀장", phone: "064-728-3241", duties: ["주차장 확충 종합계획 수립", "주차장 복층화 계획 수립", "주차장 시설 부지매입 계획 수립", "주차환경개선지구 지정·관리계획 수립"], recordType: "capital_project", category: "확충계획", destination: "/planning", destinationLabel: "신설기획" },
  { id: "fac-3242", team: "facilities", area: "확충·복층화", role: "주무관", phone: "064-728-3242", duties: ["주차장 시설 기준·확충 계획", "공영주차장 복층화사업", "공유재산·지방재정투자 사전절차", "폐가 정비를 통한 주차장 확충"], recordType: "capital_project", category: "복층화", destination: "/planning/projects", destinationLabel: "공사 관리" },
  { id: "fac-3243", team: "facilities", area: "유료화·스마트관제", role: "주무관", phone: "064-728-3243", duties: ["공영주차장 유료화 및 복층화", "전기·통신·소방 시설", "스마트 통합 주차관제시스템 구축", "공영·공한지 주차장 조성 및 정비", "노외주차장 민영 관리"], recordType: "capital_project", category: "스마트관제", destination: "/realtime", destinationLabel: "실시간 정보" },
  { id: "fac-3246", team: "facilities", area: "부지매입·행정", role: "주무관", phone: "064-728-3246", duties: ["공영주차장 부지매입·공유재산 심의", "공영주차장 유료화·노루목", "공영·공한지 주차장 조성 및 정비", "주차시설팀 일반서무"], recordType: "capital_project", category: "부지매입", destination: "/planning/sites", destinationLabel: "후보부지" },
  { id: "ops-lead", team: "operations", area: "운영 총괄", role: "공영주차장운영팀장", phone: "064-728-3821", duties: ["공영주차장 운영계획 수립 및 팀 업무 총괄", "공영주차장 사업장 관리 전반", "시설물 정비 및 유지관리업무 총괄", "공영주차장 개선업무 총괄"], recordType: "work_order", category: "운영총괄", destination: "/ops", destinationLabel: "운영 현황" },
  { id: "ops-3822", team: "operations", area: "시설·보안", role: "주무관", phone: "064-728-3822", duties: ["건축·토목·주차구획선·안내간판 시설물 유지관리", "무단방치 차량 업무처리", "영상정보처리기기 운영관리 및 보안", "유료주차장 운영관리 및 민원처리"], recordType: "work_order", category: "시설·보안", destination: "/facility/maintenance", destinationLabel: "유지보수" },
  { id: "ops-3823", team: "operations", area: "관제·감면", role: "주무관", phone: "064-728-3823", duties: ["통합관제실 시스템 및 장비 유지관리", "주차관제시설 관리 및 정비", "주차관제시설 콜센터 용역 관리", "주차요금 즉시감면서비스 신청 접수 및 등록"], recordType: "receivable_discount", category: "즉시감면", destination: "/ops/exemptions", destinationLabel: "감면 관리" },
  { id: "ops-3827", team: "operations", area: "환경·법정점검", role: "주무관", phone: "064-728-3827", duties: ["주차장 환경정비 및 관리", "전기·소방·승강기·경비시스템 유지관리 용역", "화장실 비상벨 유지관리 및 불법촬영 점검", "주차관리원 복지·보상 및 근무지 관리"], recordType: "compliance", category: "환경·법정점검", destination: "/facility/safety", destinationLabel: "안전점검" },
  { id: "ops-3828", team: "operations", area: "인력·민원", role: "주무관", phone: "064-728-3828", duties: ["주차관리원 채용·급여 지출·복무관리", "제세공과금 등 각종 수수료 지출 관리", "공영주차장 예산 및 공공근로 관리", "공영주차장 민원 처리", "주차관리원 피복 관리"], recordType: "workforce", category: "채용·복무", destination: "/ops/staff", destinationLabel: "인력 관리" },
  { id: "ops-3826", team: "operations", area: "현금·할인", role: "주무관", phone: "064-728-3826", duties: ["주차요금 현금 회수", "최고지 사용료 및 반환금 관리", "주차요금 미납 및 월정기권 관리 지원", "시간할인권 관리", "공공근로 채용업무"], recordType: "revenue_close", category: "현금인계", destination: "/revenue/daily", destinationLabel: "일별 수입" },
  { id: "ops-3824", team: "operations", area: "정산·세입", role: "주무관", phone: "064-728-3824", duties: ["주차요금 정산 및 세입 업무", "주차요금 미납 및 월정기권 배정 관리", "공영주차장 운영 및 관리 지원", "주차요금 카드 정산 관리"], recordType: "revenue_close", category: "카드·세입정산", destination: "/revenue/reconcile", destinationLabel: "위탁 대사" },
  { id: "ops-3825", team: "operations", area: "정산·회계", role: "주무관", phone: "064-728-3825", duties: ["주차요금 정산 및 세입 업무", "주차요금 미납 및 월정기권 관리 지원", "공영주차장 운영 및 관리 지원", "현금 및 계좌입금 정산 관리"], recordType: "revenue_close", category: "현금·계좌정산", destination: "/revenue", destinationLabel: "수입 현황" },
];

export const DUTY_TEAM_LABELS: Record<DutyTeam, string> = {
  operations: "공영주차장 운영팀",
  facilities: "주차시설팀",
};
