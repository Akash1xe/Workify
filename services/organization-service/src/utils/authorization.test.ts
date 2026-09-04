import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isRoleAllowed } from "./authorization";

describe("isRoleAllowed", () => {
  it("allows every member when no role list is supplied", () => {
    expect(isRoleAllowed(OrganizationRole.VIEWER)).toBe(true);
  });

  it("allows a listed role", () => {
    expect(isRoleAllowed(OrganizationRole.ADMIN, [OrganizationRole.OWNER, OrganizationRole.ADMIN])).toBe(true);
  });

  it("rejects an unlisted role", () => {
    expect(isRoleAllowed(OrganizationRole.VIEWER, [OrganizationRole.OWNER])).toBe(false);
  });
});

