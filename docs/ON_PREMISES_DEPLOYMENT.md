# ParkMaster 내부 존 배포 가이드

## 1. 확정 아키텍처

ParkMaster는 기관 내부의 Linux 서버에 설치합니다. 사용자 PC는 내부 DNS의 HTTPS 주소로만 접속하며 브라우저에서 Supabase 클라우드로 직접 통신하지 않습니다. 애플리케이션 Nginx가 같은 Docker 네트워크의 Self-hosted Supabase Kong으로 API를 중계합니다.

Self-hosted Supabase는 하나의 독립 프로젝트이므로 ParkMaster 전용 DB, 인증, 저장소를 제공합니다. 서버 운영, 보안 패치, 백업, 복구, 모니터링은 기관 운영 조직의 책임입니다. 기준 구성은 공식 Supabase 저장소의 커밋 `4c8ed105d2676b5ba4612b735fbdcf735fc30bcc`로 고정했습니다.

공식 참고 자료:

- https://supabase.com/docs/guides/self-hosting
- https://supabase.com/docs/guides/self-hosting/docker

## 2. 서버 요구사항

- Linux 서버, Docker Engine, Docker Compose v2, Git, OpenSSL, curl, jq
- 최소 4 CPU, 8 GB RAM, 80 GB SSD. 실제 저장공간은 첨부파일과 백업 보존기간으로 산정
- 내부 DNS 이름과 기관 인증서
- 운영 서버와 분리된 암호화 백업 저장소
- 내부 NTP, DNS, SMTP가 필요하면 기관 서비스 주소 사용

## 3. 설치 설정

저장소를 `/opt/parkmaster/app`에 배치했다고 가정합니다. 설치 설정은 Git 외부에 두고 권한을 제한합니다.

```bash
sudo install -d -m 0700 /etc/parkmaster
sudo cp deploy/.env.template /etc/parkmaster/install.env
sudo chmod 0600 /etc/parkmaster/install.env
sudo editor /etc/parkmaster/install.env
```

반드시 설정할 항목:

- `PARKMASTER_HOSTNAME`: 내부 DNS 이름
- `PARKMASTER_INTERNAL_CIDR`: 사용자 내부망 대역
- `PARKMASTER_MANAGEMENT_CIDR`: 관리자 접속 대역
- `NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET`: 기관용 Naver Maps 자격증명
- `BACKUP_ENCRYPTION_KEY_FILE`: root만 읽을 수 있는 백업 암호화 키 파일

기관 인증서를 다음 위치에 설치합니다.

```text
deploy/runtime/tls/cert.pem
deploy/runtime/tls/key.pem
```

설치 및 마이그레이션:

```bash
sudo PARKMASTER_CONFIG_FILE=/etc/parkmaster/install.env \
  bash deploy/scripts/setup.sh
```

이 명령은 공식 Self-hosted Supabase 구성을 고정 커밋으로 준비하고, 비밀키를 생성하고, ParkMaster 컨테이너를 빌드한 뒤 모든 DB 마이그레이션을 순서대로 한 번만 적용합니다.

### 3.1 2025 제주시 유료 공영주차장 기준자료 교체

신규 설치에는 2025년 12월 완료보고서에서 검증한 112개 주차장이 자동으로 등록됩니다. 기존 운영 DB를 이 기준자료로 교체할 때는 주차장에 종속된 현황조사, 시설, 민원, 수입, 실시간 장비 등의 행도 함께 초기화됩니다. 인증 계정, 사용자 프로필, 시스템 설정, 코드표와 모듈 라이선스는 유지됩니다.

운영 DB에서는 먼저 암호화 백업을 생성한 후 명시적인 확인값으로 마이그레이션을 실행합니다.

```bash
sudo PARKMASTER_CONFIG_FILE=/etc/parkmaster/install.env \
  bash deploy/scripts/backup.sh

sudo PARKMASTER_CONFIG_FILE=/etc/parkmaster/install.env \
  PARKMASTER_CONFIRM_JEJU_REBUILD=JEJU_2025_112 \
  bash deploy/scripts/migrate.sh
```

기준 원본의 SHA-256은 `6898406b5411d78c6e7422b85fb7686e779420d5b3311ea2ea7acecfcc349b1f`입니다. 추출 결과와 보고서 내 상충 수치는 `supabase/seed_data/jeju_paid_parking_2025.json`에 보존됩니다.

보고서에는 위도·경도가 없으므로 임의 좌표를 넣지 않습니다. 마이그레이션 후 관리자 계정으로 `설정 > 일반 > 주소→좌표 변환`을 실행하면 등록된 지번주소를 네이버 지도 Geocoding API로 변환하고, 성공·실패 건수를 감사 로그에 기록합니다.

## 4. 최초 관리자

공개 회원가입은 비활성화됩니다. 서버 관리자만 loopback의 Auth 관리 API를 통해 계정을 생성합니다.

```bash
sudo ADMIN_EMAIL=admin@agency.go.kr \
  PARKMASTER_RUNTIME_DIR=/opt/parkmaster/app/deploy/runtime \
  bash deploy/scripts/create-admin.sh
```

비밀번호는 프롬프트로 입력하고 쉘 기록이나 설정 파일에 남기지 않습니다. 이후 일반 사용자는 ParkMaster 관리자 화면의 승인된 절차로 발급합니다.

## 5. 네트워크와 외부 연동

`deploy/scripts/setup-firewall.sh`는 80/443을 내부 대역에만 열고 DB, Kong, Supabase Studio 포트의 외부 접근을 차단합니다. 기관 경계 방화벽의 FQDN 허용 목록은 [NETWORK_ALLOWLIST.md](NETWORK_ALLOWLIST.md)를 적용합니다.

네이버 지도 Client ID에는 실제 내부 HTTPS Origin을 등록해야 합니다. 지도 장애가 발생해도 목록, 민원, 시설, 수입 등 비지도 업무는 계속 사용할 수 있습니다.

AI는 `AI_ENABLED=false`가 기본입니다. 승인 후에도 브라우저가 외부 AI를 직접 호출하지 않으며 Edge Function이 `AI_ALLOWED_HOSTS`에 등록된 정확한 호스트만 호출합니다. 개인정보와 민원 원문 반출 여부는 별도의 기관 보안·개인정보 검토가 필요합니다.

## 6. 운영 점검

```bash
sudo PARKMASTER_RUNTIME_DIR=/opt/parkmaster/app/deploy/runtime \
  bash deploy/scripts/verify-onprem.sh
```

배포 완료 조건:

1. 모든 컨테이너가 healthy 상태다.
2. 내부 HTTPS 주소에서 로그인과 주요 업무가 가능하다.
3. 5432, 6543, 8000, 8443 포트는 외부 인터페이스에 노출되지 않는다.
4. Naver Maps만 승인된 외부 경로로 통신한다.
5. 암호화 백업과 별도 복구훈련이 성공한다.
6. 기관 보안 담당자가 방화벽, 인증서, 계정, 로그, 백업 설정을 승인한다.

## 7. 업데이트

운영 중 임의로 Docker 이미지 태그를 올리지 않습니다. 테스트 존에서 새 Supabase 공식 구성을 검증한 뒤 `SUPABASE_GIT_REF`를 새 승인 커밋으로 변경합니다. DB 및 파일 백업을 먼저 생성하고 유지보수 시간에 업데이트합니다.
