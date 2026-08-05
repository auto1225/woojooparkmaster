# ParkMaster

제주시청 차량관리과 운영팀의 공영주차장 통합관리 프로그램입니다. 현재 소스의 기준 실행 구조는 **Vite React 프론트엔드 + Supabase 기반 데이터/파일 저장소 + `/api` 호환 계층** 입니다.

## 현재 기준

- 실행 앱: `src/` 기반 Vite React 애플리케이션
- 데이터: Supabase 프로젝트의 Auth, Postgres, Storage, Edge Functions
- API 호환 소스: `api/`
- 로컬 개발 서버: `npm run dev`
- 기본 접속 주소: `http://127.0.0.1:5173`
- 배포/운영 보조: `deploy/`, `supabase/`

현재 프로그램을 다른 컴퓨터에서 확인하거나 수정할 때는 이 저장소의 루트에서 아래 절차를 기준으로 작업합니다. 테스트 DB dump, 임시 빌드 산출물, 로컬 로그, 개인 환경 파일은 저장소에 포함하지 않습니다.

## 개발 실행

Node.js 22 이상과 Git이 필요합니다.

```bash
git clone https://github.com/auto1225/woojooparkmaster.git
cd woojooparkmaster
npm ci
npm run dev
```

브라우저에서 `http://127.0.0.1:5173`으로 접속합니다.

## 환경 변수

루트 `.env`에는 브라우저에서 사용 가능한 Supabase 공개 설정만 둡니다.

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
```

`service_role`, 데이터베이스 비밀번호, 개인 토큰, DB dump 파일은 GitHub에 올리지 않습니다. 운영 서버의 민감 정보는 Supabase 대시보드, 서버 환경 변수, 또는 별도 보안 저장소에서 관리합니다.

## GitHub에서 확인할 소스

- 프론트엔드 화면과 기능: `src/`
- `/api/*` 호환 서버 소스: `api/`
- Supabase 마이그레이션과 Edge Functions: `supabase/`
- 온프레미스/서버 실행 보조 스크립트: `deploy/`
- 한컴/PDF 보조 도구: `tools/`
- 검증 설정: `.github/workflows/ci.yml`, `vitest.config.ts`, `playwright.config.ts`

## 검증 명령

```bash
npx tsc --noEmit
npm test
npm run build
```

운영 서버 점검이 필요할 때는 서버 환경에 맞게 다음 스크립트를 실행합니다.

```bash
bash deploy/scripts/verify-onprem.sh
```
