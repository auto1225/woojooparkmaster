type JwtPayload = {
  session_id?: unknown;
};

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(globalThis.atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

/** A non-secret, per-login identity used by active_sessions. */
export function getSessionIdentity(accessToken: string): string {
  const payload = decodeJwtPayload(accessToken);
  if (typeof payload?.session_id === "string" && payload.session_id.trim()) {
    return `sid:${payload.session_id.trim()}`.slice(0, 200);
  }

  const signature = accessToken.split(".")[2];
  if (signature) return `sig:${signature}`.slice(0, 200);

  // Keeps local development and legacy non-JWT test tokens compatible.
  return accessToken.slice(-200);
}
