# WOOJOO ParkMaster

공공기관 내부 존에서 사용하는 공영주차장 통합 운영관리 시스템입니다. 운영 데이터, 인증 정보, 첨부파일은 기관 내부의 Self-hosted Supabase에 저장하고 승인된 외부 서비스만 통제된 인터넷 경로로 사용합니다.

## 개발 실행

Node.js 22 이상과 Git이 필요합니다. 새 컴퓨터에서는 저장소를 복제하고 로컬 환경 파일을 만든 뒤 실행합니다.

```bash
git clone https://github.com/auto1225/woojooparkmaster.git
cd woojooparkmaster
npm ci
npm run dev
```

비공개 저장소의 `.env`에는 브라우저에 공개되는 Supabase URL, publishable key, 프로젝트 ID만 포함되어 있어 복제 후 바로 사용할 수 있습니다. `service_role` 키, 데이터베이스 비밀번호, 개인 액세스 토큰 같은 서버 비밀값은 `.env`에 추가하거나 Git에 커밋하지 않고 별도 보안 저장소에서 관리합니다. 운영 빌드는 환경값을 포함하지 않으며 컨테이너 시작 시 `/runtime-config.js`가 생성됩니다.

다른 컴퓨터에서 최신 변경사항을 받을 때는 작업 내용을 먼저 커밋한 뒤 `git pull --rebase origin main`을 실행합니다. 기능 수정은 별도 브랜치에서 진행하고 Pull Request로 `main`에 반영합니다.

## GitHub 자동 검증과 배포본

`main` 브랜치와 Pull Request는 GitHub Actions에서 의존성 설치, 린트, 전체 테스트, 프로덕션 빌드를 자동으로 검증합니다. 성공한 실행의 `parkmaster-web-*` 아티팩트에는 정적 웹 배포본이 포함됩니다. 확정 버전은 저장소의 Releases에서 소스와 웹 빌드 압축파일을 함께 내려받을 수 있습니다.

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
