function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigins = (Deno.env.get("PARKMASTER_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigin = allowedOrigins.length === 0
    ? origin || "*"
    : allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}

const GEOCODE_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";
const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 25;
const REQUEST_DELAY_MS = 150;

type GeocodeResult = {
  lat: number;
  lng: number;
  roadAddress?: string;
  jibunAddress?: string;
  query: string;
  score: number;
};

type GeocodeLotsRequest = {
  cursor?: number;
  batchSize?: number;
  lotIds?: string[];
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

async function parseRequestPayload(req: Request): Promise<GeocodeLotsRequest> {
  if (req.method !== "POST") return {};

  try {
    const raw = await req.text();
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeBatchSize(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.max(Math.trunc(value as number), 1), MAX_BATCH_SIZE);
}

function normalizeCursor(value?: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(Math.trunc(value as number), 0);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ParkingLotRow = {
  id: string;
  name: string;
  address_jibun: string | null;
  address_road: string | null;
};

async function internalRequest<T>(
  path: string,
  serviceKey: string,
  init: RequestInit = {},
): Promise<T> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("Internal backend URL is not configured");

  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    console.error(`Internal API error: ${response.status} ${path}`);
    throw new Error("Internal data request failed");
  }

  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

async function authorizeAdmin(authHeader: string, anonKey: string, serviceKey: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("Internal backend URL is not configured");

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authHeader },
  });
  if (!userResponse.ok) throw new Error("Unauthorized");

  const user = await userResponse.json();
  const profiles = await internalRequest<Array<{ role: string }>>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
    serviceKey,
  );
  if (profiles[0]?.role !== "admin") throw new Error("Forbidden");
  return user.id;
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
          Accept: "application/json",
        },
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        console.error(`Geocode HTTP error ${resp.status} for "${query}" — body: ${errBody}`);
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

      if (bestMatch && bestMatch.score >= 8) break;
    }

    if (bestMatch && bestMatch.score >= 6) return bestMatch;
    return null;
  } catch (e) {
    console.error("Geocode error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseKey || !serviceKey) throw new Error("Internal API keys are not configured");

    let requestedBy: string;
    try {
      requestedBy = await authorizeAdmin(authHeader, supabaseKey, serviceKey);
    } catch (error) {
      const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
      return new Response(JSON.stringify({ error: status === 403 ? "Forbidden" : "Unauthorized" }), {
        status,
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

    const payload = await parseRequestPayload(req);
    const cursor = normalizeCursor(payload.cursor);
    const batchSize = normalizeBatchSize(payload.batchSize);
    const lotIds = Array.isArray(payload.lotIds)
      ? payload.lotIds.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];

    let lots: ParkingLotRow[] = [];
    let hasMore = false;

    if (lotIds.length > 0) {
      const validIds = lotIds
        .filter((value) => /^[0-9a-f-]{36}$/i.test(value))
        .slice(0, MAX_BATCH_SIZE);
      if (validIds.length) {
        lots = await internalRequest<ParkingLotRow[]>(
          `/rest/v1/parking_lots?id=in.(${validIds.join(",")})&select=id,name,address_jibun,address_road&order=name.asc`,
          serviceKey,
        );
      }
    } else {
      const rows = await internalRequest<ParkingLotRow[]>(
        `/rest/v1/parking_lots?or=(address_jibun.not.is.null,address_road.not.is.null)&select=id,name,address_jibun,address_road&order=name.asc&offset=${cursor}&limit=${batchSize + 1}`,
        serviceKey,
      );
      hasMore = rows.length > batchSize;
      lots = rows.slice(0, batchSize);
    }

    let updated = 0;
    let failed = 0;
    const failures: string[] = [];

    for (let index = 0; index < lots.length; index++) {
      const lot = lots[index];
      if (!lot.address_jibun?.trim() && !lot.address_road?.trim()) continue;

      const result = await geocodeAddress([lot.address_road, lot.address_jibun], clientId, clientSecret);

      if (result) {
        try {
          await internalRequest<void>(
            `/rest/v1/parking_lots?id=eq.${encodeURIComponent(lot.id)}`,
            serviceKey,
            {
              method: "PATCH",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify({
            latitude: Number(result.lat.toFixed(7)),
            longitude: Number(result.lng.toFixed(7)),
              }),
            },
          );
          updated++;
        } catch (updateError) {
          console.error(`Update failed for ${lot.name}:`, updateError);
          failed++;
          failures.push(lot.name);
        }
      } else {
        failed++;
        failures.push(`${lot.name} (${lot.address_road || lot.address_jibun})`);
      }

      if (index < lots.length - 1) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    const processed = lots.length;
    const nextCursor = lotIds.length > 0 || !hasMore ? null : cursor + processed;

    try {
      await internalRequest<void>("/rest/v1/external_integration_logs", serviceKey, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          service: "naver_maps",
          operation: "batch_geocode",
          status: failed > 0 ? "partial" : "success",
          record_count: processed,
          requested_by: requestedBy,
          metadata: { updated, failed },
        }),
      });
    } catch (auditError) {
      console.error("External integration audit failed:", auditError);
    }

    return new Response(
      JSON.stringify({
        message: hasMore
          ? `좌표 변환 진행 중: ${updated}건 성공, ${failed}건 실패`
          : `좌표 변환 완료: ${updated}건 성공, ${failed}건 실패`,
        updated,
        failed,
        failures: failures.slice(0, 20),
        processed,
        total: hasMore ? cursor + processed + 1 : cursor + processed,
        cursor,
        nextCursor,
        hasMore,
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
