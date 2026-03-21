import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEOCODE_URL = "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode";

async function geocodeAddress(
  address: string,
  clientId: string,
  clientSecret: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `${GEOCODE_URL}?query=${encodeURIComponent(address)}`;
    const resp = await fetch(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
    });

    if (!resp.ok) {
      console.error(`Geocode HTTP error ${resp.status} for "${address}"`);
      return null;
    }

    const data = await resp.json();
    if (data.addresses && data.addresses.length > 0) {
      const a = data.addresses[0];
      return { lat: parseFloat(a.y), lng: parseFloat(a.x) };
    }

    return null;
  } catch (e) {
    console.error(`Geocode error for "${address}":`, e);
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
      .select("id, name, address_jibun")
      .not("address_jibun", "is", null)
      .order("name");

    if (lotsError) throw lotsError;

    let updated = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const lot of lots || []) {
      if (!lot.address_jibun?.trim()) continue;

      // Prepend "제주시" if address doesn't contain city info
      let searchAddress = lot.address_jibun.trim();
      if (!searchAddress.includes("제주") && !searchAddress.includes("서귀포")) {
        searchAddress = `제주특별자치도 제주시 ${searchAddress}`;
      }

      const result = await geocodeAddress(searchAddress, clientId, clientSecret);

      if (result) {
        const { error: updateError } = await adminClient
          .from("parking_lots")
          .update({
            latitude: result.lat.toFixed(7),
            longitude: result.lng.toFixed(7),
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
        failures.push(`${lot.name} (${searchAddress})`);
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
