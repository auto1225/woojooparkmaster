# 주차마스터 Windows 운영 매뉴얼

부서 서버 PC 1대에 PostgreSQL + Node.js 백엔드 + nginx + 프론트엔드 정적 파일을 올려 폐쇄망에서 운영하는 절차.

> **대상 독자**: 부서 IT 담당자 (운영 관리자)

---

## 1. 서버 PC 사양 권장

| 항목 | 권장 |
|------|------|
| OS | Windows Server 2022 또는 Windows 10/11 (64-bit) |
| CPU | 4코어 이상 |
| RAM | 8 GB 이상 |
| 디스크 | SSD 256 GB (OS 별도, DB·업로드용 100 GB 여유) |
| 네트워크 | 고정 IP 1개 + 부서 LAN 접근 가능 |

---

## 2. 사전 준비 — 설치 매체

USB에 다음 파일을 미리 받아오기 (외부 인터넷 가능한 PC에서):

| 파일 | 다운로드 위치 |
|------|---------------|
| `postgresql-16.x-x64.exe` | https://www.enterprisedb.com/downloads/postgres-postgresql-downloads (Windows x86-64) |
| `node-v20.x.x-x64.msi` | https://nodejs.org/ko/download (LTS, Windows Installer) |
| `nssm-2.24.zip` | https://nssm.cc/download |
| `nginx-1.x.x.zip` | https://nginx.org/en/download.html (Windows 버전, mainline 또는 stable) |
| 주차마스터 소스 | GitHub `auto1225/woojooparkmaster` 의 `main` 브랜치 ZIP |

---

## 3. 설치 절차

### 3-1. PostgreSQL 16 설치

1. `postgresql-16.x-x64.exe` 실행 → 다음 옵션
   - 설치 위치: `C:\Program Files\PostgreSQL\16`
   - 데이터 위치: `D:\parkmaster\pgdata` (별도 드라이브 권장)
   - 비밀번호: postgres 슈퍼유저 비번 (메모해두기)
   - 포트: `5432` (기본)
   - 로케일: `Korean, Korea`
2. Stack Builder는 건너뜀
3. 설치 후 PowerShell에서 동작 확인:
   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "SELECT version();"
   ```

### 3-2. 애플리케이션용 DB·계정 생성

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"

psql -U postgres -c "CREATE USER parkmaster_app WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';"
psql -U postgres -c "CREATE DATABASE parkmaster OWNER parkmaster_app ENCODING 'UTF8' TEMPLATE template0;"
psql -U postgres -d parkmaster -c "GRANT ALL ON SCHEMA public TO parkmaster_app;"
```

### 3-3. Node.js 20 LTS 설치

1. `node-v20.x.x-x64.msi` 실행 → 기본 옵션 그대로
2. 설치 후 확인:
   ```powershell
   node --version    # v20.x
   npm --version     # 10.x
   ```

### 3-4. 주차마스터 소스 배치

```powershell
mkdir D:\parkmaster
cd D:\parkmaster

# GitHub에서 받은 ZIP을 D:\parkmaster\src 로 풀기
# 결과 구조:
# D:\parkmaster\src\
#   ├── api\
#   ├── src\
#   ├── package.json
#   └── ...
```

### 3-5. 백엔드 설정 + 마이그레이션

```powershell
cd D:\parkmaster\src\api

# 의존성 설치
npm install

# .env 파일 작성
@"
NODE_ENV=production
PORT=4000
HOST=127.0.0.1

PG_HOST=127.0.0.1
PG_PORT=5432
PG_DATABASE=parkmaster
PG_USER=parkmaster_app
PG_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# 64자 이상 무작위 문자열로 변경 필수
JWT_SECRET=$(([guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()) -replace '-')

JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

COOKIE_SECURE=false
CORS_ORIGIN=http://localhost

UPLOAD_DIR=D:\parkmaster\uploads
MAX_UPLOAD_SIZE_MB=20

ADMIN_EMAIL=admin@parkmaster.local
ADMIN_PASSWORD=changeme1234
ADMIN_NAME=시스템관리자
"@ | Out-File .env -Encoding utf8

# 업로드 디렉토리 생성
mkdir D:\parkmaster\uploads

# 마이그레이션 실행 (10개 SQL 적용 → 70개 테이블 생성)
npm run migrate

# 초기 관리자 계정 생성
npm run seed:admin
```

> ⚠️ **`.env` 보안**: `.env` 파일은 절대 Git에 커밋 금지. 서버 PC 파일 권한도 administrators만 읽도록 설정 권장.

### 3-6. 백엔드 빌드

```powershell
cd D:\parkmaster\src\api
npm run build
# → D:\parkmaster\src\api\dist\ 생성됨
```

### 3-7. 프론트엔드 빌드 + 정적 파일 배치

