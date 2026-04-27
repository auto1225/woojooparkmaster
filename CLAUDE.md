# CLAUDE.md

이 문서는 Claude Code / Claude Agent SDK / 기타 AI 코딩 어시스턴트가 이 레포에서 작업할 때 참고할 가이드입니다. 사람도 새로 합류할 때 함께 읽으면 좋습니다.

## 프로젝트 한 줄 정의

지자체용 주차장 통합 관리 SaaS — Vite + React + TypeScript + shadcn/ui + Tailwind 프론트엔드 + Supabase 백엔드. 자체 호스팅(deploy/) 가정.

## 핵심 명령어

```bash
npm install
npm run dev          # http://localhost:8080
npm run build
npm run lint
npm test             # vitest run
```

테스트 한 파일만:
```bash
npm test -- src/test/example.test.ts
```

## 폴더 컨벤션

- **새 페이지** → `src/pages/<도메인>/<PageName>.tsx` 에 추가하고 `src/App.tsx` 라우팅에 등록
- **공통 UI** → `src/components/common/` (도메인 무관) / `src/components/<도메인>/` (도메인 전용)
- **shadcn/ui primitive 추가** → `src/components/ui/` (npx shadcn add <name>)
- **비즈니스 로직** → `src/lib/<주제>.ts` (보안: `*-security.ts`, 마스킹: `*-masking.ts`)
- **Hooks** → `src/hooks/use*.ts(x)` (camelCase 파일명)
- **타입** → `src/types/<도메인>.ts` 에 도메인별로 분리

## 임포트 별칭

`@/` → `src/` (vite.config.ts 의 alias). 항상 `@/components/...`, `@/lib/...` 형태로 import.

## 도메인 용어집 (한↔영)

| 한국어 | 영문/코드 | 비고 |
|--------|-----------|------|
| 주차장 | Lot | `pages/Lots.tsx`, `LotDetail`, `LotEdit`, `LotNew` |
| 실태 조사 | Survey | 마법사 형태 — `pages/SurveyWizard.tsx`, `components/survey/Step*.tsx` |
| 결재 / 결재선 | Approval / Approval Line | `pages/Approvals.tsx`, `lib/approval-service.ts`, `settings/ApprovalLineManagement` |
| 마스터 데이터 | Master Data | `pages/MasterHub`, `DynamicMasterView`, `lib/master-excel-export.ts` |
| 실시간(IoT) | Realtime | 센서, 게이트웨이, 표시기 — `pages/realtime/` |
| 단속 | Enforcement | `pages/ops/OpsEnforcement.tsx` |
| 면제/감면 | Exemption | `pages/ops/OpsExemptions.tsx` |
| 무료 시간 | Free hours | `pages/ops/OpsFreeHours.tsx` |
| 시설 점검 | Safety Inspection | `pages/facility/FacilitySafety.tsx` |
| 노면표시 | Surface Marking | `pages/facility/FacilityMarkings.tsx` |
| 정산 | Reconcile | `pages/revenue/RevenueReconcile.tsx` |
| 알림톡 | Alimtalk | 카카오 비즈니스 알림 |

## 보안 — 반드시 지킬 것

이 프로젝트는 PII(주민번호, 차량번호, 전화번호, 사업자번호 등)를 다룹니다.

- **PII는 항상 마스킹 후 표시** — `src/components/security/MaskedField.tsx`, `usePIIMasking` 훅 사용
- **파일 업로드** → `SecureFileUpload` 컴포넌트만 사용 (확장자/크기/매직넘버 검증)
- **다운로드** → `lib/secure-download.ts` 의 헬퍼 사용
- **외부 입력 렌더** → `lib/sanitizer.ts` (DOMPurify 래퍼) 통과 후
- **에러 메시지** → 사용자에게 raw error 노출 금지. `lib/error-sanitizer.ts` 사용
- **DB 직접 호출 지양** → `lib/safe-supabase.ts` 의 안전 래퍼 우선
- **새 입력 폼** → 반드시 Zod 스키마 검증 + react-hook-form

## 코딩 스타일

- TypeScript strict 모드 가정. `any` 지양. 모르겠으면 `unknown` 후 narrow.
- 함수형 컴포넌트 + Hooks. 클래스 컴포넌트 신규 작성 금지.
- 상태 관리: 서버 상태는 **TanStack Query**, 클라이언트 상태는 **로컬 state + Context 최소화**.
- 폼: **react-hook-form + Zod resolver** 패턴 (예시는 기존 `pages/LotNew.tsx`).
- 스타일: **Tailwind 유틸리티만**. 새 디자인 토큰은 `tailwind.config.ts` 확장.
- 색상은 디자인 토큰(`bg-primary`, `text-muted-foreground` 등) 사용. 임의 hex 지양.
- 한국어 UI 문자열은 `src/locales/ko.json` 에 키로 등록 후 `t('key')` 사용.

## 변경 시 체크리스트

새 PR 올리기 전:

1. `npm run lint` — 0 error
2. `npm test` — 모두 pass
3. `npm run build` — 성공
4. RLS 영향 범위가 있는 변경이면 마이그레이션 작성 + types.ts 재생성
5. 새 환경변수가 필요하면 `.env.example` 도 같이 업데이트

## DB 마이그레이션

`supabase/migrations/` 에 `<timestamp>_<slug>.sql` 형식으로 추가. RLS 정책 누락에 특히 주의. 변경 후:

```bash
supabase db push
supabase gen types typescript --project-id <PROJECT_ID> > src/integrations/supabase/types.ts
```

## 자주 하는 함정

- `.env` 를 절대 커밋하지 말 것 — `.env.local` 사용
- shadcn/ui 컴포넌트는 직접 수정해도 됨 (vendored). 단, 직접 수정한 파일은 PR 본문에 명시
- Supabase Edge Function 수정 후 `supabase functions deploy <name>` 잊지 말 것
- 차트 색상은 `lib/chart-config.tsx` 의 팔레트 사용 — recharts 기본 색 직접 지정 금지
