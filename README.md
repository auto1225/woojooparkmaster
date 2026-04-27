# WOOJOO ParkMaster

지자체용 주차장 통합 관리 SaaS. 주차장 마스터 데이터, 실태 조사(Survey), 실시간 점유율 모니터링, 운영(요금/면제/단속), 시설 관리, 민원, 예산/수익, 결재선, 리포트까지 12개 업무 도메인을 한 시스템에서 처리합니다.

## 기술 스택

| 영역 | 선택 |
|------|------|
| Frontend | Vite 5 + React 18 + TypeScript 5 |
| UI | shadcn/ui + Radix UI + Tailwind CSS 3 |
| 상태/데이터 | TanStack Query + Zod + react-hook-form |
| Backend | Supabase (Auth + Postgres + Storage + Realtime + Edge Functions) |
| i18n | i18next (ko 단일 로케일 — 다국어 확장 가능) |
| 차트/리포트 | recharts + exceljs/xlsx |
| 테스트 | Vitest + Testing Library + Playwright |
| 배포 | Docker Compose (자체 호스팅) — `deploy/` 참조 |

## 프로젝트 구조

```
src/
  pages/          # 페이지 (도메인별 서브폴더 — budget/, complaint/, facility/, ops/,
                  #         planning/, procurement/, realtime/, report/, revenue/,
                  #         service/, settings/, admin/)
  components/     # 공용 컴포넌트
    ui/           # shadcn/ui primitives
    common/       # 도메인 무관 공용 (KPICard, ExcelImport, GlobalSearch 등)
    survey/       # 조사 마법사 단계
    facility/     # 시설 도메인 시트
    security/     # PII 마스킹·파일 보안 UI
  lib/            # 비즈니스 로직 / 보안 / 유틸 (39개 모듈)
  hooks/          # React hooks (useAuth, usePIIMasking 등)
  integrations/   # Supabase 클라이언트 + 자동 생성 타입
  types/          # 도메인 타입 정의
  locales/        # i18next 번역 리소스
supabase/
  migrations/     # 36개 SQL 마이그레이션
  functions/      # Edge Functions (ai-assistant, demo-data, geocode-lots)
deploy/           # Docker Compose 자체 호스팅 스택
```

## 로컬 개발

요구사항: Node.js 20+, npm.

```bash
git clone https://github.com/auto1225/woojooparkmaster.git
cd woojooparkmaster
npm install
cp .env.example .env.local   # 그리고 실제 키 입력
npm run dev                  # http://localhost:8080
```

### 자주 쓰는 스크립트

```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
npm run preview      # 빌드 결과 로컬 프리뷰
npm run lint         # ESLint
npm test             # Vitest 1회 실행
npm run test:watch   # Vitest watch 모드
```

## Supabase 연동

`src/integrations/supabase/client.ts` 가 환경변수(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`)를 사용합니다. DB 스키마 변경 후에는:

```bash
# Supabase CLI 사용 시
supabase gen types typescript --project-id <PROJECT_ID> > src/integrations/supabase/types.ts
```

## 배포

`deploy/` 디렉토리에 self-hosted Supabase + Kong + nginx + frontend 풀 스택 docker-compose가 포함되어 있습니다. 자세한 배포 절차는 `deploy/scripts/setup.sh` 와 `deploy/.env.template` 참조.

## 보안

이 프로젝트는 행정 시스템 수준의 보안 모듈을 포함합니다 — PII 마스킹, CSRF/봇 방어, 파일 업로드 검증, 세션 핑거프린트, 비밀번호 정책, XSS 방어(DOMPurify), 활동 감사 로그. 자세한 항목은 `src/lib/`의 `*-security.ts`, `*-protection.ts`, `pii-masking.ts` 참조.

## 라이선스

내부 프로젝트 — 별도 라이선스 미부여.
