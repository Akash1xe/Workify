import { OrganizationRole } from "@prisma/client";
import { RequestHandler } from "express";
import { AppError } from "../errors/AppError";
import { OrganizationRepository } from "../repositories/organization.repository";
import { isRoleAllowed } from "../utils/authorization";

const organizations = new OrganizationRepository();

export const requireOrgRole = (allowedRoles?: OrganizationRole[]): RequestHandler => async (req, _res, next) => {
  try {
    const rawId = req.params.id ?? req.params.organizationId;
    if (typeof rawId !== "string") throw new AppError(400, "ORGANIZATION_ID_REQUIRED", "Organization id is required");

    const membership = await organizations.findMembership(rawId, req.user!.id);
    if (!membership) {
      throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organization not found");
    }
    if (!isRoleAllowed(membership.role, allowedRoles)) {
      throw new AppError(403, "INSUFFICIENT_ROLE", "Your organization role does not allow this action");
    }

    req.membership = {
      organizationId: membership.organizationId,
      userId: membership.userId,
      role: membership.role
    };
    next();
  } catch (error) {
    next(error);
  }
};

