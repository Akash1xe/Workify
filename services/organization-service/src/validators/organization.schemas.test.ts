import { describe, expect, it } from "vitest";
import { createInvitationSchema, createOrganizationSchema, updateMemberRoleSchema } from "./organization.schemas";

describe("organization validation", () => {
  it("accepts a valid organization name", () => {
    expect(createOrganizationSchema.safeParse({ name: "Acme" }).success).toBe(true);
  });

  it("rejects an empty organization name", () => {
    expect(createOrganizationSchema.safeParse({ name: " " }).success).toBe(false);
  });

  it("rejects OWNER invitations", () => {
    expect(createInvitationSchema.safeParse({ email: "owner@example.com", role: "OWNER" }).success).toBe(false);
  });

  it("rejects changing a member to OWNER through the ordinary role route", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "OWNER" }).success).toBe(false);
  });
});

