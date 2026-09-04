import { RequestHandler } from "express";
import { getCallerMembership, OrganizationRole } from "../clients/organization.client";
import { AppError } from "../errors/AppError";

export const requireOrgMembership = (allowedRoles?: OrganizationRole[]): RequestHandler => async (req, _res, next) => {
  const organizationId = req.params.organizationId;
  const authorization = req.header("authorization");
  if (typeof organizationId !== "string") return next(new AppError(400, "ORGANIZATION_ID_REQUIRED", "Organization id is required"));
  if (!authorization || !req.user) return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));

  try {
    const role = await getCallerMembership(organizationId, authorization);
    if (allowedRoles && !allowedRoles.includes(role)) {
      return next(new AppError(403, "INSUFFICIENT_ROLE", "Your organization role does not allow this action"));
    }
    req.membership = { organizationId, userId: req.user.id, role };
    next();
  } catch (error) {
    next(error);
  }
};
