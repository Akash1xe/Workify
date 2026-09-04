import { InvitationStatus, OrganizationRole } from "@prisma/client";
import { prisma } from "../config/database";

export class InvitationRepository {
  create(data: {
    organizationId: string;
    email: string;
    role: OrganizationRole;
    token: string;
    invitedByUserId: string;
    expiresAt: Date;
  }) {
    return prisma.invitation.create({ data });
  }

  list(organizationId: string) {
    return prisma.invitation.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  }

  findPending(organizationId: string, email: string) {
    return prisma.invitation.findFirst({
      where: { organizationId, email, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } }
    });
  }

  findByToken(token: string) {
    return prisma.invitation.findUnique({ where: { token } });
  }

  async markExpired(id: string): Promise<void> {
    await prisma.invitation.updateMany({
      where: { id, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.EXPIRED }
    });
  }

  async revoke(organizationId: string, id: string): Promise<boolean> {
    const result = await prisma.invitation.updateMany({
      where: { id, organizationId, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.REVOKED }
    });
    return result.count === 1;
  }

  accept(id: string, organizationId: string, userId: string, role: OrganizationRole) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
        data: { status: InvitationStatus.ACCEPTED }
      });
      if (claimed.count !== 1) return null;

      return tx.organizationMember.create({ data: { organizationId, userId, role } });
    });
  }
}

