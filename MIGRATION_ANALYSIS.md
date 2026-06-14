# 주차마스터 — Supabase → 자체 PostgreSQL 마이그레이션 분석 리포트

**분석 대상**: `auto1225/woojooparkmaster` (main 기준)
**분석일**: 2026-04-28
**목표 환경**: 공공기관 부서 내부망, Windows 서버 1대, 자체 ID/PW 인증

---

## 1. 한눈에 보는 현황

| 항목 | 수치 | 설명 |
|------|------|------|
| 프론트엔드 코드 파일 (Supabase 사용) | **118개** | src/ 하위 .ts/.tsx 중 supabase 임포트 파일 |
| `supabase.from()` (DB 쿼리) | **388회** | 단순 SELECT/INSERT/UPDATE/DELETE 호출 |
| `supabase.auth.*` (인증) | **25회** | 로그인·세션·비밀번호 변경 등 |
| `supabase.storage.*` (파일) | **8회** | 사진·첨부 업로드/다운로드 |
| `supabase.functions.invoke()` | **3회** | Edge Function 호출 |
| `supabase.channel/realtime` | **0회** | ✅ 실시간 동기화 미사용 — 큰 호재 |
| `supabase.rpc()` | **0회** | ✅ DB 함수 직접 호출 없음 |
| DB 마이그레이션 파일 | **36개 (4,340줄)** | `supabase/migrations/` 누적 |
| DB 테이블 | **70+개** | 본격 업무 시스템 규모 |
| RLS 정책 (보안) | **196개** | 🔴 가장 큰 작업 단위 |
| `auth.uid()` 호출 (DB 내부) | **192회** | 🔴 자체 인증으로 모두 교체 필요 |
| PostgreSQL 함수 | **73개** | 대부분 표준 PG, 일부만 손봐야 함 |
| 트리거 | **60개** | 표준 PG로 그대로 동작 |
| ENUM 타입 | **10개** | 표준 PG로 그대로 동작 |

---

## 2. 좋은 소식 (마이그레이션이 비교적 수월한 이유)

1. **실시간 동기화 미사용** — `supabase.channel` / `realtime`이 코드에 0회 등장. 자체 백엔드에서 가장 어려운 부분이 빠져있음
2. **표준 PostgreSQL 위주** — ENUM·JSONB·DECIMAL·TIMESTAMPTZ 등 표준 PG 기능만 사용. PostGIS 같은 외부 확장 없음
3. **Supabase 클라이언트 사용 패턴 일관됨** — 거의 모든 호출이 `supabase.from('테이블').select/insert/update/delete` 패턴이라 자동화 도구로 일괄 변환 가능
4. **Edge Function이 단 3개** — 그 중 2개는 인터넷 연결이 필요한 기능(AI, 지오코딩)이라 내부망에서는 어차피 빼야 할 가능성 높음

## 3. 나쁜 소식 (작업이 큰 이유)

### 3-1. RLS 정책 196개 + auth.uid() 192회

Supabase는 **DB 레벨에서 행 단위 보안(RLS)**을 적용합니다. 예시:
```sql
CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);  -- ← 이런 게 196개
```

자체 환경에서 두 가지 선택지:

| 방안 | 장점 | 단점 |
|------|------|------|
| **A. RLS 보존** (세션 변수로 user_id 주입) | 기존 보안 모델 그대로 | 백엔드가 매 요청마다 `SET LOCAL app.user_id = ...` 실행 필요. 디버깅 까다로움 |
| **B. RLS 제거 + 백엔드에서 검증** ⭐ 권장 | 단순·표준적, 디버깅 쉬움 | 백엔드 API 함수마다 권한 검사 코드 작성 필요 |

> **권장**: B안. 70개 테이블이지만 권한 패턴은 몇 가지로 정리 가능 (admin/manager/editor/viewer + 본인 데이터). 미들웨어 한 번 짜두면 재사용 가능.

