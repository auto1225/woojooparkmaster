# ParkMaster 네트워크 허용 목록

## 런타임 기본 원칙

- 사용자 PC는 ParkMaster 내부 HTTPS 주소와 승인된 Naver Maps 주소만 접속합니다.
- ParkMaster 서버의 DB, Auth, Storage, REST, Realtime 통신은 Docker 내부 네트워크에 머뭅니다.
- Supabase 클라우드, Lovable AI Gateway, Google Fonts, jsDelivr는 운영 런타임에 필요하지 않습니다.
- FQDN 허용 규칙은 기관 프록시 또는 경계 방화벽에서 관리하고 목적지 IP를 애플리케이션 서버에 고정하지 않습니다.

## 필수 허용

| 출발지          | 목적지                                                           | 포트 | 용도                        |
| --------------- | ---------------------------------------------------------------- | ---: | --------------------------- |
| 내부 사용자 PC  | `PARKMASTER_HOSTNAME`                                            |  443 | ParkMaster 화면 및 내부 API |
| 내부 사용자 PC  | `oapi.map.naver.com`                                             |  443 | Naver Maps JavaScript SDK   |
| 내부 사용자 PC  | 승인된 `*.pstatic.net`, `*.naver.net`, `*.naver.com` 지도 호스트 |  443 | 지도 타일과 지도 리소스     |
| ParkMaster 서버 | `maps.apigw.ntruss.com`                                          |  443 | 관리자 주소 일괄 좌표 변환  |

Naver Maps의 하위 리소스 호스트는 서비스 변경에 따라 달라질 수 있습니다. 시험 존의 프록시 로그에서 실제 호출을 수집하고 Naver 공식 문서와 대조한 후 기관 허용 목록을 확정합니다.

공식 지도 SDK 시작점: https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html

## 선택 허용

| 출발지          | 목적지                             | 조건                            |
| --------------- | ---------------------------------- | ------------------------------- |
| ParkMaster 서버 | `AI_ALLOWED_HOSTS`의 정확한 호스트 | AI 보안심의 승인 후에만 허용    |
| 내부 사용자 PC  | `SENSOR_CONSOLE_URL`               | 별도 운영 콘솔 승인 후에만 허용 |
| ParkMaster 서버 | 기관 SMTP, DNS, NTP                | 기관 내부 서비스만 사용         |

## 설치·업데이트 구간 전용

GitHub와 컨테이너 레지스트리 접속은 설치·업데이트 시간에만 필요합니다. 운영 런타임 방화벽에서는 차단하고, 가능하면 검증된 Docker 이미지를 기관 내부 레지스트리에 반입합니다. 이미지 다이제스트, 소스 커밋, SBOM, 취약점 검사 결과를 변경 기록에 남깁니다.

## 명시적 차단 확인

- 외부 Postgres 및 Supabase 프로젝트 주소
- `ai.gateway.lovable.dev`
- `fonts.googleapis.com`, `fonts.gstatic.com`, `cdn.jsdelivr.net`
- 승인되지 않은 분석, 광고, 오류수집, CDN 서비스
- 인터넷에서 내부 서버로 들어오는 모든 신규 연결
