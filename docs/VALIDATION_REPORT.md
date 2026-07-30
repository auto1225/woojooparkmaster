# ParkMaster 통합 검증 보고서

- 생성 시각(UTC): 2026-07-30 07:39:30
- 커밋: f256bb3ef3bfc55be8767dad4f0eaef5bbb9ee1e
- Node.js: v22.23.1
- npm: 10.9.8

## 결과

| 영역 | 검사 | 결과 |
|---|---|---|
| Frontend | npm ci | PASS |
| Frontend | lint (레거시 기준 보고) | FAIL (1) |
| Frontend | TypeScript | FAIL (2) |
| Frontend | Vitest | PASS |
| Frontend | Vite production build | PASS |
| Backend | npm install | PASS |
| Backend | TypeScript build | PASS |
| Backend | Vitest | PASS |

## 실패·경고 로그 요약

### frontend_lint

```text
  163:25  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/runner/work/woojooparkmaster/woojooparkmaster/src/types/procurement.ts
   21:28  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   23:25  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   64:15  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   67:22  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   84:23  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  110:19  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/runner/work/woojooparkmaster/woojooparkmaster/src/types/realtime.ts
  10:59  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  32:27  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  61:34  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  63:37  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/runner/work/woojooparkmaster/woojooparkmaster/src/types/report.ts
  11:16  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  12:14  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  32:19  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  33:18  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  52:17  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  53:16  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  54:15  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  80:16  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  82:18  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  83:20  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/runner/work/woojooparkmaster/woojooparkmaster/src/types/revenue.ts
  18:22  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/runner/work/woojooparkmaster/woojooparkmaster/src/types/security.ts
  16:19  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  17:18  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  18:17  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  32:17  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/runner/work/woojooparkmaster/woojooparkmaster/src/types/service.ts
  57:48  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/runner/work/woojooparkmaster/woojooparkmaster/supabase/functions/demo-data/index.ts
   116:38  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   116:64  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   138:34  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   162:35  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   162:73  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   162:81  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   170:24  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   264:55  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   302:52  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   303:54  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   354:51  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   404:58  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   456:56  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   514:54  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   579:24  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   630:21  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   696:53  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   714:50  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   760:20  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   784:23  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   808:43  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   813:28  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   839:23  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   885:26  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   902:22  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   936:27  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   966:24  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   996:28  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1061:26  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1089:23  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1126:60  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1149:59  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1168:56  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1169:17  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1228:20  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1254:64  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1284:24  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1286:38  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1307:24  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1398:52  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1409:53  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1410:36  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1437:53  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1455:49  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1483:49  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1498:54  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1499:36  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1521:22  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1522:30  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1554:21  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1555:30  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1557:61  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1603:20  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1604:30  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1639:20  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1640:30  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1695:62  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1698:24  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1723:37  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1729:88  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1747:47  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1750:90  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1751:85  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1759:43  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1768:40  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1783:90  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1800:45  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1810:44  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1822:37  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1827:90  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1838:82  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  1849:98  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/runner/work/woojooparkmaster/woojooparkmaster/tailwind.config.ts
  99:13  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports

✖ 927 problems (898 errors, 29 warnings)
  2 errors and 2 warnings potentially fixable with the `--fix` option.

```

### frontend_typecheck

```text
src/pages/planning/PlanningDocuments.tsx(125,79): error TS2339: Property 'length' does not exist on type 'unknown'.
src/pages/planning/PlanningDocuments.tsx(141,32): error TS2339: Property 'map' does not exist on type 'unknown'.
src/pages/settings/ActivityAnalytics.tsx(101,22): error TS2362: The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/pages/settings/ActivityAnalytics.tsx(101,29): error TS2363: The right-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
```

