import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getRoute(url: URL) {
  const marker = "/realtime-api";
  const index = url.pathname.indexOf(marker);
  return (index >= 0 ? url.pathname.slice(index + marker.length) : url.pathname).replace(/\/+$/, "") || "/";
}

function parseDate(value: string | null, fallback: Date) {
  const parsed = value ? new Date(value) : fallback;
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export default {
async fetch(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return json({ error: "GET 요청만 지원합니다." }, 405);

  const startedAt = Date.now();
  const url = new URL(request.url);
  const route = getRoute(url);
  const suppliedKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!suppliedKey) return json({ error: "x-api-key 헤더가 필요합니다." }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const keyHash = await sha256(suppliedKey);
  const { data: apiKey } = await supabase.from("api_keys")
    .select("id,status,expires_at,rate_limit_per_minute,allowed_endpoints,allowed_ips,total_calls,monthly_calls")
    .eq("api_key_hash", keyHash).maybeSingle();

  if (!apiKey || apiKey.status !== "active") return json({ error: "유효하지 않거나 폐기된 API 키입니다." }, 401);
  if (apiKey.expires_at && new Date(apiKey.expires_at) <= new Date()) return json({ error: "만료된 API 키입니다." }, 401);

  const clientIp = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  if (apiKey.allowed_ips?.length && (!clientIp || !apiKey.allowed_ips.includes(clientIp))) {
    return json({ error: "허용되지 않은 접속 IP입니다." }, 403);
  }

  const routeMatch = route.match(/^\/lots\/([^/]+)(\/history)?$/);
  const endpoint = route === "/lots" ? "/api/v1/lots" : routeMatch?.[2] ? "/api/v1/lots/:id/history" : routeMatch ? "/api/v1/lots/:id" : route;
  if (apiKey.allowed_endpoints?.length && !apiKey.allowed_endpoints.includes(endpoint)) {
    return json({ error: "이 키에 허용되지 않은 엔드포인트입니다." }, 403);
  }

  const minuteStart = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCalls } = await supabase.from("api_call_logs").select("id", { count: "exact", head: true })
    .eq("api_key_id", apiKey.id).gte("called_at", minuteStart);
  if ((recentCalls || 0) >= (apiKey.rate_limit_per_minute || 60)) {
    return json({ error: "분당 호출 한도를 초과했습니다." }, 429);
  }

  let statusCode = 200;
  let responseBody: unknown;
  try {
    if (route === "/health") {
      responseBody = { status: "ok", service: "ParkMaster 실시간 주차 API", checked_at: new Date().toISOString() };
    } else if (route === "/lots") {
      const { data, error } = await supabase.from("realtime_map_view").select("*").order("code");
      if (error) throw error;
      responseBody = {
        data: (data || []).map((lot) => {
          const fresh = lot.last_updated && Date.now() - new Date(lot.last_updated).getTime() <= 30 * 60_000;
          return { ...lot, data_status: fresh ? "current" : "stale", occupied_spaces: fresh ? lot.occupied_spaces : null, available_spaces: fresh ? lot.available_spaces : null, occupancy_rate: fresh ? lot.occupancy_rate : null, congestion_level: fresh ? lot.congestion_level : null };
        }),
        generated_at: new Date().toISOString(),
      };
    } else if (routeMatch) {
      const identifier = decodeURIComponent(routeMatch[1]);
      let lotQuery = supabase.from("parking_lots").select("id,code,name,lot_type,total_spaces,status,address_road");
      lotQuery = /^[0-9a-f-]{36}$/i.test(identifier) ? lotQuery.eq("id", identifier) : lotQuery.eq("code", identifier);
      const { data: lot, error: lotError } = await lotQuery.maybeSingle();
      if (lotError) throw lotError;
      if (!lot) {
        statusCode = 404;
        responseBody = { error: "주차장을 찾을 수 없습니다." };
      } else if (routeMatch[2]) {
        const defaultTo = new Date();
        const defaultFrom = new Date(defaultTo.getTime() - 24 * 60 * 60_000);
        const from = parseDate(url.searchParams.get("from"), defaultFrom);
        const to = parseDate(url.searchParams.get("to"), defaultTo);
        if (!from || !to || from >= to || to.getTime() - from.getTime() > 31 * 24 * 60 * 60_000) {
          statusCode = 400;
          responseBody = { error: "조회 기간은 올바른 날짜로 최대 31일까지 지정해 주세요." };
        } else {
          const { data: readings, error } = await supabase.from("sensor_readings").select("time,occupied")
            .eq("lot_id", lot.id).gte("time", from.toISOString()).lte("time", to.toISOString()).order("time");
          if (error) throw error;
          const buckets = new Map<string, { sample_count: number; occupied_samples: number }>();
          for (const reading of readings || []) {
            const hour = new Date(reading.time);
            hour.setMinutes(0, 0, 0);
            const key = hour.toISOString();
            const bucket = buckets.get(key) || { sample_count: 0, occupied_samples: 0 };
            bucket.sample_count += 1;
            if (reading.occupied) bucket.occupied_samples += 1;
            buckets.set(key, bucket);
          }
          responseBody = { lot, from: from.toISOString(), to: to.toISOString(), interval: "hour", data: [...buckets].map(([time, value]) => ({ time, ...value, occupancy_sample_rate: value.sample_count ? Math.round(value.occupied_samples / value.sample_count * 10_000) / 100 : 0 })) };
        }
      } else {
        const { data: realtime, error } = await supabase.from("lot_realtime_status").select("*").eq("lot_id", lot.id).maybeSingle();
        if (error) throw error;
        const fresh = realtime?.last_updated && Date.now() - new Date(realtime.last_updated).getTime() <= 30 * 60_000;
        responseBody = { lot, realtime: realtime ? { ...realtime, data_status: fresh ? "current" : "stale", occupied_spaces: fresh ? realtime.occupied_spaces : null, available_spaces: fresh ? realtime.available_spaces : null, occupancy_rate: fresh ? realtime.occupancy_rate : null, congestion_level: fresh ? realtime.congestion_level : null } : null };
      }
    } else {
      statusCode = 404;
      responseBody = { error: "지원하지 않는 엔드포인트입니다." };
    }
  } catch (error) {
    console.error(error);
    statusCode = 500;
    responseBody = { error: "실시간 주차정보를 조회하지 못했습니다." };
  }

  await Promise.all([
    supabase.from("api_call_logs").insert({ api_key_id: apiKey.id, endpoint, method: "GET", status_code: statusCode, response_time_ms: Date.now() - startedAt, ip_address: clientIp, user_agent: request.headers.get("user-agent") }),
    supabase.from("api_keys").update({ total_calls: Number(apiKey.total_calls || 0) + 1, monthly_calls: Number(apiKey.monthly_calls || 0) + 1, last_used_at: new Date().toISOString() }).eq("id", apiKey.id),
  ]);
  return json(responseBody, statusCode);
},
};
