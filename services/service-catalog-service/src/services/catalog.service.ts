import { Environment, Prisma, ServiceStatus } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { ApiKeyRepository } from "../repositories/apiKey.repository";
import { ServiceRepository } from "../repositories/service.repository";
import { apiKeyPrefix, generateApiKey, hashApiKey } from "../utils/apiKey";
import { serializeService } from "../utils/serviceSerializer";

const services = new ServiceRepository();
const apiKeys = new ApiKeyRepository();

export interface ServiceInput {
  name: string;
  description?: string;
  environment?: Environment;
  healthCheckUrl?: string;
  githubRepository?: string;
  team?: string;
  language?: string;
  framework?: string;
}

export class CatalogService {
  async create(organizationId: string, ownerUserId: string, input: ServiceInput) {
    try {
      const service = await services.create({
        organizationId,
        ownerUserId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        environment: input.environment,
        healthCheckUrl: input.healthCheckUrl,
        githubRepository: input.githubRepository?.trim() || null,
        team: input.team?.trim() || null,
        language: input.language?.trim() || null,
        framework: input.framework?.trim() || null
      });
      return serializeService(service);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "SERVICE_NAME_TAKEN", "A service with this name already exists in the organization");
      }
      throw error;
    }
  }

  async list(organizationId: string) {
    return (await services.list(organizationId)).map((service) => serializeService(service));
  }

  async get(organizationId: string, serviceId: string) {
    const service = await services.findScoped(organizationId, serviceId);
    if (!service) throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
    return serializeService(service);
  }

  async update(organizationId: string, serviceId: string, input: Partial<ServiceInput>) {
    try {
      const service = await services.updateScoped(organizationId, serviceId, {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.environment !== undefined ? { environment: input.environment } : {}),
        ...(input.healthCheckUrl !== undefined ? { healthCheckUrl: input.healthCheckUrl || null } : {}),
        ...(input.githubRepository !== undefined ? { githubRepository: input.githubRepository?.trim() || null } : {}),
        ...(input.team !== undefined ? { team: input.team?.trim() || null } : {}),
        ...(input.language !== undefined ? { language: input.language?.trim() || null } : {}),
        ...(input.framework !== undefined ? { framework: input.framework?.trim() || null } : {})
      });
      if (!service) throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
      return serializeService(service);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "SERVICE_NAME_TAKEN", "A service with this name already exists in the organization");
      }
      throw error;
    }
  }

  async delete(organizationId: string, serviceId: string): Promise<void> {
    if (!(await services.deleteScoped(organizationId, serviceId))) {
      throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
    }
  }

  async createApiKey(organizationId: string, serviceId: string, name: string, expiresInDays?: number) {
    if (!(await services.findScoped(organizationId, serviceId))) {
      throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
    }

    const rawKey = generateApiKey();
    const apiKey = await apiKeys.create({
      serviceId,
      name: name.trim(),
      keyPrefix: apiKeyPrefix(rawKey),
      keyHash: hashApiKey(rawKey),
      ...(expiresInDays ? { expiresAt: new Date(Date.now() + expiresInDays * 86_400_000) } : {})
    });
    return { ...apiKey, key: rawKey };
  }

  async listApiKeys(organizationId: string, serviceId: string) {
    if (!(await services.findScoped(organizationId, serviceId))) {
      throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
    }
    return apiKeys.list(serviceId);
  }

  async revokeApiKey(organizationId: string, serviceId: string, keyId: string): Promise<void> {
    if (!(await services.findScoped(organizationId, serviceId))) {
      throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
    }
    if (!(await apiKeys.revoke(serviceId, keyId))) {
      throw new AppError(404, "API_KEY_NOT_FOUND", "Active API key not found");
    }
  }

  async heartbeat(serviceId: string, status: ServiceStatus, version?: string) {
    if (!(await services.findById(serviceId))) throw new AppError(401, "INVALID_API_KEY", "API key is invalid");
    return serializeService(await services.updateHeartbeat(serviceId, status, version));
  }
}

