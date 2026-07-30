# WOOJOO ParkMaster

지자체와 공공기관의 주차장 업무를 통합 관리하는 웹 애플리케이션입니다. 주차장 마스터 데이터, 실태조사, 실시간 센서 현황, 운영·단속, 시설 유지관리, 민원, 예산·수익, 용역·조달, 결재, 보고서를 하나의 시스템에서 처리합니다.

## 현재 아키텍처

```text
사용자 브라우저
  └─ React + Vite 프론트엔드 (:5173)
       └─ Fastify REST API (:4000)
            ├─ PostgreSQL 16
            ├─ 로컬 파일 저장소
            └─ 내부 LLM/Ollama (선택)
```

운영 런타임은 Supabase에 의존하지 않습니다. 기존 Supabase 데이터는 일회성 이전 스크립트로 자체 PostgreSQL에 옮길 수 있습니다.

## 주요 기능

- 자체 인증: bcrypt 비밀번호, JWT httpOnly 쿠키, refresh token 회전
- 주차장·주차면·센서·게이트웨이·현황판 관리
- 실태조사, 민원, 요금·감면, 단속, 시설, 예산·수익 관리
- 조달·용역·결재·보고서 업무
- 로컬 파일 업로드·다운로드
- 감사 로그와 보안 관리
- Supabase 데이터 이전 및 이전 결과 검증
- 내부 LLM 기반 민원 분류·답변 초안·보고서 요약(선택)
- Windows 서버 자동 설치, 스모크 테스트, AI 평가 도구
- 지정 계정용 외부 Sensor Monitoring 콘솔 연결

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | React 18, TypeScript, Vite, TanStack Query |
| UI | shadcn/ui, Radix UI, Tailwind CSS |
| Backend | Fastify, TypeScript, node-postgres |
| Database | PostgreSQL 16 |
| Authentication | bcrypt, JWT httpOnly cookie |
| Validation | Zod |
| Test | Vitest, Playwright |
| Optional AI | Ollama 또는 OpenAI 호환 서버 |

## 프로젝트 구조

```text
src/                         프론트엔드
  pages/                     업무 화면
  components/                공용·도메인 UI
  hooks/                     인증·설정·업무 훅
  integrations/api/          자체 API 클라이언트와 Supabase 호환 shim
  lib/                       비즈니스·보안 유틸리티
api/                         자체 백엔드
  src/auth/                  인증
  src/middleware/            인증·권한 미들웨어
  src/routes/                REST API 라우트
  src/lib/                   CRUD, 감사로그, JOIN expand 등
  migrations/                PostgreSQL 스키마 마이그레이션
  scripts/                   설치·이전·검증·운영 스크립트
MIGRATION_ANALYSIS.md        자체 PostgreSQL 전환 분석
WINDOWS_운영매뉴얼.md        Windows 서버 운영 절차
docs/PROJECT_STATUS.md       통합 범위와 현재 상태
```

## 요구사항

- Node.js 20 이상
- npm
- PostgreSQL 16
- Windows 운영 서버에서는 PowerShell 5.1 이상

## 로컬 실행

### 1. 백엔드

```bash
cd api
npm install
cp .env.example .env
# api/.env의 PG_PASSWORD, JWT_SECRET, ADMIN_PASSWORD 등을 변경
npm run migrate
npm run seed:admin
npm run dev
```

기본 주소는 `http://localhost:4000`입니다. 상태 확인은 `http://localhost:4000/api/health`에서 할 수 있습니다.

### 2. 프론트엔드

새 터미널에서 실행합니다.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

기본 주소는 `http://127.0.0.1:5173`입니다.

## 환경 변수

실제 환경파일은 Git에 커밋하지 않습니다.

- 프론트엔드 예시: `/.env.example`
- 백엔드 예시: `/api/.env.example`
- 로컬 프론트엔드: `/.env.local`
- 로컬 백엔드: `/api/.env`

운영에서는 반드시 다음 값을 별도로 생성하거나 변경합니다.

- `PG_PASSWORD`
- `JWT_SECRET`
- `ADMIN_PASSWORD`
- `SOURCE_SUPABASE_SERVICE_KEY` — 데이터 이전 때만 사용

## 주요 명령어

### 프론트엔드

```bash
npm run dev
npm run lint
npm test
npm run build
npm run preview
```

### 백엔드

```bash
cd api
npm run dev
npm run build
npm run migrate
npm run seed:admin
npm run smoke
npm run import:supabase
npm run verify:import
npm run eval:ai
```

## Windows 서버 설치

PostgreSQL과 Node.js를 준비한 뒤 저장소 루트에서 실행합니다.

```powershell
.\api\scripts\setup-windows.ps1
```

세부 운영·백업·복구 절차는 `WINDOWS_운영매뉴얼.md`를 따릅니다.

## 데이터 이전

`api/.env`에 아래 값을 입력한 후 실행합니다.

```env
SOURCE_SUPABASE_URL=https://<project-ref>.supabase.co
SOURCE_SUPABASE_SERVICE_KEY=<service-role-key>
```

```bash
cd api
npm run migrate
npm run import:supabase
npm run verify:import
```

`SOURCE_SUPABASE_SERVICE_KEY`는 이전 작업이 끝나면 환경파일에서 삭제하거나 폐기합니다.

## 검증

정적 검증:

```bash
npm ci
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm test -- --passWithNoTests
npm run build

cd api
npm install
npm run build
npm test -- --passWithNoTests
```

실행 환경 검증:

```bash
cd api
npm run smoke
```

스모크 테스트는 PostgreSQL, 마이그레이션, 관리자 계정, 실행 중인 API 서버가 필요합니다.

## 보안 원칙

- `.env`, `.env.local`, `api/.env`를 커밋하지 않습니다.
- 서비스 역할 키, DB 비밀번호, JWT secret을 코드와 문서에 직접 기록하지 않습니다.
- 개인정보와 차량번호는 기존 마스킹·감사로그 모듈을 통해 처리합니다.
- 파일 업로드는 허용 확장자·크기·경로 검증을 거칩니다.
- 공개 저장소 이력에 노출된 키는 운영 전 재발급 또는 폐기 여부를 검토합니다.

## 라이선스

우주주차 내부 프로젝트입니다. 별도 라이선스를 부여하지 않습니다.
