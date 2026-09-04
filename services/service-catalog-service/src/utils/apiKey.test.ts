import { describe, expect, it } from "vitest";
import { apiKeyPrefix, generateApiKey, hashApiKey } from "./apiKey";

describe("API key utilities", () => {
  it("generates the required key format", () => {
    expect(generateApiKey()).toMatch(/^snt_live_[a-f0-9]{48}$/);
  });

  it("stores a short display-only prefix", () => {
    const key = generateApiKey();
    expect(apiKeyPrefix(key)).toBe(key.slice(0, 20));
    expect(apiKeyPrefix(key).length).toBeLessThan(key.length);
  });

  it("hashes keys deterministically without retaining the raw key", () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashApiKey(key));
    expect(hash).not.toContain(key);
  });
});

