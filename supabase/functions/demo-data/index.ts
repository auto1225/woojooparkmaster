import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "인증이 필요합니다" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "인증 실패" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "관리자 권한이 필요합니다" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action } = await req.json();

    if (action === "seed") {
      await runSeed(supabase, user.id);
      return new Response(JSON.stringify({ success: true, message: "전체 모듈 데모 데이터가 생성되었습니다" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (action === "cleanup") {
      await runCleanup(supabase);
      return new Response(JSON.stringify({ success: true, message: "데모 데이터가 초기화되었습니다" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ error: "잘못된 action입니다" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("Demo data error:", err);
    return new Response(JSON.stringify({ error: err.message || "서버 오류" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Helpers ──
function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
function daysFromNow(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}
function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

async function batchInsert(supabase: any, table: string, rows: any[], batchSize = 50) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + batchSize));
    if (error) console.error(`${table} insert error:`, error.message);
  }
}

// ══════════════════════════════════════════════════════════════════
//  SEED – 전체 모듈 데모 데이터
// ══════════════════════════════════════════════════════════════════
async function runSeed(supabase: any, userId: string) {
  // ── 0. 주차장 목록 ──
  const { data: lots } = await supabase.from("parking_lots").select("id, code, name, total_spaces").order("code");
  if (!lots || lots.length === 0) throw new Error("주차장 데이터가 없습니다. 먼저 주차장을 등록하세요.");

  // Update lots with coords & spaces
  for (const lot of lots) {
    if (!lot.total_spaces || lot.total_spaces === 0) {
      const totalSpaces = rnd(20, 300);
      await supabase.from("parking_lots").update({
        total_spaces: totalSpaces,
        latitude: 33.50 + (Math.random() - 0.5) * 0.10,
        longitude: 126.53 + (Math.random() - 0.5) * 0.10,
        disabled_spaces: Math.max(1, Math.floor(totalSpaces * 0.04)),
        ev_spaces: Math.max(0, Math.floor(totalSpaces * 0.03)),
        notes: "[DEMO] 데모 데이터 보강",
      }).eq("id", lot.id);
      lot.total_spaces = totalSpaces;
    }
  }

  const bigLots = lots.filter((l: any) => l.total_spaces > 50).sort((a: any, b: any) => b.total_spaces - a.total_spaces);
  const topLots = bigLots.slice(0, Math.min(15, bigLots.length));
  const currentYear = new Date().getFullYear();

  // ══════════════════════════════════════════
  //  1. 시설관리 – equipment, maintenance, safety, markings, schedules
  // ══════════════════════════════════════════
  let eqCount = 0;
  const equipmentRows: any[] = [];
  for (const lot of topLots) {
    if (eqCount >= 80) break;
    for (let i = 1; i <= rnd(2, 6) && eqCount < 80; i++) {
      eqCount++;
      equipmentRows.push({
        lot_id: lot.id, equipment_code: `EQ-${String(eqCount).padStart(4, "0")}`,
        equipment_type: "cctv", name: `${lot.name} CCTV-${i}`, quantity: 1,
        status: pick(["normal", "normal", "normal", "warning"]),
        manufacturer: pick(["한화비전", "하이크비전", "다후아"]),
        install_date: daysAgo(rnd(100, 800)),
        total_maintenance_cost: 0, maintenance_count: 0, notes: "[DEMO] 데모 장비",
      });
    }
    if (lot.total_spaces >= 100 && eqCount < 80) {
      for (let i = 1; i <= 2 && eqCount < 80; i++) {
        eqCount++;
        equipmentRows.push({
          lot_id: lot.id, equipment_code: `EQ-${String(eqCount).padStart(4, "0")}`,
          equipment_type: "barrier", name: `${lot.name} 차단기-${i}`, quantity: 1,
          status: "normal", manufacturer: pick(["파킹클라우드", "아마노코리아"]),
          install_date: daysAgo(rnd(100, 600)),
          total_maintenance_cost: 0, maintenance_count: 0, notes: "[DEMO] 데모 장비",
        });
      }
      if (eqCount < 80) {
        eqCount++;
        equipmentRows.push({
          lot_id: lot.id, equipment_code: `EQ-${String(eqCount).padStart(4, "0")}`,
          equipment_type: "lpr", name: `${lot.name} LPR`, quantity: 2,
          status: "normal", manufacturer: "파킹클라우드",
          install_date: daysAgo(rnd(100, 400)),
          total_maintenance_cost: 0, maintenance_count: 0, notes: "[DEMO] 데모 장비",
        });
      }
    }
    if (lot.total_spaces >= 50 && Math.random() > 0.4 && eqCount < 80) {
      eqCount++;
      equipmentRows.push({
        lot_id: lot.id, equipment_code: `EQ-${String(eqCount).padStart(4, "0")}`,
        equipment_type: "kiosk", name: `${lot.name} 무인정산기`, quantity: 1,
        status: "normal", manufacturer: "파킹클라우드",
        install_date: daysAgo(rnd(30, 300)),
        total_maintenance_cost: 0, maintenance_count: 0, notes: "[DEMO] 데모 장비",
      });
    }
  }
  if (equipmentRows.length > 0) await batchInsert(supabase, "equipment", equipmentRows);

  // Get inserted equipment IDs
  const { data: demoEq } = await supabase.from("equipment").select("id, lot_id, name, equipment_type").like("notes", "[DEMO]%");

  // Maintenance logs (25)
  if (demoEq && demoEq.length > 0) {
    const maintRows = demoEq.slice(0, 25).map((eq: any, i: number) => ({
      log_number: `ML-DEMO-${String(i + 1).padStart(4, "0")}`,
      lot_id: eq.lot_id, equipment_id: eq.id,
      maintenance_type: pick(["scheduled", "scheduled", "emergency", "repair"]),
      priority: pick(["low", "medium", "high"]),
      title: `${eq.name} ${pick(["정기점검", "수리", "부품교체"])}`,
      parts_cost: rnd(0, 500000), labor_cost: rnd(50000, 300000), other_cost: 0,
      total_cost: rnd(50000, 800000),
      status: pick(["completed", "completed", "completed", "in_progress", "reported"]),
      notes: "[DEMO] 데모 유지보수",
    }));
    await batchInsert(supabase, "maintenance_logs", maintRows);
  }

  // Maintenance schedules (10)
  const scheduleRows = topLots.slice(0, 10).map((lot: any, i: number) => ({
    lot_id: lot.id,
    schedule_name: `${lot.name} ${pick(["월간 정기점검", "분기 안전점검", "소방 점검"])}`,
    schedule_type: pick(["monthly", "quarterly", "biannual"]),
    next_due_date: daysFromNow(rnd(1, 90)),
    is_active: true,
    notes: "[DEMO] 데모 일정",
  }));
  await batchInsert(supabase, "maintenance_schedules", scheduleRows);

  // Safety inspections (10)
  const grades = ["A", "A", "A", "B", "B", "B", "C", "C", "D", "B"];
  const inspRows = topLots.slice(0, 10).map((lot: any, i: number) => {
    const grade = grades[i];
    const passItems = grade === "A" ? 9 : grade === "B" ? 7 : grade === "C" ? 5 : 4;
    return {
      inspection_number: `SI-DEMO-${String(i + 1).padStart(4, "0")}`,
      lot_id: lot.id,
      inspection_type: pick(["quarterly", "monthly"]),
      inspection_date: daysAgo(rnd(1, 180)),
      checklist_results: [
        { category: "구조안전", item: "바닥 균열", result: "pass" },
        { category: "소방", item: "소화기 비치", result: "pass" },
        { category: "전기", item: "배선 상태", result: grade === "D" ? "fail" : "pass" },
      ],
      total_items: 10, pass_items: passItems, fail_items: 10 - passItems, na_items: 0,
      overall_grade: grade, status: "completed",
      notes: "[DEMO] 데모 안전점검",
    };
  });
  await batchInsert(supabase, "safety_inspections", inspRows);

  // Surface markings (20)
  const markingTypes = ["lane_line", "parking_line", "arrow", "text", "crosswalk", "speed_bump", "disabled_sign", "ev_sign"];
  const markingRows = topLots.slice(0, 10).flatMap((lot: any, li: number) => [
    {
      lot_id: lot.id, marking_name: `${lot.name} 주차구획선`, marking_type: "parking_line",
      color: "white", condition: pick(["good", "good", "fair", "poor"]),
      quantity: rnd(20, lot.total_spaces), material: "도료",
      last_repainted: daysAgo(rnd(30, 365)), repaint_cycle_months: 12,
      notes: "[DEMO] 데모 노면표시",
    },
    {
      lot_id: lot.id, marking_name: `${lot.name} ${pick(["진행방향 화살표", "과속방지턱", "횡단보도"])}`,
      marking_type: pick(markingTypes),
      color: pick(["white", "yellow"]), condition: pick(["good", "fair"]),
      quantity: rnd(2, 8), material: "도료",
      last_repainted: daysAgo(rnd(30, 365)), repaint_cycle_months: 12,
      notes: "[DEMO] 데모 노면표시",
    },
  ]);
  await batchInsert(supabase, "surface_markings", markingRows);

  // ══════════════════════════════════════════
  //  2. 운영관리 – staff, enforcement, monthly_passes, contracts, fee_exemptions, free_hours
  // ══════════════════════════════════════════
  // Operations staff (30)
  const staffNames = ["김철수","이영희","박민수","최지영","정대현","한서연","강동원","윤미경","오승환","임수정","조현우","신예진","홍길동","배수진","권태양","문재인","양세형","유재석","송혜교","전현무","이광수","차은우","김태리","박서준","한효주","이병헌","전지현","공유","손예진","정해인"];
  const staffRows = topLots.slice(0, 15).flatMap((lot: any, li: number) => {
    const count = rnd(1, 3);
    return Array.from({ length: count }, (_, si) => ({
      lot_id: lot.id,
      staff_name: staffNames[(li * 3 + si) % staffNames.length],
      staff_type: pick(["regular", "contract", "dispatch"]),
      position: pick(["관리원", "주임", "반장"]),
      phone: `010-${rnd(1000, 9999)}-${rnd(1000, 9999)}`,
      hire_date: daysAgo(rnd(30, 1500)),
      is_active: true,
      schedule: { weekday: "08:00-17:00", weekend: si === 0 ? "09:00-18:00" : null },
      notes: "[DEMO] 데모 인력",
    }));
  });
  await batchInsert(supabase, "operations_staff", staffRows);

  // Enforcement records (25)
  const violationTypes = ["no_ticket", "overtime", "disabled_zone", "fire_lane", "double_parking", "ev_zone"];
  const enfRows = Array.from({ length: 25 }, (_, i) => {
    const lot = pick(topLots);
    return {
      enforcement_number: `ENF-DEMO-${String(i + 1).padStart(4, "0")}`,
      lot_id: lot.id,
      vehicle_number: `${rnd(10, 99)}${pick(["가","나","다","라","마","바"])}${rnd(1000, 9999)}`,
      violation_type: pick(violationTypes),
      violation_date: daysAgo(rnd(1, 180)),
      violation_location: `${lot.name} ${pick(["A구역", "B구역", "입구", "지하1층"])}`,
      fine_amount: pick([40000, 50000, 80000, 100000]),
      payment_status: pick(["paid", "paid", "unpaid", "unpaid", "overdue"]),
      officer_name: pick(staffNames.slice(0, 10)),
      notes: "[DEMO] 데모 단속",
    };
  });
  await batchInsert(supabase, "enforcement_records", enfRows);

  // Monthly passes (20)
  const passRows = Array.from({ length: 20 }, (_, i) => {
    const lot = pick(topLots);
    const startDate = daysAgo(rnd(0, 60));
    return {
      lot_id: lot.id,
      pass_number: `MP-DEMO-${String(i + 1).padStart(4, "0")}`,
      vehicle_number: `${rnd(10, 99)}${pick(["가","나","다","라"])}${rnd(1000, 9999)}`,
      holder_name: pick(staffNames),
      holder_phone: `010-${rnd(1000, 9999)}-${rnd(1000, 9999)}`,
      pass_start: startDate,
      pass_end: daysFromNow(rnd(1, 60)),
      fee_amount: pick([50000, 60000, 70000, 80000, 100000]),
      fee_paid: pick([50000, 60000, 70000, 80000, 100000]),
      payment_method: pick(["card", "cash", "transfer"]),
      status: pick(["active", "active", "active", "expired"]),
      notes: "[DEMO] 데모 정기권",
    };
  });
  await batchInsert(supabase, "monthly_passes", passRows);

  // Outsourcing contracts (5)
  const contractCompanies = ["(주)제주파킹", "(주)그린주차", "스마트주차관리", "(주)해양관리", "(주)한라주차"];
  const contractRows = topLots.slice(0, 5).map((lot: any, i: number) => ({
    lot_id: lot.id,
    company_name: contractCompanies[i],
    representative: pick(staffNames),
    business_number: `${rnd(100, 999)}-${rnd(10, 99)}-${rnd(10000, 99999)}`,
    contact_person: pick(staffNames),
    contact_phone: `064-${rnd(700, 799)}-${rnd(1000, 9999)}`,
    contract_start: `${currentYear}-01-01`,
    contract_end: `${currentYear}-12-31`,
    contract_amount: rnd(100000000, 500000000),
    monthly_fee: rnd(5000000, 20000000),
    revenue_share_rate: rnd(5, 15),
    performance_score: rnd(70, 100),
    status: "active",
    notes: "[DEMO] 데모 위탁계약",
  }));
  await batchInsert(supabase, "outsourcing_contracts", contractRows);

  // Fee exemptions (8)
  const exemptionRows = [
    { exemption_name: "장애인 감면", exemption_type: "disabled", discount_type: "rate", discount_rate: 50, legal_basis: "주차장법 제10조", notes: "[DEMO]" },
    { exemption_name: "국가유공자 감면", exemption_type: "veteran", discount_type: "rate", discount_rate: 50, legal_basis: "국가유공자법", notes: "[DEMO]" },
    { exemption_name: "경차 감면", exemption_type: "compact_car", discount_type: "rate", discount_rate: 50, legal_basis: "주차장법", notes: "[DEMO]" },
    { exemption_name: "전기차 감면", exemption_type: "ev", discount_type: "rate", discount_rate: 50, legal_basis: "환경부 고시", notes: "[DEMO]" },
    { exemption_name: "다자녀 감면", exemption_type: "multi_child", discount_type: "rate", discount_rate: 50, legal_basis: "지자체 조례", notes: "[DEMO]" },
    { exemption_name: "임산부 감면", exemption_type: "pregnant", discount_type: "rate", discount_rate: 50, legal_basis: "지자체 조례", notes: "[DEMO]" },
    { exemption_name: "공무 차량", exemption_type: "official", discount_type: "full", discount_rate: 100, legal_basis: "지자체 내규", notes: "[DEMO]" },
    { exemption_name: "30분 무료", exemption_type: "free_time", discount_type: "time", max_hours: 0.5, legal_basis: "주차장 조례", notes: "[DEMO]" },
  ].map(r => ({ ...r, is_active: true }));
  await batchInsert(supabase, "fee_exemptions", exemptionRows);

  // ══════════════════════════════════════════
  //  3. 민원관리 – complaints (30)
  // ══════════════════════════════════════════
  const compCategories = ["fee", "facility", "operation", "enforcement", "safety", "other"];
  const compChannels = ["phone", "online", "saeol", "onsite", "visit"];
  const compStatuses = ["closed", "closed", "closed", "responded", "responded", "in_progress", "received"];
  const compTitles = ["요금 관련 문의", "시설 파손 신고", "주차 안내 불만", "부당 단속 이의", "안전시설 점검 요청", "기타 건의"];
  const compRows = Array.from({ length: 30 }, (_, i) => {
    const lot = pick(lots);
    const cat = pick(compCategories);
    return {
      complaint_number: `CMP-DEMO-${String(i + 1).padStart(4, "0")}`,
      lot_id: lot.id, category: cat, channel: pick(compChannels),
      title: `${lot.name} ${pick(compTitles)}`,
      content: `[DEMO] ${lot.name}에 대한 ${cat} 관련 민원입니다. 신속한 처리 부탁드립니다.`,
      status: pick(compStatuses),
      priority: pick(["low", "normal", "normal", "high", "urgent"]),
      complainant_name: pick(staffNames),
      complainant_phone: `010-${rnd(1000, 9999)}-${rnd(1000, 9999)}`,
      notes: "[DEMO] 데모 민원",
      created_at: new Date(Date.now() - rnd(1, 180) * 86400000).toISOString(),
    };
  });
  await batchInsert(supabase, "complaints", compRows);

  // ══════════════════════════════════════════
  //  4. 수입관리 – revenue_daily (top 20 × 90 days)
  // ══════════════════════════════════════════
  const revLots = bigLots.slice(0, 20);
  for (const lot of revLots) {
    const dailyBase = lot.total_spaces * 500;
    const revRows: any[] = [];
    for (let d = 1; d <= 90; d++) {
      const dateStr = daysAgo(d);
      const weekday = new Date(dateStr).getDay();
      const factor = (weekday === 0 || weekday === 6) ? 0.6 : 1.0;
      revRows.push({
        lot_id: lot.id, revenue_date: dateStr,
        cash_amount: Math.floor(dailyBase * 0.15 * factor * (0.8 + Math.random() * 0.4)),
        card_amount: Math.floor(dailyBase * 0.6 * factor * (0.8 + Math.random() * 0.4)),
        mobile_amount: Math.floor(dailyBase * 0.25 * factor * (0.8 + Math.random() * 0.4)),
        total_amount: Math.floor(dailyBase * factor * (0.8 + Math.random() * 0.4)),
        total_vehicles: Math.floor(lot.total_spaces * factor * (0.5 + Math.random() * 1.5)),
        verified: d > 30,
        notes: "[DEMO] 데모 수입",
      });
    }
    await batchInsert(supabase, "revenue_daily", revRows);
  }

  // ══════════════════════════════════════════
  //  5. 예산관리 – budget_plans, budget_items, budget_executions, budget_transfers
  // ══════════════════════════════════════════
  const { data: budgetPlanData } = await supabase.from("budget_plans").insert({
    fiscal_year: currentYear, plan_type: "original",
    title: `${currentYear}년도 본예산`, status: "executed",
    total_revenue: 1200000000, total_expenditure: 800000000,
    balance: 400000000, notes: "[DEMO] 데모 예산",
  }).select("id").single();

  if (budgetPlanData) {
    const planId = budgetPlanData.id;
    const budgetItems = [
      { item_code: "R-001", item_name: "주차요금 수입", budget_type: "revenue", category_l1: "자체수입", planned_amount: 800000000, allocated_amount: 800000000, executed_amount: 600000000 },
      { item_code: "R-002", item_name: "정기권 수입", budget_type: "revenue", category_l1: "자체수입", planned_amount: 300000000, allocated_amount: 300000000, executed_amount: 250000000 },
      { item_code: "R-003", item_name: "과태료 수입", budget_type: "revenue", category_l1: "자체수입", planned_amount: 100000000, allocated_amount: 100000000, executed_amount: 80000000 },
      { item_code: "E-001", item_name: "인건비", budget_type: "expenditure", category_l1: "경상경비", planned_amount: 350000000, allocated_amount: 350000000, executed_amount: 280000000 },
      { item_code: "E-002", item_name: "시설유지비", budget_type: "expenditure", category_l1: "경상경비", planned_amount: 200000000, allocated_amount: 200000000, executed_amount: 150000000 },
      { item_code: "E-003", item_name: "장비구매비", budget_type: "expenditure", category_l1: "사업비", planned_amount: 150000000, allocated_amount: 150000000, executed_amount: 100000000 },
      { item_code: "E-004", item_name: "위탁운영비", budget_type: "expenditure", category_l1: "경상경비", planned_amount: 100000000, allocated_amount: 100000000, executed_amount: 70000000 },
    ].map(item => ({
      ...item, plan_id: planId, is_summary: false, depth: 1, sort_order: 0,
      remaining_amount: (item.allocated_amount || 0) - (item.executed_amount || 0),
      execution_rate: Math.round(((item.executed_amount || 0) / (item.allocated_amount || 1)) * 100),
      notes: "[DEMO]",
    }));
    await batchInsert(supabase, "budget_items", budgetItems);

    // Get inserted budget items for executions
    const { data: insertedItems } = await supabase.from("budget_items").select("id, item_code, budget_type").eq("plan_id", planId);

    if (insertedItems && insertedItems.length > 0) {
      // Budget executions (15)
      const execRows = Array.from({ length: 15 }, (_, i) => {
        const item = pick(insertedItems.filter((it: any) => it.budget_type === "expenditure"));
        if (!item) return null;
        return {
          execution_number: `BE-DEMO-${String(i + 1).padStart(4, "0")}`,
          item_id: item.id,
          execution_type: "expenditure",
          execution_date: daysAgo(rnd(1, 90)),
          amount: rnd(1000000, 30000000),
          description: pick(["CCTV 유지보수비", "인건비 지급", "시설보수 공사비", "소모품 구매", "전기료 납부"]),
          vendor_name: pick(["(주)제주건설", "한라전기", "스마트파킹", "제주물산"]),
          status: pick(["executed", "executed", "executed", "pending", "approved"]),
          payment_method: pick(["transfer", "card"]),
          notes: "[DEMO] 데모 집행",
        };
      }).filter(Boolean);
      await batchInsert(supabase, "budget_executions", execRows);

      // Budget transfers (3)
      const expItems = insertedItems.filter((it: any) => it.budget_type === "expenditure");
      if (expItems.length >= 2) {
        const transferRows = Array.from({ length: 3 }, (_, i) => ({
          transfer_number: `BT-DEMO-${String(i + 1).padStart(4, "0")}`,
          fiscal_year: currentYear,
          from_item_id: expItems[i % expItems.length].id,
          to_item_id: expItems[(i + 1) % expItems.length].id,
          amount: rnd(5000000, 20000000),
          reason: pick(["긴급 시설보수", "인건비 부족분 충당", "장비 교체 소요"]),
          transfer_type: pick(["transfer", "carry_forward"]),
          status: pick(["executed", "approved", "pending"]),
          notes: "[DEMO] 데모 전용",
        }));
        await batchInsert(supabase, "budget_transfers", transferRows);
      }
    }
  }

  // ══════════════════════════════════════════
  //  6. 입찰관리 – bid_projects, bid_submissions
  // ══════════════════════════════════════════
  const bidTypes = ["open_competitive", "limited_competitive", "negotiated"];
  const bidCategories = ["construction", "service", "goods", "maintenance"];
  const bidProjectRows = Array.from({ length: 5 }, (_, i) => ({
    bid_number: `BID-DEMO-${currentYear}-${String(i + 1).padStart(3, "0")}`,
    title: pick([
      `${pick(topLots).name} CCTV 교체 공사`,
      "주차관제시스템 구축 사업",
      "주차장 노면표시 도색 공사",
      "무인정산기 도입 사업",
      "주차장 안전시설 보강 공사",
    ]),
    bid_type: pick(bidTypes),
    contract_type: pick(["lump_sum", "unit_price"]),
    category: pick(bidCategories),
    estimated_amount: rnd(50000000, 500000000),
    status: pick(["announced", "bidding", "evaluation", "contracted", "completed"]),
    announce_date: daysAgo(rnd(30, 180)),
    bid_deadline: daysAgo(rnd(1, 29)),
    description: `[DEMO] 데모 입찰 사업 ${i + 1}`,
    evaluation_method: pick(["lowest_price", "comprehensive"]),
    notes: "[DEMO] 데모 입찰",
  }));

  const { data: insertedBids } = await supabase.from("bid_projects").insert(bidProjectRows).select("id, estimated_amount");

  if (insertedBids && insertedBids.length > 0) {
    const subRows: any[] = [];
    for (const bid of insertedBids) {
      const numSubs = rnd(2, 5);
      for (let s = 0; s < numSubs; s++) {
        const bidAmount = Math.floor((bid.estimated_amount || 100000000) * (0.75 + Math.random() * 0.2));
        subRows.push({
          bid_project_id: bid.id,
          submission_number: `SUB-DEMO-${bid.id.slice(0, 4)}-${s + 1}`,
          company_name: pick(["(주)제주건설", "한라종합건설", "스마트파킹(주)", "(주)그린시스템", "대한건설", "동양전기(주)"]),
          representative: pick(staffNames),
          business_number: `${rnd(100, 999)}-${rnd(10, 99)}-${rnd(10000, 99999)}`,
          bid_amount: bidAmount,
          bid_rate: Math.round(bidAmount / (bid.estimated_amount || 1) * 10000) / 100,
          contact_person: pick(staffNames),
          contact_phone: `010-${rnd(1000, 9999)}-${rnd(1000, 9999)}`,
          is_valid: true,
          notes: "[DEMO] 데모 입찰서",
        });
      }
    }
    await batchInsert(supabase, "bid_submissions", subRows);
  }

  // ══════════════════════════════════════════
  //  7. 용역사업관리 – service_projects, milestones
  // ══════════════════════════════════════════
  const svcProjectRows = [
    { title: "주차관제시스템 유지보수 용역", service_type: "maintenance", service_category: "facility", contract_amount: 120000000, total_amount: 132000000, contractor_name: "(주)스마트파킹", status: "in_progress", progress_pct: 65 },
    { title: "주차장 안전진단 용역", service_type: "consulting", service_category: "safety", contract_amount: 50000000, total_amount: 55000000, contractor_name: "(주)안전기술원", status: "in_progress", progress_pct: 40 },
    { title: "주차 수요조사 용역", service_type: "consulting", service_category: "planning", contract_amount: 80000000, total_amount: 88000000, contractor_name: "(주)도시교통연구원", status: "completed", progress_pct: 100 },
    { title: "CCTV 통합관제 구축 용역", service_type: "construction", service_category: "facility", contract_amount: 200000000, total_amount: 220000000, contractor_name: "한화시스템(주)", status: "in_progress", progress_pct: 30 },
  ].map((p, i) => ({
    ...p,
    project_number: `SVC-DEMO-${currentYear}-${String(i + 1).padStart(3, "0")}`,
    start_date: daysAgo(rnd(60, 180)),
    end_date: daysFromNow(rnd(30, 180)),
    vat_amount: Math.floor(p.contract_amount * 0.1),
    paid_amount: Math.floor(p.total_amount * (p.progress_pct / 100) * 0.8),
    lot_id: topLots[i % topLots.length]?.id,
    notes: "[DEMO] 데모 용역사업",
  }));

  const { data: insertedSvcProjects } = await supabase.from("service_projects").insert(svcProjectRows).select("id, title, total_amount");

  if (insertedSvcProjects && insertedSvcProjects.length > 0) {
    const milestoneRows: any[] = [];
    for (const proj of insertedSvcProjects) {
      const milestones = [
        { milestone_number: 1, title: "착수", weight_pct: 10, status: "completed", milestone_type: "start", target_date: daysAgo(rnd(60, 120)), payment_amount: Math.floor((proj.total_amount || 0) * 0.1) },
        { milestone_number: 2, title: "중간보고", weight_pct: 30, status: pick(["completed", "in_progress"]), milestone_type: "interim", target_date: daysAgo(rnd(1, 59)), payment_amount: Math.floor((proj.total_amount || 0) * 0.3) },
        { milestone_number: 3, title: "최종보고", weight_pct: 40, status: "pending", milestone_type: "final", target_date: daysFromNow(rnd(30, 90)), payment_amount: Math.floor((proj.total_amount || 0) * 0.4) },
        { milestone_number: 4, title: "준공", weight_pct: 20, status: "pending", milestone_type: "completion", target_date: daysFromNow(rnd(91, 180)), payment_amount: Math.floor((proj.total_amount || 0) * 0.2) },
      ];
      for (const ms of milestones) {
        milestoneRows.push({ ...ms, project_id: proj.id, notes: "[DEMO]" });
      }
    }
    await batchInsert(supabase, "service_milestones", milestoneRows);
  }

  // ══════════════════════════════════════════
  //  8. 신설기획 – site_candidates, construction_projects
  // ══════════════════════════════════════════
  const siteRows = Array.from({ length: 5 }, (_, i) => ({
    site_number: `SITE-DEMO-${String(i + 1).padStart(3, "0")}`,
    name: pick(["연동 공영주차장 후보지", "노형동 부지", "이도동 유휴부지", "삼도동 공터", "일도동 주차장 부지"]),
    address_road: `제주시 ${pick(["연동", "노형동", "이도동", "삼도동"])} ${rnd(1, 100)}`,
    area_sqm: rnd(1000, 5000),
    estimated_spaces: rnd(50, 200),
    zoning: pick(["일반상업지역", "준주거지역", "일반주거지역"]),
    ownership: pick(["public", "private", "mixed"]),
    location_score: rnd(60, 100), accessibility_score: rnd(60, 100),
    demand_score: rnd(60, 100), feasibility_score: rnd(50, 100), legal_score: rnd(60, 100),
    total_score: rnd(300, 500),
    status: pick(["evaluation", "evaluation", "selected", "rejected", "pending"]),
    latitude: 33.49 + Math.random() * 0.04,
    longitude: 126.51 + Math.random() * 0.06,
    estimated_construction_cost: rnd(1000000000, 5000000000),
    notes: "[DEMO] 데모 후보지",
  }));
  await batchInsert(supabase, "site_candidates", siteRows);

  // Construction projects (3)
  const constRows = Array.from({ length: 3 }, (_, i) => ({
    project_number: `CP-DEMO-${currentYear}-${String(i + 1).padStart(3, "0")}`,
    project_name: pick(["연동 공영주차장 신축공사", "노형동 주차빌딩 건설", "삼도동 주차장 리모델링"]),
    project_type: pick(["new_construction", "renovation", "expansion"]),
    phase: pick(["planning", "design", "construction", "completed"]),
    total_budget: rnd(2000000000, 8000000000),
    progress_pct: rnd(0, 100),
    lot_id: topLots[i % topLots.length]?.id,
    planning_start: daysAgo(rnd(180, 365)),
    target_completion: daysFromNow(rnd(180, 730)),
    contractor: pick(["(주)제주건설", "한라종합건설", "(주)동양건설"]),
    status: pick(["active", "active", "planning"]),
    notes: "[DEMO] 데모 건설사업",
  }));
  await batchInsert(supabase, "construction_projects", constRows);

  // ══════════════════════════════════════════
  //  9. 실시간 – sensor_devices, gateway_devices, lot_realtime_status, display_boards
  // ══════════════════════════════════════════
  // Gateway devices (5)
  const gwRows = topLots.slice(0, 5).map((lot: any, i: number) => ({
    gateway_id: `GW-DEMO-${String(i + 1).padStart(3, "0")}`,
    gateway_name: `${lot.name} 게이트웨이`,
    lot_id: lot.id,
    ip_address: `192.168.${rnd(1, 10)}.${rnd(1, 254)}`,
    status: pick(["online", "online", "online", "offline"]),
    protocol: pick(["lorawan", "nb-iot"]),
    manufacturer: pick(["파킹클라우드", "한국IoT"]),
    model: pick(["GW-100", "GW-200"]),
    connected_sensors: rnd(5, 30),
    max_sensors: 50,
    notes: "[DEMO] 데모 게이트웨이",
  }));

  const { data: insertedGws } = await supabase.from("gateway_devices").insert(gwRows).select("id, lot_id");

  // Sensor devices (40)
  if (insertedGws && insertedGws.length > 0) {
    const sensorRows: any[] = [];
    for (const gw of insertedGws) {
      const count = rnd(5, 12);
      for (let s = 0; s < count && sensorRows.length < 40; s++) {
        sensorRows.push({
          device_id: `SEN-DEMO-${String(sensorRows.length + 1).padStart(4, "0")}`,
          device_name: `센서-${sensorRows.length + 1}`,
          device_type: pick(["magnetic", "ultrasonic", "camera"]),
          lot_id: gw.lot_id,
          gateway_id: gw.id,
          zone: pick(["A", "B", "C"]),
          floor: pick([0, 1, -1]),
          status: pick(["active", "active", "active", "warning", "offline"]),
          battery_level: rnd(20, 100),
          rssi: -rnd(40, 100),
          firmware_version: "v2.1.3",
          last_reading: new Date().toISOString(),
          total_readings: rnd(1000, 50000),
          notes: "[DEMO] 데모 센서",
        });
      }
    }
    await batchInsert(supabase, "sensor_devices", sensorRows);
  }

  // Display boards (8)
  const displayRows = topLots.slice(0, 8).map((lot: any, i: number) => ({
    board_id: `DSP-DEMO-${String(i + 1).padStart(3, "0")}`,
    board_name: `${lot.name} ${pick(["입구 안내판", "출구 안내판", "내부 안내판"])}`,
    lot_id: lot.id,
    display_type: pick(["led", "lcd"]),
    location_type: pick(["entrance", "exit", "internal"]),
    status: pick(["online", "online", "offline"]),
    ip_address: `192.168.${rnd(1, 10)}.${rnd(100, 200)}`,
    current_message: `주차가능 ${rnd(5, 100)}면`,
    protocol: pick(["http", "serial"]),
    notes: "[DEMO] 데모 전광판",
  }));
  await batchInsert(supabase, "display_boards", displayRows);

  // Lot realtime status
  const rtRows = topLots.slice(0, 10).map((lot: any) => ({
    lot_id: lot.id,
    total_spaces: lot.total_spaces,
    occupied_spaces: rnd(Math.floor(lot.total_spaces * 0.3), lot.total_spaces),
    congestion_level: pick(["empty", "normal", "crowded", "full"]),
    status: "normal",
    today_total_in: rnd(50, 500),
    today_total_out: rnd(40, 480),
    today_peak_occupied: rnd(Math.floor(lot.total_spaces * 0.7), lot.total_spaces),
    today_peak_time: `${rnd(10, 15)}:${rnd(0, 59).toString().padStart(2, "0")}`,
    last_updated: new Date().toISOString(),
    notes: "[DEMO]",
  }));
  // Use upsert for lot_realtime_status (unique on lot_id)
  for (const rt of rtRows) {
    await supabase.from("lot_realtime_status").upsert(rt, { onConflict: "lot_id" });
  }

  // ══════════════════════════════════════════
  //  10. 보고서 – report_templates
  // ══════════════════════════════════════════
  const templateRows = [
    { template_code: "RPT-DEMO-MONTHLY", name: "월간 운영현황 보고서", report_type: "monthly", report_category: "operation", is_system: true },
    { template_code: "RPT-DEMO-QUARTERLY", name: "분기별 수입/지출 보고서", report_type: "quarterly", report_category: "revenue", is_system: true },
    { template_code: "RPT-DEMO-ANNUAL", name: "연간 종합 보고서", report_type: "annual", report_category: "comprehensive", is_system: true },
    { template_code: "RPT-DEMO-SAFETY", name: "안전점검 결과 보고서", report_type: "event", report_category: "safety", is_system: true },
    { template_code: "RPT-DEMO-COMPLAINT", name: "민원 처리현황 보고서", report_type: "monthly", report_category: "complaint", is_system: true },
  ].map(t => ({
    ...t,
    description: `[DEMO] ${t.name}`,
    sections: [{ title: "개요", type: "summary" }, { title: "상세", type: "table" }],
    data_sources: [{ table: "parking_lots" }],
    page_size: "A4", page_orientation: "portrait",
  }));
  await batchInsert(supabase, "report_templates", templateRows);

  // ══════════════════════════════════════════
  //  11. 활동 로그 (10)
  // ══════════════════════════════════════════
  const logRows = Array.from({ length: 10 }, (_, i) => ({
    user_id: userId,
    user_name: "관리자",
    module: pick(["facility", "revenue", "complaint", "ops", "settings"]),
    action: pick(["조회", "등록", "수정", "엑셀 다운로드", "보고서 생성"]),
    target_type: pick(["주차장", "장비", "민원", "수입"]),
    target_name: pick(topLots).name,
    details: { demo: true },
    created_at: new Date(Date.now() - rnd(1, 30) * 86400000).toISOString(),
  }));
  await batchInsert(supabase, "activity_logs", logRows);

  console.log("✅ Demo data seed completed for ALL modules");
}

// ══════════════════════════════════════════════════════════════════
//  CLEANUP – 데모 데이터 삭제
// ══════════════════════════════════════════════════════════════════
async function runCleanup(supabase: any) {
  // Delete in reverse dependency order

  // Activity logs
  await supabase.from("activity_logs").delete().eq("details->>demo", "true");

  // Reports
  await supabase.from("report_templates").delete().like("template_code", "RPT-DEMO%");

  // Realtime
  await supabase.from("display_boards").delete().like("notes", "[DEMO]%");
  await supabase.from("sensor_devices").delete().like("notes", "[DEMO]%");
  await supabase.from("gateway_devices").delete().like("notes", "[DEMO]%");
  // lot_realtime_status doesn't have notes, clean by checking demo display boards were deleted

  // Planning
  await supabase.from("construction_projects").delete().like("notes", "[DEMO]%");
  await supabase.from("site_candidates").delete().like("notes", "[DEMO]%");

  // Service - milestones first (FK), then projects
  const { data: demoSvcProjects } = await supabase.from("service_projects").select("id").like("notes", "[DEMO]%");
  if (demoSvcProjects && demoSvcProjects.length > 0) {
    const svcIds = demoSvcProjects.map((p: any) => p.id);
    await supabase.from("service_milestones").delete().in("project_id", svcIds);
    await supabase.from("service_inspections").delete().in("project_id", svcIds);
    await supabase.from("service_payments").delete().in("project_id", svcIds);
    await supabase.from("service_deliverables").delete().in("project_id", svcIds);
    await supabase.from("service_issues").delete().in("project_id", svcIds);
  }
  await supabase.from("service_projects").delete().like("notes", "[DEMO]%");

  // Procurement - submissions first, then projects
  const { data: demoBids } = await supabase.from("bid_projects").select("id").like("notes", "[DEMO]%");
  if (demoBids && demoBids.length > 0) {
    const bidIds = demoBids.map((b: any) => b.id);
    await supabase.from("bid_evaluations").delete().in("bid_project_id", bidIds);
    await supabase.from("bid_documents").delete().in("bid_project_id", bidIds);
    // Get submission ids for contract cleanup
    const { data: demoSubs } = await supabase.from("bid_submissions").select("id").in("bid_project_id", bidIds);
    if (demoSubs && demoSubs.length > 0) {
      await supabase.from("bid_contracts").delete().in("submission_id", demoSubs.map((s: any) => s.id));
    }
    await supabase.from("bid_submissions").delete().in("bid_project_id", bidIds);
  }
  await supabase.from("bid_projects").delete().like("notes", "[DEMO]%");

  // Budget
  await supabase.from("budget_transfers").delete().like("notes", "[DEMO]%");
  await supabase.from("budget_executions").delete().like("notes", "[DEMO]%");
  const { data: demoPlans } = await supabase.from("budget_plans").select("id").like("notes", "[DEMO]%");
  if (demoPlans && demoPlans.length > 0) {
    const planIds = demoPlans.map((p: any) => p.id);
    await supabase.from("budget_items").delete().in("plan_id", planIds);
  }
  await supabase.from("budget_plans").delete().like("notes", "[DEMO]%");

  // Revenue
  await supabase.from("revenue_daily").delete().like("notes", "[DEMO]%");

  // Complaints
  const { data: demoComplaints } = await supabase.from("complaints").select("id").like("notes", "[DEMO]%");
  if (demoComplaints && demoComplaints.length > 0) {
    await supabase.from("complaint_comments").delete().in("complaint_id", demoComplaints.map((c: any) => c.id));
  }
  await supabase.from("complaints").delete().like("notes", "[DEMO]%");

  // Operations
  await supabase.from("fee_exemptions").delete().like("notes", "[DEMO]%");
  await supabase.from("outsourcing_contracts").delete().like("notes", "[DEMO]%");
  await supabase.from("monthly_passes").delete().like("notes", "[DEMO]%");
  await supabase.from("enforcement_records").delete().like("notes", "[DEMO]%");
  await supabase.from("operations_staff").delete().like("notes", "[DEMO]%");

  // Facility
  await supabase.from("surface_markings").delete().like("notes", "[DEMO]%");
  await supabase.from("maintenance_schedules").delete().like("notes", "[DEMO]%");
  await supabase.from("safety_inspections").delete().like("notes", "[DEMO]%");
  await supabase.from("maintenance_logs").delete().like("notes", "[DEMO]%");
  await supabase.from("equipment").delete().like("notes", "[DEMO]%");

  // Parking lots reset
  await supabase.from("parking_lots").update({ notes: null }).like("notes", "[DEMO]%");

  console.log("✅ Demo data cleanup completed");
}
