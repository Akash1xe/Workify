import { describe, expect, it } from "vitest";
import { createIncidentSchema, listIncidentsSchema, updateIncidentSchema } from "./incident.schemas";

describe("incident validation", () => {
  it("rejects an empty title and a non-UUID service id", () => {
    expect(createIncidentSchema.safeParse({ serviceId: "bad", title: "", severity: "SEV1" }).success).toBe(false);
  });

  it("caps page size at 100", () => {
    expect(listIncidentsSchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("allows clearing a description but rejects empty patches", () => {
    expect(updateIncidentSchema.safeParse({ description: null }).success).toBe(true);
    expect(updateIncidentSchema.safeParse({}).success).toBe(false);
  });
});
