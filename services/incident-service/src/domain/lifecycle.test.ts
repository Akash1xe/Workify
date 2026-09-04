import { IncidentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { AppError } from "../errors/AppError";
import { assertStatusTransition, transitionTimestamp } from "./lifecycle";

describe("incident lifecycle", () => {
  it.each([
    ["TRIGGERED", "ACKNOWLEDGED"],
    ["TRIGGERED", "INVESTIGATING"],
    ["ACKNOWLEDGED", "INVESTIGATING"],
    ["INVESTIGATING", "MITIGATING"],
    ["MITIGATING", "RESOLVED"]
  ] as [IncidentStatus, IncidentStatus][])("allows %s to %s", (from, to) => {
    expect(() => assertStatusTransition(from, to)).not.toThrow();
  });

  it.each([
    ["ACKNOWLEDGED", "TRIGGERED"],
    ["INVESTIGATING", "ACKNOWLEDGED"],
    ["RESOLVED", "MITIGATING"],
    ["TRIGGERED", "RESOLVED"]
  ] as [IncidentStatus, IncidentStatus][])("rejects %s to %s", (from, to) => {
    expect(() => assertStatusTransition(from, to)).toThrow(AppError);
  });

  it("sets the timestamp belonging to the new state", () => {
    const now = new Date();
    expect(transitionTimestamp("RESOLVED", now)).toEqual({ resolvedAt: now });
  });
});
