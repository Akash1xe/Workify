import { env } from "../config/env";
import { AppError } from "../errors/AppError";
import { dependencyRequest } from "./http";

export type OrganizationRole = "OWNER" | "ADMIN" | "ENGINEER" | "VIEWER";
const roles: OrganizationRole[] = ["OWNER", "ADMIN", "ENGINEER", "VIEWER"];

const request = async (path: string, authorization: string) => {
  try {
    return await dependencyRequest(`${env.ORGANIZATION_SERVICE_URL}${path}`, authorization);
  } catch {
    throw new AppError(502, "ORGANIZATION_SERVICE_UNAVAILABLE", "Could not verify organization membership");
  }
};

export const getCallerMembership = async (organizationId: string, authorization: string) => {
  const response = await request(`/organizations/${encodeURIComponent(organizationId)}`, authorization);
  if (response.status === 401) throw new AppError(401, "UNAUTHORIZED", "Access token is invalid or expired");
  if (response.status === 404) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organization not found");
  if (!response.ok) throw new AppError(502, "MEMBERSHIP_CHECK_FAILED", "Could not verify organization membership");

  const body = await response.json() as { yourRole?: unknown; organization?: { yourRole?: unknown } };
  const role = body.yourRole ?? body.organization?.yourRole;
  if (typeof role !== "string" || !roles.includes(role as OrganizationRole)) {
    throw new AppError(502, "INVALID_MEMBERSHIP_RESPONSE", "Could not verify organization membership");
  }
  return role as OrganizationRole;
};

export const assertOrganizationMember = async (organizationId: string, userId: string, authorization: string) => {
  const response = await request(
    `/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
    authorization
  );
  if (response.status === 401) throw new AppError(401, "UNAUTHORIZED", "Access token is invalid or expired");
  if (response.status === 403) throw new AppError(403, "INSUFFICIENT_ROLE", "Your organization role does not allow this action");
  if (response.status === 404) {
    throw new AppError(400, "INVALID_ASSIGNEE", "Assignee must be a member of the organization");
  }
  if (!response.ok) throw new AppError(502, "MEMBERSHIP_CHECK_FAILED", "Could not verify assignee membership");
};
