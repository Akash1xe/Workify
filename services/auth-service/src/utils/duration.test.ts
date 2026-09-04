import { describe, expect, it } from "vitest";
import { durationToMilliseconds } from "./duration";

describe("durationToMilliseconds", () => {
  it("converts seconds", () => expect(durationToMilliseconds("30s")).toBe(30_000));
  it("converts minutes", () => expect(durationToMilliseconds("15m")).toBe(900_000));
  it("converts hours", () => expect(durationToMilliseconds("2h")).toBe(7_200_000));
  it("converts days", () => expect(durationToMilliseconds("7d")).toBe(604_800_000));
  it("rejects invalid durations", () => expect(() => durationToMilliseconds("soon")).toThrow());
});

