# AGENTS.md

이 문서는 Codex와 기타 코딩 에이전트가 WOOJOO ParkMaster 저장소에서 일관되게 작업하기 위한 기준입니다.

## 프로젝트 정의

지자체·공공기관용 주차장 통합 관리 시스템입니다.

- 프론트엔드: React + TypeScript + Vite
- 백엔드: Fastify + TypeScript
- 데이터베이스: PostgreSQL 16
- 인증: bcrypt + JWT httpOnly cookie
- 운영 환경: Windows 서버 1대 또는 동등한 자체 호스팅 환경
- 선택 기능: Ollama/OpenAI 호환 내부 LLM

정상 운영 경로에서는 Supabase SDK를 직접 사용하지 않습니다. 기존 호출 호환은 `src/integrations/api/supabase-compat.ts`를 거쳐 자체 API로 전달됩니다.

## 핵심 명령어

### 프론트엔드

```bash
npm ci
npm run dev          # http://127.0.0.1:5173
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm test -- --passWithNoTests
npm run build
```

### 백엔드

```bash
cd api
npm install
npm run build
npm test -- --passWithNoTests
npm run migrate
npm run seed:admin
npm run dev          # http://localhost:4000
npm run smoke
```

## 폴더 기준

- 새 화면: `src/pages/<domain>/`
- 공용 UI: `src/components/common/`
- 도메인 UI: `src/components/<domain>/`
- 프론트 API 바인딩: `src/integrations/api/`
- 프론트 비즈니스 로직: `src/lib/`
- 백엔드 라우트: `api/src/routes/`
- 백엔드 공용 로직: `api/src/lib/`
- DB 변경: `api/migrations/`
- 운영 스크립트: `api/scripts/`

## 아키텍처 규칙

1. 새 프론트 데이터 호출은 자체 API 클라이언트(`src/integrations/api/client.ts`)를 사용합니다.
2. 기존 Supabase 형식 호출을 유지해야 할 때만 `supabase-compat.ts`를 사용합니다.
3. 프론트에서 DB 또는 파일시스템에 직접 접근하지 않습니다.
4. 권한 검사는 UI 표시 제어만으로 끝내지 않고 백엔드 미들웨어에서도 수행합니다.
5. JOIN 응답은 허용 목록 기반 `expand` 처리 방식을 사용합니다.
6. DB 변경은 순번 SQL 마이그레이션으로 추가하고 기존 마이그레이션을 소급 수정하지 않습니다.
7. 새 환경변수를 추가하면 해당 `.env.example`과 README를 함께 수정합니다.

## 보안 규칙

- `.env`, `.env.local`, `api/.env`를 커밋하지 않습니다.
- DB 비밀번호, JWT secret, Supabase service-role key, API key를 코드·테스트·문서에 넣지 않습니다.
- 개인정보와 차량번호는 기존 마스킹 및 감사로그 모듈을 사용합니다.
- 사용자 입력은 Zod 등으로 검증하고 SQL 식별자·정렬 필드는 허용 목록으로 제한합니다.
- 파일 업로드는 파일명, 경로, 크기, MIME/확장자를 검증합니다.
- 사용자에게 원본 예외·SQL·스택 트레이스를 직접 노출하지 않습니다.

## 코드 스타일

- TypeScript에서 `any` 신규 사용을 피하고 `unknown`을 좁혀 사용합니다.
- React는 함수형 컴포넌트와 Hooks를 사용합니다.
- 서버 상태는 TanStack Query를 우선 사용합니다.
- 폼은 react-hook-form + Zod 패턴을 따릅니다.
- 스타일은 Tailwind와 기존 디자인 토큰을 사용합니다.
- 기존 한국어 UI와 용어를 유지합니다.

## 변경 완료 기준

변경 범위에 맞춰 아래를 수행합니다.

```bash
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm test -- --passWithNoTests
npm run build

cd api
npm run build
npm test -- --passWithNoTests
```

DB와 실행 서버가 필요한 변경은 추가로 `npm run smoke`를 수행하고, 실행하지 못했다면 PR에 그 사유를 명시합니다.

## 운영 관련 문서

- `README.md`: 설치·개발·검증 개요
- `MIGRATION_ANALYSIS.md`: Supabase에서 자체 PostgreSQL로 전환한 설계 배경
- `WINDOWS_운영매뉴얼.md`: Windows 서버 설치·운영 절차
- `docs/PROJECT_STATUS.md`: 현재 통합 범위와 남은 실제 환경 검증 항목
