# JOIN expand 백엔드 라우트 적용

PR #4의 `expand.ts` 인프라를 실제 라우트에 적용해 클라이언트의 JOIN polyfill 의존도를 줄임.

## 변경 요약

shim의 `parseJoinSelect` + `fetchParents` 클라이언트 polyfill은 추가 fetch가 필요해 비효율적이었음. 이제 백엔드가 직접 LEFT JOIN으로 한 번에 응답하도록 변경:

- `?expand=parking_lots,assignee` 같은 쿼리 파라미터를 라우트가 처리
- 화이트리스트 기반 — 허용되지 않은 expand는 무시 (SQL injection 방지)
- `jsonb_build_object` 로 응답에 nested 객체 포함

## 변경된 라우트

### `long-tail.ts` (buildCrud 통합 — 18개 테이블 자동 적용)

`buildCrud` 함수에 `allowedExpands` 옵션 추가. cfg 배열의 각 테이블에 `expands` 필드 부여:

| 테이블 | 허용 expand |
|--------|-------------|
| approval_lines | assignee |
| approval_steps | assignee |
| bid_documents | bid_projects |
| bid_submissions | bid_projects |
| design_documents | parking_lots |
| construction_projects | parking_lots |
| maintenance_schedules | parking_lots, equipment, assignee |
| permits | parking_lots |
| report_schedules | report_templates |
| revenue_reconciliation | parking_lots |
| safety_inspections | parking_lots |
| sensor_devices | parking_lots |
| service_milestones | service_projects |
| service_inspections | service_projects |
| service_payments | service_projects |
| service_deliverables | service_projects |
| service_issues | service_projects |
| surface_markings | parking_lots |
| survey_usage | surveys |
| survey_sensor_plan | surveys |

### 0009 buildCrud 호출 (10개 테이블)

| 테이블 | 허용 expand |
|--------|-------------|
| operations_staff | parking_lots |
| enforcement_records | parking_lots |
| budget_executions | budget_items, parking_lots |
| bid_evaluations | bid_projects |
| bid_contracts | bid_projects |
| survey_infra | surveys |
| report_generated | report_templates |
| maintenance_logs | parking_lots, equipment |

### 별도 라우트 파일 (3개 — 수동 적용)

- `complaints.ts` — `parking_lots`, `assignee`
- `surveys.ts` — `parking_lots`, `surveyor`, `reviewer`, `approver`
- `service-projects.ts` — `parking_lots`, `supervisor`, `inspector`

## 사용 예

```ts
// 프론트엔드에서:
const r = await apiClient.get("/api/complaints?expand=parking_lots,assignee&limit=100");
// 응답: { data: [{ ...complaint, parking_lots: { code, name, ... }, assignee: { name, email, ... } }] }
```

shim의 호출도 자동으로 백엔드 JOIN을 사용하게끔 후속 PR에서 `select` 파싱 시 `?expand=` 쿼리로 위임 가능 (현재 PR 범위 외).

## 검증

샌드박스에서:
- ✅ complaints, surveys, service-projects, long-tail 모두 라우트 등록 통과
- ✅ Fastify 서버 부팅 OK

실제 LEFT JOIN 응답 검증은 후속 통합 테스트에서 (실 DB + 데이터 필요).

## 변경 파일

```
변경:
  api/src/routes/long-tail.ts          (buildCrud + 28개 cfg에 expands)
  api/src/routes/complaints.ts         (GET에 expand 처리)
  api/src/routes/surveys.ts            (동일)
  api/src/routes/service-projects.ts   (동일)
신규:
  PR5_DESCRIPTION.md
```

## 다음 단계 (후속 PR 후보)

- PR #6: shim의 `parseJoinSelect` 사용 시 자동으로 `?expand=` 쿼리로 변환 → polyfill 제거 가능
- PR #7: 시범 부서 적용 + 안정화 (실 데이터 + Windows 서버)
- PR #8: AI 기능 향상 (Ollama 실연동 + 한국어 모델 평가)

## 적용 방법 (PR #4 머지 후)

```powershell
cd C:\2026make\parkmaster\app\woojooparkmaster-pr
git fetch origin
git checkout feat/operational-enhancements
git pull
git checkout -b feat/expand-on-routes

$WS  = "C:\2026make\parkmaster\app\woojooparkmaster\woojooparkmaster"
$DST = "C:\2026make\parkmaster\app\woojooparkmaster-pr"

Copy-Item -Force "$WS\api\src\routes\long-tail.ts"        "$DST\api\src\routes\"
Copy-Item -Force "$WS\api\src\routes\complaints.ts"        "$DST\api\src\routes\"
Copy-Item -Force "$WS\api\src\routes\surveys.ts"           "$DST\api\src\routes\"
Copy-Item -Force "$WS\api\src\routes\service-projects.ts"  "$DST\api\src\routes\"
Copy-Item -Force "$WS\PR5_DESCRIPTION.md"                  $DST\

cd $DST
git status
git add .
git commit -m "feat: JOIN expand 백엔드 라우트 적용 (long-tail + complaints/surveys/service-projects)"
git push -u origin feat/expand-on-routes
```

푸시 완료 후 알려주시면 PR #5 등록 마무리하겠습니다.
