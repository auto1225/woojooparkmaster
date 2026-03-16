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

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "인증이 필요합니다" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "인증 실패" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "관리자 권한이 필요합니다" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action } = await req.json();

    if (action === "seed") {
      await runSeed(supabase);
      return new Response(JSON.stringify({ success: true, message: "데모 데이터가 생성되었습니다" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (action === "cleanup") {
      await runCleanup(supabase);
      return new Response(JSON.stringify({ success: true, message: "데모 데이터가 초기화되었습니다" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ error: "잘못된 action입니다" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("Demo data error:", err);
    return new Response(JSON.stringify({ error: err.message || "서버 오류" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function runSeed(supabase: any) {
  // 1. Get all parking lots
  const { data: lots } = await supabase
    .from("parking_lots")
    .select("id, code, name, total_spaces")
    .order("code");

  if (!lots || lots.length === 0) throw new Error("주차장 데이터가 없습니다");

  // 1-1. Update parking lots with demo data (total_spaces, lat/lng)
  for (const lot of lots) {
    if (!lot.total_spaces || lot.total_spaces === 0) {
      const totalSpaces = lot.code.includes("-00")
        ? Math.floor(Math.random() * 280 + 20)
        : Math.floor(Math.random() * 180 + 20);
      const latitude = 33.50 + (Math.random() - 0.5) * 0.10;
      const longitude = 126.53 + (Math.random() - 0.5) * 0.10;
      const disabledSpaces = Math.max(1, Math.floor(totalSpaces * (0.03 + Math.random() * 0.02)));
      const evSpaces = Math.max(0, Math.floor(totalSpaces * (0.02 + Math.random() * 0.03)));

      await supabase
        .from("parking_lots")
        .update({
          total_spaces: totalSpaces,
          latitude,
          longitude,
          disabled_spaces: disabledSpaces,
          ev_spaces: evSpaces,
          notes: "[DEMO] 데모 데이터 보강",
        })
        .eq("id", lot.id);

      lot.total_spaces = totalSpaces;
    }
  }

  // 2. Equipment (up to 80)
  const bigLots = lots
    .filter((l: any) => l.total_spaces > 50)
    .sort((a: any, b: any) => b.total_spaces - a.total_spaces)
    .slice(0, 15);

  let eqCount = 0;
  const equipmentRows: any[] = [];
  const eqTypes = ["cctv", "barrier", "lpr", "kiosk"];

  for (const lot of bigLots) {
    if (eqCount >= 80) break;
    // CCTV 2~6
    const cctvCount = 2 + Math.floor(Math.random() * 4);
    for (let i = 1; i <= cctvCount && eqCount < 80; i++) {
      eqCount++;
      equipmentRows.push({
        lot_id: lot.id,
        equipment_code: `EQ-${String(eqCount).padStart(4, "0")}`,
        equipment_type: "cctv",
        name: `${lot.name} CCTV-${i}`,
        quantity: 1,
        status: "normal",
        total_maintenance_cost: 0,
        maintenance_count: 0,
        notes: "[DEMO] 데모 장비",
      });
    }
    // Barrier (100+)
    if (lot.total_spaces >= 100 && eqCount < 80) {
      for (let i = 1; i <= 2 && eqCount < 80; i++) {
        eqCount++;
        equipmentRows.push({
          lot_id: lot.id,
          equipment_code: `EQ-${String(eqCount).padStart(4, "0")}`,
          equipment_type: "barrier",
          name: `${lot.name} 차단기-${i}`,
          quantity: 1,
          status: "normal",
          total_maintenance_cost: 0,
          maintenance_count: 0,
          notes: "[DEMO] 데모 장비",
        });
      }
      // LPR
      if (eqCount < 80) {
        eqCount++;
        equipmentRows.push({
          lot_id: lot.id,
          equipment_code: `EQ-${String(eqCount).padStart(4, "0")}`,
          equipment_type: "lpr",
          name: `${lot.name} LPR`,
          quantity: 2,
          status: "normal",
          total_maintenance_cost: 0,
          maintenance_count: 0,
          notes: "[DEMO] 데모 장비",
        });
      }
    }
    // Kiosk (50+, 50%)
    if (lot.total_spaces >= 50 && Math.random() > 0.5 && eqCount < 80) {
      eqCount++;
      equipmentRows.push({
        lot_id: lot.id,
        equipment_code: `EQ-${String(eqCount).padStart(4, "0")}`,
        equipment_type: "kiosk",
        name: `${lot.name} 무인정산기`,
        quantity: 1,
        status: "normal",
        total_maintenance_cost: 0,
        maintenance_count: 0,
        notes: "[DEMO] 데모 장비",
      });
    }
  }

  // Insert equipment in batches
  if (equipmentRows.length > 0) {
    for (let i = 0; i < equipmentRows.length; i += 50) {
      const batch = equipmentRows.slice(i, i + 50);
      const { error } = await supabase.from("equipment").insert(batch);
      if (error) console.error("Equipment insert error:", error);
    }
  }

  // Update some equipment statuses
  const { data: demoEquipment } = await supabase
    .from("equipment")
    .select("id")
    .like("notes", "[DEMO]%");

  if (demoEquipment && demoEquipment.length > 0) {
    const shuffled = demoEquipment.sort(() => Math.random() - 0.5);
    const warningIds = shuffled.slice(0, 5).map((e: any) => e.id);
    const brokenIds = shuffled.slice(5, 8).map((e: any) => e.id);
    const maintIds = shuffled.slice(8, 10).map((e: any) => e.id);

    if (warningIds.length) await supabase.from("equipment").update({ status: "warning" }).in("id", warningIds);
    if (brokenIds.length) await supabase.from("equipment").update({ status: "broken" }).in("id", brokenIds);
    if (maintIds.length) await supabase.from("equipment").update({ status: "maintenance" }).in("id", maintIds);
  }

  // 3. Maintenance logs (20)
  const { data: eqForMaint } = await supabase
    .from("equipment")
    .select("id, lot_id, name")
    .like("notes", "[DEMO]%")
    .limit(20);

  if (eqForMaint) {
    const maintRows = eqForMaint.map((eq: any, i: number) => ({
      log_number: `ML-DEMO-${String(i + 1).padStart(4, "0")}`,
      lot_id: eq.lot_id,
      equipment_id: eq.id,
      maintenance_type: i < 10 ? "scheduled" : i < 15 ? "emergency" : "repair",
      priority: i < 10 ? "low" : i < 15 ? "high" : "medium",
      title: `${eq.name} ${i < 10 ? "정기점검" : i < 15 ? "긴급수리" : "일반수리"}`,
      parts_cost: Math.floor(Math.random() * 500000),
      labor_cost: Math.floor(Math.random() * 200000),
      other_cost: 0,
      total_cost: Math.floor(Math.random() * 700000),
      status: i < 13 ? "completed" : i < 16 ? "in_progress" : "reported",
      notes: "[DEMO] 데모 유지보수",
    }));
    const { error } = await supabase.from("maintenance_logs").insert(maintRows);
    if (error) console.error("Maintenance insert error:", error);
  }

  // 4. Safety inspections (8)
  const inspLots = lots
    .filter((l: any) => l.total_spaces > 80)
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);

  const grades = ["A", "A", "A", "B", "B", "B", "C", "D"];
  const inspRows = inspLots.map((lot: any, i: number) => {
    const grade = grades[i];
    const passItems = grade === "A" ? 9 : grade === "B" ? 7 : 5;
    const failItems = grade === "A" ? 1 : grade === "B" ? 3 : 5;
    const daysAgo = Math.floor(Math.random() * 180);
    const inspDate = new Date();
    inspDate.setDate(inspDate.getDate() - daysAgo);

    return {
      inspection_number: `SI-DEMO-${String(i + 1).padStart(4, "0")}`,
      lot_id: lot.id,
      inspection_type: i < 4 ? "quarterly" : "monthly",
      inspection_date: inspDate.toISOString().split("T")[0],
      checklist_results: [
        { category: "구조안전", item: "바닥 균열", result: "pass" },
        { category: "소방", item: "소화기 비치", result: "pass" },
        { category: "전기", item: "배선 상태", result: "pass" },
      ],
      total_items: 10,
      pass_items: passItems,
      fail_items: failItems,
      na_items: 0,
      overall_grade: grade,
      status: "completed",
      notes: "[DEMO] 데모 안전점검",
    };
  });

  if (inspRows.length) {
    const { error } = await supabase.from("safety_inspections").insert(inspRows);
    if (error) console.error("Safety inspection insert error:", error);
  }

  // 5. Complaints (30)
  const categories = ["fee","fee","fee","fee","fee","fee","fee","fee","facility","facility","facility","facility","facility","facility","operation","operation","operation","operation","operation","enforcement","enforcement","enforcement","enforcement","safety","safety","safety","other","other","other","other"];
  const channels = ["phone","phone","phone","phone","phone","phone","phone","phone","phone","phone","phone","phone","online","online","online","online","online","online","online","online","saeol","saeol","saeol","saeol","saeol","onsite","onsite","onsite","visit","visit"];
  const statuses = ["closed","closed","closed","closed","closed","closed","closed","closed","closed","closed","closed","closed","closed","closed","closed","closed","closed","closed","responded","responded","responded","responded","responded","in_progress","in_progress","in_progress","in_progress","received","received","received"];

  const compLots = lots.sort(() => Math.random() - 0.5).slice(0, 30);
  const compRows = compLots.map((lot: any, i: number) => {
    const daysAgo = Math.floor(Math.random() * 180);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);

    return {
      complaint_number: `CMP-DEMO-${String(i + 1).padStart(4, "0")}`,
      lot_id: lot.id,
      category: categories[i],
      channel: channels[i],
      title: `${lot.name} 관련 민원`,
      content: `[DEMO] 데모 민원 내용입니다. ${lot.name}에 대한 민원입니다.`,
      status: statuses[i],
      priority: i < 20 ? "normal" : i < 26 ? "high" : "low",
      notes: "[DEMO] 데모 민원",
      created_at: createdAt.toISOString(),
    };
  });

  if (compRows.length) {
    const { error } = await supabase.from("complaints").insert(compRows);
    if (error) console.error("Complaints insert error:", error);
  }

  // 6. Revenue daily (top 20 lots × 90 days)
  const revLots = lots
    .filter((l: any) => l.total_spaces > 50)
    .sort((a: any, b: any) => b.total_spaces - a.total_spaces)
    .slice(0, 20);

  for (const lot of revLots) {
    const dailyBase = lot.total_spaces * 500;
    const revRows: any[] = [];

    for (let d = 1; d <= 90; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split("T")[0];

      revRows.push({
        lot_id: lot.id,
        revenue_date: dateStr,
        cash_amount: Math.floor(dailyBase * 0.2 * (0.8 + Math.random() * 0.4)),
        card_amount: Math.floor(dailyBase * 0.6 * (0.8 + Math.random() * 0.4)),
        mobile_amount: Math.floor(dailyBase * 0.2 * (0.8 + Math.random() * 0.4)),
        total_amount: Math.floor(dailyBase * (0.8 + Math.random() * 0.4)),
        total_vehicles: Math.floor(lot.total_spaces * (0.5 + Math.random() * 1.5)),
        verified: d > 30,
        notes: "[DEMO] 데모 수입",
      });
    }

    // Insert in batches of 50
    for (let i = 0; i < revRows.length; i += 50) {
      const batch = revRows.slice(i, i + 50);
      const { error } = await supabase.from("revenue_daily").upsert(batch, { onConflict: "lot_id,revenue_date", ignoreDuplicates: true });
      if (error) console.error("Revenue insert error for lot", lot.code, error);
    }
  }

  // 7. Budget plan
  const currentYear = new Date().getFullYear();
  const { error: budgetError } = await supabase.from("budget_plans").insert({
    fiscal_year: currentYear,
    plan_type: "original",
    title: `${currentYear}년도 본예산`,
    status: "executed",
    total_revenue: 800000000,
    total_expenditure: 500000000,
    notes: "[DEMO] 데모 예산",
  });
  if (budgetError) console.error("Budget insert error:", budgetError);
}

async function runCleanup(supabase: any) {
  // Delete in reverse dependency order
  // First get complaint IDs with demo notes
  const { data: demoComplaints } = await supabase
    .from("complaints")
    .select("id")
    .like("notes", "[DEMO]%");

  if (demoComplaints && demoComplaints.length > 0) {
    const ids = demoComplaints.map((c: any) => c.id);
    await supabase.from("complaint_comments").delete().in("complaint_id", ids);
  }

  await supabase.from("complaints").delete().like("notes", "[DEMO]%");
  await supabase.from("revenue_daily").delete().like("notes", "[DEMO]%");
  await supabase.from("safety_inspections").delete().like("notes", "[DEMO]%");
  await supabase.from("maintenance_logs").delete().like("notes", "[DEMO]%");
  await supabase.from("equipment").delete().like("notes", "[DEMO]%");
  await supabase.from("budget_executions").delete().like("notes", "[DEMO]%");

  // Budget items linked to demo plans
  const { data: demoPlans } = await supabase
    .from("budget_plans")
    .select("id")
    .like("notes", "[DEMO]%");

  if (demoPlans && demoPlans.length > 0) {
    const planIds = demoPlans.map((p: any) => p.id);
    await supabase.from("budget_items").delete().in("plan_id", planIds);
  }

  await supabase.from("budget_plans").delete().like("notes", "[DEMO]%");

  // Reset parking lots demo notes
  await supabase
    .from("parking_lots")
    .update({ notes: null })
    .like("notes", "[DEMO]%");
}
