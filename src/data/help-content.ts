export interface HelpArticle {
  id: string;
  module: string;
  title: string;
  content: string;
  tags: string[];
  order: number;
}

export const helpArticles: HelpArticle[] = [
  // CORE
  { id: 'core-login', module: 'CORE', title: '로그인/로그아웃', content: '## 로그인\n\n1. 이메일과 비밀번호를 입력합니다.\n2. **로그인** 버튼을 클릭합니다.\n3. 5회 실패 시 5분간 잠금됩니다.\n\n## 로그아웃\n\n- 우측 상단 사용자명 클릭 → **로그아웃** 선택\n- 30분 미활동 시 자동 로그아웃됩니다.', tags: ['로그인', '비밀번호', '인증'], order: 1 },
  { id: 'core-dashboard', module: 'CORE', title: '대시보드 사용법', content: '## 대시보드\n\n대시보드에서 전체 현황을 한눈에 파악할 수 있습니다.\n\n- **KPI 카드**: 주차장 수, 가동률, 수입 등 핵심 지표\n- **차트**: 일별/월별 수입 추이\n- **최근 활동**: 시스템 활동 이력\n- **지도**: 주차장 위치 표시 (카카오맵 API 키 필요)', tags: ['대시보드', '현황', 'KPI'], order: 2 },
  { id: 'core-lots', module: 'CORE', title: '주차장 등록/수정/삭제', content: '## 주차장 관리\n\n### 등록\n1. **주차장 관리** → **신규 등록** 클릭\n2. 기본정보(코드, 명칭, 주소 등) 입력\n3. 시설정보(총 면수, 장애인면 등) 입력\n4. **저장** 클릭\n\n### 수정\n- 목록에서 주차장 클릭 → **수정** 버튼\n\n### 삭제\n- 상세 페이지에서 **삭제** 버튼 (관리자만)', tags: ['주차장', '등록', '관리'], order: 3 },
  { id: 'core-settings', module: 'CORE', title: '시스템 설정 (관리자)', content: '## 시스템 설정\n\n관리자만 접근 가능합니다.\n\n- **기본 설정**: 기관명, 주소, 지도 설정\n- **모듈 관리**: 모듈 활성화/비활성화\n- **AI 설정**: AI 기능 토글\n- **메시지**: 알림톡/SMS 설정\n- **결재선**: 결재 프로세스 관리', tags: ['설정', '관리자', '시스템'], order: 4 },
  { id: 'core-users', module: 'CORE', title: '사용자 관리 (관리자)', content: '## 사용자 관리\n\n### 역할 구분\n- **admin**: 모든 기능 접근\n- **manager**: 대부분 기능 + 승인 권한\n- **editor**: 데이터 등록/수정\n- **viewer**: 조회만 가능\n\n### 개인정보 마스킹\n- viewer: 모든 개인정보 마스킹\n- editor: 담당 업무만 해제\n- manager/admin: 마스킹 해제', tags: ['사용자', '권한', '역할'], order: 5 },

  // SURVEY
  { id: 'survey-start', module: 'SURVEY', title: '현황조사 시작하기', content: '## 현황조사\n\n1. **현황조사** 메뉴 → **신규 조사** 클릭\n2. 주차장 선택 및 조사일자 입력\n3. 7단계 위저드를 따라 진행\n4. 오프라인에서도 작성 가능 (PWA)', tags: ['현황조사', '시작', '신규'], order: 1 },
  { id: 'survey-wizard', module: 'SURVEY', title: '조사 입력 (7스텝 위저드)', content: '## 7단계 위저드\n\n1. **기본정보**: 주차장 기본 현황\n2. **운영현황**: 운영시간, 요금 등\n3. **인프라**: 시설물 현황\n4. **이용현황**: 이용률, 회전율\n5. **센서계획**: 센서 설치 계획\n6. **사진대장**: 현장 사진\n7. **검토/제출**: 최종 확인 및 제출', tags: ['위저드', '입력', '단계'], order: 2 },
  { id: 'survey-photos', module: 'SURVEY', title: '사진대장 촬영/업로드', content: '## 사진대장\n\n- 카메라 버튼으로 직접 촬영 (모바일)\n- 파일 선택으로 기존 사진 업로드\n- 사진별 위치/설명 입력\n- 최대 20MB/장, JPG/PNG 지원', tags: ['사진', '촬영', '업로드'], order: 3 },
  { id: 'survey-submit', module: 'SURVEY', title: '조사 제출 및 승인', content: '## 제출 및 승인\n\n1. 검토 단계에서 내용 확인\n2. **제출** 클릭 → 상태 변경 (submitted)\n3. 관리자/승인자가 검토 후 승인/반려\n4. 승인 시 조사 완료 처리', tags: ['제출', '승인', '반려'], order: 4 },

  // OPS
  { id: 'ops-staff', module: 'OPS', title: '인력 배치 관리', content: '## 인력 관리\n\n주차장별 관리 인력을 등록하고 배치합니다.\n\n- 성명, 직급, 연락처, 근무시간 등록\n- 주차장별 배치 현황 확인\n- 퇴직/이동 처리', tags: ['인력', '배치', '관리'], order: 1 },
  { id: 'ops-contracts', module: 'OPS', title: '위탁계약 등록/갱신', content: '## 위탁계약\n\n- 위탁업체 정보 등록\n- 계약금액, 수익분배율 설정\n- 계약 기간 관리\n- 갱신 알림 (만료 30일 전)', tags: ['위탁', '계약', '갱신'], order: 2 },
  { id: 'ops-fees', module: 'OPS', title: '요금정책 설정', content: '## 요금정책\n\n- 주차장별 요금체계 등록\n- 기본/추가/1일 최대 요금 설정\n- 평일/주말/공휴일 차등\n- 감면 정책 연동', tags: ['요금', '정책', '설정'], order: 3 },
  { id: 'ops-passes', module: 'OPS', title: '월정기권 발급/갱신', content: '## 월정기권\n\n1. **월정기권** 메뉴 → **발급** 클릭\n2. 차량번호, 이용자 정보 입력\n3. 기간 및 금액 설정\n4. 자동 갱신 설정 가능', tags: ['정기권', '발급', '갱신'], order: 4 },
  { id: 'ops-enforcement', module: 'OPS', title: '단속 기록 등록', content: '## 단속 관리\n\n- 위반 유형: 초과주차, 장애인구역, 이중주차 등\n- 차량번호, 위반 일시, 사진 등록\n- 과태료 납부 상태 관리\n- 이의신청 연동 (민원 모듈)', tags: ['단속', '위반', '과태료'], order: 5 },

  // FACILITY
  { id: 'facility-equipment', module: 'FACILITY', title: '장비 등록/관리', content: '## 장비 관리\n\n- 장비 유형: 차단기, LPR, CCTV, 무인정산기 등\n- 모델, 제조사, 시리얼번호 등록\n- 설치일, 보증기간, 감가상각 관리\n- 상태 관리: 정상/점검필요/고장/수리중/폐기', tags: ['장비', '등록', '관리'], order: 1 },
  { id: 'facility-maintenance', module: 'FACILITY', title: '유지보수 접수~완료', content: '## 유지보수\n\n1. 고장/이상 **접수** (신고)\n2. 담당자 **배정**\n3. 현장 점검 및 **수리 진행**\n4. 부품 교체/비용 등록\n5. **완료** 처리 및 검증', tags: ['유지보수', '수리', '접수'], order: 2 },
  { id: 'facility-schedule', module: 'FACILITY', title: '점검 스케줄 설정', content: '## 점검 스케줄\n\n- 일간/주간/월간/분기/반기/연간 점검 등록\n- 캘린더 뷰로 일정 확인\n- 사전 알림 설정 (N일 전)\n- 체크리스트 연동', tags: ['점검', '스케줄', '일정'], order: 3 },
  { id: 'facility-safety', module: 'FACILITY', title: '안전점검 실시', content: '## 안전점검\n\n- 점검 유형: 월간, 분기, 특별 등\n- 체크리스트 기반 점검\n- 등급 판정: A~F\n- 부적합 사항 시정 관리', tags: ['안전', '점검', '등급'], order: 4 },

  // REVENUE
  { id: 'revenue-daily', module: 'REVENUE', title: '일별 수입 입력', content: '## 일별 수입\n\n- 주차장별 일별 수입 등록\n- 현금/카드/모바일 구분 입력\n- 차량 수 입력\n- 검증(확정) 처리', tags: ['수입', '일별', '입력'], order: 1 },
  { id: 'revenue-reconcile', module: 'REVENUE', title: '위탁수입 대사', content: '## 위탁 대사\n\n- 위탁업체 보고 수입과 시스템 기록 비교\n- 차이 발생 시 확인/조정\n- 수익분배 정산 처리', tags: ['대사', '위탁', '정산'], order: 2 },
  { id: 'revenue-analysis', module: 'REVENUE', title: '수입 분석 활용', content: '## 수입 분석\n\n- 기간별/주차장별 수입 비교\n- 전년 대비 증감률\n- AI 분석 인사이트 (AI 활성화 시)\n- 차트 및 엑셀 내보내기', tags: ['분석', '차트', '비교'], order: 3 },

  // BUDGET
  { id: 'budget-plans', module: 'BUDGET', title: '예산 편성 방법', content: '## 예산 편성\n\n1. **예산 편성** → **신규** 클릭\n2. 회계연도, 예산유형 선택\n3. 세입/세출 항목 등록 (계층 구조)\n4. 금액 입력 후 **제출**\n5. 승인 프로세스 진행', tags: ['예산', '편성', '세입세출'], order: 1 },
  { id: 'budget-executions', module: 'BUDGET', title: '예산 집행 등록', content: '## 예산 집행\n\n- 예산 항목 선택 후 집행 등록\n- 증빙 서류 첨부\n- 잔액 자동 계산\n- 집행률 모니터링', tags: ['집행', '증빙', '잔액'], order: 2 },
  { id: 'budget-transfers', module: 'BUDGET', title: '예산 전용/이체', content: '## 예산 전용\n\n- 항목 간 예산 이동\n- 사유 및 법적 근거 입력\n- 결재 승인 필요', tags: ['전용', '이체', '이동'], order: 3 },

  // PROCUREMENT
  { id: 'proc-projects', module: 'PROCUREMENT', title: '입찰 사업 등록', content: '## 입찰 등록\n\n1. **입찰관리** → **신규 사업** 클릭\n2. 사업명, 유형, 예산 입력\n3. 입찰 일정 설정\n4. 자격 요건 및 평가 기준 등록\n5. 공고', tags: ['입찰', '사업', '공고'], order: 1 },
  { id: 'proc-evaluation', module: 'PROCUREMENT', title: '업체 참여/평가', content: '## 업체 평가\n\n- 참여 업체 등록\n- 기술/가격/경영 평가\n- 적격심사 또는 종합심사\n- 낙찰자 선정', tags: ['평가', '업체', '낙찰'], order: 2 },
  { id: 'proc-contracts', module: 'PROCUREMENT', title: '계약 체결', content: '## 계약\n\n- 낙찰 업체와 계약 등록\n- 계약금액, 기간, 이행보증 입력\n- 계약서 첨부\n- 용역사업 모듈 연동', tags: ['계약', '체결', '이행'], order: 3 },

  // SERVICE
  { id: 'service-projects', module: 'SERVICE', title: '용역사업 등록', content: '## 용역사업\n\n- 입찰 계약에서 자동 생성 또는 수동 등록\n- 사업 개요, 기간, 금액 입력\n- 공정 단계(마일스톤) 설정\n- 산출물 목록 등록', tags: ['용역', '사업', '등록'], order: 1 },
  { id: 'service-inspection', module: 'SERVICE', title: '검수/대가지급', content: '## 검수 및 대가지급\n\n- 단계별 검수 실시\n- 검수조서 작성\n- 대가지급 청구/승인\n- 하자보증 관리', tags: ['검수', '대가', '지급'], order: 2 },
  { id: 'service-issues', module: 'SERVICE', title: '이슈 관리', content: '## 이슈 관리\n\n- 사업 수행 중 이슈 등록\n- 우선순위 및 담당자 배정\n- 진행상태 추적\n- 이슈 해결 기록', tags: ['이슈', '문제', '추적'], order: 3 },

  // COMPLAINT
  { id: 'complaint-receive', module: 'COMPLAINT', title: '민원 접수 방법', content: '## 민원 접수\n\n- 접수 채널: 전화, 온라인, 새올, 방문, 현장\n- 민원인 정보 입력 (익명 가능)\n- 민원 유형 분류\n- AI 자동 분류 지원 (AI 활성화 시)', tags: ['민원', '접수', '채널'], order: 1 },
  { id: 'complaint-workflow', module: 'COMPLAINT', title: '민원 처리 워크플로우', content: '## 처리 프로세스\n\n1. **접수** → 자동 번호 부여\n2. **배정** → 담당팀/담당자 지정\n3. **처리중** → 현장 확인, 조치\n4. **답변** → 회신 작성\n5. **종결** → 만족도 조사', tags: ['처리', '워크플로우', '답변'], order: 2 },
  { id: 'complaint-stats', module: 'COMPLAINT', title: '민원 통계 활용', content: '## 민원 통계\n\n- 기간별/유형별/주차장별 분석\n- 처리율, 평균 처리 기간\n- 만족도 평균\n- 반복 민원 추적', tags: ['통계', '분석', '만족도'], order: 3 },

  // PLANNING
  { id: 'planning-sites', module: 'PLANNING', title: '후보부지 평가', content: '## 후보부지\n\n- 부지 정보 등록 (위치, 면적, 용도지역)\n- B/C 분석 결과 입력\n- 우선순위 평가\n- 지도에서 위치 확인', tags: ['부지', '평가', '분석'], order: 1 },
  { id: 'planning-projects', module: 'PLANNING', title: '공사 진행 관리', content: '## 공사 관리\n\n- 설계/인허가/시공 단계별 관리\n- 진척률 모니터링\n- 관련 서류 관리\n- 인허가 진행 상황 추적', tags: ['공사', '진행', '인허가'], order: 2 },

  // REALTIME
  { id: 'realtime-dashboard', module: 'REALTIME', title: '실시간 현황 보기', content: '## 실시간 현황\n\n- 주차장별 잔여면수 실시간 표시\n- 지도에서 가용/만차 상태 확인\n- 관제 모니터: 전체화면 관제 뷰\n- 단축키: F(전체화면), M(지도토글)', tags: ['실시간', '현황', '관제'], order: 1 },
  { id: 'realtime-sensors', module: 'REALTIME', title: '센서/게이트웨이 관리', content: '## 센서 관리\n\n- 센서 등록 및 상태 모니터링\n- 게이트웨이 연결 관리\n- 안내표시판 연동\n- API 키 관리', tags: ['센서', '게이트웨이', '연동'], order: 2 },

  // REPORT
  { id: 'report-generate', module: 'REPORT', title: '보고서 생성', content: '## 보고서 생성\n\n1. **보고서** → **생성** 클릭\n2. 보고서 유형 선택\n3. 기간 및 대상 설정\n4. **생성** → PDF/엑셀 다운로드\n5. AI 총평 자동 생성 (AI 활성화 시)', tags: ['보고서', '생성', 'PDF'], order: 1 },
  { id: 'report-schedules', module: 'REPORT', title: '정기 보고서 스케줄', content: '## 정기 보고서\n\n- 보고서 자동 생성 스케줄 등록\n- 일간/주간/월간 선택\n- 수신자 설정\n- 생성 이력 확인', tags: ['정기', '스케줄', '자동'], order: 2 },
];

