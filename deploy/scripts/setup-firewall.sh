#!/bin/bash
# ParkMaster™ 서버 방화벽 설정 (SEC-WEB-7)

echo "=== ParkMaster 방화벽 설정 ==="

# 기본 정책: 모든 인바운드 차단
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 허용 포트
sudo ufw allow 22/tcp    # SSH (관리자 접속)
sudo ufw allow 80/tcp    # HTTP (→ HTTPS 리다이렉트)
sudo ufw allow 443/tcp   # HTTPS

# PostgreSQL 외부 접근 차단 확인
sudo ufw deny 5432/tcp

# 방화벽 활성화
sudo ufw --force enable
sudo ufw status verbose

echo "=== 방화벽 설정 완료 ==="
