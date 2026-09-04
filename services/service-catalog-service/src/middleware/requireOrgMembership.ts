import { RequestHandler } from "express";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";

export type OrganizationRole = "OWNER" | "ADMIN" | "ENGINEER" | "VIEWER";
const roles: OrganizationRole[] = ["OWNER", "ADMIN", "ENGINEER", "VIEWER"];

export const requireOrgMembership = (allowedRoles?: OrganizationRole[]): RequestHandler => async (req, _res, next) => {
  const organizationId = req.params.organizationId;
  const authorization = req.header("authorization");
  if (typeof organizationId !== "string") return next(new AppError(400, "ORGANIZATION_ID_REQUIRED", "Organization id is required"));
  if (!authorization) return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));

  try {
    const response = await fetch(`${env.ORGANIZATION_SERVICE_URL}/organizations/${encodeURIComponent(organizationId)}`, {
      headers: { authorization },
      signal: AbortSignal.timeout(env.MEMBERSHIP_TIMEOUT_MS)
    });

    if (response.status === 401) return next(new AppError(401, "UNAUTHORIZED", "Access token is invalid or expired"));
    if (response.status === 404) return next(new AppError(404, "ORGANIZATION_NOT_FOUND", "Organization not found"));
    if (!response.ok) {
      return next(new AppError(502, "MEMBERSHIP_CHECK_FAILED", "Could not verify organization membership"));
    }

    const body = await response.json() as { yourRole?: unknown; organization?: { yourRole?: unknown } };
    const role = body.yourRole ?? body.organization?.yourRole;
    if (typeof role !== "string" || !roles.includes(role as OrganizationRole)) {
      return next(new AppError(502, "INVALID_MEMBERSHIP_RESPONSE", "Could not verify organization membership"));
    }
    if (allowedRoles && !allowedRoles.includes(role as OrganizationRole)) {
      return next(new AppError(403, "INSUFFICIENT_ROLE", "Your organization role does not allow this action"));
    }

    req.organizationRole = role as OrganizationRole;
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError(502, "MEMBERSHIP_CHECK_FAILED", "Could not verify organization membership"));
  }
};

