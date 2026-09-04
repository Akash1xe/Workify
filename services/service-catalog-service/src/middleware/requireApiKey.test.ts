import { describe, expect, it } from "vitest";
import { isApiKeyUsable } from "./requireApiKey";

describe("isApiKeyUsable", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");

  it("accepts an active key without an expiry", () => {
    expect(isApiKeyUsable({ revoked: false, expiresAt: null }, now)).toBe(true);
  });

  it("rejects a revoked key", () => {
    expect(isApiKeyUsable({ revoked: true, expiresAt: null }, now)).toBe(false);
  });

  it("rejects an expired key", () => {
    expect(isApiKeyUsable({ revoked: false, expiresAt: new Date(now.getTime() - 1) }, now)).toBe(false);
  });

  it("accepts a key whose expiry is still in the future", () => {
    expect(isApiKeyUsable({ revoked: false, expiresAt: new Date(now.getTime() + 1) }, now)).toBe(true);
  });
});

