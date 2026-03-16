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

async function batchInsert(supabase: any, table: string, rows: any[], batchSize = 200) {
  if (!rows || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`❌ ${table} insert error (batch ${i}-${i + batch.length}):`, error.message, error.details, error.hint);
      // Try inserting one by one to find the bad row
      if (batch.length > 1 && batch.length <= 10) {
        for (const row of batch) {
          const { error: singleErr } = await supabase.from(table).insert(row);
          if (singleErr) console.error(`  ↳ ${table} single row error:`, singleErr.message, JSON.stringify(row).slice(0, 200));
        }
      }
    }
  }
  console.log(`✅ ${table}: ${rows.length} rows inserted`);
}

// ══════════════════════════════════════════════════════════════════
//  SEED – 전체 모듈 데모 데이터
// ══════════════════════════════════════════════════════════════════
async function runSeed(supabase: any, userId: string) {
  // 매번 재생성 전에 기존 데모 데이터 정리
  await runCleanup(supabase);

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
  const { data: demoEq } = await supabase
    .from("equipment")
    .select("id, lot_id, name, equipment_type")
    .like("notes", "[DEMO]%");

  // Maintenance schedules (12)
  if (demoEq && demoEq.length > 0) {
    const scheduleRows = demoEq.slice(0, 12).map((eq: any, i: number) => ({
      lot_id: eq.lot_id,
      equipment_id: eq.id,
      schedule_name: `${eq.name} ${pick(["월간 정기점검", "분기 예방정비", "반기 기능점검", "연간 교체점검"])}`,
      schedule_type: pick(["monthly", "quarterly", "semi_annual", "yearly"]),
      description: `[DEMO] ${eq.name}에 대한 예방정비 일정입니다.`,
      checklist: [
        { item: "외관 점검", required: true },
        { item: "전원/통신 상태 확인", required: true },
        { item: "작동 테스트", required: true },
      ],
      assigned_team: pick(["facilities", "operations"]),
      assigned_to: userId,
      vendor_name: pick(["파킹클라우드", "한화비전", "아마노코리아"]),
      estimated_cost: rnd(100000, 700000),
      estimated_hours: rnd(1, 6),
      last_completed: daysAgo(rnd(10, 90)),
      next_due_date: daysFromNow(rnd(1, 90)),
      recurrence_rule: { interval: 1, unit: "month" },
      advance_notice_days: pick([3, 7, 14]),
      is_active: true,
      created_by: userId,
    }));
    await batchInsert(supabase, "maintenance_schedules", scheduleRows);
  }

  const { data: demoSchedules } = await supabase
    .from("maintenance_schedules")
    .select("id, lot_id, equipment_id, schedule_name")
    .like("description", "[DEMO]%");

  // Maintenance logs (30)
  if (demoEq && demoEq.length > 0) {
    const maintRows = demoEq.slice(0, 30).map((eq: any, i: number) => {
      const linkedSchedule = demoSchedules?.find((s: any) => s.equipment_id === eq.id) ?? null;
      const status = pick(["reported", "assigned", "in_progress", "pending_parts", "completed", "verified"]);
      const reportedAt = new Date(Date.now() - rnd(3, 120) * 86400000).toISOString();
      const assignedAt = ["assigned", "in_progress", "pending_parts", "completed", "verified"].includes(status)
        ? new Date(Date.now() - rnd(2, 90) * 86400000).toISOString()
        : null;
      const startedAt = ["in_progress", "pending_parts", "completed", "verified"].includes(status)
        ? new Date(Date.now() - rnd(1, 60) * 86400000).toISOString()
        : null;
      const completedAt = ["completed", "verified"].includes(status)
        ? new Date(Date.now() - rnd(0, 30) * 86400000).toISOString()
        : null;
      return {
        log_number: `ML-DEMO-${String(i + 1).padStart(4, "0")}`,
        lot_id: eq.lot_id,
        equipment_id: eq.id,
        schedule_id: linkedSchedule?.id ?? null,
        maintenance_type: linkedSchedule ? "scheduled" : pick(["emergency", "repair", "replacement", "inspection"]),
        priority: pick(["low", "medium", "high", "critical"]),
        title: `${eq.name} ${pick(["정기점검", "오류 조치", "부품 교체", "작동 불량 수리"])}`,
        description: `[DEMO] ${eq.name} 관련 유지보수 작업 내역입니다.`,
        symptom: pick(["통신 끊김", "전원 불안정", "영상 품질 저하", "결제 응답 지연", "센서 오작동"]),
        cause: pick(["노후 부품", "배선 접촉 불량", "소프트웨어 오류", "외부 충격", "정기점검 대상"]),
        resolution: ["completed", "verified"].includes(status) ? pick(["부품 교체 완료", "재부팅 및 펌웨어 업데이트", "배선 정비 완료", "센서 재보정 완료"]) : null,
        reported_by: userId,
        reported_at: reportedAt,
        assigned_to: assignedAt ? userId : null,
        assigned_at: assignedAt,
        vendor_name: pick(["파킹클라우드", "한화비전", "제주시설관리"]),
        vendor_contact: `010-${rnd(1000, 9999)}-${rnd(1000, 9999)}`,
        parts_used: ["completed", "verified"].includes(status) ? [{ name: pick(["전원모듈", "카메라렌즈", "통신보드", "센서배터리"]), qty: 1, unit_cost: rnd(30000, 250000) }] : [],
        labor_hours: rnd(1, 8),
        parts_cost: rnd(0, 400000),
        labor_cost: rnd(50000, 300000),
        other_cost: rnd(0, 100000),
        downtime_hours: status === "verified" || status === "completed" ? rnd(1, 12) : null,
        started_at: startedAt,
        completed_at: completedAt,
        checklist_results: linkedSchedule ? [{ item: "외관 점검", result: "pass" }, { item: "작동 테스트", result: status === "pending_parts" ? "pending" : "pass" }] : [],
        status,
        closed_by: ["verified"].includes(status) ? userId : null,
        closed_at: ["verified"].includes(status) ? completedAt : null,
        satisfaction_score: ["verified"].includes(status) ? rnd(4, 5) : null,
        notes: "[DEMO] 데모 유지보수",
      };
    });
    await batchInsert(supabase, "maintenance_logs", maintRows);
  }

  // Safety inspections (12)
  const grades = ["A", "A", "B", "B", "B", "C", "C", "D", "A", "B", "C", "F"];
  const inspRows = topLots.slice(0, 12).map((lot: any, i: number) => {
    const grade = grades[i];
    const failItems = grade === "A" ? 0 : grade === "B" ? 1 : grade === "C" ? 3 : grade === "D" ? 5 : 6;
    const passItems = 17 - failItems;
    return {
      inspection_number: `SI-DEMO-${String(i + 1).padStart(4, "0")}`,
      lot_id: lot.id,
      inspection_type: pick(["monthly", "quarterly", "semi_annual", "special"]),
      inspection_date: daysAgo(rnd(1, 180)),
      inspector_id: userId,
      inspector_name: pick(["관리자", "김점검", "이안전", "박시설"]),
      inspector_org: pick(["시설관리팀", "외부안전진단기관", "운영관리팀"]),
      checklist_template: "facility-default",
      checklist_results: [
        { category: "구조안전", item: "바닥 균열/파손", result: grade === "F" ? "fail" : "pass", severity: grade === "F" ? "high" : undefined },
        { category: "전기안전", item: "조명 작동", result: ["D", "F"].includes(grade) ? "fail" : "pass", severity: ["D", "F"].includes(grade) ? "medium" : undefined },
        { category: "소방안전", item: "소화기 비치/유효기한", result: grade === "C" ? "fail" : "pass", severity: grade === "C" ? "low" : undefined },
      ],
      total_items: 17,
      pass_items: passItems,
      fail_items: failItems,
      na_items: 0,
      overall_grade: grade,
      issues_found: failItems > 0 ? `[DEMO] ${lot.name} 현장에 시정 필요 항목 ${failItems}건 발견` : null,
      corrective_actions: failItems > 0 ? "조명 교체, 소화기 재배치, 노면 미끄럼 구간 보수" : null,
      correction_deadline: failItems > 0 ? daysFromNow(rnd(7, 30)) : null,
      follow_up_required: failItems > 0,
      follow_up_date: failItems > 0 ? daysFromNow(rnd(10, 40)) : null,
      status: "completed",
      notes: "[DEMO] 데모 안전점검",
      created_by: userId,
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
    { exemption_name: "장애인 감면", exemption_type: "disabled", discount_type: "rate", discount_rate: 50, legal_basis: "주차장법 제10조" },
    { exemption_name: "국가유공자 감면", exemption_type: "veteran", discount_type: "rate", discount_rate: 50, legal_basis: "국가유공자법" },
    { exemption_name: "경차 감면", exemption_type: "compact_car", discount_type: "rate", discount_rate: 50, legal_basis: "주차장법" },
    { exemption_name: "전기차 감면", exemption_type: "ev", discount_type: "rate", discount_rate: 50, legal_basis: "환경부 고시" },
    { exemption_name: "다자녀 감면", exemption_type: "multi_child", discount_type: "rate", discount_rate: 50, legal_basis: "지자체 조례" },
    { exemption_name: "임산부 감면", exemption_type: "pregnant", discount_type: "rate", discount_rate: 50, legal_basis: "지자체 조례" },
    { exemption_name: "공무 차량", exemption_type: "official", discount_type: "full", discount_rate: 100, legal_basis: "지자체 내규" },
    { exemption_name: "30분 무료", exemption_type: "free_time", discount_type: "time", max_hours: 0.5, legal_basis: "주차장 조례" },
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

  // Complaint comments (2~3 per complaint)
  const { data: insertedComplaints } = await supabase.from("complaints").select("id, title, status, complaint_number").like("notes", "[DEMO]%");
  if (insertedComplaints && insertedComplaints.length > 0) {
    const commentRows: any[] = [];
    for (const comp of insertedComplaints) {
      // Initial receipt comment
      commentRows.push({
        complaint_id: comp.id,
        author_id: userId,
        author_name: "관리자",
        content: `${comp.complaint_number} 민원이 접수되었습니다. 담당부서에서 확인 후 처리하겠습니다.`,
        comment_type: "internal",
        is_system: true,
        created_at: new Date(Date.now() - rnd(60, 180) * 86400000).toISOString(),
      });
      // Processing comment
      if (["responded", "closed"].includes(comp.status)) {
        commentRows.push({
          complaint_id: comp.id,
          author_id: userId,
          author_name: "관리자",
          content: pick([
            "현장 확인 완료하였습니다. 시설팀에 보수 요청하였습니다.",
            "해당 건에 대해 조치 완료하였습니다.",
            "관련 부서와 협의하여 처리 중입니다.",
            "민원인에게 전화 회신 완료하였습니다.",
          ]),
          comment_type: "internal",
          created_at: new Date(Date.now() - rnd(30, 59) * 86400000).toISOString(),
        });
      }
      // Response comment
      if (comp.status === "closed") {
        commentRows.push({
          complaint_id: comp.id,
          author_id: userId,
          author_name: "관리자",
          content: pick([
            "조치 완료되어 민원 종결합니다.",
            "시설 보수 완료 후 민원인 확인 받았습니다.",
            "요금 관련 안내 완료하여 종결합니다.",
          ]),
          comment_type: "external",
          created_at: new Date(Date.now() - rnd(1, 29) * 86400000).toISOString(),
        });
      }
    }
    await batchInsert(supabase, "complaint_comments", commentRows);
  }

  // ══════════════════════════════════════════
  //  4. 수입관리 – revenue_daily (10개 주차장 × 30일 = 300건)
  // ══════════════════════════════════════════
  const revLots = bigLots.slice(0, 10);
  const allRevRows: any[] = [];
  for (const lot of revLots) {
    const dailyBase = Math.max(lot.total_spaces, 30) * 500;
    for (let d = 1; d <= 30; d++) {
      const dateStr = daysAgo(d);
      const weekday = new Date(dateStr).getDay();
      const factor = (weekday === 0 || weekday === 6) ? 0.6 : 1.0;
      allRevRows.push({
        lot_id: lot.id,
        revenue_date: dateStr,
        cash_amount: Math.floor(dailyBase * 0.15 * factor * (0.8 + Math.random() * 0.4)),
        card_amount: Math.floor(dailyBase * 0.6 * factor * (0.8 + Math.random() * 0.4)),
        mobile_amount: Math.floor(dailyBase * 0.25 * factor * (0.8 + Math.random() * 0.4)),
        monthly_pass_amount: Math.floor(dailyBase * 0.18 * factor * (0.8 + Math.random() * 0.3)),
        other_amount: Math.floor(dailyBase * 0.05 * factor * (0.7 + Math.random() * 0.3)),
        total_amount: Math.floor(dailyBase * factor * (0.8 + Math.random() * 0.4)),
        total_vehicles: Math.floor(Math.max(lot.total_spaces, 30) * factor * (0.5 + Math.random() * 1.5)),
        peak_hour_vehicles: Math.floor(Math.max(lot.total_spaces, 30) * factor * (0.08 + Math.random() * 0.08)),
        peak_hour: `${rnd(8, 19)}:00`,
        avg_parking_minutes: rnd(35, 180),
        turnover_rate: rnd(80, 260),
        exemption_count: rnd(0, 20),
        exemption_amount: rnd(0, 300000),
        exemption_detail: { disabled: rnd(0, 5), veteran: rnd(0, 4), compact: rnd(0, 8) },
        data_source: "demo_seed",
        source_detail: "[DEMO] generated revenue",
        verified: d > 7,
      });
    }
  }
  await batchInsert(supabase, "revenue_daily", allRevRows);

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
    // Bid evaluations (for each submission)
    const { data: insertedSubs } = await supabase.from("bid_submissions").select("id, bid_project_id, bid_amount, company_name").like("notes", "[DEMO]%");
    if (insertedSubs && insertedSubs.length > 0) {
      const evalRows: any[] = [];
      for (const sub of insertedSubs) {
        const techScore = rnd(60, 95);
        const priceScore = rnd(70, 100);
        const totalScore = Math.round(techScore * 0.6 + priceScore * 0.4);
        evalRows.push({
          bid_project_id: sub.bid_project_id,
          submission_id: sub.id,
          technical_score: techScore,
          price_score: priceScore,
          business_score: rnd(60, 90),
          total_score: totalScore,
          rank: null,
          is_qualified: totalScore >= 70,
          evaluation_date: daysAgo(rnd(5, 30)),
          evaluator_name: pick(staffNames.slice(0, 5)),
          strengths: pick(["기술력 우수", "실적 다수", "가격 경쟁력", "인력 구성 우수"]),
          weaknesses: pick(["납기 일정 촉박", "유사실적 부족", "인력 교체 우려", "가격 다소 높음"]),
          comments: "[DEMO] 데모 평가",
        });
      }
      await batchInsert(supabase, "bid_evaluations", evalRows);

      // Bid contracts (1 per bid project - winner)
      const bidProjectMap: Record<string, any[]> = {};
      for (const sub of insertedSubs) {
        if (!bidProjectMap[sub.bid_project_id]) bidProjectMap[sub.bid_project_id] = [];
        bidProjectMap[sub.bid_project_id].push(sub);
      }
      const bContractRows: any[] = [];
      for (const [bidProjId, subs] of Object.entries(bidProjectMap)) {
        const winner = subs[0];
        bContractRows.push({
          bid_project_id: bidProjId,
          submission_id: winner.id,
          contract_number: `BC-DEMO-${String(bContractRows.length + 1).padStart(4, "0")}`,
          contract_date: daysAgo(rnd(10, 60)),
          contract_amount: winner.bid_amount || rnd(50000000, 200000000),
          vat_amount: Math.floor((winner.bid_amount || 100000000) * 0.1),
          total_amount: Math.floor((winner.bid_amount || 100000000) * 1.1),
          contractor_name: winner.company_name,
          contractor_representative: pick(staffNames),
          contractor_business_number: `${rnd(100, 999)}-${rnd(10, 99)}-${rnd(10000, 99999)}`,
          contract_start: daysAgo(rnd(1, 30)),
          contract_end: daysFromNow(rnd(90, 365)),
          performance_bond_rate: 10,
          performance_bond_amount: Math.floor((winner.bid_amount || 100000000) * 0.1),
          status: pick(["signed", "signed", "in_progress"]),
          special_conditions: "[DEMO] 데모 계약 특약사항",
        });
      }
      await batchInsert(supabase, "bid_contracts", bContractRows);
    }

    // Bid documents (3 per project)
    const bidDocRows: any[] = [];
    for (const bid of insertedBids) {
      const docs = [
        { title: "입찰공고문", doc_type: "announcement", doc_category: "bid" },
        { title: "설계서", doc_type: "specification", doc_category: "bid" },
        { title: "과업지시서", doc_type: "scope_of_work", doc_category: "bid" },
      ];
      for (const doc of docs) {
        bidDocRows.push({
          bid_project_id: bid.id,
          ...doc,
          file_path: `/demo/${doc.doc_type}.pdf`,
          is_public: true,
          is_current: true,
          version: "1.0",
        });
      }
    }
    await batchInsert(supabase, "bid_documents", bidDocRows);
  }

  // Free hours settings (for top lots)
  const freeHoursRows = topLots.slice(0, 8).flatMap((lot: any) => [
    {
      lot_id: lot.id,
      setting_name: `${lot.name} 평일 무료시간`,
      day_type: "weekday",
      start_time: "00:00",
      end_time: "23:59",
      reason: "입차 후 30분 무료",
      effective_from: `${currentYear}-01-01`,
      is_active: true,
    },
    {
      lot_id: lot.id,
      setting_name: `${lot.name} 주말 무료시간`,
      day_type: "weekend",
      start_time: "00:00",
      end_time: "23:59",
      reason: "주말/공휴일 60분 무료",
      effective_from: `${currentYear}-01-01`,
      is_active: true,
    },
  ]);
  await batchInsert(supabase, "free_hours_settings", freeHoursRows);

  // ══════════════════════════════════════════
  //  7. 용역사업관리 – service_projects, milestones, issues, inspections, payments, deliverables
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

  const { data: insertedSvcProjects } = await supabase.from("service_projects").insert(svcProjectRows).select("id, title, total_amount, contract_amount");

  if (insertedSvcProjects && insertedSvcProjects.length > 0) {
    // Milestones
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

    // Service Issues (3~5 per project)
    const issueTypes = ["scope_change", "schedule_delay", "quality_issue", "budget_overrun", "contract_dispute", "safety_incident"];
    const severities = ["low", "medium", "high", "critical"];
    const issueRows: any[] = [];
    let issueNum = 0;
    for (const proj of insertedSvcProjects) {
      const count = rnd(2, 4);
      for (let i = 0; i < count; i++) {
        issueNum++;
        const severity = pick(severities);
        issueRows.push({
          issue_number: `ISS-DEMO-${String(issueNum).padStart(4, "0")}`,
          project_id: proj.id,
          issue_type: pick(issueTypes),
          severity,
          title: pick([
            "공정 지연으로 인한 일정 조정 필요",
            "자재 가격 상승에 따른 설계변경",
            "시공 품질 미달 시정 요청",
            "안전관리 계획 미이행",
            "하도급 업체 교체 요청",
            "기성금 청구 내역 불일치",
            "현장 근로자 안전교육 미실시",
            "설계도면과 현장 불일치",
          ]),
          description: `[DEMO] ${proj.title} 관련 이슈입니다. 조치가 필요합니다.`,
          status: pick(["open", "open", "in_progress", "in_progress", "resolved", "closed"]),
          impact_amount: severity === "critical" ? rnd(10000000, 50000000) : severity === "high" ? rnd(1000000, 10000000) : rnd(0, 1000000),
          impact_days: severity === "critical" ? rnd(10, 30) : severity === "high" ? rnd(3, 10) : rnd(0, 3),
          reported_at: new Date(Date.now() - rnd(1, 120) * 86400000).toISOString(),
          notes: "[DEMO] 데모 이슈",
        });
      }
    }
    await batchInsert(supabase, "service_issues", issueRows);

    // Service Inspections (2 per project)
    const inspectionRows: any[] = [];
    let inspNum = 0;
    for (const proj of insertedSvcProjects) {
      for (let seq = 1; seq <= 2; seq++) {
        inspNum++;
        const targetAmt = Math.floor((proj.contract_amount || 0) * (seq === 1 ? 0.3 : 0.7));
        inspectionRows.push({
          inspection_number: `SINSP-DEMO-${String(inspNum).padStart(4, "0")}`,
          project_id: proj.id,
          inspection_seq: seq,
          inspection_type: seq === 1 ? "interim" : "final",
          inspection_date: seq === 1 ? daysAgo(rnd(30, 90)) : daysFromNow(rnd(10, 60)),
          title: `${proj.title} ${seq === 1 ? "중간검사" : "최종검사"}`,
          target_amount: targetAmt,
          approved_amount: seq === 1 ? Math.floor(targetAmt * 0.95) : null,
          result: seq === 1 ? pick(["pass", "conditional_pass"]) : null,
          result_note: seq === 1 ? "[DEMO] 일부 보완 사항 있으나 전반적으로 양호" : null,
          status: seq === 1 ? "completed" : "pending",
          inspector_id: userId,
          inspector_name: "관리자",
          total_items: 10,
          pass_items: seq === 1 ? rnd(7, 10) : null,
          fail_items: seq === 1 ? rnd(0, 3) : null,
          notes: "[DEMO] 데모 검사",
        });
      }
    }
    await batchInsert(supabase, "service_inspections", inspectionRows);

    // Service Payments (2 per project)
    const paymentRows: any[] = [];
    let payNum = 0;
    for (const proj of insertedSvcProjects) {
      for (let seq = 1; seq <= 2; seq++) {
        payNum++;
        const grossAmt = Math.floor((proj.total_amount || 0) * (seq === 1 ? 0.3 : 0.4));
        paymentRows.push({
          payment_number: `SPAY-DEMO-${String(payNum).padStart(4, "0")}`,
          project_id: proj.id,
          payment_seq: seq,
          payment_type: seq === 1 ? "interim" : "completion",
          request_date: seq === 1 ? daysAgo(rnd(30, 60)) : daysAgo(rnd(1, 29)),
          title: `${proj.title} ${seq === 1 ? "기성금" : "준공금"}`,
          gross_amount: grossAmt,
          advance_deduction: 0,
          other_deduction: Math.floor(grossAmt * 0.03),
          deduction_detail: { retention: Math.floor(grossAmt * 0.03) },
          status: seq === 1 ? "paid" : pick(["requested", "reviewing", "approved"]),
          paid_amount: seq === 1 ? Math.floor(grossAmt * 0.97) : null,
          paid_date: seq === 1 ? daysAgo(rnd(10, 30)) : null,
          payment_method: "transfer",
          bank_name: pick(["국민은행", "신한은행", "농협"]),
          bank_account: `${rnd(100, 999)}-${rnd(10, 99)}-${rnd(100000, 999999)}`,
          notes: "[DEMO] 데모 대금",
        });
      }
    }
    await batchInsert(supabase, "service_payments", paymentRows);

    // Service Deliverables (3 per project)
    const deliverableRows: any[] = [];
    let delNum = 0;
    for (const proj of insertedSvcProjects) {
      const deliverables = [
        { title: "착수보고서", deliverable_type: "report", sort_order: 1, status: "accepted" },
        { title: "중간보고서", deliverable_type: "report", sort_order: 2, status: pick(["submitted", "reviewing", "accepted"]) },
        { title: "최종보고서", deliverable_type: "report", sort_order: 3, status: "pending" },
      ];
      for (const del of deliverables) {
        delNum++;
        deliverableRows.push({
          deliverable_number: `DEL-DEMO-${String(delNum).padStart(4, "0")}`,
          project_id: proj.id,
          ...del,
          description: `[DEMO] ${proj.title} ${del.title}`,
          required_copies: rnd(3, 10),
          format_required: "PDF + 한글",
        });
      }
    }
    await batchInsert(supabase, "service_deliverables", deliverableRows);
  }

  // ══════════════════════════════════════════
  //  8. 신설기획 – site_candidates, construction_projects, permits
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
  const { data: insertedConstProjects } = await supabase.from("construction_projects").insert(constRows).select("id, project_name");

  if (insertedConstProjects && insertedConstProjects.length > 0) {
    // Design documents
    const designDocRows: any[] = [];
    let ddNum = 0;
    for (const proj of insertedConstProjects) {
      const docTypes = [
        { title: "기본설계도", doc_type: "basic_design", category: "design" },
        { title: "실시설계도", doc_type: "detailed_design", category: "design" },
        { title: "구조계산서", doc_type: "structural_calc", category: "engineering" },
        { title: "전기설비도", doc_type: "electrical", category: "engineering" },
      ];
      for (const doc of docTypes) {
        ddNum++;
        designDocRows.push({
          doc_number: `DD-DEMO-${String(ddNum).padStart(4, "0")}`,
          project_id: proj.id,
          title: `${proj.project_name} ${doc.title}`,
          doc_type: doc.doc_type,
          category: doc.category,
          description: `[DEMO] ${proj.project_name} ${doc.title}`,
          version: "1.0",
          file_path: `/demo/design/${doc.doc_type}.pdf`,
          review_status: pick(["approved", "approved", "reviewing", "draft"]),
          is_current: true,
        });
      }
    }
    await batchInsert(supabase, "design_documents", designDocRows);

    // Permits (3~4 per construction project)
    const permitRows: any[] = [];
    let permitNum = 0;
    for (const proj of insertedConstProjects) {
      const permitTypes = [
        { permit_type: "building_permit", authority: "제주시 건축과", permit_category: "건축" },
        { permit_type: "traffic_impact", authority: "제주시 교통과", permit_category: "교통" },
        { permit_type: "environment", authority: "제주도 환경정책과", permit_category: "환경" },
        { permit_type: "fire_safety", authority: "제주소방서", permit_category: "소방" },
      ];
      for (const pt of permitTypes) {
        permitNum++;
        const applied = daysAgo(rnd(60, 200));
        permitRows.push({
          project_id: proj.id,
          permit_number: `PRM-DEMO-${String(permitNum).padStart(4, "0")}`,
          permit_type: pt.permit_type,
          permit_category: pt.permit_category,
          authority: pt.authority,
          authority_department: pt.authority,
          application_date: applied,
          target_approval_date: daysFromNow(rnd(10, 60)),
          actual_approval_date: Math.random() > 0.4 ? daysAgo(rnd(1, 50)) : null,
          status: pick(["approved", "approved", "in_review", "submitted", "not_started"]),
          fee_amount: rnd(100000, 2000000),
          fee_paid: Math.random() > 0.3,
          notes: "[DEMO] 데모 인허가",
        });
      }
    }
    await batchInsert(supabase, "permits", permitRows);
  }

  // ══════════════════════════════════════════
  //  9. 실시간 – sensor_devices, gateway_devices, lot_realtime_status, display_boards, parking_spaces, sensor_readings
  // ══════════════════════════════════════════
  const gwRows = topLots.slice(0, 5).map((lot: any, i: number) => ({
    device_id: `GW-DEMO-${String(i + 1).padStart(3, "0")}`,
    device_name: `${lot.name} 게이트웨이`,
    lot_id: lot.id,
    ip_address: `192.168.${rnd(1, 10)}.${rnd(1, 254)}`,
    status: pick(["active", "active", "active", "offline"]),
    protocol: pick(["lorawan", "nb-iot"]),
    connected_sensors: rnd(5, 30),
    max_sensors: 50,
    firmware_version: "v1.2.0",
    notes: "[DEMO] 데모 게이트웨이",
  }));
  const { data: insertedGws } = await supabase.from("gateway_devices").insert(gwRows).select("id, lot_id");

  const sensorRows: any[] = [];
  if (insertedGws && insertedGws.length > 0) {
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
          status: pick(["active", "active", "active", "low_battery", "offline"]),
          battery_level: rnd(20, 100),
          rssi: -rnd(40, 100),
          firmware_version: "v2.1.3",
          last_reading: new Date().toISOString(),
          total_readings: rnd(1000, 50000),
          error_count: rnd(0, 10),
          notes: "[DEMO] 데모 센서",
        });
      }
    }
    await batchInsert(supabase, "sensor_devices", sensorRows);

    // Sensor readings (5 recent readings per sensor)
    const readingRows: any[] = [];
    for (const sensor of sensorRows.slice(0, 20)) {
      for (let r = 0; r < 5; r++) {
        const t = new Date(Date.now() - r * 60000 * rnd(1, 10));
        readingRows.push({
          device_id: sensor.device_id,
          lot_id: sensor.lot_id,
          time: t.toISOString(),
          occupied: Math.random() > 0.4,
          battery_level: sensor.battery_level - r,
          rssi: sensor.rssi + rnd(-5, 5),
        });
      }
    }
    await batchInsert(supabase, "sensor_readings", readingRows);
  }

  // Parking spaces (주차면 배치 - for ParkingLayout page)
  const spaceRows: any[] = [];
  for (const lot of topLots.slice(0, 8)) {
    const zones = ["A", "B", "C"];
    for (const zone of zones) {
      const count = rnd(10, Math.min(30, Math.floor(lot.total_spaces / 3)));
      for (let s = 1; s <= count; s++) {
        const sensorMatch = sensorRows.find((sr: any) => sr.lot_id === lot.id && sr.zone === zone);
        spaceRows.push({
          lot_id: lot.id,
          floor: 1,
          zone: zone,
          space_number: `${zone}-${String(s).padStart(3, "0")}`,
          space_type: s <= 2 ? "disabled" : s <= 3 ? "ev" : "general",
          has_sensor: !!sensorMatch,
          sensor_id: sensorMatch ? sensorMatch.device_id : null,
          status: pick(["active", "active", "active", "maintenance"]),
        });
      }
    }
  }
  await batchInsert(supabase, "parking_spaces", spaceRows);

  // Display boards
  const displayRows = topLots.slice(0, 8).map((lot: any, i: number) => ({
    board_id: `DSP-DEMO-${String(i + 1).padStart(3, "0")}`,
    board_name: `${lot.name} ${pick(["입구 안내판", "출구 안내판", "내부 안내판"])}`,
    lot_id: lot.id,
    display_type: pick(["led", "lcd"]),
    location_type: pick(["entrance", "exit", "indoor"]),
    status: pick(["active", "active", "offline"]),
    ip_address: `192.168.${rnd(1, 10)}.${rnd(100, 200)}`,
    current_message: `주차가능 ${rnd(5, 100)}면`,
    protocol: pick(["http", "serial_rs232"]),
    notes: "[DEMO] 데모 전광판",
  }));
  await batchInsert(supabase, "display_boards", displayRows);

  // Lot realtime status (no notes column - use status for cleanup)
  const rtRows = topLots.slice(0, 10).map((lot: any) => {
    const occupied = rnd(Math.floor(lot.total_spaces * 0.3), lot.total_spaces);
    return {
      lot_id: lot.id,
      total_spaces: lot.total_spaces,
      occupied_spaces: occupied,
      available_spaces: lot.total_spaces - occupied,
      occupancy_rate: Math.round(occupied / lot.total_spaces * 100),
      congestion_level: pick(["empty", "normal", "crowded", "full"]),
      status: "normal",
      today_total_in: rnd(50, 500),
      today_total_out: rnd(40, 480),
      today_peak_occupied: rnd(Math.floor(lot.total_spaces * 0.7), lot.total_spaces),
      today_peak_time: `${rnd(10, 15)}:${rnd(0, 59).toString().padStart(2, "0")}`,
      last_updated: new Date().toISOString(),
    };
  });
  for (const rt of rtRows) {
    await supabase.from("lot_realtime_status").upsert(rt, { onConflict: "lot_id" });
  }

  // ══════════════════════════════════════════
  //  10. 운영 – fee_policies (요금정책)
  // ══════════════════════════════════════════
  const feePolicyRows = topLots.slice(0, 10).flatMap((lot: any) => [
    {
      lot_id: lot.id, policy_name: `${lot.name} 평일 요금`, day_type: "weekday",
      time_start: "08:00", time_end: "20:00",
      base_minutes: 30, base_fee: 500, add_minutes: 10, add_fee: 200,
      daily_max: 10000, monthly_pass_fee: 70000,
      is_active: true, effective_from: `${currentYear}-01-01`,
      legal_basis: "주차장 조례", notes: "[DEMO] 데모 요금정책",
    },
    {
      lot_id: lot.id, policy_name: `${lot.name} 주말 요금`, day_type: "weekend",
      time_start: "09:00", time_end: "18:00",
      base_minutes: 60, base_fee: 0, add_minutes: 10, add_fee: 200,
      daily_max: 8000, monthly_pass_fee: 50000,
      is_active: true, effective_from: `${currentYear}-01-01`,
      legal_basis: "주차장 조례", notes: "[DEMO] 데모 요금정책",
    },
  ]);
  await batchInsert(supabase, "fee_policies", feePolicyRows);

  // ══════════════════════════════════════════
  //  11-a. 무료개방 – free_hours_settings
  // ══════════════════════════════════════════
  const freeHoursRows = topLots.slice(0, 8).flatMap((lot: any) => [
    {
      lot_id: lot.id, setting_name: `${lot.name} 야간 무료시간`,
      day_type: "weekday", start_time: "20:00", end_time: "08:00",
      reason: "[DEMO] 야간 무료 개방 (주민 편의)",
      is_active: true, effective_from: `${currentYear}-01-01`,
    },
    {
      lot_id: lot.id, setting_name: `${lot.name} 공휴일 무료시간`,
      day_type: "holiday", start_time: "00:00", end_time: "23:59",
      reason: "[DEMO] 공휴일 전일 무료 개방",
      is_active: true, effective_from: `${currentYear}-01-01`,
    },
  ]);
  await batchInsert(supabase, "free_hours_settings", freeHoursRows);

  // ══════════════════════════════════════════
  //  11-b. 수입 – revenue_reconciliation (정산대사)
  // ══════════════════════════════════════════
  const reconRows = revLots.slice(0, 10).flatMap((lot: any, i: number) => {
    const rows: any[] = [];
    for (let m = 1; m <= 3; m++) {
      const rawMonth = new Date().getMonth() + 1 - m;
      const monthStr = String(rawMonth < 1 ? rawMonth + 12 : rawMonth).padStart(2, "0");
      const sysCash = rnd(2000000, 8000000);
      const sysCard = rnd(8000000, 25000000);
      const sysMobile = rnd(3000000, 10000000);
      const repCash = sysCash + rnd(-200000, 200000);
      const repCard = sysCard + rnd(-100000, 100000);
      const repMobile = sysMobile + rnd(-50000, 50000);
      rows.push({
        lot_id: lot.id,
        recon_number: `RC-DEMO-${String(i * 3 + m).padStart(4, "0")}`,
        period_type: "monthly",
        period_start: `${currentYear}-${monthStr}-01`,
        period_end: `${currentYear}-${monthStr}-${m === 2 ? "28" : "30"}`,
        system_cash: sysCash, system_card: sysCard, system_mobile: sysMobile, system_other: 0,
        system_total: sysCash + sysCard + sysMobile,
        reported_cash: repCash, reported_card: repCard, reported_mobile: repMobile, reported_other: 0,
        reported_total: repCash + repCard + repMobile,
        diff_amount: (repCash + repCard + repMobile) - (sysCash + sysCard + sysMobile),
        diff_analysis: "[DEMO] 시스템 매출과 정산 보고서 비교 데이터",
        status: m === 1 ? "pending" : pick(["matched", "resolved", "discrepancy"]),
        company_name: pick(["(주)제주파킹", "(주)그린주차", "스마트주차관리"]),
        created_by: userId,
      });
    }
    return rows;
  });
  await batchInsert(supabase, "revenue_reconciliation", reconRows);

  // ══════════════════════════════════════════
  //  12. 보고서 – report_templates, report_generated, report_schedules
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
    target_audience: "internal",
    required_modules: ["CORE", "OPS"],
    data_sources: [{ table: "parking_lots" }],
    parameters: [{ name: "period", type: t.report_type, label: "기간", required: true }],
    page_size: "A4",
    page_orientation: "portrait",
    template_format: "pdf",
    sort_order: rnd(20, 30),
  }));
  await batchInsert(supabase, "report_templates", templateRows);

  // Report generated (from templates)
  const { data: insertedTemplates } = await supabase.from("report_templates").select("id, name, report_type").like("template_code", "RPT-DEMO%");
  if (insertedTemplates && insertedTemplates.length > 0) {
    const genRows: any[] = [];
    let rptNum = 0;
    for (const tmpl of insertedTemplates) {
      for (let g = 0; g < 2; g++) {
        rptNum++;
        genRows.push({
          report_number: `RG-DEMO-${String(rptNum).padStart(4, "0")}`,
          template_id: tmpl.id,
          title: `${tmpl.name} - ${currentYear}년 ${rnd(1, 12)}월`,
          period_type: tmpl.report_type,
          period_start: daysAgo(rnd(60, 120)),
          period_end: daysAgo(rnd(1, 59)),
          file_path: `/demo/reports/report_${rptNum}.pdf`,
          file_format: "pdf",
          file_size: rnd(100000, 5000000),
          page_count: rnd(5, 30),
          status: pick(["completed", "completed", "generating"]),
          generation_time_ms: rnd(1000, 15000),
          generated_by: userId,
          summary_data: { total_lots: lots.length, total_revenue: rnd(50000000, 200000000) },
        });
      }
    }
    await batchInsert(supabase, "report_generated", genRows);

    // Report schedules
    const schedRows = insertedTemplates.slice(0, 3).map((tmpl: any, i: number) => ({
      schedule_name: `${tmpl.name} 자동 발송`,
      template_id: tmpl.id,
      frequency: pick(["monthly", "quarterly"]),
      day_of_month: pick([1, 5, 10, 15]),
      execution_time: "06:00",
      recipients: [{ type: "email", value: "admin@parkmaster.kr" }],
      send_method: "notification",
      output_format: "pdf",
      include_excel: true,
      is_active: true,
      run_count: rnd(1, 12),
      next_run: daysFromNow(rnd(1, 30)) + "T06:00:00Z",
      last_status: "success",
      created_by: userId,
    }));
    await batchInsert(supabase, "report_schedules", schedRows);
  }

  // ══════════════════════════════════════════
  //  13. 결재 – approval_lines, approval_records, approval_steps
  // ══════════════════════════════════════════
  const approvalLineRows = [
    { line_name: "예산 집행 결재", module: "budget", document_type: "execution", is_default: true, steps: [{ step: 1, label: "담당자", role: "editor" }, { step: 2, label: "팀장", role: "manager" }, { step: 3, label: "관리자", role: "admin" }] },
    { line_name: "민원 처리 결재", module: "complaint", document_type: "response", is_default: true, steps: [{ step: 1, label: "담당자", role: "editor" }, { step: 2, label: "팀장", role: "manager" }] },
    { line_name: "용역 대금 결재", module: "service", document_type: "payment", is_default: true, steps: [{ step: 1, label: "감독관", role: "editor" }, { step: 2, label: "팀장", role: "manager" }, { step: 3, label: "관리자", role: "admin" }] },
  ].map(l => ({ ...l, created_by: userId }));
  const { data: insertedLines } = await supabase.from("approval_lines").insert(approvalLineRows).select("id, line_name, module, document_type, steps");

  if (insertedLines && insertedLines.length > 0) {
    const aRecordRows: any[] = [];
    for (const line of insertedLines) {
      const stepsArr = line.steps as any[];
      for (let r = 0; r < 2; r++) {
        aRecordRows.push({
          line_id: line.id,
          module: line.module,
          document_type: line.document_type,
          ref_id: crypto.randomUUID(),
          ref_number: `APR-DEMO-${line.module}-${r + 1}`,
          title: `${line.line_name} 테스트 ${r + 1}`,
          total_steps: stepsArr.length,
          current_step: pick([1, 2, stepsArr.length]),
          status: pick(["in_progress", "approved", "rejected"]),
          initiated_by: userId,
          initiated_at: new Date(Date.now() - rnd(5, 60) * 86400000).toISOString(),
          completed_at: Math.random() > 0.5 ? new Date(Date.now() - rnd(1, 4) * 86400000).toISOString() : null,
        });
      }
    }
    const { data: insertedRecords } = await supabase.from("approval_records").insert(aRecordRows).select("id, total_steps, status");

    if (insertedRecords && insertedRecords.length > 0) {
      const aStepRows: any[] = [];
      for (const rec of insertedRecords) {
        for (let s = 1; s <= rec.total_steps; s++) {
          aStepRows.push({
            record_id: rec.id,
            step_number: s,
            step_label: s === 1 ? "담당자" : s === 2 ? "팀장" : "관리자",
            approver_id: userId,
            approver_name: "관리자",
            action: rec.status === "approved" ? "approved" : s === 1 ? "approved" : "pending",
            comment: s === 1 ? "확인 완료" : null,
            acted_at: s === 1 ? new Date(Date.now() - rnd(1, 30) * 86400000).toISOString() : null,
          });
        }
      }
      await batchInsert(supabase, "approval_steps", aStepRows);
    }
  }

  // ══════════════════════════════════════════
  //  14. 알림 & 메시지
  // ══════════════════════════════════════════
  const notifRows = Array.from({ length: 15 }, (_, i) => ({
    user_id: userId,
    module: pick(["facility", "revenue", "complaint", "ops", "budget", "service"]),
    type: pick(["info", "warning", "success", "error"]),
    title: pick([
      "장비 점검 알림", "민원 접수 알림", "예산 집행 승인", "용역 검수 요청",
      "안전점검 예정", "수입 이상 감지", "정기권 만료 예정", "단속 현황 보고",
    ]),
    message: `[DEMO] 데모 알림 메시지입니다. 확인해 주세요.`,
    link: pick(["/facility/equipment", "/complaint", "/budget/executions", "/service/projects", "/ops/enforcement"]),
    is_read: i < 8,
    read_at: i < 8 ? new Date(Date.now() - rnd(1, 10) * 86400000).toISOString() : null,
    created_at: new Date(Date.now() - rnd(0, 30) * 86400000).toISOString(),
  }));
  await batchInsert(supabase, "notifications", notifRows);

  // Message logs
  const msgRows = Array.from({ length: 10 }, (_, i) => ({
    message_type: pick(["notification", "sms", "email"]),
    channel: pick(["sms", "email", "push"]),
    recipient_name: pick(staffNames),
    recipient_phone: `010-${rnd(1000, 9999)}-${rnd(1000, 9999)}`,
    title: pick(["민원 처리 안내", "정기점검 알림", "예산 승인 통보", "용역 검수 결과"]),
    content: `[DEMO] 데모 메시지 본문입니다.`,
    module: pick(["complaint", "facility", "budget", "service"]),
    status: pick(["sent", "sent", "delivered", "failed"]),
    sent_at: new Date(Date.now() - rnd(1, 60) * 86400000).toISOString(),
    created_by: userId,
  }));
  await batchInsert(supabase, "message_logs", msgRows);

  // ══════════════════════════════════════════
  //  15. 대시보드 위젯
  // ══════════════════════════════════════════
  const widgetRows = [
    { widget_type: "kpi", title: "총 주차장 수", data_source: "parking_lots", chart_type: "number", position_x: 0, position_y: 0, width: 3, height: 2 },
    { widget_type: "chart", title: "월별 수입 추이", data_source: "revenue_daily", chart_type: "line", position_x: 3, position_y: 0, width: 6, height: 4 },
    { widget_type: "chart", title: "민원 유형 분포", data_source: "complaints", chart_type: "pie", position_x: 0, position_y: 2, width: 3, height: 4 },
    { widget_type: "table", title: "최근 민원 목록", data_source: "complaints", chart_type: "table", position_x: 9, position_y: 0, width: 3, height: 4 },
    { widget_type: "kpi", title: "금일 총 수입", data_source: "revenue_daily", chart_type: "number", position_x: 0, position_y: 6, width: 3, height: 2 },
  ].map(w => ({
    ...w,
    user_id: userId,
    dashboard_name: "default",
    data_config: { table: w.data_source },
    chart_config: { type: w.chart_type },
    is_visible: true,
    sort_order: 0,
  }));
  await batchInsert(supabase, "dashboard_widgets", widgetRows);

  // ══════════════════════════════════════════
  //  16. 활동 로그 (20건)
  // ══════════════════════════════════════════
  const logRows = Array.from({ length: 20 }, (_, i) => ({
    user_id: userId,
    user_name: "관리자",
    module: pick(["facility", "revenue", "complaint", "ops", "settings", "budget", "service", "realtime", "report", "planning"]),
    action: pick(["조회", "등록", "수정", "삭제", "엑셀 다운로드", "보고서 생성", "승인", "반려"]),
    target_type: pick(["주차장", "장비", "민원", "수입", "예산", "용역", "인력"]),
    target_name: pick(topLots).name,
    details: { demo: true },
    created_at: new Date(Date.now() - rnd(0, 30) * 86400000).toISOString(),
  }));
  await batchInsert(supabase, "activity_logs", logRows);

  // ══════════════════════════════════════════
  //  17. 현황조사 – surveys, survey_basic_info
  // ══════════════════════════════════════════
  const surveyRows = topLots.slice(0, 5).map((lot: any) => ({
    lot_id: lot.id,
    survey_type: "facility_status",
    status: pick(["draft", "in_progress", "submitted", "approved"]),
    surveyor_id: userId,
    survey_date: daysAgo(rnd(10, 90)),
    notes: "[DEMO] 데모 현황조사",
  }));
  const { data: insertedSurveys } = await supabase.from("surveys").insert(surveyRows).select("id, lot_id");

  if (insertedSurveys && insertedSurveys.length > 0) {
    const basicInfoRows = insertedSurveys.map((srv: any) => {
      const lot = topLots.find((l: any) => l.id === srv.lot_id) || topLots[0];
      return {
        survey_id: srv.id,
        lot_name: lot.name,
        address: `제주시 ${pick(["연동", "노형동", "이도동"])} ${rnd(1, 200)}`,
        lot_type: pick(["offstreet", "onstreet", "multilevel"]),
        lot_type_floor: pick(["지상", "지하", "복층"]),
        operator_type: pick(["direct", "outsourced"]),
        total_spaces: lot.total_spaces,
        disabled_spaces: rnd(1, 6),
        ev_spaces: rnd(0, 5),
        compact_spaces: rnd(0, 12),
        pregnant_spaces: rnd(0, 3),
        other_spaces: rnd(0, 2),
        other_spaces_desc: "임시차량",
        entry_count: rnd(1, 4),
        exit_count: rnd(1, 4),
        entry_exit_same: Math.random() > 0.5,
        surface_type: pick(["ascon", "block", "concrete"]),
        gps_lat: 33.49 + Math.random() * 0.04,
        gps_lng: 126.51 + Math.random() * 0.06,
      };
    });
    await batchInsert(supabase, "survey_basic_info", basicInfoRows);
  }

  console.log("✅ Demo data seed completed for ALL modules (5-depth)");
}

