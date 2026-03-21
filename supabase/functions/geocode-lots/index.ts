import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEOCODE_URL = "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode";

type GeocodeResult = {
  lat: number;
  lng: number;
  roadAddress?: string;
  jibunAddress?: string;
  query: string;
  score: number;
};

function sanitizeAddress(address: string): string {
  return address
    .replace(/\([^)]*\)/g, " ")
    .replace(/번지/g, "")
    .replace(/\s*외\s*\d+\s*필지.*$/g, "")
    .replace(/\s*외\s*\d+.*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function withJejuPrefix(address: string): string {
  if (!address) return address;
  if (address.includes("제주") || address.includes("서귀포")) return address;
  return `제주특별자치도 제주시 ${address}`;
}

function buildCandidates(addresses: Array<string | null | undefined>): string[] {
  const values = new Set<string>();

  for (const raw of addresses) {
    const original = raw?.trim();
    if (!original) continue;

    const sanitized = sanitizeAddress(original);
    const candidates = [original, sanitized, withJejuPrefix(original), withJejuPrefix(sanitized)];

    for (const candidate of candidates) {
      const value = candidate.trim();
      if (value) values.add(value);
    }
  }

  return [...values];
}

function tokenizeAddress(address: string): string[] {
  return address
    .split(/\s+/)
    .map((token) => token.replace(/[^0-9A-Za-z가-힣-]/g, "").trim())
    .filter((token) => token.length >= 2);
}

function scoreAddressMatch(query: string, roadAddress?: string, jibunAddress?: string): number {
  const haystack = `${roadAddress || ""} ${jibunAddress || ""}`;
  if (!haystack.trim()) return 0;

  const queryTokens = tokenizeAddress(sanitizeAddress(query));
  const haystackTokens = new Set(tokenizeAddress(haystack));
  let score = 0;

  for (const token of queryTokens) {
    if (haystack.includes(token) || haystackTokens.has(token)) {
      score += /\d/.test(token) ? 4 : 2;
    }
  }

  if (haystack.includes("제주특별자치도 제주시")) score += 2;
  if (queryTokens.length > 0 && score >= queryTokens.length * 2) score += 2;

  return score;
}

async function geocodeAddress(
  addresses: Array<string | null | undefined>,
  clientId: string,
  clientSecret: string
): Promise<GeocodeResult | null> {
  try {
    let bestMatch: GeocodeResult | null = null;

    for (const query of buildCandidates(addresses)) {
      const url = `${GEOCODE_URL}?query=${encodeURIComponent(query)}`;
      const resp = await fetch(url, {
        headers: {
          "X-NCP-APIGW-API-KEY-ID": clientId,
          "X-NCP-APIGW-API-KEY": clientSecret,
        },
      });

      if (!resp.ok) {
        console.error(`Geocode HTTP error ${resp.status} for "${query}"`);
        continue;
      }

      const data = await resp.json();
      if (!data.addresses?.length) continue;

      for (const item of data.addresses.slice(0, 5)) {
        const score = scoreAddressMatch(query, item.roadAddress, item.jibunAddress);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            lat: parseFloat(item.y),
            lng: parseFloat(item.x),
            roadAddress: item.roadAddress,
            jibunAddress: item.jibunAddress,
            query,
            score,
          };
        }
      }

      if (bestMatch && bestMatch.score >= 8) {
        break;
      }
    }

    if (bestMatch && bestMatch.score >= 6) {
      return bestMatch;
    }

    return null;
  } catch (e) {
    console.error("Geocode error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("NAVER_MAP_CLIENT_ID");
    const clientSecret = Deno.env.get("NAVER_MAP_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "NAVER_MAP credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service account client for updates
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Fetch all lots with address but needing geocoding
    const { data: lots, error: lotsError } = await adminClient
      .from("parking_lots")
      .select("id, name, address_jibun, address_road")
      .or("address_jibun.not.is.null,address_road.not.is.null")
      .order("name");

    if (lotsError) throw lotsError;

    let updated = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const lot of lots || []) {
      if (!lot.address_jibun?.trim() && !lot.address_road?.trim()) continue;

      const result = await geocodeAddress([
        lot.address_road,
        lot.address_jibun,
      ], clientId, clientSecret);

      if (result) {
        const { error: updateError } = await adminClient
          .from("parking_lots")
          .update({
            latitude: Number(result.lat.toFixed(7)),
            longitude: Number(result.lng.toFixed(7)),
          })
          .eq("id", lot.id);

        if (updateError) {
          console.error(`Update failed for ${lot.name}:`, updateError);
          failed++;
          failures.push(lot.name);
        } else {
          updated++;
        }
      } else {
        failed++;
        failures.push(`${lot.name} (${lot.address_road || lot.address_jibun})`);
      }

      // Rate limit: ~5 req/s
      await new Promise((r) => setTimeout(r, 200));
    }

    return new Response(
      JSON.stringify({
        message: `좌표 변환 완료: ${updated}건 성공, ${failed}건 실패`,
        updated,
        failed,
        failures: failures.slice(0, 20),
        total: lots?.length || 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("geocode-lots error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
