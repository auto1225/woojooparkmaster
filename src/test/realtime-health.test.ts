import { describe, expect, it } from "vitest";
import { getEffectiveSensorStatus, isGatewayOnline, isRealtimeLotFresh } from "@/lib/realtime-health";

const now = new Date("2026-08-03T12:00:00.000Z").getTime();

describe("realtime health", () => {
  it("does not count an active sensor with a stale heartbeat as healthy", () => {
    expect(getEffectiveSensorStatus({ status: "active", last_heartbeat: "2026-08-03T11:29:59.000Z" }, now)).toBe("offline");
  });

  it("prioritizes explicit errors and low battery after connectivity", () => {
    expect(getEffectiveSensorStatus({ status: "error", last_heartbeat: "2026-08-03T11:59:00.000Z" }, now)).toBe("error");
    expect(getEffectiveSensorStatus({ status: "active", last_heartbeat: "2026-08-03T11:59:00.000Z", battery_level: 10 }, now)).toBe("low_battery");
  });

  it("uses the stricter gateway and lot freshness windows", () => {
    expect(isGatewayOnline({ status: "active", last_heartbeat: "2026-08-03T11:54:59.000Z" }, now)).toBe(false);
    expect(isRealtimeLotFresh("2026-08-03T11:29:59.000Z", now)).toBe(false);
  });
});