// ══════════════════════════════════════════════════════════════════
//  CLEANUP – 데모 데이터 삭제
// ══════════════════════════════════════════════════════════════════
async function runCleanup(supabase: any) {
  console.log("🧹 Starting demo data cleanup...");

  // Activity logs
  await supabase.from("activity_logs").delete().eq("details->>demo", "true");

  // Dashboard widgets
  await supabase.from("dashboard_widgets").delete().like("data_config->>table", "%");
  // Delete dashboard widgets by checking user-created ones (we'll delete all for demo user)

  // Notifications & messages
  await supabase.from("notifications").delete().like("message", "[DEMO]%");
  await supabase.from("message_logs").delete().like("content", "[DEMO]%");

  // Approvals - steps first, then records, then lines
  const { data: demoApprovalLines } = await supabase.from("approval_lines").select("id").like("line_name", "%결재");
  if (demoApprovalLines && demoApprovalLines.length > 0) {
    const lineIds = demoApprovalLines.map((l: any) => l.id);
    const { data: demoRecords } = await supabase.from("approval_records").select("id").in("line_id", lineIds);
    if (demoRecords && demoRecords.length > 0) {
      await supabase.from("approval_steps").delete().in("record_id", demoRecords.map((r: any) => r.id));
      await supabase.from("approval_records").delete().in("id", demoRecords.map((r: any) => r.id));
    }
    await supabase.from("approval_lines").delete().in("id", lineIds);
  }

  // Reports
  const { data: demoTemplates } = await supabase.from("report_templates").select("id").like("template_code", "RPT-DEMO%");
  if (demoTemplates && demoTemplates.length > 0) {
    const tmplIds = demoTemplates.map((t: any) => t.id);
    await supabase.from("report_generated").delete().in("template_id", tmplIds);
    await supabase.from("report_schedules").delete().in("template_id", tmplIds);
  }
  await supabase.from("report_templates").delete().like("template_code", "RPT-DEMO%");

  // Surveys
  const { data: demoSurveys } = await supabase.from("surveys").select("id").like("notes", "[DEMO]%");
  if (demoSurveys && demoSurveys.length > 0) {
    const srvIds = demoSurveys.map((s: any) => s.id);
    await supabase.from("survey_basic_info").delete().in("survey_id", srvIds);
    await supabase.from("survey_infra").delete().in("survey_id", srvIds);
    await supabase.from("survey_operation").delete().in("survey_id", srvIds);
    await supabase.from("survey_photos").delete().in("survey_id", srvIds);
    await supabase.from("survey_sensor_plan").delete().in("survey_id", srvIds);
    await supabase.from("survey_usage").delete().in("survey_id", srvIds);
  }
  await supabase.from("surveys").delete().like("notes", "[DEMO]%");

  // Realtime - sensor readings, parking spaces
  await supabase.from("sensor_readings").delete().like("device_id", "SEN-DEMO%");
  await supabase.from("parking_spaces").delete().like("space_number", "%-0%");
  await supabase.from("display_boards").delete().like("notes", "[DEMO]%");
  await supabase.from("sensor_devices").delete().like("notes", "[DEMO]%");
  await supabase.from("gateway_devices").delete().like("notes", "[DEMO]%");


  // Fee policies
  await supabase.from("fee_policies").delete().like("notes", "[DEMO]%");

  // Planning - permits, design docs, construction projects
  const { data: demoConstProjects } = await supabase.from("construction_projects").select("id").like("notes", "[DEMO]%");
  if (demoConstProjects && demoConstProjects.length > 0) {
    const cpIds = demoConstProjects.map((p: any) => p.id);
    await supabase.from("permits").delete().in("project_id", cpIds);
    await supabase.from("design_documents").delete().in("project_id", cpIds);
  }
  await supabase.from("construction_projects").delete().like("notes", "[DEMO]%");
  await supabase.from("site_candidates").delete().like("notes", "[DEMO]%");

  // Service - all child tables first
  const { data: demoSvcProjects } = await supabase.from("service_projects").select("id").like("notes", "[DEMO]%");
  if (demoSvcProjects && demoSvcProjects.length > 0) {
    const svcIds = demoSvcProjects.map((p: any) => p.id);
    await supabase.from("service_issues").delete().in("project_id", svcIds);
    await supabase.from("service_payments").delete().in("project_id", svcIds);
    await supabase.from("service_inspections").delete().in("project_id", svcIds);
    await supabase.from("service_deliverables").delete().in("project_id", svcIds);
    await supabase.from("service_milestones").delete().in("project_id", svcIds);
  }
  await supabase.from("service_projects").delete().like("notes", "[DEMO]%");

  // Procurement
  const { data: demoBids } = await supabase.from("bid_projects").select("id").like("notes", "[DEMO]%");
  if (demoBids && demoBids.length > 0) {
    const bidIds = demoBids.map((b: any) => b.id);
    await supabase.from("bid_documents").delete().in("bid_project_id", bidIds);
    await supabase.from("bid_evaluations").delete().in("bid_project_id", bidIds);
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
    await supabase.from("budget_items").delete().in("plan_id", demoPlans.map((p: any) => p.id));
  }
  await supabase.from("budget_plans").delete().like("notes", "[DEMO]%");

  // Revenue
  await supabase.from("revenue_daily").delete().eq("data_source", "demo_seed");
  await supabase.from("revenue_reconciliation").delete().like("diff_analysis", "[DEMO]%");

  // Complaints
  const { data: demoComplaints } = await supabase.from("complaints").select("id").like("notes", "[DEMO]%");
  if (demoComplaints && demoComplaints.length > 0) {
    await supabase.from("complaint_comments").delete().in("complaint_id", demoComplaints.map((c: any) => c.id));
  }
  await supabase.from("complaints").delete().like("notes", "[DEMO]%");

  // Operations
  await supabase.from("free_hours_settings").delete().like("reason", "[DEMO]%");
  await supabase.from("fee_exemptions").delete().in("exemption_name", ["장애인 감면", "국가유공자 감면", "경차 감면", "전기차 감면", "다자녀 감면", "임산부 감면", "공무 차량", "30분 무료"]);
  await supabase.from("outsourcing_contracts").delete().like("notes", "[DEMO]%");
  await supabase.from("monthly_passes").delete().like("notes", "[DEMO]%");
  await supabase.from("enforcement_records").delete().like("notes", "[DEMO]%");
  await supabase.from("operations_staff").delete().like("notes", "[DEMO]%");

  // Facility
  await supabase.from("surface_markings").delete().like("notes", "[DEMO]%");
  await supabase.from("maintenance_schedules").delete().like("description", "[DEMO]%");
  await supabase.from("safety_inspections").delete().like("notes", "[DEMO]%");
  await supabase.from("maintenance_logs").delete().like("notes", "[DEMO]%");
  await supabase.from("equipment").delete().like("notes", "[DEMO]%");

  // Parking lots reset
  await supabase.from("parking_lots").update({ notes: null }).like("notes", "[DEMO]%");

  console.log("✅ Demo data cleanup completed");
}
