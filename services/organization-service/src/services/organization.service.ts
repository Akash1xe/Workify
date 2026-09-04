import { randomBytes } from "node:crypto";
import { InvitationStatus, OrganizationRole, Prisma } from "@prisma/client";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";
import { InvitationRepository } from "../repositories/invitation.repository";
import { OrganizationRepository } from "../repositories/organization.repository";
import { slugify } from "../utils/slug";

const organizations = new OrganizationRepository();
const invitations = new InvitationRepository();

const publicInvitation = <T extends { token: string }>(invitation: T) => {
  const { token: _token, ...safeInvitation } = invitation;
  return safeInvitation;
};

export class OrganizationService {
  create(name: string, userId: string) {
    return organizations.createWithOwner(name.trim(), slugify(name), userId);
  }

  list(userId: string) {
    return organizations.listForUser(userId);
  }

  async get(id: string, role: OrganizationRole) {
    const organization = await organizations.findById(id);
    if (!organization) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organization not found");
    return { ...organization, yourRole: role };
  }

  async update(id: string, name: string) {
    return organizations.update(id, { name: name.trim() });
  }

  async delete(id: string): Promise<void> {
    await organizations.delete(id);
  }

  listMembers(id: string) {
    return organizations.listMembers(id);
  }

  async getMember(organizationId: string, userId: string) {
    const member = await organizations.findMember(organizationId, userId);
    if (!member) throw new AppError(404, "MEMBER_NOT_FOUND", "Member not found");
    return member;
  }

  async changeMemberRole(organizationId: string, userId: string, role: OrganizationRole) {
    const target = await organizations.findMember(organizationId, userId);
    if (!target) throw new AppError(404, "MEMBER_NOT_FOUND", "Member not found");
    if (target.role === OrganizationRole.OWNER || role === OrganizationRole.OWNER) {
      throw new AppError(400, "OWNERSHIP_CHANGE_NOT_SUPPORTED", "Owner role changes require a separate ownership-transfer flow");
    }
    return organizations.updateMemberRole(organizationId, userId, role);
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    const result = await organizations.removeMember(organizationId, userId);
    if (result === "NOT_FOUND") throw new AppError(404, "MEMBER_NOT_FOUND", "Member not found");
    if (result === "LAST_OWNER") throw new AppError(400, "LAST_OWNER", "Cannot remove the last owner");
  }

  async invite(organizationId: string, invitedByUserId: string, emailValue: string, role: OrganizationRole) {
    const email = emailValue.trim().toLowerCase();
    if (await invitations.findPending(organizationId, email)) {
      throw new AppError(409, "INVITATION_EXISTS", "A pending invitation already exists for this email");
    }

    return invitations.create({
      organizationId,
      email,
      role,
      token: randomBytes(32).toString("hex"),
      invitedByUserId,
      expiresAt: new Date(Date.now() + env.INVITATION_TTL_DAYS * 86_400_000)
    });
  }

  async listInvitations(organizationId: string) {
    const results = await invitations.list(organizationId);
    return results.map(publicInvitation);
  }

  async revokeInvitation(organizationId: string, invitationId: string): Promise<void> {
    if (!(await invitations.revoke(organizationId, invitationId))) {
      throw new AppError(404, "INVITATION_NOT_FOUND", "Pending invitation not found");
    }
  }

  async acceptInvitation(token: string, user: { id: string; email: string }) {
    const invitation = await invitations.findByToken(token);
    if (!invitation) throw new AppError(404, "INVITATION_NOT_FOUND", "Invitation not found");
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new AppError(409, "INVITATION_UNAVAILABLE", "Invitation is no longer available");
    }
    if (invitation.expiresAt <= new Date()) {
      await invitations.markExpired(invitation.id);
      throw new AppError(410, "INVITATION_EXPIRED", "Invitation has expired");
    }
    if (invitation.email !== user.email.trim().toLowerCase()) {
      throw new AppError(403, "INVITATION_EMAIL_MISMATCH", "This invitation was sent to a different email");
    }
    if (await organizations.findMember(invitation.organizationId, user.id)) {
      throw new AppError(409, "ALREADY_A_MEMBER", "User is already a member of this organization");
    }

    try {
      const membership = await invitations.accept(
        invitation.id,
        invitation.organizationId,
        user.id,
        invitation.role
      );
      if (!membership) throw new AppError(409, "INVITATION_UNAVAILABLE", "Invitation is no longer available");
      return membership;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "ALREADY_A_MEMBER", "User is already a member of this organization");
      }
      throw error;
    }
  }
}
