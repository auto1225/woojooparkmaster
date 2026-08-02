import type { ChecklistItem } from "@/types/facility";
import type { LotType } from "@/types/database";

export type ComplaintPriority = "low" | "normal" | "high" | "urgent";
export type ComplaintTeam = "operations" | "facilities";

export interface ParkingLotLocationField {
  key: "primary" | "secondary" | "space";
  label: string;
  placeholder: string;
}

export interface ParkingLotComplaintRule {
  value: string;
  label: string;
  category: string;
  assignedTeam: ComplaintTeam;
  priority: ComplaintPriority;
  dueDays: number;
  createsMaintenanceWork: boolean;
}

export interface ParkingLotScheduleRecommendation {
  name: string;
  scheduleType: "weekly" | "monthly" | "quarterly" | "semi_annual" | "yearly";
  description: string;
}

export interface ParkingLotWorkProfile {
  type: LotType;
  label: string;
  shortLabel: string;
  workFocus: string;
  locationFields: ParkingLotLocationField[];
  requiredEquipment: string[];
  checklist: Array<{ category: string; items: string[] }>;
  complaintRules: ParkingLotComplaintRule[];
  scheduleRecommendations: ParkingLotScheduleRecommendation[];
}

const profiles: Record<LotType, ParkingLotWorkProfile> = {
  offstreet: {
    type: "offstreet",
    label: "노외주차장",
    shortLabel: "노외",
    workFocus: "포장·배수·출입구·관제장비와 보행 안전을 중심으로 관리합니다.",
    locationFields: [
      { key: "primary", label: "구역·열", placeholder: "예: A구역 3열" },
      { key: "secondary", label: "출입구·기준점", placeholder: "예: 동측 출구 앞" },
      { key: "space", label: "주차면 번호", placeholder: "예: 42번" },
    ],
    requiredEquipment: ["cctv", "lighting", "barrier", "kiosk"],
    checklist: [
      { category: "포장·배수", items: ["포장 균열·파임·침하", "배수구 막힘·침수 흔적", "경계석·맨홀 파손", "우천 시 미끄럼 위험"] },
      { category: "출입·관제", items: ["차단기 작동", "무인정산기·인터폰 작동", "CCTV 사각지대·영상 상태", "입출구 시야 확보"] },
      { category: "전기·조명", items: ["조명 점등·조도", "분전함 잠금·누전 위험", "전선 노출·접지 상태"] },
      { category: "교통·보행", items: ["주차선·방향표시 가시성", "과속방지턱·안전표지", "보행통로·장애인 이동 동선", "펜스·볼라드 파손"] },
      { category: "환경·편의", items: ["쓰레기·악취·잡초", "안내판 가독성", "장애인·전기차 구획 상태"] },
    ],
    complaintRules: [
      { value: "surface_damage", label: "포장 파손·침하", category: "facility", assignedTeam: "facilities", priority: "high", dueDays: 3, createsMaintenanceWork: true },
      { value: "drainage_flooding", label: "배수 불량·침수", category: "safety", assignedTeam: "facilities", priority: "urgent", dueDays: 1, createsMaintenanceWork: true },
      { value: "lighting_failure", label: "조명 고장·어두움", category: "safety", assignedTeam: "facilities", priority: "high", dueDays: 2, createsMaintenanceWork: true },
      { value: "gate_kiosk", label: "차단기·정산기 장애", category: "facility", assignedTeam: "facilities", priority: "high", dueDays: 2, createsMaintenanceWork: true },
      { value: "traffic_congestion", label: "출입구 혼잡·동선", category: "operation", assignedTeam: "operations", priority: "normal", dueDays: 5, createsMaintenanceWork: false },
      { value: "abandoned_vehicle", label: "장기방치 차량", category: "operation", assignedTeam: "operations", priority: "normal", dueDays: 7, createsMaintenanceWork: false },
      { value: "cleanliness_landscape", label: "청결·수목·환경", category: "cleanliness", assignedTeam: "facilities", priority: "normal", dueDays: 5, createsMaintenanceWork: true },
    ],
    scheduleRecommendations: [
      { name: "포장·배수 월간점검", scheduleType: "monthly", description: "포장 파손, 침하, 배수구 막힘과 침수 흔적을 점검합니다." },
      { name: "출입관제 설비 월간점검", scheduleType: "monthly", description: "차단기, 정산기, 인터폰, CCTV의 작동 상태를 점검합니다." },
      { name: "우기 전 배수 특별점검", scheduleType: "semi_annual", description: "우기 전 배수구, 집수정, 저지대 침수 위험을 집중 점검합니다." },
    ],
  },
  multilevel: {
    type: "multilevel",
    label: "주차빌딩",
    shortLabel: "빌딩",
    workFocus: "층별 구조·소방·승강·환기 설비와 램프·보행 동선을 중심으로 관리합니다.",
    locationFields: [
      { key: "primary", label: "층", placeholder: "예: 3층 또는 B1" },
      { key: "secondary", label: "구역·기둥번호", placeholder: "예: C구역 C-12" },
      { key: "space", label: "주차면 번호", placeholder: "예: 318번" },
    ],
    requiredEquipment: ["cctv", "lighting", "fire_extinguisher", "barrier", "intercom"],
    checklist: [
      { category: "구조안전", items: ["바닥·벽체·기둥 균열", "천장 박락·누수", "램프·난간·방호벽", "신축이음·배수 상태"] },
      { category: "소방안전", items: ["소화기 비치·유효기한", "화재감지·경보 설비", "비상등·유도등", "소방통로·방화문"] },
      { category: "전기·기계", items: ["조명·분전반·누전차단기", "환기·제연 설비", "승강기·비상통화", "배수펌프·집수정"] },
      { category: "관제·보안", items: ["CCTV·비상벨", "차단기·정산기·인터폰", "출입통제·순찰 취약지점"] },
      { category: "교통·이용", items: ["층별 방향·높이제한 표시", "램프 미끄럼·속도저감", "보행통로·계단·장애인시설", "화장실·안내판 상태"] },
    ],
    complaintRules: [
      { value: "structural_crack", label: "균열·박락·구조 이상", category: "safety", assignedTeam: "facilities", priority: "urgent", dueDays: 1, createsMaintenanceWork: true },
      { value: "water_leak", label: "누수·배수·침수", category: "safety", assignedTeam: "facilities", priority: "high", dueDays: 2, createsMaintenanceWork: true },
      { value: "elevator_failure", label: "승강기 장애", category: "facility", assignedTeam: "facilities", priority: "urgent", dueDays: 1, createsMaintenanceWork: true },
      { value: "fire_safety", label: "소방·비상설비", category: "safety", assignedTeam: "facilities", priority: "urgent", dueDays: 1, createsMaintenanceWork: true },
      { value: "ventilation_odor", label: "환기 불량·악취", category: "facility", assignedTeam: "facilities", priority: "high", dueDays: 3, createsMaintenanceWork: true },
      { value: "lighting_cctv", label: "조명·CCTV·비상벨", category: "safety", assignedTeam: "facilities", priority: "high", dueDays: 2, createsMaintenanceWork: true },
      { value: "ramp_traffic", label: "램프·층간 차량동선", category: "operation", assignedTeam: "operations", priority: "high", dueDays: 3, createsMaintenanceWork: false },
      { value: "restroom_convenience", label: "화장실·이용편의", category: "cleanliness", assignedTeam: "facilities", priority: "normal", dueDays: 5, createsMaintenanceWork: true },
    ],
    scheduleRecommendations: [
      { name: "구조·누수 월간점검", scheduleType: "monthly", description: "층별 균열, 박락, 누수, 램프와 난간 상태를 점검합니다." },
      { name: "소방·비상설비 월간점검", scheduleType: "monthly", description: "소화기, 감지기, 비상등, 유도등, 방화문을 점검합니다." },
      { name: "승강·환기설비 분기점검", scheduleType: "quarterly", description: "승강기, 환기·제연, 배수펌프와 비상통화 설비를 점검합니다." },
    ],
  },
  onstreet: {
    type: "onstreet",
    label: "노상주차장",
    shortLabel: "노상",
    workFocus: "도로 구간별 주차면·표지·센서와 차량·보행자 안전을 중심으로 관리합니다.",
    locationFields: [
      { key: "primary", label: "도로명·구간", placeholder: "예: 중앙로 북측 2구간" },
      { key: "secondary", label: "진행방향·도로측", placeholder: "예: 동→서 방향 우측" },
      { key: "space", label: "주차면 번호", placeholder: "예: N-024" },
    ],
    requiredEquipment: ["sensor", "gateway", "display_board", "bollard"],
    checklist: [
      { category: "주차면·노면", items: ["주차선·면번호 가시성", "노면 파손·침하", "배수구·측구 막힘", "장애인·전기차 표시"] },
      { category: "표지·안내", items: ["운영시간·요금 표지", "진입·진출 안내", "주정차 금지구역 구분", "표지판 전도·가림"] },
      { category: "스마트관제", items: ["주차면 센서 작동", "게이트웨이 통신", "결제·안내 단말", "점유정보 정확도"] },
      { category: "도로·보행안전", items: ["볼라드·연석·방호시설", "횡단보도·교차로 시야", "상가·주택 진출입 방해", "보행통로 확보"] },
      { category: "환경관리", items: ["불법 적치물·쓰레기", "야간 조도·반사표지", "공사·행사 임시통제"] },
    ],
    complaintRules: [
      { value: "marking_sign", label: "노면표시·표지판", category: "facility", assignedTeam: "facilities", priority: "high", dueDays: 3, createsMaintenanceWork: true },
      { value: "sensor_payment", label: "주차센서·결제 장애", category: "facility", assignedTeam: "facilities", priority: "high", dueDays: 2, createsMaintenanceWork: true },
      { value: "bollard_curb", label: "볼라드·연석 파손", category: "safety", assignedTeam: "facilities", priority: "high", dueDays: 2, createsMaintenanceWork: true },
      { value: "illegal_parking", label: "불법·장기 주정차", category: "operation", assignedTeam: "operations", priority: "normal", dueDays: 3, createsMaintenanceWork: false },
      { value: "access_obstruction", label: "상가·주택 진출입 방해", category: "operation", assignedTeam: "operations", priority: "high", dueDays: 2, createsMaintenanceWork: false },
      { value: "pedestrian_traffic", label: "보행·교통 안전", category: "safety", assignedTeam: "operations", priority: "urgent", dueDays: 1, createsMaintenanceWork: false },
      { value: "enforcement_appeal", label: "단속 이의", category: "enforcement_appeal", assignedTeam: "operations", priority: "normal", dueDays: 5, createsMaintenanceWork: false },
      { value: "fee_payment", label: "요금·결제 문의", category: "fee", assignedTeam: "operations", priority: "normal", dueDays: 5, createsMaintenanceWork: false },
    ],
    scheduleRecommendations: [
      { name: "노면표시·표지 월간점검", scheduleType: "monthly", description: "구간별 주차선, 면번호, 운영·요금 표지와 가시성을 점검합니다." },
      { name: "주차센서·통신 주간점검", scheduleType: "weekly", description: "센서 오검지, 게이트웨이 통신과 점유정보 정확도를 점검합니다." },
      { name: "도로·보행안전 월간점검", scheduleType: "monthly", description: "볼라드, 연석, 교차로 시야와 보행통로를 점검합니다." },
    ],
  },
  underground: {
    type: "underground",
    label: "지하주차장",
    shortLabel: "지하",
    workFocus: "주차빌딩 기준에 침수·배수펌프·환기·제연 위험을 강화해 관리합니다.",
    locationFields: [
      { key: "primary", label: "지하층", placeholder: "예: B2" },
      { key: "secondary", label: "구역·기둥번호", placeholder: "예: D구역 D-08" },
      { key: "space", label: "주차면 번호", placeholder: "예: B2-118" },
    ],
    requiredEquipment: ["cctv", "lighting", "fire_extinguisher", "intercom", "gateway"],
    checklist: [
      { category: "침수·배수", items: ["집수정 수위·오염", "배수펌프 자동·수동 운전", "차수판·모래주머니", "유입구·저지대 침수 흔적"] },
      { category: "구조·누수", items: ["벽체·기둥 균열", "천장 누수·박락", "램프·난간·방호벽", "신축이음 상태"] },
      { category: "소방·환기", items: ["소화기·감지기·스프링클러", "비상등·유도등·방화문", "환기·제연설비", "일산화탄소 경보"] },
      { category: "전기·관제", items: ["조명·비상전원", "CCTV·비상벨·인터폰", "분전반·누전차단기", "통신·관제 연결"] },
      { category: "교통·이용", items: ["층별·출구 안내", "램프 미끄럼·속도저감", "보행통로·계단", "장애인 시설"] },
    ],
    complaintRules: [
      { value: "flooding_pump", label: "침수·배수펌프", category: "safety", assignedTeam: "facilities", priority: "urgent", dueDays: 1, createsMaintenanceWork: true },
      { value: "water_leak", label: "누수·천장 박락", category: "safety", assignedTeam: "facilities", priority: "high", dueDays: 2, createsMaintenanceWork: true },
      { value: "ventilation_air", label: "환기·공기질·악취", category: "safety", assignedTeam: "facilities", priority: "high", dueDays: 2, createsMaintenanceWork: true },
      { value: "fire_safety", label: "소방·비상설비", category: "safety", assignedTeam: "facilities", priority: "urgent", dueDays: 1, createsMaintenanceWork: true },
      { value: "lighting_cctv", label: "조명·CCTV·비상벨", category: "safety", assignedTeam: "facilities", priority: "high", dueDays: 2, createsMaintenanceWork: true },
      { value: "ramp_traffic", label: "램프·차량동선", category: "operation", assignedTeam: "operations", priority: "high", dueDays: 3, createsMaintenanceWork: false },
    ],
    scheduleRecommendations: [
      { name: "침수·배수펌프 월간점검", scheduleType: "monthly", description: "집수정, 배수펌프, 차수설비와 침수 위험지점을 점검합니다." },
      { name: "환기·제연 월간점검", scheduleType: "monthly", description: "환기, 제연, 공기질 경보와 비상전원을 점검합니다." },
      { name: "구조·소방 분기점검", scheduleType: "quarterly", description: "구조 균열, 누수, 소방·피난 설비를 종합 점검합니다." },
    ],
  },
  vacant_lot: {
    type: "vacant_lot",
    label: "공한지주차장",
    shortLabel: "공한지",
    workFocus: "비포장·임시 포장 상태, 배수, 경계와 야간 안전을 중심으로 관리합니다.",
    locationFields: [
      { key: "primary", label: "구역·열", placeholder: "예: 서측 임시구역" },
      { key: "secondary", label: "경계·기준점", placeholder: "예: 북측 담장 앞" },
      { key: "space", label: "주차면·표식", placeholder: "예: 임시 12번" },
    ],
    requiredEquipment: ["cctv", "lighting", "bollard"],
    checklist: [
      { category: "노면·배수", items: ["비포장 패임·진흙·먼지", "침하·물고임", "배수로·측구", "임시 주차선 상태"] },
      { category: "경계·안전", items: ["펜스·볼라드·출입구", "인접 사유지 경계", "낙상·단차·적치물", "야간 조명"] },
      { category: "운영·환경", items: ["안내판·운영시간", "방치차량·불법 적치", "쓰레기·잡초·비산먼지", "CCTV·순찰 취약지점"] },
    ],
    complaintRules: [
      { value: "unpaved_surface", label: "비포장 파임·먼지", category: "facility", assignedTeam: "facilities", priority: "high", dueDays: 3, createsMaintenanceWork: true },
      { value: "drainage_flooding", label: "배수 불량·물고임", category: "safety", assignedTeam: "facilities", priority: "high", dueDays: 2, createsMaintenanceWork: true },
      { value: "boundary_safety", label: "경계·펜스·단차", category: "safety", assignedTeam: "facilities", priority: "high", dueDays: 2, createsMaintenanceWork: true },
      { value: "dust_cleanliness", label: "먼지·쓰레기·잡초", category: "cleanliness", assignedTeam: "facilities", priority: "normal", dueDays: 5, createsMaintenanceWork: true },
      { value: "abandoned_vehicle", label: "방치차량·불법 적치", category: "operation", assignedTeam: "operations", priority: "normal", dueDays: 5, createsMaintenanceWork: false },
    ],
    scheduleRecommendations: [
      { name: "노면·배수 월간점검", scheduleType: "monthly", description: "비포장 패임, 침하, 물고임과 배수로를 점검합니다." },
      { name: "경계·야간안전 월간점검", scheduleType: "monthly", description: "펜스, 볼라드, 경계, CCTV와 야간 조명을 점검합니다." },
    ],
  },
};