```powershell
cd D:\parkmaster\src

# 의존성 설치
npm install

# 환경변수: 백엔드 주소 (같은 PC면 비워두면 됨, nginx가 프록시)
@"
VITE_API_BASE=
"@ | Out-File .env.local -Encoding utf8

npm run build
# → D:\parkmaster\src\dist\ 생성됨

# 정적 파일을 nginx가 서빙할 위치로 복사
xcopy /E /Y D:\parkmaster\src\dist D:\parkmaster\app\
```

### 3-8. nginx 설정

`nginx-1.x.x.zip` 을 `D:\parkmaster\nginx\` 에 풀기. `D:\parkmaster\nginx\conf\nginx.conf` 를 다음 내용으로:

```nginx
worker_processes  1;

events { worker_connections 1024; }

http {
  include       mime.types;
  default_type  application/octet-stream;
  sendfile      on;
  client_max_body_size 25M;

  server {
    listen 80;
    server_name _;

    # 정적 파일 (프론트엔드)
    root D:/parkmaster/app;
    index index.html;

    # SPA 라우팅
    location / {
      try_files $uri $uri/ /index.html;
    }

    # 백엔드 API 프록시
    location /api/ {
      proxy_pass http://127.0.0.1:4000;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_pass_request_headers on;
      proxy_pass_request_body on;
    }
  }
}
```

### 3-9. NSSM으로 Windows 서비스 등록

`nssm-2.24.zip` 을 `D:\parkmaster\nssm\` 에 풀고 `nssm.exe` 위치 확인 (`win64\nssm.exe`).

```powershell
$NSSM = "D:\parkmaster\nssm\win64\nssm.exe"

# 1) 백엔드 서비스
& $NSSM install parkmaster-api "C:\Program Files\nodejs\node.exe" "D:\parkmaster\src\api\dist\server.js"
& $NSSM set parkmaster-api AppDirectory D:\parkmaster\src\api
& $NSSM set parkmaster-api Start SERVICE_AUTO_START
& $NSSM set parkmaster-api AppStdout D:\parkmaster\logs\api-stdout.log
& $NSSM set parkmaster-api AppStderr D:\parkmaster\logs\api-stderr.log
& $NSSM set parkmaster-api AppRotateFiles 1
& $NSSM set parkmaster-api AppRotateBytes 10485760
mkdir D:\parkmaster\logs -ErrorAction SilentlyContinue
& $NSSM start parkmaster-api

# 2) nginx 서비스
& $NSSM install parkmaster-web "D:\parkmaster\nginx\nginx.exe"
& $NSSM set parkmaster-web AppDirectory D:\parkmaster\nginx
& $NSSM set parkmaster-web Start SERVICE_AUTO_START
& $NSSM start parkmaster-web

# 동작 확인
Start-Sleep -Seconds 3
Invoke-WebRequest http://127.0.0.1/api/health
```

`{"ok":true,"db":true,...}` 가 나오면 성공.

### 3-10. 부서 PC들에서 접속 테스트

부서원 PC에서 Chrome/Edge로:

```
http://<서버 PC IP>/
```

로그인 화면이 뜨면 OK.

초기 관리자 로그인 (`.env`의 `ADMIN_EMAIL` / `ADMIN_PASSWORD`) → 강제 비밀번호 변경 페이지로 이동 → 새 비번 설정 → 메인 화면.

---

## 4. 배포 자동화 (update.bat / rollback.bat)

향후 코드 업데이트 시 USB로 새 버전 ZIP을 받아 한 번에 적용.

`D:\parkmaster\deploy\update.bat`:

```bat
@echo off
setlocal
set ROOT=D:\parkmaster
set TS=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%
set TS=%TS: =0%

echo === 1. 현재 버전 백업 ===
xcopy /E /I /Q %ROOT%\src %ROOT%\backups\src_%TS%
"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U parkmaster_app -h 127.0.0.1 parkmaster > %ROOT%\backups\db_%TS%.sql

echo === 2. 새 버전 압축 해제 (USB의 update.zip 가정) ===
REM 사용자가 update.zip을 D:\parkmaster\incoming\에 둔 상태
PowerShell -Command "Expand-Archive -Path 'D:\parkmaster\incoming\update.zip' -DestinationPath 'D:\parkmaster\src' -Force"

echo === 3. 백엔드 빌드 + 마이그레이션 ===
cd %ROOT%\src\api
call npm install --omit=dev
call npm run build
call npm run migrate

echo === 4. 프론트엔드 빌드 + 정적 파일 교체 ===
cd %ROOT%\src
call npm install
call npm run build
xcopy /E /Y %ROOT%\src\dist %ROOT%\app\

echo === 5. 백엔드 재시작 ===
%ROOT%\nssm\win64\nssm.exe restart parkmaster-api

echo === 6. nginx reload ===
%ROOT%\nginx\nginx.exe -s reload

echo 업데이트 완료! 백업: backups\src_%TS%, db_%TS%.sql
endlocal
```

`D:\parkmaster\deploy\rollback.bat`:

```bat
@echo off
setlocal
set ROOT=D:\parkmaster

