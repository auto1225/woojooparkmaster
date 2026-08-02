import { describe, expect, it } from "vitest";
import { assertBackendConfig, type ParkMasterRuntimeConfig } from "@/config/runtime-config";

function makeConfig(overrides: Partial<ParkMasterRuntimeConfig> = {}): ParkMasterRuntimeConfig {
  return {
    supabaseUrl: "https://parkmaster.agency.local",
    supabasePublishableKey: "publishable-key",
    naverMapClientId: "",
    deploymentMode: "on_premises",
    externalAiEnabled: false,
    sensorConsoleUrl: "",
    ...overrides,
  };
}

describe("ParkMaster runtime configuration", () => {
  it("accepts an HTTPS internal backend", () => {
    expect(() => assertBackendConfig(makeConfig())).not.toThrow();
  });

  it("rejects an HTTP backend in on-premises mode", () => {
    expect(() => assertBackendConfig(makeConfig({ supabaseUrl: "http://10.0.0.10" })))
      .toThrow("HTTPS");
  });

  it("rejects a missing publishable key", () => {
    expect(() => assertBackendConfig(makeConfig({ supabasePublishableKey: "" })))
      .toThrow("missing");
  });

  it("allows HTTP only for local development", () => {
    expect(() => assertBackendConfig(makeConfig({
      supabaseUrl: "http://127.0.0.1:54321",
      deploymentMode: "development",
    }))).not.toThrow();
  });
});
