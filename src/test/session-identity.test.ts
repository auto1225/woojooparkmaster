import { describe, expect, it } from "vitest";
import { getSessionIdentity } from "@/lib/session-identity";

function jwt(payload: Record<string, unknown>, signature: string) {
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${encodedPayload}.${signature}`;
}

describe("getSessionIdentity", () => {
  it("uses the Supabase session id instead of the shared JWT prefix", () => {
    const first = jwt({ sub: "same-user", session_id: "session-one" }, "signature-one");
    const second = jwt({ sub: "same-user", session_id: "session-two" }, "signature-two");

    expect(getSessionIdentity(first)).toBe("sid:session-one");
    expect(getSessionIdentity(second)).toBe("sid:session-two");
    expect(getSessionIdentity(first)).not.toBe(getSessionIdentity(second));
  });

  it("falls back to the unique signature when session_id is unavailable", () => {
    expect(getSessionIdentity(jwt({ sub: "user" }, "unique-signature")))
      .toBe("sig:unique-signature");
  });

  it("keeps non-JWT development tokens compatible", () => {
    expect(getSessionIdentity("mock-access-token")).toBe("mock-access-token");
  });
});
