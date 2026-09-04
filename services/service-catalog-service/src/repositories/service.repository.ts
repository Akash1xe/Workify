import { Prisma, ServiceStatus } from "@prisma/client";
import { prisma } from "../config/database";

export class ServiceRepository {
  create(data: Prisma.ServiceUncheckedCreateInput) {
    return prisma.service.create({ data });
  }

  list(organizationId: string) {
    return prisma.service.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  }

  findScoped(organizationId: string, id: string) {
    return prisma.service.findFirst({ where: { id, organizationId } });
  }

  findById(id: string) {
    return prisma.service.findUnique({ where: { id } });
  }

  async updateScoped(organizationId: string, id: string, data: Prisma.ServiceUpdateInput) {
    const updated = await prisma.service.updateMany({ where: { id, organizationId }, data });
    if (updated.count !== 1) return null;
    return this.findScoped(organizationId, id);
  }

  async deleteScoped(organizationId: string, id: string): Promise<boolean> {
    const result = await prisma.service.deleteMany({ where: { id, organizationId } });
    return result.count === 1;
  }

  updateHeartbeat(id: string, status: ServiceStatus, version?: string) {
    return prisma.service.update({
      where: { id },
      data: {
        status,
        lastHeartbeatAt: new Date(),
        ...(version !== undefined ? { lastDeploymentVersion: version } : {})
      }
    });
  }
}

