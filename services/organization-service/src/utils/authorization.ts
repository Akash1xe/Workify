import { OrganizationRole } from "@prisma/client";

export const isRoleAllowed = (role: OrganizationRole, allowedRoles?: OrganizationRole[]): boolean =>
  !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(role);

