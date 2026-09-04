import { env } from "../config/env";

export class AuthorizationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

const get = async (url: string, authorization: string) => {
  try {
    return await fetch(url, {
      headers: { authorization },
      signal: AbortSignal.timeout(env.DEPENDENCY_TIMEOUT_MS)
    });
  } catch {
    throw new AuthorizationError("DEPENDENCY_UNAVAILABLE", "Authorization dependency is unavailable");
  }
};

export const verifyOrganizationMembership = async (organizationId: string, authorization: string) => {
  const response = await get(`${env.ORGANIZATION_SERVICE_URL}/organizations/${encodeURIComponent(organizationId)}`, authorization);
  if (response.status === 401) throw new AuthorizationError("UNAUTHORIZED", "Access token is invalid or expired");
  if (response.status === 404) throw new AuthorizationError("MEMBERSHIP_REQUIRED", "Organization membership is required");
  if (!response.ok) throw new AuthorizationError("DEPENDENCY_ERROR", "Could not verify organization membership");
};

export const verifyIncidentOwnership = async (organizationId: string, incidentId: string, authorization: string) => {
  const response = await get(
    `${env.INCIDENT_SERVICE_URL}/organizations/${encodeURIComponent(organizationId)}/incidents/${encodeURIComponent(incidentId)}`,
    authorization
  );
  if (response.status === 401) throw new AuthorizationError("UNAUTHORIZED", "Access token is invalid or expired");
  if (response.status === 403) throw new AuthorizationError("FORBIDDEN", "Incident access is forbidden");
  if (response.status === 404) throw new AuthorizationError("INCIDENT_NOT_FOUND", "Incident not found in this organization");
  if (!response.ok) throw new AuthorizationError("DEPENDENCY_ERROR", "Could not verify incident ownership");
};
