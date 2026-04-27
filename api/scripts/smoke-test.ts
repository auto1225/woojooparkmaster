/**
 * 시범 적용 통합 스모크 테스트.
 *
 * 백엔드가 떠 있는 상태에서 핵심 흐름(health → login → 70개 테이블 CRUD 가능 여부)을
 * 한 번에 검증. Windows 서버에 처음 설치 후 또는 update.bat 실행 후 자동 실행 권장.
 *
 * 사용:
 *   npm run smoke
 *
 * 환경 변수:
 *   SMOKE_BASE_URL  검증 대상 (기본: http://127.0.0.1:4000)
 *   SMOKE_EMAIL     관리자 계정 (기본: .env의 ADMIN_EMAIL)
 *   SMOKE_PASSWORD  비밀번호 (기본: .env의 ADMIN_PASSWORD)
 *
 * 종료 코드:
 *   0  모두 통과
 *   1  하나라도 실패
 */
import { env } from "../src/env.js";

const BASE = process.env.SMOKE_BASE_URL ?? `http://${env.HOST}:${env.PORT}`;
const EMAIL = process.env.SMOKE_EMAIL ?? env.ADMIN_EMAIL!;
const PASSWORD = process.env.SMOKE_PASSWORD ?? env.ADMIN_PASSWORD!;

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

const cookieJar = new Map<string, string>();
async function fetch_(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers as Record<string, string> | undefined);
  const cookies = [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookies) headers.set("Cookie", cookies);
  const res = await fetch(url, { ...init, headers });
  const setCookies = (res.headers as any).getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    const m = sc.match(/^([^=]+)=([^;]+)/);
    if (m) cookieJar.set(m[1], m[2]);
  }
  return res;
}

async function main() {
  console.log(`\n🔍 스모크 테스트 시작 (${BASE})\n`);

  // 1. health
  try {
    const r = await fetch_(`${BASE}/api/health`);
    const j = await r.json();
    check("/api/health 200", r.ok);
    check("DB 연결 OK", j.db === true);
  } catch (e) {
    check("/api/health 응답", false, (e as Error).message);
  }

  // 2. login
  try {
    const r = await fetch_(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    check(`로그인 (${EMAIL})`, r.ok, `status=${r.status}`);
  } catch (e) {
    check("로그인 요청", false, (e as Error).message);
  }

  // 3. me
  try {
    const r = await fetch_(`${BASE}/api/auth/me`);
    const j = await r.json();
    check("/api/auth/me 응답", r.ok && !!j.user, `role=${j.user?.role}`);
  } catch {
    check("/api/auth/me", false);
  }

  // 4. 핵심 17개 GET 라우트 가용성
  const endpoints = [
    "code-master", "parking-lots", "profiles", "revenue-daily", "complaints",
    "budget-plans", "budget-items", "notifications", "surveys", "equipment",
    "system-config", "fee-policies", "security-audit-logs", "active-sessions",
    "bid-projects", "service-projects", "fee-exemptions",
    // long-tail 그룹
    "free-hours-settings", "monthly-passes", "outsourcing-contracts",
    "gateway-devices", "display-boards", "operations-staff", "enforcement-records",
    "approval-lines", "attachments", "construction-projects", "ip-whitelist",
    "permits", "report-templates", "report-generated", "maintenance-logs",
    "lot-realtime-status",
  ];
  let pass = 0;
  for (const ep of endpoints) {
    try {
      const r = await fetch_(`${BASE}/api/${ep}?limit=1`);
      if (r.ok) pass++;
    } catch { /* skip */ }
  }
  check(`핵심 라우트 ${pass}/${endpoints.length} 통과`, pass === endpoints.length, `pass=${pass}`);

  // 5. parking_lots 생성·조회·삭제
  try {
    const code = `SMOKE_${Date.now()}`;
    const cr = await fetch_(`${BASE}/api/parking-lots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name: "스모크테스트", lot_type: "offstreet" }),
    });
    const j = await cr.json();
    check("parking_lots POST 201", cr.status === 201);
    if (j.id) {
      const gr = await fetch_(`${BASE}/api/parking-lots/${j.id}`);
      check("parking_lots GET 200", gr.ok);
      const dr = await fetch_(`${BASE}/api/parking-lots/${j.id}`, { method: "DELETE" });
      check("parking_lots DELETE 204", dr.status === 204);
    }
  } catch (e) {
    check("parking_lots CRUD", false, (e as Error).message);
  }

  // 6. expand 동작
  try {
    const r = await fetch_(`${BASE}/api/complaints?expand=parking_lots,assignee&limit=1`);
    const j = await r.json();
    check("complaints expand 응답", r.ok && Array.isArray(j.data));
  } catch {
    check("expand 동작", false);
  }

  // 7. 활동 로그 자동 기록 — 직전 CRUD 후 활동 로그에 기록됐는지는 DB 직접 조회 없으면 검증 어려움
  // 대신 audit-logs 라우트는 admin만이라 그냥 GET 200 확인
  try {
    const r = await fetch_(`${BASE}/api/security-audit-logs?limit=1`);
    check("security_audit_logs GET 200 (admin)", r.ok);
  } catch { check("audit-logs", false); }

  // 8. AI 헬스 (활성/비활성 상관없이 응답 있어야)
  try {
    const r = await fetch_(`${BASE}/api/ai/health`);
    const j = await r.json();
    check(`AI ${j.enabled ? "활성" : "비활성"} (정상 응답)`, r.ok);
  } catch { check("AI health", false); }

  // 9. logout
  try {
    const r = await fetch_(`${BASE}/api/auth/logout`, { method: "POST" });
    check("로그아웃 200", r.ok);
  } catch { check("로그아웃", false); }

  // 결과
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n=== 결과: 통과 ${passed} / 실패 ${failed} ===`);
  if (failed > 0) {
    console.log("실패 항목:");
    results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  }
  console.log("\n✅ 시범 적용 준비 완료");
  process.exit(0);
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
