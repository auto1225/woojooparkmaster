# 주차마스터 Windows 자동 설치 스크립트
#
# PostgreSQL 설치 가정 (수동). Node.js, npm install, .env 생성, migrate, seed 자동화.
#
# 실행:
#   PowerShell 관리자 권한으로
#   .\setup-windows.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== 주차마스터 자동 설치 시작 ===" -ForegroundColor Cyan
Write-Host ""

# 0. PostgreSQL 확인
Write-Host "[1/6] PostgreSQL 확인..."
$pgPath = "C:\Program Files\PostgreSQL\16\bin"
if (-not (Test-Path "$pgPath\psql.exe")) {
    Write-Host "  ⚠️ PostgreSQL 16이 설치되어있지 않습니다." -ForegroundColor Yellow
    Write-Host "  → https://www.enterprisedb.com/downloads/postgres-postgresql-downloads 에서 설치 후 재실행"
    exit 1
}
$env:Path += ";$pgPath"
Write-Host "  ✅ PostgreSQL 발견: $pgPath" -ForegroundColor Green

# 1. Node.js 확인
Write-Host "[2/6] Node.js 확인..."
try {
    $nodeVer = & node --version 2>$null
    if ($nodeVer -notmatch "^v(20|21|22|23|24)") {
        Write-Host "  ⚠️ Node.js 20+ 필요 (현재: $nodeVer)" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  ✅ $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Node.js 미설치. https://nodejs.org/ko/download" -ForegroundColor Red
    exit 1
}

# 2. DB 사용자·DB 생성
Write-Host "[3/6] DB 계정·데이터베이스 생성..."
$pgPassword = Read-Host -Prompt "  PostgreSQL postgres 슈퍼유저 비밀번호" -AsSecureString
$pgPasswordPlain = [System.Net.NetworkCredential]::new("", $pgPassword).Password
$env:PGPASSWORD = $pgPasswordPlain

$appPassword = -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})

& psql -U postgres -h 127.0.0.1 -c "DO `$`$ BEGIN CREATE USER parkmaster_app WITH PASSWORD '$appPassword'; EXCEPTION WHEN duplicate_object THEN NULL; END `$`$;" 2>$null
& psql -U postgres -h 127.0.0.1 -c "SELECT 1 FROM pg_database WHERE datname = 'parkmaster';" -t 2>$null | Out-Null
$exists = & psql -U postgres -h 127.0.0.1 -tAc "SELECT 1 FROM pg_database WHERE datname='parkmaster';" 2>$null
if (-not $exists) {
    & psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE parkmaster OWNER parkmaster_app ENCODING 'UTF8' TEMPLATE template0;"
    Write-Host "  ✅ DB 생성됨" -ForegroundColor Green
} else {
    Write-Host "  ✅ DB 이미 존재" -ForegroundColor Green
}
& psql -U postgres -h 127.0.0.1 -d parkmaster -c "GRANT ALL ON SCHEMA public TO parkmaster_app;" 2>$null

$env:PGPASSWORD = $null

# 3. 의존성 설치
Write-Host "[4/6] 의존성 설치..."
Push-Location api
& npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Host "  ❌ npm install 실패" -ForegroundColor Red; exit 1 }
Write-Host "  ✅ npm install 완료" -ForegroundColor Green
Pop-Location

# 4. .env 생성
Write-Host "[5/6] .env 생성..."
$jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
$adminEmail = Read-Host -Prompt "  관리자 이메일 (Enter=admin@parkmaster.local)"
if (-not $adminEmail) { $adminEmail = "admin@parkmaster.local" }
$adminPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 12 | ForEach-Object {[char]$_})

$envContent = @"
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
PG_HOST=127.0.0.1
PG_PORT=5432
PG_DATABASE=parkmaster
PG_USER=parkmaster_app
PG_PASSWORD=$appPassword
JWT_SECRET=$jwtSecret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
COOKIE_SECURE=false
CORS_ORIGIN=http://localhost
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE_MB=20
ADMIN_EMAIL=$adminEmail
ADMIN_PASSWORD=$adminPassword
ADMIN_NAME=시스템관리자
AI_BASE_URL=
AI_MODEL=qwen2.5:7b
AI_PROVIDER=ollama
"@
Set-Content -Path "api\.env" -Value $envContent -Encoding UTF8
Write-Host "  ✅ api\.env 생성됨" -ForegroundColor Green

# 5. 마이그레이션 + 시드
Write-Host "[6/6] 마이그레이션 + 관리자 시드..."
Push-Location api
& npm run migrate
if ($LASTEXITCODE -ne 0) { Write-Host "  ❌ migrate 실패" -ForegroundColor Red; exit 1 }
& npm run seed:admin
if ($LASTEXITCODE -ne 0) { Write-Host "  ❌ seed:admin 실패" -ForegroundColor Red; exit 1 }
Pop-Location

Write-Host ""
Write-Host "=== 설치 완료 ===" -ForegroundColor Green
Write-Host ""
Write-Host "관리자 계정:" -ForegroundColor Yellow
Write-Host "  이메일: $adminEmail"
Write-Host "  비밀번호: $adminPassword"
Write-Host "  ※ 첫 로그인 시 비밀번호 변경이 강제됩니다."
Write-Host ""
Write-Host "다음 단계:"
Write-Host "  1. 백엔드 부팅: cd api && npm run dev   (또는 NSSM으로 서비스 등록)"
Write-Host "  2. 헬스체크: Invoke-WebRequest http://127.0.0.1:4000/api/health"
Write-Host "  3. 스모크 테스트: cd api && npm run smoke"
Write-Host ""
Write-Host "운영 매뉴얼: WINDOWS_운영매뉴얼.md 참조"
