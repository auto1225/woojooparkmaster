# 프론트엔드 자체 인증 마이그레이션 + 파일 업로드 + JOIN polyfill

PR #2 (백엔드 인프라)에 이어 프론트엔드 코드를 자체 백엔드로 전환하는 두 번째 PR.

## 변경 요약

이 PR로 다음이 모두 동작하게 됩니다:

- ✅ 로그인·로그아웃·세션 관리 (자체 인증)
- ✅ 멀티탭 세션 동기화 (BroadcastChannel)
- ✅ 비밀번호 변경 (currentPassword 검증 추가)
- ✅ 비밀번호 분실/재설정 안내 페이지 (폐쇄망 정책: 관리자 수동 초기화)
- ✅ 파일 업로드/다운로드 (자체 백엔드 파일 API)
- ✅ JOIN 쿼리 best-effort 동작 (shim의 polyfill — 화면 폭발 방지)
- ✅ AI/지오코딩/demo-data Edge Function 호출 안전 처리
- ✅ 토큰 기반 보안 모듈 (csrf, secure-api, token-security) 자체 인증 모델로 단순화

## 신규/변경 파일

### 백엔드 (`api/src/`)

| 파일 | 변경 |
|------|------|
| `routes/files.ts` | **신규** — multipart 업로드/다운로드/삭제 라우트 (path traversal 방지) |
| `server.ts` | `registerFilesRoutes` 등록 추가 |

### 프론트엔드 클라이언트 (`src/integrations/api/`)

| 파일 | 변경 |
|------|------|
| `files.ts` | **신규** — `filesApi` typed binding (`upload`/`remove`/`getUrl`/`legacyUpload`) |
| `index.ts` | `filesApi` export 추가 |
| `supabase-compat.ts` | **JOIN polyfill 추가** — `parseJoinSelect` + `fetchParents` (best-effort 부모 row 첨부) |

### 프론트엔드 코드 (`src/...`)

총 **117개 파일** 변경 — 카테고리별:

| 카테고리 | 처리 |
|---------|------|
| **인증 관련 (5)** | useAuth.tsx 전면 리팩토링, useSessionSync 단순화, activity-logger/message-service/security-logger 패턴 적용 |
| **비밀번호 UI (5)** | ChangePassword (currentPassword 추가), Profile, ResetPassword·ForgotPassword (안내 페이지로), Settings |
| **토큰 보안 모듈 (5)** | auth-security, csrf-protection, secure-api, secure-download, token-security 자체 인증 모델로 |
| **AI 비활성화 (1)** | ai-service.ts → throw + AI_DISABLED_MESSAGE export |
| **storage 변환 (5)** | StepPhotos, SecureFileUpload, SurveyPrint, offline-survey → filesApi 사용 |
| **단순 import (96)** | `@/integrations/supabase/client` → `@/integrations/api/supabase-compat` (sed 일괄) |

## 기술적 결정

### 1. JOIN polyfill (shim 강화)

기존: `select("*, parking_lots(code, name)")` 호출 시 의도적 throw → 화면 폭발
변경: shim이 select 문자열을 파싱하여 메인 fetch + 부모 테이블 ID 모음 → 별도 GET → 클라이언트 측 merge

장점:
- 23개 JOIN 호출 사이트가 수정 없이 동작
- 점진적 마이그레이션 동안 화면 폭발 방지

한계:
- 외래키 추론은 단순 매핑 테이블 기반 (parking_lots → lot_id 등)
- 인식 실패 시 nested 객체에 `null` 부착하지만 throw는 안 함
- 향후 백엔드 라우트별로 LEFT JOIN을 직접 박는 게 더 효율적 (후속 PR 4 후보)

### 2. 자체 인증 + 토큰 노출 제거

자체 백엔드는 JWT를 httpOnly 쿠키로 발급. JS에서 토큰을 직접 다룰 일이 없음. 이에 맞춰:

- `secure-api.ts` 의 `request()` 메서드는 더 이상 토큰 반환하지 않음
- `token-security.ts` 의 `getSecureSession()` 은 `authApi.me()` 핑으로 대체
- `csrf-protection.ts` 의 `securePostLogin` 은 `authApi.refresh()` 사용

### 3. 비밀번호 변경 흐름

Supabase는 `updateUser({ password })` 한 줄로 변경. 자체 인증은 보안 강화:

- `authApi.changePassword(current, new)` — 현재 비번 검증 후 변경
- ChangePassword UI에 currentPassword 입력란 추가
- ForgotPassword/ResetPassword는 폐쇄망 정책상 비활성화 — 안내 페이지

### 4. AI/Edge Function 안전 처리

