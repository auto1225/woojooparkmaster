# shim 자동 expand 사용 (polyfill 의존도 최소화)

PR #5에서 백엔드 라우트에 `?expand=` 옵션이 추가됐음. 이제 shim이 그 옵션을 자동으로 활용해 추가 fetch 없이 한 번에 부모 row를 가져오도록 변경.

## 변경 요약

### supabase-compat.ts

`execute()` 함수의 SELECT 흐름에서:

1. `state.joins`가 있으면 query 파라미터에 `expand=alias1,alias2,...` 자동 추가
2. 백엔드가 응답에 nested 객체를 포함했으면 그대로 사용 (한 번의 fetch로 끝)
3. 백엔드가 expand 지원하지 않는 라우트면 응답에 nested 없음 → 기존 `fetchParents` polyfill로 fallback

```ts
// 단순화된 흐름
if (state.joins?.length) {
  query.expand = state.joins.map(j => j.alias).join(",");
}
const list = await apiClient.get(path, query);

// 백엔드가 처리했으면 list.data[0] 에 alias 키 있음
// 없으면 fallback polyfill
if (state.joins?.length) {
  for (const j of state.joins) {
    if (!(j.alias in list.data[0])) {
      await fetchParents(list.data, j);
    }
  }
}
```

### 효과

| 시나리오 | 이전 | 이후 |
|---------|------|------|
| 백엔드 expand 지원 라우트 | 메인 fetch + 부모 테이블 별도 fetch | **단일 SQL** (LEFT JOIN) |
| 백엔드 expand 미지원 라우트 | polyfill | polyfill (그대로) |
| 추가 round-trip | N (joins 수) | 0 또는 N |

PR #5에서 적용된 라우트들 (long-tail의 28개 + complaints/surveys/service-projects)은 이제 한 번의 fetch로 끝납니다.

## 변경 파일

```
변경:
  src/integrations/api/supabase-compat.ts (execute() 흐름 갱신)
신규:
  PR6_DESCRIPTION.md
```

## 검증

이 PR은 backward-compatible:
- 백엔드가 expand를 모르면 query 파라미터를 무시 → polyfill 동작
- 백엔드가 expand를 알면 응답에 nested 포함 → polyfill 스킵

## 다음 단계

1. **시범 부서 적용** — 실제 Windows 서버에서 검증
2. **AI 한국어 모델 평가** — Ollama 실연동
3. **운영 데이터 이전** — `npm run import:supabase` 실행
