export type DeploymentMode = "development" | "on_premises";

export interface ParkMasterRuntimeConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  naverMapClientId: string;
  deploymentMode: DeploymentMode;
  externalAiEnabled: boolean;
  sensorConsoleUrl: string;
}
interface RuntimeConfigInput {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  naverMapClientId?: string;
  deploymentMode?: string;
  externalAiEnabled?: boolean | string;
  sensorConsoleUrl?: string;
}

declare global {
  interface Window {
    __PARKMASTER_CONFIG__?: RuntimeConfigInput;
  }
}

function firstValue(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() || "";
}

function parseBoolean(value: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return fallback;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

const injected = typeof window === "undefined" ? {} : window.__PARKMASTER_CONFIG__ || {};
const deploymentMode = firstValue(
  injected.deploymentMode,
  import.meta.env.VITE_DEPLOYMENT_MODE,
) === "on_premises" ? "on_premises" : "development";

export const runtimeConfig: Readonly<ParkMasterRuntimeConfig> = Object.freeze({
  supabaseUrl: normalizeBaseUrl(firstValue(injected.supabaseUrl, import.meta.env.VITE_SUPABASE_URL)),
  supabasePublishableKey: firstValue(
    injected.supabasePublishableKey,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ),
  naverMapClientId: firstValue(injected.naverMapClientId, import.meta.env.VITE_NAVER_MAP_CLIENT_ID),
  deploymentMode,
  externalAiEnabled: parseBoolean(
    injected.externalAiEnabled ?? import.meta.env.VITE_EXTERNAL_AI_ENABLED,
    false,
  ),
  sensorConsoleUrl: firstValue(injected.sensorConsoleUrl, import.meta.env.VITE_SENSOR_CONSOLE_URL),
});

export function assertBackendConfig(config: ParkMasterRuntimeConfig = runtimeConfig): void {
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error("ParkMaster backend configuration is missing.");
  }

  let backendUrl: URL;
  try {
    backendUrl = new URL(config.supabaseUrl);
  } catch {
    throw new Error("ParkMaster backend URL is invalid.");
  }

  if (config.deploymentMode === "on_premises" && backendUrl.protocol !== "https:") {
    throw new Error("On-premises mode requires an HTTPS backend URL.");
  }
}
