# ParkMaster 백업·복구 운영서

## 백업 대상

- PostgreSQL 전체 논리 백업
- Supabase Storage 파일
- 공식 Supabase `.env`와 기관 TLS 인증서의 별도 보안 백업
- ParkMaster 소스 커밋 및 배포 설정 버전

비밀키와 인증서는 애플리케이션 데이터 백업과 분리해 기관 비밀관리 절차로 보관합니다.

## 암호화 키

```bash
sudo install -d -m 0700 /etc/parkmaster
sudo sh -c 'openssl rand -base64 48 > /etc/parkmaster/backup.key'
sudo chmod 0600 /etc/parkmaster/backup.key
```

키 파일은 백업 파일과 같은 저장소에 두지 않습니다. 키 분실 시 백업을 복구할 수 없습니다.

## 백업 실행

```bash
sudo PARKMASTER_RUNTIME_DIR=/opt/parkmaster/app/deploy/runtime \
  bash /opt/parkmaster/app/deploy/scripts/backup.sh
```

결과물은 기본적으로 `deploy/runtime/backups`에 생성되는 AES-256-CBC/PBKDF2 암호화 파일입니다. 생성 후 기관 백업 저장소로 이관하고 원본 서버 장애와 분리합니다. 기본 보존기간은 90일이며 기관 기록물 정책이 우선합니다.

## 복구훈련

복구는 운영 서버에서 바로 수행하지 않습니다. 분리된 복구훈련 서버에 같은 승인 버전의 Self-hosted Supabase를 설치한 뒤 다음 순서로 검증합니다.

1. 암호화 파일을 임시 디렉터리에 복호화한다.
2. `SHA256SUMS`로 DB와 Storage 파일 무결성을 확인한다.
3. 새 DB에 `pg_restore`로 복원한다.
4. Storage 파일을 새 Storage 볼륨에 복원한다.
5. 인증, 권한, 첨부파일, 민원, 수입, 보고서 핵심 표본을 확인한다.
6. 복구 소요시간과 데이터 시점을 기록하고 RTO/RPO 충족 여부를 승인받는다.
7. 임시 평문 파일을 기관 보안 삭제 절차로 제거한다.

분기 1회 이상 복구훈련을 권장하며 실제 주기는 기관의 업무연속성 및 기록물 지침으로 확정합니다.

## 장애 시 원칙

- 가장 최근 백업이라는 이유만으로 바로 복원하지 않고 무결성과 사고 시점을 확인합니다.
- 침해사고가 의심되면 로그와 원본 디스크를 보존하고 보안 담당자의 지시를 따릅니다.
- 복원 전 현재 상태를 별도로 보존합니다.
- 복구 완료 후 사용자 접근을 열기 전에 RLS, 관리자 계정, 외부 허용 목록을 재검증합니다.
