# ParkMaster 프로젝트 통합 상태

기준일: 2026-07-30

## 통합 범위

이 문서는 기존에 분리되어 있던 개발 브랜치와 PR의 누적 결과를 하나의 최종 통합 브랜치로 정리한 상태를 기록합니다.

### 자체 백엔드와 데이터베이스

- Fastify + TypeScript 백엔드
- PostgreSQL 16용 순차 마이그레이션 10개
- 사용자·프로필·주차장·민원·예산·수익·시설·조달·용역·결재·보고서 등 업무 테이블
- bcrypt 비밀번호와 JWT httpOnly 쿠키 기반 인증
- 인증·권한 미들웨어, 감사로그, 공통 CRUD 처리
- 로컬 파일 업로드·다운로드 API

### 프론트엔드 전환

- 자체 REST API 클라이언트
- 로그인·로그아웃·세션 갱신·비밀번호 변경
- 기존 Supabase 형식 호출을 자체 API로 연결하는 호환 shim
- 파일 API 전환
- JOIN select의 `expand` 변환 및 fallback 처리
- 외부 Sensor Monitoring 콘솔 메뉴 반영

### 운영 보강

- Supabase → 자체 PostgreSQL 데이터 이전 스크립트
- 원본·대상 데이터 수량 검증 도구
- 내부 LLM/Ollama 어댑터
- 민원 분류·답변 초안·보고서 요약 AI 평가 도구
- 핵심 API 스모크 테스트
- Windows 서버 초기 설치 PowerShell 스크립트
- Windows 운영 매뉴얼

### 저장소 정리

- 최신 `main`의 Sensor Monitoring 변경을 통합
- 실제 `.env` 추적 제거 및 예시 환경파일 제공
- npm을 기준 패키지 관리자로 통일하고 Bun 잠금파일 제거
- Lovable 기본 README를 현재 자체 호스팅 구조로 교체
- Codex용 `AGENTS.md` 추가
- 프론트엔드·백엔드 CI 추가
- 중간 작업용 PR 설명 파일 제거
- 개발 서버 포트를 `5173`으로 통일

## 실행 구성

```text
Frontend  http://127.0.0.1:5173
Backend   http://localhost:4000
Database  PostgreSQL 16
AI        Ollama/OpenAI 호환 서버 (선택)
```

## 배포 전 필수 확인

1. 운영 PostgreSQL 사용자와 데이터베이스 생성
2. `api/.env`의 DB 비밀번호·JWT secret·관리자 비밀번호 변경
3. `npm run migrate` 실행
4. `npm run seed:admin` 실행
5. 프론트엔드 및 백엔드 빌드 통과 확인
6. 백엔드 실행 후 `npm run smoke` 통과 확인
7. 실제 브라우저에서 로그인, 주차장 CRUD, 민원, 파일 업로드 확인
8. 기존 데이터가 있으면 `import:supabase` 후 `verify:import` 실행
9. AI 사용 시 Ollama 모델 설치 후 `eval:ai` 실행
10. 백업·복구 절차를 실제 운영 경로에서 시험

## 이번 통합에서 직접 실행하지 못한 검증

GitHub 원격 저장소만 사용할 수 있는 작업 환경이므로 다음 검증은 실제 서버 또는 CI에서 수행해야 합니다.

- PostgreSQL을 포함한 마이그레이션과 통합 테스트
- Windows PowerShell 설치 스크립트의 실제 서버 실행
- 실데이터 Supabase 이전
- Ollama 실연동
- 브라우저 전체 업무 시나리오

CI가 정적 검사와 빌드 결과를 제공하며, DB가 필요한 검증은 별도의 실제 환경 스모크 테스트로 완료해야 합니다.

## 보안 후속 조치

- 이전 커밋 이력에 포함된 Supabase publishable key는 클라이언트 공개키 성격이지만, 운영 전 재발급 또는 폐기 여부를 검토합니다.
- service-role key, DB 비밀번호, JWT secret은 저장소에 추가하지 않습니다.
- 데이터 이전용 service-role key는 이전 종료 후 환경파일에서 제거합니다.
- 공개 저장소 유지가 불필요한 내부 시스템이면 저장소 공개 범위를 별도로 검토합니다.
