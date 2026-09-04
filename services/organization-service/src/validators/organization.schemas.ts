import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(100)
});

export const updateOrganizationSchema = createOrganizationSchema;

export const updateMemberRoleSchema = z.object({
  role: z.enum(["ADMIN", "ENGINEER", "VIEWER"])
});

export const createInvitationSchema = z.object({
  email: z.email().max(254),
  role: z.enum(["ADMIN", "ENGINEER", "VIEWER"])
});

