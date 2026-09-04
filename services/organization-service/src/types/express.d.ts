import { OrganizationRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; sessionId: string };
      membership?: { organizationId: string; userId: string; role: OrganizationRole };
    }
  }
}

export {};

