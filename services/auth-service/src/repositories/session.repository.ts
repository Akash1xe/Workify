import { Prisma, Session } from "@prisma/client";
import { prisma } from "../config/database";

export class SessionRepository {
  create(data: Prisma.SessionUncheckedCreateInput): Promise<Session> {
    return prisma.session.create({ data });
  }

  findById(id: string): Promise<Session | null> {
    return prisma.session.findUnique({ where: { id } });
  }

  listByUserId(userId: string): Promise<Session[]> {
    return prisma.session.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  }

  async rotate(id: string, expectedHash: string, refreshTokenHash: string, jti: string, expiresAt: Date): Promise<boolean> {
    const result = await prisma.session.updateMany({
      where: { id, refreshTokenHash: expectedHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { refreshTokenHash, jti, expiresAt }
    });
    return result.count === 1;
  }

  async revoke(id: string, userId: string, reason: string): Promise<boolean> {
    const result = await prisma.session.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason }
    });
    return result.count === 1;
  }

  async revokeAll(userId: string, reason: string): Promise<number> {
    const result = await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason }
    });
    return result.count;
  }
}

