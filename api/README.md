# ParkMaster API Compatibility Server

이 폴더는 ParkMaster 프론트엔드의 `/api/*` 호출을 처리하기 위한 호환 서버 소스입니다. 과거 검토 문서나 DB dump와 달리, 현재 프론트 일부 기능이 이 경로를 기준으로 작성되어 있으므로 저장소에 유지합니다.

## 역할

- 인증, 프로필, 코드, 주차장, 민원, 시설, 수입 등 `/api/*` REST 엔드포인트 제공
- 파일 업로드/다운로드 호환 엔드포인트 제공
- 운영 환경에서 Supabase 또는 PostgreSQL 계층과 연결되는 서버 측 API 역할

## 보안 원칙

- 실제 `.env` 값, DB 비밀번호, JWT secret, service role key는 커밋하지 않습니다.
- 예시는 `api/.env.example`만 유지합니다.
- DB dump와 로컬 백업 파일은 `work/db-dumps/`, `backups/`, `deploy/backups/`에 두고 GitHub에는 올리지 않습니다.

## 실행 참고

이 API 서버를 별도로 실행해야 하는 환경에서는 `api/.env.example`을 기준으로 서버 환경 변수를 준비한 뒤 `api/package.json`의 스크립트를 사용합니다. 일반 프론트 개발은 저장소 루트의 `npm run dev`를 기준으로 합니다.
