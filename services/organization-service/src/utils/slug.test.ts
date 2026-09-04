import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("creates a readable lowercase slug with a random suffix", () => {
    expect(slugify("Acme Payments Team")).toMatch(/^acme-payments-team-[a-f0-9]{6}$/);
  });

  it("removes accents and punctuation", () => {
    expect(slugify("Café & Reliability!")).toMatch(/^cafe-reliability-[a-f0-9]{6}$/);
  });

  it("uses a safe fallback for names without ASCII letters", () => {
    expect(slugify("🚀🚀")).toMatch(/^organization-[a-f0-9]{6}$/);
  });

  it("generates distinct suffixes", () => {
    expect(slugify("Acme")).not.toBe(slugify("Acme"));
  });
});

