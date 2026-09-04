import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../clients/organization.client", () => ({
  getCallerMembership: vi.fn()
}));

import { getCallerMembership } from "../clients/organization.client";
import { requireOrgMembership } from "./requireOrgMembership";

const membershipLookup = vi.mocked(getCallerMembership);
const request = {
  params: { organizationId: "org-a" },
  header: vi.fn().mockReturnValue("Bearer token"),
  user: { id: "user-a", email: "a@example.com", sessionId: "session-a" }
};

describe("requireOrgMembership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("attaches verified membership", async () => {
    membershipLookup.mockResolvedValue("ENGINEER");
    const next = vi.fn();
    await requireOrgMembership(["ENGINEER"])(request as never, {} as never, next);
    expect(request).toMatchObject({ membership: { organizationId: "org-a", userId: "user-a", role: "ENGINEER" } });
    expect(next).toHaveBeenCalledWith();
  });

  it("blocks a viewer from mutation roles", async () => {
    membershipLookup.mockResolvedValue("VIEWER");
    const next = vi.fn();
    await requireOrgMembership(["OWNER", "ADMIN", "ENGINEER"])(request as never, {} as never, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, code: "INSUFFICIENT_ROLE" });
  });

  it("fails closed when Organization Service fails", async () => {
    membershipLookup.mockRejectedValue(new Error("network"));
    const next = vi.fn();
    await requireOrgMembership()(request as never, {} as never, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next).not.toHaveBeenCalledWith();
  });
});