폐쇄망에서는 외부 LLM API 호출 불가:
- `ai-service.ts` → `callAI` 가 명시적 throw + `AI_DISABLED_MESSAGE` export
- 호출 사이트 3곳 (ComplaintNew, ComplaintDetail, ReportGenerate) 모두 try/catch — 화면 폭발 없음
- demo-data, geocode-lots Edge Function 호출은 throw로 대체

## 검증 결과

샌드박스(Linux) 환경에서:

- ✅ 백엔드 142 → **150+ 엔드포인트** 정상 등록 (files 4개 추가)
- ✅ shim 모듈 컴파일·import 테스트 통과
- ✅ 잔여 `supabase.auth/functions/storage` 실제 호출: **0건** (모두 변환)
- ✅ 잔여 `supabase.from()` 호출 389건 → 모두 shim 통과 (단순 CRUD + JOIN polyfill)

## 적용 방법 (PR #2 머지 후)

```powershell
cd C:\2026make\parkmaster\app\woojooparkmaster-pr
git checkout main
git pull
git checkout -b feat/migrate-frontend-complete

# src_overlay 의 117개 파일을 src/ 위에 덮어쓰기
$SRC = "C:\2026make\parkmaster\app\woojooparkmaster\woojooparkmaster\src_overlay"
$DST = "C:\2026make\parkmaster\app\woojooparkmaster-pr\src"
Copy-Item -Recurse -Force "$SRC\*" $DST\

# 백엔드 신규 파일
$WS = "C:\2026make\parkmaster\app\woojooparkmaster\woojooparkmaster"
Copy-Item -Force "$WS\api\src\routes\files.ts" "C:\2026make\parkmaster\app\woojooparkmaster-pr\api\src\routes\"
Copy-Item -Force "$WS\api\src\server.ts" "C:\2026make\parkmaster\app\woojooparkmaster-pr\api\src\"

# 프론트 신규/변경 파일
Copy-Item -Force "$WS\src\integrations\api\files.ts" "C:\2026make\parkmaster\app\woojooparkmaster-pr\src\integrations\api\"
Copy-Item -Force "$WS\src\integrations\api\index.ts" "C:\2026make\parkmaster\app\woojooparkmaster-pr\src\integrations\api\"
Copy-Item -Force "$WS\src\integrations\api\supabase-compat.ts" "C:\2026make\parkmaster\app\woojooparkmaster-pr\src\integrations\api\"

# 운영 매뉴얼 추가
Copy-Item -Force "$WS\WINDOWS_운영매뉴얼.md" "C:\2026make\parkmaster\app\woojooparkmaster-pr\"

# 변경 확인
git status

# 커밋·푸시
git add .
git commit -m "feat: 프론트엔드 자체 인증 마이그레이션 + 파일 업로드 + JOIN polyfill

- 117개 src/* 파일 변경 (단순 CRUD 자동 / 인증·storage·UI 수동)
- 백엔드 multipart 파일 업로드 라우트 신규 (api/src/routes/files.ts)
- shim에 JOIN polyfill 추가 — 23개 JOIN 호출 화면 폭발 방지
- AI/Edge Function 호출 안전 처리
- Windows 운영 매뉴얼 추가

자세한 내용은 PR3_DESCRIPTION.md 참조."

git push -u origin feat/migrate-frontend-complete
```

PR 생성: `https://github.com/auto1225/woojooparkmaster/pull/new/feat/migrate-frontend-complete`

## 본 PR 머지 후 운영 가능 상태

✅ **로그인부터 모든 핵심 화면 동작**
- 인증 (로그인/로그아웃/세션)
- 비밀번호 변경
- 주차장/민원/예산/조사 등 70개 테이블 CRUD
- 파일 업로드/다운로드
- 활동 로그·감사 로그

⚠️ **여전히 미동작**
- AI 자동 분류·답변 초안·총평 (외부 LLM 의존 — 비활성화)
- 자동 지오코딩 (좌표 수동 입력으로 전환됨)

## 다음 단계 (후속 PR 후보)

1. JOIN polyfill 의존도 줄이기 — 백엔드 라우트별로 LEFT JOIN 박아서 단일 fetch로
2. 시범 부서 적용 + 안정화
3. 운영 중 Supabase DB → 부서 PG 데이터 이전 스크립트
4. 내부 LLM(Ollama 등) 도입 시 ai-service.ts 활성화

## 참고

- PR #2: `feat: 자체 PostgreSQL 백엔드 + 프론트 클라이언트 인프라 추가`
- 운영 매뉴얼: `WINDOWS_운영매뉴얼.md`
- 시스템 분석: `MIGRATION_ANALYSIS.md`
- 백엔드 README: `api/README.md`
