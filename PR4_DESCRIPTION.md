# 운영 보강 — Supabase 데이터 이전 + 내부 LLM + JOIN expand 인프라

PR #2 (백엔드), PR #3 (프론트 마이그레이션) 위에 운영 시점에 필요한 도구·인프라 추가.

## 변경 요약

이 PR은 운영 전환을 더 매끄럽게 하기 위한 3가지 인프라를 추가합니다.

### 1. Supabase → 부서 PG 데이터 이전 스크립트

`api/scripts/import-from-supabase.ts` (320 줄)

운영 중인 Supabase의 데이터를 자체 PostgreSQL로 한 번에 옮기는 스크립트입니다.

- 모든 70개 테이블을 의존 순서대로 이전 (FK 충돌 방지)
- `auth.users` → 자체 `users` 매핑 (UUID 보존, 임시 비번 + `must_change_password=true`)
- `ON CONFLICT (id) DO UPDATE` 로 멱등성 — 중간 실패 후 재실행 안전
- 진행 상황 JSON 파일로 추적 (`/tmp/parkmaster-import-progress.json`)
- 실패한 행 별도 기록 (`/tmp/parkmaster-import-failed.json`)

**실행:**
```bash
# .env에 SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_KEY 추가 후
cd api
npm run migrate          # 자체 PG 스키마 먼저
npm run import:supabase  # 데이터 이전
```

### 2. 내부 LLM (Ollama) 어댑터

| 파일 | 변경 |
|------|------|
| `api/src/routes/ai.ts` | **신규** — `/api/ai/chat`, `/api/ai/task`, `/api/ai/health` |
| `src/integrations/api/ai.ts` | **신규** — `aiApi` typed binding |
| `src_overlay/lib/ai-service.ts` | **변경** — throw 대신 자체 `/api/ai/task` 호출 |
| `api/.env.example` | `AI_BASE_URL`, `AI_MODEL`, `AI_PROVIDER` 변수 추가 |

**활성화 방법** (운영 시):
1. 부서 서버 PC에 Ollama 설치 (`ollama pull qwen2.5:7b`)
2. `api/.env` 에 `AI_BASE_URL=http://localhost:11434` 설정
3. 백엔드 재시작
4. `isAIEnabled()` 가 `true` 반환 → ComplaintNew/Detail/ReportGenerate의 AI 버튼이 실제로 동작

지원 LLM 서버:
- Ollama (`AI_PROVIDER=ollama`)
- OpenAI 호환 서버 (llama.cpp, vLLM 등 — `AI_PROVIDER=openai-compatible`)

비활성 시 (`AI_BASE_URL` 비어있음): 503 응답 — 호출자가 try/catch로 안전 처리.

### 3. JOIN expand 백엔드 인프라

| 파일 | 변경 |
|------|------|
| `api/src/lib/expand.ts` | **신규** — `parseExpand`, `buildExpand`, `COMMON_EXPANSIONS` |

shim의 polyfill보다 효율적인 백엔드 LEFT JOIN 처리 헬퍼. 라우트에 `?expand=parking_lots,profiles` 같은 옵션을 화이트리스트 기반으로 처리.

**예시 사용 (후속 PR에서 라우트에 적용 예정):**
```ts
import { parseExpand, buildExpand, EXPAND_FOR } from "../lib/expand.js";

const expansions = parseExpand(req.query.expand, EXPAND_FOR.complaints);
const { selectClause, joinClause } = buildExpand(expansions, "m.*");
const sql = `SELECT ${selectClause} FROM complaints m ${joinClause} WHERE ...`;
```

**본 PR은 인프라만**: 17개 라우트 SELECT 쿼리에 적용은 후속 PR(가장 호출 많은 4-5개부터)로 분리. 이유: PR 양 관리 + 검증 단위.

## 신규/변경 파일

```
신규:
  api/src/routes/ai.ts                       (161줄)
  api/src/lib/expand.ts                      (204줄)
  api/scripts/import-from-supabase.ts        (320줄)
  src/integrations/api/ai.ts                 ( 51줄)
  PR4_DESCRIPTION.md

변경:
  api/src/server.ts                          (AI 라우트 등록)
  api/.env.example                           (AI 환경변수 추가)
  api/package.json                           (import:supabase script + @supabase/supabase-js)
  src/integrations/api/index.ts              (aiApi export)
  src_overlay/lib/ai-service.ts              (자체 백엔드 사용)
```

## 본 PR 머지 후

| 영역 | 상태 |
|------|------|
| 데이터 이전 도구 | ✅ 준비 완료 (운영 데이터 이전 1회 실행) |
| 내부 LLM 인프라 | ✅ 준비 완료 (Ollama 설치 + .env 설정만) |
| JOIN expand | ⚠️ 인프라만 (다음 PR에서 17개 라우트 적용) |

## 다음 단계 (후속 PR 후보)

1. **PR #5: JOIN expand를 라우트에 적용** — parking_lots, complaints, budget_items, surveys 등 호출 많은 4-5개 라우트의 GET에 `expand` 옵션 활성화 → 클라이언트 polyfill 의존도 감소
2. **PR #6: 시범 부서 적용 + 안정화** — 실제 Windows 서버에서 검증
3. **PR #7: AI 기능 향상** — Ollama 실제 연동 후 프롬프트 튜닝, 한국어 모델 평가

## 적용 방법 (PR #3 머지 후)

```powershell
cd C:\2026make\parkmaster\app\woojooparkmaster-pr
git fetch origin
git checkout feat/migrate-frontend-complete
git pull
git checkout -b feat/operational-enhancements

$WS  = "C:\2026make\parkmaster\app\woojooparkmaster\woojooparkmaster"
$DST = "C:\2026make\parkmaster\app\woojooparkmaster-pr"

# 신규 파일
Copy-Item -Force "$WS\api\src\routes\ai.ts"             "$DST\api\src\routes\"
Copy-Item -Force "$WS\api\src\lib\expand.ts"            "$DST\api\src\lib\"
Copy-Item -Force "$WS\api\scripts\import-from-supabase.ts"  "$DST\api\scripts\"
Copy-Item -Force "$WS\src\integrations\api\ai.ts"       "$DST\src\integrations\api\"
Copy-Item -Force "$WS\PR4_DESCRIPTION.md"               $DST\

# 변경 파일
Copy-Item -Force "$WS\api\src\server.ts"                "$DST\api\src\"
Copy-Item -Force "$WS\api\.env.example"                 "$DST\api\"
Copy-Item -Force "$WS\api\package.json"                 "$DST\api\"
Copy-Item -Force "$WS\src\integrations\api\index.ts"    "$DST\src\integrations\api\"
Copy-Item -Force "$WS\src_overlay\lib\ai-service.ts"    "$DST\src\lib\"

cd $DST
git status
git add .
git commit -m "feat: 운영 보강 - Supabase 데이터 이전 + 내부 LLM + JOIN expand 인프라"
git push -u origin feat/operational-enhancements
```

푸시 완료 후 알려주시면 제가 PR4 등록 마무리합니다.
