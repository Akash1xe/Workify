import type { NextFunction, Request, Response as ExpressResponse } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors/AppError";
import { requireOrgMembership } from "./requireOrgMembership";

const makeRequest = () => ({
  params: { organizationId: "org-1" },
  organizationRole: undefined,
  header: (name: string) => name.toLowerCase() === "authorization" ? "Bearer access-token" : undefined
} as unknown as Request);

const response = {} as ExpressResponse;

describe("requireOrgMembership", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards the Authorization header and attaches the returned role", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new globalThis.Response(JSON.stringify({ yourRole: "ENGINEER" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const req = makeRequest();
    const next = vi.fn();

    await requireOrgMembership(["ENGINEER"])(req, response, next as NextFunction);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4002/organizations/org-1",
      expect.objectContaining({ headers: { authorization: "Bearer access-token" } })
    );
    expect(req.organizationRole).toBe("ENGINEER");
    expect(next).toHaveBeenCalledWith();
  });

  it("maps a non-member response to 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new globalThis.Response(null, { status: 404 })));
    const next = vi.fn();

    await requireOrgMembership()(makeRequest(), response, next as NextFunction);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it("rejects a valid member with an insufficient role using 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new globalThis.Response(JSON.stringify({ yourRole: "VIEWER" }), { status: 200 })));
    const next = vi.fn();

    await requireOrgMembership(["OWNER"])(makeRequest(), response, next as NextFunction);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it("fails closed with 502 on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const next = vi.fn();

    await requireOrgMembership()(makeRequest(), response, next as NextFunction);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(502);
  });
});
