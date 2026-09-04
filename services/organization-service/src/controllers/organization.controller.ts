import { OrganizationRole } from "@prisma/client";
import { Request, RequestHandler } from "express";
import { AppError } from "../errors/AppError";
import { OrganizationService } from "../services/organization.service";

const service = new OrganizationService();

const param = (req: Request, name: string): string => {
  const value = req.params[name];
  if (typeof value !== "string" || !value) throw new AppError(400, "INVALID_PARAMETER", `${name} is invalid`);
  return value;
};

export const createOrganization: RequestHandler = async (req, res, next) => {
  try {
    const organization = await service.create(req.body.name, req.user!.id);
    res.status(201).json({ organization: { ...organization, yourRole: OrganizationRole.OWNER } });
  } catch (error) { next(error); }
};

export const listOrganizations: RequestHandler = async (req, res, next) => {
  try { res.json({ organizations: await service.list(req.user!.id) }); } catch (error) { next(error); }
};

export const getOrganization: RequestHandler = async (req, res, next) => {
  try {
    res.json({ organization: await service.get(param(req, "id"), req.membership!.role) });
  } catch (error) { next(error); }
};

export const updateOrganization: RequestHandler = async (req, res, next) => {
  try { res.json({ organization: await service.update(param(req, "id"), req.body.name) }); } catch (error) { next(error); }
};

export const deleteOrganization: RequestHandler = async (req, res, next) => {
  try { await service.delete(param(req, "id")); res.status(204).send(); } catch (error) { next(error); }
};

export const listMembers: RequestHandler = async (req, res, next) => {
  try { res.json({ members: await service.listMembers(param(req, "id")) }); } catch (error) { next(error); }
};

export const changeMemberRole: RequestHandler = async (req, res, next) => {
  try {
    res.json({ member: await service.changeMemberRole(param(req, "id"), param(req, "userId"), req.body.role) });
  } catch (error) { next(error); }
};

export const removeMember: RequestHandler = async (req, res, next) => {
  try {
    await service.removeMember(param(req, "id"), param(req, "userId"));
    res.status(204).send();
  } catch (error) { next(error); }
};

export const createInvitation: RequestHandler = async (req, res, next) => {
  try {
    const invitation = await service.invite(param(req, "id"), req.user!.id, req.body.email, req.body.role);
    res.status(201).json({ invitation });
  } catch (error) { next(error); }
};

export const listInvitations: RequestHandler = async (req, res, next) => {
  try { res.json({ invitations: await service.listInvitations(param(req, "id")) }); } catch (error) { next(error); }
};

export const revokeInvitation: RequestHandler = async (req, res, next) => {
  try {
    await service.revokeInvitation(param(req, "id"), param(req, "invitationId"));
    res.status(204).send();
  } catch (error) { next(error); }
};

export const acceptInvitation: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ membership: await service.acceptInvitation(param(req, "token"), req.user!) });
  } catch (error) { next(error); }
};

