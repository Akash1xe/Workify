import { OrganizationRole, Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export class OrganizationRepository {
  createWithOwner(name: string, slug: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name, slug } });
      await tx.organizationMember.create({
        data: { organizationId: organization.id, userId, role: OrganizationRole.OWNER }
      });
      return organization;
    });
  }

  async listForUser(userId: string) {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: "desc" }
    });
    return memberships.map(({ organization, role }) => ({ ...organization, yourRole: role }));
  }

  findMembership(organizationId: string, userId: string) {
    return prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } }
    });
  }

  findById(id: string) {
    return prisma.organization.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.OrganizationUpdateInput) {
    return prisma.organization.update({ where: { id }, data });
  }

  delete(id: string) {
    return prisma.organization.delete({ where: { id } });
  }

  listMembers(organizationId: string) {
    return prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" }
    });
  }

  findMember(organizationId: string, userId: string) {
    return prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } }
    });
  }

  updateMemberRole(organizationId: string, userId: string, role: OrganizationRole) {
    return prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { role }
    });
  }

  async removeMember(organizationId: string, userId: string): Promise<"REMOVED" | "NOT_FOUND" | "LAST_OWNER"> {
    return prisma.$transaction(async (tx) => {
      const member = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } }
      });
      if (!member) return "NOT_FOUND";

      if (member.role === OrganizationRole.OWNER) {
        const ownerCount = await tx.organizationMember.count({
          where: { organizationId, role: OrganizationRole.OWNER }
        });
        if (ownerCount <= 1) return "LAST_OWNER";
      }

      await tx.organizationMember.delete({
        where: { organizationId_userId: { organizationId, userId } }
      });
      return "REMOVED";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

