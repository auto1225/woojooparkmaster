# Supabase → 자체 백엔드 프론트엔드 마이그레이션 가이드

`src/integrations/supabase/` 의 호출 388회를 자체 백엔드(`/api/*`)로 옮기는 작업 안내.

## TL;DR

| 카테고리 | 호출 수 | 비율 | 처리 방법 |
|----------|---------|------|-----------|
| **단순** (eq/order/limit/single만 사용) | **317** | **82%** | shim으로 자동 — import만 변경 |
| JOIN (`select('*, related(*)')`) | 35 | 9% | 백엔드 전용 엔드포인트 + 수동 변환 |
| COUNT 쿼리 (`count: 'exact'`) | 24 | 6% | shim 지원 |
| 복잡 필터 (in/gt/lt 등) | 12 | 3% | shim 지원 (백엔드가 해당 op 지원 시) |

**즉, 코드 80% 이상이 import 한 줄 변경으로 마이그레이션 가능합니다.**

## 단계별 작업 순서

### Step 1. import 변경 (대부분의 파일)

기존:
```ts
import { supabase } from "@/integrations/supabase/client";
```

신규:
```ts
import { supabase } from "@/integrations/api/supabase-compat";
```

이 한 줄만 바꾸면 `supabase.from(...).select()...` 패턴이 자동으로 자체 백엔드로 라우팅됩니다.

> **단, 해당 테이블의 백엔드 라우트가 먼저 작성되어 있어야 합니다.** 라우트가 없는 테이블 호출 시 404가 떨어지며, 어디서 막혔는지 콘솔에 명확히 표시됩니다.

### Step 2. 인증 호출 변경 (25회)

`supabase.auth.*` 는 shim이 의도적으로 throw 합니다. 명시적으로 `authApi`로 옮겨야 합니다.

| 기존 | 신규 |
|------|------|
| `supabase.auth.signInWithPassword({ email, password })` | `await authApi.login(email, password)` |
| `supabase.auth.signOut()` | `await authApi.logout()` |
| `supabase.auth.getUser()` / `getSession()` | `await authApi.me()` |
| `supabase.auth.refreshSession()` | `await authApi.refresh()` |
| `supabase.auth.updateUser({ password })` | `await authApi.changePassword(current, next)` |
| `supabase.auth.onAuthStateChange(...)` | `useAuth.tsx` Context로 대체 (수동 리팩토링) |
| `supabase.auth.resetPasswordForEmail(...)` | **미지원** — 관리자 수동 초기화로 정책 변경 |

```ts
import { authApi } from "@/integrations/api";

const user = await authApi.login(email, password);
```

### Step 3. JOIN 호출 변경 (35회)

shim은 JOIN 형태 select를 만나면 명시적으로 throw합니다:

```ts
// ❌ shim에서 throw
supabase.from("contracts").select("*, parking_lots(code, name)");
```

대신 백엔드에 전용 엔드포인트를 추가해야 합니다:

**백엔드** (`api/src/routes/contracts.ts`):
```ts
app.get("/api/contracts", async (req) => {
  const r = await pool.query(`
    SELECT c.*, json_build_object('code', l.code, 'name', l.name) AS parking_lots
    FROM contracts c LEFT JOIN parking_lots l ON l.id = c.lot_id
    ORDER BY c.created_at DESC
  `);
  return { data: r.rows, total: r.rowCount };
});
```

**프론트** (`src/integrations/api/contracts.ts`):
```ts
import { apiClient } from "./client";
export const contractsApi = {
  list: () => apiClient.get<{ data: ContractWithLot[]; total: number }>("/api/contracts"),
};
```

**호출부**:
```ts
// 기존: const { data } = await supabase.from("contracts").select("*, parking_lots(code, name)");
const { data } = await contractsApi.list();
```

### Step 4. 파일 업로드 (8회)

`supabase.storage.*` 는 shim이 throw. 자체 파일 API로 변환:

| 기존 | 신규 (예정) |
|------|-------------|
| `supabase.storage.from(b).upload(p, file)` | `filesApi.upload(b, file)` |
| `supabase.storage.from(b).getPublicUrl(p)` | `filesApi.url(id)` |
| `supabase.storage.from(b).remove([p])` | `filesApi.remove(id)` |

(파일 API는 Phase 2에서 구현 예정. 현재는 placeholder.)

### Step 5. Edge Function 호출 (3회)

| 기존 | 신규 |
|------|------|
| `supabase.functions.invoke("ai-assistant", ...)` | **비활성화** (내부망 외부 API 차단) |
| `supabase.functions.invoke("geocode-lots", ...)` | **제거** — 좌표 수동 입력 UI |
| `supabase.functions.invoke("demo-data", ...)` | 제거 (운영 환경 불필요) |

## 작업 우선순위 권장

호출 수가 많은 테이블부터 백엔드 라우트를 추가하면 가장 빨리 의존성이 떨어집니다:

| 우선순위 | 테이블 | 호출 수 |
|----------|--------|---------|
| 1 | `parking_lots` | 38 |
| 2 | `profiles` | 19 |
| 3 | `revenue_daily` | 13 |
| 4 | `complaints` | 12 |
| 5 | `budget_plans` | 11 |
| 6 | `budget_items` | 10 |
| 7 | `notifications` | 9 |
| 8 | `surveys` | 8 |
| ... | (이하 27개 테이블, 각 1~7회) | |

각 테이블당 백엔드 라우트는 `code-master` 패턴(`api/src/routes/code-master.ts`)을 그대로 복제하면 30~60분 정도 소요. 70개 테이블 모두 처리에는 단순 작업 기준 약 35~70시간.

## 자동 변환 권장 도구 (Phase 1.5)

추후 codemod 작성 권장:

```bash
# import 일괄 변경 (단순 작업)
find src -name "*.ts" -o -name "*.tsx" | xargs sed -i \
  's|@/integrations/supabase/client|@/integrations/api/supabase-compat|g'
```

JOIN 호출은 정규식으로 추출해서 별도 리스트로 만든 뒤 수동 변환:

```bash
grep -rEn 'select\([^)]*[a-z_]+\([^)]+\)[^)]*\)' src \
  --include='*.ts' --include='*.tsx' > join-calls.txt
```

## 미지원 기능 정리

shim이 throw 하는 호출들은 모두 의도적입니다. 호출자에게 명확한 안내 메시지가 표시됩니다.

| 호출 | 안내 |
|------|------|
| `supabase.auth.*` | `authApi`로 변경 |
| `supabase.storage.*` | 자체 파일 API 사용 |
| `supabase.functions.invoke()` | 백엔드 라우트로 변환 |
| `select('*, related(*)')` | 백엔드 전용 엔드포인트 + JOIN SQL |
| `supabase.rpc()` | 백엔드 라우트로 변환 (코드에 0회 — 무시 가능) |
| `supabase.channel()` / realtime | 코드에 0회 — 무시 가능 |

## 마이그레이션 검증 방법

각 페이지를 옮긴 후:

1. 콘솔에 `[supabase-compat]` 에러 메시지가 뜨는지 확인 → 미지원 호출 발견 신호
2. 네트워크 탭에서 `/api/*` 호출이 정상적으로 떨어지는지 확인
3. 인증 쿠키 (`pm_access`, `pm_refresh`)가 자동으로 포함되는지 확인
4. 응답 형식이 기존 Supabase와 같은 `{ data, error, count }` 구조인지 확인 (shim이 변환)
