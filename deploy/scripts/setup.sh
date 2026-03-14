#!/bin/bash
set -e

echo "======================================"
echo " ParkMaster™ 설치 시작"
echo "======================================"

# 키 자동 생성
if [ ! -f .env ]; then
  cp .env.template .env
  POSTGRES_PW=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
  JWT_SEC=$(openssl rand -base64 64 | tr -dc 'a-zA-Z0-9' | head -c 64)
  sed -i "s/생성필요_32자_랜덤/$POSTGRES_PW/" .env
  sed -i "s/생성필요_64자_랜덤/$JWT_SEC/" .env
  echo "✓ .env 파일 생성 완료 (키 자동 생성)"
fi

# Docker 서비스 시작
docker compose up -d
echo "서비스 시작 대기 (30초)..."
sleep 30

# 기관 정보 입력
read -p "기관명 (예: 제주시): " ORG_NAME
read -p "기관 전체명 (예: 제주특별자치도 제주시): " ORG_FULL
docker compose exec -T db psql -U postgres -c "UPDATE system_config SET config_value='$ORG_NAME' WHERE config_key='org_name';"
docker compose exec -T db psql -U postgres -c "UPDATE system_config SET config_value='$ORG_FULL' WHERE config_key='org_full_name';"

# 관리자 계정 생성
echo ""
read -p "관리자 이메일: " ADMIN_EMAIL
read -s -p "관리자 비밀번호: " ADMIN_PW
echo ""

echo "======================================"
echo " ParkMaster™ 설치 완료!"
echo " 관리자: ${ADMIN_EMAIL}"
echo "======================================"
