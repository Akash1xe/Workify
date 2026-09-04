import { Request, RequestHandler } from "express";
import { AppError } from "../errors/AppError";
import { CatalogService } from "../services/catalog.service";

const catalog = new CatalogService();

const param = (req: Request, name: string): string => {
  const value = req.params[name];
  if (typeof value !== "string" || !value) throw new AppError(400, "INVALID_PARAMETER", `${name} is invalid`);
  return value;
};

export const createService: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ service: await catalog.create(param(req, "organizationId"), req.user!.id, req.body) });
  } catch (error) { next(error); }
};

export const listServices: RequestHandler = async (req, res, next) => {
  try { res.json({ services: await catalog.list(param(req, "organizationId")) }); } catch (error) { next(error); }
};

export const getService: RequestHandler = async (req, res, next) => {
  try {
    res.json({ service: await catalog.get(param(req, "organizationId"), param(req, "serviceId")) });
  } catch (error) { next(error); }
};

export const updateService: RequestHandler = async (req, res, next) => {
  try {
    res.json({ service: await catalog.update(param(req, "organizationId"), param(req, "serviceId"), req.body) });
  } catch (error) { next(error); }
};

export const deleteService: RequestHandler = async (req, res, next) => {
  try {
    await catalog.delete(param(req, "organizationId"), param(req, "serviceId"));
    res.status(204).send();
  } catch (error) { next(error); }
};

export const createApiKey: RequestHandler = async (req, res, next) => {
  try {
    const apiKey = await catalog.createApiKey(
      param(req, "organizationId"),
      param(req, "serviceId"),
      req.body.name,
      req.body.expiresInDays
    );
    res.status(201).json({ apiKey });
  } catch (error) { next(error); }
};

export const listApiKeys: RequestHandler = async (req, res, next) => {
  try {
    res.json({ apiKeys: await catalog.listApiKeys(param(req, "organizationId"), param(req, "serviceId")) });
  } catch (error) { next(error); }
};

export const revokeApiKey: RequestHandler = async (req, res, next) => {
  try {
    await catalog.revokeApiKey(param(req, "organizationId"), param(req, "serviceId"), param(req, "keyId"));
    res.status(204).send();
  } catch (error) { next(error); }
};

export const heartbeat: RequestHandler = async (req, res, next) => {
  try {
    res.json({ service: await catalog.heartbeat(req.apiKeyIdentity!.serviceId, req.body.status, req.body.version) });
  } catch (error) { next(error); }
};

