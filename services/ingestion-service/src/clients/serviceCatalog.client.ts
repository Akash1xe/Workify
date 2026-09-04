import { z } from "zod";
import { env } from "../config/env";
import { ServiceIdentity } from "../types/telemetry";
import { AppError } from "../utils/AppError";

const responseSchema = z.object({
  valid: z.literal(true),
  service: z.object({ id: z.string(), organizationId: z.string(), name: z.string(), environment: z.string() }),
  apiKey: z.object({ id: z.string(), name: z.string() })
});

export const verifyServiceApiKey = async (apiKey: string): Promise<ServiceIdentity> => {
  let response: Response;
  try {
    response = await fetch(`${env.SERVICE_CATALOG_URL}/internal/api-keys/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-service-secret": env.INTERNAL_SERVICE_SECRET },
      body: JSON.stringify({ apiKey }),
      signal: AbortSignal.timeout(env.DEPENDENCY_TIMEOUT_MS)
    });
  } catch {
    throw new AppError(502, "SERVICE_CATALOG_UNAVAILABLE", "Service Catalog is unavailable");
  }
  if (response.status === 401) throw new AppError(401, "INVALID_API_KEY", "API key is invalid, revoked, or expired");
  if (!response.ok) throw new AppError(502, "SERVICE_CATALOG_UNAVAILABLE", "Service Catalog is unavailable");
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) throw new AppError(502, "SERVICE_CATALOG_UNAVAILABLE", "Service Catalog returned an invalid response");
  return { service: parsed.data.service, apiKey: parsed.data.apiKey };
};
