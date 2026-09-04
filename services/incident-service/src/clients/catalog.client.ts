import { env } from "../config/env";
import { AppError } from "../errors/AppError";
import { dependencyRequest } from "./http";

export const assertCatalogService = async (organizationId: string, serviceId: string, authorization: string) => {
  let response: Response;
  try {
    response = await dependencyRequest(
      `${env.CATALOG_SERVICE_URL}/organizations/${encodeURIComponent(organizationId)}/services/${encodeURIComponent(serviceId)}`,
      authorization
    );
  } catch {
    throw new AppError(502, "SERVICE_CHECK_FAILED", "Could not verify service");
  }

  if (response.status === 401) throw new AppError(401, "UNAUTHORIZED", "Access token is invalid or expired");
  if (response.status === 403) throw new AppError(403, "INSUFFICIENT_ROLE", "Your organization role does not allow this action");
  if (response.status === 404) throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
  if (!response.ok) throw new AppError(502, "SERVICE_CHECK_FAILED", "Could not verify service");
};
