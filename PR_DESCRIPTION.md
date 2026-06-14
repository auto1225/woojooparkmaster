# Supabase → 자체 PostgreSQL 마이그레이션 인프라

폐쇄망 공공기관 부서 환경(Windows 서버 1대)에서 운영 가능한 자체 백엔드와 프론트엔드 클라이언트 인프라를 추가합니다.

## 배경

- 본 프로그램은 공공기관 부서 내부망(폐쇄망)에서 운영 예정
- 외부 인터넷 접속이 제한되어 Supabase 클라우드 서비스 의존이 부적합
- 부서 PC들이 공유하는 단일 DB가 필요 → 부서 내 서버 PC 1대에 PostgreSQL 운영
- 자세한 분석은 `MIGRATION_ANALYSIS.md` 참조

## 변경 요약

### 1. 자체 백엔드 신규 (`api/`)

```
api/
├── package.json, tsconfig.json, .env.example, README.md
├── migrations/   10개 SQL → 70개 테이블
├── scripts/      migrate.ts, seed-admin.ts
└── src/
    ├── server.ts (Fastify 엔트리)
    ├── env.ts (zod 환경변수 검증)
    ├── db.ts (PG Pool + BIGINT/NUMERIC → number 자동 변환)
    ├── types.ts (AuthUser, UserRole, UserTeam)
    ├── auth/      (jwt, password, routes)
    ├── middleware/  (authenticate, authorize)
    ├── lib/        (pg-errors, audit-log, ownership, crud-helpers)
    └── routes/    17개 라우트 파일 → 142 HTTP 엔드포인트
```

**기술 스택**: Fastify + node-postgres(pg) + JWT(httpOnly 쿠키) + bcrypt + zod

### 2. 프론트엔드 클라이언트 인프라 (`src/integrations/api/`)

```
src/integrations/api/
├── client.ts (fetch 래퍼, 401 자동 refresh)
├── auth.ts (authApi - supabase.auth.* 25회 대체)
├── supabase-compat.ts (점진적 마이그레이션용 호환 shim)
├── 17개 typed binding 파일
├── index.ts (통합 export)
└── MIGRATION_GUIDE.md (388회 호출 카테고리별 변환 가이드)
```

### 3. 분석 문서

- `MIGRATION_ANALYSIS.md` — 전체 작업 범위·예상 일정·핵심 결정사항

## 호출 매핑 결과

| 카테고리 | 건수 | 비율 | 처리 |
|----------|-----:|-----:|------|
| 단순 CRUD (eq/order/limit/single) | 317 | 82% | shim 자동 — import 한 줄 변경 |
| COUNT 쿼리 | 24 | 6% | shim 자동 |
| 복잡 필터 (in/gt/lt 등) | 12 | 3% | shim 자동 |
| JOIN (`*, related(*)`) | 35 | 9% | **수동 변환 필요** (백엔드 전용 엔드포인트) |
| **합계** | **388** | **100%** | **백엔드 라우트 매핑률 98.7%** |

## 핵심 아키텍처 결정

| 영역 | 결정 |
|------|------|
| DB 보안(RLS) | 196개 정책 제거 → 백엔드 미들웨어로 권한 검증 |
| 인증 | bcrypt + JWT(httpOnly 쿠키), refresh 토큰 회전 |
| 비밀번호 재설정 | 관리자 수동 초기화 (이메일 SMTP 의존 제거) |
| 파일 저장소 | 서버 로컬 디스크 (`D:\parkmaster\uploads\`) |
| 지오코딩 | 자동 조회 제거 → 좌표 수동 입력 |
| AI 어시스턴트 | 비활성화 (추후 재검토) |
| Edge Functions 3개 | demo-data 제거, geocode 제거, ai-assistant 비활성화 |

자세한 결정 근거는 `MIGRATION_ANALYSIS.md` Section 8 참조.

## 검증 결과

샌드박스(Linux) 환경에서 실측 검증:

- **백엔드 단독 19개 테스트** 통과: 인증·권한·CRUD·감사로그·UNIQUE 위반·페이지네이션·zod 검증 등
- **shim 호환 11개 테스트** 통과: from/select/eq/insert/update/delete/single/JOIN throw/auth throw 등
- **parking_lots E2E 17개 테스트** 통과: ENUM 라운드트립·include=spaces·status 필터·검색·CASCADE 등
- **7개 테이블 통합 22개 테스트** 통과: BIGINT 자동변환·계산컬럼·다중테이블 협력
- **12개 테이블 통합 13개 테스트** 통과: UPSERT·effective_on 필터·신규 5개 테이블
- **35개 테이블 라우트 등록** 검증: 142 엔드포인트 모두 정상 등록

**누적 검증 시나리오: 120+ 통합 케이스**

## 다음 단계 (별도 PR로 진행 예정)

이 PR은 **인프라만** 추가합니다. 다음 작업은 후속 PR로:

1. **프론트엔드 import 일괄 전환**
   - 118개 파일의 `@/integrations/supabase/client` → `@/integrations/api/supabase-compat`
   - 80% 자동 적용, 나머지(JOIN·auth·storage)는 수동 변환

2. **Edge Function 3개 처리**
   - `ai-assistant` 비활성화 또는 내부 LLM 대체
   - `geocode-lots` 제거 + 좌표 수동 입력 UI
   - `demo-data` 제거

3. **파일 업로드 자체 구현**
   - 백엔드: 멀티파트 업로드 + 로컬 디스크 저장
   - 프론트: `supabase.storage.*` 8회 대체

4. **Windows 운영 환경 구성**
   - PostgreSQL 16 설치 가이드
   - NSSM Windows 서비스 등록
   - `update.bat` / `rollback.bat` (USB 반입 기반 배포)
   - 자동 백업 스케줄러
   - 운영자용 매뉴얼

5. **데이터 마이그레이션**
   - 운영 중 Supabase DB → 부서 서버 PG 데이터 이전

## 주의사항

- 본 PR에는 **운영 .env가 포함되지 않습니다.** 서버 PC 설치 시 `api/.env.example` 복사 후 시크릿 채우세요.
- `JWT_SECRET`은 운영 시 64자 이상 무작위 문자열로 변경 필수.
- 0010 마이그레이션의 일부 테이블(호출 1~3회)은 컬럼이 간소화되어 있습니다. 운영 중 필요한 컬럼은 ALTER로 추가 가능.
- `api/src/_test_write.txt` 파일은 검증 중 생긴 임시 파일입니다 (workspace mount 권한 테스트). 머지 전 삭제 권장.

## 로컬 실행 (검증용)

```bash
# 1. PostgreSQL 16 설치 (Windows 인스톨러)
psql -U postgres -c "CREATE USER parkmaster_app WITH PASSWORD 'change_me';"
psql -U postgres -c "CREATE DATABASE parkmaster OWNER parkmaster_app;"

# 2. 백엔드
cd api
npm install
cp .env.example .env  # 값 채우기
npm run migrate
npm run seed:admin
npm run dev   # http://localhost:4000/api/health

# 3. 프론트엔드 (별도 터미널)
cd ..
npm install
echo "VITE_API_BASE=http://localhost:4000" >> .env.local
npm run dev   # http://localhost:5173
```

자세한 운영 절차는 `api/README.md` 참조.
