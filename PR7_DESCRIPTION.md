# 🛠️ 운영 도구 묶음 — 스모크 테스트, 데이터 검증, AI 평가, Windows 자동 설치

PR #6까지 코드 변경은 완료. 이번 PR은 **운영 시점에 필요한 자동화 도구**를 한 번에 추가.

## 추가된 스크립트 (4개)

### 1. `api/scripts/smoke-test.ts` (`npm run smoke`)

부팅 후 핵심 흐름을 한 번에 검증:
- `/api/health` + DB 핑
- 관리자 로그인
- `/api/auth/me`
- 33개 핵심 라우트 GET 200 가능 여부
- `parking_lots` 생성·조회·삭제
- `complaints` expand 동작
- 감사 로그 라우트
- AI 헬스 (활성/비활성)
- 로그아웃

종료 코드: 0 모두 통과 / 1 하나라도 실패 → CI 또는 update.bat 끝에 호출 가능.

### 2. `api/scripts/verify-import.ts` (`npm run verify:import`)

Supabase ↔ 부서 PG 카운트 비교. 67개 테이블의 row 수를 양쪽에서 가져와 차이를 표로 출력:

```
  parking_lots                       145       145       0
  complaints                         1842      1842      0
  ...
  합계                               45302     45302
불일치 테이블: 0개
✅ 모든 테이블의 카운트가 일치합니다.
```

운영 데이터 이전 후 1회 실행해 누락 없는지 확인.

### 3. `api/scripts/eval-ai.ts` (`npm run eval:ai`)

내부 LLM (Ollama 등) 활성화 상태에서 한국어 task 평가:
- `classify_complaint` — 한국어 민원 → JSON 분류 (JSON 유효성 + 카테고리 평가)
- `draft_response` — 회신 초안 (어조·길이)
- `summarize_report` — 운영 데이터 요약

각 task별 응답·소요시간·휴리스틱 점수(0-100) 출력. 한국어 비율, JSON 유효성, 길이 적정성으로 채점.

### 4. `api/scripts/setup-windows.ps1`

Windows 서버에 처음 설치 시 한 번 실행하는 자동화:
1. PostgreSQL 16 설치 확인 (없으면 안내)
2. Node.js 20+ 확인
3. PG 사용자·DB 생성 (랜덤 비밀번호)
4. `npm install`
5. `.env` 자동 생성 (JWT_SECRET 64자 랜덤, ADMIN_PASSWORD 12자 랜덤)
6. `npm run migrate` + `npm run seed:admin`

수동 작업 (`WINDOWS_운영매뉴얼.md`의 Step 1-7) 을 90% 자동화. 결과로 관리자 계정 정보 출력.

## 변경 파일

```
신규:
  api/scripts/smoke-test.ts          (스모크 테스트)
  api/scripts/verify-import.ts       (데이터 이전 검증)
  api/scripts/eval-ai.ts             (AI 평가 프레임워크)
  api/scripts/setup-windows.ps1      (Windows 자동 설치)
  PR7_DESCRIPTION.md
변경:
  api/package.json                   (smoke / verify:import / eval:ai 스크립트 추가)
```

## 운영 흐름 (완성)

이제 부서 서버 PC에서 다음 한 번이면 끝:

```powershell
# Windows 서버 PC (관리자 PowerShell):
# 1) 자동 설치
.\api\scripts\setup-windows.ps1

# 2) 백엔드 부팅 (NSSM 서비스 등록은 WINDOWS_운영매뉴얼.md 참조)
cd api
npm run dev   # 또는 nssm으로 서비스 시작

# 3) 스모크 테스트로 핵심 흐름 검증
npm run smoke
# → ✅ 시범 적용 준비 완료

# 4) (선택) 운영 데이터 이전 + 검증
$env:SOURCE_SUPABASE_URL = "https://xxx.supabase.co"
$env:SOURCE_SUPABASE_SERVICE_KEY = "eyJ..."
npm run import:supabase
npm run verify:import

# 5) (선택) AI 활성화 후 평가
ollama pull qwen2.5:7b
# .env에 AI_BASE_URL=http://localhost:11434 설정 후
npm run eval:ai
```

## 누적 PR 체인

```
main
 └── PR #2 (백엔드 인프라)
      └── PR #3 (프론트 마이그레이션)
           └── PR #4 (운영 보강)
                └── PR #5 (JOIN expand 라우트)
                     └── PR #6 (shim 자동 expand)
                          └── PR #7 (운영 도구 묶음) ⭐ 본 PR
```

PR #2~7을 순서대로 머지하면 **부서 서버에 PostgreSQL만 미리 설치한 상태에서 `setup-windows.ps1` → `npm run dev` → `npm run smoke` 만으로 시범 적용 가능한 상태**가 됩니다.
