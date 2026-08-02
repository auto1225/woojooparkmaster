# WOOJOO ParkMaster

공공기관 내부 존에서 사용하는 공영주차장 통합 운영관리 시스템입니다. 운영 데이터, 인증 정보, 첨부파일은 기관 내부의 Self-hosted Supabase에 저장하고 승인된 외부 서비스만 통제된 인터넷 경로로 사용합니다.

## 개발 실행

Node.js 22 이상이 필요합니다.

```bash
npm ci
npm run dev
```

개발 환경은 `.env`의 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`를 사용합니다. 운영 빌드는 환경값을 포함하지 않으며 컨테이너 시작 시 `/runtime-config.js`가 생성됩니다.

## 기관 내부 존 배포

- 데이터베이스, 인증, 파일 저장소, Edge Functions: 기관 내부 서버
- 사용자 접속: 내부 DNS와 HTTPS를 통한 단일 주소
- 네이버 지도: 승인된 외부 통신 구간
- 외부 AI: 기본 차단, 보안 검토 후 승인 호스트만 허용
- Supabase Studio, Postgres, Kong: 서버의 loopback에만 바인딩

상세 절차는 [온프레미스 배포 가이드](docs/ON_PREMISES_DEPLOYMENT.md), [네트워크 허용 목록](docs/NETWORK_ALLOWLIST.md), [백업·복구 운영서](docs/BACKUP_RECOVERY_RUNBOOK.md)를 따릅니다.

## 품질 확인

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

운영 서버에서는 다음 검사를 추가로 실행합니다.

```bash
bash deploy/scripts/verify-onprem.sh
```
