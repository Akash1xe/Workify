import { prisma } from "../config/database";

const safeKeySelection = {
  id: true,
  name: true,
  keyPrefix: true,
  revoked: true,
  lastUsedAt: true,
  expiresAt: true,
  createdAt: true
} as const;

export class ApiKeyRepository {
  create(data: { serviceId: string; name: string; keyPrefix: string; keyHash: string; expiresAt?: Date }) {
    return prisma.apiKey.create({ data, select: safeKeySelection });
  }

  list(serviceId: string) {
    return prisma.apiKey.findMany({ where: { serviceId }, select: safeKeySelection, orderBy: { createdAt: "desc" } });
  }

  findByHash(keyHash: string) {
    return prisma.apiKey.findUnique({ where: { keyHash }, include: { service: true } });
  }

  async touch(id: string): Promise<void> {
    await prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  async revoke(serviceId: string, id: string): Promise<boolean> {
    const result = await prisma.apiKey.updateMany({
      where: { id, serviceId, revoked: false },
      data: { revoked: true }
    });
    return result.count === 1;
  }
}

