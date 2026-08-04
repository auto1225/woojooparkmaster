# 주차마스터 자체 백엔드 (Phase 0 프로토타입)

`auto1225/woojooparkmaster`의 Supabase 의존성을 제거하고, 부서 내부망 폐쇄망 환경에서 동작하는 자체 백엔드 뼈대입니다.

## 폴더 구조

```
api/
├── src/
│   ├── server.ts              ← Fastify 엔트리
│   ├── env.ts                 ← .env 검증 (zod)
│   ├── db.ts                  ← pg Pool + withTransaction
│   ├── types.ts               ← AuthUser·UserRole·UserTeam
│   ├── auth/
│   │   ├── jwt.ts             ← JWT 등록·페이로드 빌드
│   │   ├── password.ts        ← bcrypt 해싱·검증
│   │   └── routes.ts          ← /api/auth/* 라우트 (login, refresh, me 등)
│   ├── middleware/
│   │   ├── authenticate.ts    ← JWT 검증 + req.authUser 부착
│   │   └── authorize.ts       ← requireRole / requireAdmin / requireEditor / requireManager
│   ├── lib/
│   │   ├── pg-errors.ts       ← PG 에러 코드 → ApiError 변환 (23505/23503 등 통일 처리)
│   │   ├── audit-log.ts       ← logActivity (CREATE/UPDATE/DELETE 자동 기록)
│   │   └── ownership.ts       ← ensureOwnership / ownershipFilter (행 단위 권한)
│   └── routes/
│       └── code-master.ts     ← end-to-end CRUD 패턴 (다른 테이블 복제용 기준)
├── migrations/
│   ├── 0001_init_users.sql    ← users + profiles + refresh_tokens + code_master
│   └── 0002_activity_logs.sql ← 감사 로그 테이블
├── scripts/
│   ├── migrate.ts             ← 마이그레이션 러너
│   └── seed-admin.ts          ← 초기 관리자 1명 생성
├── .env.example
├── package.json
└── tsconfig.json
```

## 로컬 실행 (개발 환경)

### 1. PostgreSQL 준비

```bash
# Windows에 PostgreSQL 16 설치 후
psql -U postgres
> CREATE USER parkmaster_app WITH PASSWORD 'change_me';
> CREATE DATABASE parkmaster OWNER parkmaster_app;
> \q
```

### 2. 의존성 설치

```bash
cd api
npm install
cp .env.example .env
# .env 파일 열어서 PG_*, JWT_SECRET, ADMIN_* 값 채울 것
```

### 3. 마이그레이션 + 관리자 시드

```bash
npm run migrate      # api/migrations/*.sql 순차 적용
npm run seed:admin   # .env의 ADMIN_EMAIL/PW로 관리자 1명 생성
```

### 4. 개발 서버 실행

```bash
npm run dev          # tsx watch로 자동 리로드
```

`http://localhost:4000/api/health` 확인:
```json
{ "ok": true, "db": true, "time": "..." }
```

### 5. 인증 동작 확인

```bash
# 로그인 (쿠키 발급)
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@parkmaster.local","password":"changeme1234"}' \
  -c cookies.txt

# 본인 정보 조회
curl http://localhost:4000/api/auth/me -b cookies.txt
```

## Phase 0의 의도

이 백엔드는 **단 하나의 테이블(`code_master`)만 자체 구현**하고, 나머지 70개 테이블은 추후 Phase 1·2에서 같은 패턴으로 복제할 예정입니다.

**복제 시 따를 패턴 (`src/routes/code-master.ts` 참고)**:

1. zod 스키마 3개 정의 (ListQuery, CreateBody, UpdateBody)
2. 5개 표준 엔드포인트 (GET 목록, GET 단건, POST, PATCH, DELETE)
3. 각 엔드포인트에 `app.authenticate` + 적절한 `requireXxx` 권한 미들웨어
4. SQL은 **반드시 parameterized query** (문자열 결합 절대 금지)
5. UNIQUE 제약 위반(코드 23505) 등 PG 에러는 의미 있는 메시지로 변환

## 운영 환경 배포 (Windows 서버)

상세 절차는 추후 Phase 4에서 `update.bat`/`rollback.bat`과 함께 정리. 핵심만 미리 메모:

1. **빌드**: 개발 PC에서 `npm run build` → `dist/` 생성
2. **이전**: `dist/` + `migrations/` + `package.json` + `node_modules/`(또는 서버에서 npm ci)를 USB로 서버 PC에 복사
3. **서비스 등록**: NSSM으로 `node dist/server.js`를 Windows 서비스로 등록
4. **재시작**: `nssm restart parkmaster-api`

## 보안 메모

- `JWT_SECRET`은 운영 시 64자 이상 무작위 문자열로 변경
- `ADMIN_PASSWORD`는 .env.example의 값을 절대 그대로 쓰지 말 것
- 관리자 계정은 첫 로그인 시 비밀번호 변경 강제 (`must_change_password` 플래그)
- 5회 연속 로그인 실패 시 15분 잠금
- refresh 토큰은 회전(rotation) 방식 — 사용 시 폐기 + 새 토큰 발급

## 다음 단계 (Phase 1)

다음 작업 차례:
1. `parking_lots`, `parking_spaces` 모듈 마이그레이션 (가장 핵심 도메인)
2. 프론트엔드 `src/integrations/supabase/client.ts` 대체용 `apiClient` 작성
3. `supabase.from()` 388회 호출을 자동 변환하는 codemod 작성