export function getParkingLotWorkProfile(lotType?: string | null): ParkingLotWorkProfile {
  return profiles[(lotType as LotType) || "offstreet"] || profiles.offstreet;
}

export function createChecklistForLotType(lotType?: string | null): ChecklistItem[] {
  return getParkingLotWorkProfile(lotType).checklist.flatMap((group) =>
    group.items.map((item) => ({ category: group.category, item, result: "pass" as const, severity: undefined, note: "" })),
  );
}

export function getComplaintRule(lotType: string | null | undefined, ruleValue: string) {
  return getParkingLotWorkProfile(lotType).complaintRules.find((rule) => rule.value === ruleValue) || null;
}

export function getRecommendedDueDate(days: number, baseDate = new Date()) {
  const due = new Date(baseDate);
  due.setDate(due.getDate() + days);
  return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
}

export function buildParkingLocationDetail(
  lotType: string | null | undefined,
  parts: Partial<Record<ParkingLotLocationField["key"], string>>,
  fallback = "",
) {
  const profile = getParkingLotWorkProfile(lotType);
  const values = profile.locationFields
    .map((field) => ({ label: field.label, value: parts[field.key]?.trim() }))
    .filter((item) => item.value)
    .map((item) => `${item.label}: ${item.value}`);
  return values.length ? values.join(" / ") : fallback.trim();
}

export function getMissingRequiredEquipment(lotType: string | null | undefined, equipmentTypes: string[]) {
  const present = new Set(equipmentTypes);
  return getParkingLotWorkProfile(lotType).requiredEquipment.filter((type) => !present.has(type));
}

export const PARKING_LOT_WORK_PROFILES = profiles;