### 3-2. profiles 테이블이 auth.users에 종속

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ...
)
```

→ 자체 `users` 테이블을 만들고 profiles의 FK를 거기로 변경 필요.

### 3-3. 비밀번호 재설정 이메일

`supabase.auth.resetPasswordForEmail(...)` 사용 중. 내부망에서는 이메일 발송 어려움.

**선택지:**
- **A.** 부서 메일서버(Exchange 등) SMTP 연동
- **B.** 관리자가 수동 초기화 (비밀번호를 임시값으로 재설정 후 첫 로그인 시 변경 강제) ⭐ 폐쇄망 표준

### 3-4. Edge Functions 3개

| 함수 | 역할 | 내부망 대응 |
|------|------|-------------|
| `ai-assistant` (127줄) | Lovable AI API 호출 — 민원 자동분류·답변 초안 | **외부 인터넷 필요. 내부망에서는 기능 제거 또는 사용자에게 메모만 자동 분류 비활성화** |
| `demo-data` (1,872줄) | 시연용 더미데이터 생성 | 운영 환경에서는 불필요. 제거 가능 |
| `geocode-lots` (317줄) | 네이버 지도 API로 주차장 좌표 자동 변환 | **외부 인터넷 필요. 좌표는 수동 입력으로 전환하거나 망연계로 일괄처리** |

## 4. 인증 코드 변경 범위 (25회)

자체 `/api/auth/*` 엔드포인트로 모두 교체:

| 기존 호출 | 새 엔드포인트 | 처리 |
|-----------|---------------|------|
| `signInWithPassword` | `POST /api/auth/login` | bcrypt 검증 → JWT 발급 (httpOnly 쿠키) |
| `signOut` | `POST /api/auth/logout` | 쿠키 삭제, refresh 토큰 무효화 |
| `getSession` / `getUser` | `GET /api/auth/me` | 쿠키 JWT 검증 → 사용자 정보 |
| `onAuthStateChange` | 클라이언트 상태로 대체 (React Context) | Supabase의 이벤트 모델 자체 구현 |
| `updateUser({ password })` | `POST /api/auth/change-password` | 현재 비번 확인 → 새 비번 해싱 |
| `resetPasswordForEmail` | `POST /api/auth/admin-reset` | (폐쇄망) 관리자 수동 초기화 |
| `refreshSession` | `POST /api/auth/refresh` | refresh 토큰으로 access 토큰 재발급 |

## 5. 파일 저장소 (Storage) 8회

`supabase.storage.from('survey-photos')` 등 → 서버 로컬 디스크로 변경.

| 기존 | 신규 |
|------|------|
| `bucket.upload(path, file)` | `POST /api/files` (multipart) → `D:\parkmaster\uploads\survey-photos\{년}\{월}\{uuid}.jpg` 저장 |
| `bucket.getPublicUrl(path)` | `GET /api/files/{id}` (백엔드가 인증 검증 후 파일 스트림 반환) |
| `bucket.remove([path])` | `DELETE /api/files/{id}` |

## 6. 작업량 추정

| 단계 | 예상 작업 | 비고 |
|------|-----------|------|
| 0. 설계·기반 마련 | 백엔드 뼈대(Fastify), DB 연결, JWT 인증, 미들웨어 | 가장 중요. 여기서 패턴 정해지면 이후 빨라짐 |
| 1. 마이그레이션 SQL 정리 | `auth.users` 의존성 제거, RLS 일괄 삭제 또는 보존 결정 | SQL 일괄 변환 스크립트 작성하면 빠름 |
| 2. `supabase.from()` 일괄 변환 | 388회 호출을 `apiClient.X`로 자동 변환 + 백엔드 API 388개 라우트 | **자동화 도구(codemod) 작성 필요**. 손으로 하면 한세월 |
| 3. Auth 25회 변환 + 백엔드 인증 모듈 | 자체 회원가입·로그인·비번관리 | 표준적 작업 |
| 4. Storage 8회 변환 + 파일 API | 업로드·다운로드·삭제 | 단순 |
| 5. Edge Function 처리 | AI/지오코딩 비활성화 또는 대체 | 의사결정 필요 |
| 6. 배포 자동화 | `update.bat`, `migrate.js`, NSSM 서비스 등록 | 1회성 |
| 7. 테스트 | 부서 시범 적용 → 피드백 → 안정화 | 가장 시간 많이 걸리는 구간 |

## 7. 권장 진행 순서 (단계별)

### Phase 0: 기반 (1주)
- 백엔드 프로젝트 구조 잡기 (Fastify + PostgreSQL + JWT)
- 자체 `users` 테이블 + 인증 모듈
- 작은 테이블 1개(`code_master`)로 end-to-end 테스트

### Phase 1: 핵심 모듈 마이그레이션 (3~4주)
- 주차장(`parking_lots`, `parking_spaces`)
- 사용자(`profiles`)
- 권한 모델 정착 (백엔드 미들웨어로 일관 처리)

### Phase 2: 부속 모듈 (3~4주)
- 민원, 예산, 조달, 보고서 등 나머지 페이지
- 자동 변환 codemod 적극 활용

### Phase 3: 부가 기능 처리 (1주)
- 파일 업로드
- 알림
- AI 어시스턴트 비활성화 (또는 대체)
- 지오코딩 → 수동 입력 UI

### Phase 4: 운영 준비 (1주)
- 배포 자동화 (`update.bat`, `rollback.bat`)
- 백업 스크립트
- 시범 부서 적용
- 사용자 매뉴얼

**총 예상**: 9~11주 (혼자 작업 기준, 풀타임)

## 8. 중요 의사결정 항목 (다음 단계에서 결정 필요)

1. **RLS 처리**: A안(보존) vs B안(제거+백엔드 검증) → **권장: B안**
2. **AI 어시스턴트 기능**: 내부망에서 제거 vs 외부 API 화이트리스트 시도
3. **지오코딩**: 수동 입력 vs 망연계 일괄 처리
4. **비밀번호 재설정**: 부서 SMTP 연동 vs 관리자 수동 초기화 → **권장: 후자**
5. **이메일 의존 기능 일반론**: 알림 메일 보내는 부분 어떻게 할지

## 9. 결론

이 시스템은 **공공기관용 본격 업무 프로그램** 규모이며, Supabase에서 자체 PostgreSQL로 옮기는 작업은 **결코 작지 않습니다.** 다만 다음 두 가지가 마이그레이션을 현실적으로 만듭니다:

1. **실시간 동기화·RPC를 안 써서** 가장 까다로운 부분이 없음
2. **호출 패턴이 일관돼서** 자동화 변환 도구로 388회 호출의 80% 이상은 기계적으로 처리 가능

다음으로 권장하는 작업은 **Phase 0 — 백엔드 뼈대**를 작은 프로토타입으로 만들어보는 것입니다. `code_master` 테이블 하나만 자체 백엔드로 옮겨서 패턴을 정착시키면, 이후 70개 테이블 작업은 같은 패턴 반복이 됩니다.
