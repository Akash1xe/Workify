import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyServiceApiKey } from "./serviceCatalog.client";

afterEach(() => vi.unstubAllGlobals());

describe("verifyServiceApiKey", () => {
  it("maps invalid, revoked, or expired keys to 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(verifyServiceApiKey("snt_live_invalid_key_value")).rejects.toMatchObject({ statusCode: 401, code: "INVALID_API_KEY" });
  });

  it("maps Service Catalog network failure to 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(verifyServiceApiKey("snt_live_key_key_key_key")).rejects.toMatchObject({ statusCode: 502 });
  });

  it("returns only safe verified identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      valid: true,
      service: { id: "svc", organizationId: "org", name: "payments", environment: "PRODUCTION" },
      apiKey: { id: "key", name: "prod" }
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(verifyServiceApiKey("snt_live_key_key_key_key")).resolves.toEqual({
      service: { id: "svc", organizationId: "org", name: "payments", environment: "PRODUCTION" },
      apiKey: { id: "key", name: "prod" }
    });
  });
});
