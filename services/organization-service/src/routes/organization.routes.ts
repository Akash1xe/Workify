import { OrganizationRole } from "@prisma/client";
import { Router } from "express";
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  createOrganization,
  deleteOrganization,
  getMember,
  getOrganization,
  listInvitations,
  listMembers,
  listOrganizations,
  removeMember,
  revokeInvitation,
  updateOrganization
} from "../controllers/organization.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requireOrgRole } from "../middleware/requireOrgRole";
import { validateBody } from "../middleware/validate";
import {
  createInvitationSchema,
  createOrganizationSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema
} from "../validators/organization.schemas";

export const organizationRouter = Router();
organizationRouter.use(requireAuth);

organizationRouter.post("/invitations/:token/accept", acceptInvitation);
organizationRouter.post("/", validateBody(createOrganizationSchema), createOrganization);
organizationRouter.get("/", listOrganizations);
organizationRouter.get("/:id", requireOrgRole(), getOrganization);
organizationRouter.patch("/:id", requireOrgRole([OrganizationRole.OWNER, OrganizationRole.ADMIN]), validateBody(updateOrganizationSchema), updateOrganization);
organizationRouter.delete("/:id", requireOrgRole([OrganizationRole.OWNER]), deleteOrganization);
organizationRouter.get("/:id/members", requireOrgRole(), listMembers);
organizationRouter.get("/:id/members/:userId", requireOrgRole(), getMember);
organizationRouter.patch("/:id/members/:userId", requireOrgRole([OrganizationRole.OWNER, OrganizationRole.ADMIN]), validateBody(updateMemberRoleSchema), changeMemberRole);
organizationRouter.delete("/:id/members/:userId", requireOrgRole([OrganizationRole.OWNER, OrganizationRole.ADMIN]), removeMember);
organizationRouter.post("/:id/invitations", requireOrgRole([OrganizationRole.OWNER, OrganizationRole.ADMIN]), validateBody(createInvitationSchema), createInvitation);
organizationRouter.get("/:id/invitations", requireOrgRole([OrganizationRole.OWNER, OrganizationRole.ADMIN]), listInvitations);
organizationRouter.delete("/:id/invitations/:invitationId", requireOrgRole([OrganizationRole.OWNER, OrganizationRole.ADMIN]), revokeInvitation);
