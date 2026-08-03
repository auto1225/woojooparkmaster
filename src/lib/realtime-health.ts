export const REALTIME_LOT_STALE_MINUTES = 30;
export const SENSOR_HEARTBEAT_STALE_MINUTES = 30;
export const GATEWAY_HEARTBEAT_STALE_MINUTES = 5;

export type EffectiveDeviceStatus = "active" | "offline" | "low_battery" | "error" | "maintenance" | "decommissioned";

function isRecent(timestamp: string | null | undefined, thresholdMinutes: number, now: number) {
  if (!timestamp) return false;
  const time = new Date(timestamp).getTime();
  return Number.isFinite(time) && now - time <= thresholdMinutes * 60_000;
}

export function isRealtimeLotFresh(lastUpdated: string | null | undefined, now = Date.now()) {
  return isRecent(lastUpdated, REALTIME_LOT_STALE_MINUTES, now);
}

export function getEffectiveSensorStatus(sensor: {
  status?: string | null;
  last_heartbeat?: string | null;
  battery_level?: number | string | null;
}, now = Date.now()): EffectiveDeviceStatus {
  if (sensor.status === "decommissioned") return "decommissioned";
  if (sensor.status === "maintenance") return "maintenance";
  if (sensor.status === "error") return "error";
  if (!isRecent(sensor.last_heartbeat, SENSOR_HEARTBEAT_STALE_MINUTES, now)) return "offline";
  if (sensor.battery_level != null && Number(sensor.battery_level) < 20) return "low_battery";
  return "active";
}

export function isGatewayOnline(gateway: {
  status?: string | null;
  last_heartbeat?: string | null;
}, now = Date.now()) {
  return gateway.status === "active" && isRecent(gateway.last_heartbeat, GATEWAY_HEARTBEAT_STALE_MINUTES, now);
}