export const MODULE_LABELS: Record<string, string> = {
  CORE: '코어', SURVEY: '현황조사', OPS: '운영관리', FACILITY: '시설관리',
  REVENUE: '수입관리', BUDGET: '예산관리', PROCUREMENT: '입찰관리',
  SERVICE: '용역사업', COMPLAINT: '민원관리', PLANNING: '신설기획',
  REALTIME: '실시간 정보', REPORT: '보고서/통계',
};

/** 라우트 → 모듈 매핑 */
export function getModuleFromPath(path: string): string | null {
  if (path.startsWith('/surveys')) return 'SURVEY';
  if (path.startsWith('/ops')) return 'OPS';
  if (path.startsWith('/facility')) return 'FACILITY';
  if (path.startsWith('/revenue')) return 'REVENUE';
  if (path.startsWith('/budget')) return 'BUDGET';
  if (path.startsWith('/procurement')) return 'PROCUREMENT';
  if (path.startsWith('/service')) return 'SERVICE';
  if (path.startsWith('/complaints')) return 'COMPLAINT';
  if (path.startsWith('/planning')) return 'PLANNING';
  if (path.startsWith('/realtime')) return 'REALTIME';
  if (path.startsWith('/reports')) return 'REPORT';
  if (path === '/' || path.startsWith('/lots') || path.startsWith('/settings')) return 'CORE';
  return null;
}