echo 사용 가능한 백업:
dir /B /AD %ROOT%\backups | findstr "src_"

set /p VER="복구할 버전 (예: src_20260501_103022): "

xcopy /E /Y %ROOT%\backups\%VER% %ROOT%\src\
%ROOT%\nssm\win64\nssm.exe restart parkmaster-api
%ROOT%\nginx\nginx.exe -s reload

echo 롤백 완료. DB 롤백이 필요하면 backups\db_*.sql 을 수동으로 psql로 복원.
endlocal
```

---

## 5. 자동 백업 (Windows 작업 스케줄러)

매일 새벽 3시 DB 덤프:

```powershell
# 작업 스크립트
@"
@echo off
set ROOT=D:\parkmaster
set TS=%date:~0,4%%date:~5,2%%date:~8,2%
'C:\Program Files\PostgreSQL\16\bin\pg_dump.exe' -U parkmaster_app -h 127.0.0.1 parkmaster > %ROOT%\backups\daily\db_%TS%.sql

REM 30일 이상 백업 삭제
forfiles /P %ROOT%\backups\daily /M *.sql /D -30 /C "cmd /c del @path" 2>nul
"@ | Out-File D:\parkmaster\deploy\daily-backup.bat -Encoding ASCII

# 작업 등록
$action = New-ScheduledTaskAction -Execute "D:\parkmaster\deploy\daily-backup.bat"
$trigger = New-ScheduledTaskTrigger -Daily -At 3am
Register-ScheduledTask -TaskName "ParkmasterDailyBackup" -Action $action -Trigger $trigger -RunLevel Highest
```

---

## 6. 운영자 일상 점검 체크리스트

### 매일

- [ ] 서버 PC 로그인 후 `services.msc` 에서 `parkmaster-api`, `parkmaster-web` 가 "실행 중"인지
- [ ] `D:\parkmaster\backups\daily\` 에 어제 자 백업 파일 (`db_YYYYMMDD.sql`) 존재 확인
- [ ] `D:\parkmaster\logs\api-stderr.log` 에 새 에러가 쌓이지 않는지

### 매주

- [ ] 디스크 여유 공간 (`D:\` 50% 이상 권장)
- [ ] nginx 로그 (`D:\parkmaster\nginx\logs\error.log`) 검토
- [ ] 부서원 직원 디렉토리 갱신 (퇴직자 비활성화 등)

### 매월

- [ ] 백업 파일을 외부 저장소(부서 NAS 등)로 별도 복사
- [ ] PostgreSQL `VACUUM ANALYZE`:
  ```powershell
  psql -U postgres -d parkmaster -c "VACUUM ANALYZE;"
  ```

---

## 7. 트러블슈팅

### 로그인 안 됨

1. `Invoke-WebRequest http://127.0.0.1/api/health` 응답 확인 → `{ ok: true, db: true }` 인지
2. `db: false` 나오면 PostgreSQL 서비스 (`postgresql-x64-16`) 동작 확인
3. 401만 나오면 .env의 `JWT_SECRET` 변경됐는지 확인 (변경됐으면 모두 재로그인 필요)

### 부서원 PC에서 접속 안 됨

1. 서버 PC의 Windows 방화벽에서 80번 포트 인바운드 허용
   ```powershell
   New-NetFirewallRule -DisplayName "Parkmaster Web" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow
   ```
2. 부서 LAN 라우터/스위치 설정 확인 (IT 담당자 협의)

### `npm install` 실패

폐쇄망이라 npm registry 접근 불가하면:
- 외부 PC에서 `npm pack` 으로 의존성 미리 다운로드 후 USB로 옮겨 `npm install --offline`
- 또는 Verdaccio 같은 사내 npm proxy를 부서 서버에 같이 올리기 (선택)

### 비밀번호 분실

운영자가 PostgreSQL에 직접 접속해 임시 비번으로 초기화:

```powershell
# 비밀번호 해시 생성 (Node.js)
node -e "require('bcrypt').hash('temp_password_1234', 12).then(console.log)"

# DB에 적용 (출력된 해시를 $2b$... 부분에 넣기)
psql -U parkmaster_app -d parkmaster -c "
  UPDATE users SET password_hash = '\$2b\$12\$XXXXXX...' WHERE email = 'user@parkmaster.local';
  UPDATE profiles SET must_change_password = true WHERE email = 'user@parkmaster.local';
"
```

해당 사용자가 다음 로그인 시 비번 강제 변경.

---

## 8. 참고 문서

- 시스템 분석·아키텍처: `MIGRATION_ANALYSIS.md`
- 백엔드 라우트 구조: `api/README.md`
- 프론트엔드 마이그레이션 가이드: `src/integrations/api/MIGRATION_GUIDE.md`
- PR #2 본문: `PR_DESCRIPTION.md`

---

## 9. 라이센스·문의

이 시스템은 부서 자체 운영용이며, 외부 배포는 검토 후 진행하세요.
운영 중 문제 발생 시 IT 담당자 또는 개발자에게 문의.
